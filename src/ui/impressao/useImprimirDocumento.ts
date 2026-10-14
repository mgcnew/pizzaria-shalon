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
 * Imprime SEMPRE a versão em linhas do documento, pelo mesmo caminho da
 * comanda (`imprimirNoAparelho`): ESC/POS no Bluetooth direto, documento
 * próprio num iframe em qualquer outro modo.
 *
 * Até 13/10/2026 os cupons eram impressos com `window.print()` da própria
 * página, escondendo tudo menos o cupom. Mas o cupom vive dentro de um modal
 * centralizado, e na impressão a posição dele era medida a partir do modal:
 * saía deslocado para a direita e cortado (Diebold IM433TP), num valor que
 * mudava com o tamanho da tela. O HTML continua sendo a prévia na tela.
 */
export function useImprimirDocumento() {
  const impressora = useImpressoraDoAparelho();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function imprimir(montar: (largura: number) => LinhaComanda[]) {
    setErro(null);
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
