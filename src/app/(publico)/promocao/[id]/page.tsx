import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { EmptyState } from "@/ui/patterns";
import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import { obterLojaPublica, produtosPorId } from "@/application/publico/consultas";
import { AvisoLojaFechada } from "../../_ui/AvisoLojaFechada";
import { CardProduto } from "../../_ui/CardProduto";

/**
 * Página da promoção (D-2026-10-15-125).
 *
 * É para onde o banner de uma promoção com VÁRIOS itens leva. Mostra só o que
 * está valendo agora: promoção pausada, fora do dia ou encerrada não tem
 * itens, e a rota devolve 404 — o mesmo que o banner faz ao sair do ar.
 * O preço vem do próprio cardápio, que já considera a promoção vigente.
 */

async function itensDaPromocao(id: string) {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase.rpc("itens_da_promocao", { p_promotion_id: id });
  const linhas = (data ?? []) as { produto_id: string; nome_da_promocao: string }[];
  return {
    nome: linhas[0]?.nome_da_promocao ?? null,
    produtoIds: linhas.map((l) => l.produto_id),
  };
}

export const metadata: Metadata = { title: "Promoção" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();

  const [loja, { nome, produtoIds }] = await Promise.all([obterLojaPublica(), itensDaPromocao(id)]);
  if (!nome) notFound();

  const produtos = await produtosPorId(produtoIds);

  return (
    <>
      <AvisoLojaFechada loja={loja} />
      <div className="px-4 pt-4">
        <Link href="/" className="inline-flex min-h-touch items-center text-[15px] text-ink-2">
          ← Voltar ao cardápio
        </Link>
        <h1 className="m-0 mt-2 font-display text-[26px] font-extrabold text-ink">{nome}</h1>
        <p className="mt-1 text-[14px] text-ink-2">
          Os preços abaixo já são os da promoção, válidos hoje.
        </p>
      </div>

      <section className="px-4 pt-5">
        {produtos.length === 0 ? (
          <EmptyState
            titulo="Nada por aqui agora"
            descricao="Os itens desta promoção estão indisponíveis no momento."
          />
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:gap-3 md:grid-cols-4 lg:grid-cols-5">
            {produtos.map((p) => (
              <CardProduto key={p.id} produto={p} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
