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

/**
 * As formas que o caixa pode RECEBER, com as bandeiras ativas de cada uma.
 *
 * 09-PDV-FRENTE-DE-CAIXA.md §1.3 · RN-PGTO-001/006
 *
 * Não confundir com `formasDePagamento(modalidade)` do checkout: aquela é a
 * INTENÇÃO oferecida ao cliente, filtrada por entrega ou retirada. Esta é o
 * que a pizzaria aceita de fato no balcão — e o recebido pode diferir do
 * esperado (CLAUDE.md §24).
 *
 * Mora aqui porque três telas precisam da mesma projeção: o PDV, a tela do
 * pedido e agora a gaveta de cobrança da fila. Montada inline em cada uma,
 * bastaria alguém esquecer o filtro de `is_active` num lugar para o balcão
 * oferecer uma forma desativada.
 */
export async function formasParaRecebimento(): Promise<
  {
    id: string;
    nome: string;
    familia: string;
    exige_bandeira: boolean;
    bandeiras: { id: string; nome: string }[];
  }[]
> {
  const [formas, bandeiras] = await Promise.all([listarFormasPagamento(), listarBandeiras()]);
  return formas
    .filter((f) => f.is_active)
    .map((f) => ({
      id: f.id,
      nome: f.name,
      familia: f.payment_family,
      exige_bandeira: f.requires_brand,
      bandeiras: bandeiras
        .filter((b) => b.payment_method_id === f.id && b.is_active)
        .map((b) => ({ id: b.id, nome: b.name })),
    }));
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
  // Para a tela dizer quem fez o quê (D-2026-09-29-94): o nome de quem agiu,
  // embutido pelo funcionário do registro, e SÓ o `status` de antes e depois.
  // O restante de `before_data`/`after_data` pode ter dado sensível e não é
  // lido aqui.
  const { data, error } = await supabase
    .from("audit_logs")
    .select(
      "id, created_at, action, entity_type, entity_id, actor_type, reason, status_antes:before_data->>status, status_depois:after_data->>status, funcionario:employees!audit_logs_actor_employee_id_fkey(full_name)",
    )
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw error;

  type Linha = Omit<RegistroAuditoria, "ator" | "numero_pedido"> & {
    funcionario: { full_name: string } | null;
  };
  const linhas = (data ?? []) as unknown as Linha[];

  // O número do pedido vem numa segunda leitura, sob o RLS de `orders`:
  // `entity_id` é genérico e não tem chave estrangeira para embutir.
  const idsDePedido = [
    ...new Set(
      linhas
        .filter((l) => l.entity_type === "orders" && l.entity_id)
        .map((l) => l.entity_id as string),
    ),
  ];
  const numeros = new Map<string, number>();
  if (idsDePedido.length > 0) {
    const { data: pedidos } = await supabase
      .from("orders")
      .select("id, order_number")
      .in("id", idsDePedido);
    for (const p of (pedidos ?? []) as { id: string; order_number: number }[]) {
      numeros.set(p.id, p.order_number);
    }
  }

  return linhas.map(({ funcionario, ...l }) => ({
    ...l,
    ator: funcionario?.full_name ?? null,
    numero_pedido: l.entity_id ? (numeros.get(l.entity_id) ?? null) : null,
  }));
}

/** Aberta ou fechada agora — derivado pelo banco (RN-LOJA-001/002). */
export async function lojaAberta(): Promise<boolean> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("loja_aberta");
  if (error) throw error;
  return data === true;
}
