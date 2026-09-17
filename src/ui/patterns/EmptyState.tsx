import type { ReactNode } from "react";

/**
 * EmptyState — padrão de estado vazio do design aprovado.
 *
 * Aparece em: busca sem resultado, categoria sem itens, carrinho vazio, sem
 * pedidos no filtro, sem movimentações, sem acertos, sem clientes, sem
 * contatos e "nada pendente agora".
 *
 * Medidas do protótipo: borda tracejada de 1px, raio 14-18px, fundo --elev,
 * texto centralizado.
 */

export function EmptyState({
  titulo,
  descricao,
  acao,
}: {
  titulo: string;
  descricao?: string;
  acao?: ReactNode;
}) {
  return (
    <div className="rounded-16 border border-dashed border-border-shalon bg-elev px-5 py-[30px] text-center">
      <p className="m-0 font-semibold text-ink">{titulo}</p>
      {descricao ? (
        <p className="mt-[6px] text-[14px] text-ink-2">{descricao}</p>
      ) : null}
      {acao ? <div className="mt-[14px] flex justify-center">{acao}</div> : null}
    </div>
  );
}
