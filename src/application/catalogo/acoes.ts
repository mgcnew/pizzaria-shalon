"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import { logger } from "@/lib/logger";
import { gerarSlug } from "@/domain/catalogo/slug";
import { lerValorBR, lerValorOpcionalBR } from "@/domain/catalogo/dinheiro";
import type { EstadoFormulario } from "./tipos";

/**
 * Escrita do catálogo.
 *
 * TRÊS COISAS QUE ESTE ARQUIVO **NÃO** FAZ:
 *  1. não decide autorização — quem decide é o RLS, via `catalog.manage`.
 *     Sem a permissão, o INSERT é recusado e o UPDATE afeta zero linha,
 *     mesmo que alguém chame a action direto;
 *  2. não calcula preço de venda — o cadastro grava o preço digitado; o
 *     preço cobrado é calculado pelo banco (CLAUDE.md §16);
 *  3. não valida invariante que o banco já garante — a constraint é a
 *     autoridade. A validação aqui existe para dar mensagem boa, não para
 *     ser a única barreira.
 */

const ROTA = "/admin/produtos";

function ok(mensagem: string): EstadoFormulario {
  revalidatePath(ROTA);
  revalidatePath("/admin/configuracoes");
  return { ok: mensagem };
}

/**
 * Traduz o erro do Postgres para algo útil, sem vazar estrutura interna
 * (CLAUDE.md §37).
 */
function falha(contexto: string, erro: unknown): EstadoFormulario {
  const e = erro as { code?: string; message?: string; constraint?: string };
  logger.error(`catalogo:${contexto}`, { code: e?.code, constraint: e?.constraint });

  const porConstraint: Record<string, string> = {
    promotions_sem_sobreposicao_variacao:
      "Já existe uma promoção ativa nesse período para o mesmo item (RN-PROMO-004).",
    promotions_sem_sobreposicao_produto:
      "Já existe uma promoção ativa nesse período para o mesmo item (RN-PROMO-004).",
    delivery_fee_bands_sem_sobreposicao:
      "Essa faixa se sobrepõe a outra faixa ativa. Ajuste os limites.",
    products_slug_key: "Já existe um produto com esse endereço (slug).",
    categories_slug_key: "Já existe uma categoria com esse endereço (slug).",
    pizza_sizes_name_key: "Já existe um tamanho com esse nome.",
    crusts_name_key: "Já existe uma borda com esse nome.",
    addons_name_key: "Já existe um adicional com esse nome.",
    product_variants_unica: "Esse produto já tem preço cadastrado nesse tamanho.",
    pizza_sizes_fogazza_um_sabor: "Tamanho de fogazza aceita 1 sabor só.",
    products_escolha_de_sabor:
      "Escolha a categoria dos sabores e o tamanho de fogazza juntos, num produto do tipo Fogazza.",
  };

  const conhecido = e?.constraint ? porConstraint[e.constraint] : undefined;
  if (conhecido) return { erro: conhecido };

  switch (e?.code) {
    case "42501":
      return { erro: "Você não tem permissão para alterar o catálogo." };
    case "23503":
      return {
        erro:
          "Este registro está em uso e não pode ser removido. Inative-o para preservar o histórico.",
      };
    case "23505":
      return { erro: "Já existe um registro com esses dados." };
    case "23514":
      // Mensagens de trigger (RN-COMBO-003, RN-PROMO-003) são escritas para
      // serem lidas por pessoas; passam adiante.
      return { erro: e.message ?? "Dados inválidos para esta operação." };
    default:
      return { erro: "Não foi possível salvar. Verifique os dados e tente novamente." };
  }
}

/** UPDATE sem permissão não dá erro: afeta zero linha. Isso precisa virar erro. */
function conferirLinhas(n: number | null): EstadoFormulario | null {
  if (n === 0) {
    return {
      erro: "Nada foi alterado. Verifique se você tem permissão para gerenciar o catálogo.",
    };
  }
  return null;
}

const texto = z.string().trim().min(1, "Campo obrigatório");

