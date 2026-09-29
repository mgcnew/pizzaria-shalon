import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { IndicadorDeNavegacao } from "@/ui/components/IndicadorDeNavegacao";
import { listarRelatorios, obterRelatorio } from "@/application/relatorios/consultas";
import { formatarCelula } from "@/application/relatorios/formato";
import type { Relatorio } from "@/application/relatorios/tipos";
import type { ChaveDePeriodo } from "@/application/analitico/tipos";
import { Cartao, EmptyState } from "@/ui/patterns";
import { SeletorDePeriodo } from "../_ui/SeletorDePeriodo";
import { CartaoCarregando, TabelaCarregando } from "../_ui/Esqueletos";

export const metadata: Metadata = { title: "Relatórios" };

const CHAVES: ChaveDePeriodo[] = ["hoje", "ontem", "7d", "30d", "mes_atual"];

const FORMATOS: { valor: string; rotulo: string }[] = [
  { valor: "csv", rotulo: "CSV" },
  { valor: "xlsx", rotulo: "Excel" },
  { valor: "pdf", rotulo: "PDF" },
];

/**
 * /admin/relatorios
 *
 * A MESMA TABELA NA TELA E NO ARQUIVO. Tela e exportação consomem a mesma
 * resposta do banco — colunas, linhas, totais e ressalvas —, então a planilha
 * não pode divergir do que a pessoa acabou de ver.
 *
 * AS RESSALVAS VÃO JUNTO. "Venda registrada não é faturamento recebido" está
 * no topo da tela e também dentro do CSV, do Excel e do PDF. Um número
 * exportado sem a ressalva vira, meses depois, uma soma errada que ninguém
 * consegue explicar.
 *
 * A LISTA DE RELATÓRIOS É A DO USUÁRIO. Quem não tem `cash.view` não vê
 * "Sessões de caixa" — e se chamar a rota direto, o banco recusa do mesmo
 * jeito (03 §20, CLAUDE.md §12).
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; periodo?: string }>;
}) {
  const { tipo, periodo } = await searchParams;
  const chave: ChaveDePeriodo = CHAVES.includes(periodo as ChaveDePeriodo)
    ? (periodo as ChaveDePeriodo)
    : "30d";

  /*
   * Com o tipo na URL, o relatório começa junto com o catálogo, em vez de
   * esperar por ele (D-2026-09-29-90). O catálogo continua decidindo: se o
   * tipo não estiver na lista deste usuário, a resposta antecipada é
   * descartada, e o banco a teria recusado de qualquer forma (03 §20). O
   * `.catch` vazio só marca a promessa como tratada até alguém esperá-la.
   */
  const antecipado = tipo ? obterRelatorio(tipo, chave) : null;
  antecipado?.catch(() => {});

  const catalogo = await listarRelatorios();
  const escolhido = catalogo.relatorios.some((r) => r.tipo === tipo)
    ? (tipo as string)
    : (catalogo.relatorios[0]?.tipo ?? null);

  const relatorio: Promise<Relatorio | null> =
    escolhido === null
      ? Promise.resolve(null)
      : escolhido === tipo && antecipado
        ? antecipado
        : obterRelatorio(escolhido, chave);

  if (!catalogo.ok || catalogo.relatorios.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <header>
          <h1 className="m-0 font-display text-[24px] font-bold text-ink">Relatórios</h1>
        </header>
        <EmptyState
          titulo="Nenhum relatório disponível"
          descricao="Você não tem permissão para ver relatórios."
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 font-display text-[24px] font-bold text-ink">Relatórios</h1>
          <p className="m-0 mt-1 text-[13.5px] text-muted">
            Os mesmos números do painel, linha a linha.
          </p>
        </div>
        <SeletorDePeriodo
          atual={chave}
          base="/admin/relatorios"
          extras={{ tipo: escolhido ?? undefined }}
        />
      </header>

      <Cartao largura="cheio">
        <div className="flex flex-wrap gap-2">
          {catalogo.relatorios.map((r) => (
            <Link
              key={r.tipo}
              href={`/admin/relatorios?tipo=${r.tipo}&periodo=${chave}`}
              aria-current={r.tipo === escolhido ? "true" : undefined}
              className={[
                "motion-interactive relative inline-flex min-h-touch items-center rounded-11 px-[13px] text-[13px] font-semibold transition-colors",
                r.tipo === escolhido
                  ? "bg-cta text-cta-fg"
                  : "border-[1.5px] border-border-shalon text-ink hover:border-brand-orange",
              ].join(" ")}
            >
              {r.titulo}
              <IndicadorDeNavegacao forma="traco" tom={r.tipo === escolhido ? "texto" : "marca"} />
            </Link>
          ))}
        </div>
      </Cartao>

      {/*
       * O relatório chega no próprio bloco. A chave faz a troca de relatório
       * ou de período mostrar o skeleton da tabela na hora, com o cabeçalho e
       * os botões já atualizados, em vez de manter a tabela anterior.
       */}
      <Suspense
        key={`${escolhido ?? "nenhum"}-${chave}`}
        fallback={
          <CartaoCarregando descricao>
            <TabelaCarregando linhas={6} colunas={4} moldura={false} />
          </CartaoCarregando>
        }
      >
        <BlocoDoRelatorio
          relatorio={relatorio}
          chave={chave}
          podeExportar={catalogo.pode_exportar}
        />
      </Suspense>
    </div>
  );
}

