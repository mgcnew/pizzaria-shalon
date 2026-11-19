"use client";

import { useEffect, useState } from "react";
import { valorizarNoNavegador } from "@/application/checkout/acoes";
import { mensagemDoMarco } from "@/domain/clientes/valorizacao";
import { useLoja } from "@/ui/publico/useLoja";

/**
 * Comemora o pedido que acaba de ser enviado quando ele é um marco: o 1º, o
 * 5º, o 10º… por aqui (D-2026-11-19-193).
 *
 * Só na tela de "Pedido enviado", e só com a credencial deste navegador. A
 * página de acompanhamento em si não diz nada sobre outros pedidos: o link
 * pode ser aberto em qualquer aparelho, e ele não fala por ninguém (03 §10.2).
 */
export function MarcoDoPedido() {
  const { dispositivo } = useLoja();
  const [pedidos, setPedidos] = useState<number | null>(null);

  useEffect(() => {
    if (!dispositivo) return;
    let vivo = true;
    void valorizarNoNavegador(dispositivo).then((r) => {
      if (vivo && r.encontrado) setPedidos(r.pedidos);
    });
    return () => {
      vivo = false;
    };
  }, [dispositivo]);

  const marco = pedidos === null ? null : mensagemDoMarco(pedidos);
  if (marco === null) return null;

  return (
    <div className="motion-tab-in mt-3 rounded-12 border border-twb bg-tw px-3 py-2.5 text-twf">
      <p className="m-0 text-[14.5px] font-bold">🍕 {marco.titulo}</p>
      <p className="m-0 mt-0.5 text-[13px]">{marco.texto}</p>
    </div>
  );
}
