import { definirTema } from "@/application/preferencias/tema";
import type { Tema } from "@/ui/tema";

/**
 * Aparência — a seção "Light / Dark" do design aprovado.
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
    { valor: "claro", rotulo: "Light" },
    { valor: "escuro", rotulo: "Dark" },
  ];

  return (
    <div className="flex flex-wrap gap-[10px]">
      {opcoes.map((o) => {
        const ativo = o.valor === atual;
        return (
          <form key={o.valor} action={definirTema}>
            <input type="hidden" name="tema" value={o.valor} />
            <button
              type="submit"
              aria-pressed={ativo}
              className={[
                "min-h-[52px] cursor-pointer rounded-12 border-2 px-5 text-[14.5px] font-bold text-ink",
                ativo ? "border-brand-orange bg-tw" : "border-border-shalon bg-surface",
              ].join(" ")}
            >
              {o.rotulo}
            </button>
          </form>
        );
      })}
    </div>
  );
}
