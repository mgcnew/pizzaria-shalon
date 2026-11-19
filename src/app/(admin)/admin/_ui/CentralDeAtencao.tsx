import Link from "next/link";
import { Badge } from "@/ui/components";
import { Cartao } from "@/ui/patterns";
import { formatBRL } from "@/lib/format";
import type { CentralDeAtencao as Dados, Pendencia } from "@/application/analitico/tipos";

/**
 * A fila do que pede ação agora (RN-DASH-001).
 *
 * O CRITÉRIO PARA APARECER AQUI É DURO: só entra o que tem ação possível.
 * "Faturamento do mês" é informação; ela mora nos indicadores, abaixo. O que
 * está aqui é o que alguém precisa RESOLVER.
 *
 * NADA VIRA ALERTA POR PADRÃO. Uma espera só recebe o selo "atrasado" quando
 * existe limite configurado em `alert_thresholds`; sem limite, a pendência
 * aparece com o tempo de espera e sem carimbo — porque quantos minutos são
 * demais é decisão da Shalon, não do programa (RN-DASH-003).
 *
 * Pendência resolvida some sozinha: a fila é derivada do estado real, então
 * aceitar o pedido tira o pedido da lista. Não existe "marcar como lido".
 */

const SETA = (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4 shrink-0 text-muted">
    <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * Uma pendência: a quantidade em destaque à esquerda, o que é e há quanto
 * tempo, e o toque leva direto à fila filtrada.
 */
function LinhaDePendencia({
  destino,
  quantidade,
  titulo,
  detalhe,
  atrasado = false,
}: {
  destino: string;
  quantidade: number | null;
  titulo: string;
  detalhe: string;
  atrasado?: boolean;
}) {
  return (
    <li>
      <Link
        href={destino}
        className={[
          "motion-interactive flex min-h-[58px] items-center gap-3 rounded-12 border px-3 py-2 no-underline transition-colors hover:border-brand-orange",
          atrasado ? "border-twb bg-tw" : "border-border-shalon bg-elev",
        ].join(" ")}
      >
        <span
          className={[
            "flex h-10 min-w-10 shrink-0 items-center justify-center rounded-11 px-2 font-display text-[18px] font-extrabold tabular-nums",
            atrasado ? "bg-surface text-twf" : "bg-surface text-ink",
          ].join(" ")}
        >
          {quantidade ?? "!"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold text-ink">{titulo}</span>
          <span className="block truncate text-[12.5px] text-muted">{detalhe}</span>
        </span>
        {atrasado ? <Badge tom="atencao">Acima do limite</Badge> : null}
        {SETA}
      </Link>
    </li>
  );
}

function detalheDaFila(p: Pendencia): string {
  return [
    p.valor > 0 ? formatBRL(p.valor) : null,
    p.minutos_do_mais_antigo !== null ? `o mais antigo há ${p.minutos_do_mais_antigo} min` : null,
  ]
    .filter(Boolean)
    .join(" · ") || (p.quantidade === 1 ? "1 pedido" : `${p.quantidade} pedidos`);
}

type ClienteSumido = NonNullable<Dados["clientes"]>["exemplos"][number];

/** Quantos aparecem abertos; o resto fica recolhido para o bloco não crescer. */
const CLIENTES_A_VISTA = 3;

function LinhaDeCliente({ cliente }: { cliente: ClienteSumido }) {
  const intervalo =
    cliente.intervalo_tipico !== null ? Math.max(1, Math.round(cliente.intervalo_tipico)) : null;
  return (
    <li>
      <Link
        href={`/admin/clientes/${cliente.cliente_id}`}
        className="motion-interactive flex min-h-touch items-center gap-3 rounded-11 px-2 py-1.5 no-underline transition-colors hover:bg-elev"
      >
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-elev text-[13px] font-bold text-ink-2"
        >
          {cliente.nome.trim().charAt(0).toUpperCase() || "?"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold text-ink">{cliente.nome}</span>
          <span className="block text-[12px] leading-[1.35] text-muted">
            {intervalo !== null ? `Pedia a cada ${intervalo} ${intervalo === 1 ? "dia" : "dias"}` : "Cliente com histórico"}
            {cliente.aceita_promocao ? "" : " · não aceita promoção"}
          </span>
        </span>
        <span className="shrink-0 rounded-pill bg-tw px-2 py-[3px] text-[12px] font-bold tabular-nums text-twf">
          {cliente.dias_sem_comprar} dias
        </span>
      </Link>
    </li>
  );
}

export function CentralDeAtencao({ dados }: { dados: Dados | null }) {
  if (!dados) return null;

  const p = dados.pedidos ?? undefined;
  const filas = [
    { titulo: "Aguardando confirmação", pendencia: p?.aguardando_confirmacao, destino: "/admin/pedidos?status=waiting_store_confirmation" },
    { titulo: "Aguardando confirmação de Pix", pendencia: p?.aguardando_pix, destino: "/admin/pedidos?status=waiting_pix_confirmation" },
    { titulo: "Entrega aguardando aprovação", pendencia: p?.aguardando_aprovacao_de_entrega, destino: "/admin/pedidos?status=waiting_delivery_approval" },
    { titulo: "Aguardando resposta do cliente", pendencia: p?.aguardando_cliente, destino: "/admin/pedidos?status=change_requested_waiting_customer" },
    { titulo: "Prontos e parados", pendencia: p?.prontos_parados, destino: "/admin/pedidos?status=ready_for_pickup,ready_for_delivery" },
    { titulo: "Entregas com falha", pendencia: p?.entregas_com_falha, destino: "/admin/pedidos?status=delivery_failed" },
  ].filter((f): f is typeof f & { pendencia: Pendencia } => (f.pendencia?.quantidade ?? 0) > 0);

  const entregas = dados.entregas ?? null;
  const caixa = dados.caixa ?? null;
  const clientes = dados.clientes ?? null;

  const acerto = entregas?.aguardando_acerto;
  const acertoPendente = (acerto?.quantidade ?? 0) > 0;
  const caixaDeOntem = caixa?.aberto_de_ontem ?? false;
  const temPendencia = filas.length > 0 || acertoPendente || caixaDeOntem;

  const sumidos = clientes?.exemplos ?? [];
  const totalSumidos = Math.max(sumidos.length, (clientes?.em_atencao ?? 0) + (clientes?.afastados ?? 0));

  return (
    <Cartao
      titulo="Precisa de você agora"
      descricao="Some sozinho quando for resolvido."
      largura="cheio"
    >
      {temPendencia ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {filas.map((f) => (
            <LinhaDePendencia
              key={f.titulo}
              destino={f.destino}
              quantidade={f.pendencia.quantidade}
              titulo={f.titulo}
              detalhe={detalheDaFila(f.pendencia)}
              atrasado={f.pendencia.atrasado === true}
            />
          ))}
          {acertoPendente && acerto ? (
            <LinhaDePendencia
              destino="/admin/entregas"
              quantidade={acerto.quantidade}
              titulo="Motoboy voltou e ainda não acertou"
              detalhe={
                acerto.minutos_da_mais_antiga !== null
                  ? `a saída mais antiga há ${acerto.minutos_da_mais_antiga} min`
                  : acerto.quantidade === 1 ? "1 saída" : `${acerto.quantidade} saídas`
              }
              atrasado={acerto.atrasada === true}
            />
          ) : null}
          {caixaDeOntem ? (
            <LinhaDePendencia
              destino="/admin/pdv"
              quantidade={null}
              titulo="Caixa aberto de um dia anterior"
              detalhe={`Data operacional ${caixa?.data_operacional}. Não fecha sozinho.`}
              atrasado
            />
          ) : null}
        </ul>
      ) : (
        // Nada pendente é a notícia boa: uma linha, sem ocupar a tela.
        <p className="m-0 flex min-h-touch items-center gap-2 rounded-12 bg-tg px-3 text-[13.5px] font-semibold text-tgf">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5 shrink-0">
            <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
            <path d="m8.3 12.3 2.5 2.5 5-5.2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Tudo em dia. Nada esperando decisão.
        </p>
      )}

      {entregas && entregas.na_rua.corridas > 0 ? (
        <p className="mb-0 mt-3 flex items-center gap-2 rounded-12 border border-border-shalon bg-elev px-3 py-2.5 text-[12.5px] text-ink-2">
          <span>
            <strong className="font-semibold text-ink">{formatBRL(entregas.na_rua.dinheiro_na_rua)}</strong>{" "}
            com motoboys em {entregas.na_rua.corridas}{" "}
            {entregas.na_rua.corridas === 1 ? "saída" : "saídas"}. É faturamento, mas ainda não é caixa.
          </span>
        </p>
      ) : null}

      {sumidos.length > 0 ? (
        <section className="mt-4 border-t border-border-shalon pt-3" aria-labelledby="clientes-sumidos">
          <div className="mb-1 flex items-center justify-between gap-2">
            <h4 id="clientes-sumidos" className="m-0 text-[13.5px] font-bold text-ink">
              Clientes sumidos <span className="font-semibold text-muted">({totalSumidos})</span>
            </h4>
            <Link href="/admin/remarketing" className="text-[12.5px] font-semibold text-brand-red no-underline">
              Chamar de volta →
            </Link>
          </div>
          <ul className="m-0 flex list-none flex-col p-0">
            {sumidos.slice(0, CLIENTES_A_VISTA).map((c) => (
              <LinhaDeCliente key={c.cliente_id} cliente={c} />
            ))}
          </ul>
          {sumidos.length > CLIENTES_A_VISTA ? (
            <details className="group">
              <summary className="flex min-h-touch cursor-pointer list-none items-center gap-1 px-2 text-[12.5px] font-semibold text-ink-2 marker:hidden [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">Ver mais {sumidos.length - CLIENTES_A_VISTA}</span>
                <span className="hidden group-open:inline">Ver menos</span>
              </summary>
              <ul className="m-0 flex list-none flex-col p-0">
                {sumidos.slice(CLIENTES_A_VISTA).map((c) => (
                  <LinhaDeCliente key={c.cliente_id} cliente={c} />
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      ) : null}
    </Cartao>
  );
}
