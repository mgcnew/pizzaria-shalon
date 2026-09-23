import type { Coluna, Linha, TipoDeColuna } from "./tipos";

/**
 * Como cada valor vira texto.
 *
 * Um lugar só, usado pela tela e pelos três exportadores — porque a diferença
 * mais cara de um relatório é a planilha dizer 1.234,50 onde a tela dizia
 * R$ 1.234,50 e alguém somar as duas coisas achando que são a mesma.
 *
 * Nulo NUNCA vira zero. Ticket médio sem pedido é "—", não "R$ 0,00": zero
 * afirmaria que o ticket foi zero, que é outra coisa.
 */

const NUMERO = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const SO_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

export function formatarData(valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "—";

  // "2026-09-17" já é uma data de negócio, calculada no fuso da loja pelo
  // banco. Passar isso por `new Date()` a interpretaria como meia-noite UTC
  // e a exibiria como 16/09 — um dia inteiro a menos no relatório.
  const partes = SO_DATA.exec(String(valor));
  if (partes) return `${partes[3]}/${partes[2]}/${partes[1]}`;

  const d = new Date(String(valor));
  if (Number.isNaN(d.getTime())) return String(valor);
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export function formatarDataHora(valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  const d = new Date(String(valor));
  if (Number.isNaN(d.getTime())) return String(valor);
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatarDinheiro(valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  const n = Number(valor);
  if (!Number.isFinite(n)) return "—";
  return `R$ ${NUMERO.format(n)}`;
}

export function formatarCelula(valor: unknown, tipo: TipoDeColuna): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  switch (tipo) {
    case "dinheiro":
      return formatarDinheiro(valor);
    case "data":
      return formatarData(valor);
    case "datahora":
      return formatarDataHora(valor);
    case "percentual": {
      const n = Number(valor);
      return Number.isFinite(n) ? `${NUMERO.format(n)}%` : "—";
    }
    case "numero": {
      const n = Number(valor);
      if (!Number.isFinite(n)) return String(valor);
      return Number.isInteger(n) ? String(n) : NUMERO.format(n);
    }
    default:
      return String(valor);
  }
}

/** O valor bruto para a planilha: número continua número, e o Excel formata. */
export function valorDeCelula(
  linha: Linha,
  coluna: Coluna,
): { texto: string; numero: number | null } {
  const bruto = linha[coluna.chave] ?? null;
  const numerico =
    (coluna.tipo === "dinheiro" || coluna.tipo === "numero" || coluna.tipo === "percentual") &&
    bruto !== null &&
    bruto !== "" &&
    Number.isFinite(Number(bruto))
      ? Number(bruto)
      : null;
  return { texto: formatarCelula(bruto, coluna.tipo), numero: numerico };
}

/** Nome do arquivo: tipo + período, sem espaço nem acento. */
export function nomeDoArquivo(tipo: string, de: string, ate: string, extensao: string): string {
  const limpo = tipo.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/gi, "-");
  return `${limpo}-${de}-a-${ate}.${extensao}`;
}
