import type { Metadata } from "next";
import Link from "next/link";
import { listarClientes } from "@/application/clientes/consultas";
import type { Cadencia as ValorDeCadencia, FiltrosDeClientes as Filtros } from "@/application/clientes/tipos";
import { Cartao, EmptyState } from "@/ui/patterns";
import { formatBRL } from "@/lib/format";
import { CadenciaDiscreta } from "./_ui/Cadencia";
import { FiltrosDeClientes } from "./_ui/FiltrosDeClientes";
import { TelefoneCopiavel } from "./_ui/TelefoneCopiavel";

export const metadata: Metadata = { title: "Clientes" };

const CADENCIAS: ValorDeCadencia[] = [
  "recorrente",
  "atencao",
  "afastado",
  "base_fraca",
  "dados_insuficientes",
];

/** Clientes por página: a base cresce e a tela não carrega tudo de uma vez. */
const POR_PAGINA = 25;

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
  searchParams: Promise<{
    ausencia?: string;
    cadencia?: string;
    busca?: string;
    pagina?: string;
    fiado?: string;
  }>;
}) {
  const { ausencia, cadencia, busca, pagina, fiado } = await searchParams;
  const soFiado = fiado === "1";
  const paginaAtual = Math.max(1, Math.floor(Number(pagina)) || 1);

  const filtros: Filtros = {
    ...(ausencia && Number.isFinite(Number(ausencia))
      ? { ausencia_minima: Number(ausencia) }
      : {}),
    ...(CADENCIAS.includes(cadencia as ValorDeCadencia)
      ? { classificacao: cadencia as ValorDeCadencia }
      : {}),
    ...(busca ? { busca } : {}),
    ...(soFiado ? { fiado: true } : {}),
    limite: POR_PAGINA,
    deslocamento: (paginaAtual - 1) * POR_PAGINA,
  };

  const lista = await listarClientes(filtros);
  const totalDePaginas = Math.max(1, Math.ceil(lista.total_filtrado / POR_PAGINA));
  const primeiro = lista.clientes.length === 0 ? 0 : (paginaAtual - 1) * POR_PAGINA + 1;
  const ultimo = (paginaAtual - 1) * POR_PAGINA + lista.clientes.length;

  // Os filtros seguem junto ao trocar de página.
  function urlDaPagina(n: number): string {
    const q = new URLSearchParams();
    if (ausencia) q.set("ausencia", ausencia);
    if (cadencia) q.set("cadencia", cadencia);
    if (busca) q.set("busca", busca);
    if (soFiado) q.set("fiado", "1");
    if (n > 1) q.set("pagina", String(n));
    const texto = q.toString();
    return texto ? `/admin/clientes?${texto}` : "/admin/clientes";
  }

  const r = lista.resumo;
  const totalDaBase =
    r.recorrentes + r.atencao + r.afastados + r.base_fraca + r.dados_insuficientes;
  const fiadoTotal = Number(r.fiado_total ?? 0);
  const comFiado = r.com_fiado ?? 0;
  // A coluna "Em aberto" só existe quando alguém deve: vazia, era ruído.
  const mostrarEmAberto = comFiado > 0;

  // Troca a cadência mantendo os outros filtros; volta para a página 1.
  function urlDaCadencia(valor: ValorDeCadencia | null, fiadoNaUrl = soFiado): string {
    const q = new URLSearchParams();
    if (ausencia) q.set("ausencia", ausencia);
    if (valor) q.set("cadencia", valor);
    if (busca) q.set("busca", busca);
    if (fiadoNaUrl) q.set("fiado", "1");
    const texto = q.toString();
    return texto ? `/admin/clientes?${texto}` : "/admin/clientes";
  }

  const segmentos: { valor: ValorDeCadencia | null; rotulo: string; n: number }[] = [
    { valor: null, rotulo: "Todos", n: totalDaBase },
    { valor: "recorrente", rotulo: "Recorrentes", n: r.recorrentes },
    { valor: "atencao", rotulo: "Em atenção", n: r.atencao },
    { valor: "afastado", rotulo: "Afastados", n: r.afastados },
    { valor: "base_fraca", rotulo: "Base fraca", n: r.base_fraca },
    { valor: "dados_insuficientes", rotulo: "Sem histórico", n: r.dados_insuficientes },
  ];
  const cadenciaAtual = CADENCIAS.includes(cadencia as ValorDeCadencia)
    ? (cadencia as ValorDeCadencia)
    : null;

  const th = "border-b border-border-shalon px-3 pb-2.5 pt-1 text-[12px] font-semibold text-muted";
  const td = "border-b border-border-shalon px-3 py-3";

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="m-0 font-display text-[24px] font-bold text-ink">Clientes</h1>
          <p className="m-0 mt-1 text-[13.5px] text-muted">
            Quem compra, com que frequência e há quanto tempo não aparece.
          </p>
        </div>
        {/* Fiado só ganha destaque quando existe (D-2026-10-17-153). */}
        {fiadoTotal > 0 ? (
          <Link
            href={urlDaCadencia(cadenciaAtual, !soFiado)}
            aria-current={soFiado ? "true" : undefined}
            className={[
              "inline-flex min-h-touch items-center gap-2 rounded-pill border px-4 text-[13px] font-semibold no-underline transition-colors",
              soFiado ? "border-twf bg-tw text-twf" : "border-twb bg-tw text-twf hover:border-twf",
            ].join(" ")}
          >
            <span aria-hidden="true" className="size-[7px] rounded-full bg-twf" />
            {formatBRL(fiadoTotal)} em fiado · {comFiado} {comFiado === 1 ? "cliente" : "clientes"}
          </Link>
        ) : null}
      </header>

      <Cartao
        titulo={`${lista.total_filtrado} ${lista.total_filtrado === 1 ? "cliente" : "clientes"}`}
        {...(totalDePaginas > 1
          ? { descricao: `Mostrando ${primeiro}–${ultimo} de ${lista.total_filtrado}.` }
          : {})}
        acao={
          <FiltrosDeClientes
            {...(ausencia ? { ausencia } : {})}
            {...(cadencia ? { classificacao: cadencia } : {})}
            {...(busca ? { busca } : {})}
            fiado={soFiado}
          />
        }
        largura="cheio"
      >
        {/* Cadência como segmentos que filtram: o resumo e o filtro são a
            mesma coisa, num lugar só. */}
        <nav aria-label="Filtrar por cadência" className="-mx-1 mb-4 flex gap-1 overflow-x-auto pb-1">
          {segmentos.map((sg) => {
            const ativo = sg.valor === cadenciaAtual;
            return (
              <Link
                key={sg.rotulo}
                href={urlDaCadencia(ativo && sg.valor !== null ? null : sg.valor)}
                aria-current={ativo ? "true" : undefined}
                className={[
                  "inline-flex min-h-[38px] shrink-0 items-center gap-2 rounded-pill px-3.5 text-[13px] font-semibold no-underline transition-colors",
                  ativo
                    ? "bg-cta text-cta-fg"
                    : sg.n === 0
                      ? "text-muted hover:bg-elev"
                      : "text-ink hover:bg-elev",
                ].join(" ")}
              >
                {sg.rotulo}
                <span className={`tabular-nums ${ativo ? "opacity-80" : "text-muted"}`}>{sg.n}</span>
              </Link>
            );
          })}
        </nav>

        {lista.clientes.length === 0 ? (
          <EmptyState
            titulo={soFiado ? "Ninguém com fiado em aberto" : "Nenhum cliente neste filtro"}
            descricao="Ajuste a busca, a cadência ou os filtros."
          />
        ) : (
          <div className="-mx-3 overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-[13.5px]">
              <thead>
                <tr className="whitespace-nowrap text-left">
                  <th className={th}>Cliente</th>
                  <th className={th}>Telefone</th>
                  {mostrarEmAberto ? <th className={`${th} text-right`}>Em aberto</th> : null}
                  <th className={th}>Cadência</th>
                  <th className={`${th} text-right`}>Pedidos</th>
                  <th className={`${th} text-right`}>Ticket médio</th>
                  <th className={`${th} text-right`}>Última compra</th>
                  <th className={`${th} text-center`}>Promoção</th>
                </tr>
              </thead>
              <tbody>
                {lista.clientes.map((c) => {
                  // A frase só aparece quando diz algo que o selo não diz.
                  const explicaAlgo = c.classificacao !== "dados_insuficientes";
                  return (
                    <tr key={c.cliente_id} className="transition-colors hover:bg-elev">
                      <td className={td}>
                        <Link href={`/admin/clientes/${c.cliente_id}`} className="font-semibold text-ink no-underline hover:underline">
                          {c.nome}
                        </Link>
                        {c.bloqueado ? (
                          <span className="ml-2 text-[11.5px] font-semibold text-tdf">Bloqueado</span>
                        ) : null}
                        {explicaAlgo ? (
                          <span className="mt-0.5 block max-w-[46ch] text-[12px] leading-snug text-muted">
                            {c.porque}
                          </span>
                        ) : null}
                      </td>
                      <td className={`${td} text-ink-2`}>
                        {c.whatsapp ? <TelefoneCopiavel telefone={c.whatsapp} /> : <span className="text-muted">—</span>}
                      </td>
                      {mostrarEmAberto ? (
                        <td className={`${td} whitespace-nowrap text-right tabular-nums`}>
                          {Number(c.em_aberto ?? 0) > 0 ? (
                            <span className="font-semibold text-twf">{formatBRL(Number(c.em_aberto))}</span>
                          ) : (
                            <span className="text-border-shalon">—</span>
                          )}
                        </td>
                      ) : null}
                      <td className={td}>
                        <CadenciaDiscreta valor={c.classificacao} explicacao={c.porque} />
                      </td>
                      <td className={`${td} text-right tabular-nums text-ink`}>{c.pedidos}</td>
                      <td className={`${td} whitespace-nowrap text-right tabular-nums text-ink`}>
                        {c.ticket_medio === null ? <span className="text-muted">—</span> : formatBRL(c.ticket_medio)}
                      </td>
                      <td className={`${td} whitespace-nowrap text-right text-ink-2`}>
                        {haQuanto(c.dias_sem_comprar)}
                      </td>
                      <td className={`${td} text-center text-[12.5px]`}>
                        {c.aceita_promocao ? (
                          <span className="font-semibold text-tgf">Sim</span>
                        ) : (
                          <span className="text-muted">Não</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalDePaginas > 1 ? (
          <nav aria-label="Páginas de clientes" className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="m-0 text-[12.5px] text-muted">
              Página {paginaAtual} de {totalDePaginas}
            </p>
            <div className="flex gap-2">
              {paginaAtual > 1 ? (
                <Link
                  href={urlDaPagina(paginaAtual - 1)}
                  className="inline-flex min-h-touch items-center rounded-11 border-[1.5px] border-border-shalon bg-surface px-4 text-[13.5px] font-semibold text-ink no-underline hover:border-brand-orange"
                >
                  ← Anterior
                </Link>
              ) : null}
              {paginaAtual < totalDePaginas ? (
                <Link
                  href={urlDaPagina(paginaAtual + 1)}
                  className="inline-flex min-h-touch items-center rounded-11 border-[1.5px] border-border-shalon bg-surface px-4 text-[13.5px] font-semibold text-ink no-underline hover:border-brand-orange"
                >
                  Próxima →
                </Link>
              ) : null}
            </div>
          </nav>
        ) : null}

        {r.sem_consentimento > 0 ? (
          <p className="m-0 mt-4 text-[12px] text-muted">
            {r.sem_consentimento} de {totalDaBase} não aceitam receber promoções pelo WhatsApp.
          </p>
        ) : null}
      </Cartao>
    </div>
  );
}

/** "hoje", "ontem", "há 5 dias" — sem "1 dias". */
function haQuanto(dias: number | null): React.ReactNode {
  if (dias === null) return <span className="text-muted">—</span>;
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  return `há ${dias} dias`;
}
