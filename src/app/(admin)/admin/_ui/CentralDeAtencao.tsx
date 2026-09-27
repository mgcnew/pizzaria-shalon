import Link from "next/link";
import { Badge } from "@/ui/components";
import { Cartao, EmptyState } from "@/ui/patterns";
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

function Fila({
  titulo,
  pendencia,
  destino,
}: {
  titulo: string;
  pendencia: Pendencia | undefined;
  destino: string;
}) {
  if (!pendencia || pendencia.quantidade === 0) return null;

  return (
    <Link
      href={destino}
      className="motion-interactive flex items-center justify-between gap-3 rounded-12 border border-border-shalon bg-elev px-[14px] py-3 transition-colors hover:border-brand-orange"
    >
      <span className="flex flex-col gap-[3px]">
        <span className="text-[14px] font-semibold text-ink">{titulo}</span>
        <span className="text-[12.5px] text-muted">
          {pendencia.quantidade} {pendencia.quantidade === 1 ? "pedido" : "pedidos"}
          {pendencia.valor > 0 ? ` · ${formatBRL(pendencia.valor)}` : ""}
          {pendencia.minutos_do_mais_antigo !== null
            ? ` · o mais antigo há ${pendencia.minutos_do_mais_antigo} min`
            : ""}
        </span>
      </span>
      {pendencia.atrasado ? <Badge tom="atencao">Acima do limite</Badge> : null}
    </Link>
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
    { titulo: "Prontos e parados", pendencia: p?.prontos_parados, destino: "/admin/pedidos?status=ready_for_pickup" },
    { titulo: "Entregas com falha", pendencia: p?.entregas_com_falha, destino: "/admin/pedidos?status=delivery_failed" },
  ];

  const temFila = filas.some((f) => (f.pendencia?.quantidade ?? 0) > 0);
  const entregas = dados.entregas ?? null;
  const caixa = dados.caixa ?? null;
  const clientes = dados.clientes ?? null;

  const acertoPendente = (entregas?.aguardando_acerto.quantidade ?? 0) > 0;
  const caixaDeOntem = caixa?.aberto_de_ontem ?? false;

  return (
    <Cartao
      titulo="Precisa de você agora"
      descricao="Some sozinho quando for resolvido. Nada aqui é marcado como lido."
      largura="cheio"
    >
      {temFila || acertoPendente || caixaDeOntem ? (
        <div className="flex flex-col gap-2">
          {filas.map((f) => (
            <Fila key={f.titulo} titulo={f.titulo} pendencia={f.pendencia} destino={f.destino} />
          ))}

          {acertoPendente ? (
            <Link
              href="/admin/entregas"
              className="motion-interactive flex items-center justify-between gap-3 rounded-12 border border-border-shalon bg-elev px-[14px] py-3 transition-colors hover:border-brand-orange"
            >
              <span className="flex flex-col gap-[3px]">
                <span className="text-[14px] font-semibold text-ink">
                  Motoboy voltou e ainda não acertou
                </span>
                <span className="text-[12.5px] text-muted">
                  {entregas?.aguardando_acerto.quantidade}{" "}
                  {entregas?.aguardando_acerto.quantidade === 1 ? "saída" : "saídas"}
                  {entregas?.aguardando_acerto.minutos_da_mais_antiga !== null
                    ? ` · a mais antiga há ${entregas?.aguardando_acerto.minutos_da_mais_antiga} min`
                    : ""}
                </span>
              </span>
              {entregas?.aguardando_acerto.atrasada ? (
                <Badge tom="atencao">Acima do limite</Badge>
              ) : null}
            </Link>
          ) : null}

          {caixaDeOntem ? (
            <Link
              href="/admin/pdv"
              className="motion-interactive flex items-center justify-between gap-3 rounded-12 border border-border-shalon bg-elev px-[14px] py-3 transition-colors hover:border-brand-orange"
            >
              <span className="flex flex-col gap-[3px]">
                <span className="text-[14px] font-semibold text-ink">
                  Caixa aberto de um dia anterior
                </span>
                <span className="text-[12.5px] text-muted">
                  Data operacional {caixa?.data_operacional}. O sistema avisa, mas não fecha
                  sozinho.
                </span>
              </span>
            </Link>
          ) : null}
        </div>
      ) : (
        <EmptyState
          titulo="Nada pendente agora"
          descricao="Quando algo precisar de decisão, aparece aqui."
        />
      )}

      {entregas && entregas.na_rua.corridas > 0 ? (
        <p className="mt-3 rounded-12 border border-border-shalon bg-elev px-[14px] py-[10px] text-[12.5px] text-ink-2">
          <strong className="font-semibold text-ink">
            {formatBRL(entregas.na_rua.dinheiro_na_rua)}
          </strong>{" "}
          estão com motoboys em {entregas.na_rua.corridas}{" "}
          {entregas.na_rua.corridas === 1 ? "saída" : "saídas"}. Isso é faturamento, mas ainda
          não é caixa.
        </p>
      ) : null}

      {clientes && clientes.exemplos.length > 0 ? (
        <div className="mt-3">
          <p className="m-0 mb-2 text-[12.5px] font-semibold text-ink">
            Clientes com histórico que estão sumidos
          </p>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {clientes.exemplos.map((c) => (
              <li key={c.cliente_id} className="text-[12.5px] text-muted">
                <Link href={`/admin/clientes/${c.cliente_id}`} className="font-semibold text-ink">
                  {c.nome}
                </Link>{" "}
                — compra a cada ~{c.intervalo_tipico} dias e está há {c.dias_sem_comprar} sem
                comprar
                {c.aceita_promocao ? "" : " · não aceita promoção"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Cartao>
  );
}
