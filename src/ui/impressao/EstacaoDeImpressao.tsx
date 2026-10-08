"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { Papel } from "@/domain/pedidos/comanda";
import { carregarClienteRealtime } from "@/infrastructure/supabase/realtimeSobDemanda";
import { confirmarImpressao } from "@/application/pedidos/acoes";
import {
  listarEsperandoBalcao,
  pegarImpressaoDoBalcao,
} from "@/application/pedidos/impressaoDoBalcao";
import { useImpressoraDoAparelho } from "./impressoraDoAparelho";
import { imprimirLinhas } from "./imprimir";

/**
 * O APARELHO DO BALCÃO IMPRIMINDO PARA OS OUTROS (D-2026-10-08-116, entrega 3).
 *
 * Montado no shell do painel, então funciona em qualquer tela aberta. Não
 * faz nada se este aparelho não estiver marcado como "impressora do balcão"
 * em Configurações → Impressora.
 *
 * O evento do Realtime é só GATILHO, como na Central de Pedidos: a linha que
 * chega não é usada. Quem decide se este aparelho imprime é
 * `pegar_impressao_do_balcao`, que trava a linha — dois balcões, ou o mesmo
 * evento duas vezes, não imprimem duas vezes.
 *
 * Reserva a cada 30 s: se o Realtime cair sem avisar, o pedido ainda sai
 * dentro do prazo de 2 minutos do banco.
 */

const RESERVA_MS = 30_000;
const AVISO_MS = 6_000;

type Aviso = { tipo: "ok" | "erro"; texto: string } | null;

export function EstacaoDeImpressao() {
  const { estacao, papel } = useImpressoraDoAparelho();
  if (!estacao) return null;
  return <Estacao papel={papel} />;
}

function Estacao({ papel }: { papel: Papel }) {
  const [aviso, setAviso] = useState<Aviso>(null);
  // O papel pode mudar na configuração sem religar o canal.
  const papelAtual = useRef(papel);
  useEffect(() => {
    papelAtual.current = papel;
  }, [papel]);

  useEffect(() => {
    let vivo = true;
    let cliente: SupabaseClient | null = null;
    let canal: RealtimeChannel | null = null;
    let timerAviso: number | undefined;

    const vistos = new Set<string>();
    const fila: string[] = [];
    let processando = false;

    const avisar = (novo: Aviso) => {
      setAviso(novo);
      window.clearTimeout(timerAviso);
      timerAviso = window.setTimeout(() => setAviso(null), AVISO_MS);
    };

    async function processar() {
      if (processando) return;
      processando = true;
      // Uma por vez: duas comandas ao mesmo tempo podem sair embaralhadas.
      while (vivo && fila.length > 0) {
        const id = fila.shift() as string;
        const pega = await pegarImpressaoDoBalcao(id);
        if (!pega.ok) {
          // Outro balcão pegou: não é problema deste aparelho.
          if (pega.motivo !== "ja_pega") avisar({ tipo: "erro", texto: pega.erro });
          continue;
        }
        const nome = pega.tipo === "alteracao" ? "ALTERAÇÃO" : "Comanda";
        try {
          await imprimirLinhas(pega.linhas, papelAtual.current);
          avisar({ tipo: "ok", texto: `${nome} do pedido #${pega.numero} (via ${pega.via}) enviada à impressora.` });
        } catch {
          await confirmarImpressao(id, "error", "O balcão não conseguiu enviar à impressora.");
          avisar({ tipo: "erro", texto: `${nome} do pedido #${pega.numero} não foi enviada à impressora.` });
        }
      }
      processando = false;
    }

    function enfileirar(ids: string[]) {
      for (const id of ids) {
        if (vistos.has(id)) continue;
        vistos.add(id);
        fila.push(id);
      }
      void processar();
    }

    const sincronizar = () => {
      void listarEsperandoBalcao().then((ids) => {
        if (vivo) enfileirar(ids);
      });
    };

    // `await` antes de entrar no canal: a assinatura precisa nascer
    // `authenticated` (ver `client.ts`).
    void carregarClienteRealtime().then((supabase) => {
      if (!vivo) return;
      cliente = supabase;
      canal = supabase
        .channel("estacao-de-impressao")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "order_prints", filter: "transport=eq.balcao-80mm" },
          sincronizar,
        )
        .subscribe((situacao) => {
          // Ao ligar (e religar), pega o que chegou enquanto estava fora.
          if (vivo && situacao === "SUBSCRIBED") sincronizar();
        });
    });

    sincronizar();
    const reserva = window.setInterval(sincronizar, RESERVA_MS);

    return () => {
      vivo = false;
      window.clearInterval(reserva);
      window.clearTimeout(timerAviso);
      if (canal) void cliente?.removeChannel(canal);
    };
  }, []);

  if (aviso === null) return null;
  return (
    <p
      role={aviso.tipo === "erro" ? "alert" : "status"}
      className={[
        "fixed bottom-4 right-4 z-50 m-0 max-w-[340px] rounded-12 border px-3 py-[10px] text-[13.5px] font-semibold shadow-[0_4px_18px_rgb(0_0_0/0.12)]",
        aviso.tipo === "erro" ? "border-tdb bg-td text-tdf" : "border-tgb bg-tg text-tgf",
      ].join(" ")}
    >
      {aviso.texto}
    </p>
  );
}
