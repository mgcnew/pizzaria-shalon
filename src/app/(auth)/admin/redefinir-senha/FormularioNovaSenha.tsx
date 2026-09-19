"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Input } from "@/ui/components";
import { getSupabaseBrowserClient } from "@/infrastructure/supabase/client";
import { definirNovaSenha, type EstadoNovaSenha } from "./actions";

/**
 * Definição da nova senha, a partir do link do e-mail.
 *
 * POR QUE ESTA PARTE É DE CLIENTE.
 *
 * O link de recuperação entrega o token no FRAGMENTO da URL (depois do `#`),
 * que o navegador nunca envia ao servidor. Só o navegador consegue lê-lo.
 * O cliente do Supabase o consome ao ser criado, grava a sessão nos cookies
 * e avisa por `onAuthStateChange` — e é só a partir daí que o servidor
 * enxerga a sessão de recuperação.
 *
 * A SENHA, essa não passa por aqui: o formulário a envia para uma Server
 * Action (§31).
 *
 * Enquanto o token não é consumido, a tela diz que está conferindo o link —
 * em vez de mostrar um formulário que ainda não funcionaria.
 */
type Situacao = "conferindo" | "pronto" | "invalido";

export function FormularioNovaSenha() {
  const [situacao, setSituacao] = useState<Situacao>("conferindo");
  const [estado, acao, enviando] = useActionState<EstadoNovaSenha, FormData>(
    definirNovaSenha,
    {},
  );

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    // A assinatura é o caminho normal: o cliente consome o token da URL ao
    // nascer e emite o evento quando termina.
    const { data } = supabase.auth.onAuthStateChange((_evento, sessao) => {
      setSituacao(sessao ? "pronto" : "invalido");
    });

    // Quem chega com a sessão já estabelecida (por exemplo, recarregando a
    // página) não veria evento algum.
    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSituacao("pronto");
    });

    // Link velho, já usado ou adulterado não produz sessão nenhuma, e nada
    // chega a acontecer. Sem este prazo a tela ficaria "conferindo" para
    // sempre.
    const prazo = setTimeout(() => {
      setSituacao((atual) => (atual === "conferindo" ? "invalido" : atual));
    }, 4000);

    return () => {
      data.subscription.unsubscribe();
      clearTimeout(prazo);
    };
  }, []);

  if (estado.ok) {
    return (
      <div className="mt-5">
        <p className="m-0 rounded-12 border border-tsb bg-ts px-3 py-3 text-[14px] font-semibold text-tsf">
          Senha definida. Entre com ela agora.
        </p>
        <Link
          href="/admin/login"
          className="mt-4 inline-flex min-h-touch-cta w-full items-center justify-center rounded-12 bg-cta text-[16px] font-semibold text-cta-fg no-underline"
        >
          Ir para o login
        </Link>
      </div>
    );
  }

  if (situacao === "conferindo") {
    return (
      <p className="mt-5 text-[14px] text-ink-2">Conferindo o link…</p>
    );
  }

  if (situacao === "invalido") {
    return (
      <div className="mt-5">
        <p
          role="alert"
          className="m-0 rounded-12 border border-tdb bg-td px-3 py-3 text-[14px] font-semibold text-tdf"
        >
          Este link não é válido ou já foi usado.
        </p>
        <p className="mt-3 text-[13px] text-ink-2">
          Links de redefinição valem por tempo limitado e servem uma vez só.
        </p>
        <Link
          href="/admin/esqueci-senha"
          className="mt-4 inline-flex min-h-touch items-center text-[14px] font-semibold text-ink-2"
        >
          Pedir um novo link
        </Link>
      </div>
    );
  }

  return (
    <form action={acao} className="mt-5 flex flex-col gap-4">
      <Input
        label="Nova senha"
        name="senha"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        hint="Pelo menos 8 caracteres."
      />

      <Input
        label="Repita a nova senha"
        name="confirmacao"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
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
        {enviando ? "Salvando..." : "Definir senha"}
      </Button>
    </form>
  );
}
