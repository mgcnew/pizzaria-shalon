"use client";

import { COLUNAS, type LinhaComanda, type Papel } from "@/domain/pedidos/comanda";
import { CHAMADA_DO_CONVITE, ENDERECO_DO_APP, INSTRUCAO_DO_CONVITE, URL_DO_CONVITE, svgDoQr } from "./convite";

/**
 * Envia linhas de texto à impressora padrão do sistema operacional
 * (D-2026-10-08-116).
 *
 * O documento é montado num iframe escondido e impresso de lá: o papel sai só
 * com o documento, sem herdar nada do CSS do painel, e a página em uso não
 * pisca.
 *
 * PONTO NO FIM. O espaço em branco antes do corte termina num ponto
 * discreto: driver de térmica costuma descartar o papel branco depois da
 * última coisa impressa e cortar ali — e o espaço sumia, cortando o QR
 * (Diebold IM433TP, 13/10/2026). Com o ponto, o branco é conteúdo.
 *
 * TUDO EM NEGRITO. A Courier New tem traço fino, e na térmica saía apagada
 * (08/10/2026). Títulos e destaques ganham um contorno a mais
 * (`text-stroke`), que engrossa o traço sem mudar a largura das colunas.
 *
 * SEM JANELA DE ESCOLHA só quando o navegador foi aberto com
 * `--kiosk-printing` (o atalho do balcão, explicado em Configurações →
 * Impressora). Sem ele, o navegador mostra a janela de impressão — que é o
 * que um site comum pode fazer, por segurança.
 *
 * O QUE ESTA FUNÇÃO NÃO SABE: se o papel saiu. O navegador só diz que
 * entregou ao sistema. Quem confirma é a pessoa que olhou para a impressora.
 */

/**
 * Área que a cabeça térmica alcança: 48 mm no papel de 58, 72 mm no de 80.
 *
 * Todo documento impresso pelo sistema operacional cabe AQUI, encostado à
 * esquerda. Desenhar na largura do papel corta a direita: o driver começa a
 * imprimir na borda do papel e para nos 72 mm — e o que fica à direita é o
 * valor em reais (defeito visto na 80 mm do balcão em 08/10/2026).
 */
export const AREA_UTIL_MM: Record<Papel, number> = { "58": 48, "80": 72 };

function escapar(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function montarHtml(
  linhas: LinhaComanda[],
  papel: Papel,
  espacoFinalMm: number,
  margemEsquerdaMm: number,
): string {
  const util = AREA_UTIL_MM[papel];
  // A margem à esquerda desloca o documento e tira a mesma medida da largura.
  const largura = util - margemEsquerdaMm;
  // Courier New avança 0,6 em por caractere. O divisor um pouco maior deixa
  // ~3% de folga: uma fonte substituta levemente mais larga não corta a
  // última coluna.
  const fonte = (largura / COLUNAS[papel] / 0.62).toFixed(3);

  const corpo = linhas
    .map((l) => {
      if (l.estilo === "qrcode") return `<p class="qr">${svgDoQr(l.texto)}</p>`;
      const classe = l.estilo === "titulo" || l.estilo === "destaque" ? ' class="b"' : "";
      return `<div${classe}>${l.texto === "" ? "&nbsp;" : escapar(l.texto)}</div>`;
    })
    .join("");

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Impressão</title><style>
@page { size: ${papel}mm auto; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; color: #000;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { width: ${util}mm; padding: 2mm 0 1mm ${margemEsquerdaMm}mm; box-sizing: border-box;
  font-family: "Courier New", Courier, monospace; font-size: ${fonte}mm; line-height: 1.3;
  font-weight: 700; }
div { white-space: pre; overflow: hidden; }
.b { -webkit-text-stroke: 0.35px #000; }
.qr { margin: 1mm 0; text-align: center; width: ${largura}mm; }
.fim { padding-top: ${espacoFinalMm}mm; text-align: center; font-size: 2mm; line-height: 1; }
</style></head><body>${corpo}<div class="fim">.</div></body></html>`;
}

export function imprimirLinhas(
  linhas: LinhaComanda[],
  papel: Papel,
  espacoFinalMm = 6,
  margemEsquerdaMm = 0,
): Promise<void> {
  return new Promise((resolver, rejeitar) => {
    const quadro = document.createElement("iframe");
    quadro.setAttribute("aria-hidden", "true");
    quadro.tabIndex = -1;
    quadro.style.cssText =
      "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";

    const remover = () => {
      // Dá tempo ao spooler de ler o documento antes de o quadro sumir.
      window.setTimeout(() => quadro.remove(), 1000);
    };

    quadro.onload = () => {
      const janela = quadro.contentWindow;
      if (janela === null) {
        remover();
        rejeitar(new Error("O navegador não abriu o documento para impressão."));
        return;
      }
      try {
        janela.focus();
        // Bloqueia até o navegador entregar ao sistema (ou a janela fechar).
        janela.print();
        remover();
        resolver();
      } catch (erro) {
        remover();
        rejeitar(erro instanceof Error ? erro : new Error("Falha ao imprimir."));
      }
    };

    quadro.srcdoc = montarHtml(linhas, papel, espacoFinalMm, margemEsquerdaMm);
    document.body.appendChild(quadro);
  });
}

/** Página de teste: régua de colunas e os acentos que mais dão problema. */
export function linhasDeTeste(papel: Papel): LinhaComanda[] {
  const colunas = COLUNAS[papel];
  const regua = Array.from({ length: colunas }, (_, i) => String((i + 1) % 10)).join("");
  return [
    { texto: "PIZZARIA SHALON", estilo: "titulo" },
    { texto: `TESTE DE IMPRESSAO - ${papel} mm`, estilo: "destaque" },
    { texto: "-".repeat(colunas), estilo: "separador" },
    { texto: `Regua de ${colunas} colunas:`, estilo: "normal" },
    { texto: regua, estilo: "normal" },
    { texto: "", estilo: "vazio" },
    { texto: "Acentos:", estilo: "normal" },
    { texto: "Calabresa com Açúcar", estilo: "normal" },
    { texto: "Coração, Pão, Maçã", estilo: "normal" },
    { texto: "ÁÉÍÓÚ ÂÊÔ ÃÕ Ç à", estilo: "normal" },
    { texto: "-".repeat(colunas), estilo: "separador" },
    { texto: "Se a regua coube numa linha so,", estilo: "normal" },
    { texto: "a largura esta certa.", estilo: "normal" },
    { texto: "-".repeat(colunas), estilo: "separador" },
    // O mesmo convite do cupom: mostra se a impressora desenha QR code.
    { texto: CHAMADA_DO_CONVITE, estilo: "titulo" },
    { texto: URL_DO_CONVITE, estilo: "qrcode" },
    { texto: INSTRUCAO_DO_CONVITE, estilo: "normal" },
    { texto: ENDERECO_DO_APP, estilo: "titulo" },
  ];
}
