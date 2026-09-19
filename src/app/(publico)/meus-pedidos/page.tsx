import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Meus pedidos" };

/**
 * Meus pedidos.
 *
 * ESTADO VISUAL DESTA FASE, e ele é honesto: pedido só existe a partir da
 * Fase 5. Nenhum pedido é inventado e nenhum modelo paralelo é criado.
 *
 * A arquitetura já decidida e preservada aqui (79.8 e 03 §11):
 *  · o histórico real será do BANCO, não do navegador;
 *  · a associação ao aparelho usará credencial local imprevisível, tratada
 *    como credencial — nunca um id público adivinhável;
 *  · é PROIBIDO liberar histórico digitando WhatsApp;
 *  · cada pedido terá URL individual com token seguro, que dá acesso só
 *    àquele pedido.
 *
 * Por isso esta tela não guarda nada localmente: qualquer estrutura criada
 * agora teria de ser desfeita para caber naquele modelo.
 */
export default function Page() {
  return (
    <section className="px-4 py-4">
      <Link href="/" className="inline-flex min-h-touch items-center text-[15px] text-ink-2">
        ← Voltar ao cardápio
      </Link>
      <h1 className="m-0 mb-4 mt-2 font-display text-[26px] font-extrabold text-ink">
        Meus pedidos
      </h1>

      <div className="rounded-18 border border-dashed border-border-shalon bg-elev px-5 py-[44px] text-center">
        <p className="m-0 font-display text-[20px] font-bold text-ink">
          Você ainda não fez pedidos por aqui
        </p>
        <p className="mb-[18px] mt-2 text-[14px] text-ink-2">
          Quando enviar um pedido, ele aparece nesta tela neste aparelho — sem cadastro e sem
          senha.
        </p>
        <Link
          href="/"
          className="inline-flex min-h-touch-cta items-center rounded-12 bg-cta px-5 text-[16px] font-semibold text-cta-fg"
        >
          Ver cardápio
        </Link>
      </div>

      <p className="m-0 mt-4 text-[12.5px] text-muted">
        Por segurança, o histórico nunca é liberado apenas informando um número de WhatsApp.
      </p>
    </section>
  );
}
