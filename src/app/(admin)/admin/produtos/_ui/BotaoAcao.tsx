import type { ReactNode } from "react";

/**
 * Botão que dispara uma Server Action simples, sem estado de formulário.
 *
 * Usado nos "Alternar disponibilidade" do design: cada linha da lista é um
 * formulário próprio, com os campos escondidos que a action precisa. Sem
 * JavaScript de cliente — funciona como formulário HTML.
 */
export function BotaoAcao({
  acao,
  campos,
  children,
  tom = "neutro",
}: {
  acao: (form: FormData) => Promise<void>;
  campos: Record<string, string>;
  children: ReactNode;
  tom?: "neutro" | "perigo";
}) {
  return (
    <form action={acao}>
      {Object.entries(campos).map(([nome, valor]) => (
        <input key={nome} type="hidden" name={nome} value={valor} />
      ))}
      <button
        type="submit"
        className={[
          "inline-flex min-h-[42px] cursor-pointer items-center rounded-10 border-[1.5px] px-[13px]",
          "text-[13px] font-semibold",
          tom === "perigo"
            ? "border-transparent bg-transparent text-danger hover:border-tdb"
            : "border-border-shalon bg-transparent text-ink hover:border-brand-orange",
        ].join(" ")}
      >
        {children}
      </button>
    </form>
  );
}