// ---------------------------------------------------------------- categorias
export async function salvarCategoria(
  _estado: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const id = String(form.get("id") ?? "");
  const nome = texto.safeParse(form.get("nome"));
  if (!nome.success) return { erro: "Informe o nome da categoria." };

  const descricao = String(form.get("descricao") ?? "").trim() || null;
  const ordem = Number(form.get("ordem") ?? 0);

  const supabase = await getSupabaseServerClient();
  try {
    if (id) {
      const { error, count } = await supabase
        .from("categories")
        .update({ name: nome.data, description: descricao, sort_order: ordem }, { count: "exact" })
        .eq("id", id);
      if (error) throw error;
      const semLinha = conferirLinhas(count);
      if (semLinha) return semLinha;
      return ok("Categoria atualizada.");
    }

    const { error } = await supabase.from("categories").insert({
      name: nome.data,
      slug: gerarSlug(nome.data),
      description: descricao,
      sort_order: ordem,
    });
    if (error) throw error;
    return ok("Categoria criada.");
  } catch (erro) {
    return falha("salvarCategoria", erro);
  }
}

/**
 * RN-DISP-004: pausar a categoria é operação, não cadastro. Os produtos dela
 * ficam indisponíveis sem que nenhum deles seja alterado — ao despausar,
 * cada um volta ao próprio estado.
 */
export async function alternarPausaCategoria(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  const pausar = String(form.get("pausar")) === "true";
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from("categories")
    .update({
      is_temporarily_available: !pausar,
      temporary_unavailable_note: pausar ? String(form.get("motivo") ?? "") || null : null,
    })
    .eq("id", id);
  if (error) logger.error("catalogo:alternarPausaCategoria", { code: (error as { code?: string }).code });
  revalidatePath(ROTA);
}

export async function alternarAtivoCategoria(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  const ativar = String(form.get("ativar")) === "true";
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from("categories").update({ is_active: ativar }).eq("id", id);
  if (error) logger.error("catalogo:alternarAtivoCategoria", { code: (error as { code?: string }).code });
  revalidatePath(ROTA);
}

// ------------------------------------------------------------------ tamanhos
export async function salvarTamanho(
  _estado: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const id = String(form.get("id") ?? "");
  const nome = texto.safeParse(form.get("nome"));
  if (!nome.success) return { erro: "Informe o nome do tamanho." };

  const fatias = Number(form.get("fatias"));
  const maxSabores = Number(form.get("max_sabores"));
  if (!Number.isInteger(fatias) || fatias <= 0) {
    return { erro: "Informe quantas fatias o tamanho tem." };
  }
  // RN-PIZZA-004: é o tamanho que decide se existe meio a meio.
  if (!Number.isInteger(maxSabores) || maxSabores < 1) {
    return { erro: "O máximo de sabores precisa ser 1 ou mais." };
  }

  // RN-FOG-002: o tamanho de fogazza vende um sabor só. A regra é do banco;
  // aqui ela só evita a Owner digitar um número que seria recusado.
  const vendidoComo = form.get("vendido_como") === "fogazza" ? "fogazza" : "pizza";

  const ordem = Number(form.get("ordem") ?? 0);
  const supabase = await getSupabaseServerClient();
  try {
    const dados = {
      name: nome.data,
      slice_count: fatias,
      max_flavors: vendidoComo === "fogazza" ? 1 : maxSabores,
      sort_order: ordem,
      sold_as: vendidoComo,
    };
    if (id) {
      const { error, count } = await supabase
        .from("pizza_sizes")
        .update(dados, { count: "exact" })
        .eq("id", id);
      if (error) throw error;
      const semLinha = conferirLinhas(count);
      if (semLinha) return semLinha;
      return ok("Tamanho atualizado.");
    }
    const { error } = await supabase.from("pizza_sizes").insert(dados);
    if (error) throw error;
    return ok("Tamanho criado.");
  } catch (erro) {
    return falha("salvarTamanho", erro);
  }
}

export async function alternarAtivoTamanho(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  const ativar = String(form.get("ativar")) === "true";
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from("pizza_sizes").update({ is_active: ativar }).eq("id", id);
  if (error) logger.error("catalogo:alternarAtivoTamanho", { code: (error as { code?: string }).code });
  revalidatePath(ROTA);
}

