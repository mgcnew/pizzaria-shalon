import { formatBRL } from "@/lib/format";
import { LARGURA, ladoALado, quebrar, type LinhaComanda } from "@/domain/pedidos/comanda";

/**
 * Cupom do PDV, segunda via e fechamento de caixa em linhas de texto
 * (D-2026-10-08-116), para a impressora Bluetooth direta, que fala ESC/POS e
 * não entende HTML.
 *
 * O CONTEÚDO É O MESMO das versões em HTML (`NovaVenda`, `HistoricoDeVendas`,
 * `PainelDoCaixa`): este módulo não decide nada de dinheiro, só organiza em
 * colunas valores que o servidor já calculou (CLAUDE.md §16). Determinístico,
 * como a comanda: mesmas entradas, mesmas linhas.
 *
 * Não fiscal (CLAUDE.md §32): todo cupom diz isso no topo.
 */

const VAZIO: LinhaComanda = { texto: "", estilo: "vazio" };

function separador(largura: number): LinhaComanda {
  return { texto: "-".repeat(largura), estilo: "separador" };
}

function centro(texto: string, largura: number, estilo: LinhaComanda["estilo"] = "normal"): LinhaComanda {
  const t = texto.slice(0, largura);
  return { texto: " ".repeat(Math.floor((largura - t.length) / 2)) + t, estilo };
}

/**
 * Descrição à esquerda e valor à direita. Se a descrição não cabe, ela
 * quebra e o valor vai na última linha — ou numa linha só dele, alinhado à
 * direita. O valor nunca é cortado.
 */
function comValor(
  descricao: string,
  valor: string,
  largura: number,
  estilo: LinhaComanda["estilo"] = "normal",
): LinhaComanda[] {
  if (descricao.length + 1 + valor.length <= largura) {
    return [{ texto: ladoALado(descricao, valor, largura), estilo }];
  }
  const partes = quebrar(descricao, largura);
  const ultima = partes.pop() ?? "";
  const saida = partes.map((texto) => ({ texto, estilo }));
  if (ultima.length + 1 + valor.length <= largura) {
    saida.push({ texto: ladoALado(ultima, valor, largura), estilo });
  } else {
    saida.push({ texto: ultima, estilo }, { texto: valor.padStart(largura), estilo });
  }
  return saida;
}

function texto(t: string, largura: number, estilo: LinhaComanda["estilo"] = "normal"): LinhaComanda[] {
  return quebrar(t, largura).map((linha) => ({ texto: linha, estilo }));
}

// ------------------------------------------------------- cupom de venda

export type ItemDoCupom = {
  quantidade: number;
  nome: string;
  total: number;
  detalhes?: string[];
};

export type CupomDeVenda = {
  numero: number;
  itens: ItemDoCupom[];
  total: number;
  /** Forma(s) de pagamento, já em texto. */
  pagamento: string;
  /** Já formatada por quem chama. */
  data?: string | null;
  cliente?: string | null;
  recebido?: number | null;
  troco?: number | null;
  segundaVia?: boolean;
  estornado?: boolean;
  /** Convite para o app no fim do cupom: chamada, QR e endereço por extenso. */
  convite?: { url: string; endereco: string; chamada: string; instrucao: string };
};

