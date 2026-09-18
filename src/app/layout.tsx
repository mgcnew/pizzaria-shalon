import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { COOKIE_TEMA, temaDoCookie } from "@/ui/tema";
import { bricolage, beVietnam } from "@/ui/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Pizzaria Shalon — Tradição desde 1995",
    template: "%s · Pizzaria Shalon",
  },
  description:
    "Massa fresca todos os dias, assada na hora e entregue quentinha na sua casa.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f7f2ea",
};

/**
 * Layout raiz.
 *
 * `data-acento` define o tema de acento do design (amarelo no público,
 * vermelho no administrativo — este último é aplicado no layout do admin).
 * `data-tema` controla claro/escuro. Ambos só trocam tokens; nenhum
 * componente muda por causa deles (CLAUDE.md §44-A.2).
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // O tema vem de cookie, então o HTML já sai do servidor com o valor certo:
  // sem script bloqueante, sem piscar e sem divergência de hidratação.
  const tema = temaDoCookie((await cookies()).get(COOKIE_TEMA)?.value);

  return (
    <html
      lang="pt-BR"
      data-acento="amarelo"
      data-tema={tema}
      className={`${bricolage.variable} ${beVietnam.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
