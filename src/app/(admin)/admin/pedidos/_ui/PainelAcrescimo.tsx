"use client";

import { useState, useTransition } from "react";
import { formatBRL } from "@/lib/format";
import { acrescentarItens } from "@/application/pedidos/acoes";
import type { ItemDoRascunho } from "@/application/pedidos/tipos";
import { EscolherProduto } from "./EscolherProduto";

/**
 * Acrescentar itens a pedido já aceito (D-2026-10-17-154).
 *
 * Só acréscimo, e só quando o próprio cliente pediu: o canal escolhido aqui
 * é o aceite dele, então não há aprovação pelo link. Tirar ou trocar itens
 * continua na "Alteração", que pede o aceite do cliente.
 *
 * Os preços mostrados vêm do servidor (montados pelo `EscolherProduto`) e
 * são recalculados de novo em `acrescentar_itens`.
 */
const CANAIS = [
  { valor: "whatsapp", rotulo: "WhatsApp" },
  { valor: "phone", rotulo: "Telefone" },
  { valor: "counter", rotulo: "No balcão" },
] as const;

type Canal = (typeof CANAIS)[number]["valor"];

export function PainelAcrescimo({
  pedidoId,
  versao,
  origem,
  abertoDeInicio = false,
}: {
  pedidoId: string;
  versao: string;
  /** Canal de origem do pedido: vira o canal sugerido. */
  origem: string;
  abertoDeInicio?: boolean;
}) {
  const sugerido: Canal = origem === "phone" ? "phone" : origem === "counter" ? "counter" : "whatsapp";
  const [aberto, setAberto] = useState(abertoDeInicio);
  const [novos, setNovos] = useState<ItemDoRascunho[]>([]);
  const [canal, setCanal] = useState<Canal>(sugerido);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  const soma = novos.reduce((s, i) => s + i.total, 0);

  function confirmar() {
    setErro(null);
    iniciar(async () => {
      const r = await acrescentarItens({
        pedido_id: pedidoId,
        versao,
        canal,
        itens: novos.map((i) => ({
          produto_id: i.produtoId,
          variacao_id: i.variacaoId,
          sabores: i.sabores,
          borda_id: i.bordaId,
          adicionais: i.adicionais,
          observacao: i.observacao,
          quantidade: i.quantidade,
        })),
      });
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setAberto(false);
      setNovos([]);
      setAviso(
        `Acrescentado ${formatBRL(r.acrescimo)}. Novo total ${formatBRL(r.total)}` +
          (r.a_receber > 0 && r.a_receber < r.total ? ` — falta receber ${formatBRL(r.a_receber)}.` : ".") +
          " Emita a comanda de ACRÉSCIMO para a cozinha.",
      );
    });
  }

  if (!aberto) {
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => {
            setAberto(true);
            setAviso(null);
          }}
          className="min-h-touch self-start cursor-pointer rounded-11 border-[1.5px] border-border-shalon bg-surface px-4 text-[14px] font-semibold text-ink hover:border-brand-orange"
        >
          + Acrescentar itens
        </button>
        {aviso ? <p className="m-0 text-[13px] font-semibold text-tgf">{aviso}</p> : null}
      </div>
    );
  }

  return (
    <div className="rounded-12 border border-border-shalon bg-elev p-3">
      <p className="m-0 text-[14px] font-bold text-ink">Acrescentar itens</p>
      <p className="m-0 mt-0.5 text-[12.5px] text-muted">
        Para quando o cliente pede mais alguma coisa. Os itens entram no mesmo pedido e ele
        recebe uma vez só.
      </p>

      {novos.length > 0 ? (
        <ul className="m-0 mt-3 list-none p-0">
          {novos.map((i) => (
            <li
              key={i.linha}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-border-shalon py-2 last:border-0"
            >
              <span className="min-w-0 text-[14px] text-ink">
                + {i.quantidade}× {i.nome}
                {i.rotulos.length > 0 ? (
                  <span className="block text-[12px] text-ink-2">{i.rotulos.join(" · ")}</span>
                ) : null}
              </span>
              <span className="flex items-center gap-2">
                <span className="tabular-nums text-[13.5px] text-ink">{formatBRL(i.total)}</span>
                <button
                  type="button"
                  onClick={() => setNovos((lista) => lista.filter((x) => x.linha !== i.linha))}
                  className="min-h-touch cursor-pointer border-0 bg-transparent text-[12.5px] font-semibold text-danger"
                >
                  Remover
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3">
        <EscolherProduto
          aoAdicionar={(item) => setNovos((lista) => [...lista, item])}
          rotuloAcao="Acrescentar"
        />
      </div>

      <fieldset className="m-0 mt-3 border-0 p-0">
        <legend className="mb-1.5 text-[13.5px] font-semibold text-ink">O cliente pediu por</legend>
        <div className="flex flex-wrap gap-2">
          {CANAIS.map((c) => (
            <label
              key={c.valor}
              className={[
                "inline-flex min-h-touch cursor-pointer items-center rounded-11 border-[1.5px] px-3.5 text-[13.5px] font-semibold",
                canal === c.valor ? "border-brand-red bg-surface text-ink" : "border-border-shalon bg-surface text-ink-2",
              ].join(" ")}
            >
              <input
                type="radio"
                name={`canal-${pedidoId}`}
                value={c.valor}
                checked={canal === c.valor}
                onChange={() => setCanal(c.valor)}
                className="sr-only"
              />
              {c.rotulo}
            </label>
          ))}
        </div>
        <p className="m-0 mt-1 text-[12px] text-muted">
          Fica registrado como o aceite do cliente, com quem acrescentou e quando.
        </p>
      </fieldset>

      {erro ? (
        <p role="alert" className="m-0 mt-3 rounded-10 bg-td px-3 py-2 text-[13px] font-semibold text-tdf">
          {erro}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={enviando || novos.length === 0}
          onClick={confirmar}
          className="min-h-touch cursor-pointer rounded-11 border-0 bg-cta px-4 text-[14px] font-semibold text-cta-fg disabled:cursor-not-allowed disabled:bg-tn disabled:text-muted"
        >
          {enviando
            ? "Acrescentando…"
            : novos.length === 0
              ? "Acrescentar ao pedido"
              : `Acrescentar ${formatBRL(soma)} ao pedido`}
        </button>
        <button
          type="button"
          disabled={enviando}
          onClick={() => {
            setAberto(false);
            setNovos([]);
            setErro(null);
          }}
          className="min-h-touch cursor-pointer rounded-11 border-[1.5px] border-border-shalon bg-surface px-4 text-[14px] font-semibold text-ink"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
