"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import { logger } from "@/lib/logger";
import type { EstadoFormulario } from "./tipos";

/**
 * Cadastro do código de barras — Fase 12 (PDV), Etapa 3.
 *
 * 09-PDV-FRENTE-DE-CAIXA.md §2.3, §6.1, §8.2 · Decisão D-2026-09-25-78
 *
 * POR QUE ESTE ARQUIVO CHAMA RPC, E O RESTO DO CATÁLOGO ESCREVE NA TABELA
 *
 * O resto do catálogo escreve direto e deixa a policy decidir. Aqui não dá:
 * §8.2 exige `log_audit` explícito, e trocar o primário são duas escritas que
 * precisam acontecer na ordem certa e juntas. Uma action que fizesse isso em
 * dois `update` deixaria o item sem primário se a segunda falhasse — ou se a
 * pessoa fechasse a aba no meio.
 *
 * TRÊS COISAS QUE ESTE ARQUIVO NÃO FAZ:
 *  1. não decide autorização — a RPC verifica `catalog.manage` no corpo, porque
 *     é `SECURITY DEFINER` e não passa pela policy;
 *  2. não normaliza código — a coluna gerada do banco é a única autoridade
 *     sobre a identidade de um código (Etapa 2);
 *  3. não valida EAN para decidir nada — o aviso vem pronto da RPC, e aviso
 *     não impede salvar.
 */

const ROTA = "/admin/produtos";

/**
 * A rota a revalidar vem num campo PRÓPRIO, `rota_produto_id`, e nunca do
 * `produto_id`.
 *
 * Os dois já foram a mesma coisa aqui e era um defeito: no painel de uma
 * variante, a tela precisa do id do produto para revalidar a página, mas o ALVO
 * do código é a variante. Reaproveitar `produto_id` para as duas coisas fazia a
 * action mandar produto E variante para a RPC, que recusa com `alvo_invalido` —
 * exatamente a regra "exatamente um alvo" funcionando contra nós.
 */
function revalidar(form: FormData): void {
  const produtoId = String(form.get("rota_produto_id") ?? "");
  revalidatePath(ROTA);
  if (produtoId) revalidatePath(`${ROTA}/${produtoId}`);
}

/** Exatamente um alvo, como a RPC exige: variante quando houver, senão produto. */
function alvoDoFormulario(form: FormData): {
  produto_id: string | null;
  variante_id: string | null;
} {
  const varianteId = String(form.get("variante_id") ?? "") || null;
  if (varianteId) return { produto_id: null, variante_id: varianteId };
  return { produto_id: String(form.get("produto_id") ?? "") || null, variante_id: null };
}

/**
 * As RPCs devolvem `{ ok: false, erro }` para recusa de regra e lançam só em
 * falha de verdade. Traduzir aqui mantém a mensagem que o banco escolheu, que é
 * a que sabe nomear o item dono de um código duplicado.
 */
type RespostaRpc = {
  ok: boolean;
  erro?: string;
  aviso_ean?: string | null;
  primarios_demovidos?: number;
  ja_removido?: boolean;
  ja_primario?: boolean;
};

function traduzir(
  contexto: string,
  dados: RespostaRpc | null,
  erro: unknown,
  sucesso: (r: RespostaRpc) => string,
): EstadoFormulario {
  if (erro) {
    const e = erro as { code?: string; message?: string };
    logger.error(`catalogo:${contexto}`, { code: e?.code });
    // 42501 é a RPC recusando execução a quem não é `authenticated`.
    if (e?.code === "42501") {
      return { erro: "Você não tem permissão para gerenciar o catálogo." };
    }
    return { erro: "Não foi possível concluir a operação. Tente de novo." };
  }
  if (!dados) return { erro: "Não foi possível concluir a operação." };
  if (!dados.ok) return { erro: dados.erro ?? "Operação recusada." };

  // O aviso de EAN acompanha o SUCESSO, nunca substitui. O código foi salvo.
  const mensagem = sucesso(dados);
  return { ok: dados.aviso_ean ? `${mensagem} ${dados.aviso_ean}` : mensagem };
}

/**
 * Cadastra um código. Com `primario` marcado, a RPC rebaixa o primário anterior
 * na MESMA transação — a pessoa não precisa apagar o antigo primeiro.
 */
export async function cadastrarCodigoDeBarras(
  _estado: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const codigo = String(form.get("codigo") ?? "").trim();
  if (!codigo) return { erro: "Informe o código de barras." };

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("cadastrar_codigo_de_barras", {
    p_dados: {
      codigo,
      ...alvoDoFormulario(form),
      primario: form.get("primario") === "on" || form.get("primario") === "true",
      motivo: String(form.get("motivo") ?? "").trim() || null,
    },
  });

  const estado = traduzir("cadastrarCodigoDeBarras", data as RespostaRpc | null, error, (r) =>
    r.primarios_demovidos
      ? "Código cadastrado e definido como principal."
      : "Código cadastrado.",
  );
  if (estado.ok) revalidar(form);
  return estado;
}

/** Altera o texto e/ou o primário. Não move o código para outro item. */
export async function alterarCodigoDeBarras(
  _estado: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const id = String(form.get("id") ?? "");
  if (!id) return { erro: "Código não informado." };

  const codigo = String(form.get("codigo") ?? "").trim();
  if (!codigo) return { erro: "Informe o código de barras." };

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("alterar_codigo_de_barras", {
    p_id: id,
    p_dados: {
      codigo,
      primario: form.get("primario") === "on" || form.get("primario") === "true",
      motivo: String(form.get("motivo") ?? "").trim() || null,
    },
  });

  const estado = traduzir("alterarCodigoDeBarras", data as RespostaRpc | null, error, () =>
    "Código atualizado.",
  );
  if (estado.ok) revalidar(form);
  return estado;
}

/** Remove um código e libera o valor para reuso. Idempotente. */
export async function removerCodigoDeBarras(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.rpc("remover_codigo_de_barras", {
    p_id: id,
    p_motivo: String(form.get("motivo") ?? "").trim() || null,
  });
  if (error) {
    logger.error("catalogo:removerCodigoDeBarras", { code: (error as { code?: string }).code });
  }
  revalidar(form);
}

/**
 * Troca o código principal do item. Uma chamada, uma transação: rebaixa o
 * anterior e promove este. Não existe passo intermediário em que o item fique
 * sem principal.
 */
export async function definirCodigoPrimario(
  _estado: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const id = String(form.get("id") ?? "");
  if (!id) return { erro: "Código não informado." };

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("definir_codigo_primario", { p_id: id });

  const estado = traduzir("definirCodigoPrimario", data as RespostaRpc | null, error, (r) =>
    r.ja_primario ? "Este código já era o principal." : "Código principal atualizado.",
  );
  if (estado.ok) revalidar(form);
  return estado;
}
