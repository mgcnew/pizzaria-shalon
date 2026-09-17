import { z } from "zod";
import { AppError } from "@/lib/errors";

/**
 * Validação das variáveis de ambiente (CLAUDE.md §36, §45).
 *
 * Regras aplicadas aqui:
 *  - somente variáveis NEXT_PUBLIC_* podem chegar ao navegador;
 *  - a chave `service_role` NÃO é lida por este módulo e não deve existir em
 *    nenhuma variável pública (CLAUDE.md §13). Quando a Fase 2 precisar de
 *    acesso privilegiado server-side, isso será tratado em módulo próprio,
 *    server-only, com justificativa registrada;
 *  - nenhum valor real é versionado. Ver .env.example.
 */

const esquemaPublico = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url({
    message: "NEXT_PUBLIC_SUPABASE_URL deve ser uma URL válida",
  }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, {
    message: "NEXT_PUBLIC_SUPABASE_ANON_KEY é obrigatória",
  }),
});

export type EnvPublico = z.infer<typeof esquemaPublico>;

/**
 * Lê e valida as variáveis públicas.
 *
 * Lança AppError('config') com mensagem segura quando faltar configuração —
 * o que é o estado esperado na Fase 1, já que nenhum projeto Supabase foi
 * conectado ainda.
 */
export function lerEnvPublico(): EnvPublico {
  const resultado = esquemaPublico.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });

  if (!resultado.success) {
    const campos = resultado.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new AppError(
      "config",
      "Configuração de ambiente ausente ou inválida.",
      { internalMessage: `Variáveis inválidas: ${campos}` },
    );
  }

  return resultado.data;
}

/** Diz se o ambiente está configurado, sem lançar. Útil para shells da Fase 1. */
export function envPublicoConfigurado(): boolean {
  try {
    lerEnvPublico();
    return true;
  } catch {
    return false;
  }
}
