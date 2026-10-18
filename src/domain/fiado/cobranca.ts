import { formatBRL } from "@/lib/format";

/**
 * Mensagem de cobrança do fiado pelo WhatsApp (D-2026-10-17-153).
 *
 * Manual, como o remarketing: o sistema só abre o WhatsApp com o texto
 * pronto e educado; quem envia é a pessoa da loja.
 */

export type FiadoParaCobrar = { numero: number; em_aberto: number; desde: string };

const dia = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "America/Sao_Paulo",
});

function primeiroNome(nome: string): string {
  const n = nome.trim().split(/\s+/)[0] ?? "";
  return n ? n.charAt(0).toUpperCase() + n.slice(1) : "";
}

export function mensagemDeCobranca(nome: string, fiados: FiadoParaCobrar[]): string {
  const saudacao = primeiroNome(nome) ? `Oi, ${primeiroNome(nome)}! Tudo bem?` : "Oi! Tudo bem?";
  const total = fiados.reduce((soma, f) => soma + Number(f.em_aberto), 0);
  if (fiados.length === 1) {
    const f = fiados[0]!;
    return (
      `${saudacao} Aqui é da Pizzaria Shalon. Passando para lembrar do pedido #${f.numero}, ` +
      `de ${dia.format(new Date(f.desde))}, no valor de ${formatBRL(Number(f.em_aberto))}, ` +
      `que ficou para pagar depois. Quando puder, é só nos avisar por aqui. Obrigado!`
    );
  }
  const lista = fiados
    .map((f) => `#${f.numero} (${dia.format(new Date(f.desde))}, ${formatBRL(Number(f.em_aberto))})`)
    .join(", ");
  return (
    `${saudacao} Aqui é da Pizzaria Shalon. Passando para lembrar dos pedidos ${lista}, ` +
    `que ficaram para pagar depois, somando ${formatBRL(total)}. ` +
    `Quando puder, é só nos avisar por aqui. Obrigado!`
  );
}

/** Link `wa.me` com o texto; acrescenta o 55 quando o número veio sem ele. */
export function linkDoWhatsApp(telefone: string, texto: string): string | null {
  let d = telefone.replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (d.length < 12) return null;
  return `https://wa.me/${d}?text=${encodeURIComponent(texto)}`;
}
