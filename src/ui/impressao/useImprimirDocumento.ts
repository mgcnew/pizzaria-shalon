"use client";

import { useState } from "react";
import { COLUNAS, type LinhaComanda } from "@/domain/pedidos/comanda";
import { useImpressoraDoAparelho } from "./impressoraDoAparelho";
import { imprimirNoAparelho } from "./imprimirNoAparelho";
import { ErroDaImpressora } from "./serial";

/**
 * Botão "Imprimir" dos cupons do PDV, da segunda via e do fechamento de
 * caixa (D-2026-10-08-116).
 *
 * - Bluetooth direto: manda as linhas em ESC/POS, sem janela nenhuma;
 * - qualquer outro modo: `window.print()` do HTML aprovado, como sempre foi
 *   (com o atalho do balcão, também sem janela).
 *
 * As linhas só são montadas quando vão ser usadas, e na largura do papel
 * deste aparelho.
 */
export function useImprimirDocumento() {
  const impressora = useImpressoraDoAparelho();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function imprimir(montar: (largura: number) => LinhaComanda[]) {
    setErro(null);
    if (impressora.modo !== "serial") {
      window.print();
      return;
    }
    setEnviando(true);
    try {
      await imprimirNoAparelho(montar(COLUNAS[impressora.papel]), impressora);
    } catch (falha) {
      setErro(falha instanceof ErroDaImpressora ? falha.message : "Não foi possível enviar para a impressora.");
    } finally {
      setEnviando(false);
    }
  }

  return { imprimir, enviando, erro, papel: impressora.papel };
}
