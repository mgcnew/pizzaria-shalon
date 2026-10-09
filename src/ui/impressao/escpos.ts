import type { LinhaComanda } from "@/domain/pedidos/comanda";

/**
 * Linhas da comanda → bytes ESC/POS (D-2026-10-08-116, entrega 2).
 *
 * Só o necessário para uma térmica de 58 mm: iniciar, escolher a tabela de
 * caracteres, negrito e avançar papel. Sem corte: a KD-1025, como a maioria
 * das 58 mm, tem serrilha manual — mandar comando de corte para quem não
 * corta às vezes imprime lixo.
 *
 * ACENTOS. Cada impressora barata aceita uma tabela diferente, e o modelo da
 * Shalon não tem ficha técnica. Por isso a tabela é escolhida na
 * configuração, olhando o teste de impressão:
 *   - `cp860` (português) e `cp850` (multilíngue): acentos de verdade;
 *   - `sem-acento`: tira os acentos ("Açúcar" → "Acucar"). Feio, mas
 *     sempre legível — é a saída de emergência.
 * Caractere fora da tabela vira a letra sem acento, ou `?`. Nunca um byte
 * qualquer, que a impressora poderia ler como comando.
 */

export type TabelaDeAcentos = "cp860" | "cp850" | "sem-acento";

// Gerado dos codecs `cp850`/`cp860` do Python, não digitado de memória.
const CP850: Record<string, number> = {
  á: 0xa0, à: 0x85, â: 0x83, ã: 0xc6, é: 0x82, ê: 0x88, í: 0xa1, ó: 0xa2, ô: 0x93, õ: 0xe4,
  ú: 0xa3, ü: 0x81, ç: 0x87, Á: 0xb5, À: 0xb7, Â: 0xb6, Ã: 0xc7, É: 0x90, Ê: 0xd2, Í: 0xd6,
  Ó: 0xe0, Ô: 0xe2, Õ: 0xe5, Ú: 0xe9, Ü: 0x9a, Ç: 0x80, º: 0xa7, ª: 0xa6, "°": 0xf8,
};

const CP860: Record<string, number> = {
  á: 0xa0, à: 0x85, â: 0x83, ã: 0x84, é: 0x82, ê: 0x88, í: 0xa1, ó: 0xa2, ô: 0x93, õ: 0x94,
  ú: 0xa3, ü: 0x81, ç: 0x87, Á: 0x86, À: 0x91, Â: 0x8f, Ã: 0x8e, É: 0x90, Ê: 0x89, Í: 0x8b,
  Ó: 0x9f, Ô: 0x8c, Õ: 0x99, Ú: 0x96, Ü: 0x9a, Ç: 0x80, º: 0xa7, ª: 0xa6, "°": 0xf8,
};

/** Número da tabela no comando `ESC t n`, no padrão Epson. */
const NUMERO_DA_TABELA: Record<Exclude<TabelaDeAcentos, "sem-acento">, number> = {
  cp850: 2,
  cp860: 3,
};

const ESC = 0x1b;
const INICIAR = [ESC, 0x40];
const NEGRITO = (ligado: boolean) => [ESC, 0x45, ligado ? 1 : 0];
const AVANCAR = (linhas: number) => [ESC, 0x64, linhas];
const LF = 0x0a;
const GS = 0x1d;
const ALINHAR = (como: "esquerda" | "centro") => [ESC, 0x61, como === "centro" ? 1 : 0];

/**
 * QR code nativo da impressora (`GS ( k`, modelo 2, padrão Epson). A
 * impressora desenha; nós só mandamos o texto. Quem não conhece o comando
 * costuma ignorá-lo — por isso o endereço sempre vai por extenso embaixo.
 */
function qrNativo(texto: string): number[] {
  const dados = Array.from(texto, (c) => {
    const codigo = c.charCodeAt(0);
    return codigo >= 0x20 && codigo < 0x7f ? codigo : 0x3f;
  });
  const total = dados.length + 3;
  return [
    ...ALINHAR("centro"),
    GS, 0x28, 0x6b, 4, 0, 0x31, 0x41, 0x32, 0x00, // modelo 2
    GS, 0x28, 0x6b, 3, 0, 0x31, 0x43, 8, // módulo de 8 pontos (1 mm)
    GS, 0x28, 0x6b, 3, 0, 0x31, 0x45, 0x30, // correção L: menos módulos, maiores
    GS, 0x28, 0x6b, total & 0xff, total >> 8, 0x31, 0x50, 0x30, ...dados, // guarda
    GS, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30, // imprime
    LF,
    ...ALINHAR("esquerda"),
  ];
}

function semAcento(caractere: string): string {
  return caractere.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Um caractere vira um byte. Nada fora do ASCII imprimível passa cru. */
export function codificarCaractere(caractere: string, tabela: TabelaDeAcentos): number {
  const codigo = caractere.codePointAt(0) ?? 0x3f;
  if (codigo >= 0x20 && codigo < 0x7f) return codigo;

  const mapa = tabela === "cp850" ? CP850 : tabela === "cp860" ? CP860 : null;
  const naTabela = mapa?.[caractere];
  if (naTabela !== undefined) return naTabela;

  const simples = semAcento(caractere);
  const codigoSimples = simples.codePointAt(0) ?? 0x3f;
  if (simples.length === 1 && codigoSimples >= 0x20 && codigoSimples < 0x7f) return codigoSimples;
  return 0x3f; // "?"
}

export function codificarTexto(texto: string, tabela: TabelaDeAcentos): number[] {
  return Array.from(texto, (c) => codificarCaractere(c, tabela));
}

/** Documento inteiro, pronto para mandar à impressora. */
export function montarEscPos(linhas: LinhaComanda[], tabela: TabelaDeAcentos): Uint8Array {
  const bytes: number[] = [...INICIAR];
  if (tabela !== "sem-acento") bytes.push(ESC, 0x74, NUMERO_DA_TABELA[tabela]);

  for (const linha of linhas) {
    if (linha.estilo === "qrcode") {
      bytes.push(...qrNativo(linha.texto));
      continue;
    }
    const forte = linha.estilo === "titulo" || linha.estilo === "destaque";
    if (forte) bytes.push(...NEGRITO(true));
    bytes.push(...codificarTexto(linha.texto, tabela), LF);
    if (forte) bytes.push(...NEGRITO(false));
  }

  // Espaço para destacar o papel na serrilha sem rasgar a última linha.
  bytes.push(...AVANCAR(4));
  return Uint8Array.from(bytes);
}
