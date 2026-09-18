"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import { logger } from "@/lib/logger";
import { lerValorBR } from "@/domain/catalogo/dinheiro";
import type { EstadoFormulario } from "@/application/catalogo/tipos";

/**
 * Escrita das configurações da loja.
 *
 * Toda alteração aqui é "configuração crítica" segundo 03 §7.2: exige
 * `settings.manage` (pelo RLS, não por verificação nesta camada) e é
 * auditada por trigger no banco, com valor anterior e novo.
 *
 * A auditoria NÃO é chamada por este código de propósito — se dependesse
 * disso, bastaria um caminho esquecido para o registro sumir.
 */

const ROTA = "/admin/configuracoes";

function ok(mensagem: string): EstadoFormulario {
  revalidatePath(ROTA);
  return { ok: mensagem };
}

function falha(contexto: string, erro: unknown): EstadoFormulario {
  const e = erro as { code?: string; message?: string; constraint?: string };
  logger.error(`configuracoes:${contexto}`, { code: e?.code, constraint: e?.constraint });

  const porConstraint: Record<string, string> = {
    delivery_fee_bands_sem_sobreposicao:
      "Essa faixa se sobrepõe a outra faixa ativa. Ajuste os limites (02 §3.3).",
    store_settings_fechamento_coerente:
      "Para fechar temporariamente é preciso informar o motivo.",
    store_settings_minimo_coerente:
      "Pedido mínimo ativo exige um valor.",
    pix_key_settings_habilitado_exige_dados:
      "Para habilitar o Pix antecipado, informe tipo, chave e nome do recebedor.",
    store_settings_eta_entrega: "O tempo máximo de entrega não pode ser menor que o mínimo.",
    store_settings_eta_retirada: "O tempo máximo de retirada não pode ser menor que o mínimo.",
    store_hours_um_por_dia: "Esse dia da semana já tem horário cadastrado.",
    store_hours_janela: "Dia aberto precisa de horário de abertura e de fechamento.",
    delivery_fee_bands_ordem: "A distância final precisa ser maior que a inicial.",
  };
  const conhecido = e?.constraint ? porConstraint[e.constraint] : undefined;
  if (conhecido) return { erro: conhecido };

  if (e?.code === "42501") {
    return { erro: "Você não tem permissão para alterar as configurações." };
  }
  if (e?.code === "23505") return { erro: "Já existe um registro com esses dados." };
  return { erro: "Não foi possível salvar. Verifique os dados e tente novamente." };
}

function conferirLinhas(n: number | null): EstadoFormulario | null {
  if (n === 0) {
    return { erro: "Nada foi alterado. Verifique se você tem permissão de configurações." };
  }
  return null;
}

const obrigatorio = z.string().trim().min(1);

// ----------------------------------------------------------------- a loja
export async function salvarLoja(
  _estado: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const campos = {
    store_name: String(form.get("nome") ?? "").trim(),
    display_name: String(form.get("nome_exibicao") ?? "").trim() || null,
    whatsapp: String(form.get("whatsapp") ?? "").trim(),
    phone: String(form.get("telefone") ?? "").trim() || null,
    address_street: String(form.get("logradouro") ?? "").trim(),
    address_number: String(form.get("numero") ?? "").trim(),
    address_complement: String(form.get("complemento") ?? "").trim() || null,
    address_neighborhood: String(form.get("bairro") ?? "").trim(),
    address_city: String(form.get("cidade") ?? "").trim(),
    address_state: String(form.get("uf") ?? "").trim().toUpperCase(),
    address_postal_code: String(form.get("cep") ?? "").trim(),
    timezone: String(form.get("fuso") ?? "America/Sao_Paulo").trim(),
  };

  for (const [campo, valor] of Object.entries(campos)) {
    if (campo === "display_name" || campo === "phone" || campo === "address_complement") continue;
    if (!obrigatorio.safeParse(valor).success) {
      return { erro: "Preencha nome, WhatsApp e o endereço completo da loja." };
    }
  }

  // 79.1: "Não hardcodar endereço." A coordenada é opcional aqui; a
  // geocodificação real é da Fase 5 e tem provedor abstraído (CLAUDE.md §20).
  const lat = String(form.get("latitude") ?? "").trim();
  const lon = String(form.get("longitude") ?? "").trim();
  if ((lat === "") !== (lon === "")) {
    return { erro: "Informe latitude e longitude juntas, ou deixe as duas em branco." };
  }

  const dados = {
    ...campos,
    latitude: lat ? Number(lat.replace(",", ".")) : null,
    longitude: lon ? Number(lon.replace(",", ".")) : null,
  };

  const supabase = await getSupabaseServerClient();
  try {
    const { data: existente } = await supabase.from("store_settings").select("id").maybeSingle();

    if (existente) {
      const { error, count } = await supabase
        .from("store_settings")
        .update(dados, { count: "exact" })
        .eq("id", (existente as { id: string }).id);
      if (error) throw error;
      const semLinha = conferirLinhas(count);
      if (semLinha) return semLinha;
      return ok("Dados da loja salvos.");
    }

    // Primeira configuração: os tempos estimados são obrigatórios no modelo,
    // então a tela de criação pede os quatro.
    const etas = ["entrega_min", "entrega_max", "retirada_min", "retirada_max"].map((k) =>
      Number(String(form.get(k) ?? "")),
    );
    if (etas.some((n) => !Number.isInteger(n) || n <= 0)) {
      return { erro: "Informe os tempos estimados de entrega e de retirada, em minutos." };
    }

    const { error } = await supabase.from("store_settings").insert({
      ...dados,
      delivery_eta_min_minutes: etas[0],
      delivery_eta_max_minutes: etas[1],
      pickup_eta_min_minutes: etas[2],
      pickup_eta_max_minutes: etas[3],
    });
    if (error) throw error;
    return ok("Loja configurada.");
  } catch (erro) {
    return falha("salvarLoja", erro);
  }
}