/**
 * RN-FOG-005: copia os preços de adicionais de um tamanho para outro, de uma
 * vez — "os adicionais da fogazza custam o mesmo da Tradicional". Quem decide
 * a permissão e grava a auditoria é a função do banco.
 */
export async function copiarPrecosDeAdicionais(
  _estado: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const de = String(form.get("de") ?? "");
  const para = String(form.get("para") ?? "");
  if (!de || !para) return { erro: "Escolha de qual tamanho copiar e para qual." };
  if (de === para) return { erro: "Escolha dois tamanhos diferentes." };

  const supabase = await getSupabaseServerClient();
  try {
    const { data, error } = await supabase.rpc("copiar_precos_adicionais", {
      p_de: de,
      p_para: para,
    });
    if (error) throw error;
    const copiados = Number((data as { copiados?: number } | null)?.copiados ?? 0);
    return ok(
      copiados === 0
        ? "O tamanho de origem não tem preço de adicional para copiar."
        : `${copiados} ${copiados === 1 ? "preço copiado" : "preços copiados"}.`,
    );
  } catch (erro) {
    return falha("copiarPrecosDeAdicionais", erro);
  }
}

// ------------------------------------------------------------------ produtos
const TIPOS = ["pizza", "fogazza", "drink", "combo", "other"] as const;

/**
 * Monta o card de fogazza (RN-FOG-003, D-2026-09-30-102): a categoria de
 * onde vêm os sabores e, na mesma operação, quais sabores entram e por
 * quanto. O banco garante o tamanho de fogazza (cria "Fogazza" se não houver)
 * e grava o preço no próprio sabor — `montar_fogazza`, atômica e auditada.
 *
 * A lista de sabores do formulário é a da categoria que estava salva quando
 * a tela abriu (`categoria_da_lista`). Se a pessoa trocou a categoria, a
 * lista é de outra categoria e não vale: salva-se só a troca, e a tela volta
 * com os sabores da categoria nova.
 */
export async function montarFogazza(
  _estado: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const produtoId = String(form.get("produto_id") ?? "");
  const categoria = String(form.get("categoria_sabores_id") ?? "");
  const categoriaDaLista = String(form.get("categoria_da_lista") ?? "");
  if (!produtoId) return { erro: "Produto não informado." };

  const sabores: { produto_id: string; preco: number | null }[] = [];
  if (categoria && categoria === categoriaDaLista) {
    for (const id of form.getAll("sabor").map(String)) {
      const nome = String(form.get(`nome_${id}`) ?? "sabor");
      if (form.get(`entra_${id}`) !== "on") {
        sabores.push({ produto_id: id, preco: null });
        continue;
      }
      const preco = lerValorOpcionalBR(String(form.get(`preco_${id}`) ?? ""));
      if (!preco) return { erro: `Informe o preço de fogazza de ${nome}.` };
      if (!preco.ok) return { erro: `${nome}: ${preco.erro}` };
      if (preco.valor <= 0) return { erro: `O preço de ${nome} precisa ser maior que zero.` };
      sabores.push({ produto_id: id, preco: preco.valor });
    }
  }

  const supabase = await getSupabaseServerClient();
  try {
    const { data, error } = await supabase.rpc("montar_fogazza", {
      p_card_id: produtoId,
      p_categoria_id: categoria || null,
      p_sabores: sabores,
    });
    if (error) throw error;
    revalidatePath(ROTA, "layout");

    const r = data as { fogazza_comum?: boolean; tamanho_criado?: boolean; entram?: number };
    if (r?.fogazza_comum) return ok("Voltou a ser fogazza comum, com preço próprio.");
    if (categoria !== categoriaDaLista) {
      return ok("Categoria salva. Agora marque os sabores que entram e o preço de cada um.");
    }
    const entram = Number(r?.entram ?? 0);
    return ok(
      `${entram} ${entram === 1 ? "sabor à venda" : "sabores à venda"} como fogazza.` +
        (r?.tamanho_criado ? " O tamanho “Fogazza” foi criado." : ""),
    );
  } catch (erro) {
    return falha("montarFogazza", erro);
  }
}

