"use server";

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import { logger } from "@/lib/logger";
import type { Resultado } from "./tipos";

/**
 * Comprovante de lançamento financeiro.
 *
 * 05-PLANO-IMPLEMENTACAO.md §11.3 · 03-RLS-RBAC-SEGURANCA.md §23.2/§23.3/§23.4/§24
 *
 *   validar → processar → Storage privado → referência no banco
 *
 * O QUE ESTE ARQUIVO **NÃO** FAZ:
 *  1. não lê o comprovante. Não há OCR, não há extração de valor, não há
 *     conferência automática. O sistema guarda a evidência; quem a interpreta
 *     é uma pessoa;
 *  2. não confirma pagamento. Anexar arquivo não muda status nem reconhece
 *     receita — Pix antecipado continua esperando confirmação manual
 *     (RN-PGTO-010);
 *  3. não decide autorização. As policies do bucket (`finance.create` para
 *     escrever, `finance.view` para ler) e a RPC recusam a chamada direta do
 *     mesmo jeito.
 *
 * O TIPO É DECIDIDO PELO CONTEÚDO, não pela extensão nem pelo content-type
 * do navegador: os dois vêm do cliente, e cliente não é autoridade (§23.3).
 * Imagem passa pelo sharp, que além de identificar o formato real DESCARTA os
 * metadados — a foto de um comprovante costuma trazer GPS junto.
 */

const BUCKET = "comprovantes";
const ROTA = "/admin/financeiro";

/** Entrada: 8 MB. O que é guardado fica abaixo do limite de 5 MB do bucket. */
const LIMITE_ENTRADA = 8 * 1024 * 1024;
const LIMITE_GUARDADO = 5 * 1024 * 1024;
const IMAGENS_ACEITAS = ["jpeg", "png", "webp", "avif"] as const;

type Preparado = { bytes: Buffer; mime: string; extensao: string };

function falha(contexto: string, erro: unknown): Resultado {
  logger.error(`comprovante:${contexto}`, { code: (erro as { code?: string })?.code });
  return { ok: false, erro: "Não foi possível concluir esta ação agora. Tente de novo." };
}

/**
 * Aceita imagem ou PDF, e prova qual é olhando os bytes.
 *
 * PDF não é reprocessado: alterar o binário de um comprovante seria alterar a
 * evidência. Ele é validado pela assinatura `%PDF-` e guardado como está.
 */
