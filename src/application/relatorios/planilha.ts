import { deflateRawSync } from "node:zlib";
import { formatarCelula, nomeDoArquivo, valorDeCelula } from "./formato";
import type { Arquivo, Relatorio } from "./tipos";

/**
 * Escritor de .xlsx mínimo.
 *
 * POR QUE À MÃO: um .xlsx é um ZIP com cinco arquivos XML. Escrever esses
 * cinco custa menos que adicionar uma biblioteca de planilha ao bundle e
 * passar a manter a atualização dela (CLAUDE.md §44). O que geramos é um
 * arquivo válido para Excel, LibreOffice e Google Sheets.
 *
 * Número vai como NÚMERO, não como texto: quem abrir a planilha consegue
 * somar a coluna. Texto vai como `inlineStr`, o que dispensa a tabela de
 * strings compartilhadas e mantém o arquivo legível.
 */

// -------------------------------------------------------------------- ZIP
const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(dados: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of dados) c = TABELA_CRC[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

type Entrada = { nome: string; dados: Uint8Array };

/**
 * ZIP sem diretórios, sem senha e sem data real (tudo em 1980-01-01), o que
 * torna o arquivo determinístico — dois exports do mesmo relatório produzem
 * bytes iguais, e isso é testável.
 */
function zipar(entradas: Entrada[]): Uint8Array {
  const locais: Uint8Array[] = [];
  const centrais: Uint8Array[] = [];
  let deslocamento = 0;

  for (const entrada of entradas) {
    const nome = new TextEncoder().encode(entrada.nome);
    const comprimido = new Uint8Array(deflateRawSync(entrada.dados));
    const crc = crc32(entrada.dados);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0, true);
    local.setUint16(8, 8, true); // deflate
    local.setUint16(10, 0, true);
    local.setUint16(12, 0x21, true); // 1980-01-01
    local.setUint32(14, crc, true);
    local.setUint32(18, comprimido.length, true);
    local.setUint32(22, entrada.dados.length, true);
    local.setUint16(26, nome.length, true);
    local.setUint16(28, 0, true);

    const blocoLocal = new Uint8Array(30 + nome.length + comprimido.length);
    blocoLocal.set(new Uint8Array(local.buffer), 0);
    blocoLocal.set(nome, 30);
    blocoLocal.set(comprimido, 30 + nome.length);
    locais.push(blocoLocal);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0, true);
    central.setUint16(10, 8, true);
    central.setUint16(12, 0, true);
    central.setUint16(14, 0x21, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, comprimido.length, true);
    central.setUint32(24, entrada.dados.length, true);
    central.setUint16(28, nome.length, true);
    central.setUint32(42, deslocamento, true);

    const blocoCentral = new Uint8Array(46 + nome.length);
    blocoCentral.set(new Uint8Array(central.buffer), 0);
    blocoCentral.set(nome, 46);
    centrais.push(blocoCentral);

    deslocamento += blocoLocal.length;
  }

  const tamanhoCentral = centrais.reduce((s, b) => s + b.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true);
  fim.setUint16(8, entradas.length, true);
  fim.setUint16(10, entradas.length, true);
  fim.setUint32(12, tamanhoCentral, true);
  fim.setUint32(16, deslocamento, true);

  const total =
    locais.reduce((s, b) => s + b.length, 0) + tamanhoCentral + 22;
  const saida = new Uint8Array(total);
  let p = 0;
  for (const b of locais) {
    saida.set(b, p);
    p += b.length;
  }
  for (const b of centrais) {
    saida.set(b, p);
    p += b.length;
  }
  saida.set(new Uint8Array(fim.buffer), p);
  return saida;
}

// -------------------------------------------------------------------- XML
function escaparXml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function letraDaColuna(indice: number): string {
  let n = indice + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function celulaTexto(ref: string, texto: string): string {
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escaparXml(texto)}</t></is></c>`;
}

function celulaNumero(ref: string, valor: number): string {
  return `<c r="${ref}"><v>${valor}</v></c>`;
}

export function gerarXlsx(relatorio: Relatorio): Arquivo {
  const linhasXml: string[] = [];
  let n = 1;

  const linhaDeTexto = (textos: string[]) => {
    const celulas = textos
      .map((t, i) => (t === "" ? "" : celulaTexto(`${letraDaColuna(i)}${n}`, t)))
      .join("");
    linhasXml.push(`<row r="${n}">${celulas}</row>`);
    n += 1;
  };

  // O cabeçalho explicativo viaja junto com os números.
  linhaDeTexto([relatorio.titulo]);
  linhaDeTexto([`Período: ${relatorio.periodo.rotulo}`]);
  for (const ressalva of relatorio.ressalvas) linhaDeTexto([ressalva]);
  if (relatorio.truncado) {
    linhaDeTexto([`Atenção: lista limitada às primeiras ${relatorio.limite} linhas.`]);
  }
  linhaDeTexto([]);

  linhaDeTexto(relatorio.colunas.map((c) => c.rotulo));

  for (const linha of relatorio.linhas) {
    const celulas = relatorio.colunas
      .map((coluna, i) => {
        const ref = `${letraDaColuna(i)}${n}`;
        const { texto, numero } = valorDeCelula(linha, coluna);
        return numero === null ? celulaTexto(ref, texto) : celulaNumero(ref, numero);
      })
      .join("");
    linhasXml.push(`<row r="${n}">${celulas}</row>`);
    n += 1;
  }

  const totais = Object.entries(relatorio.totais ?? {});
  if (totais.length > 0) {
    linhaDeTexto([]);
    for (const [chave, valor] of totais) {
      const coluna = relatorio.colunas.find((c) => c.chave === chave);
      linhaDeTexto([
        coluna?.rotulo ?? chave,
        formatarCelula(valor, coluna?.tipo ?? "numero"),
      ]);
    }
  }

  const texto = (s: string) => new TextEncoder().encode(s);

  const planilha = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${linhasXml.join("")}</sheetData></worksheet>`;

  const arquivos: Entrada[] = [
    {
      nome: "[Content_Types].xml",
      dados: texto(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`),
    },
    {
      nome: "_rels/.rels",
      dados: texto(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    },
    {
      nome: "xl/workbook.xml",
      dados: texto(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Relatório" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    },
    {
      nome: "xl/_rels/workbook.xml.rels",
      dados: texto(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`),
    },
    { nome: "xl/worksheets/sheet1.xml", dados: texto(planilha) },
  ];

  return {
    nome: nomeDoArquivo(relatorio.tipo, relatorio.periodo.de, relatorio.periodo.ate, "xlsx"),
    tipoConteudo:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    bytes: zipar(arquivos),
  };
}
