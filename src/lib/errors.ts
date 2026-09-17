/**
 * Erros de aplicação.
 *
 * Erros devem ser seguros, úteis e observáveis, sem vazar segredo ou detalhe
 * interno desnecessário (CLAUDE.md §37).
 *
 * `publicMessage` é o que pode ser mostrado ao usuário.
 * `cause` fica para o log interno e nunca deve ser exibido.
 */

export type AppErrorKind =
  | "config"
  | "validation"
  | "not_found"
  | "unauthorized"
  | "forbidden"
  | "conflict"
  | "unexpected";

export class AppError extends Error {
  readonly kind: AppErrorKind;
  readonly publicMessage: string;

  constructor(
    kind: AppErrorKind,
    publicMessage: string,
    options?: { cause?: unknown; internalMessage?: string },
  ) {
    super(options?.internalMessage ?? publicMessage, { cause: options?.cause });
    this.name = "AppError";
    this.kind = kind;
    this.publicMessage = publicMessage;
  }
}

/** Mensagem segura para a interface, sem detalhe interno. */
export function toPublicMessage(error: unknown): string {
  if (error instanceof AppError) return error.publicMessage;
  return "Algo não saiu como esperado. Tente novamente em alguns instantes.";
}
