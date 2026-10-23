"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { formatBRL } from "@/lib/format";
import { montarItem } from "@/application/publico/acoes";
import type { ItemMontado, OpcaoPreco } from "@/application/publico/tipos";
import { FolhaDeOpcoes, type OpcaoDaFolha } from "./FolhaDeOpcoes";
import type { DadosDoConfigurador, Escolhas, ItemConfigurado } from "./tipos";

/**
 * Núcleo do configurador de item.
 *
 * ESTE É O ÚNICO configurador do sistema. Ele serve o cardápio público, o
 * pedido manual do balcão e a inclusão de item numa alteração. Criar uma
 * segunda versão "simplificada para o admin" produziria duas formas de
 * montar a mesma pizza, que divergem no primeiro ajuste de regra
 * (CLAUDE.md §17).
 *
 * Sequência preservada do design aprovado: tamanho → sabores → borda →
 * adicionais → observação → quantidade, com a barra de ação no fim.
 *
 * ONDE O PREÇO É CALCULADO: no banco, sempre. A cada mudança de escolha este
 * componente chama a Server Action `montarItem`, que roda a mesma função que
 * valida o item na hora de entrar no carrinho, na revalidação, na criação do
 * pedido e na alteração. Não existe soma de preço em React — nem do meio a
 * meio, nem da borda, nem dos adicionais (CLAUDE.md §16 e §17).
 *
 * Consequência deliberada: uma combinação inválida não fica "quase certa" na
 * tela. O botão desabilita e o motivo aparece com o texto que a regra gerou.
 * Isso vale igualmente para o balcão: estar no administrativo não contorna
 * disponibilidade nem compatibilidade.
 *
 * O que muda entre os invólucros é só a moldura: onde a barra de ação fica,
 * o rótulo do botão e o que acontece ao confirmar.
 */
