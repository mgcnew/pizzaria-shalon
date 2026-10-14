"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { formatBRL } from "@/lib/format";
import { filtrarSabores } from "@/domain/catalogo/buscaDeSabor";
import { montarItem } from "@/application/publico/acoes";
import type { ItemMontado } from "@/application/publico/tipos";
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

  const [config, setConfig] = useState<Escolhas>({
    variacaoId: inicial,
    sabores: [],
    bordaId: null,
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
    if (inicial !== null && inicial !== (disponiveis[0]?.variacao_id ?? null)) {
      aplicar({ variacaoId: inicial });
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
    aplicar({ variacaoId, sabores: [], bordaId: null, adicionais: [] });
  }

  /**
   * No balcão (`embutida`) a lista do meio a meio vira busca: com dezenas de
   * sabores, rolar a lista inteira atrasa o atendimento. O atendente digita e
   * só aparece o que bate; os sabores já escolhidos ficam sempre à vista. O
   * cardápio público segue com a lista completa do design aprovado.
   */
  const buscaDeSabor = ancoragem === "embutida";
  const [termoDoSabor, setTermoDoSabor] = useState("");

  const outrosSabores = (dadosDoTamanho?.sabores ?? []).filter(
    (s) => s.variacao_id !== config.variacaoId,
  );
  const saboresAchados =
    buscaDeSabor && termoDoSabor.trim() !== ""
      ? filtrarSabores(outrosSabores, termoDoSabor).filter((s) => !config.sabores.includes(s.variacao_id))
      : [];
  const saboresNoLimite = config.sabores.length >= (tamanho?.max_sabores ?? 1) - 1;
  // Na busca, os escolhidos aparecem sempre; os demais, só os que batem.
  const saboresVisiveis = buscaDeSabor
    ? [...outrosSabores.filter((s) => config.sabores.includes(s.variacao_id)), ...saboresAchados]
    : outrosSabores;

  function alternarSabor(id: string) {
    const atual = config.sabores;
    if (atual.includes(id)) {
      aplicar({ sabores: atual.filter((s) => s !== id) });
      return;
    }
    // O sabor principal já ocupa uma das vagas do tamanho.
    const vagas = (tamanho?.max_sabores ?? 1) - 1;
    if (atual.length >= vagas) return;
    aplicar({ sabores: [...atual, id] });
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
    <div className={ancoragem === "fixa" ? "pb-[150px]" : ""}>
      {/* 1 · Tamanho — RN-PIZZA-003. Fixo na fogazza (RN-FOG-004). */}
      {tamanhos.length > 0 && !tamanhoFixo ? (
        <fieldset className="mt-5 border-0 p-0">
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
                    <span className="block text-[15px] font-semibold text-ink">
                      {t.tamanho_nome}
                    </span>
                    <span className="block text-[13px] text-ink-2">
                      {t.fatias} fatias ·{" "}
                      {t.max_sabores > 1 ? `até ${t.max_sabores} sabores` : "1 sabor"}
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
        </fieldset>
      ) : null}

      {/* 2 · Sabores — só quando o tamanho permite (RN-PIZZA-004) */}
      {aceitaMeioAMeio && dadosDoTamanho ? (
        <fieldset className="mt-[22px] border-0 p-0">
          <legend className="mb-1 text-[16px] font-bold text-ink">
            Escolha até {tamanho?.max_sabores} sabores
          </legend>
          <p className="m-0 mb-[10px] text-[13px] text-muted">
            {produto.nome} já está escolhido. Some outro sabor se quiser meio a meio.
          </p>
          {buscaDeSabor && !saboresNoLimite ? (
            <div className="mb-2">
              <label htmlFor="busca-sabor-meio-a-meio" className="sr-only">
                Buscar sabor para o meio a meio
              </label>
              <input
                id="busca-sabor-meio-a-meio"
                type="search"
                value={termoDoSabor}
                onChange={(e) => setTermoDoSabor(e.target.value)}
                placeholder="Buscar sabor… (ex.: calabresa)"
                autoComplete="off"
                className="min-h-touch w-full rounded-11 border-[1.5px] border-border-shalon bg-surface px-3 text-[15px] text-ink focus:border-brand-orange focus:outline-none"
              />
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            {saboresVisiveis.map((s) => {
              const ativo = config.sabores.includes(s.variacao_id);
              const cheio =
                !ativo && config.sabores.length >= (tamanho?.max_sabores ?? 1) - 1;
              const bloqueado = !s.disponivel || cheio;
              return (
                <button
                  key={s.variacao_id}
                  type="button"
                  disabled={bloqueado}
                  onClick={() => {
                    alternarSabor(s.variacao_id);
                    if (buscaDeSabor) setTermoDoSabor("");
                  }}
                  aria-pressed={ativo}
                  className={[
                    "flex min-h-[56px] items-center gap-3 rounded-13 border-2 px-[14px] py-[13px] text-left",
                    bloqueado ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                    ativo ? "border-brand-red bg-td" : "border-border-shalon bg-surface",
                  ].join(" ")}
                >
                  <span
                    aria-hidden="true"
                    className={[
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-6 border-2 text-[13px] font-bold text-white",
                      ativo ? "border-brand-red bg-brand-red" : "border-border-shalon",
                    ].join(" ")}
                  >
                    {ativo ? "✓" : ""}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-ink">
                      {s.nome}
                      {s.disponivel ? "" : " · indisponível hoje"}
                    </span>
                    {s.descricao ? (
                      <span className="block truncate text-[13px] text-ink-2">
                        {s.descricao}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-[14px] font-semibold tabular-nums text-ink-2">
                    {formatBRL(s.preco)}
                  </span>
                </button>
              );
            })}
          </div>
          {buscaDeSabor ? (
            <p className="m-0 mt-2 text-[12.5px] text-muted" role="status">
              {saboresNoLimite
                ? `Limite de ${tamanho?.max_sabores} sabores atingido. Desmarque um para trocar.`
                : termoDoSabor.trim() === ""
                ? `Digite para buscar entre ${outrosSabores.length} sabores.`
                : saboresAchados.length === 0
                  ? "Nenhum sabor encontrado com esse nome."
                  : null}
            </p>
          ) : null}

          {/* Microcopy do design, preservada literalmente — continua sendo a
              regra vigente (RN-PIZZA-005). */}
          <p className="mt-[10px] rounded-12 border border-twb bg-tw px-[14px] py-3 text-[13px] text-twf">
            Em pizzas meio a meio, será considerado o valor do sabor de maior preço.
          </p>
        </fieldset>
      ) : null}

      {/* 3 · Borda — RN-BORDA-001: no máximo uma, ou nenhuma */}
      {dadosDoTamanho && dadosDoTamanho.bordas.length > 0 ? (
        <fieldset className="mt-[22px] border-0 p-0">
          <legend className="mb-[10px] text-[16px] font-bold text-ink">Escolha sua borda</legend>
          <div className="flex flex-col gap-2">
            {[{ id: "", nome: "Sem borda", preco: 0 }, ...dadosDoTamanho.bordas].map((b) => {
              const valor = b.id === "" ? null : b.id;
              const ativo = config.bordaId === valor;
              return (
                <button
                  key={b.id || "sem"}
                  type="button"
                  onClick={() => aplicar({ bordaId: valor })}
                  aria-pressed={ativo}
                  className={[
                    "flex min-h-[56px] cursor-pointer items-center gap-3 rounded-13 border-2 px-[14px] py-[13px] text-left",
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
                  <span className="flex-1 text-[15px] font-semibold text-ink">{b.nome}</span>
                  <span className="text-[14px] font-semibold text-ink-2">
                    {b.preco > 0 ? `+ ${formatBRL(b.preco)}` : "—"}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      {/* 4 · Adicionais — RN-ADD-003: entra ou não entra, sem quantidade */}
      {produto.adicionais_ligados && dadosDoTamanho && dadosDoTamanho.adicionais.length > 0 ? (
        <fieldset className="mt-[22px] border-0 p-0">
          <legend className="mb-1 text-[16px] font-bold text-ink">Adicionais</legend>
          <p className="m-0 mb-[10px] text-[13px] text-muted">
            Opcional
            {produto.limite_adicionais !== null
              ? ` · até ${produto.limite_adicionais}`
              : ""}
            {config.sabores.length > 0 ? " · valem para a pizza inteira" : ""}
          </p>
          <div className="flex flex-col gap-2">
            {dadosDoTamanho.adicionais.map((a) => {
              const ativo = config.adicionais.includes(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => alternarAdicional(a.id)}
                  aria-pressed={ativo}
                  className={[
                    "flex min-h-[56px] cursor-pointer items-center gap-3 rounded-13 border-2 px-[14px] py-[13px] text-left",
                    ativo ? "border-brand-red bg-td" : "border-border-shalon bg-surface",
                  ].join(" ")}
                >
                  <span
                    aria-hidden="true"
                    className={[
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-6 border-2 text-[13px] font-bold text-white",
                      ativo ? "border-brand-red bg-brand-red" : "border-border-shalon",
                    ].join(" ")}
                  >
                    {ativo ? "✓" : ""}
                  </span>
                  <span className="flex-1 text-[15px] font-semibold text-ink">{a.nome}</span>
                  <span className="text-[14px] font-semibold text-ink-2">
                    + {formatBRL(a.preco)}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>
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
