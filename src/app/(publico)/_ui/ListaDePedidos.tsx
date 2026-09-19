"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatBRL } from "@/lib/format";
import { descreverEstado } from "@/domain/pedidos/estados";
import { resumoDosPedidos } from "@/application/checkout/acoes";
import { useLoja } from "@/ui/publico/useLoja";

/**
 * Lista dos pedidos feitos NESTE aparelho.
 *
 * 03 §11 e CLAUDE.md §29: a lista existe porque este navegador guardou os
 * tokens ao criar cada pedido. Não há login, não há sincronização entre
 * aparelhos — e a tela diz isso, em vez de deixar o cliente achar que
 * perdeu algo.
 *
 * O estado de cada pedido vem do servidor a cada abertura: o navegador
 * guarda o token, nunca o status.
 */

type Resumo = {
  token: string;
  numero: number;
  status: string;
  total: number;
  criado_em: string;
};

export function ListaDePedidos({ mostrar }: { mostrar: "abertos" | "concluidos" }) {
  const { pedidos, hidratado } = useLoja();
  const [resumos, setResumos] = useState<Resumo[] | null>(null);

  const chave = pedidos.map((p) => p.token).join(",");
  const semPedidos = chave === "";

  // Nada guardado, nada a consultar: o estado vazio é derivado, não um
  // `setState` disparado pelo efeito.
  useEffect(() => {
    if (!hidratado || semPedidos) return;
    let cancelado = false;
    void resumoDosPedidos(chave.split(",")).then((r) => {
      if (!cancelado) setResumos(r);
    });
    return () => {
      cancelado = true;
    };
    // `chave` representa a lista inteira de tokens.
  }, [chave, hidratado, semPedidos]);

  if (!hidratado || (!semPedidos && resumos === null)) {
    return <p className="m-0 text-[14px] text-muted">Carregando seus pedidos…</p>;
  }

  const filtrados = (semPedidos ? [] : (resumos ?? [])).filter(
    (r) => descreverEstado(r.status).emAberto === (mostrar === "abertos"),
  );

  if (filtrados.length === 0) {
    return (
      <div className="rounded-18 border border-dashed border-border-shalon bg-elev px-5 py-[44px] text-center">
        <p className="m-0 font-display text-[20px] font-bold text-ink">
          {mostrar === "abertos"
            ? "Nenhum pedido em andamento"
            : "Nenhum pedido concluído ainda"}
        </p>
        <p className="mb-[18px] mt-2 text-[14px] text-ink-2">
          Os pedidos aparecem aqui neste aparelho, sem cadastro e sem senha.
        </p>
        <Link
          href="/"
          className="inline-flex min-h-touch-cta items-center rounded-12 bg-cta px-5 text-[16px] font-semibold text-cta-fg"
        >
          Ver cardápio
        </Link>
      </div>
    );
  }

  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {filtrados.map((pedido) => {
        const estado = descreverEstado(pedido.status);
        return (
          <li key={pedido.token}>
            <Link
              href={`/pedido/${pedido.token}`}
              className="flex min-h-touch items-center justify-between gap-3 rounded-14 border border-border-shalon bg-surface p-4 no-underline"
            >
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold text-ink">
                  Pedido #{pedido.numero}
                </span>
                <span className="block text-[13px] text-ink-2">{estado.titulo}</span>
              </span>
              <span className="whitespace-nowrap font-semibold tabular-nums text-ink">
                {formatBRL(pedido.total)}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
