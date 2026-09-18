"use server";

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import { obterSessaoInterna } from "@/application/auth/sessao";
import { logger } from "@/lib/logger";
import type { EstadoFormulario } from "@/application/catalogo/tipos";

/**
 * Pipeline de imagem do catálogo.
 *
 * 05-PLANO-IMPLEMENTACAO.md §7.3 · 03-RLS-RBAC-SEGURANCA.md §23 e §24
 * 01-DOCUMENTO-MESTRE.md §79.7 · RN-PROD-003 · CLAUDE.md §35
 *
 *   upload → validação → otimização → Storage → referência no banco
 *
 * Decisões que NÃO são negociáveis aqui:
 *  · o binário vai para o Storage; o banco guarda referência e metadados.
 *    Base64 em coluna de negócio é proibido;
 *  · o tipo é decidido pelo CONTEÚDO do arquivo, não pela extensão nem pelo
 *    content-type informado pelo navegador — os dois são do cliente, e
 *    cliente não é autoridade (§23.3);
 *  · o caminho no Storage é gerado aqui. O nome enviado pela pessoa vira
 *    metadado, nunca caminho;
 *  · o upload usa o cliente autenticado da pessoa. Quem autoriza é a policy
 *    do Storage (`catalog.manage`), não este código.
 */

const BUCKET = "catalogo";
const LIMITE_ENTRADA = 8 * 1024 * 1024; // 8 MB de arquivo original
const FORMATOS_ACEITOS = ["jpeg", "png", "webp", "avif"] as const;

/** Largura máxima por uso. Banner é peça larga; card de produto não precisa. */
const LARGURA_MAXIMA: Record<"product" | "banner", number> = {
  product: 1200,
  banner: 1600,
};

type Otimizada = {
  bytes: Buffer;
  largura: number;
  altura: number;
  mime: string;
  extensao: string;
};

/**
 * Valida e otimiza. Devolve erro legível em vez de exceção porque a origem
 * é sempre um formulário.
 */
async function otimizar(
  arquivo: File,
  uso: "product" | "banner",
): Promise<{ ok: true; imagem: Otimizada } | { ok: false; erro: string }> {
  if (arquivo.size === 0) return { ok: false, erro: "Escolha um arquivo de imagem." };
  if (arquivo.size > LIMITE_ENTRADA) {
    return { ok: false, erro: "A imagem passa de 8 MB. Envie uma versão menor." };
  }

  const entrada = Buffer.from(await arquivo.arrayBuffer());

  let meta;
  try {
    // sharp lê o cabeçalho real do arquivo. Um .png renomeado para .jpg é
    // identificado pelo que ele é, não pelo que diz ser.
    meta = await sharp(entrada).metadata();
  } catch {
    return { ok: false, erro: "Arquivo não reconhecido como imagem." };
  }

  if (!meta.format || !(FORMATOS_ACEITOS as readonly string[]).includes(meta.format)) {
    return { ok: false, erro: "Formato não aceito. Use JPEG, PNG, WebP ou AVIF." };
  }
  if (!meta.width || !meta.height) {
    return { ok: false, erro: "Não foi possível ler as dimensões da imagem." };
  }

  const saida = await sharp(entrada)
    // aplica a orientação do EXIF e, em seguida, descarta os metadados —
    // sharp não os copia por padrão (§24: "remover metadados desnecessários")
    .rotate()
    .resize({ width: LARGURA_MAXIMA[uso], withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });

  return {
    ok: true,
    imagem: {
      bytes: saida.data,
      largura: saida.info.width,
      altura: saida.info.height,
      mime: "image/webp",
      extensao: "webp",
    },
  };
}

/**
 * Envia a imagem e cria a referência.
 *
 * Se o registro em `media_assets` falhar depois do upload, o objeto recém
 * enviado é removido: melhor não deixar arquivo órfão nascendo.
 */
async function enviar(
  arquivo: File,
  uso: "product" | "banner",
): Promise<{ ok: true; assetId: string } | { ok: false; erro: string }> {
  const otimizada = await otimizar(arquivo, uso);
  if (!otimizada.ok) return otimizada;

  const supabase = await getSupabaseServerClient();
  const sessao = await obterSessaoInterna();
  const caminho = `${uso === "banner" ? "banners" : "produtos"}/${randomUUID()}.${otimizada.imagem.extensao}`;

  const { error: erroUpload } = await supabase.storage
    .from(BUCKET)
    .upload(caminho, otimizada.imagem.bytes, {
      contentType: otimizada.imagem.mime,
      upsert: false,
    });

  if (erroUpload) {
    logger.error("midia:upload", { message: erroUpload.message });
    return {
      ok: false,
      erro: "Não foi possível enviar a imagem. Verifique se você tem permissão de catálogo.",
    };
  }

  const { data, error } = await supabase
    .from("media_assets")
    .insert({
      bucket: BUCKET,
      storage_path: caminho,
      mime_type: otimizada.imagem.mime,
      width: otimizada.imagem.largura,
      height: otimizada.imagem.altura,
      file_size_bytes: otimizada.imagem.bytes.byteLength,
      original_filename: arquivo.name.slice(0, 180),
      asset_type: uso,
      created_by: sessao?.appUserId ?? null,
    })
    .select("id")
    .single();

  if (error) {
    await supabase.storage.from(BUCKET).remove([caminho]);
    logger.error("midia:referencia", { code: (error as { code?: string }).code });
    return { ok: false, erro: "A imagem foi processada, mas não pôde ser registrada." };
  }

  return { ok: true, assetId: (data as { id: string }).id };
}