export async function salvarProduto(
  _estado: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const id = String(form.get("id") ?? "");
  const nome = texto.safeParse(form.get("nome"));
  if (!nome.success) return { erro: "Informe o nome do produto." };

  const tipo = String(form.get("tipo") ?? "");
  if (!(TIPOS as readonly string[]).includes(tipo)) {
    return { erro: "Escolha o tipo do produto." };
  }
  const categoriaId = String(form.get("categoria_id") ?? "");
  if (!categoriaId) return { erro: "Escolha a categoria." };

  const precoTexto = String(form.get("preco") ?? "");
  const preco = lerValorOpcionalBR(precoTexto);
  if (preco && !preco.ok) return { erro: preco.erro };

  // RN-COMBO-006: o combo tem preço próprio. Sem ele, o banco recusaria; a
  // mensagem aqui evita que a Owner descubra isso por erro genérico.
  if (tipo === "combo" && !preco) {
    return { erro: "Combo precisa de preço próprio — ele não é a soma dos componentes." };
  }

  const limite = String(form.get("limite_por_pedido") ?? "").trim();
  const limiteAdicionais = String(form.get("limite_adicionais") ?? "").trim();

  const dados = {
    category_id: categoriaId,
    product_type: tipo,
    name: nome.data,
    short_description: String(form.get("descricao") ?? "").trim() || null,
    base_price: preco && preco.ok ? preco.valor : null,
    is_featured: form.get("destaque") === "on",
    // O campo é enviado SEMPRE pelo formulário (rádio Sim/Não), e não como
    // checkbox ausente: com checkbox, "não marcado" e "campo não enviado"
    // chegariam iguais aqui, e um produto novo nasceria sem produção por
    // omissão — o contrário do default conservador do banco.
    requires_production: form.get("exige_producao") !== "nao",
    max_quantity_per_order: limite ? Number(limite) : null,
    max_addons: limiteAdicionais ? Number(limiteAdicionais) : null,
    sort_order: Number(form.get("ordem") ?? 0),
    image_asset_id: String(form.get("imagem_id") ?? "") || null,
  };

  const supabase = await getSupabaseServerClient();
  try {
    if (id) {
      const { error, count } = await supabase
        .from("products")
        .update(dados, { count: "exact" })
        .eq("id", id);
      if (error) throw error;
      const semLinha = conferirLinhas(count);
      if (semLinha) return semLinha;
      revalidatePath(`${ROTA}/${id}`);
      return ok("Produto atualizado.");
    }

    const { data, error } = await supabase
      .from("products")
      .insert({ ...dados, slug: gerarSlug(nome.data) })
      .select("id")
      .single();
    if (error) throw error;
    revalidatePath(`${ROTA}/${(data as { id: string }).id}`);
    return ok("Produto criado.");
  } catch (erro) {
    return falha("salvarProduto", erro);
  }
}

/** RN-DISP-002: indisponível hoje ≠ inativo. São dois botões porque são dois estados. */
export async function alternarDisponibilidadeProduto(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  const disponivel = String(form.get("disponivel")) === "true";
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from("products")
    .update({
      is_temporarily_available: disponivel,
      temporary_unavailable_note: disponivel ? null : String(form.get("motivo") ?? "") || null,
    })
    .eq("id", id);
  if (error) logger.error("catalogo:alternarDisponibilidadeProduto", { code: (error as { code?: string }).code });
  revalidatePath(ROTA);
  revalidatePath(`${ROTA}/${id}`);
}

export async function alternarAtivoProduto(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  const ativar = String(form.get("ativar")) === "true";
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from("products").update({ is_active: ativar }).eq("id", id);
  if (error) logger.error("catalogo:alternarAtivoProduto", { code: (error as { code?: string }).code });
  revalidatePath(ROTA);
  revalidatePath(`${ROTA}/${id}`);
}

/** RN-DEST-001: destaque manual, independente do ranking de vendas. */
export async function alternarDestaque(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  const destacar = String(form.get("destacar")) === "true";
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from("products").update({ is_featured: destacar }).eq("id", id);
  if (error) logger.error("catalogo:alternarDestaque", { code: (error as { code?: string }).code });
  revalidatePath(ROTA);
  revalidatePath(`${ROTA}/${id}`);
}

