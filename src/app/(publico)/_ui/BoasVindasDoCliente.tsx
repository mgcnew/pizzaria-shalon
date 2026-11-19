"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { esquecerNoNavegador, valorizarNoNavegador } from "@/application/checkout/acoes";
import type { ClienteValorizado } from "@/application/checkout/tipos";
import { montarItem } from "@/application/publico/acoes";
import { seloDoSabor } from "@/domain/clientes/valorizacao";
import { esquecerDispositivo } from "@/ui/publico/armazenamentoLocal";
import { useLoja } from "@/ui/publico/useLoja";

type Reconhecido = Extract<ClienteValorizado, { encontrado: true }>;

/**
 * Boas-vindas a quem volta (D-2026-11-19-193): o nome, o selo do sabor que
 * mais pede e "Pedir de novo" o último pedido concluído.
 *
 * Só aparece para o navegador que já comprou (a credencial nasce no primeiro
 * envio), e só com o que ESTE navegador fez (03 §11). Sem prêmio, sem
 * desconto: é reconhecimento.
 *
 * "PEDIR DE NOVO" NÃO GUARDA PREÇO. Cada item é remontado agora pelo motor do
 * cardápio (`montarItem`): preço, promoção e disponibilidade de hoje, como se
 * o cliente o montasse à mão (CLAUDE.md §16). O que não pode mais ser vendido
 * fica de fora, e a tela diz qual.
 */
export function BoasVindasDoCliente() {
  const router = useRouter();
  const { dispositivo, adicionar } = useLoja();
  const [cliente, setCliente] = useState<Reconhecido | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [montando, iniciar] = useTransition();

  useEffect(() => {
    if (!dispositivo) return;
    let vivo = true;
    void valorizarNoNavegador(dispositivo).then((r) => {
      if (vivo && r.encontrado && r.pedidos > 0) setCliente(r);
    });
    return () => {
      vivo = false;
    };
  }, [dispositivo]);

  if (!dispositivo || cliente === null) return null;

  const selo = seloDoSabor(cliente.sabor_favorito);
  const itens = cliente.ultimo_pedido?.itens ?? [];
  const resumo = itens.map((i) => `${i.configuracao.quantidade}× ${i.nome}`).join(", ");

  function pedirDeNovo() {
    setAviso(null);
    iniciar(async () => {
      const montados = await Promise.all(itens.map((i) => montarItem(i.configuracao)));
      const fora: string[] = [];
      montados.forEach((m, n) => {
        const item = itens[n]!;
        if (!m.ok) {
          fora.push(item.nome);
          return;
        }
        adicionar({
          produtoId: item.configuracao.produto_id,
          produtoSlug: item.produto_slug ?? "",
          nome: m.nome,
          variacaoId: item.configuracao.variacao_id,
          sabores: item.configuracao.sabores,
          bordaId: item.configuracao.borda_id,
          adicionais: item.configuracao.adicionais,
          observacao: item.configuracao.observacao,
          quantidade: m.quantidade,
          precoUnitario: m.preco_unitario,
          rotulos: m.rotulos,
          limite: m.limite,
        });
      });
      if (fora.length === 0) {
        router.push("/carrinho");
        return;
      }
      setAviso(
        fora.length === itens.length
          ? `Os itens do seu último pedido não estão disponíveis hoje: ${fora.join(", ")}.`
          : `Coloquei no carrinho o que está disponível hoje. Fora do cardápio agora: ${fora.join(", ")}.`,
      );
    });
  }

  function naoSouEu() {
    void esquecerNoNavegador(dispositivo);
    esquecerDispositivo();
    setCliente(null);
  }

  return (
    <section aria-label="Boas-vindas" className="px-4 pt-4">
      <div className="rounded-16 border border-border-shalon bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="m-0 font-display text-[19px] font-bold text-ink">
            Que bom te ver de novo, {cliente.nome}!
          </p>
          {selo ? (
            <span className="rounded-pill bg-tw px-[10px] py-[4px] text-[12.5px] font-bold text-twf">
              {selo}
            </span>
          ) : null}
        </div>

        {itens.length > 0 ? (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="m-0 min-w-0 text-[13.5px] text-ink-2">
              <span className="font-semibold text-ink">Seu último pedido:</span> {resumo}
            </p>
            <button
              type="button"
              onClick={pedirDeNovo}
              disabled={montando}
              className="motion-interactive min-h-touch shrink-0 cursor-pointer rounded-12 border-0 bg-cta px-4 text-[14.5px] font-bold text-cta-fg transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-70"
            >
              {montando ? "Montando…" : "Pedir de novo"}
            </button>
          </div>
        ) : null}

        {aviso ? (
          <p role="status" className="m-0 mt-2 rounded-10 bg-tw px-3 py-2 text-[13px] text-twf">
            {aviso}{" "}
            {!aviso.startsWith("Os itens") ? (
              <Link href="/carrinho" className="font-semibold text-twf underline">
                Ver carrinho
              </Link>
            ) : null}
          </p>
        ) : null}

        <button
          type="button"
          onClick={naoSouEu}
          className="mt-2 min-h-touch cursor-pointer border-0 bg-transparent p-0 text-[12.5px] font-semibold text-muted underline"
        >
          Não é você?
        </button>
      </div>
    </section>
  );
}
