/**
 * Carrinho local.
 *
 * 04-REGRAS-NEGOCIO.md RN-CART-001 a RN-CART-005 · 01-DOCUMENTO-MESTRE.md §79.9
 *
 * Domínio puro: sem React, sem rede, sem `localStorage`. Só as regras.
 *
 * O QUE ESTE MÓDULO **NÃO** FAZ: calcular preço. O `precoUnitario` guardado
 * aqui é o que o servidor devolveu quando o item foi montado — é o valor
 * VISTO, para comparação na revalidação, nunca autoridade (CLAUDE.md §16).
 */

export type ItemCarrinho = {
  /** Identidade da configuração. Duas linhas com a mesma chave são a mesma coisa. */
  linha: string;
  produtoId: string;
  produtoSlug: string;
  nome: string;
  variacaoId: string | null;
  sabores: string[];
  bordaId: string | null;
  adicionais: string[];
  observacao: string;
  quantidade: number;
  /** Preço unitário que o servidor devolveu ao montar. Não é autoridade. */
  precoUnitario: number;
  rotulos: string[];
  /** Limite por pedido vindo do servidor; nulo quando não há. */
  limite: number | null;
};

export type Carrinho = {
  itens: ItemCarrinho[];
  /** Instante da última alteração relevante, em ms. Base do TTL. */
  atualizadoEm: number;
};

/** RN-CART-001: 24 horas desde a última alteração relevante. */
export const TTL_MS = 24 * 60 * 60 * 1000;

export const CARRINHO_VAZIO: Carrinho = { itens: [], atualizadoEm: 0 };

/**
 * Identidade de uma configuração (RN-CART-004).
 *
 * "Diferença de tamanho, sabores, borda, adicionais ou observação gera linha
 * distinta." Sabores e adicionais são ordenados antes de compor a chave:
 * escolher Calabresa e depois Portuguesa é a mesma pizza que o contrário.
 *
 * A observação entra normalizada — espaço a mais não deveria criar linha nova,
 * mas texto diferente sim.
 */
export function chaveDaConfiguracao(
  item: Pick<
    ItemCarrinho,
    "produtoId" | "variacaoId" | "sabores" | "bordaId" | "adicionais" | "observacao"
  >,
): string {
  return [
    item.produtoId,
    item.variacaoId ?? "-",
    [...item.sabores].sort().join("+") || "-",
    item.bordaId ?? "-",
    [...item.adicionais].sort().join("+") || "-",
    item.observacao.trim().replace(/\s+/g, " ").toLowerCase() || "-",
  ].join("|");
}

/** RN-CART-002: toda alteração relevante renova o TTL. */
function tocar(itens: ItemCarrinho[], agora: number): Carrinho {
  return { itens, atualizadoEm: agora };
}

/**
 * Adiciona um item.
 *
 * Configuração idêntica soma quantidade na mesma linha; qualquer diferença
 * cria linha nova (RN-CART-004). O limite por pedido, quando existe, corta a
 * soma — e o servidor recusa de novo na revalidação (RN-CART-005).
 */
export function adicionarItem(
  carrinho: Carrinho,
  novo: Omit<ItemCarrinho, "linha">,
  agora: number,
): Carrinho {
  const chave = chaveDaConfiguracao(novo);
  const existente = carrinho.itens.find((i) => i.linha === chave);

  if (!existente) {
    return tocar([...carrinho.itens, { ...novo, linha: chave }], agora);
  }

  const somada = existente.quantidade + novo.quantidade;
  const limite = novo.limite ?? existente.limite;
  const quantidade = limite === null ? somada : Math.min(somada, limite);

  return tocar(
    carrinho.itens.map((i) =>
      i.linha === chave
        ? { ...i, quantidade, precoUnitario: novo.precoUnitario, rotulos: novo.rotulos }
        : i,
    ),
    agora,
  );
}

/** Quantidade zero ou menos remove a linha — é o que o botão "−" faz no design. */
export function alterarQuantidade(
  carrinho: Carrinho,
  linha: string,
  quantidade: number,
  agora: number,
): Carrinho {
  if (quantidade <= 0) return removerItem(carrinho, linha, agora);

  return tocar(
    carrinho.itens.map((i) => {
      if (i.linha !== linha) return i;
      const limitada = i.limite === null ? quantidade : Math.min(quantidade, i.limite);
      return { ...i, quantidade: limitada };
    }),
    agora,
  );
}

