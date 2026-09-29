"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { criarAgendadorDeRecarga } from "@/ui/agendadorDeRecarga";

/**
 * Quando um evento de Realtime vira `router.refresh()`.
 *
 * O evento é só GATILHO: quem informa é o servidor, relendo sob RLS. Este hook
 * decide apenas a HORA do refresh, nunca o quê, e não autoriza nada. Se ele
 * falhar, nada de errado acontece com o dinheiro; a tela só fica velha.
 *
 * Nasceu no PDV (Fase 12, Etapa 10) e foi extraído para a Central de Pedidos
 * repetir o mesmo comportamento (D-2026-09-29-89). As regras estão no
 * agendador (`criarAgendadorDeRecarga`), que é puro e tem teste; aqui só se
 * liga o agendador ao router e à visibilidade da aba.
 */
export function useRecargaAgrupada(janelaMs: number) {
  const router = useRouter();

  // Criado uma vez por montagem, para que `agendar` e `aoMudarOperacoes`
  // sejam estáveis e não reassinem o canal a cada render. Capturar o router
  // aqui é seguro: no App Router ele é o mesmo objeto a vida toda da página.
  const [agendador] = useState(() =>
    criarAgendadorDeRecarga({
      janelaMs,
      recarregar: () => router.refresh(),
      abaVisivel: () => document.visibilityState !== "hidden",
    }),
  );

  useEffect(() => {
    const aoMudarVisibilidade = () => {
      if (document.visibilityState === "visible") agendador.aoVoltarAba();
    };
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    return () => {
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
      agendador.descartar();
    };
  }, [agendador]);

  return { agendar: agendador.agendar, aoMudarOperacoes: agendador.aoMudarOperacoes };
}
