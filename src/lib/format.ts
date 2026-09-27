/**
 * Formatação de apresentação.
 *
 * ATENÇÃO: isto NÃO é regra de negócio. Não calcula preço, desconto, taxa
 * nem total — apenas formata um número já calculado. O cálculo comercial é
 * autoridade do servidor (CLAUDE.md §16) e será implementado em src/domain
 * nas fases correspondentes.
 */

/** Formata um valor em reais no padrão usado no design: `R$ 62,90`. */
export function formatBRL(value: number): string {
  const arredondado = Math.round(value * 100) / 100;
  return `R$ ${arredondado.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Máscara de WhatsApp conforme o checkout do design: `(11) 98812-4477`. */
export function maskWhatsApp(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/**
 * Há quanto tempo, em texto de balcão: `agora`, `38 min`, `2 h`, `2 h 15 min`.
 *
 * UMA função para as duas telas. O PDV já formatava assim numa `idade()`
 * privada; a fila de Pedidos precisava do mesmo texto, e duas cópias da mesma
 * regra de arredondamento divergem no dia em que alguém ajusta uma só.
 *
 * Minutos negativos viram `agora`: relógio de servidor e `created_at` podem
 * discordar por frações de segundo, e "há -1 min" é pior do que impreciso.
 */
export function formatarEspera(minutos: number): string {
  if (!Number.isFinite(minutos) || minutos < 1) return "agora";
  const inteiros = Math.floor(minutos);
  if (inteiros < 60) return `${inteiros} min`;
  const h = Math.floor(inteiros / 60);
  const m = inteiros % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/**
 * Minutos decorridos desde um instante ISO, ancorado num "agora" recebido.
 *
 * O `agora` VEM DE FORA de propósito: no servidor é o relógio do servidor; no
 * navegador é um valor que avança sozinho. Nenhum dos dois é lido aqui dentro,
 * e por isso a função é pura e testável — data fixa entra, número sai.
 */
export function minutosDesde(iso: string, agora: number): number {
  const inicio = new Date(iso).getTime();
  if (Number.isNaN(inicio)) return 0;
  return (agora - inicio) / 60_000;
}
