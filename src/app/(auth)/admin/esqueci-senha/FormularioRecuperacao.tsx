"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button, Input } from "@/ui/components";
import { pedirRecuperacao, type EstadoRecuperacao } from "./actions";

/**
 * Formulário de recuperação.
 *
 * Usa os mesmos componentes do login — nenhum estilo novo foi criado.
 */
export function FormularioRecuperacao() {
  const [estado, acao, enviando] = useActionState<EstadoRecuperacao, FormData>(
    pedirRecuperacao,
    {},
  );

  if (estado.enviado) {
    return (
      <div className="mt-5">
        <p className="m-0 rounded-12 border border-tsb bg-ts px-3 py-3 text-[14px] font-semibold text-tsf">
          Se existir uma conta com esse e-mail, o link de redefinição já está a
          caminho.
        </p>
        <p className="mt-3 text-[13px] text-ink-2">
          O link vale por tempo limitado e só pode ser usado uma vez. Confira
          também a caixa de spam.
        </p>
        <Link
          href="/admin/login"
          className="mt-4 inline-flex min-h-touch items-center text-[14px] font-semibold text-ink-2"
        >
          ← Voltar para o login
        </Link>
      </div>
    );
  }

  return (
    <form action={acao} className="mt-5 flex flex-col gap-4">
      <Input
        label="E-mail"
        name="email"
        type="email"
        autoComplete="username"
        required
        placeholder="voce@pizzariashalon.com"
        hint="Enviamos um link para você definir uma senha nova."
      />

      {estado.erro ? (
        <p
          role="alert"
          className="m-0 rounded-12 border border-tdb bg-td px-3 py-3 text-[14px] font-semibold text-tdf"
        >
          {estado.erro}
        </p>
      ) : null}

      <Button type="submit" tamanho="lg" fullWidth disabled={enviando}>
        {enviando ? "Enviando..." : "Enviar link de redefinição"}
      </Button>

      <Link
        href="/admin/login"
        className="inline-flex min-h-touch items-center justify-center text-[14px] font-semibold text-ink-2"
      >
        ← Voltar para o login
      </Link>
    </form>
  );
}
