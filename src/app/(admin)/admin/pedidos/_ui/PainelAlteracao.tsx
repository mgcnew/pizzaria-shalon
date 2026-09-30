"use client";

import { useState, useTransition } from "react";
import { formatBRL } from "@/lib/format";
import { proporAlteracao, retirarAlteracao } from "@/application/pedidos/acoes";
import type {
  ItemDoPedido,
  ItemDoRascunho,
  RevisaoDoPedido,
} from "@/application/pedidos/tipos";
import { EscolherProduto } from "./EscolherProduto";

/**
 * Alteração do pedido pela pizzaria.
 *
 * O FLUXO, e não o editor, é o que a regra exige (RN-ALT-001 a 007): propor,
 * guardar antes e depois, e — quando itens ou total mudam — aguardar o
 * cliente sem avançar sozinho. É isso que está implementado.
 *
 * O editor ajusta quantidades, remove linhas e ACRESCENTA itens novos —
 * inclusive pizza meio a meio com borda e adicionais —, usando o mesmo
 * configurador do cardápio público. Não existe um segundo jeito de montar
 * pizza no administrativo (CLAUDE.md §17).
 *
 * Nenhum preço é calculado aqui. Cada item é precificado pelo servidor ao
 * ser montado, e a proposta inteira é reprecificada por `propor_alteracao`
 * com a mesma `montar_item` do cardápio.
 *
 * A proposta viaja com a VERSÃO do pedido: se ele mudou enquanto o editor
 * estava aberto, o servidor recusa em vez de sobrescrever (CLAUDE.md §34).
 */
