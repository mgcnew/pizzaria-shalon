"use client";

import { useActionState } from "react";
import { Input } from "@/ui/components";
import { Button } from "@/ui/components";
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
    <form action={acao} className="mt-5 flex flex-col gap-4">
      <input type="hidden" name="proximo" value={proximo} />

      <Input
        label="E-mail"
        name="email"
        type="email"
        autoComplete="username"
        required
        placeholder="voce@pizzariashalon.com"
      />

      <Input
        label="Senha"
        name="senha"
        type="password"
        autoComplete="current-password"
        required
        placeholder="Sua senha"
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
        {enviando ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  );
}