// ----------------------------------------------------------------- variações
/** RN-PIZZA-003: cada pizza escolhe quais tamanhos oferece e o preço de cada um. */
export async function salvarVariacao(
  _estado: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const produtoId = String(form.get("produto_id") ?? "");
  const tamanhoId = String(form.get("tamanho_id") ?? "");
  if (!produtoId || !tamanhoId) return { erro: "Escolha o tamanho." };

  const preco = lerValorBR(String(form.get("preco") ?? ""));
  if (!preco.ok) return { erro: preco.erro };

  const supabase = await getSupabaseServerClient();
  try {
    const { error } = await supabase
      .from("product_variants")
      .upsert(
        { product_id: produtoId, size_id: tamanhoId, price: preco.valor },
        { onConflict: "product_id,size_id" },
      );
    if (error) throw error;
    revalidatePath(`${ROTA}/${produtoId}`);
    return ok("Tamanho salvo.");
  } catch (erro) {
    return falha("salvarVariacao", erro);
  }
}

export async function alternarDisponibilidadeVariacao(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  const produtoId = String(form.get("produto_id") ?? "");
  const disponivel = String(form.get("disponivel")) === "true";
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from("product_variants")
    .update({ is_temporarily_available: disponivel })
    .eq("id", id);
  if (error) logger.error("catalogo:alternarDisponibilidadeVariacao", { code: (error as { code?: string }).code });
  revalidatePath(`${ROTA}/${produtoId}`);
  revalidatePath(ROTA);
}

export async function removerVariacao(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  const produtoId = String(form.get("produto_id") ?? "");
  const supabase = await getSupabaseServerClient();
  // Se a variação já foi usada em pedido, a FK RESTRICT recusa — e está certo:
  // histórico não se apaga (§29). A tela orienta a inativar.
  const { error } = await supabase.from("product_variants").delete().eq("id", id);
  if (error) logger.error("catalogo:removerVariacao", { code: (error as { code?: string }).code });
  revalidatePath(`${ROTA}/${produtoId}`);
}

// -------------------------------------------------------- bordas e adicionais
export async function salvarBorda(
  _estado: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  return salvarEntidadeSimples("crusts", "Borda", form);
}

export async function salvarAdicional(
  _estado: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  return salvarEntidadeSimples("addons", "Adicional", form);
}

async function salvarEntidadeSimples(
  tabela: "crusts" | "addons",
  rotulo: string,
  form: FormData,
): Promise<EstadoFormulario> {
  const id = String(form.get("id") ?? "");
  const nome = texto.safeParse(form.get("nome"));
  if (!nome.success) return { erro: `Informe o nome d${rotulo === "Borda" ? "a" : "o"} ${rotulo.toLowerCase()}.` };

  const dados = { name: nome.data, sort_order: Number(form.get("ordem") ?? 0) };
  const supabase = await getSupabaseServerClient();
  try {
    if (id) {
      const { error, count } = await supabase
        .from(tabela)
        .update(dados, { count: "exact" })
        .eq("id", id);
      if (error) throw error;
      const semLinha = conferirLinhas(count);
      if (semLinha) return semLinha;
      return ok(`${rotulo} atualizad${rotulo === "Borda" ? "a" : "o"}.`);
    }
    const { error } = await supabase.from(tabela).insert(dados);
    if (error) throw error;
    return ok(`${rotulo} criad${rotulo === "Borda" ? "a" : "o"}.`);
  } catch (erro) {
    return falha(`salvar:${tabela}`, erro);
  }
}

export async function alternarDisponibilidadeSimples(form: FormData): Promise<void> {
  const tabela = String(form.get("tabela") ?? "");
  if (tabela !== "crusts" && tabela !== "addons") return;
  const id = String(form.get("id") ?? "");
  const disponivel = String(form.get("disponivel")) === "true";
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from(tabela)
    .update({ is_temporarily_available: disponivel })
    .eq("id", id);
  if (error) logger.error(`catalogo:disp:${tabela}`, { code: (error as { code?: string }).code });
  revalidatePath(ROTA);
}