/**
 * RN-LOJA-002: pausar o recebimento NÃO esconde o cardápio — o checkout é que
 * fica bloqueado. O motivo é obrigatório: o atendimento precisa saber o que
 * responder, e a constraint do banco recusa fechar sem ele.
 */
export async function alternarFechamento(
  _estado: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const fechar = String(form.get("fechar")) === "true";
  const motivo = String(form.get("motivo") ?? "").trim();
  if (fechar && !motivo) return { erro: "Informe o motivo do fechamento temporário." };

  const supabase = await getSupabaseServerClient();
  try {
    const { data: loja } = await supabase.from("store_settings").select("id").maybeSingle();
    if (!loja) return { erro: "Configure os dados da loja primeiro." };

    const { error, count } = await supabase
      .from("store_settings")
      .update(
        {
          is_temporarily_closed: fechar,
          temporary_close_reason: fechar ? motivo : null,
          temporary_closed_at: fechar ? new Date().toISOString() : null,
        },
        { count: "exact" },
      )
      .eq("id", (loja as { id: string }).id);
    if (error) throw error;
    const semLinha = conferirLinhas(count);
    if (semLinha) return semLinha;
    return ok(fechar ? "Loja fechada temporariamente." : "Loja reaberta.");
  } catch (erro) {
    return falha("alternarFechamento", erro);
  }
}

/** RN-LOJA-004: estimativas de entrega e retirada são independentes. */
export async function salvarEstimativas(
  _estado: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const numero = (k: string) => {
    const bruto = String(form.get(k) ?? "").trim();
    return bruto === "" ? null : Number(bruto);
  };

  const padrao = {
    delivery_eta_min_minutes: numero("entrega_min"),
    delivery_eta_max_minutes: numero("entrega_max"),
    pickup_eta_min_minutes: numero("retirada_min"),
    pickup_eta_max_minutes: numero("retirada_max"),
  };
  if (Object.values(padrao).some((n) => n === null || !Number.isInteger(n) || n <= 0)) {
    return { erro: "Os tempos padrão precisam ser números inteiros de minutos." };
  }

  // Override temporário: os quatro em branco significam "sem override".
  const override = {
    current_delivery_eta_min_minutes: numero("override_entrega_min"),
    current_delivery_eta_max_minutes: numero("override_entrega_max"),
    current_pickup_eta_min_minutes: numero("override_retirada_min"),
    current_pickup_eta_max_minutes: numero("override_retirada_max"),
  };

  const supabase = await getSupabaseServerClient();
  try {
    const { data: loja } = await supabase.from("store_settings").select("id").maybeSingle();
    if (!loja) return { erro: "Configure os dados da loja primeiro." };

    const temOverride = Object.values(override).some((n) => n !== null);
    const { error, count } = await supabase
      .from("store_settings")
      .update(
        {
          ...padrao,
          ...override,
          eta_override_updated_at: temOverride ? new Date().toISOString() : null,
        },
        { count: "exact" },
      )
      .eq("id", (loja as { id: string }).id);
    if (error) throw error;
    const semLinha = conferirLinhas(count);
    if (semLinha) return semLinha;
    return ok("Tempos estimados salvos.");
  } catch (erro) {
    return falha("salvarEstimativas", erro);
  }
}

/**
 * RN-LOJA-005: o pedido mínimo vale SOMENTE para entrega e é calculado sobre
 * o subtotal de produtos, antes da taxa. Aqui só se configura o valor.
 *
 * 79.2: o raio de aprovação automática é configurável; a distância MÁXIMA
 * atendida não é campo — deriva da maior faixa ativa.
 */
