/**
 * Logging seguro.
 *
 * 03-RLS-RBAC-SEGURANCA.md §31 proíbe registrar telefone completo, endereço
 * completo, chave Pix, dados financeiros de funcionário, tokens de tracking e
 * credenciais locais. Este logger redige esses campos por nome antes de
 * imprimir e nunca deve ser contornado com console.log direto.
 */

const CAMPOS_SENSIVEIS = [
  "whatsapp",
  "telefone",
  "phone",
  "endereco",
  "address",
  "pix",
  "pix_key",
  "chavePix",
  "token",
  "tracking_token",
  "salario",
  "salary",
  "password",
  "senha",
  "apiKey",
  "api_key",
  "service_role",
  "serviceRole",
  "authorization",
] as const;

function ehSensivel(chave: string): boolean {
  const k = chave.toLowerCase();
  return CAMPOS_SENSIVEIS.some((c) => k.includes(c.toLowerCase()));
}

function redigir(valor: unknown, profundidade = 0): unknown {
  if (profundidade > 4) return "[profundo]";
  if (valor === null || typeof valor !== "object") return valor;
  if (Array.isArray(valor)) {
    return valor.map((v) => redigir(v, profundidade + 1));
  }
  const saida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
    saida[k] = ehSensivel(k) ? "[redigido]" : redigir(v, profundidade + 1);
  }
  return saida;
}

type Contexto = Record<string, unknown>;

function emitir(nivel: "info" | "warn" | "error", msg: string, ctx?: Contexto) {
  const payload = ctx ? { msg, ...(redigir(ctx) as Contexto) } : { msg };
  const linha = JSON.stringify({ nivel, ts: new Date().toISOString(), ...payload });
  if (nivel === "error") console.error(linha);
  else console.warn(linha);
}

export const logger = {
  info: (msg: string, ctx?: Contexto) => emitir("info", msg, ctx),
  warn: (msg: string, ctx?: Contexto) => emitir("warn", msg, ctx),
  error: (msg: string, ctx?: Contexto) => emitir("error", msg, ctx),
  /** Exposto para teste. */
  _redigir: redigir,
};
