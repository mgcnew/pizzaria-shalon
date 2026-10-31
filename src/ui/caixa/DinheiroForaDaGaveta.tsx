"use client";

import { useState, useTransition } from "react";
import { Button } from "@/ui/components";
import { Aviso } from "@/ui/patterns";
import { formatBRL } from "@/lib/format";
import { dinheiroEntrouNaGaveta, obterCausasDaDiferenca } from "@/application/caixa/acoes";
import type { CausasDaDiferenca } from "@/application/caixa/tipos";
import { Linha } from "./CausasDaDiferenca";

type Pagamento = CausasDaDiferenca["fora_da_gaveta"][number];

/**
 * Dinheiro recebido que não está em nenhum caixa, com os pedidos que formam o
 * valor (D-2026-10-31-181). As entregas de antes do "Saiu com…" (D-172) ficaram
 * assim, mesmo com o dinheiro já na gaveta. Confirmar usa
 * `dinheiro_entrou_na_gaveta`: entra no caixa do dia do recebimento e, se ele já
 * fechou, o fechamento é corrigido e o original fica guardado.
 *
 * O que está ligado a saída de motoboy não é confirmado aqui: entra pelo acerto
 * (RN-CAIXA-014). Por isso sobra no total, mas não aparece na lista.
 */
export function DinheiroForaDaGaveta({
  total,
  corrigivel = true,
  aoCorrigir,
}: {
  total: number;
  /** Sessão fechada: só informa, porque a lista é a do caixa aberto. */
  corrigivel?: boolean;
  /** Algo entrou no caixa de agora: o esperado mudou. */
  aoCorrigir?: () => void;
}) {
  const [pagamentos, setPagamentos] = useState<Pagamento[] | "carregando" | "erro" | null>(null);
  const [confirmados, setConfirmados] = useState<Pagamento[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  const restante = Math.max(0, total - confirmados.reduce((soma, p) => soma + p.valor, 0));
  if (restante <= 0) return null;

  function abrir() {
    setPagamentos("carregando");
    obterCausasDaDiferenca()
      .then((causas) => setPagamentos(causas ? causas.fora_da_gaveta : "erro"))
      .catch(() => setPagamentos("erro"));
  }

  function confirmar(pagamento: Pagamento) {
    setErro(null);
    iniciar(async () => {
      const r = await dinheiroEntrouNaGaveta(pagamento.pagamento_id);
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível colocar esse dinheiro no caixa.");
        return;
      }
      setConfirmados((anteriores) => [...anteriores, pagamento]);
      if (pagamento.deste_turno) aoCorrigir?.();
    });
  }

  const lista = Array.isArray(pagamentos)
    ? pagamentos.filter((p) => !confirmados.some((c) => c.pagamento_id === p.pagamento_id))
    : [];
  const comMotoboy = Array.isArray(pagamentos)
    ? restante - lista.reduce((soma, p) => soma + p.valor, 0)
    : 0;

  return (
    <div className="flex flex-col gap-2 rounded-12 border border-twb bg-tw p-3 text-[13px] text-twf print:rounded-none print:border-x-0 print:bg-white print:text-black">
      <p className="m-0 font-semibold">Dinheiro recebido que ainda não está em nenhum caixa: {formatBRL(restante)}</p>

      {corrigivel && pagamentos === null ? (
        <div className="print:hidden">
          <Button type="button" tamanho="sm" variante="secundario" onClick={abrir}>
            Ver os pedidos
          </Button>
        </div>
      ) : null}
      {pagamentos === "carregando" ? <p className="m-0 print:hidden">Carregando…</p> : null}
      {pagamentos === "erro" ? (
        <p className="m-0 print:hidden">Não foi possível carregar os pedidos. Confira se o caixa está aberto.</p>
      ) : null}

      {Array.isArray(pagamentos) ? (
        <div className="flex flex-col gap-2 print:hidden">
          <p className="m-0 leading-snug">
            Se o dinheiro entrou na gaveta naquele dia, confirme. Ele entra no caixa do dia, e o fechamento já feito é
            corrigido, com o original guardado. Só quem pode corrigir caixa fechado confirma dias anteriores.
          </p>
          <div className="flex flex-col gap-1 rounded-10 border border-border-shalon bg-surface p-2">
            {lista.map((p) => (
              <Linha
                key={p.pagamento_id}
                pedidoId={p.pedido_id}
                numero={p.numero}
                detalhe={
                  p.deste_turno
                    ? "caixa de agora"
                    : p.turno_data
                      ? `caixa de ${new Date(`${p.turno_data}T12:00:00`).toLocaleDateString("pt-BR")}`
                      : "sem caixa aberto na hora"
                }
                valor={p.valor}
              >
                {p.turno_id ? (
                  <Button type="button" tamanho="sm" variante="secundario" disabled={enviando} onClick={() => confirmar(p)}>
                    {p.deste_turno ? "Está na gaveta" : "Estava na gaveta"}
                  </Button>
                ) : null}
              </Linha>
            ))}
            {comMotoboy > 0 ? (
              <p className="m-0 pt-1 text-[12.5px] text-ink-2">
                {formatBRL(comMotoboy)} {lista.length > 0 ? "restantes estão" : "estão"} em saídas de motoboy e entram
                pelo acerto.
              </p>
            ) : null}
          </div>
          {erro ? <Aviso erro={erro} /> : null}
        </div>
      ) : null}
    </div>
  );
}