export async function salvarRegrasDeEntrega(
  _estado: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const minimoAtivo = form.get("minimo_ativo") === "on";
  const minimoBruto = String(form.get("minimo_valor") ?? "").trim();

  let minimo: number | null = null;
  if (minimoAtivo) {
    const lido = lerValorBR(minimoBruto);
    if (!lido.ok) return { erro: `Pedido mínimo: ${lido.erro}` };
    minimo = lido.valor;
  }

  const raioBruto = String(form.get("raio_automatico") ?? "0").trim().replace(",", ".");
  const raio = Number(raioBruto);
  if (!Number.isFinite(raio) || raio < 0) {
    return { erro: "O raio de aprovação automática precisa ser um número de km." };
  }

  const supabase = await getSupabaseServerClient();
  try {
    const { data: loja } = await supabase.from("store_settings").select("id").maybeSingle();
    if (!loja) return { erro: "Configure os dados da loja primeiro." };

    const { error, count } = await supabase
      .from("store_settings")
      .update(
        {
          delivery_minimum_enabled: minimoAtivo,
          delivery_minimum_subtotal: minimo,
          automatic_delivery_radius_km: raio,
        },
        { count: "exact" },
      )
      .eq("id", (loja as { id: string }).id);
    if (error) throw error;
    const semLinha = conferirLinhas(count);
    if (semLinha) return semLinha;
    return ok("Regras de entrega salvas.");
  } catch (erro) {
    return falha("salvarRegrasDeEntrega", erro);
  }
}

/** RN-ADD-001: adicionais podem ser desligados globalmente. */
export async function alternarAdicionais(form: FormData): Promise<void> {
  const ligar = String(form.get("ligar")) === "true";
  const supabase = await getSupabaseServerClient();
  const { data: loja } = await supabase.from("store_settings").select("id").maybeSingle();
  if (!loja) return;
  const { error } = await supabase
    .from("store_settings")
    .update({ addons_enabled: ligar })
    .eq("id", (loja as { id: string }).id);
  if (error) logger.error("configuracoes:alternarAdicionais", { code: (error as { code?: string }).code });
  revalidatePath(ROTA);
}

// --------------------------------------------------------------- horários
export async function salvarHorario(
  _estado: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const dia = Number(form.get("dia"));
  if (!Number.isInteger(dia) || dia < 0 || dia > 6) return { erro: "Dia inválido." };

  const fechado = form.get("fechado") === "on";
  const abre = String(form.get("abre") ?? "").trim();
  const fecha = String(form.get("fecha") ?? "").trim();

  if (!fechado && (!abre || !fecha)) {
    return { erro: "Dia aberto precisa de horário de abertura e de fechamento." };
  }

  const supabase = await getSupabaseServerClient();
  try {
    // 02 §3.2: fechar depois da meia-noite é válido. Não existe validação
    // proibindo `fecha < abre` — seria bug, não proteção.
    const { error } = await supabase.from("store_hours").upsert(
      {
        weekday: dia,
        is_closed: fechado,
        opens_at: fechado ? null : abre,
        closes_at: fechado ? null : fecha,
        sort_order: dia,
      },
      { onConflict: "weekday" },
    );
    if (error) throw error;
    return ok("Horário salvo.");
  } catch (erro) {
    return falha("salvarHorario", erro);
  }
}

// ------------------------------------------------- faixas de distância
export async function salvarFaixa(
  _estado: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const id = String(form.get("id") ?? "");
  const km = (k: string) => Number(String(form.get(k) ?? "").trim().replace(",", "."));
  const min = km("min");
  const max = km("max");
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0) {
    return { erro: "Informe as distâncias inicial e final, em km." };
  }
  if (max <= min) return { erro: "A distância final precisa ser maior que a inicial." };

  const taxa = lerValorBR(String(form.get("taxa") ?? ""));
  if (!taxa.ok) return { erro: `Taxa: ${taxa.erro}` };

  const dados = {
    min_distance_km: min,
    max_distance_km: max,
    fee: taxa.valor,
    sort_order: Number(form.get("ordem") ?? 0),
  };

  const supabase = await getSupabaseServerClient();
  try {
    if (id) {
      const { error, count } = await supabase
        .from("delivery_fee_bands")
        .update(dados, { count: "exact" })
        .eq("id", id);
      if (error) throw error;
      const semLinha = conferirLinhas(count);
      if (semLinha) return semLinha;
      return ok("Faixa atualizada.");
    }
    const { error } = await supabase.from("delivery_fee_bands").insert(dados);
    if (error) throw error;
    return ok("Faixa criada.");
  } catch (erro) {
    return falha("salvarFaixa", erro);
  }
}