export async function alternarAtivoSimples(form: FormData): Promise<void> {
  const tabela = String(form.get("tabela") ?? "");
  if (tabela !== "crusts" && tabela !== "addons") return;
  const id = String(form.get("id") ?? "");
  const ativar = String(form.get("ativar")) === "true";
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from(tabela).update({ is_active: ativar }).eq("id", id);
  if (error) logger.error(`catalogo:ativo:${tabela}`, { code: (error as { code?: string }).code });
  revalidatePath(ROTA);
}

/** RN-BORDA-002 e RN-ADD-002: preço por tamanho. Vazio remove a oferta naquele tamanho. */
export async function salvarPrecoPorTamanho(
  _estado: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const tipo = String(form.get("tipo") ?? "");
  const entidadeId = String(form.get("entidade_id") ?? "");
  const tamanhoId = String(form.get("tamanho_id") ?? "");
  if (!entidadeId || !tamanhoId) return { erro: "Escolha o tamanho." };

  const tabela = tipo === "borda" ? "crust_size_prices" : "addon_size_prices";
  const coluna = tipo === "borda" ? "crust_id" : "addon_id";
  const bruto = String(form.get("preco") ?? "");

  const supabase = await getSupabaseServerClient();
  try {
    if (bruto.trim() === "") {
      const { error } = await supabase
        .from(tabela)
        .delete()
        .eq(coluna, entidadeId)
        .eq("size_id", tamanhoId);
      if (error) throw error;
      return ok("Oferta removida desse tamanho.");
    }

    const preco = lerValorBR(bruto);
    if (!preco.ok) return { erro: preco.erro };

    const { error } = await supabase
      .from(tabela)
      .upsert(
        { [coluna]: entidadeId, size_id: tamanhoId, price: preco.valor },
        { onConflict: `${coluna},size_id` },
      );
    if (error) throw error;
    return ok("Preço salvo.");
  } catch (erro) {
    return falha("salvarPrecoPorTamanho", erro);
  }
}

// -------------------------------------------------------------------- combos
/** RN-COMBO-002/003: componente exato; pizza dentro do combo exige tamanho. */
export async function adicionarComponente(
  _estado: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const comboId = String(form.get("combo_id") ?? "");
  const produtoId = String(form.get("produto_id") ?? "");
  const variacaoId = String(form.get("variacao_id") ?? "") || null;
  const quantidade = Number(form.get("quantidade") ?? 1);

  if (!comboId || !produtoId) return { erro: "Escolha o item do combo." };
  if (!Number.isInteger(quantidade) || quantidade < 1) {
    return { erro: "A quantidade precisa ser 1 ou mais." };
  }

  const supabase = await getSupabaseServerClient();
  try {
    const { error } = await supabase.from("combo_components").insert({
      combo_product_id: comboId,
      component_product_id: produtoId,
      component_variant_id: variacaoId,
      quantity: quantidade,
      sort_order: Number(form.get("ordem") ?? 0),
    });
    if (error) throw error;
    revalidatePath(`${ROTA}/combo/${comboId}`);
    return ok("Item adicionado ao combo.");
  } catch (erro) {
    return falha("adicionarComponente", erro);
  }
}

export async function removerComponente(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  const comboId = String(form.get("combo_id") ?? "");
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from("combo_components").delete().eq("id", id);
  if (error) logger.error("catalogo:removerComponente", { code: (error as { code?: string }).code });
  revalidatePath(`${ROTA}/combo/${comboId}`);
  revalidatePath(ROTA);
}

