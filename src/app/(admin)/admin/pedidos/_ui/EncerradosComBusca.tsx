"use client";

import { useState } from "react";
import type { PedidoNaFila } from "@/application/pedidos/tipos";
import { CampoDeBuscaDePedidos } from "./CampoDeBuscaDePedidos";
import { CartaoPedido } from "./CartaoPedido";
import { TabelaPedidos } from "./TabelaPedidos";
import { filtrarPedidosPorBusca } from "./buscaDePedidos";

/**
 * A lista de encerrados com busca (D-2026-11-19-188).
 *
 * É aqui que a busca mais faz falta: o cliente liga perguntando de um pedido
 * de mais cedo, e o balcão rolava a lista atrás do número. Busca só dentro do
 * que já foi carregado; dias mais antigos continuam em "Carregar dias
 * anteriores", logo abaixo.
 */
export function EncerradosComBusca({
  pedidos,
  hora,
  espera,
  consultaDaAba,
}: {
  pedidos: PedidoNaFila[];
  hora: Record<string, string>;
  espera: Record<string, string>;
  consultaDaAba: string;
}) {
  const [busca, setBusca] = useState("");
  const encontrados = filtrarPedidosPorBusca(pedidos, busca);
  const termo = busca.trim();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <CampoDeBuscaDePedidos id="busca-encerrados" valor={busca} aoMudar={setBusca} />
      </div>

      {encontrados.length === 0 ? (
        <div className="rounded-18 border border-dashed border-border-shalon bg-elev px-5 py-[44px] text-center">
          <p className="m-0 font-display text-[19px] font-bold text-ink">
            Nenhum pedido com “{termo}” neste período
          </p>
          <p className="m-0 mt-1 text-[14px] text-ink-2">
            Confira o número, tente parte do nome ou carregue dias anteriores.
          </p>
          <button
            type="button"
            onClick={() => setBusca("")}
            className="mt-3 inline-flex min-h-touch cursor-pointer items-center rounded-11 border-[1.5px] border-border-shalon bg-surface px-[14px] text-[13.5px] font-semibold text-ink hover:border-brand-orange"
          >
            Limpar busca
          </button>
        </div>
      ) : (
        <>
          {/* ENCERRADOS MANTÉM O MAIS NOVO EM CIMA. Esta lista é consulta,
              não operação: quem abre aqui procura o que acabou de acontecer.
              É a ordem que a RPC já devolve, e por isso não se mexe nela. */}
          <TabelaPedidos
            pedidos={encontrados}
            hora={hora}
            espera={espera}
            modo="encerrado"
            rotulo="Pedidos encerrados, do mais recente para o mais antigo"
            consultaDaAba={consultaDaAba}
          />
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))] lg:hidden">
            {encontrados.map((p) => (
              <CartaoPedido
                key={p.id}
                pedido={p}
                hora={hora[p.id] ?? ""}
                consultaDaAba={consultaDaAba}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
