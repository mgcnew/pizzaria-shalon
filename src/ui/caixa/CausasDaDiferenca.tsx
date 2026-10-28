"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/ui/components";
import { Aviso } from "@/ui/patterns";
import { formatBRL } from "@/lib/format";
import { dinheiroEntrouNaGaveta, obterCausasDaDiferenca } from "@/application/caixa/acoes";
import type { CausasDaDiferenca as Causas } from "@/application/caixa/tipos";
import type { PedidoSemRecebimento } from "@/domain/caixa/relatorioDeFechamento";
import { PedidosSemRecebimento } from "./PedidosSemRecebimento";
import { SaidaDaGaveta } from "./SaidaDaGaveta";

/**
 * O que pode explicar a diferença, antes de pedir a justificativa
 * (D-2026-10-27-171). Cada item vem do banco e tem o gesto que corrige; depois
 * de corrigir, o caixa é conferido de novo com a MESMA contagem — se bater,
 * fecha. A contagem física nunca é alterada aqui.
 */
export function CausasDaDiferenca({
  diferenca,
  semRecebimento,
  aoCorrigir,
}: {
  diferenca: number;
  semRecebimento: PedidoSemRecebimento[];
  /** Algo foi corrigido: confere o caixa de novo. */
  aoCorrigir: () => void;
}) {
  const [causas, setCausas] = useState<Causas | null | "carregando">("carregando");
  const [saida, setSaida] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  useEffect(() => {
    let ativo = true;
    obterCausasDaDiferenca()
      .then((c) => ativo && setCausas(c))
      .catch(() => ativo && setCausas(null));
    return () => {
      ativo = false;
    };
  }, []);

  if (causas === "carregando") {
    return <div aria-hidden="true" className="h-[120px] animate-pulse rounded-12 bg-tn" />;
  }

  const foraDeste = causas?.fora_da_gaveta.filter((f) => f.deste_turno) ?? [];
  const foraAntigos = causas?.fora_da_gaveta.filter((f) => !f.deste_turno) ?? [];
  const falta = diferenca < 0;
  const semSaidas = causas !== null && causas.saidas_registradas === 0;
  let achados = 0;

  function recolher(pagamentoId: string) {
    setErro(null);
    iniciar(async () => {
      const r = await dinheiroEntrouNaGaveta(pagamentoId);
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível colocar esse dinheiro no caixa.");
        return;
      }
      aoCorrigir();
    });
  }

  const blocos: React.ReactNode[] = [];

  if (foraDeste.length > 0) {
    achados += 1;
    const total = foraDeste.reduce((s, f) => s + f.valor, 0);
    blocos.push(
      <Bloco
        key="fora"
        titulo={`Dinheiro registrado fora da gaveta: ${formatBRL(total)}`}
        texto={'Foi recebido neste turno com "Este dinheiro entrou na gaveta agora" desmarcado. Se o dinheiro está na gaveta, confirme: isso explica uma sobra.'}
      >
        {foraDeste.map((f) => (
          <Linha key={f.pagamento_id} pedidoId={f.pedido_id} numero={f.numero} detalhe={f.cliente} valor={f.valor}>
            <Button tamanho="sm" variante="secundario" disabled={enviando} onClick={() => recolher(f.pagamento_id)}>
              Está na gaveta
            </Button>
          </Linha>
        ))}
      </Bloco>,
    );
  }

  if (falta && semSaidas) {
    achados += 1;
    blocos.push(
      <Bloco
        key="saidas"
        titulo="Nenhuma saída de dinheiro foi registrada neste caixa"
        texto="Pagou motoboy, fez uma compra ou a dona tirou dinheiro? Registre aqui e o caixa é conferido de novo."
      >
        {saida ? (
          <div className="rounded-12 border border-border-shalon bg-surface p-3">
            <SaidaDaGaveta
              aoConcluir={() => {
                setSaida(false);
                aoCorrigir();
              }}
              aoCancelar={() => setSaida(false)}
            />
          </div>
        ) : (
          <Button tamanho="sm" variante="secundario" onClick={() => setSaida(true)}>
            Registrar dinheiro que saiu
          </Button>
        )}
      </Bloco>,
    );
  }

  if (causas && causas.forma_diferente.length > 0) {
    achados += 1;
    blocos.push(
      <Bloco
        key="forma"
        titulo="Forma registrada diferente da escolhida no pedido"
        texto="Se o cliente pagou de outro jeito, o registro está certo. Se a forma foi lançada errada, troque no Histórico de vendas."
      >
        {causas.forma_diferente.map((f) => (
          <Linha
            key={f.pedido_id}
            pedidoId={f.pedido_id}
            numero={f.numero}
            detalhe={`escolheu ${f.escolhida}, registrado ${f.registrada}`}
            valor={f.valor}
          />
        ))}
      </Bloco>,
    );
  }

  if (semRecebimento.length > 0) {
    achados += 1;
    blocos.push(<PedidosSemRecebimento key="sem" pedidos={semRecebimento} antesDeFechar />);
  }

  // Não é "achado": é por onde começar quando o dinheiro das entregas não bate.
  const motoboys = causas?.motoboys ?? [];
  if (motoboys.length > 0) {
    blocos.push(
      <Bloco
        key="motoboys"
        titulo="Dinheiro que os motoboys entregaram nesta gaveta"
        texto="Conferido na volta de cada um. Se a falta for do dinheiro das entregas, comece por aqui."
      >
        {motoboys.map((m) => (
          <div
            key={m.nome}
            className="flex min-h-[40px] flex-wrap items-center justify-between gap-2 border-t border-border-shalon pt-1 first:border-t-0 first:pt-0"
          >
            <span className="text-[13px] text-ink">
              <strong>{m.nome}</strong> · {m.entregas} {m.entregas === 1 ? "entrega" : "entregas"}
              {m.diferenca !== 0
                ? ` · ${m.diferenca < 0 ? "faltaram" : "sobraram"} ${formatBRL(Math.abs(m.diferenca))} na volta`
                : ""}
            </span>
            <span className="text-[13px] tabular-nums text-ink">{formatBRL(m.dinheiro)}</span>
          </div>
        ))}
      </Bloco>,
    );
  }

  if (causas && causas.trocos.length > 0) {
    achados += 1;
    blocos.push(
      <Bloco
        key="trocos"
        titulo="Vendas em dinheiro com troco"
        texto="Confira se o valor entregue pelo cliente foi digitado certo: troco calculado errado vira diferença."
      >
        {causas.trocos.map((t) => (
          <Linha
            key={t.pedido_id}
            pedidoId={t.pedido_id}
            numero={t.numero}
            detalhe={`entregou ${t.entregue === null ? "—" : formatBRL(t.entregue)} · troco ${formatBRL(t.troco)}`}
            valor={t.valor}
          />
        ))}
      </Bloco>,
    );
  }

  return (
    <section aria-labelledby="titulo-causas" className="flex flex-col gap-3">
      <div>
        <h3 id="titulo-causas" className="m-0 font-display text-[16px] font-bold text-ink">
          O que pode explicar a diferença
        </h3>
        <p className="m-0 mt-1 text-[13px] text-muted">
          {causas === null
            ? "Não foi possível buscar as causas agora. Você ainda pode justificar e fechar."
            : achados === 0
              ? "O sistema não encontrou nada registrado que explique. Veja as opções da justificativa abaixo."
              : "O sistema encontrou isto neste turno. Corrija o que for o caso; a contagem que você fez é mantida."}
        </p>
      </div>
      {erro ? <Aviso erro={erro} /> : null}
      {blocos}
      {foraAntigos.length > 0 ? (
        <Bloco
          titulo={`De caixas anteriores, ainda fora da gaveta: ${formatBRL(foraAntigos.reduce((s, f) => s + f.valor, 0))}`}
          texto="Não mudam este caixa. Se esse dinheiro entrou na gaveta naquele dia, confirme: o fechamento daquele dia é corrigido e o original fica guardado. Só quem pode corrigir caixa fechado faz isso."
        >
          {foraAntigos.map((f) => (
            <Linha
              key={f.pagamento_id}
              pedidoId={f.pedido_id}
              numero={f.numero}
              detalhe={f.turno_data ? `caixa de ${new Date(`${f.turno_data}T12:00:00`).toLocaleDateString("pt-BR")}` : "sem caixa aberto na hora"}
              valor={f.valor}
            >
              {f.turno_id ? (
                <Button tamanho="sm" variante="fantasma" disabled={enviando} onClick={() => recolher(f.pagamento_id)}>
                  Estava na gaveta
                </Button>
              ) : null}
            </Linha>
          ))}
        </Bloco>
      ) : null}
    </section>
  );
}

function Bloco({ titulo, texto, children }: { titulo: string; texto: string; children: React.ReactNode }) {
  return (
    <div className="rounded-12 border border-border-shalon bg-elev p-3">
      <p className="m-0 text-[13.5px] font-bold text-ink">{titulo}</p>
      <p className="m-0 mt-1 text-[12.5px] leading-snug text-muted">{texto}</p>
      <div className="mt-2 flex flex-col gap-1">{children}</div>
    </div>
  );
}

function Linha({
  pedidoId,
  numero,
  detalhe,
  valor,
  children,
}: {
  pedidoId: string;
  numero: number;
  detalhe: string | null;
  valor: number;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[40px] flex-wrap items-center justify-between gap-2 border-t border-border-shalon pt-1 first:border-t-0 first:pt-0">
      <Link href={`/admin/pedidos/${pedidoId}`} className="min-w-0 text-[13px] text-ink underline-offset-2 hover:underline">
        <strong>#{numero}</strong>
        {detalhe ? ` · ${detalhe}` : ""}
      </Link>
      <span className="flex items-center gap-2">
        <span className="text-[13px] tabular-nums text-ink">{formatBRL(valor)}</span>
        {children}
      </span>
    </div>
  );
}
