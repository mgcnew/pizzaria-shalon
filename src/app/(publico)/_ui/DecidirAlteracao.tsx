"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatBRL } from "@/lib/format";
import { decidirAlteracao } from "@/application/checkout/acoes";
import type { AlteracaoProposta } from "@/application/checkout/consultas";

/**
 * A pizzaria propôs uma alteração — e quem decide é o cliente.
 *
 * RN-ALT-005: a tela mostra a mudança e o total anterior/novo, lado a lado.
 * RN-ALT-006: recusar não cancela o pedido; a pizzaria é quem resolve o que
 * fazer depois. A tela diz isso em vez de deixar o cliente com medo de
 * clicar.
 */
export function DecidirAlteracao({
  token,
  proposta,
}: {
  token: string;
  proposta: Extract<AlteracaoProposta, { ok: true }>;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  function responder(aceita: boolean) {
    setErro(null);
    iniciar(async () => {
      const r = await decidirAlteracao(token, aceita);
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível registrar sua resposta.");
        return;
      }
      router.refresh();
    });
  }

  const diferenca = proposta.total_depois - proposta.total_antes;

  return (
    <section className="mb-4 rounded-14 border border-twb bg-tw p-4">
      <h2 className="m-0 font-display text-[19px] font-bold text-twf">
        A pizzaria precisa alterar seu pedido
      </h2>
      <p className="m-0 mt-1 text-[14px] text-ink-2">{proposta.motivo}</p>

      <div className="mt-3 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
        <div className="rounded-12 bg-surface p-3">
          <p className="m-0 mb-1 text-[12.5px] font-bold uppercase tracking-wide text-muted">
            Como está
          </p>
          <ul className="m-0 list-none p-0">
            {proposta.itens_antes.map((i, n) => (
              <li key={n} className="py-[3px] text-[13.5px] text-ink-2">
                {i.quantidade}× {i.nome}
              </li>
            ))}
          </ul>
          <p className="m-0 mt-2 text-[14px] tabular-nums text-ink">
            Total {formatBRL(proposta.total_antes)}
          </p>
        </div>

        <div className="rounded-12 bg-surface p-3">
          <p className="m-0 mb-1 text-[12.5px] font-bold uppercase tracking-wide text-twf">
            Como ficaria
          </p>
          <ul className="m-0 list-none p-0">
            {proposta.itens_depois.map((i, n) => (
              <li key={n} className="py-[3px] text-[13.5px] text-ink">
                {i.quantidade}× {i.nome}
                {i.rotulos.length > 0 ? (
                  <span className="block text-[12px] text-ink-2">{i.rotulos.join(" · ")}</span>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="m-0 mt-2 text-[15px] font-bold tabular-nums text-ink">
            Total {formatBRL(proposta.total_depois)}
          </p>
        </div>
      </div>

      {diferenca !== 0 ? (
        <p className="m-0 mt-2 text-[13.5px] font-semibold text-twf">
          {diferenca > 0
            ? `São ${formatBRL(diferenca)} a mais que o pedido original.`
            : `São ${formatBRL(Math.abs(diferenca))} a menos que o pedido original.`}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={enviando}
          onClick={() => responder(true)}
          className="min-h-touch-cta cursor-pointer rounded-12 border-0 bg-cta px-5 text-[15px] font-semibold text-cta-fg disabled:opacity-60"
        >
          {enviando ? "Registrando…" : "Aceitar a alteração"}
        </button>
        <button
          type="button"
          disabled={enviando}
          onClick={() => responder(false)}
          className="min-h-touch-cta cursor-pointer rounded-12 border-[1.5px] border-tdb bg-surface px-5 text-[15px] font-semibold text-tdf disabled:opacity-60"
        >
          Não aceitar
        </button>
      </div>

      <p className="m-0 mt-2 text-[12.5px] text-muted">
        Se você não aceitar, o pedido não é cancelado automaticamente: a pizzaria vai falar
        com você para resolver.
      </p>

      {erro !== null ? (
        <p role="alert" className="m-0 mt-2 text-[13px] font-semibold text-tdf">
          {erro}
        </p>
      ) : null}
    </section>
  );
}
