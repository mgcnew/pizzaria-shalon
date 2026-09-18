import "server-only";
import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import type {
  BandeiraPagamento,
  ChavePix,
  FaixaEntregaRegistro,
  FormaPagamento,
  Horario,
  LimiteAlerta,
  Loja,
  RegistroAuditoria,
} from "./tipos";

/**
 * Leituras das configurações.
 *
 * Quem enxerga o quê é decisão do RLS: `settings.view` para ler,
 * `settings.manage` para alterar, `audit.view` para a auditoria. A interface
 * apenas esconde o que não se aplica — esconder botão não é segurança
 * (CLAUDE.md §12).
 */

/** A loja pode ainda não estar configurada; `null` é um estado legítimo. */
export async function obterLoja(): Promise<Loja | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.from("store_settings").select("*").maybeSingle();
  if (error) throw error;
  return (data as Loja | null) ?? null;
}

export async function listarHorarios(): Promise<Horario[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("store_hours")
    .select("id, weekday, is_closed, opens_at, closes_at, sort_order")
    .order("weekday");
  if (error) throw error;
  return (data ?? []) as Horario[];
}

export async function listarFaixas(): Promise<FaixaEntregaRegistro[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("delivery_fee_bands")
    .select("id, min_distance_km, max_distance_km, fee, is_active, sort_order")
    .order("min_distance_km");
  if (error) throw error;
  return (data ?? []) as FaixaEntregaRegistro[];
}

export async function listarFormasPagamento(): Promise<FormaPagamento[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("payment_methods")
    .select(
      "id, code, name, payment_family, is_active, available_for_delivery, available_for_pickup, requires_brand, sort_order",
    )
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as FormaPagamento[];
}

export async function listarBandeiras(): Promise<BandeiraPagamento[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("payment_brands")
    .select("id, payment_method_id, name, is_active, sort_order")
    .order("sort_order");
  if (error) throw error;
  return (data ?? []) as BandeiraPagamento[];
}

export async function obterChavePix(): Promise<ChavePix | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.from("pix_key_settings").select("*").maybeSingle();
  if (error) throw error;
  return (data as ChavePix | null) ?? null;
}

export async function listarLimitesDeAlerta(): Promise<LimiteAlerta[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("alert_thresholds")
    .select("id, alert_key, threshold_minutes, is_active")
    .order("alert_key");
  if (error) throw error;
  return (data ?? []) as LimiteAlerta[];
}

/**
 * Auditoria recente. Exige `audit.view` — sem a permissão o RLS devolve
 * lista vazia, e a tela diz isso em vez de fingir que não há registros.
 */
export async function listarAuditoria(limite = 40): Promise<RegistroAuditoria[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, created_at, action, entity_type, actor_type, reason")
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw error;
  return (data ?? []) as RegistroAuditoria[];
}

/** Aberta ou fechada agora — derivado pelo banco (RN-LOJA-001/002). */
export async function lojaAberta(): Promise<boolean> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("loja_aberta");
  if (error) throw error;
  return data === true;
}
