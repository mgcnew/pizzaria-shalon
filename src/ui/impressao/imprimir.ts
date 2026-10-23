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
 * NEGRITO. A Courier New tem traço fino, e na térmica saía apagada
 * (08/10/2026): por isso o documento inteiro saía em negrito, e títulos e
 * destaques ganhavam um contorno a mais (`text-stroke`), que engrossa o traço
 * sem mudar a largura das colunas.
 *
 * COMANDA COM NEGRITO SELETIVO (23/10/2026). Com tudo em negrito, o negrito
 * deixava de apontar o que quer que fosse. Documento que usa o estilo "forte"
 * (a comanda: itens e observações) sai em peso normal, com só um contorno bem
 * fino para a letra não sair apagada, e o negrito de verdade fica para o que é
 * "forte". Os demais documentos (cupom, fechamento) seguem como antes.
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

/**
 * Largura de um caractere impresso pelo sistema: 1,9 mm, a letra da prévia
 * na tela (12 px de Courier New).
 *
 * FONTE FIXA, COLUNAS CALCULADAS (13/10/2026). Antes era o contrário: um
 * número fixo de colunas espremido na largura — a letra encolhia a cada
 * margem a mais, e ainda cortava na Diebold. Agora a letra não muda, e o
 * documento é montado com as colunas que cabem na largura que sobra.
 */
export const LARGURA_DO_CARACTERE_MM = 1.9;

/** Courier New avança 0,6 em por caractere. */
const AVANCO_DA_FONTE = 0.6;

/** Colunas que cabem numa largura, com a letra fixa. Nunca menos de 24. */
export function colunasNaLargura(larguraMm: number): number {
  return Math.max(24, Math.floor(larguraMm / LARGURA_DO_CARACTERE_MM));
}

function escapar(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function montarHtml(
  linhas: LinhaComanda[],
  papel: Papel,
  espacoFinalMm: number,
  faixa: FaixaDeImpressao,
): string {
  const largura = faixa.larguraMm;
  // Letra fixa — a não ser que alguma linha venha mais larga do que cabe
  // (a comanda que o celular manda ao balcão, montada noutro aparelho):
  // aí encolhe o necessário para ela não ser cortada. 3% de folga para
  // fonte substituta um pouco mais larga.
  const maisLonga = Math.max(1, ...linhas.filter((l) => l.estilo !== "qrcode").map((l) => l.texto.length));
  const caractere = Math.min(LARGURA_DO_CARACTERE_MM, largura / maisLonga / 1.03);
  const fonte = (caractere / AVANCO_DA_FONTE).toFixed(3);

  // Documento com "forte" é o de negrito seletivo.
  const seletivo = linhas.some((l) => l.estilo === "forte");

  const corpo = linhas
    .map((l) => {
      if (l.estilo === "qrcode") return `<p class="qr">${svgDoQr(l.texto)}</p>`;
      const classe =
        l.estilo === "forte"
          ? ' class="f"'
          : l.estilo === "titulo" || l.estilo === "destaque"
            ? ' class="b"'
            : "";
      return `<div${classe}>${l.texto === "" ? "&nbsp;" : escapar(l.texto)}</div>`;
    })
    .join("");

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Impressão</title><style>
@page { size: ${papel}mm auto; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; color: #000;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { width: ${faixa.inicioMm + largura}mm; padding: 2mm 0 1mm ${faixa.inicioMm}mm; box-sizing: border-box;
  font-family: "Courier New", Courier, monospace; font-size: ${fonte}mm; line-height: 1.3;
  font-weight: ${seletivo ? 400 : 700};${seletivo ? " -webkit-text-stroke: 0.2px #000;" : ""} }
div { white-space: pre; overflow: hidden; }
.b { font-weight: 700; -webkit-text-stroke: 0.35px #000; }
.f { font-weight: 700; -webkit-text-stroke: 0.35px #000; }
.qr { margin: 1mm 0; text-align: center; width: ${largura}mm; }
.fim { padding-top: ${espacoFinalMm}mm; text-align: center; font-size: 2mm; line-height: 1; }
</style></head><body>${corpo}<div class="fim">.</div></body></html>`;
}

/**
 * Onde o documento é desenhado no papel, a partir da borda esquerda: começa
 * em `inicioMm` e ocupa `larguraMm`. Vem das margens prontas ou da área
 * medida com a régua de alinhamento (`faixaDoAparelho`).
 */
export type FaixaDeImpressao = { inicioMm: number; larguraMm: number };

export function imprimirLinhas(
  linhas: LinhaComanda[],
  papel: Papel,
  espacoFinalMm = 6,
  faixa: FaixaDeImpressao = { inicioMm: 0, larguraMm: AREA_UTIL_MM[papel] },
): Promise<void> {
  return imprimirHtml(montarHtml(linhas, papel, espacoFinalMm, faixa));
}

/**
 * Régua de alinhamento (13/10/2026): ocupa o papel INTEIRO, de borda a
 * borda, sem margem nenhuma. Pelo papel impresso se lê em que milímetro a
 * impressora começa e termina de imprimir — é o que se digita em "Área de
 * impressão medida". A faixa preta contínua mostra o cabeçote: falhas ou
 * riscos brancos nela são sujeira ou defeito, não configuração.
 */
export function imprimirReguaDeAlinhamento(papel: Papel): Promise<void> {
  const largura = Number(papel);
  const marcas: string[] = [];
  for (let mm = 0; mm <= largura; mm++) {
    const altura = mm % 10 === 0 ? 7 : mm % 5 === 0 ? 5 : 3;
    marcas.push(`<rect x="${mm - 0.15}" y="6" width="0.3" height="${altura}"/>`);
    if (mm % 10 === 0 && mm > 0 && mm < largura) {
      marcas.push(`<text x="${mm}" y="18" font-size="3.4" text-anchor="middle">${mm}</text>`);
    }
  }
  // Números de 5 em 5 numa segunda linha, para ler com precisão perto das bordas.
  for (let mm = 5; mm < largura; mm += 10) {
    marcas.push(`<text x="${mm}" y="23" font-size="2.6" text-anchor="middle">${mm}</text>`);
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${largura} 32" width="${largura}mm" height="32mm" ` +
    `font-family="Arial, sans-serif" font-weight="700">` +
    `<rect x="0" y="0" width="${largura}" height="4"/>${marcas.join("")}` +
    `<rect x="0" y="27" width="${largura}" height="4"/></svg>`;
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Régua</title><style>
@page { size: ${papel}mm auto; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; color: #000;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { width: ${largura}mm; font-family: Arial, sans-serif; font-weight: 700; font-size: 3.2mm; }
p { margin: 2mm 0 0; text-align: center; }
.fim { padding-top: 20mm; text-align: center; font-size: 2mm; }
</style></head><body><p>REGUA DE ALINHAMENTO - ${papel} mm</p>${svg}
<p>Anote o primeiro e o ultimo numero que aparecem.</p>
<p>Faixa preta falhada = cabecote sujo ou com defeito.</p>
<div class="fim">.</div></body></html>`;
  return imprimirHtml(html);
}

/** Imprime um documento HTML completo num iframe escondido. */
function imprimirHtml(html: string): Promise<void> {
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

    quadro.srcdoc = html;
    document.body.appendChild(quadro);
  });
}

/** Página de teste: régua de colunas e os acentos que mais dão problema. */
export function linhasDeTeste(papel: Papel, colunas: number = COLUNAS[papel]): LinhaComanda[] {
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
