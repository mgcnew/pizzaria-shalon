import { formatarCelula, nomeDoArquivo } from "./formato";
import type { Arquivo, Relatorio } from "./tipos";

/**
 * Escritor de PDF mínimo, em Helvetica.
 *
 * POR QUE À MÃO: o relatório é uma tabela de texto paginada. Isso são cerca
 * de cem linhas de PDF cru; uma biblioteca de PDF pesa megabytes e traz um
 * motor de layout que este projeto não usaria (CLAUDE.md §44).
 *
 * As fontes-padrão do PDF usam WinAnsiEncoding, que cobre o português
 * inteiro — acento, cedilha e til saem corretos porque o texto é gravado em
 * latin-1, não em UTF-8.
 */

const LARGURA = 842; // A4 deitado: tabela cabe sem espremer coluna.
const ALTURA = 595;
const MARGEM = 36;
const LINHA = 14;

/**
 * WinAnsi NÃO é latin-1 na faixa 0x80–0x9F.
 *
 * É onde moram justamente os caracteres que ESTE sistema produz sozinho: o
 * travessão que marca nulo ("—", RN dos relatórios: nulo não vira zero) e as
 * reticências que marcam célula cortada ("…"). Tratados como "acima de 0xFF,
 * vira ?", todo relatório em PDF sairia com "?" onde a tela mostra "—".
 *
 * A tabela cobre a faixa inteira que o português e a nossa formatação usam.
 * Fora dela — emoji, por exemplo — o "?" continua sendo a resposta honesta:
 * a fonte-padrão do PDF não tem aquele glifo.
 */
const WINANSI: Record<number, number> = {
  0x20ac: 0x80, // €
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85, // … corte de célula
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92, // aspa simples tipográfica
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96, // – meia-risca
  0x2014: 0x97, // — travessão: marcador de nulo
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
};

function paraLatin1(texto: string): Uint8Array {
  const saida = new Uint8Array(texto.length);
  for (let i = 0; i < texto.length; i += 1) {
    const c = texto.charCodeAt(i);
    saida[i] = c <= 0xff ? c : (WINANSI[c] ?? 0x3f);
  }
  return saida;
}

