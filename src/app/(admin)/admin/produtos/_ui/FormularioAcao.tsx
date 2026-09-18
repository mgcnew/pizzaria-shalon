"use client";

import { useActionState, type ReactNode } from "react";
import { Button } from "@/ui/components";
import { Aviso } from "@/ui/patterns";
import type { EstadoFormulario } from "@/application/catalogo/tipos";

/**
 * Casca de formulário ligada a uma Server Action.
 *
 * Existe para que cada tela não repita `useActionState`, o aviso de erro e o
 * estado "enviando". Os campos vêm de fora — o componente não sabe nem
 * precisa saber o que está sendo salvo.
 *
 * O resultado exibido é o que a action devolveu. Quando o RLS recusa, a
 * mensagem diz isso em vez de fingir sucesso.
 */
export function FormularioAcao({
  acao,
  rotulo,
  children,
  variante = "primario",
  tamanho = "md",
  className = "",
}: {
  acao: (estado: EstadoFormulario, form: FormData) => Promise<EstadoFormulario>;
  rotulo: string;
  children: ReactNode;
  variante?: "primario" | "secundario";
  tamanho?: "sm" | "md" | "lg";
  className?: string;
}) {
  const [estado, enviar, enviando] = useActionState<EstadoFormulario, FormData>(acao, {});

  return (
    <form action={enviar} className={`flex flex-col gap-3 ${className}`}>
      {children}
      <Aviso {...(estado.erro ? { erro: estado.erro } : {})} {...(estado.ok ? { ok: estado.ok } : {})} />
      <div>
        <Button type="submit" variante={variante} tamanho={tamanho} disabled={enviando}>
          {enviando ? "Salvando..." : rotulo}
        </Button>
      </div>
    </form>
  );
}
