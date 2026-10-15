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
 * Página do destaque (D-2026-10-15-126): para onde o banner de VÁRIOS
 * produtos leva. Mostra os produtos marcados no banner; banner fora do ar
 * (pausado, fora do dia ou do período, sem produto disponível) não tem itens
 * e a rota devolve 404 — o mesmo que ele faz no carrossel.
 */

export const metadata: Metadata = { title: "Destaque" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();

  const supabase = await getSupabaseServerClient();
  const [loja, { data }] = await Promise.all([
    obterLojaPublica(),
    supabase.rpc("itens_do_banner", { p_banner_id: id }),
  ]);
  const linhas = (data ?? []) as { produto_id: string; titulo_do_banner: string | null }[];
  if (linhas.length === 0) notFound();

  const produtos = await produtosPorId(linhas.map((l) => l.produto_id));
  // A ordem escolhida no banner.
  const ordem = new Map(linhas.map((l, i) => [l.produto_id, i]));
  produtos.sort((a, b) => (ordem.get(a.id) ?? 0) - (ordem.get(b.id) ?? 0));

  return (
    <>
      <AvisoLojaFechada loja={loja} />
      <div className="px-4 pt-4">
        <Link href="/" className="inline-flex min-h-touch items-center text-[15px] text-ink-2">
          ← Voltar ao cardápio
        </Link>
        <h1 className="m-0 mt-2 font-display text-[26px] font-extrabold text-ink">
          {linhas[0]?.titulo_do_banner ?? "Destaques"}
        </h1>
      </div>

      <section className="px-4 pt-5">
        {produtos.length === 0 ? (
          <EmptyState
            titulo="Nada por aqui agora"
            descricao="Os itens deste destaque estão indisponíveis no momento."
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