export function PainelAlteracao({
  pedidoId,
  versao,
  itens,
  podeAlterar,
  podeRetirar,
  revisaoAberta,
}: {
  pedidoId: string;
  /** `updated_at` do pedido quando esta tela foi montada. */
  versao: string;
  itens: ItemDoPedido[];
  podeAlterar: boolean;
  podeRetirar: boolean;
  revisaoAberta: RevisaoDoPedido | undefined;
}) {
  const [abrindo, setAbrindo] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [quantidades, setQuantidades] = useState<Record<number, number>>(() =>
    Object.fromEntries(itens.map((i) => [i.linha, i.quantidade])),
  );
  const [novos, setNovos] = useState<ItemDoRascunho[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();

  const restantes = itens.filter((i) => (quantidades[i.linha] ?? 0) > 0);
  const mudou =
    novos.length > 0 ||
    restantes.length !== itens.length ||
    itens.some((i) => quantidades[i.linha] !== i.quantidade);

  function enviar() {
    setErro(null);
    setAviso(null);
    iniciar(async () => {
      const r = await proporAlteracao({
        pedido_id: pedidoId,
        versao,
        motivo: motivo.trim(),
        itens: [
          ...restantes.map((i) => ({
            ...i.configuracao,
            quantidade: quantidades[i.linha] ?? i.quantidade,
          })),
          // Os acrescentados agora entram como CONFIGURAÇÃO — ids, não
          // preço. O servidor reprecifica todos do mesmo jeito.
          ...novos.map((i) => ({
            produto_id: i.produtoId,
            variacao_id: i.variacaoId,
            sabores: i.sabores,
            borda_id: i.bordaId,
            adicionais: i.adicionais,
            observacao: i.observacao,
            quantidade: i.quantidade,
          })),
        ],
      });
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setAbrindo(false);
      setMotivo("");
      setNovos([]);
      setAviso("Alteração registrada.");
    });
  }

  if (revisaoAberta !== undefined) {
    return (
      <div className="rounded-12 border border-twb bg-tw p-3">
        <p className="m-0 text-[14px] font-bold text-twf">
          Alteração aguardando o cliente
        </p>
        <p className="m-0 mt-1 text-[13.5px] text-ink-2">
          {revisaoAberta.motivo}
        </p>
        <p className="m-0 mt-1 text-[13.5px] text-ink-2">
          Total: {formatBRL(revisaoAberta.total_antes)} →{" "}
          <strong>{formatBRL(revisaoAberta.total_depois)}</strong>
        </p>
        <p className="m-0 mt-2 text-[12.5px] text-muted">
          O pedido não avança enquanto o cliente não responder pelo link de
          acompanhamento. Falar por WhatsApp ajuda — mas conversa não é aceite.
        </p>

        {podeRetirar ? (
          <button
            type="button"
            disabled={ocupado}
            onClick={() =>
              iniciar(async () => {
                const r = await retirarAlteracao(pedidoId);
                if (!r.ok) setErro(r.erro);
              })
            }
            className="mt-2 min-h-touch cursor-pointer rounded-11 border-[1.5px] border-border-shalon bg-surface px-4 text-[13.5px] font-semibold text-ink"
          >
            Retirar a proposta
          </button>
        ) : null}

        {erro !== null ? (
          <p role="alert" className="m-0 mt-2 text-[13px] font-semibold text-tdf">
            {erro}
          </p>
        ) : null}
      </div>
    );
  }

  if (!podeAlterar) {
    return aviso !== null ? (
      <p className="m-0 text-[13px] font-semibold text-tgf">{aviso}</p>
    ) : null;
  }

  if (!abrindo) {
    return (
      <button
        type="button"
        onClick={() => setAbrindo(true)}
        className="min-h-touch cursor-pointer rounded-11 border-[1.5px] border-border-shalon bg-surface px-4 text-[14px] font-semibold text-ink"
      >
        Propor alteração
      </button>
    );
  }

  return (
    <div className="rounded-12 border border-border-shalon bg-elev p-3">
      <p className="m-0 mb-2 text-[14px] font-bold text-ink">Propor alteração</p>

      <ul className="m-0 list-none p-0">
        {itens.map((item) => {
          const qtd = quantidades[item.linha] ?? item.quantidade;
          return (
            <li
              key={item.linha}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-border-shalon py-2 last:border-0"
            >
              <span className={qtd === 0 ? "text-[14px] text-muted line-through" : "text-[14px] text-ink"}>
                {item.sabores?.map((s) => s.nome).join(" / ") ?? item.nome}
                {item.tamanho !== null ? ` · ${item.tamanho}` : ""}
              </span>
              <span className="flex items-center overflow-hidden rounded-11 border-[1.5px] border-border-shalon">
                <button
                  type="button"
                  aria-label={`Diminuir ${item.nome}`}
                  onClick={() =>
                    setQuantidades((q) => ({ ...q, [item.linha]: Math.max(0, qtd - 1) }))
                  }
                  className="min-h-touch min-w-touch cursor-pointer border-0 bg-transparent text-[18px] text-ink"
                >
                  −
                </button>
                <span className="min-w-[26px] text-center font-semibold tabular-nums text-ink">
                  {qtd}
                </span>
                <button
                  type="button"
                  aria-label={`Aumentar ${item.nome}`}
                  onClick={() => setQuantidades((q) => ({ ...q, [item.linha]: qtd + 1 }))}
                  className="min-h-touch min-w-touch cursor-pointer border-0 bg-transparent text-[18px] text-ink"
                >
                  +
                </button>
              </span>
            </li>
          );
        })}
      </ul>

      {novos.length > 0 ? (
        <ul className="m-0 mt-2 list-none p-0">
          {novos.map((i) => (
            <li
              key={i.linha}
              className="flex flex-wrap items-center justify-between gap-2 rounded-10 bg-tg px-3 py-2"
            >
              <span className="text-[14px] text-tgf">
                + {i.quantidade}× {i.nome}
                {i.rotulos.length > 0 ? (
                  <span className="block text-[12px] text-ink-2">{i.rotulos.join(" · ")}</span>
                ) : null}
              </span>
              <button
                type="button"
                onClick={() => setNovos((lista) => lista.filter((x) => x.linha !== i.linha))}
                className="min-h-touch cursor-pointer border-0 bg-transparent text-[12.5px] font-semibold text-danger"
              >
                Remover
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3">
        <EscolherProduto
          aoAdicionar={(item) => setNovos((lista) => [...lista, item])}
          rotuloAcao="Acrescentar à alteração"
        />
      </div>

      <label htmlFor="motivo-alteracao" className="mt-3 mb-[6px] block text-[13.5px] font-semibold text-ink">
        Motivo da alteração
      </label>
      <textarea
        id="motivo-alteracao"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        rows={2}
        maxLength={400}
        placeholder="Acabou a calabresa; cliente pediu para tirar um item…"
        className="w-full resize-y rounded-11 border-[1.5px] border-border-shalon bg-surface px-3 py-2 text-[14px] text-ink focus:border-brand-orange focus:outline-none"
      />

      <p className="m-0 mt-2 text-[12.5px] text-muted">
        O novo total é calculado pelo servidor. Se itens ou total mudarem, o pedido passa a
        aguardar a resposta do cliente e não avança sozinho.
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={
            ocupado ||
            motivo.trim().length < 3 ||
            !mudou ||
            restantes.length + novos.length === 0
          }
          onClick={enviar}
          className="min-h-touch cursor-pointer rounded-11 border-0 bg-cta px-4 text-[14px] font-semibold text-cta-fg disabled:cursor-not-allowed disabled:bg-tn disabled:text-muted"
        >
          {ocupado ? "Registrando…" : "Registrar proposta"}
        </button>
        <button
          type="button"
          onClick={() => {
            setAbrindo(false);
            setQuantidades(Object.fromEntries(itens.map((i) => [i.linha, i.quantidade])));
            setMotivo("");
            setNovos([]);
          }}
          className="min-h-touch cursor-pointer rounded-11 border-[1.5px] border-border-shalon bg-surface px-4 text-[14px] font-semibold text-ink"
        >
          Cancelar
        </button>
      </div>

      {restantes.length + novos.length === 0 ? (
        <p className="m-0 mt-2 text-[12.5px] text-twf">
          Um pedido não pode ficar sem itens. Para não atender, use rejeitar ou cancelar.
        </p>
      ) : null}

      {erro !== null ? (
        <p role="alert" className="m-0 mt-2 rounded-10 bg-td px-3 py-2 text-[13px] font-semibold text-tdf">
          {erro}
        </p>
      ) : null}
    </div>
  );
}