export async function alternarAtivoFaixa(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  const ativar = String(form.get("ativar")) === "true";
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase
    .from("delivery_fee_bands")
    .update({ is_active: ativar })
    .eq("id", id);
  if (error) logger.error("configuracoes:alternarAtivoFaixa", { code: (error as { code?: string }).code });
  revalidatePath(ROTA);
}

export async function removerFaixa(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from("delivery_fee_bands").delete().eq("id", id);
  if (error) logger.error("configuracoes:removerFaixa", { code: (error as { code?: string }).code });
  revalidatePath(ROTA);
}

// ------------------------------------------------------------ pagamentos
export async function alternarFormaPagamento(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  const ativar = String(form.get("ativar")) === "true";
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from("payment_methods").update({ is_active: ativar }).eq("id", id);
  if (error) logger.error("configuracoes:alternarFormaPagamento", { code: (error as { code?: string }).code });
  revalidatePath(ROTA);
}

/** RN-PGTO-006: bandeiras são dados configuráveis, nunca lista fixa no código. */
export async function salvarBandeira(
  _estado: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const formaId = String(form.get("forma_id") ?? "");
  const nome = String(form.get("nome") ?? "").trim();
  if (!formaId || !nome) return { erro: "Informe a bandeira." };

  const supabase = await getSupabaseServerClient();
  try {
    const { error } = await supabase
      .from("payment_brands")
      .insert({ payment_method_id: formaId, name: nome });
    if (error) throw error;
    return ok("Bandeira adicionada.");
  } catch (erro) {
    return falha("salvarBandeira", erro);
  }
}

export async function removerBandeira(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from("payment_brands").delete().eq("id", id);
  if (error) logger.error("configuracoes:removerBandeira", { code: (error as { code?: string }).code });
  revalidatePath(ROTA);
}

/**
 * RN-PGTO-008: a opção de Pix antecipado só existe para o cliente quando a
 * chave estiver cadastrada E habilitada. A constraint do banco recusa
 * habilitar sem chave — aqui a mensagem só chega antes.
 */
export async function salvarPix(
  _estado: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const habilitar = form.get("habilitado") === "on";
  const tipo = String(form.get("tipo") ?? "").trim() || null;
  const chave = String(form.get("chave") ?? "").trim() || null;
  const recebedor = String(form.get("recebedor") ?? "").trim() || null;
  const instrucoes = String(form.get("instrucoes") ?? "").trim() || null;

  if (habilitar && (!tipo || !chave || !recebedor)) {
    return { erro: "Para habilitar, informe tipo, chave e nome do recebedor." };
  }

  const dados = {
    is_enabled: habilitar,
    key_type: tipo,
    pix_key: chave,
    recipient_name: recebedor,
    instructions: instrucoes,
  };

  const supabase = await getSupabaseServerClient();
  try {
    const { data: atual } = await supabase.from("pix_key_settings").select("id").maybeSingle();
    if (atual) {
      const { error, count } = await supabase
        .from("pix_key_settings")
        .update(dados, { count: "exact" })
        .eq("id", (atual as { id: string }).id);
      if (error) throw error;
      const semLinha = conferirLinhas(count);
      if (semLinha) return semLinha;
    } else {
      const { error } = await supabase.from("pix_key_settings").insert(dados);
      if (error) throw error;
    }
    // A chave em si nunca vai para log (03 §31); o logger já redige "pix".
    return ok("Configuração do Pix salva.");
  } catch (erro) {
    return falha("salvarPix", erro);
  }
}

// ------------------------------------------------------ limites de alerta
export async function salvarLimiteDeAlerta(
  _estado: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const chave = String(form.get("chave") ?? "").trim();
  const minutos = Number(String(form.get("minutos") ?? "").trim());
  if (!chave) return { erro: "Escolha o alerta." };
  if (!Number.isInteger(minutos) || minutos <= 0) {
    return { erro: "Informe o limite em minutos." };
  }

  const supabase = await getSupabaseServerClient();
  try {
    const { error } = await supabase
      .from("alert_thresholds")
      .upsert({ alert_key: chave, threshold_minutes: minutos }, { onConflict: "alert_key" });
    if (error) throw error;
    return ok("Limite de alerta salvo.");
  } catch (erro) {
    return falha("salvarLimiteDeAlerta", erro);
  }
}

export async function alternarAtivoLimite(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  const ativar = String(form.get("ativar")) === "true";
  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.from("alert_thresholds").update({ is_active: ativar }).eq("id", id);
  if (error) logger.error("configuracoes:alternarAtivoLimite", { code: (error as { code?: string }).code });
  revalidatePath(ROTA);
}
