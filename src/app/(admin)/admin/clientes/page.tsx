import type { Metadata } from "next";
import Link from "next/link";
import { listarClientes } from "@/application/clientes/consultas";
import type { Cadencia as ValorDeCadencia, FiltrosDeClientes as Filtros } from "@/application/clientes/tipos";
import { Cartao, EmptyState } from "@/ui/patterns";
import { formatBRL } from "@/lib/format";
import { Cadencia } from "./_ui/Cadencia";
import { FiltrosDeClientes } from "./_ui/FiltrosDeClientes";

export const metadata: Metadata = { title: "Clientes" };

const CADENCIAS: ValorDeCadencia[] = [
  "recorrente",
  "atencao",
  "afastado",
  "base_fraca",
  "dados_insuficientes",
];

/**
 * /admin/clientes
 *
 * CADA LINHA SE EXPLICA. Ao lado do selo de cadência vem a frase que o banco
 * montou com os mesmos números da linha — "compra a cada ~9 dias e está há 21
 * dias sem comprar". Não existe pontuação, score ou "cliente ouro": se a
 * Shalon não consegue repetir a conta em voz alta, o número não entra na tela
 * (§14 da autorização da Fase 9).
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ausencia?: string; cadencia?: string; busca?: string }>;
}) {
  const { ausencia, cadencia, busca } = await searchParams;

  const filtros: Filtros = {
    ...(ausencia && Number.isFinite(Number(ausencia))
      ? { ausencia_minima: Number(ausencia) }
      : {}),
    ...(CADENCIAS.includes(cadencia as ValorDeCadencia)
      ? { classificacao: cadencia as ValorDeCadencia }
      : {}),
    ...(busca ? { busca } : {}),
    limite: 100,
  };

  const lista = await listarClientes(filtros);

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="m-0 font-display text-[24px] font-bold text-ink">Clientes</h1>
        <p className="m-0 mt-1 text-[13.5px] text-muted">
          Quem compra, com que frequência e há quanto tempo não aparece.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {[
          { rotulo: "Recorrentes", valor: lista.resumo.recorrentes },
          { rotulo: "Em atenção", valor: lista.resumo.atencao },
          { rotulo: "Afastados", valor: lista.resumo.afastados },
          { rotulo: "Base fraca", valor: lista.resumo.base_fraca },
          { rotulo: "Sem histórico", valor: lista.resumo.dados_insuficientes },
          { rotulo: "Sem consentimento", valor: lista.resumo.sem_consentimento },
        ].map((c) => (
          <div key={c.rotulo} className="rounded-16 border border-border-shalon bg-surface p-3">
            <p className="m-0 text-[12px] font-semibold uppercase tracking-[0.04em] text-muted">
              {c.rotulo}
            </p>
            <p className="m-0 mt-1 font-display text-[20px] font-bold text-ink">{c.valor}</p>
          </div>
        ))}
      </section>

      <Cartao largura="cheio">
        <FiltrosDeClientes {...(ausencia ? { ausencia } : {})} {...(cadencia ? { classificacao: cadencia } : {})} />
      </Cartao>

      <Cartao
        titulo={`${lista.total_filtrado} ${lista.total_filtrado === 1 ? "cliente" : "clientes"}`}
        {...(lista.total_filtrado > lista.clientes.length
          ? { descricao: `Mostrando os ${lista.clientes.length} primeiros.` }
          : {})}
        largura="cheio"
      >
        {lista.clientes.length === 0 ? (
          <EmptyState
            titulo="Nenhum cliente neste filtro"
            descricao="Ajuste o período de ausência ou a cadência."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-[13px]">
              <thead>
                <tr className="text-left text-muted">
                  <th className="border-b border-border-shalon py-2 font-semibold">Cliente</th>
                  <th className="border-b border-border-shalon py-2 font-semibold">Cadência</th>
                  <th className="border-b border-border-shalon py-2 text-right font-semibold">
                    Pedidos
                  </th>
                  <th className="border-b border-border-shalon py-2 text-right font-semibold">
                    Ticket médio
                  </th>
                  <th className="border-b border-border-shalon py-2 text-right font-semibold">
                    Sem comprar há
                  </th>
                  <th className="border-b border-border-shalon py-2 font-semibold">Promoção</th>
                </tr>
              </thead>
              <tbody>
                {lista.clientes.map((c) => (
                  <tr key={c.cliente_id}>
                    <td className="border-b border-border-shalon py-2">
                      <Link
                        href={`/admin/clientes/${c.cliente_id}`}
                        className="font-semibold text-ink"
                      >
                        {c.nome}
                      </Link>
                      {/* A explicação, com os números da própria linha. */}
                      <span className="block text-[12px] text-muted">{c.porque}</span>
                    </td>
                    <td className="border-b border-border-shalon py-2">
                      <Cadencia valor={c.classificacao} />
                    </td>
                    <td className="border-b border-border-shalon py-2 text-right text-ink">
                      {c.pedidos}
                    </td>
                    <td className="border-b border-border-shalon py-2 text-right text-ink">
                      {c.ticket_medio === null ? "—" : formatBRL(c.ticket_medio)}
                    </td>
                    <td className="border-b border-border-shalon py-2 text-right text-ink">
                      {c.dias_sem_comprar === null ? "—" : `${c.dias_sem_comprar} dias`}
                    </td>
                    <td className="border-b border-border-shalon py-2 text-muted">
                      {c.aceita_promocao ? "Aceita" : "Não aceita"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>
    </div>
  );
}
