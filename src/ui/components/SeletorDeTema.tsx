import { definirTema } from "@/application/preferencias/tema";
import type { Tema } from "@/ui/tema";

/**
 * Alternância claro/escuro exibida na topbar administrativa.
 *
 * DECISÃO REGISTRADA: isto é preferência DO DISPOSITIVO, não configuração da
 * loja. No protótipo o claro/escuro era estado local da demonstração, e o
 * acento amarelo/vermelho era trocado pelo painel de ajustes do próprio
 * protótipo — mecanismo de preview que PI-004 manda não transportar.
 *
 * Gravar no banco faria a preferência de uma pessoa valer para toda a equipe,
 * o que nenhum documento pede. Então vai para um cookie.
 *
 * COOKIE E NÃO localStorage: com cookie o SERVIDOR já sabe o tema e devolve o
 * HTML certo de primeira — sem script bloqueante corrigindo o `<html>` antes
 * da pintura, que provocaria divergência de hidratação.
 *
 * Componente de servidor: dois botões de submit, sem JavaScript de cliente.
 */
export function SeletorDeTema({ atual }: { atual: Tema }) {
  const opcoes: { valor: Tema; rotulo: string }[] = [
    { valor: "claro", rotulo: "Usar modo claro" },
    { valor: "escuro", rotulo: "Usar modo escuro" },
  ];

  return (
    <div
      className="flex shrink-0 items-center rounded-pill border border-border-shalon bg-bg p-0.5 sm:p-1"
      role="group"
      aria-label="Tema da interface"
    >
      {opcoes.map((o) => {
        const ativo = o.valor === atual;
        return (
          <form key={o.valor} action={definirTema}>
            <input type="hidden" name="tema" value={o.valor} />
            <button
              type="submit"
              aria-pressed={ativo}
              aria-label={o.rotulo}
              title={o.rotulo}
              className={[
                "flex h-8 w-8 cursor-pointer items-center justify-center rounded-pill border-0 sm:h-9 sm:w-9",
                "motion-interactive transition-colors",
                ativo
                  ? "bg-cta text-cta-fg shadow-sm"
                  : "bg-transparent text-muted hover:bg-surface hover:text-ink",
              ].join(" ")}
            >
              {o.valor === "claro" ? (
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[15px] w-[15px] sm:h-[18px] sm:w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />
                </svg>
              ) : (
                <svg aria-hidden="true" viewBox="0 0 24 24" className="h-[15px] w-[15px] sm:h-[18px] sm:w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
                </svg>
              )}
            </button>
          </form>
        );
      })}
    </div>
  );
}
