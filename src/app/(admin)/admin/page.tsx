import type { Metadata } from "next";
import Link from "next/link";
import {
  obterCentralDeAtencao,
  obterMovimento,
  obterRanking,
  obterResumo,
} from "@/application/analitico/consultas";
import type { ChaveDePeriodo } from "@/application/analitico/tipos";
import { Badge } from "@/ui/components";
import { Cartao, EmptyState } from "@/ui/patterns";
import { formatBRL } from "@/lib/format";
import { CentralDeAtencao } from "./_ui/CentralDeAtencao";
import { Indicador } from "./_ui/Indicador";
import { SeletorDePeriodo } from "./_ui/SeletorDePeriodo";

export const metadata: Metadata = { title: "Dashboard" };

const CHAVES: ChaveDePeriodo[] = ["hoje", "ontem", "7d", "30d", "mes_atual"];
const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const COMPARACAO: Record<ChaveDePeriodo, string> = {
  hoje: "vs. ontem",
  ontem: "vs. o dia anterior",
  "7d": "vs. os 7 dias anteriores",
  "30d": "vs. os 30 dias anteriores",
  mes_atual: "vs. o período anterior equivalente",
  personalizado: "vs. o período anterior equivalente",
};

const NOME_DO_INTERNO: Record<string, string> = {
  courtesy: "Cortesia",
  employee_consumption: "Consumo de funcionário",
  owner_consumption: "Consumo do proprietário",
  waste: "Perda / descarte",
};