async function preparar(
  arquivo: File,
): Promise<{ ok: true; arquivo: Preparado } | { ok: false; erro: string }> {
  if (arquivo.size === 0) return { ok: false, erro: "Escolha um arquivo." };
  if (arquivo.size > LIMITE_ENTRADA) {
    return { ok: false, erro: "O arquivo passa de 8 MB. Envie uma versão menor." };
  }

  const entrada = Buffer.from(await arquivo.arrayBuffer());

  // PDF: assinatura nos primeiros bytes. Nada de confiar no nome.
  if (entrada.subarray(0, 5).toString("latin1") === "%PDF-") {
    if (entrada.byteLength > LIMITE_GUARDADO) {
      return { ok: false, erro: "O PDF passa de 5 MB. Envie uma versão menor." };
    }
    return {
      ok: true,
      arquivo: { bytes: entrada, mime: "application/pdf", extensao: "pdf" },
    };
  }

  let meta;
  try {
    meta = await sharp(entrada).metadata();
  } catch {
    return { ok: false, erro: "Arquivo não reconhecido. Envie uma imagem ou um PDF." };
  }

  if (!meta.format || !(IMAGENS_ACEITAS as readonly string[]).includes(meta.format)) {
    return { ok: false, erro: "Formato não aceito. Envie JPEG, PNG, WebP, AVIF ou PDF." };
  }

  // Aplica a orientação do EXIF e descarta o resto — inclusive a localização
  // de onde a foto foi tirada (§24).
  const saida = await sharp(entrada)
    .rotate()
    .resize({ width: 2000, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();

  if (saida.byteLength > LIMITE_GUARDADO) {
    return { ok: false, erro: "A imagem ficou grande demais mesmo otimizada." };
  }

  return { ok: true, arquivo: { bytes: saida, mime: "image/webp", extensao: "webp" } };
}

const anexarSchema = z.object({ lancamento_id: z.string().uuid() });

/**
 * Anexa (ou substitui) o comprovante de um lançamento.
 *
 * A ordem é a de §23.4 e não é negociável:
 *   1. valida e processa o novo arquivo;
 *   2. envia o novo objeto;
 *   3. a RPC troca a referência numa transação e devolve o caminho antigo;
 *   4. só então o objeto antigo é removido.
 *
 * Se o passo 3 falhar, o objeto recém-enviado é apagado: melhor não deixar
 * arquivo órfão nascendo. Se o passo 4 falhar, a referência já está correta e
 * o que sobra é um objeto sem dono — registrado no log para limpeza, nunca
 * uma referência quebrada.
 */
export async function anexarComprovante(
  _estado: Resultado | null,
  form: FormData,
): Promise<Resultado> {
  const v = anexarSchema.safeParse({ lancamento_id: String(form.get("lancamento_id") ?? "") });
  if (!v.success) return { ok: false, erro: "Lançamento não identificado." };

  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File)) return { ok: false, erro: "Escolha um arquivo." };

  const preparado = await preparar(arquivo);
  if (!preparado.ok) return { ok: false, erro: preparado.erro };

  const supabase = await getSupabaseServerClient();
  // `financeiro/` é NAMESPACE, não pasta decorativa: a policy do Storage e a
  // RPC exigem exatamente esta forma — namespace, id do lançamento, uuid do
  // arquivo (migrations 0103 e 0104). Quem tem permissão interna não alcança
  // este prefixo, e o id no meio do caminho é conferido contra o lançamento
  // que está sendo anexado.
  const caminho = `financeiro/${v.data.lancamento_id}/${randomUUID()}.${preparado.arquivo.extensao}`;

  const { error: erroUpload } = await supabase.storage
    .from(BUCKET)
    .upload(caminho, preparado.arquivo.bytes, {
      contentType: preparado.arquivo.mime,
      upsert: false,
    });

  if (erroUpload) {
    logger.error("comprovante:upload", { message: erroUpload.message });
    return {
      ok: false,
      erro: "Não foi possível enviar o comprovante. Verifique se você tem permissão financeira.",
    };
  }

  const { data, error } = await supabase.rpc("anexar_comprovante", {
    p_lancamento: v.data.lancamento_id,
    p_arquivo: {
      caminho,
      mime: preparado.arquivo.mime,
      bytes: preparado.arquivo.bytes.byteLength,
      nome: arquivo.name.slice(0, 180),
    },
  });

  if (error) {
    await supabase.storage.from(BUCKET).remove([caminho]);
    return falha("anexar", error);
  }

  const r = (data ?? {}) as Record<string, unknown>;
  if (!r["ok"]) {
    await supabase.storage.from(BUCKET).remove([caminho]);
    return { ok: false, erro: String(r["erro"] ?? "Não foi possível anexar o comprovante.") };
  }

  // A referência já aponta para o novo. Agora o antigo pode sair.
  const anterior = r["anterior_path"];
  if (typeof anterior === "string" && anterior.length > 0) {
    const { error: erroRemocao } = await supabase.storage.from(BUCKET).remove([anterior]);
    if (erroRemocao) {
      logger.error("comprovante:orfao", { message: erroRemocao.message, caminho: anterior });
    }
  }

  revalidatePath(ROTA);
  return { ok: true, mensagem: "Comprovante anexado." };
}

const removerSchema = z.object({
  lancamento_id: z.string().uuid(),
  motivo: z.string().min(3).max(400),
});

/**
 * Remove o comprovante de um lançamento que ainda pode ser alterado.
 *
 * Lançamento estornado é histórico: a RPC recusa, e é assim que a reversão
 * deixa de poder apagar a evidência do movimento original.
 */
export async function removerComprovante(entrada: unknown): Promise<Resultado> {
  const v = removerSchema.safeParse(entrada);
  if (!v.success) return { ok: false, erro: "Informe o motivo da remoção." };

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("remover_comprovante", {
    p_lancamento: v.data.lancamento_id,
    p_motivo: v.data.motivo,
  });
  if (error) return falha("remover", error);

  const r = (data ?? {}) as Record<string, unknown>;
  if (!r["ok"]) {
    return { ok: false, erro: String(r["erro"] ?? "Não foi possível remover o comprovante.") };
  }

  const caminho = r["caminho"];
  if (typeof caminho === "string" && caminho.length > 0) {
    const { error: erroRemocao } = await supabase.storage.from(BUCKET).remove([caminho]);
    if (erroRemocao) {
      logger.error("comprovante:orfao", { message: erroRemocao.message, caminho });
    }
  }

  revalidatePath(ROTA);
  return { ok: true, mensagem: "Comprovante removido." };
}

/**
 * URL assinada e curta para ver o comprovante (§23.2).
 *
 * O bucket é privado: sem assinatura, o caminho não abre nada. A assinatura
 * só é emitida a quem a policy de leitura aceita — quem tem `finance.view`.
 * Dois minutos bastam para abrir o arquivo e não sobrevivem a um link
 * copiado para fora.
 */
export async function urlDoComprovante(caminho: string): Promise<string | null> {
  if (typeof caminho !== "string" || caminho.length === 0) return null;

  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(caminho, 120);

  if (error) {
    logger.error("comprovante:assinatura", { message: error.message });
    return null;
  }
  return data?.signedUrl ?? null;
}