export function removerItem(carrinho: Carrinho, linha: string, agora: number): Carrinho {
  const itens = carrinho.itens.filter((i) => i.linha !== linha);
  return tocar(itens, agora);
}

export function limpar(agora: number): Carrinho {
  return { itens: [], atualizadoEm: agora };
}

/** Soma do que o cliente está vendo. O total que vale é o do servidor. */
export function subtotalVisto(carrinho: Carrinho): number {
  const centavos = carrinho.itens.reduce(
    (soma, i) => soma + Math.round(i.precoUnitario * 100) * i.quantidade,
    0,
  );
  return centavos / 100;
}

export function totalDeItens(carrinho: Carrinho): number {
  return carrinho.itens.reduce((soma, i) => soma + i.quantidade, 0);
}

/**
 * RN-CART-001: expira 24h depois da última alteração relevante.
 *
 * Carrinho vazio nunca "expira" — não há o que descartar, e avisar sobre
 * isso seria ruído.
 */
export function expirado(carrinho: Carrinho, agora: number): boolean {
  if (carrinho.itens.length === 0) return false;
  return agora - carrinho.atualizadoEm >= TTL_MS;
}

/**
 * Lê o que estava guardado no navegador.
 *
 * Conteúdo de `localStorage` é entrada não confiável como qualquer outra
 * (CLAUDE.md §36): pode ter sido editado à mão, ter vindo de uma versão
 * anterior do app ou estar corrompido. Qualquer coisa fora do formato vira
 * carrinho vazio, sem exceção e sem tela quebrada.
 */
export function lerCarrinho(bruto: unknown, agora: number): Carrinho {
  if (typeof bruto !== "object" || bruto === null) return CARRINHO_VAZIO;

  const obj = bruto as Record<string, unknown>;
  const atualizadoEm = typeof obj["atualizadoEm"] === "number" ? obj["atualizadoEm"] : 0;
  if (!Array.isArray(obj["itens"])) return CARRINHO_VAZIO;

  const itens: ItemCarrinho[] = [];
  for (const cru of obj["itens"] as unknown[]) {
    const item = lerItem(cru);
    if (item) itens.push(item);
  }

  const carrinho: Carrinho = { itens, atualizadoEm };
  // Descarte previsível: passou o TTL, some inteiro. Não se guarda meio
  // carrinho nem se renova o prazo na leitura.
  if (expirado(carrinho, agora)) return CARRINHO_VAZIO;
  return carrinho;
}

function lerItem(cru: unknown): ItemCarrinho | null {
  if (typeof cru !== "object" || cru === null) return null;
  const o = cru as Record<string, unknown>;

  const texto = (k: string): string | null =>
    typeof o[k] === "string" && o[k] !== "" ? (o[k] as string) : null;
  const lista = (k: string): string[] =>
    Array.isArray(o[k]) ? (o[k] as unknown[]).filter((v): v is string => typeof v === "string") : [];

  const produtoId = texto("produtoId");
  const nome = texto("nome");
  const quantidade = typeof o["quantidade"] === "number" ? Math.floor(o["quantidade"]) : 0;
  const precoUnitario = typeof o["precoUnitario"] === "number" ? o["precoUnitario"] : NaN;

  if (!produtoId || !nome || quantidade < 1 || !Number.isFinite(precoUnitario) || precoUnitario < 0) {
    return null;
  }

  const base = {
    produtoId,
    produtoSlug: texto("produtoSlug") ?? "",
    nome,
    variacaoId: texto("variacaoId"),
    sabores: lista("sabores"),
    bordaId: texto("bordaId"),
    adicionais: lista("adicionais"),
    observacao: typeof o["observacao"] === "string" ? o["observacao"] : "",
    quantidade,
    precoUnitario,
    rotulos: lista("rotulos"),
    limite: typeof o["limite"] === "number" ? o["limite"] : null,
  };

  // A chave é sempre recalculada: se o arquivo guardado trouxer uma linha
  // divergente da configuração, quem manda é a configuração.
  return { ...base, linha: chaveDaConfiguracao(base) };
}

/** Formato que o servidor espera para montar/revalidar. Sem preço como autoridade. */
export function paraRevalidacao(carrinho: Carrinho) {
  return carrinho.itens.map((i) => ({
    linha: i.linha,
    produto_id: i.produtoId,
    variacao_id: i.variacaoId,
    sabores: i.sabores,
    borda_id: i.bordaId,
    adicionais: i.adicionais,
    observacao: i.observacao,
    quantidade: i.quantidade,
    preco_unitario_visto: i.precoUnitario,
  }));
}
