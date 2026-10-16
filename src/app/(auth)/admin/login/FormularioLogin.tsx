"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button, Input } from "@/ui/components";
import { CampoDeSenha } from "../../_ui/CampoDeSenha";
import { entrar, type EstadoLogin } from "./actions";

/**
 * Formulário de login.
 *
 * Usa os componentes já extraídos do design (Input e Button) — nenhum estilo
 * novo foi criado. O alerta de erro reutiliza a família tonal de perigo
 * (--td / --tdb / --tdf), a mesma dos alertas do protótipo.
 */
export function FormularioLogin({ proximo }: { proximo: string }) {
  const [estado, acao, enviando] = useActionState<EstadoLogin, FormData>(entrar, {});

  return (
    <form action={acao} className="mt-[24px] flex flex-col gap-4">
      <input type="hidden" name="proximo" value={proximo} />

      <Input
        label="E-mail"
        name="email"
        type="email"
        autoComplete="username"
        defaultValue={estado.email ?? ""}
        autoCapitalize="none"
        spellCheck={false}
        autoFocus
        required
        placeholder="voce@pizzariashalon.com"
      />

      <CampoDeSenha
        label="Senha"
        name="senha"
        autoComplete="current-password"
        required
        placeholder="Sua senha"
      />

      {estado.erro ? (
        <p
          role="alert"
          className="m-0 flex items-start gap-2 rounded-12 border border-tdb bg-td px-3 py-3 text-[14px] font-semibold text-tdf"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="mt-[1px] h-5 w-5 shrink-0">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
            <path d="M12 7.5v5.5M12 16.5v.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span>{estado.erro}</span>
        </p>
      ) : null}

      <Button type="submit" tamanho="lg" fullWidth disabled={enviando} aria-busy={enviando || undefined}>
        {enviando ? (
          <>
            <span
              aria-hidden="true"
              className="h-4 w-4 animate-shalon-spin rounded-full border-2 border-current border-t-transparent"
            />
            Entrando…
          </>
        ) : (
          "Entrar"
        )}
      </Button>

      <Link
        href="/admin/esqueci-senha"
        className="inline-flex min-h-touch items-center justify-center text-[14px] font-semibold text-ink-2 hover:text-ink"
      >
        Esqueci minha senha
      </Link>
    </form>
  );
}
