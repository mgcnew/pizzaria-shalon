"use server";

import { z } from "zod";
import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import { logger } from "@/lib/logger";

/**
 * Bloco de notas rápido da equipe (D-2026-10-17-151, migration 0165).
 *
 * Compartilhado: todo usuário interno ativo vê as mesmas notas. Quem decide
 * acesso e monta o rótulo da referência é o banco; aqui só se valida a forma.
 */

export type TipoDeReferencia = "order" | "customer" | "product";

export type ReferenciaDaNota = { tipo: TipoDeReferencia; id: string; rotulo: string; detalhe?: string | null };

export type NotaRapida = {
  id: string;
  texto: string;
  criada_em: string;
  autor: string | null;
  minha: boolean;
  concluida_em: string | null;
  concluida_por: string | null;
  referencia: ReferenciaDaNota | null;
};

export type ListaDeNotas = { ok: true; notas: NotaRapida[]; abertas: number } | { ok: false; erro: string };
export type ResultadoNota = { ok: true; nota: NotaRapida } | { ok: false; erro: string };

const FALHA = "Não foi possível falar com o servidor agora. Tente de novo.";

export async function listarNotas(concluidas = false): Promise<ListaDeNotas> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("notas_rapidas", { p_concluidas: concluidas === true });
  if (error) {
    logger.error("notas:listar", { code: error.code });
    return { ok: false, erro: FALHA };
  }
  return data as ListaDeNotas;
}

const novaSchema = z.object({
  texto: z.string().trim().min(1).max(1000),
  referencia: z
    .object({ tipo: z.enum(["order", "customer", "product"]), id: z.uuid() })
    .nullish(),
});

export async function criarNota(entrada: unknown): Promise<ResultadoNota> {
  const validado = novaSchema.safeParse(entrada);
  if (!validado.success) return { ok: false, erro: "Escreva a anotação (até 1000 caracteres)." };
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("criar_nota_rapida", {
    p_texto: validado.data.texto,
    p_ref_tipo: validado.data.referencia?.tipo ?? null,
    p_ref_id: validado.data.referencia?.id ?? null,
  });
  if (error) {
    logger.error("notas:criar", { code: error.code });
    return { ok: false, erro: FALHA };
  }
  return data as ResultadoNota;
}

export async function concluirNota(id: string, concluida: boolean): Promise<ResultadoNota> {
  if (!z.uuid().safeParse(id).success) return { ok: false, erro: "Anotação inválida." };
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("concluir_nota_rapida", {
    p_id: id,
    p_concluida: concluida === true,
  });
  if (error) {
    logger.error("notas:concluir", { code: error.code });
    return { ok: false, erro: FALHA };
  }
  return data as ResultadoNota;
}

export async function excluirNota(id: string): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (!z.uuid().safeParse(id).success) return { ok: false, erro: "Anotação inválida." };
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("excluir_nota_rapida", { p_id: id });
  if (error) {
    logger.error("notas:excluir", { code: error.code });
    return { ok: false, erro: FALHA };
  }
  return data as { ok: true } | { ok: false; erro: string };
}

export async function buscarReferencias(termo: string): Promise<ReferenciaDaNota[]> {
  const limpo = String(termo ?? "").trim().slice(0, 80);
  if (!limpo) return [];
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("referencias_para_nota", { p_termo: limpo });
  if (error) {
    logger.error("notas:referencias", { code: error.code });
    return [];
  }
  return (data ?? []) as ReferenciaDaNota[];
}