export function montarCupomDeVenda(cupom: CupomDeVenda, largura: number = LARGURA): LinhaComanda[] {
  const saida: LinhaComanda[] = [
    centro("PIZZARIA SHALON", largura, "titulo"),
    centro("COMPROVANTE NAO FISCAL", largura),
  ];
  if (cupom.segundaVia) saida.push(centro("*** SEGUNDA VIA ***", largura, "destaque"));
  if (cupom.estornado) saida.push(centro("PAGAMENTO ESTORNADO", largura, "destaque"));

  saida.push(separador(largura), { texto: `VENDA #${cupom.numero}`, estilo: "titulo" });
  if (cupom.data) saida.push({ texto: cupom.data, estilo: "normal" });
  if (cupom.cliente !== undefined) saida.push(...texto(cupom.cliente || "Balcão", largura));
  saida.push(separador(largura));

  for (const item of cupom.itens) {
    saida.push(...comValor(`${item.quantidade}x ${item.nome}`, formatBRL(item.total), largura));
    for (const detalhe of item.detalhes ?? []) saida.push(...texto(`  + ${detalhe}`, largura));
  }

  const quantidade = cupom.itens.reduce((soma, item) => soma + item.quantidade, 0);
  saida.push(separador(largura));
  saida.push(...comValor(`${quantidade} item(ns)`, formatBRL(cupom.total), largura, "titulo"));
  saida.push(...comValor("Pagamento", cupom.pagamento || "—", largura));
  if (cupom.recebido != null) saida.push(...comValor("Recebido", formatBRL(cupom.recebido), largura));
  if (cupom.troco != null) saida.push(...comValor("Troco", formatBRL(cupom.troco), largura));

  saida.push(VAZIO, centro("Obrigado pela preferencia!", largura));

  if (cupom.convite) {
    saida.push(
      separador(largura),
      centro(cupom.convite.chamada, largura, "titulo"),
      { texto: cupom.convite.url, estilo: "qrcode" },
      centro(cupom.convite.instrucao, largura),
      centro(cupom.convite.endereco, largura, "titulo"),
    );
  }
  return saida;
}

// ---------------------------------------------------- fechamento de caixa

export type FechamentoParaImprimir = {
  /** Já formatada por quem chama. */
  data?: string | null;
  contado: number;
  esperado: number;
  diferenca: number;
  recebimentos: { metodo: string; total: number }[];
  movimentos: {
    fundoInicial: number;
    reforcos: number;
    sangrias: number;
    despesas: number;
    entradas: number;
    estornos: number;
    diferencasDeMotoboy: number;
  };
  dinheiroForaDaGaveta: number;
};

export function montarFechamentoDeCaixa(
  f: FechamentoParaImprimir,
  largura: number = LARGURA,
): LinhaComanda[] {
  const saida: LinhaComanda[] = [
    centro("PIZZARIA SHALON", largura, "titulo"),
    centro("FECHAMENTO DE CAIXA", largura, "titulo"),
  ];
  if (f.data) saida.push(centro(`Data ${f.data}`, largura));

  saida.push(separador(largura), { texto: "DINHEIRO DA GAVETA", estilo: "titulo" });
  saida.push(...comValor("Valor contado", formatBRL(f.contado), largura));
  saida.push(...comValor("Valor esperado", formatBRL(f.esperado), largura));
  saida.push(...comValor("Diferença", formatBRL(f.diferenca), largura, "destaque"));

  saida.push(separador(largura), { texto: "RECEBIMENTOS POR FORMA", estilo: "titulo" });
  if (f.recebimentos.length === 0) saida.push(...texto("Nenhum recebimento nesta sessão.", largura));
  for (const r of f.recebimentos) saida.push(...comValor(r.metodo, formatBRL(r.total), largura));

  const m = f.movimentos;
  saida.push(separador(largura), { texto: "MOVIMENTOS DA SESSAO", estilo: "titulo" });
  saida.push(...comValor("Fundo inicial", formatBRL(m.fundoInicial), largura));
  saida.push(...comValor("Reforços", formatBRL(m.reforcos), largura));
  saida.push(...comValor("Sangrias", formatBRL(m.sangrias), largura));
  saida.push(...comValor("Despesas pelo caixa", formatBRL(m.despesas), largura));
  saida.push(...comValor("Entradas pelo caixa", formatBRL(m.entradas), largura));
  saida.push(...comValor("Estornos", formatBRL(m.estornos), largura));
  if (m.diferencasDeMotoboy !== 0) {
    saida.push(...comValor("Diferenças de motoboy", formatBRL(m.diferencasDeMotoboy), largura));
  }

  if (f.dinheiroForaDaGaveta > 0) {
    saida.push(separador(largura));
    saida.push(...comValor("Dinheiro fora da gaveta", formatBRL(f.dinheiroForaDaGaveta), largura, "destaque"));
  }
  saida.push(separador(largura));
  return saida;
}
