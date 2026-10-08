"use client";

import { COLUNAS, type LinhaComanda, type Papel } from "@/domain/pedidos/comanda";

/**
 * Envia linhas de texto à impressora padrão do sistema operacional
 * (D-2026-10-08-116).
 *
 * O documento é montado num iframe escondido e impresso de lá: o papel sai só
 * com o documento, sem herdar nada do CSS do painel, e a página em uso não
 * pisca.
 *
 * SEM JANELA DE ESCOLHA só quando o navegador foi aberto com
 * `--kiosk-printing` (o atalho do balcão, explicado em Configurações →
 * Impressora). Sem ele, o navegador mostra a janela de impressão — que é o
 * que um site comum pode fazer, por segurança.
 *
 * O QUE ESTA FUNÇÃO NÃO SABE: se o papel saiu. O navegador só diz que
 * entregou ao sistema. Quem confirma é a pessoa que olhou para a impressora.
 */

/** Área imprimível típica: 48 mm no papel de 58, 72 mm no de 80. */
const AREA_UTIL_MM: Record<Papel, number> = { "58": 48, "80": 72 };

function escapar(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function montarHtml(linhas: LinhaComanda[], papel: Papel): string {
  const util = AREA_UTIL_MM[papel];
  const margem = (Number(papel) - util) / 2;
  // Courier New avança 0,6 em por caractere. O divisor um pouco maior deixa
  // ~3% de folga: uma fonte substituta levemente mais larga não corta a
  // última coluna.
  const fonte = (util / COLUNAS[papel] / 0.62).toFixed(3);

  const corpo = linhas
    .map((l) => {
      const classe = l.estilo === "titulo" || l.estilo === "destaque" ? ' class="b"' : "";
      return `<div${classe}>${l.texto === "" ? "&nbsp;" : escapar(l.texto)}</div>`;
    })
    .join("");

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Impressão</title><style>
@page { size: ${papel}mm auto; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; color: #000; }
body { width: ${papel}mm; padding: 2mm ${margem}mm 6mm; box-sizing: border-box;
  font-family: "Courier New", Courier, monospace; font-size: ${fonte}mm; line-height: 1.3; }
div { white-space: pre; overflow: hidden; }
.b { font-weight: 700; }
</style></head><body>${corpo}</body></html>`;
}

export function imprimirLinhas(linhas: LinhaComanda[], papel: Papel): Promise<void> {
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

    quadro.srcdoc = montarHtml(linhas, papel);
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
  ];
}
