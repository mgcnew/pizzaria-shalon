"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/infrastructure/supabase/client";
import { exigeAtencao } from "@/domain/pedidos/estados";
import type { PedidoNaFila } from "@/application/pedidos/tipos";
import { CartaoPedido } from "./CartaoPedido";
import { ativarSom, somAtivo, tocarAlerta } from "./AlertaSonoro";

/**
 * Central de pedidos.
 *
 * ATUALIZAÇÃO. Assina as mudanças de `orders` por Realtime — o caso que
 * CLAUDE.md §40 cita como o de valor operacional claro. Não é polling: a
 * cozinha não pode depender de alguém lembrar de atualizar a página.
 *
 * A assinatura NÃO é uma porta lateral: o Realtime respeita o RLS, e a
 * policy de `orders` exige `orders.view`. Quem não pode ver, não recebe.
 *
 * A mensagem do Realtime serve só como GATILHO: ela diz "mudou", e a página
 * recarrega os dados pelo caminho normal, com as mesmas projeções e o mesmo
 * RLS. Nada da carga útil do evento é exibido direto, porque ela traz a
 * linha crua — incluindo o telefone completo do cliente.
 */
export function CentralDePedidos({
  pedidos,
  hora,
}: {
  pedidos: PedidoNaFila[];
  /** Horários já formatados no servidor, no fuso da loja. */
  hora: Record<string, string>;
}) {
  const router = useRouter();
  const [comSom, setComSom] = useState(false);
  const [conectado, setConectado] = useState(false);

  // Quais pedidos já estavam aqui: o alerta é para o que CHEGA, não para o
  // que já estava na tela quando ela abriu.
  const conhecidos = useRef<Set<string>>(new Set(pedidos.map((p) => p.id)));

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    const canal = supabase
      .channel("central-pedidos")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        (evento) => {
          const linha = evento.new as { id?: string; status?: string } | null;
          const novo =
            evento.eventType === "INSERT" &&
            typeof linha?.id === "string" &&
            !conhecidos.current.has(linha.id);

          if (novo && linha?.id) {
            conhecidos.current.add(linha.id);
            if (typeof linha.status === "string" && exigeAtencao(linha.status)) {
              tocarAlerta();
            }
          }
          // Recarrega pelo caminho normal. O evento avisa; quem informa é o
          // servidor.
          router.refresh();
        },
      )
      .subscribe((estado) => {
        setConectado(estado === "SUBSCRIBED");
      });

    return () => {
      void supabase.removeChannel(canal);
    };
  }, [router]);

  const aguardando = pedidos.filter((p) => exigeAtencao(p.status));
  const andamento = pedidos.filter((p) => !exigeAtencao(p.status));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-[13px] text-muted">
          {conectado
            ? "Atualizando em tempo real."
            : "Reconectando… a lista pode estar alguns segundos atrasada."}
        </p>

        {/* O navegador exige um gesto antes de tocar qualquer som. Enquanto
            ele não vier, a tela diz a verdade: o som está desligado. */}
        <button
          type="button"
          onClick={() => setComSom(ativarSom() && somAtivo())}
          className="min-h-touch cursor-pointer rounded-11 border-[1.5px] border-border-shalon bg-surface px-[14px] text-[13px] font-semibold text-ink"
        >
          {comSom ? "Som ligado" : "Ativar som de pedido novo"}
        </button>
      </div>

      {pedidos.length === 0 ? (
        <div className="rounded-18 border border-dashed border-border-shalon bg-elev px-5 py-[44px] text-center">
          <p className="m-0 font-display text-[19px] font-bold text-ink">
            Nenhum pedido em aberto
          </p>
          <p className="m-0 mt-1 text-[14px] text-ink-2">
            Os pedidos aparecem aqui assim que chegam.
          </p>
        </div>
      ) : null}

      {aguardando.length > 0 ? (
        <section>
          <h2 className="m-0 mb-2 text-[14px] font-bold uppercase tracking-wide text-ink-2">
            Precisam de você ({aguardando.length})
          </h2>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
            {aguardando.map((p) => (
              <CartaoPedido key={p.id} pedido={p} hora={hora[p.id] ?? ""} />
            ))}
          </div>
        </section>
      ) : null}

      {andamento.length > 0 ? (
        <section>
          <h2 className="m-0 mb-2 text-[14px] font-bold uppercase tracking-wide text-ink-2">
            Em andamento ({andamento.length})
          </h2>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
            {andamento.map((p) => (
              <CartaoPedido key={p.id} pedido={p} hora={hora[p.id] ?? ""} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