/**
 * /admin — a primeira tela de quem abre o sistema.
 *
 * A ORDEM DA PÁGINA É A DECISÃO: primeiro o que pede ação, depois o que
 * informa. Um dashboard que começa por gráfico ensina a pessoa a rolar a tela
 * para descobrir que tem pedido parado há vinte minutos (RN-DASH-001).
 *
 * E a distinção que atravessa a tela inteira: VENDA REGISTRADA não é
 * FATURAMENTO RECEBIDO. Os dois aparecem lado a lado, com a diferença dita em
 * voz alta — em vez de um número só que esconde qual dos dois ele é
 * (CLAUDE.md §24, §28).
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string }>;
}) {
  const { periodo } = await searchParams;
  const chave: ChaveDePeriodo = CHAVES.includes(periodo as ChaveDePeriodo)
    ? (periodo as ChaveDePeriodo)
    : "30d";

  const [central, resumo, ranking, movimento] = await Promise.all([
    obterCentralDeAtencao(),
    obterResumo({ chave }),
    obterRanking({ chave }, 5),
    obterMovimento({ chave }),
  ]);

  const maisVendidos = ranking?.produtos.slice(0, 5) ?? [];
  const noTopo = new Set(maisVendidos.map((p) => p.produto_id));
  // "Vendendo pouco" é afirmação sobre o produto, então não pode cair em cima
  // de quem está no topo da outra lista. Com poucos produtos comparáveis, pegar
  // "o fundo da lista" traria o campeão de vendas junto — e a tela diria que o
  // mais vendido está vendendo pouco.
  const menosVendidos =
    ranking?.produtos
      .filter((p) => p.elegivel_para_baixa_venda && !noTopo.has(p.produto_id))
      .sort((a, b) => a.quantidade - b.quantidade)
      .slice(0, 5) ?? [];
  const semanaOrdenada = [...(movimento?.por_dia_da_semana ?? [])].sort(
    (a, b) => b.valor - a.valor,
  );

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 font-display text-[24px] font-bold text-ink">Dashboard</h1>
          <p className="m-0 mt-1 text-[13.5px] text-muted">
            {resumo ? resumo.periodo.rotulo : "Operação e indicadores da Shalon."}
          </p>
        </div>
        <SeletorDePeriodo atual={chave} base="/admin" />
      </header>

      <CentralDeAtencao dados={central} />

      {resumo ? (
        <>
          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Indicador
              rotulo="Venda registrada"
              valor={formatBRL(resumo.atual.vendas_registradas)}
              variacao={resumo.variacao.vendas_registradas}
              comparacao={COMPARACAO[chave]}
              explicacao="Pedidos concluídos no período."
            />
            <Indicador
              rotulo="Faturamento recebido"
              valor={formatBRL(resumo.atual.faturamento_recebido)}
              variacao={resumo.variacao.faturamento_recebido}
              comparacao={COMPARACAO[chave]}
              explicacao="Pagamentos confirmados no período."
            />
            <Indicador
              rotulo="Pedidos concluídos"
              valor={String(resumo.atual.pedidos)}
              variacao={resumo.variacao.pedidos}
              comparacao={COMPARACAO[chave]}
            />
            <Indicador
              rotulo="Ticket médio"
              valor={
                resumo.atual.ticket_medio === null
                  ? "—"
                  : formatBRL(resumo.atual.ticket_medio)
              }
              variacao={resumo.variacao.ticket_medio}
              comparacao={COMPARACAO[chave]}
              explicacao="Venda registrada dividida por pedido concluído."
            />
          </section>

          {/* A ponte entre vender e receber, dita em vez de escondida. */}
          <Cartao titulo="Entre o que foi vendido e o que entrou" largura="cheio">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <p className="m-0 text-[12.5px] text-muted">Vendido e ainda não recebido</p>
                <p className="m-0 mt-1 text-[17px] font-bold text-ink">
                  {formatBRL(resumo.nao_recebido_do_periodo)}
                </p>
              </div>
              <div>
                <p className="m-0 text-[12.5px] text-muted">Recebido e fora da gaveta</p>
                <p className="m-0 mt-1 text-[17px] font-bold text-ink">
                  {formatBRL(resumo.atual.ainda_fora_da_gaveta)}
                </p>
                <p className="m-0 mt-1 text-[12px] text-muted">
                  Dinheiro com motoboy ou recebido sem caixa aberto.
                </p>
              </div>
              <div>
                <p className="m-0 text-[12.5px] text-muted">Estornado no período</p>
                <p className="m-0 mt-1 text-[17px] font-bold text-ink">
                  {formatBRL(resumo.atual.estornado_no_periodo)}
                </p>
              </div>
            </div>
          </Cartao>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Cartao titulo="Pedidos que não viraram venda" largura="cheio">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <p className="m-0 text-[12.5px] text-muted">Cancelados</p>
                  <p className="m-0 text-[17px] font-bold text-ink">{resumo.atual.cancelados}</p>
                </div>
                <div>
                  <p className="m-0 text-[12.5px] text-muted">Rejeitados</p>
                  <p className="m-0 text-[17px] font-bold text-ink">{resumo.atual.rejeitados}</p>
                </div>
                <div>
                  <p className="m-0 text-[12.5px] text-muted">Falhas de entrega</p>
                  <p className="m-0 text-[17px] font-bold text-ink">
                    {resumo.atual.falhas_de_entrega}
                  </p>
                </div>
                <div>
                  <p className="m-0 text-[12.5px] text-muted">Valor cancelado</p>
                  <p className="m-0 text-[17px] font-bold text-ink">
                    {formatBRL(resumo.atual.valor_cancelado)}
                  </p>
                </div>
              </div>
            </Cartao>

            {/* RN-CLASS-001: em quadro PRÓPRIO, nunca somado ao faturamento. */}
            <Cartao
              titulo="Saiu da cozinha sem ser venda"
              descricao="Cortesia, consumo interno e perda. Não é receita; o valor é de referência."
              largura="cheio"
            >
              {resumo.internos.length === 0 ? (
                <EmptyState titulo="Nenhum movimento interno no período" />
              ) : (
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {resumo.internos.map((i) => (
                    <li key={i.tipo} className="flex items-center justify-between gap-3">
                      <span className="text-[13.5px] text-ink">
                        {NOME_DO_INTERNO[i.tipo] ?? i.tipo}
                      </span>
                      <span className="text-[13.5px] text-muted">
                        {i.movimentos}{" "}
                        {i.movimentos === 1 ? "movimento" : "movimentos"} ·{" "}
                        {formatBRL(i.valor_referencia)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Cartao>
          </div>
        </>
      ) : (
        <EmptyState
          titulo="Indicadores indisponíveis"
          descricao="Você não tem permissão para ver relatórios, ou ainda não há dados no período."
        />
      )}

      {ranking ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Cartao titulo="Mais vendidos no período" largura="cheio">
            {maisVendidos.length === 0 ? (
              <EmptyState titulo="Nenhuma venda no período" />
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {maisVendidos.map((p) => (
                  <li key={p.produto_id} className="flex items-center justify-between gap-3">
                    <span className="flex flex-col">
                      <span className="text-[13.5px] font-semibold text-ink">{p.nome}</span>
                      <span className="text-[12px] text-muted">{p.categoria}</span>
                    </span>
                    <span className="text-right text-[13px] text-muted">
                      {p.quantidade} un · {formatBRL(p.valor)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>

          {/* §8: "vende pouco" só para quem teve chance de vender. */}
          <Cartao
            titulo="Vendendo pouco"
            descricao="Só produtos que estiveram no catálogo o período inteiro e continuam disponíveis."
            largura="cheio"
          >
            {menosVendidos.length === 0 ? (
              <EmptyState
                titulo="Nada a destacar"
                descricao="Nenhum produto comparável ficou para trás no período."
              />
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {menosVendidos.map((p) => (
                  <li key={p.produto_id} className="flex items-center justify-between gap-3">
                    <span className="flex flex-col">
                      <span className="text-[13.5px] font-semibold text-ink">{p.nome}</span>
                      <span className="text-[12px] text-muted">
                        {p.quantidade} un no período
                        {p.tendencia?.comparavel
                          ? ` · ${p.tendencia.percentual}% vs. anterior`
                          : " · sem base de comparação"}
                      </span>
                    </span>
                    {p.quantidade === 0 ? <Badge tom="indisponivel">Sem venda</Badge> : null}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[12px] text-muted">{ranking.ressalva_de_disponibilidade}</p>
          </Cartao>
        </div>
      ) : null}

      {movimento ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Cartao titulo="Dias de maior movimento" largura="cheio">
            {semanaOrdenada.length === 0 ? (
              <EmptyState titulo="Sem movimento no período" />
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {semanaOrdenada.map((d) => (
                  <li key={d.dia_semana} className="flex items-center justify-between gap-3">
                    <span className="text-[13.5px] text-ink">{DIAS[d.dia_semana]}</span>
                    <span className="text-right text-[12.5px] text-muted">
                      {d.pedidos} {d.pedidos === 1 ? "pedido" : "pedidos"} ·{" "}
                      {formatBRL(d.valor)}
                      {/* Amostra pequena não vira veredicto. */}
                      <span className="block text-[11.5px]">
                        {d.dias_com_amostra}{" "}
                        {d.dias_com_amostra === 1 ? "dia no período" : "dias no período"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>

          <Cartao
            titulo="Horários de pico"
            descricao="Hora em que o pedido foi concluído, no fuso da loja."
            largura="cheio"
          >
            {movimento.por_faixa_de_horario.length === 0 ? (
              <EmptyState titulo="Sem movimento no período" />
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {[...movimento.por_faixa_de_horario]
                  .sort((a, b) => b.pedidos - a.pedidos)
                  .slice(0, 6)
                  .map((f) => (
                    <li key={f.hora} className="flex items-center justify-between gap-3">
                      <span className="text-[13.5px] text-ink">
                        {String(f.hora).padStart(2, "0")}h
                      </span>
                      <span className="text-[12.5px] text-muted">
                        {f.pedidos} {f.pedidos === 1 ? "pedido" : "pedidos"} ·{" "}
                        {formatBRL(f.valor)}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </Cartao>
        </div>
      ) : null}

      <p className="text-[12.5px] text-muted">
        Precisa do detalhe? <Link href="/admin/relatorios" className="font-semibold text-ink">Relatórios</Link>{" "}
        abre os mesmos números linha a linha, com exportação.
      </p>
    </div>
  );
}
