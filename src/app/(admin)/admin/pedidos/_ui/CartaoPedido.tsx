import { StatusBadge } from "@/ui/components";
import { formatBRL } from "@/lib/format";
import { ESTADOS_COM_ACRESCIMO, rotuloInterno } from "@/domain/pedidos/estados";
import { CanalDoPedido } from "@/ui/components/CanalDoPedido";
import type { PedidoNaFila } from "@/application/pedidos/tipos";
import type { PedidoAReceber } from "@/application/pdv/tipos";
import { AcoesDoPedido } from "./AcoesDoPedido";
import { ESTILO_RECEBER } from "./estiloDasAcoes";

/**
 * Um pedido na fila.
 *
 * Desenhado para ser lido de relance no balcão: número grande, modalidade
 * em texto (não só em cor, CLAUDE.md §38), o que está travando e as ações
 * possíveis ali mesmo — sem precisar abrir o detalhe para aceitar.
 */
export function CartaoPedido({
  pedido,
  hora,
  espera,
  cobravel,
  aoCobrar,
  consultaDaAba,
}: {
  pedido: PedidoNaFila;
  hora: string;
  /**
   * Quanto já esperou, do relógio do servidor. Opcional: a aba *Encerrados*
   * não passa — lá "espera" não quer dizer nada, o pedido acabou.
   */
  espera?: string;
  /**
   * O mesmo atalho de cobrança da tabela, para o mobile.
   *
   * Sem ele a gaveta seria inalcançável no celular e a tela contaria duas
   * histórias conforme a largura — que foi o problema que a coluna de espera
   * já tinha criado uma vez.
   */
  cobravel?: PedidoAReceber | null;
  aoCobrar?: (pedido: PedidoAReceber) => void;
  /**
   * O começo da query dos links de modal ("aba=encerrados&dias=7&"), para que
   * abrir e fechar um pedido não descarte os dias já carregados. Omitido, vale
   * o padrão da aba.
   */
  consultaDaAba?: string;
}) {
  const estado = rotuloInterno(pedido.status);

  const travas = [
    pedido.aguarda_pix ? "Pix não confirmado" : null,
    pedido.taxa_a_definir != null
      ? "Taxa de entrega a definir"
      : pedido.aguarda_aprovacao_entrega
        ? "Entrega não aprovada"
        : null,
    pedido.aguarda_cliente ? "Alteração aguardando o cliente" : null,
    pedido.fiado ? "Fiado (pagar depois)" : null,
  ].filter((t): t is string => t !== null);

  return (
    <article className="rounded-16 border border-border-shalon bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="font-display text-[20px] font-extrabold text-ink">
            #{pedido.numero}
          </span>
          <p className="m-0 text-[14px] text-ink-2">{pedido.cliente}</p>
          {/* A ESPERA NA FRENTE, como na tabela do desktop. O cartão mostrava
              só a hora do relógio, e `20:41` sem data parecia recente quando
              era o pedido mais antigo da fila. A hora fica, em segundo plano:
              serve para localizar, não para priorizar. */}
          <p className="m-0 text-[12.5px] text-muted">
            {espera ? <span className="font-semibold text-ink-2">{espera}</span> : null}
            {espera ? " · " : ""}
            {hora} · {pedido.itens} {pedido.itens === 1 ? "item" : "itens"}
          </p>
        </div>

        <div className="flex flex-col items-end gap-[6px]">
          <StatusBadge tom={estado.tom} pulsante={pedido.status === "waiting_store_confirmation"}>
            {estado.rotulo}
          </StatusBadge>
          <span className="rounded-pill border border-border-shalon px-[8px] py-[3px] text-[12px] font-semibold text-ink">
            <CanalDoPedido origem={pedido.origem} modalidade={pedido.modalidade} />
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[13.5px] text-ink-2">
          {pedido.forma_pagamento ?? "—"}
          {pedido.troco !== null ? ` · troco ${formatBRL(pedido.troco)}` : ""}
        </span>
        <span className="font-display text-[18px] font-extrabold tabular-nums text-ink">
          {formatBRL(pedido.total)}
        </span>
      </div>

      {travas.length > 0 ? (
        <ul className="m-0 mt-2 list-none p-0">
          {travas.map((t) => (
            <li
              key={t}
              className="mt-1 rounded-10 bg-tw px-3 py-[6px] text-[12.5px] font-semibold text-twf"
            >
              {t}
            </li>
          ))}
        </ul>
      ) : null}

      {pedido.observacao ? (
        <p className="m-0 mt-2 rounded-10 bg-elev px-3 py-2 text-[13px] italic text-ink-2">
          “{pedido.observacao}”
        </p>
      ) : null}

      <div className="mt-3 flex flex-col gap-2">
        {cobravel && aoCobrar ? (
          <button
            type="button"
            onClick={() => aoCobrar(cobravel)}
            className={`min-h-touch w-full cursor-pointer rounded-10 border bg-transparent px-3 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-orange ${ESTILO_RECEBER}`}
          >
            Receber {formatBRL(cobravel.total)}
          </button>
        ) : null}
        <AcoesDoPedido
          pedidoId={pedido.id}
          acoes={pedido.acoes}
          tetoDaTaxa={pedido.taxa_a_definir ?? null}
          compacto
          modo="linha"
          comPrimaria={!cobravel}
          itensAdicionais={[
            {
              rotulo: "Ver detalhes",
              href: `/admin/pedidos?${consultaDaAba ?? (pedido.encerrado ? "aba=encerrados&" : "")}modal=detalhes&pedido=${pedido.id}`,
            },
            {
              rotulo: "Emitir comanda",
              href: `/admin/pedidos?${consultaDaAba ?? (pedido.encerrado ? "aba=encerrados&" : "")}modal=comanda&pedido=${pedido.id}`,
            },
            ...(ESTADOS_COM_ACRESCIMO.includes(pedido.status) && !pedido.aguarda_cliente
              ? [
                  {
                    rotulo: "Acrescentar itens",
                    href: `/admin/pedidos?${consultaDaAba ?? ""}modal=detalhes&pedido=${pedido.id}&acrescentar=1`,
                  },
                ]
              : []),
          ]}
        />
      </div>
    </article>
  );
}
