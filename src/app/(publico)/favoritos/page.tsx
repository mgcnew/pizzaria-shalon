import type { Metadata } from "next";
import Link from "next/link";
import { listarCardapio } from "@/application/publico/consultas";
import { CarregarFavoritos } from "../_ui/CarregarFavoritos";

export const metadata: Metadata = { title: "Favoritos" };

/**
 * Favoritos.
 *
 * RN-FAV-001: a lista vive no navegador. O servidor entrega o cardápio
 * publicável e o cliente filtra — assim a lista de quem acessa nunca é
 * enviada para lugar nenhum.
 */
export default async function Page() {
  const cardapio = await listarCardapio();

  return (
    <section className="px-4 py-4">
      <Link href="/" className="inline-flex min-h-touch items-center text-[15px] text-ink-2">
        ← Voltar ao cardápio
      </Link>
      <h1 className="m-0 mb-4 mt-2 font-display text-[26px] font-extrabold text-ink">
        Favoritos
      </h1>
      <CarregarFavoritos cardapio={cardapio} />
    </section>
  );
}
