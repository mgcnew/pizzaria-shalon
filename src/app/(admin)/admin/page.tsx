import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  obterCentralDeAtencao,
  obterMovimento,
  obterRanking,
  obterResumo,
} from "@/application/analitico/consultas";
import type {
  ChaveDePeriodo,
  MovimentoDoPeriodo,
  RankingDeProdutos,
  ResumoAnalitico,
} from "@/application/analitico/tipos";
import { Badge } from "@/ui/components";
import { Cartao, EmptyState, Skeleton } from "@/ui/patterns";
import { formatBRL } from "@/lib/format";
import { recorteDeMenorMovimentacao } from "@/domain/analitico/ranking";
import { rotuloDeModalidade, rotuloDeOrigem } from "@/domain/pedidos/estados";
import { GraficoDeBarras, GraficoDeColunas, type CorDoGrafico } from "./_ui/Graficos";
import { CentralDeAtencao } from "./_ui/CentralDeAtencao";
import { Indicador } from "./_ui/Indicador";
import { SeletorDePeriodo } from "./_ui/SeletorDePeriodo";
import {
  MovimentoCarregando,
  RankingCarregando,
  ResumoCarregando,
} from "./_ui/EsqueletosDoDashboard";

export const metadata: Metadata = { title: "Dashboard" };

const CHAVES: ChaveDePeriodo[] = ["hoje", "ontem", "7d", "30d", "mes_atual"];
const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/**
 * A cor segue a categoria, não a posição: "Pix na maquininha" é sempre a
 * mesma cor, esteja em primeiro ou em último. O que não está no mapa (forma
 * ou canal novo) fica no neutro — nunca uma cor inventada.
 */
const COR_DA_FORMA: Record<string, CorDoGrafico> = {
  pix_machine: "serie-3",
  cash: "serie-4",
  credit: "serie-2",
  debit: "serie-5",
  pix_key: "serie-6",
  voucher: "serie-1",
};
const COR_DO_CANAL: Record<string, CorDoGrafico> = {
  shalon_link: "serie-1",
  counter: "serie-2",
  whatsapp: "serie-3",
  phone: "serie-4",
  ifood: "serie-5",
};
const COR_DA_MODALIDADE: Record<string, CorDoGrafico> = {
  delivery: "serie-2",
  pickup: "serie-4",
};

/** "12 pedidos" / "1 pedido". */
function pedidos(n: number): string {
  return `${n} ${n === 1 ? "pedido" : "pedidos"}`;
}

/** Parte de um total, em %, sem casas: o gráfico já mostra a proporção. */
function parte(n: number, total: number): string {
  return total > 0 ? `${Math.round((n / total) * 100)}%` : "";
}

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

  /*
   * AS QUATRO CONSULTAS COMEÇAM JUNTAS, MAS A TELA SÓ ESPERA A PRIMEIRA
   * (D-2026-09-29-90).
   *
   * A Central de Atenção é a parte operacional e abre a página. Resumo,
   * ranking e movimento do período (30 dias por padrão) são os relatórios
   * pesados: cada um chega no seu bloco, com skeleton, sem segurar o que
   * pede ação. Cada bloco recebe a promessa e espera só a sua.
   *
   * O `.catch` vazio só marca a promessa como tratada enquanto ela ainda não
   * foi entregue ao bloco; quem a espera continua recebendo a falha. As
   * consultas já devolvem `null` quando o banco responde com erro.
   */
  const resumo = obterResumo({ chave });
  const ranking = obterRanking({ chave }, 5);
  const movimento = obterMovimento({ chave });
  for (const consulta of [resumo, ranking, movimento]) consulta.catch(() => {});
  const central = await obterCentralDeAtencao();

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 font-display text-[24px] font-bold text-ink">Dashboard</h1>
          <Suspense
            key={chave}
            fallback={<Skeleton className="mt-[7px] h-[14px] w-[min(260px,70%)]" />}
          >
            <RotuloDoPeriodo resumo={resumo} />
          </Suspense>
        </div>
        <SeletorDePeriodo atual={chave} base="/admin" />
      </header>

      <CentralDeAtencao dados={central} />

      {/*
       * `key={chave}`: trocar o período cria blocos novos, que mostram o
       * skeleton na hora. Sem a chave, o Next manteria os números do período
       * anterior na tela até os três relatórios novos chegarem.
       */}
      <Suspense key={`resumo-${chave}`} fallback={<ResumoCarregando />}>
        <BlocoDoResumo resumo={resumo} chave={chave} />
      </Suspense>

      <Suspense key={`ranking-${chave}`} fallback={<RankingCarregando />}>
        <BlocoDoRanking ranking={ranking} />
      </Suspense>

      <Suspense key={`movimento-${chave}`} fallback={<MovimentoCarregando />}>
        <BlocoDoMovimento movimento={movimento} />
      </Suspense>

      <p className="text-[12.5px] text-muted">
        Precisa do detalhe? <Link href="/admin/relatorios" className="font-semibold text-ink">Relatórios</Link>{" "}
        abre os mesmos números linha a linha, com exportação.
      </p>
    </div>
  );
}

