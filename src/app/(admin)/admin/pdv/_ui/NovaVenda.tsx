"use client";

import { useRef, useState, useTransition } from "react";
import { formatBRL } from "@/lib/format";
import { Select } from "@/ui/components/Select";
import { NucleoConfigurador } from "@/ui/configurador/NucleoConfigurador";
import type { DadosDoConfigurador } from "@/ui/configurador/tipos";
import { carregarConfigurador } from "@/application/publico/acoes";
import { criarPedidoManual } from "@/application/pedidos/acoes";
import { resolverCodigo, buscarNoCatalogo } from "@/application/pdv/acoes";
import type { ItemCatalogoPdv } from "@/application/pdv/tipos";
import type { ItemDoRascunho } from "@/application/pedidos/tipos";
import type { FormaDePagamento } from "@/application/checkout/tipos";

/**
 * Nova venda de balcão — Fase 12, Etapa 6.
 *
 * 09-PDV-FRENTE-DE-CAIXA.md §1.1, §1.2, §2.1, §4.1
 *
 * TRÊS COISAS QUE ESTA TELA NÃO FAZ:
 *
 *  1. não calcula preço. Cada item é precificado por `montar_item` dentro do
 *     configurador, e o pedido inteiro é recalculado por `criar_pedido` ao
 *     salvar. O total daqui é SOMA DE CONFERÊNCIA — existe para o operador
 *     olhar, nunca para cobrar (CLAUDE.md §16);
 *  2. não recebe pagamento. Não há `registrar_pagamento`, não há troco, não há
 *     valor recebido: a venda nasce devendo e vai para *Pedidos a receber*.
 *     Receber é a Etapa 7;
 *  3. não normaliza código de barras. O que foi lido sobe como veio, com os
 *     zeros à esquerda, e quem normaliza é o banco.
 *
 * E uma que ela faz de propósito: NÃO é um segundo caminho de criação. Salvar
 * chama `criarPedidoManual`, a mesma porta de `/admin/pedidos/novo`, que chama
 * a mesma `criar_pedido` do checkout público.
 */

type Resolucao =
  | { tipo: "nada" }
  | { tipo: "buscando" }
  | { tipo: "aviso"; texto: string }
  | { tipo: "resultados"; itens: ItemCatalogoPdv[]; termo: string };

