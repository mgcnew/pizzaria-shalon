"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import { logger } from "@/lib/logger";
import type { ContatoPreparado, Resultado, ResultadoDoPreparo } from "./tipos";

/**
 * Operações do remarketing assistido.
 *
 * O QUE ESTE ARQUIVO NÃO FAZ, e não por falta de tempo (CLAUDE.md §31):
 *  1. não envia mensagem — devolve o link `wa.me` para a pessoa abrir;
 *  2. não fala com a API do WhatsApp Business;
 *  3. não escreve o texto: o template é humano, e o funcionário pode editar;
 *  4. não marca nada como "enviado" porque o link foi aberto. Abrir não é
 *     falar; o desfecho é informado depois, por quem falou.
 */

const ROTA_REMARKETING = "/admin/remarketing";
const ROTA_CLIENTES = "/admin/clientes";

const prepararSchema = z.object({
  cliente_id: z.string().uuid(),
  template_id: z.string().uuid().optional(),
  mensagem: z.string().trim().min(5).max(700).optional(),
  segmento: z.string().max(60).optional(),
});

/**
 * Monta o link do WhatsApp.
 *
 * `wa.me` é um link comum de navegador, não integração: não há credencial,
 * não há webhook e não há nada que a Shalon precise contratar. É exatamente
 * o que §31 autoriza.
 */
function linkDoWhatsapp(numero: string | null, mensagem: string): string {
  const digitos = (numero ?? "").replace(/\D/g, "");
  return `https://wa.me/${digitos}?text=${encodeURIComponent(mensagem)}`;
}

export async function prepararContato(entrada: unknown): Promise<ResultadoDoPreparo> {
  const v = prepararSchema.safeParse(entrada);
  if (!v.success) return { ok: false, erro: "Escolha o cliente e escreva a mensagem." };
  if (!v.data.template_id && !v.data.mensagem) {
    return { ok: false, erro: "Escolha um template ou escreva a mensagem." };
  }

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("preparar_contato_de_remarketing", {
    p_dados: {
      cliente_id: v.data.cliente_id,
      template_id: v.data.template_id ?? null,
      mensagem: v.data.mensagem ?? null,
      segmento: v.data.segmento ?? null,
      promocional: true,
    },
  });

  if (error) {
    logger.error("remarketing:prepararContato", {
      code: (error as { code?: string }).code,
    });
    return { ok: false, erro: "Não foi possível preparar o contato agora." };
  }

  const r = (data ?? {}) as Record<string, unknown>;
  if (!r["ok"]) {
    return {
      ok: false,
      erro: String(r["erro"] ?? "Não foi possível preparar o contato."),
      ...(r["sem_consentimento"] ? { semConsentimento: true } : {}),
      ...(r["bloqueado"] ? { bloqueado: true } : {}),
    };
  }

  const contato = data as ContatoPreparado;
  revalidatePath(ROTA_REMARKETING);
  return {
    ok: true,
    contato,
    link: linkDoWhatsapp(contato.whatsapp, contato.mensagem),
  };
}

const resultadoSchema = z.object({
  contato_id: z.string().uuid(),
  resultado: z.enum(["contacted", "no_response", "interested", "opted_out", "other"]),
  observacao: z.string().max(400).optional(),
});

/**
 * RN-RMKT-004. O desfecho é INFORMADO por quem falou — o sistema não deduz.
 * E `opted_out` retira o consentimento dentro da mesma transação, no banco:
 * se ficasse para uma segunda chamada, uma falha de rede deixaria o cliente
 * pedindo para sair e continuando na próxima lista.
 */
export async function registrarResultado(entrada: unknown): Promise<Resultado> {
  const v = resultadoSchema.safeParse(entrada);
  if (!v.success) return { ok: false, erro: "Informe o resultado do contato." };

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("registrar_resultado_do_contato", {
    p_dados: {
      contato_id: v.data.contato_id,
      resultado: v.data.resultado,
      observacao: v.data.observacao ?? null,
    },
  });

  if (error) {
    logger.error("remarketing:registrarResultado", {
      code: (error as { code?: string }).code,
    });
    return { ok: false, erro: "Não foi possível registrar agora. Tente de novo." };
  }

  const r = (data ?? {}) as Record<string, unknown>;
  if (!r["ok"]) {
    return {
      ok: false,
      erro: String(r["erro"] ?? "Não foi possível registrar o resultado."),
      ...(r["ja_informado"] ? { jaInformado: true } : {}),
    };
  }

  revalidatePath(ROTA_REMARKETING);
  revalidatePath(ROTA_CLIENTES);
  return { ok: true };
}

const templateSchema = z.object({
  id: z.string().uuid().optional(),
  nome: z.string().trim().min(2).max(60),
  mensagem: z.string().trim().min(5).max(700),
  ativo: z.boolean().optional(),
  ordem: z.number().int().min(0).max(999).optional(),
});

/** Template é texto escrito por gente. O sistema só guarda. */
export async function salvarTemplate(entrada: unknown): Promise<Resultado> {
  const v = templateSchema.safeParse(entrada);
  if (!v.success) return { ok: false, erro: "Informe o nome e a mensagem do template." };

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("salvar_template_de_remarketing", {
    p_dados: {
      id: v.data.id ?? null,
      nome: v.data.nome,
      mensagem: v.data.mensagem,
      ativo: v.data.ativo ?? true,
      ordem: v.data.ordem ?? 0,
    },
  });

  if (error) {
    logger.error("remarketing:salvarTemplate", {
      code: (error as { code?: string }).code,
    });
    return { ok: false, erro: "Não foi possível salvar agora. Tente de novo." };
  }

  const r = (data ?? {}) as Record<string, unknown>;
  if (!r["ok"]) return { ok: false, erro: String(r["erro"] ?? "Não foi possível salvar.") };

  revalidatePath(ROTA_REMARKETING);
  return { ok: true };
}
