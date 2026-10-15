"use client";

import { useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

/**
 * Botão que dispara uma Server Action simples, sem estado de formulário.
 *
 * Usado nos "Pausar", "Inativar", "Remover" das listas do cardápio. Cada linha
 * é um formulário próprio, com os campos escondidos que a action precisa.
 *
 * FEEDBACK (15/10/2026): enquanto a action roda, o botão mostra a espera e
 * não aceita um segundo toque — antes não acontecia nada visível e a pessoa
 * tocava de novo. Ação que some com algo (`confirmar`) pede um segundo toque
 * explícito, ali mesmo na linha, sem abrir outra janela.
 */
function Botao({
  children,
  tom,
  tipo,
  aoClicar,
}: {
  children: ReactNode;
  tom: "neutro" | "perigo";
  tipo: "submit" | "button";
  aoClicar?: () => void;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type={tipo}
      onClick={aoClicar}
      disabled={pending}
      aria-busy={pending || undefined}
      className={[
        "inline-flex min-h-[42px] cursor-pointer items-center gap-2 rounded-10 border-[1.5px] px-[13px]",
        "text-[13px] font-semibold transition-colors disabled:cursor-wait disabled:opacity-70",
        tom === "perigo"
          ? "border-tdb bg-td text-tdf hover:opacity-90"
          : "border-border-shalon bg-transparent text-ink hover:border-brand-orange",
      ].join(" ")}
    >
      {pending ? (
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 animate-shalon-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : null}
      {children}
    </button>
  );
}

export function BotaoAcao({
  acao,
  campos,
  children,
  tom = "neutro",
  confirmar,
}: {
  acao: (form: FormData) => Promise<void>;
  campos: Record<string, string>;
  children: ReactNode;
  tom?: "neutro" | "perigo";
  /** Pergunta curta antes de executar (ex.: "Excluir esta promoção?"). */
  confirmar?: string;
}) {
  const [armado, setArmado] = useState(false);

  return (
    <form action={acao} className="flex flex-wrap items-center gap-2">
      {Object.entries(campos).map(([nome, valor]) => (
        <input key={nome} type="hidden" name={nome} value={valor} />
      ))}
      {confirmar && !armado ? (
        <Botao tipo="button" tom="neutro" aoClicar={() => setArmado(true)}>
          {children}
        </Botao>
      ) : (
        <>
          {confirmar ? (
            <span role="alert" className="text-[13px] font-semibold text-ink">
              {confirmar}
            </span>
          ) : null}
          <Botao tipo="submit" tom={tom}>
            {confirmar ? "Sim" : children}
          </Botao>
          {confirmar ? (
            <button
              type="button"
              onClick={() => setArmado(false)}
              className="min-h-[42px] cursor-pointer rounded-10 border-0 bg-transparent px-2 text-[13px] font-semibold text-ink-2 hover:text-ink"
            >
              Cancelar
            </button>
          ) : null}
        </>
      )}
    </form>
  );
}