function escaparPdf(texto: string): string {
  return texto.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** Corta o texto para caber na largura da coluna, sem estourar a célula. */
function cortar(texto: string, largura: number, tamanho: number): string {
  const porCaractere = tamanho * 0.5; // Helvetica, aproximação suficiente
  const cabe = Math.max(1, Math.floor(largura / porCaractere));
  return texto.length <= cabe ? texto : `${texto.slice(0, Math.max(1, cabe - 1))}…`;
}

type Comando = { texto: string; x: number; y: number; tamanho: number; negrito: boolean };

function paginaParaFluxo(comandos: Comando[]): string {
  const partes: string[] = [];
  for (const c of comandos) {
    partes.push(
      `BT /${c.negrito ? "F2" : "F1"} ${c.tamanho} Tf ${c.x} ${c.y} Td (${escaparPdf(c.texto)}) Tj ET`,
    );
  }
  return partes.join("\n");
}

export function gerarPdf(relatorio: Relatorio): Arquivo {
  const colunas = relatorio.colunas;
  const util = LARGURA - MARGEM * 2;
  const largura = util / Math.max(1, colunas.length);

  const paginas: Comando[][] = [];
  let atual: Comando[] = [];
  let y = ALTURA - MARGEM;

  const cabecalhoDaTabela = () => {
    colunas.forEach((coluna, i) => {
      atual.push({
        texto: cortar(coluna.rotulo, largura - 4, 9),
        x: MARGEM + i * largura,
        y,
        tamanho: 9,
        negrito: true,
      });
    });
    y -= LINHA;
  };

  const abrirPagina = (primeira: boolean) => {
    atual = [];
    y = ALTURA - MARGEM;

    if (primeira) {
      atual.push({ texto: relatorio.titulo, x: MARGEM, y, tamanho: 14, negrito: true });
      y -= LINHA + 4;
      atual.push({
        texto: `Período: ${relatorio.periodo.rotulo}`,
        x: MARGEM,
        y,
        tamanho: 10,
        negrito: false,
      });
      y -= LINHA;
      // A ressalva vai no documento, não só na tela.
      for (const ressalva of relatorio.ressalvas) {
        atual.push({
          texto: cortar(ressalva, util, 8),
          x: MARGEM,
          y,
          tamanho: 8,
          negrito: false,
        });
        y -= LINHA - 3;
      }
      if (relatorio.truncado) {
        atual.push({
          texto: `Atenção: lista limitada às primeiras ${relatorio.limite} linhas.`,
          x: MARGEM,
          y,
          tamanho: 8,
          negrito: true,
        });
        y -= LINHA - 3;
      }
      y -= 6;
    } else {
      atual.push({
        texto: `${relatorio.titulo} (continuação)`,
        x: MARGEM,
        y,
        tamanho: 10,
        negrito: true,
      });
      y -= LINHA + 4;
    }
    cabecalhoDaTabela();
  };

  abrirPagina(true);

  for (const linha of relatorio.linhas) {
    if (y < MARGEM + LINHA * 2) {
      paginas.push(atual);
      abrirPagina(false);
    }
    colunas.forEach((coluna, i) => {
      atual.push({
        texto: cortar(formatarCelula(linha[coluna.chave], coluna.tipo), largura - 4, 8),
        x: MARGEM + i * largura,
        y,
        tamanho: 8,
        negrito: false,
      });
    });
    y -= LINHA - 2;
  }

  const totais = Object.entries(relatorio.totais ?? {});
  if (totais.length > 0) {
    if (y < MARGEM + LINHA * (totais.length + 2)) {
      paginas.push(atual);
      abrirPagina(false);
    }
    y -= 6;
    for (const [chave, valor] of totais) {
      const coluna = colunas.find((c) => c.chave === chave);
      atual.push({
        texto: `${coluna?.rotulo ?? chave}: ${formatarCelula(valor, coluna?.tipo ?? "numero")}`,
        x: MARGEM,
        y,
        tamanho: 9,
        negrito: true,
      });
      y -= LINHA - 2;
    }
  }
  paginas.push(atual);

  // ------------------------------------------------------------- objetos
  const objetos: string[] = [];
  const idFonteNormal = 3 + paginas.length * 2;
  const idFonteNegrito = idFonteNormal + 1;

  objetos.push("<< /Type /Catalog /Pages 2 0 R >>");
  const idsPaginas = paginas.map((_, i) => `${3 + i * 2} 0 R`).join(" ");
  objetos.push(
    `<< /Type /Pages /Kids [${idsPaginas}] /Count ${paginas.length} >>`,
  );

  paginas.forEach((comandos, i) => {
    const fluxo = paginaParaFluxo(comandos);
    objetos.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${LARGURA} ${ALTURA}] ` +
        `/Resources << /Font << /F1 ${idFonteNormal} 0 R /F2 ${idFonteNegrito} 0 R >> >> ` +
        `/Contents ${4 + i * 2} 0 R >>`,
    );
    objetos.push(`<< /Length ${paraLatin1(fluxo).length} >>\nstream\n${fluxo}\nendstream`);
  });

  objetos.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  objetos.push(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  );

  let pdf = "%PDF-1.4\n";
  const posicoes: number[] = [];
  objetos.forEach((corpo, i) => {
    posicoes.push(paraLatin1(pdf).length);
    pdf += `${i + 1} 0 obj\n${corpo}\nendobj\n`;
  });

  const inicioXref = paraLatin1(pdf).length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const posicao of posicoes) {
    pdf += `${String(posicao).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`;

  return {
    nome: nomeDoArquivo(relatorio.tipo, relatorio.periodo.de, relatorio.periodo.ate, "pdf"),
    tipoConteudo: "application/pdf",
    bytes: paraLatin1(pdf),
  };
}
