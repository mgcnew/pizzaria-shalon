import { Bricolage_Grotesque, Be_Vietnam_Pro } from "next/font/google";

/**
 * Tipografia do design aprovado.
 *
 * O protótipo carregava as fontes por <link> do Google Fonts. Na aplicação
 * usamos next/font: mesmas famílias e pesos, porém auto-hospedadas, sem
 * requisição a terceiro em runtime e sem deslocamento de layout.
 * A escolha é de implementação; a tipografia não muda (CLAUDE.md §44-A.2).
 */

export const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-bricolage",
  display: "swap",
});

export const beVietnam = Be_Vietnam_Pro({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-be-vietnam",
  display: "swap",
});