/** Envia uma imagem avulsa, para escolher depois em produto ou banner. */
export async function enviarImagem(
  _estado: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const arquivo = form.get("arquivo");
  const uso = String(form.get("uso") ?? "product") === "banner" ? "banner" : "product";
  if (!(arquivo instanceof File)) return { erro: "Escolha um arquivo de imagem." };

  const resultado = await enviar(arquivo, uso);
  if (!resultado.ok) return { erro: resultado.erro };

  revalidatePath("/admin/produtos");
  return { ok: "Imagem enviada." };
}

/**
 * Substituição segura (§23.4 e 79.7), nesta ordem:
 *   1. valida e processa a nova;
 *   2. salva o novo objeto;
 *   3. atualiza a referência do produto;
 *   4. só então remove o objeto antigo — e apenas se mais ninguém apontar
 *      para ele.
 *
 * Se o passo 3 falhar, o antigo continua no lugar. Nunca se apaga primeiro.
 */
export async function substituirImagemDoProduto(
  _estado: EstadoFormulario,
  form: FormData,
): Promise<EstadoFormulario> {
  const produtoId = String(form.get("produto_id") ?? "");
  const arquivo = form.get("arquivo");
  if (!produtoId) return { erro: "Produto não identificado." };
  if (!(arquivo instanceof File)) return { erro: "Escolha um arquivo de imagem." };

  const supabase = await getSupabaseServerClient();
  const { data: antes } = await supabase
    .from("products")
    .select("image_asset_id")
    .eq("id", produtoId)
    .maybeSingle();
  const anteriorId = (antes as { image_asset_id: string | null } | null)?.image_asset_id ?? null;

  const novo = await enviar(arquivo, "product");
  if (!novo.ok) return { erro: novo.erro };

  const { error, count } = await supabase
    .from("products")
    .update({ image_asset_id: novo.assetId }, { count: "exact" })
    .eq("id", produtoId);

  if (error || count === 0) {
    // A referência não mudou: desfaz o que acabou de subir para não deixar
    // lixo, e o produto continua com a imagem que já tinha.
    await removerAsset(novo.assetId);
    return { erro: "Não foi possível trocar a imagem. Verifique sua permissão de catálogo." };
  }

  if (anteriorId) await removerSeOrfao(anteriorId);

  revalidatePath("/admin/produtos");
  revalidatePath(`/admin/produtos/${produtoId}`);
  return { ok: "Imagem atualizada." };
}

/** Remove o asset e o objeto. Uso interno, já sabendo que não há referência. */
async function removerAsset(assetId: string): Promise<void> {
  const supabase = await getSupabaseServerClient();
  const { data } = await supabase
    .from("media_assets")
    .select("storage_path")
    .eq("id", assetId)
    .maybeSingle();

  const { error } = await supabase.from("media_assets").delete().eq("id", assetId);
  if (error) {
    logger.error("midia:removerAsset", { code: (error as { code?: string }).code });
    return;
  }
  const caminho = (data as { storage_path: string } | null)?.storage_path;
  if (caminho) await supabase.storage.from(BUCKET).remove([caminho]);
}

/**
 * Remove o objeto antigo SOMENTE se nada mais apontar para ele.
 *
 * As FKs são RESTRICT, então o DELETE falharia de qualquer forma; a consulta
 * antes existe para não transformar um caso normal em erro registrado.
 */
async function removerSeOrfao(assetId: string): Promise<void> {
  const supabase = await getSupabaseServerClient();

  const { count: emProdutos } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("image_asset_id", assetId);
  const { count: emBanners } = await supabase
    .from("banners")
    .select("id", { count: "exact", head: true })
    .eq("image_asset_id", assetId);

  if ((emProdutos ?? 0) > 0 || (emBanners ?? 0) > 0) return;
  await removerAsset(assetId);
}

/** Ação de tela: descartar uma imagem que não está em uso. */
export async function descartarImagem(form: FormData): Promise<void> {
  const assetId = String(form.get("asset_id") ?? "");
  if (!assetId) return;
  await removerSeOrfao(assetId);
  revalidatePath("/admin/produtos");
}

/** URL pública do objeto no bucket do catálogo. */
export async function urlPublica(caminho: string): Promise<string> {
  const supabase = await getSupabaseServerClient();
  return supabase.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl;
}
