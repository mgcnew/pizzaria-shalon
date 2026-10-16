"use client";

import { useActionState, useEffect, useState, useSyncExternalStore } from "react";
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
const CHAVE_EMAIL = "shalon:login-email";

const semInscricao = () => () => {};

function lerEmailLembrado(): string {
  try {
    return window.localStorage.getItem(CHAVE_EMAIL) ?? "";
  } catch {
    return "";
  }
}

/**
 * LEMBRAR O E-MAIL (15/10/2026): o aparelho guarda só o e-mail — a senha nunca
 * é guardada por esta tela (o gerenciador de senhas do próprio navegador
 * continua podendo oferecer isso). Quem volta ao painel só digita a senha.
 * Desmarcar o campo apaga o e-mail guardado.
 */
export function FormularioLogin({ proximo }: { proximo: string }) {
  const [estado, acao, enviando] = useActionState<EstadoLogin, FormData>(entrar, {});

  // No servidor não há e-mail lembrado; no navegador, o guardado.
  const lembrado = useSyncExternalStore(semInscricao, lerEmailLembrado, () => "");
  const [digitado, setDigitado] = useState<string | null>(null);
  const [lembrar, setLembrar] = useState(true);
  const email = digitado ?? estado.email ?? lembrado;

  // Com o e-mail já conhecido, o cursor vai direto para a senha.
  useEffect(() => {
    document.getElementById(lembrado ? "campo-senha" : "campo-e-mail")?.focus();
  }, [lembrado]);

  function aoEnviar() {
    try {
      if (lembrar && email.trim()) window.localStorage.setItem(CHAVE_EMAIL, email.trim());
      else window.localStorage.removeItem(CHAVE_EMAIL);
    } catch {
      // Sem armazenamento, só não se lembra na próxima visita.
    }
  }

  return (
    <form action={acao} onSubmit={aoEnviar} className="mt-[24px] flex flex-col gap-4">
      <input type="hidden" name="proximo" value={proximo} />

      <Input
        label="E-mail"
        name="email"
        type="email"
        autoComplete="username"
        value={email}
        onChange={(e) => setDigitado(e.target.value)}
        autoCapitalize="none"
        spellCheck={false}
        required
        placeholder="voce@pizzariashalon.com"
      />

      <CampoDeSenha
        id="campo-senha"
        label="Senha"
        name="senha"
        autoComplete="current-password"
        required
        placeholder="Sua senha"
      />

      <label className="-mt-1 flex min-h-touch cursor-pointer items-center gap-2.5 text-[14px] text-ink">
        <input
          type="checkbox"
          checked={lembrar}
          onChange={(e) => setLembrar(e.target.checked)}
          className="h-5 w-5 shrink-0 accent-[var(--brand-orange)]"
        />
        Lembrar meu e-mail neste aparelho
      </label>

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
