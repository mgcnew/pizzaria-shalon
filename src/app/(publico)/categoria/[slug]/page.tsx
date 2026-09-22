import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/ui/patterns";
import {
  listarCardapio,
  listarCategoriasPublicas,
  obterLojaPublica,
} from "@/application/publico/consultas";
import { AvisoLojaFechada } from "../../_ui/AvisoLojaFechada";
import { CardProduto } from "../../_ui/CardProduto";
import { ChipsCategorias } from "../../_ui/ChipsCategorias";

/**
 * Página de categoria — RN-LINK-001: categoria tem link compartilhável.
 *
 * Categoria INATIVA não chega aqui: o RLS não a entrega e a rota devolve 404.
 * Categoria PAUSADA aparece normalmente, com os produtos marcados como
 * indisponíveis (RN-DISP-004).
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const categorias = await listarCategoriasPublicas();
  const categoria = categorias.find((c) => c.slug === slug);
  return { title: categoria?.nome ?? "Categoria" };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const [loja, categorias, itens] = await Promise.all([
    obterLojaPublica(),
    listarCategoriasPublicas(),
    listarCardapio(slug),
  ]);

  const categoria = categorias.find((c) => c.slug === slug);
  if (!categoria) notFound();

  return (
    <>
      <AvisoLojaFechada loja={loja} />

      <div className="px-4 pt-4">
        <Link href="/" className="inline-flex min-h-touch items-center text-[15px] text-ink-2">
          ← Voltar ao cardápio
        </Link>
        <h1 className="m-0 mt-2 font-display text-[26px] font-extrabold text-ink">
          {categoria.nome}
        </h1>
        {categoria.descricao ? (
          <p className="mt-1 text-[14px] text-ink-2">{categoria.descricao}</p>
        ) : null}
        {categoria.pausada ? (
          <p className="mt-2 inline-block rounded-6 bg-tw px-[10px] py-1 text-[12px] font-bold uppercase tracking-[0.04em] text-twf">
            Categoria pausada hoje
          </p>
        ) : null}
      </div>

      <div className="pt-4">
        <ChipsCategorias categorias={categorias} atual={slug} />
      </div>

      <section className="px-4 pt-5">
        {itens.length === 0 ? (
          <EmptyState
            titulo="Nada por aqui ainda"
            descricao="Essa categoria está sem itens no momento."
          />
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:gap-3 md:grid-cols-4 lg:grid-cols-5">
            {itens.map((p) => (
              <CardProduto key={p.id} produto={p} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
