"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { decidirAtalho, type AcaoDoPdv, type ContextoDoPdv } from "@/app/(admin)/admin/pdv/_ui/atalhos";
import { FaixaDeAtalhos } from "@/ui/caixa/FaixaDeAtalhos";
import { JanelaDeMovimento } from "@/ui/caixa/PainelDoCaixa";

/** O mesmo critério do PDV para ceder a vez a modal, menu ou gaveta aberta. */
const SELETOR_POR_CIMA = '[aria-modal="true"], [role="dialog"], [role="menu"]';

/**
 * Atalhos de lançamento na tela de Pedidos (D-2026-10-30-179): F2 novo pedido,
 * F4 reforço e F9 sangria, por tecla ou clique. A decisão é a tabela do PDV; a
 * autorização real continua em `criar_pedido` e `movimentarCaixa`.
 */
export function AtalhosDePedidos({
  podeLancar,
  podeMovimentar,
  caixaAberto,
}: {
  podeLancar: boolean;
  podeMovimentar: boolean;
  caixaAberto: boolean;
}) {
  const router = useRouter();
  const [movimento, setMovimento] = useState<"reforco" | "sangria" | null>(null);
  const movimentaAgora = podeMovimentar && caixaAberto;

  useEffect(() => {
    function executar(acao: AcaoDoPdv): boolean {
      if (acao === "venda:nova" && podeLancar) router.push("/admin/pedidos/novo");
      else if (acao === "caixa:reforco") setMovimento("reforco");
      else if (acao === "caixa:sangria") setMovimento("sangria");
      else return false;
      return true;
    }

    function aoTeclar(e: KeyboardEvent) {
      if (e.repeat) return;
      const ativo = document.activeElement;
      const ctx: ContextoDoPdv = {
        focoEmCampo: ativo instanceof HTMLElement && ativo.matches("input, textarea, select, [contenteditable]"),
        focoNaLeitura: false,
        leituraPreenchida: false,
        cedendoAVez: document.querySelector(SELETOR_POR_CIMA) !== null,
        temItens: false,
        podeSalvar: false,
        temResultados: false,
        quantidadeItens: 0,
        totalVenda: 0,
        podeMovimentarCaixa: movimentaAgora,
      };
      const acao = decidirAtalho(
        { key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, shiftKey: e.shiftKey },
        ctx,
      );
      if (acao !== null && executar(acao)) e.preventDefault();
    }

    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [podeLancar, movimentaAgora, router]);

  if (!podeLancar && !podeMovimentar) return null;

  return (
    <>
      <FaixaDeAtalhos
        atalhos={[
          ...(podeLancar ? [{ tecla: "F2", rotulo: "Novo pedido", ativo: true }] : []),
          ...(podeMovimentar
            ? [
                { tecla: "F4", rotulo: caixaAberto ? "Reforço" : "Reforço (caixa fechado)", ativo: caixaAberto },
                { tecla: "F9", rotulo: caixaAberto ? "Sangria" : "Sangria (caixa fechado)", ativo: caixaAberto },
              ]
            : []),
        ]}
        aoAcionar={(a) => {
          if (a.tecla === "F2") router.push("/admin/pedidos/novo");
          else setMovimento(a.tecla === "F4" ? "reforco" : "sangria");
        }}
      />
      {movimento !== null ? (
        <JanelaDeMovimento tipo={movimento} aoFechar={() => setMovimento(null)} />
      ) : null}
    </>
  );
}