// ----------------------------------------------------------------- promoções
export async function salvarPromocao(
  _estado: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const nome = texto.safeParse(form.get("nome"));
  if (!nome.success) return { erro: "Dê um nome à promoção." };

  const alvo = String(form.get("alvo") ?? "");
  // "variant:<id>" ou "product:<id>"
  const [tipoAlvo, alvoId] = alvo.split(":");
  if ((tipoAlvo !== "variant" && tipoAlvo !== "product") || !alvoId) {
    return { erro: "Escolha o item em promoção." };
  }

  const preco = lerValorBR(String(form.get("preco") ?? ""));
  if (!preco.ok) return { erro: preco.erro };

  const inicio = String(form.get("inicio") ?? "").trim();
  if (!inicio) return { erro: "Informe quando a promoção começa." };
  const fim = String(form.get("fim") ?? "").trim();

  const limite = String(form.get("limite") ?? "").trim();

  const supabase = await getSupabaseServerClient();
  try {
    const { error } = await supabase.from("promotions").insert({
      name: nome.data,
      target_type: tipoAlvo,
      product_id: tipoAlvo === "product" ? alvoId : null,
      variant_id: tipoAlvo === "variant" ? alvoId : null,
      promotional_price: preco.valor,
      starts_at: new Date(inicio).toISOString(),
      // RN-PROMO-002: sem fim = vale até desativação manual.
      ends_at: fim ? new Date(fim).toISOString() : null,
      max_quantity_per_order: limite ? Number(limite) : null,
    });
    if (error) throw error;
    return ok("Promoção criada.");
  } catch (erro) {
    return falha("salvarPromocao", erro);
  }
}

export async function alternarAtivoPromocao(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  const ativar = String(form.get("ativar")) === "true";
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from("promotions").update({ is_active: ativar }).eq("id", id);
  if (error) logger.error("catalogo:alternarAtivoPromocao", { code: (error as { code?: string }).code });
  revalidatePath(ROTA);
}

export async function removerPromocao(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from("promotions").delete().eq("id", id);
  if (error) logger.error("catalogo:removerPromocao", { code: (error as { code?: string }).code });
  revalidatePath(ROTA);
}

// ------------------------------------------------------------------- banners
export async function salvarBanner(
  _estado: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const imagemId = String(form.get("imagem_id") ?? "");
  if (!imagemId) return { erro: "Escolha a imagem do banner." };

  const destino = String(form.get("destino") ?? "none");
  // "product:<id>", "category:<id>", "promotion:<id>", "external", "none"
  const [tipo, alvoId] = destino.split(":");

  const urlExterna = String(form.get("url_externa") ?? "").trim();
  if (tipo === "external" && !/^https?:\/\/\S+$/.test(urlExterna)) {
    return { erro: "Informe uma URL externa começando com http:// ou https://." };
  }
  // RN-BANNER-002: destino interno referencia entidade, nunca URL digitada.
  if ((tipo === "product" || tipo === "category" || tipo === "promotion") && !alvoId) {
    return { erro: "Escolha o destino do banner." };
  }

  const inicio = String(form.get("inicio") ?? "").trim();
  const fim = String(form.get("fim") ?? "").trim();

  const supabase = await getSupabaseServerClient();
  try {
    const { error } = await supabase.from("banners").insert({
      title: String(form.get("titulo") ?? "").trim() || null,
      body: String(form.get("corpo") ?? "").trim() || null,
      image_asset_id: imagemId,
      destination_type: tipo,
      destination_product_id: tipo === "product" ? alvoId : null,
      destination_category_id: tipo === "category" ? alvoId : null,
      destination_promotion_id: tipo === "promotion" ? alvoId : null,
      external_url: tipo === "external" ? urlExterna : null,
      starts_at: inicio ? new Date(inicio).toISOString() : null,
      ends_at: fim ? new Date(fim).toISOString() : null,
      sort_order: Number(form.get("ordem") ?? 0),
    });
    if (error) throw error;
    return ok("Banner criado.");
  } catch (erro) {
    return falha("salvarBanner", erro);
  }
}

export async function alternarAtivoBanner(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  const ativar = String(form.get("ativar")) === "true";
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from("banners").update({ is_active: ativar }).eq("id", id);
  if (error) logger.error("catalogo:alternarAtivoBanner", { code: (error as { code?: string }).code });
  revalidatePath(ROTA);
}

export async function removerBanner(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from("banners").delete().eq("id", id);
  if (error) logger.error("catalogo:removerBanner", { code: (error as { code?: string }).code });
  revalidatePath(ROTA);
}