async function RotuloDoPeriodo({ resumo }: { resumo: Promise<ResumoAnalitico | null> }) {
  const r = await resumo;
  return (
    <p className="m-0 mt-1 text-[13.5px] text-muted">
      {r ? r.periodo.rotulo : "Operação e indicadores da Shalon."}
    </p>
  );
}

async function BlocoDoResumo({
  resumo: consulta,
  chave,
}: {
  resumo: Promise<ResumoAnalitico | null>;
  chave: ChaveDePeriodo;
}) {
  const resumo = await consulta;
    return resumo ? (
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

        <QuebrasDoPeriodo medidas={resumo.atual} />

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
    );
}

async function BlocoDoRanking({ ranking: consulta }: { ranking: Promise<RankingDeProdutos | null> }) {
  const ranking = await consulta;
  // Só quem vendeu: o ranking traz o catálogo inteiro, inclusive com zero, e
  // um gráfico de "mais vendidos" cheio de R$ 0,00 não diz nada.
  const maisVendidos = (ranking?.produtos ?? []).filter((p) => p.quantidade > 0).slice(0, 5);
  // RN-REL-005: a regra do recorte vive no domínio, com teste próprio. Aqui
  // fica só a decisão de QUAIS listas entram — o ranking do período e o grupo
  // de mais vendidos exibido logo ao lado.
  const menorMovimentacao = recorteDeMenorMovimentacao(
    ranking?.produtos ?? [],
    maisVendidos,
  );
    return ranking ? (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Cartao titulo="Mais vendidos no período" largura="cheio">
          {maisVendidos.length === 0 ? (
            <EmptyState titulo="Nenhuma venda no período" />
          ) : (
            <GraficoDeBarras
              descricao="Mais vendidos no período, por valor"
              itens={maisVendidos.map((p) => ({
                chave: p.chave,
                rotulo: p.nome,
                subtitulo: p.categoria,
                valor: p.valor,
                valorTexto: formatBRL(p.valor),
                detalhe: `${p.quantidade} un`,
              }))}
            />
          )}
        </Cartao>

        {/* RN-REL-005: ordem relativa entre comparáveis, não diagnóstico
            de demanda. O rótulo diz exatamente isso. */}
        <Cartao
          titulo="Menor movimentação"
          descricao="Produtos elegíveis com menor quantidade vendida no período."
          largura="cheio"
        >
          {menorMovimentacao.length === 0 ? (
            <EmptyState
              titulo="Nada a comparar no período"
              descricao="Nenhum produto esteve no catálogo o período inteiro e continua disponível."
            />
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {menorMovimentacao.map((p) => (
                <li key={p.chave} className="flex items-center justify-between gap-3">
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
    ) : null;
}

/**
 * Horas na ordem do expediente, e não do relógio: a pizzaria vende à noite e
 * passa da meia-noite. Começa às 6h (fora de qualquer turno) e corta as horas
 * vazias das pontas, para o gráfico mostrar o turno e não 24 colunas.
 */
function horasDoTurno(faixas: { hora: number; pedidos: number; valor: number }[]) {
  const porHora = new Map(faixas.map((f) => [f.hora, f]));
  const ordem = Array.from({ length: 24 }, (_, i) => (i + 6) % 24);
  const comMovimento = ordem.filter((h) => (porHora.get(h)?.pedidos ?? 0) > 0);
  if (comMovimento.length === 0) return [];
  const de = ordem.indexOf(comMovimento[0] as number);
  const ate = ordem.indexOf(comMovimento[comMovimento.length - 1] as number);
  return ordem.slice(de, ate + 1).map((hora) => ({
    hora,
    pedidos: porHora.get(hora)?.pedidos ?? 0,
    valor: porHora.get(hora)?.valor ?? 0,
  }));
}

/**
 * As três quebras do período que já vinham do servidor e não apareciam:
 * como pagaram, de onde veio o pedido e entrega × retirada.
 */
function QuebrasDoPeriodo({ medidas }: { medidas: ResumoAnalitico["atual"] }) {
  const formas = [...medidas.por_forma].sort((a, b) => b.valor - a.valor);
  const origens = [...medidas.por_origem].sort((a, b) => b.pedidos - a.pedidos);
  const modalidades = [...medidas.por_modalidade].sort((a, b) => b.pedidos - a.pedidos);
  const totalDePedidos = origens.reduce((t, o) => t + o.pedidos, 0);
  const totalPorModalidade = modalidades.reduce((t, m) => t + m.pedidos, 0);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
      <Cartao titulo="Como o cliente pagou" descricao="Pagamentos confirmados no período." largura="cheio">
        {formas.length === 0 ? (
          <EmptyState titulo="Nenhum pagamento no período" />
        ) : (
          <GraficoDeBarras
            descricao="Valor recebido por forma de pagamento"
            itens={formas.map((f) => ({
              chave: `${f.forma}-${f.familia}`,
              rotulo: f.forma,
              cor: COR_DA_FORMA[f.familia] ?? "neutro",
              valor: f.valor,
              valorTexto: formatBRL(f.valor),
              detalhe: `${f.pagamentos}×`,
            }))}
          />
        )}
      </Cartao>

      <Cartao titulo="De onde vieram os pedidos" descricao="Pedidos concluídos, por canal." largura="cheio">
        {origens.length === 0 ? (
          <EmptyState titulo="Nenhum pedido no período" />
        ) : (
          <GraficoDeBarras
            descricao="Pedidos concluídos por canal"
            itens={origens.map((o) => ({
              chave: o.origem,
              rotulo: rotuloDeOrigem(o.origem),
              cor: COR_DO_CANAL[o.origem] ?? "neutro",
              subtitulo: formatBRL(o.valor),
              valor: o.pedidos,
              valorTexto: pedidos(o.pedidos),
              detalhe: parte(o.pedidos, totalDePedidos),
            }))}
          />
        )}
      </Cartao>

      <Cartao titulo="Entrega ou retirada" descricao="Pedidos concluídos, por modalidade." largura="cheio">
        {modalidades.length === 0 ? (
          <EmptyState titulo="Nenhum pedido no período" />
        ) : (
          <GraficoDeBarras
            descricao="Pedidos concluídos por modalidade"
            itens={modalidades.map((m) => ({
              chave: m.modalidade,
              rotulo: rotuloDeModalidade(m.modalidade),
              cor: COR_DA_MODALIDADE[m.modalidade] ?? "neutro",
              subtitulo: formatBRL(m.valor),
              valor: m.pedidos,
              valorTexto: pedidos(m.pedidos),
              detalhe: parte(m.pedidos, totalPorModalidade),
            }))}
          />
        )}
      </Cartao>
    </div>
  );
}

async function BlocoDoMovimento({
  movimento: consulta,
}: {
  movimento: Promise<MovimentoDoPeriodo | null>;
}) {
  const movimento = await consulta;
  const porDia = new Map((movimento?.por_dia_da_semana ?? []).map((d) => [d.dia_semana, d]));
  // O servidor manda os 7 dias mesmo sem venda: gráfico só com algum pedido.
  const temDia = [...porDia.values()].some((d) => d.pedidos > 0);
  const horas = horasDoTurno(movimento?.por_faixa_de_horario ?? []);
    return movimento ? (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Cartao
          titulo="Venda por dia da semana"
          descricao="Soma do período. Toque ou passe o mouse numa coluna para ver os pedidos."
          largura="cheio"
        >
          {!temDia ? (
            <EmptyState titulo="Sem movimento no período" />
          ) : (
            <GraficoDeColunas
              descricao="Venda registrada por dia da semana"
              itens={DIAS.map((nome, dia) => {
                const d = porDia.get(dia);
                return {
                  chave: String(dia),
                  rotulo: DIAS_CURTOS[dia] as string,
                  rotuloCompleto: nome,
                  valor: d?.valor ?? 0,
                  valorTexto: formatBRL(d?.valor ?? 0),
                  // Amostra pequena não vira veredicto: quantos dias somaram.
                  detalhe: d
                    ? `${pedidos(d.pedidos)} em ${d.dias_com_amostra} ${d.dias_com_amostra === 1 ? "dia" : "dias"}`
                    : "sem pedidos",
                };
              })}
            />
          )}
        </Cartao>

        <Cartao
          titulo="Horários de pico"
          descricao="Hora em que o pedido foi concluído, no fuso da loja."
          largura="cheio"
        >
          {horas.length === 0 ? (
            <EmptyState titulo="Sem movimento no período" />
          ) : (
            <GraficoDeColunas
              descricao="Pedidos concluídos por hora do dia"
              rotulosACada={horas.length > 12 ? 3 : horas.length > 8 ? 2 : 1}
              itens={horas.map((h) => ({
                chave: String(h.hora),
                rotulo: `${String(h.hora).padStart(2, "0")}h`,
                rotuloCompleto: `${String(h.hora).padStart(2, "0")}h às ${String((h.hora + 1) % 24).padStart(2, "0")}h`,
                valor: h.pedidos,
                valorTexto: pedidos(h.pedidos),
                detalhe: formatBRL(h.valor),
              }))}
            />
          )}
        </Cartao>
      </div>
    ) : null;
}