async function BlocoDoRelatorio({
  relatorio: consulta,
  chave,
  podeExportar,
}: {
  relatorio: Promise<Relatorio | null>;
  chave: ChaveDePeriodo;
  podeExportar: boolean;
}) {
  const relatorio = await consulta;
    return relatorio ? (
      <Cartao
        titulo={relatorio.titulo}
        descricao={relatorio.periodo.rotulo}
        largura="cheio"
        acao={
          podeExportar ? (
            <span className="flex flex-wrap gap-2">
              {FORMATOS.map((f) => (
                <a
                  key={f.valor}
                  href={`/admin/relatorios/exportar?tipo=${relatorio.tipo}&periodo=${chave}&formato=${f.valor}`}
                  className="motion-interactive inline-flex min-h-touch items-center rounded-11 border-[1.5px] border-border-shalon px-[13px] text-[13px] font-semibold text-ink transition-colors hover:border-brand-orange"
                >
                  {f.rotulo}
                </a>
              ))}
            </span>
          ) : null
        }
      >
        {/* As ressalvas ficam acima da tabela, e vão junto no arquivo. */}
        {relatorio.ressalvas.length > 0 ? (
          <ul className="m-0 mb-3 flex list-none flex-col gap-1 rounded-12 border border-border-shalon bg-elev p-3">
            {relatorio.ressalvas.map((r) => (
              <li key={r} className="text-[12.5px] text-ink-2">
                {r}
              </li>
            ))}
          </ul>
        ) : null}

        {relatorio.truncado ? (
          <p className="m-0 mb-3 rounded-12 border border-tdb bg-td px-3 py-[10px] text-[12.5px] font-semibold text-tdf">
            Lista limitada às primeiras {relatorio.limite} linhas. A exportação traz mais.
          </p>
        ) : null}

        {relatorio.linhas.length === 0 ? (
          <EmptyState
            titulo="Nada no período"
            descricao="Escolha outro período ou outro relatório."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-[13px]">
              <thead>
                <tr className="text-left text-muted">
                  {relatorio.colunas.map((c) => (
                    <th
                      key={c.chave}
                      className={[
                        "border-b border-border-shalon py-2 font-semibold",
                        c.tipo === "dinheiro" || c.tipo === "numero" ? "text-right" : "",
                      ].join(" ")}
                    >
                      {c.rotulo}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {relatorio.linhas.map((linha, i) => (
                  <tr key={i}>
                    {relatorio.colunas.map((c) => (
                      <td
                        key={c.chave}
                        className={[
                          "border-b border-border-shalon py-2",
                          c.tipo === "dinheiro" || c.tipo === "numero"
                            ? "text-right text-ink"
                            : "text-ink",
                        ].join(" ")}
                      >
                        {formatarCelula(linha[c.chave], c.tipo)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {Object.keys(relatorio.totais ?? {}).length > 0 ? (
                <tfoot>
                  <tr>
                    <td
                      colSpan={relatorio.colunas.length}
                      className="py-3 text-right text-[13px] font-semibold text-ink"
                    >
                      {Object.entries(relatorio.totais).map(([chave, valor]) => {
                        const coluna = relatorio.colunas.find((c) => c.chave === chave);
                        return (
                          <span key={chave} className="ml-4 inline-block">
                            {coluna?.rotulo ?? chave}:{" "}
                            {formatarCelula(valor, coluna?.tipo ?? "numero")}
                          </span>
                        );
                      })}
                    </td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        )}

        {!podeExportar ? (
          <p className="mt-3 text-[12px] text-muted">
            Você pode ver este relatório, mas não exportá-lo.
          </p>
        ) : null}
      </Cartao>
    ) : (
      <EmptyState titulo="Escolha um relatório" />
    );
}