export function NovaVenda({
  formas,
  autorizado,
}: {
  formas: FormaDePagamento[];
  autorizado: boolean;
}) {
  const [leitura, setLeitura] = useState("");
  const [estado, setEstado] = useState<Resolucao>({ tipo: "nada" });
  const [dados, setDados] = useState<DadosDoConfigurador | null>(null);
  const [variacaoInicial, setVariacaoInicial] = useState<string | null>(null);

  const [itens, setItens] = useState<ItemDoRascunho[]>([]);
  const [formaId, setFormaId] = useState("");
  const [bandeiraId, setBandeiraId] = useState("");

  const [erro, setErro] = useState<string | null>(null);
  const [criado, setCriado] = useState<{ numero: number; total: number } | null>(null);
  const [ocupado, iniciar] = useTransition();
  const campo = useRef<HTMLInputElement>(null);

  const forma = formas.find((f) => f.id === formaId) ?? null;
  // Soma de conferência. O total que vale é o que o servidor devolver.
  const subtotal = itens.reduce((s, i) => s + i.total, 0);

  const podeSalvar =
    !ocupado &&
    autorizado &&
    itens.length > 0 &&
    forma !== null &&
    (!forma.exige_bandeira || bandeiraId !== "");

  /**
   * Chave da tentativa: nasce no primeiro envio e sobrevive a clique repetido
   * e a retry de rede. O balcão é justamente onde se clica duas vezes
   * (CLAUDE.md §34). Só é descartada quando o pedido entra de fato.
   */
  const tentativa = useRef<string | null>(null);

  function limparBusca() {
    setLeitura("");
    setEstado({ tipo: "nada" });
    setDados(null);
    setVariacaoInicial(null);
    campo.current?.focus();
  }

  /** F2 do documento: a venda começa do zero, com o foco na leitura. */
  function novaVenda() {
    setItens([]);
    setErro(null);
    setCriado(null);
    tentativa.current = null;
    limparBusca();
  }

  async function abrirConfigurador(slug: string, variacao: string | null) {
    const d = await carregarConfigurador(slug);
    if (d === null) {
      setEstado({ tipo: "aviso", texto: "Não foi possível abrir este produto." });
      return;
    }
    setVariacaoInicial(variacao);
    setDados(d);
    setEstado({ tipo: "nada" });
  }

  /**
   * Enter no campo: primeiro tenta CÓDIGO, depois cai para a busca (§2.1).
   *
   * A ordem importa. Um código de barras é uma afirmação exata sobre qual item
   * é aquele; um termo de busca é uma aproximação. Tentar a busca primeiro
   * faria um código numérico casar por acaso com outro produto.
   */
  function confirmar() {
    const valor = leitura.trim();
    if (valor === "" || ocupado) return;
    setErro(null);
    setEstado({ tipo: "buscando" });

    iniciar(async () => {
      const r = await resolverCodigo(valor);

      if (r.ok === false) {
        setEstado({ tipo: "aviso", texto: r.erro });
        return;
      }

      if (r.encontrado === true) {
        // Item existe mas não pode ser vendido agora: informa e NÃO adiciona.
        // Quem decide isso é o banco; aqui só se relata.
        if (!r.ativo || !r.disponivel) {
          setEstado({
            tipo: "aviso",
            texto: !r.ativo
              ? `${r.produto_nome} está inativo no cadastro e não pode ser vendido.`
              : `${r.produto_nome} está indisponível hoje.`,
          });
          return;
        }

        // Produto com tamanhos ativos: abre a escolha SEM escolher por ela.
        // O contrário — pegar o primeiro tamanho — venderia um tamanho que
        // ninguém pediu, em cima de dinheiro.
        if (r.precisa_escolher_variante) {
          await abrirConfigurador(r.produto_slug, null);
          return;
        }

        // Variante: o código identifica AQUELE tamanho, e é com ele que abre.
        // O `alvo` é o discriminante da união — sem ele o compilador nem
        // deixaria ler `variante_id`, que só existe neste caso.
        await abrirConfigurador(
          r.produto_slug,
          r.alvo === "variante" ? r.variante_id : null,
        );
        return;
      }

      // Não é código cadastrado: vira termo de busca (§2.1).
      const achados = await buscarNoCatalogo(valor);
      setEstado({ tipo: "resultados", itens: achados, termo: valor });
    });
  }

  function salvar() {
    if (!podeSalvar || forma === null) return;
    setErro(null);
    tentativa.current ??= crypto.randomUUID();

    iniciar(async () => {
      const r = await criarPedidoManual({
        idempotency_key: tentativa.current,
        origem: "counter",
        modalidade: "pickup",
        // Sem bloco `cliente`: venda de balcão não identifica quem comprou
        // (D-2026-09-26-81). Quem autoriza isso é `criar_pedido`.
        endereco: null,
        itens: itens.map((i) => ({
          linha: i.linha,
          produto_id: i.produtoId,
          variacao_id: i.variacaoId,
          sabores: i.sabores,
          borda_id: i.bordaId,
          adicionais: i.adicionais,
          observacao: i.observacao,
          quantidade: i.quantidade,
        })),
        pagamento: {
          forma_id: forma.id,
          bandeira_id: forma.exige_bandeira ? bandeiraId : null,
          precisa_troco: false,
          troco_para: null,
        },
      });

      // O CARRINHO SOBREVIVE À FALHA. Refazer a venda inteira porque a rede
      // caiu seria punir o operador por um problema que não é dele.
      if (!r.ok) {
        setErro(r.erro);
        return;
      }

      // E só some depois da confirmação do servidor — com o número que ELE deu
      // e o total que ELE calculou.
      setCriado({ numero: r.numero, total: r.total });
      setItens([]);
      setFormaId("");
      setBandeiraId("");
      tentativa.current = null;
      limparBusca();
    });
  }

  function mudarQuantidade(linha: string, delta: number) {
    setItens((lista) =>
      lista.map((i) =>
        i.linha === linha
          ? {
              ...i,
              quantidade: Math.min(99, Math.max(1, i.quantidade + delta)),
              // O unitário é do servidor; a multiplicação é aritmética de
              // exibição, e o servidor recalcula tudo ao salvar.
              total: i.precoUnitario * Math.min(99, Math.max(1, i.quantidade + delta)),
            }
          : i,
      ),
    );
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(300px,1fr)_minmax(340px,1fr)]">
      {/* ------------------------------------------------ busca e leitor */}
      <section className="rounded-16 border border-border-shalon bg-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="m-0 text-[15px] font-bold text-ink">Buscar ou bipar</h2>
          <button
            type="button"
            onClick={novaVenda}
            className="min-h-touch cursor-pointer rounded-11 border-[1.5px] border-border-shalon bg-surface px-3 text-[13px] font-semibold text-ink hover:border-brand-orange"
          >
            Nova venda
          </button>
        </div>

        {/* `text`, nunca `number`: campo numérico come zero à esquerda, e em
            EAN-13 o zero à esquerda é significativo. */}
        <input
          ref={campo}
          type="text"
          inputMode="text"
          autoComplete="off"
          value={leitura}
          onChange={(e) => setLeitura(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              confirmar();
            }
          }}
          placeholder="Código de barras ou nome do produto"
          aria-label="Código de barras ou nome do produto"
          className="mt-3 min-h-touch-cta w-full rounded-11 border-[1.5px] border-border-shalon bg-surface px-3 font-mono text-[15px] tracking-wide text-ink focus:border-brand-orange focus:outline-none"
        />
        <p className="m-0 mt-1 text-[12px] text-muted">
          O leitor digita e confirma sozinho. Não encontrando o código, a mesma
          caixa procura pelo nome.
        </p>

        {estado.tipo === "buscando" ? (
          <p className="m-0 mt-3 text-[13px] text-muted">Procurando…</p>
        ) : null}

        {estado.tipo === "aviso" ? (
          <p
            role="status"
            className="m-0 mt-3 rounded-10 border border-twb bg-tw px-3 py-2 text-[13px] font-semibold text-twf"
          >
            {estado.texto}
          </p>
        ) : null}

        {estado.tipo === "resultados" ? (
          estado.itens.length === 0 ? (
            <p className="m-0 mt-3 text-[13px] text-ink-2">
              Nada encontrado para “{estado.termo}”.
            </p>
          ) : (
            <ul className="m-0 mt-3 list-none p-0">
              {estado.itens.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={!p.disponivel || !p.ativo}
                    onClick={() => iniciar(async () => { await abrirConfigurador(p.slug, null); })}
                    className={[
                      "flex w-full min-h-touch items-center justify-between gap-3 rounded-11 border-0 bg-transparent px-2 py-2 text-left",
                      p.disponivel && p.ativo
                        ? "cursor-pointer hover:bg-elev"
                        : "cursor-not-allowed opacity-60",
                    ].join(" ")}
                  >
                    <span className="min-w-0">
                      <span className="block text-[14.5px] font-semibold text-ink">
                        {p.nome}
                        {!p.ativo ? " · inativo" : !p.disponivel ? " · indisponível hoje" : ""}
                      </span>
                      <span className="block text-[12.5px] text-ink-2">{p.categoria_nome}</span>
                    </span>
                    <span className="whitespace-nowrap text-[14px] tabular-nums text-ink-2">
                      {p.preco !== null ? formatBRL(p.preco) : "—"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : null}

        {dados !== null ? (
          <div className="mt-3 rounded-12 border border-border-shalon bg-elev p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="m-0 text-[15px] font-bold text-ink">{dados.produto.nome}</h3>
              <button
                type="button"
                onClick={limparBusca}
                className="min-h-touch cursor-pointer rounded-11 border-[1.5px] border-border-shalon bg-surface px-3 text-[13px] font-semibold text-ink"
              >
                Cancelar
              </button>
            </div>

            <NucleoConfigurador
              dados={dados}
              ancoragem="embutida"
              variacaoInicial={variacaoInicial}
              rotuloAcao="Adicionar à venda"
              mensagemSucesso="Item adicionado."
              aoConfirmar={(item) => {
                setItens((lista) => [
                  ...lista,
                  {
                    linha: `${item.produtoId}|${item.escolhas.variacaoId ?? "-"}|${[...item.saboresCompletos].sort().join("+")}|${item.escolhas.bordaId ?? "-"}|${[...item.escolhas.adicionais].sort().join("+")}|${item.escolhas.observacao.trim().toLowerCase()}|${Date.now()}`,
                    produtoId: item.produtoId,
                    produtoSlug: item.produtoSlug,
                    nome: item.montado.nome,
                    variacaoId: item.escolhas.variacaoId,
                    sabores: item.saboresCompletos,
                    bordaId: item.escolhas.bordaId,
                    adicionais: item.escolhas.adicionais,
                    observacao: item.escolhas.observacao,
                    quantidade: item.escolhas.quantidade,
                    precoUnitario: item.montado.preco_unitario,
                    total: item.montado.total,
                    rotulos: item.montado.rotulos,
                  },
                ]);
                setCriado(null);
                limparBusca();
              }}
            />
          </div>
        ) : null}
      </section>

      {/* -------------------------------------------------- venda atual */}
      <section className="rounded-16 border border-border-shalon bg-surface p-4">
        <h2 className="m-0 mb-3 text-[15px] font-bold text-ink">Venda atual</h2>

        {criado !== null ? (
          <p
            role="status"
            className="m-0 mb-3 rounded-12 border border-tsb bg-ts px-3 py-2 text-[14px] font-semibold text-tsf"
          >
            Pedido #{criado.numero} salvo · {formatBRL(criado.total)} · aguardando
            recebimento
          </p>
        ) : null}

        {itens.length === 0 ? (
          <p className="m-0 text-[13.5px] text-ink-2">
            Nenhum item ainda. Bipe o código ou procure pelo nome ao lado.
          </p>
        ) : (
          <ul className="m-0 list-none p-0">
            {itens.map((i) => (
              <li key={i.linha} className="border-b border-border-shalon py-2 last:border-0">
                <div className="flex justify-between gap-3">
                  <span className="text-[14.5px] font-semibold text-ink">{i.nome}</span>
                  <span className="whitespace-nowrap tabular-nums text-[14.5px] text-ink">
                    {formatBRL(i.total)}
                  </span>
                </div>
                {i.rotulos.map((r) => (
                  <p key={r} className="m-0 text-[12.5px] text-ink-2">
                    {r}
                  </p>
                ))}
                {i.observacao ? (
                  <p className="m-0 text-[12.5px] italic text-twf">“{i.observacao}”</p>
                ) : null}

                <div className="mt-1 flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={`Diminuir ${i.nome}`}
                    onClick={() => mudarQuantidade(i.linha, -1)}
                    className="flex size-touch cursor-pointer items-center justify-center rounded-11 border-[1.5px] border-border-shalon bg-surface text-[16px] font-bold text-ink"
                  >
                    −
                  </button>
                  <span className="min-w-[2ch] text-center text-[14px] font-semibold tabular-nums text-ink">
                    {i.quantidade}
                  </span>
                  <button
                    type="button"
                    aria-label={`Aumentar ${i.nome}`}
                    onClick={() => mudarQuantidade(i.linha, 1)}
                    className="flex size-touch cursor-pointer items-center justify-center rounded-11 border-[1.5px] border-border-shalon bg-surface text-[16px] font-bold text-ink"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => setItens((l) => l.filter((x) => x.linha !== i.linha))}
                    className="ml-auto min-h-touch cursor-pointer border-0 bg-transparent p-0 text-[12.5px] font-semibold text-danger"
                  >
                    Remover
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex items-baseline justify-between border-t border-border-shalon pt-3">
          <span className="text-[13.5px] text-ink-2">
            {itens.length} {itens.length === 1 ? "item" : "itens"}
          </span>
          <span className="font-display text-[24px] font-extrabold tabular-nums text-ink">
            {formatBRL(subtotal)}
          </span>
        </div>
        <p className="m-0 text-[12px] text-muted">
          Conferência. O valor cobrado é o que o servidor recalcular ao salvar.
        </p>

        <div className="mt-3 flex flex-col gap-2">
          {/* A forma ESPERADA, não a recebida (§24). `criar_pedido` exige uma
              forma disponível, e é ela que a fila de recebimento vai exibir. */}
          <Select
            label="Forma de pagamento esperada"
            value={formaId}
            onChange={(e) => {
              setFormaId(e.target.value);
              setBandeiraId("");
            }}
            hint="Só a intenção. O recebimento acontece depois, no caixa."
          >
            <option value="">Escolha…</option>
            {formas.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </Select>

          {forma?.exige_bandeira ? (
            forma.bandeiras.length === 0 ? (
              <p
                role="status"
                className="m-0 rounded-10 border border-twb bg-tw px-3 py-2 text-[12.5px] font-semibold text-twf"
              >
                {forma.nome} exige bandeira e nenhuma está cadastrada. Cadastre em
                Configurações, ou escolha outra forma.
              </p>
            ) : (
              <Select
                label="Bandeira"
                value={bandeiraId}
                onChange={(e) => setBandeiraId(e.target.value)}
              >
                <option value="">Escolha…</option>
                {forma.bandeiras.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nome}
                  </option>
                ))}
              </Select>
            )
          ) : null}
        </div>

        {erro !== null ? (
          <p
            role="alert"
            className="m-0 mt-3 rounded-10 border border-tdb bg-td px-3 py-2 text-[13px] font-semibold text-tdf"
          >
            {erro}
          </p>
        ) : null}

        <button
          type="button"
          disabled={!podeSalvar}
          onClick={salvar}
          className="motion-interactive mt-3 flex min-h-[52px] w-full cursor-pointer items-center justify-center rounded-13 border-0 bg-cta text-[16px] font-semibold text-cta-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-tn disabled:text-muted disabled:opacity-100"
        >
          {ocupado ? "Salvando…" : "Salvar venda sem receber"}
        </button>

        <p className="m-0 mt-2 text-[12px] text-muted">
          A venda entra como pedido de balcão para retirada e fica aguardando
          recebimento. Receber pelo PDV é a Etapa 7.
        </p>

        {!autorizado ? (
          <p
            role="status"
            className="m-0 mt-2 rounded-10 border border-tdb bg-td px-3 py-2 text-[12.5px] font-semibold text-tdf"
          >
            Seu acesso não inclui lançar pedidos.
          </p>
        ) : null}
      </section>
    </div>
  );
}