export function NucleoConfigurador({
  dados,
  ancoragem = "fixa",
  aviso,
  rotuloAcao = "Adicionar",
  mensagemSucesso = "Adicionado ao carrinho.",
  variacaoInicial = null,
  aoConfirmar,
}: {
  dados: DadosDoConfigurador;
  /** `fixa` é a barra grudada do sheet público; `embutida` é o bloco do admin. */
  ancoragem?: "fixa" | "embutida";
  aviso?: ReactNode;
  rotuloAcao?: string;
  /** `null` quando quem envolve confirma a adição de outro jeito (o painel público). */
  mensagemSucesso?: string | null;
  /**
   * Tamanho já decidido por quem abriu — hoje, o bipe do PDV que resolveu para
   * uma VARIANTE (09 §2.1). Não é atalho de conveniência: o código de barras
   * identifica aquele tamanho específico, e reabrir no primeiro da lista faria
   * o operador conferir de novo o que o leitor já tinha dito.
   *
   * Continua sendo só o ESTADO INICIAL: o operador troca à vontade, e o preço
   * é repedido ao servidor como em qualquer outra troca. Omitido, o
   * comportamento é exatamente o de antes — o primeiro tamanho disponível.
   */
  variacaoInicial?: string | null;
  aoConfirmar: (item: ItemConfigurado) => void;
}) {
  const { produto, tamanhos, porTamanho, montadoInicial, tamanhoFixo = false } = dados;
  const [recalculando, iniciarRecalculo] = useTransition();

  const disponiveis = tamanhos.filter((t) => t.disponivel);

  // Só vale se o tamanho pedido estiver realmente disponível: um código de
  // barras pode apontar para uma variante que hoje não se vende, e nesse caso
  // quem manda é a disponibilidade, não o leitor.
  const inicial =
    disponiveis.find((t) => t.variacao_id === variacaoInicial)?.variacao_id ??
    disponiveis[0]?.variacao_id ??
    null;

  /**
   * Borda padrão (15/10/2026): a pizza já abre com Catupiry; trocar ou tirar
   * continua a um toque ("Sem borda"). Vem do NOME da borda cadastrada no
   * tamanho — se o tamanho não tem Catupiry, abre sem borda como antes. O
   * preço segue sendo do servidor: a abertura repergunta com a borda marcada.
   */
  function bordaPadraoDoTamanho(variacaoId: string | null): string | null {
    const t = tamanhos.find((x) => x.variacao_id === variacaoId);
    const bordas = t ? porTamanho[t.tamanho_id]?.bordas ?? [] : [];
    return bordas.find((b) => /catupiry/i.test(b.nome))?.id ?? null;
  }
  const bordaInicial = bordaPadraoDoTamanho(inicial);

  const [config, setConfig] = useState<Escolhas>({
    variacaoId: inicial,
    sabores: [],
    bordaId: bordaInicial,
    adicionais: [],
    observacao: "",
    quantidade: 1,
  });
  const [montado, setMontado] = useState<ItemMontado>(montadoInicial);
  const [confirmado, setConfirmado] = useState(false);

  /**
   * `montadoInicial` foi calculado no servidor para o PRIMEIRO tamanho. Quando
   * se abre em outro, aquele preço é de outro item — e mostrar preço de outro
   * item, mesmo por um instante, é o tipo de mentira que esta tela não pode
   * contar. Então repergunta-se ao servidor, uma vez só.
   */
  const jaAjustou = useRef(false);
  useEffect(() => {
    if (jaAjustou.current) return;
    jaAjustou.current = true;
    if (
      bordaInicial !== null ||
      (inicial !== null && inicial !== (disponiveis[0]?.variacao_id ?? null))
    ) {
      aplicar({ variacaoId: inicial, bordaId: bordaInicial });
    }
    // Uma vez, na montagem: é ajuste de abertura, não reação a mudança.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tamanho = tamanhos.find((t) => t.variacao_id === config.variacaoId) ?? null;
  const dadosDoTamanho = tamanho ? porTamanho[tamanho.tamanho_id] : undefined;

  // RN-PIZZA-004: é o TAMANHO que decide se meio a meio existe. Com
  // max_sabores = 1, a seção de sabores não é oferecida — não fica
  // desabilitada, não aparece.
  const aceitaMeioAMeio = (tamanho?.max_sabores ?? 1) > 1;
  // Para quem abriu num tamanho de 1 sabor: onde o meio a meio existe.
  const tamanhoComMeioAMeio = tamanhos.find((t) => t.disponivel && t.max_sabores > 1) ?? null;
  const saboresEscolhidos = config.variacaoId
    ? [config.variacaoId, ...config.sabores]
    : [];

  /**
   * Aplica a mudança e repergunta o preço ao servidor.
   *
   * A observação é a única escolha que NÃO dispara recálculo: texto livre não
   * muda preço, e uma chamada por tecla seria desperdício. Ela vai junto na
   * hora de confirmar, e é revalidada como todo o resto.
   */
  function aplicar(mudanca: Partial<Escolhas>, recalcular = true) {
    const proxima: Escolhas = { ...config, ...mudanca };
    setConfig(proxima);
    setConfirmado(false);
    if (!recalcular) return;

    iniciarRecalculo(async () => {
      const r = await montarItem({
        produto_id: produto.id,
        variacao_id: proxima.variacaoId,
        sabores: proxima.variacaoId ? [proxima.variacaoId, ...proxima.sabores] : [],
        borda_id: proxima.bordaId,
        adicionais: proxima.adicionais,
        observacao: proxima.observacao,
        quantidade: proxima.quantidade,
      });
      setMontado(r);
    });
  }

  /**
   * Trocar de tamanho zera sabor, borda e adicional: preço e compatibilidade
   * são POR TAMANHO (RN-BORDA-002, RN-ADD-002). Manter a escolha anterior
   * levaria a uma combinação que o servidor recusaria.
   */
  function escolherTamanho(variacaoId: string) {
    aplicar({ variacaoId, sabores: [], bordaId: bordaPadraoDoTamanho(variacaoId), adicionais: [] });
  }

  /**
   * Sabores, borda e adicionais têm o MESMO desenho: a página mostra só o que
   * já foi escolhido, uma linha por escolha, e a lista inteira vive numa folha
   * que abre sob demanda. São dezenas de sabores e de ingredientes: nem
   * expostos de uma vez, nem escondidos atrás de uma busca vazia (a primeira
   * versão pedia que o cliente adivinhasse um nome). `folha` guarda O QUE está
   * sendo escolhido; `null` = fechada. No sabor, o índice é a vaga: dentro de
   * `config.sabores` troca aquele sabor, o seguinte ao último preenche a próxima.
   *
   * Isto é só apresentação. Limites, preço e disponibilidade continuam sendo
   * decididos pelo servidor em `montarItem`.
   */
  const [folha, setFolha] = useState<Folha | null>(null);

  const outrosSabores = (dadosDoTamanho?.sabores ?? []).filter(
    (s) => s.variacao_id !== config.variacaoId,
  );
  // O sabor principal já ocupa uma das vagas do tamanho.
  const vagasExtras = (tamanho?.max_sabores ?? 1) - 1;
  // Só a próxima vaga vazia aparece: com 4 sabores permitidos, não são três
  // caixas pontilhadas de uma vez.
  const vagasVisiveis = Math.min(vagasExtras, config.sabores.length + 1);
  const nomeDoSabor = (id: string) =>
    outrosSabores.find((s) => s.variacao_id === id) ?? null;

  const bordaAtual = dadosDoTamanho?.bordas.find((b) => b.id === config.bordaId) ?? null;
  const todosAdicionais = dadosDoTamanho?.adicionais ?? [];

  const textoDosAdicionais =
    (produto.adicionais_inclusos
      ? `${produto.limite_adicionais ?? 0} ingredientes inclusos no preço · cada um a mais soma o seu valor`
      : "Opcional") +
    (!produto.adicionais_inclusos && produto.limite_adicionais !== null
      ? ` · até ${produto.limite_adicionais}`
      : "") +
    (config.sabores.length > 0 ? " · valem para a pizza inteira" : "");

  /** Os primeiros N escolhidos não custam; do N+1 em diante soma. */
  function detalheDoAdicional(a: OpcaoPreco): string {
    if (!produto.adicionais_inclusos) return `+ ${formatBRL(a.preco)}`;
    const inclusos = produto.limite_adicionais ?? 0;
    const ativo = config.adicionais.includes(a.id);
    const posicao = ativo ? config.adicionais.indexOf(a.id) : config.adicionais.length;
    return posicao < inclusos ? "Incluso" : `+ ${formatBRL(a.preco)}`;
  }

  const detalheDaBorda = (b: OpcaoPreco) => (b.preco > 0 ? `+ ${formatBRL(b.preco)}` : "Sem custo");

  const rotuloDaFolhaDeSabor = (indice: number) => {
    const r = rotuloDaVaga(indice + 1, tamanho?.max_sabores ?? 2);
    return r === "2ª metade" ? "a 2ª metade" : `o ${r}`;
  };

  /** O que a folha aberta mostra — sempre dados que o servidor já entregou. */
  function descreverFolha(f: Folha): {
    titulo: string;
    subtitulo?: string;
    opcoes: OpcaoDaFolha[];
    modo: "unica" | "multipla";
    selecionados: string[];
    comBusca: boolean;
    placeholder: string;
  } {
    if (f.tipo === "sabor") {
      const daVaga = config.sabores[f.indice];
      // Quem já está em OUTRA vaga não se repete; o da vaga que se está
      // trocando continua na lista.
      const opcoes = outrosSabores
        .filter((s) => !config.sabores.includes(s.variacao_id) || config.sabores[f.indice] === s.variacao_id)
        .map((s) => ({
          id: s.variacao_id,
          nome: s.nome,
          descricao: s.descricao,
          detalhe: formatBRL(s.preco),
          disponivel: s.disponivel,
        }));
      return {
        titulo: `Escolha ${rotuloDaFolhaDeSabor(f.indice)}`,
        subtitulo: `${opcoes.length} sabores neste tamanho`,
        opcoes,
        modo: "unica",
        selecionados: daVaga ? [daVaga] : [],
        comBusca: true,
        placeholder: "Buscar sabor ou ingrediente…",
      };
    }
    if (f.tipo === "borda") {
      return {
        titulo: "Escolha sua borda",
        subtitulo: "No máximo uma",
        opcoes: [
          { id: BORDA_NENHUMA, nome: "Sem borda", descricao: null, detalhe: "—" },
          ...(dadosDoTamanho?.bordas ?? []).map((b) => ({
            id: b.id,
            nome: b.nome,
            descricao: null,
            detalhe: detalheDaBorda(b),
          })),
        ],
        modo: "unica",
        selecionados: [config.bordaId ?? BORDA_NENHUMA],
        // Meia dúzia de opções cabe na tela; busca ali só atrapalharia.
        comBusca: false,
        placeholder: "Buscar borda…",
      };
    }
    return {
      titulo: "Adicionais",
      subtitulo: textoDosAdicionais,
      opcoes: todosAdicionais.map((a) => ({
        id: a.id,
        nome: a.nome,
        descricao: null,
        detalhe: detalheDoAdicional(a),
      })),
      modo: "multipla",
      selecionados: config.adicionais,
      comBusca: todosAdicionais.length > 8,
      placeholder: `Buscar entre ${todosAdicionais.length} ingredientes…`,
    };
  }

  function fecharFolha() {
    const aberta = folha;
    setFolha(null);
    if (aberta === null) return;
    // Devolve o foco a quem abriu a folha: sem isso o teclado volta ao topo da
    // página. Pelo id, e depois do desenho, porque a vaga vazia vira a linha
    // preenchida e o elemento antigo deixa de existir.
    const id =
      aberta.tipo === "sabor"
        ? `vaga-meio-${aberta.indice}`
        : aberta.tipo === "borda"
          ? "gatilho-borda"
          : "gatilho-adicionais";
    requestAnimationFrame(() => document.getElementById(id)?.focus());
  }

  function escolherNaFolha(id: string) {
    if (folha === null) return;
    if (folha.tipo === "sabor") {
      const atual = [...config.sabores];
      if (folha.indice < atual.length) atual[folha.indice] = id;
      else if (atual.length < vagasExtras) atual.push(id);
      else return;
      aplicar({ sabores: atual });
      fecharFolha();
    } else if (folha.tipo === "borda") {
      aplicar({ bordaId: id === BORDA_NENHUMA ? null : id });
      fecharFolha();
    } else {
      alternarAdicional(id);
    }
  }

  function removerSabor(indice: number) {
    aplicar({ sabores: config.sabores.filter((_, i) => i !== indice) });
  }

  function alternarAdicional(id: string) {
    const atual = config.adicionais;
    aplicar({
      adicionais: atual.includes(id) ? atual.filter((a) => a !== id) : [...atual, id],
    });
  }

  /**
   * Entrega a configuração com o preço que o SERVIDOR calculou. O componente
   * nunca inventa valor — se `montado` não está ok, o botão nem é clicável.
   */
  function confirmar() {
    if (!montado.ok) return;
    aoConfirmar({
      produtoId: produto.id,
      produtoSlug: dados.caminho ?? produto.slug,
      escolhas: config,
      saboresCompletos: saboresEscolhidos,
      montado,
    });
    setConfirmado(true);
  }

  const podeConfirmar = montado.ok && produto.disponivel;
  const erro = montado.ok ? null : montado.erro;

  const barra = (
    <div className="mx-auto flex max-w-shalon flex-col gap-2">
      {erro ? (
        <p role="alert" className="m-0 text-[13px] font-semibold text-tdf">
          {erro}
        </p>
      ) : null}
      {confirmado && !erro && mensagemSucesso !== null ? (
        <p role="status" className="m-0 text-[13px] font-semibold text-tgf">
          {mensagemSucesso}
        </p>
      ) : null}
      {aviso}

      <div className="flex items-center gap-3">
        <div className="flex items-center rounded-12 border-[1.5px] border-border-shalon">
          <button
            type="button"
            onClick={() => aplicar({ quantidade: Math.max(1, config.quantidade - 1) })}
            aria-label="Diminuir quantidade"
            className="min-h-[50px] min-w-[46px] cursor-pointer border-0 bg-transparent text-[20px] text-ink"
          >
            −
          </button>
          <span className="min-w-[26px] text-center font-bold text-ink">
            {config.quantidade}
          </span>
          <button
            type="button"
            onClick={() => aplicar({ quantidade: config.quantidade + 1 })}
            aria-label="Aumentar quantidade"
            className="min-h-[50px] min-w-[46px] cursor-pointer border-0 bg-transparent text-[20px] text-ink"
          >
            +
          </button>
        </div>

        <button
          type="button"
          disabled={!podeConfirmar}
          onClick={confirmar}
          className={[
            "min-h-[52px] flex-1 rounded-13 border-0 text-[16px] font-bold",
            podeConfirmar
              ? "cursor-pointer bg-cta text-cta-fg"
              : "cursor-not-allowed bg-tn text-muted",
          ].join(" ")}
        >
          {recalculando
            ? "Calculando..."
            : montado?.ok
              ? `${rotuloAcao} • ${formatBRL(montado.total)}`
              : "Indisponível"}
        </button>
      </div>
    </div>
  );

  return (
    <div
      className={ancoragem === "fixa" ? "pb-[150px]" : ""}
      // No balcão (configurador embutido), Ctrl+Enter adiciona o item, e o
      // evento não sobe: não pode também avançar o passo do pedido.
      onKeyDown={
        ancoragem === "embutida"
          ? (e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && podeConfirmar) {
                e.preventDefault();
                e.stopPropagation();
                confirmar();
              }
            }
          : undefined
      }
    >
      {/* 1 · Tamanho — RN-PIZZA-003. Fixo na fogazza (RN-FOG-004). */}
      {tamanhos.length > 0 && !tamanhoFixo ? (
        <fieldset className="min-w-0 mt-5 border-0 p-0">
          <legend className="mb-1 text-[16px] font-bold text-ink">Escolha o tamanho</legend>
          <p className="m-0 mb-[10px] text-[13px] text-muted">Obrigatório</p>
          <div className="flex flex-col gap-2">
            {tamanhos.map((t) => {
              const ativo = t.variacao_id === config.variacaoId;
              return (
                <button
                  key={t.variacao_id}
                  type="button"
                  disabled={!t.disponivel}
                  onClick={() => escolherTamanho(t.variacao_id)}
                  aria-pressed={ativo}
                  className={[
                    "flex min-h-[60px] items-center gap-3 rounded-13 border-2 p-[14px] text-left",
                    t.disponivel ? "cursor-pointer" : "cursor-not-allowed opacity-60",
                    ativo ? "border-brand-red bg-td" : "border-border-shalon bg-surface",
                  ].join(" ")}
                >
                  <span
                    aria-hidden="true"
                    className={[
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                      ativo ? "border-brand-red" : "border-border-shalon",
                    ].join(" ")}
                  >
                    {ativo ? <span className="h-[10px] w-[10px] rounded-full bg-brand-red" /> : null}
                  </span>
                  <span className="flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[15px] font-semibold text-ink">{t.tamanho_nome}</span>
                      {t.max_sabores > 1 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-tw px-2 py-[2px] text-[12px] font-bold text-twf">
                          <IconeMetade lado="esquerda" cheio />
                          Meio a meio
                        </span>
                      ) : null}
                    </span>
                    <span className="block text-[13px] text-ink-2">
                      {t.fatias} fatias ·{" "}
                      {t.max_sabores > 1
                        ? t.max_sabores === 2
                          ? "inteira ou meio a meio"
                          : `inteira ou até ${t.max_sabores} sabores`
                        : "1 sabor"}
                      {t.disponivel ? "" : " · indisponível hoje"}
                    </span>
                  </span>
                  <span className="text-[15px] font-bold tabular-nums text-ink">
                    {formatBRL(t.preco)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Descoberta: o tamanho de abertura costuma ser o menor, que só
              leva 1 sabor — e aí a seção de meio a meio nem existe na tela. */}
          {!aceitaMeioAMeio && tamanhoComMeioAMeio ? (
            <button
              type="button"
              onClick={() => escolherTamanho(tamanhoComMeioAMeio.variacao_id)}
              className="motion-interactive mt-2 flex min-h-touch w-full cursor-pointer items-center gap-2 rounded-13 border-[1.5px] border-dashed border-border-shalon bg-transparent px-[14px] py-2 text-left text-[14px] font-semibold text-ink transition-colors hover:border-brand-orange"
            >
              <IconeMetade lado="esquerda" cheio />
              <span className="flex-1">
                Quer meio a meio? Escolha o {tamanhoComMeioAMeio.tamanho_nome}.
              </span>
            </button>
          ) : null}
        </fieldset>
      ) : null}

      {/* 2 · Sabores — só quando o tamanho permite (RN-PIZZA-004) */}
      {aceitaMeioAMeio && dadosDoTamanho ? (
        <fieldset className="min-w-0 mt-[22px] border-0 p-0">
          <legend className="mb-1 text-[16px] font-bold text-ink">
            {tamanho?.max_sabores === 2 ? "Inteira ou meio a meio?" : "Inteira ou com mais sabores?"}
          </legend>
          <p className="m-0 mb-[10px] text-[13px] text-muted">
            Sua pizza já tem {produto.nome}. Quer dividir com{" "}
            {tamanho?.max_sabores === 2 ? "outro sabor" : "outros sabores"}? É opcional.
          </p>

          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {/* Vaga 0: o sabor da página, que não se troca aqui. */}
            <li className="flex min-h-[56px] items-center gap-3 rounded-13 border-2 border-border-shalon bg-elev px-[14px] py-[13px]">
              <MarcaDaVaga indice={0} total={tamanho?.max_sabores ?? 2} cheia />
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-bold uppercase tracking-[0.04em] text-muted">
                  {rotuloDaVaga(0, tamanho?.max_sabores ?? 2)}
                </span>
                <span className="block text-[15px] font-semibold text-ink">{produto.nome}</span>
              </span>
              <span className="shrink-0 text-[12.5px] text-muted">Sabor da página</span>
            </li>

            {Array.from({ length: vagasVisiveis }, (_, i) => {
              const vaga = i + 1;
              const sabor = config.sabores[i] ? nomeDoSabor(config.sabores[i]) : null;
              const rotulo = rotuloDaVaga(vaga, tamanho?.max_sabores ?? 2);

              if (!sabor) {
                return (
                  <li key={vaga}>
                    <button
                      id={`vaga-meio-${i}`}
                      type="button"
                      onClick={() => setFolha({ tipo: "sabor", indice: i })}
                      className="motion-interactive flex min-h-[56px] w-full cursor-pointer items-center gap-3 rounded-13 border-2 border-dashed border-border-shalon bg-transparent px-[14px] py-[13px] text-left transition-colors hover:border-brand-orange"
                    >
                      <MarcaDaVaga indice={vaga} total={tamanho?.max_sabores ?? 2} cheia={false} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold text-ink">
                          Escolher {rotulo === "2ª metade" ? "a 2ª metade" : `o ${rotulo}`}
                        </span>
                        <span className="block text-[13px] text-ink-2">
                          {outrosSabores.length} sabores para escolher
                        </span>
                      </span>
                      <span aria-hidden="true" className="shrink-0 text-brand-red">
                        <svg viewBox="0 0 24 24" fill="none" style={{ width: 20, height: 20 }}>
                          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </span>
                    </button>
                  </li>
                );
              }

              return (
                <li
                  key={vaga}
                  className="flex min-h-[56px] items-center gap-1 rounded-13 border-2 border-brand-red bg-td pl-[14px] pr-1"
                >
                  <button
                    id={`vaga-meio-${i}`}
                    type="button"
                    onClick={() => setFolha({ tipo: "sabor", indice: i })}
                    aria-label={`${rotulo}: ${sabor.nome}. Trocar sabor`}
                    className="flex min-h-[52px] min-w-0 flex-1 cursor-pointer items-center gap-3 border-0 bg-transparent py-[9px] pr-1 text-left"
                  >
                    <MarcaDaVaga indice={vaga} total={tamanho?.max_sabores ?? 2} cheia />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] font-bold uppercase tracking-[0.04em] text-muted">
                        {rotulo} · trocar
                      </span>
                      <span className="block truncate text-[15px] font-semibold text-ink">{sabor.nome}</span>
                    </span>
                    <span className="shrink-0 text-[14px] font-semibold tabular-nums text-ink-2">
                      {formatBRL(sabor.preco)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => removerSabor(i)}
                    aria-label={`Remover ${sabor.nome}`}
                    className="motion-interactive flex min-h-touch min-w-touch shrink-0 cursor-pointer items-center justify-center rounded-10 border-0 bg-transparent text-ink-2 transition-colors hover:text-ink"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" style={{ width: 18, height: 18 }}>
                      <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Microcopy do design, preservada literalmente — continua sendo a
              regra vigente (RN-PIZZA-005). */}
          <p className="mt-[10px] rounded-12 border border-twb bg-tw px-[14px] py-3 text-[13px] text-twf">
            Em pizzas meio a meio, será considerado o valor do sabor de maior preço.
          </p>

        </fieldset>
      ) : null}

      {/* 3 · Borda — RN-BORDA-001: no máximo uma, ou nenhuma. Uma linha com a
          escolha atual; as seis opções ficam na folha. */}
      {dadosDoTamanho && dadosDoTamanho.bordas.length > 0 ? (
        <section className="mt-[22px]" aria-labelledby="titulo-borda">
          <h3 id="titulo-borda" className="m-0 mb-[10px] text-[16px] font-bold text-ink">
            Escolha sua borda
          </h3>
          <button
            id="gatilho-borda"
            type="button"
            onClick={() => setFolha({ tipo: "borda" })}
            aria-label={`Borda: ${bordaAtual?.nome ?? "sem borda"}. Trocar borda`}
            className={[
              "motion-interactive flex min-h-[56px] w-full cursor-pointer items-center gap-3 rounded-13 border-2 px-[14px] py-[13px] text-left transition-colors",
              bordaAtual ? "border-brand-red bg-td" : "border-border-shalon bg-surface hover:border-brand-orange",
            ].join(" ")}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-bold uppercase tracking-[0.04em] text-muted">
                Borda · trocar
              </span>
              <span className="block truncate text-[15px] font-semibold text-ink">
                {bordaAtual?.nome ?? "Sem borda"}
              </span>
            </span>
            <span className="shrink-0 text-[14px] font-semibold tabular-nums text-ink-2">
              {bordaAtual ? detalheDaBorda(bordaAtual) : "—"}
            </span>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="shrink-0 text-muted" style={{ width: 18, height: 18 }}>
              <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </section>
      ) : null}

      {/* 4 · Adicionais — RN-ADD-003: entra ou não entra, sem quantidade. Os
          escolhidos aparecem em linha; os 39 ingredientes ficam na folha. */}
      {produto.adicionais_ligados && dadosDoTamanho && todosAdicionais.length > 0 ? (
        <section className="mt-[22px]" aria-labelledby="titulo-adicionais">
          <h3 id="titulo-adicionais" className="m-0 mb-1 text-[16px] font-bold text-ink">
            Adicionais
          </h3>
          <p className="m-0 mb-[10px] text-[13px] text-muted">{textoDosAdicionais}</p>

          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {config.adicionais.map((id) => {
              const a = todosAdicionais.find((x) => x.id === id);
              if (!a) return null;
              return (
                <li
                  key={id}
                  className="flex min-h-[56px] items-center gap-1 rounded-13 border-2 border-brand-red bg-td py-[2px] pl-[14px] pr-1"
                >
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">{a.nome}</span>
                  <span className="shrink-0 text-[14px] font-semibold tabular-nums text-ink-2">
                    {detalheDoAdicional(a)}
                  </span>
                  <button
                    type="button"
                    onClick={() => alternarAdicional(id)}
                    aria-label={`Remover ${a.nome}`}
                    className="motion-interactive flex min-h-touch min-w-touch shrink-0 cursor-pointer items-center justify-center rounded-10 border-0 bg-transparent text-ink-2 transition-colors hover:text-ink"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" style={{ width: 18, height: 18 }}>
                      <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                </li>
              );
            })}
            <li>
              <button
                id="gatilho-adicionais"
                type="button"
                onClick={() => setFolha({ tipo: "adicionais" })}
                className="motion-interactive flex min-h-[56px] w-full cursor-pointer items-center gap-3 rounded-13 border-2 border-dashed border-border-shalon bg-transparent px-[14px] py-[13px] text-left transition-colors hover:border-brand-orange"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-ink">
                    {config.adicionais.length === 0 ? "Escolher ingredientes" : "Adicionar mais ingredientes"}
                  </span>
                  <span className="block text-[13px] text-ink-2">
                    {todosAdicionais.length} ingredientes para escolher
                  </span>
                </span>
                <span aria-hidden="true" className="shrink-0 text-brand-red">
                  <svg viewBox="0 0 24 24" fill="none" style={{ width: 20, height: 20 }}>
                    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </span>
              </button>
            </li>
          </ul>
        </section>
      ) : null}

      {/* 5 · Observação — RN-OBS-001: texto livre, sem ficha técnica */}
      <div className="mt-[22px]">
        <h3 className="m-0 mb-2 text-[16px] font-bold text-ink">Alguma observação?</h3>
        <textarea
          value={config.observacao}
          // Texto livre não muda preço: não dispara recálculo (RN-OBS-001).
          onChange={(e) => aplicar({ observacao: e.target.value }, false)}
          rows={3}
          maxLength={300}
          placeholder="Ex.: sem cebola, cortar em 8 pedaços..."
          className="w-full resize-y rounded-12 border-[1.5px] border-border-shalon bg-surface px-[14px] py-3 text-[15px] text-ink placeholder:text-muted focus:border-brand-orange focus:outline-none"
        />
        <p className="m-0 mt-[6px] text-[12px] text-muted">
          Vamos tentar atender, mas algumas solicitações podem não ser possíveis.
        </p>
      </div>

      {folha !== null ? (
        <FolhaDeOpcoes
          {...descreverFolha(folha)}
          aviso={erro}
          aoEscolher={escolherNaFolha}
          aoFechar={fecharFolha}
        />
      ) : null}

      {ancoragem === "fixa" ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border-shalon bg-surface px-4 pb-4 pt-3">
          {/* Na mesma coluna de 560 px da página do produto, no notebook. */}
          <div className="lg:mx-auto lg:max-w-[528px]">{barra}</div>
        </div>
      ) : (
        <div className="mt-[22px] border-t border-border-shalon pt-3">{barra}</div>
      )}
    </div>
  );
}


/** "1ª metade" / "2ª metade" quando a pizza só tem duas; "1º sabor"… quando tem mais. */
function rotuloDaVaga(indice: number, total: number): string {
  return total === 2 ? `${indice + 1}ª metade` : `${indice + 1}º sabor`;
}

/** Meia pizza desenhada: o lado cheio é o que já tem sabor. */
function IconeMetade({
  lado,
  cheio,
  tamanho = 14,
}: {
  lado: "esquerda" | "direita";
  cheio: boolean;
  tamanho?: number;
}) {
  return (
    <svg aria-hidden="true" viewBox="0 0 28 28" fill="none" style={{ width: tamanho, height: tamanho }}>
      <circle
        cx="14"
        cy="14"
        r="12"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeDasharray={cheio ? undefined : "4 3"}
      />
      {cheio ? (
        <path
          d={lado === "esquerda" ? "M14 2A12 12 0 0 0 14 26Z" : "M14 2A12 12 0 0 1 14 26Z"}
          fill="currentColor"
        />
      ) : null}
    </svg>
  );
}

/**
 * Marca da vaga: com duas metades, o desenho da meia pizza (esquerda = 1ª,
 * direita = 2ª); com mais sabores, o número, porque "metade" deixa de ser verdade.
 */
function MarcaDaVaga({ indice, total, cheia }: { indice: number; total: number; cheia: boolean }) {
  if (total === 2) {
    return (
      <span aria-hidden="true" className={cheia ? "shrink-0 text-brand-red" : "shrink-0 text-muted"}>
        <IconeMetade lado={indice === 0 ? "esquerda" : "direita"} cheio={cheia} tamanho={28} />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className={[
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-[13px] font-bold",
        cheia ? "border-brand-red bg-brand-red text-white" : "border-dashed border-border-shalon text-muted",
      ].join(" ")}
    >
      {indice + 1}
    </span>
  );
}

type Folha = { tipo: "sabor"; indice: number } | { tipo: "borda" } | { tipo: "adicionais" };

/** "Sem borda" é uma opção da lista como as outras; no estado vira `null`. */
const BORDA_NENHUMA = "sem-borda";
