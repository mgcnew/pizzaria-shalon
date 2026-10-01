"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GavetaDeCobranca } from "../../pedidos/_ui/GavetaDeCobranca";
import type { FormaParaRecebimento } from "../../pedidos/_ui/Recebimento";
import type { PedidoAReceber } from "@/application/pdv/tipos";
import { Badge, Button, Input, SelectMenu, Textarea } from "@/ui/components";
import { Aviso, Cartao, EmptyState, LinhaLista, ParDeDados } from "@/ui/patterns";
import { formatBRL } from "@/lib/format";
import {
  atribuirEntrega,
  conciliarCorrida,
  despacharCorrida,
  registrarRetorno,
  transferirEntrega,
} from "@/application/entregas/acoes";
import type {
  CentralDeEntregas,
  Corrida,
  CorridaResumo,
  PedidoDaCorrida,
} from "@/application/entregas/tipos";

/**
 * A central de entregas.
 *
 * A PERGUNTA QUE ELA RESPONDE EM UM OLHAR: o que está esperando motoboy, o
 * que está na rua, e quanto dinheiro da Shalon está fora da gaveta agora.
 *
 * O QUE ELA NÃO FAZ: somar dinheiro. Cada número aqui vem do servidor, e o
 * acerto recalcula o esperado no momento de gravar — o valor exibido enquanto
 * a pessoa digita é conferência, não autoridade (03 §16.4).
 *
 * `Na rua` NUNCA aparece junto do saldo do caixa, e isso é deliberado: é o
 * erro que faria a Shalon acreditar que tem dinheiro que ainda está com o
 * entregador (RN-CAIXA-014).
 */

const STATUS: Record<
  CorridaResumo["status"],
  { texto: string; tom: "destaque" | "atencao" | "indisponivel" }
> = {
  open: { texto: "Montando", tom: "indisponivel" },
  out: { texto: "Na rua", tom: "atencao" },
  settling: { texto: "Voltou — a acertar", tom: "atencao" },
  settled: { texto: "Acertada", tom: "destaque" },
};

const SITUACAO: Record<PedidoDaCorrida["situacao"], string> = {
  pending: "A conferir",
  delivered: "Entregue",
  failed: "Não entregue",
  // Antes de sair × depois de sair. A diferença importa no acerto.
  reassigned: "Trocado antes da saída",
  transferred: "Transferido em rota",
};

function paraNumero(texto: string): number | null {
  const limpo = texto.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (limpo === "") return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

function endereco(dados: Record<string, unknown> | null): string {
  if (!dados) return "—";
  const rua = String(dados["logradouro"] ?? "");
  const numero = String(dados["numero"] ?? "");
  const bairro = String(dados["bairro"] ?? "");
  return [`${rua}${numero ? `, ${numero}` : ""}`, bairro].filter(Boolean).join(" · ") || "—";
}

export function PainelDeEntregas({
  central,
  corrida,
  podeAcertar,
  podeReceber = false,
  cobraveis = {},
  formasDeRecebimento = [],
  caixaAberto = false,
}: {
  central: CentralDeEntregas;
  corrida: Corrida | null;
  /** `deliveries.settle`. Sem ela o acerto nem aparece (RN-RBAC-004). */
  podeAcertar: boolean;
  /** `payments.register`: receber, no acerto, o que o cliente pagou na porta. */
  podeReceber?: boolean;
  /** Quem está devendo, pela mesma `pedidos_a_receber` da fila de pedidos. */
  cobraveis?: Record<string, PedidoAReceber>;
  formasDeRecebimento?: FormaParaRecebimento[];
  caixaAberto?: boolean;
}) {
  const router = useRouter();
  /**
   * Receber no acerto (D-2026-10-01-111): a MESMA gaveta e a MESMA
   * `registrar_pagamento` da fila de pedidos. Pedido e chave da tentativa
   * nascem juntos no clique, como lá.
   */
  const [cobrando, setCobrando] = useState<{ pedido: PedidoAReceber; tentativa: string } | null>(
    null,
  );
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const [motoboyEscolhido, setMotoboyEscolhido] = useState<Record<string, string>>({});
  const [falhando, setFalhando] = useState<string | null>(null);
  const [motivoFalha, setMotivoFalha] = useState("");
  const [transferindo, setTransferindo] = useState<string | null>(null);
  const [motivoTransferencia, setMotivoTransferencia] = useState("");
  const [destino, setDestino] = useState("");
  const [acertando, setAcertando] = useState(false);
  const [devolvido, setDevolvido] = useState("");
  const [motivoAcerto, setMotivoAcerto] = useState("");
  const [exigeMotivo, setExigeMotivo] = useState(false);

  const chave = useRef(crypto.randomUUID());

  function executar(acao: () => Promise<{ ok: boolean; erro?: string; exigeMotivo?: boolean }>) {
    setErro(null);
    iniciar(async () => {
      const r = await acao();
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível concluir esta ação.");
        if (r.exigeMotivo) setExigeMotivo(true);
        return;
      }
      chave.current = crypto.randomUUID();
      setFalhando(null);
      setMotivoFalha("");
      setTransferindo(null);
      setMotivoTransferencia("");
      setDestino("");
      setExigeMotivo(false);
      setAcertando(false);
      setDevolvido("");
      setMotivoAcerto("");
    });
  }

  const naRua = central.corridas.reduce((s, c) => s + c.dinheiro_na_rua, 0);
  const valorDevolvido = paraNumero(devolvido);
  const diferenca =
    corrida && valorDevolvido !== null ? valorDevolvido - corrida.esperado_em_dinheiro : null;

  return (
    <div className="flex flex-col gap-5">
      <Aviso {...(erro ? { erro } : {})} />

      {/* RN-CAIXA-014: dito com todas as letras, longe do saldo do caixa. */}
      {naRua > 0 ? (
        <Cartao largura="cheio">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="m-0 text-[13.5px] text-muted">
              Dinheiro com os motoboys, ainda fora da gaveta
            </p>
            <p className="m-0 font-display text-[22px] font-bold text-ink">{formatBRL(naRua)}</p>
          </div>
          <p className="m-0 mt-1 text-[12.5px] text-muted">
            Esse valor não está no caixa. Ele entra quando o acerto da corrida for feito.
          </p>
        </Cartao>
      ) : null}

      {/* ---------------------------------------------- fila de entrega */}
      <Cartao
        titulo="Esperando motoboy"
        descricao="Pedidos prontos para entrega, ainda sem alguém para levar."
        largura="cheio"
      >
        {central.aguardando.length === 0 ? (
          <EmptyState titulo="Nada esperando" descricao="Nenhum pedido pronto para sair agora." />
        ) : (
          central.aguardando.map((p) => (
            <LinhaLista key={p.pedido_id}>
              <div className="min-w-[180px] flex-1">
                <p className="m-0 text-[14px] font-semibold text-ink">
                  #{p.numero} · {p.cliente}
                </p>
                <p className="m-0 text-[12.5px] text-muted">{endereco(p.endereco)}</p>
              </div>

              <div className="text-right">
                <p className="m-0 text-[14px] font-semibold text-ink">{formatBRL(p.total)}</p>
                <p className="m-0 text-[12.5px] text-muted">
                  {p.ja_pago ? "Já pago" : `A receber · ${p.pagamento_esperado ?? "—"}`}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <SelectMenu
                  label={`Motoboy para o pedido ${p.numero}`}
                  labelOculto
                  valor={motoboyEscolhido[p.pedido_id] ?? ""}
                  aoMudar={(valor) =>
                    setMotoboyEscolhido((m) => ({ ...m, [p.pedido_id]: valor }))
                  }
                  opcoes={[
                    { valor: "", texto: "Escolha o motoboy" },
                    ...central.motoboys.map((m) => ({
                      valor: m.funcionario_id,
                      texto: `${m.nome}${m.ocupado ? " (já em rota)" : ""}`,
                    })),
                  ]}
                />
                <Button
                  variante="primario"
                  disabled={enviando || !motoboyEscolhido[p.pedido_id]}
                  onClick={() =>
                    executar(() =>
                      atribuirEntrega({
                        pedido_id: p.pedido_id,
                        motoboy_id: motoboyEscolhido[p.pedido_id],
                      }),
                    )
                  }
                >
                  Atribuir
                </Button>
              </div>
            </LinhaLista>
          ))
        )}
      </Cartao>

      {/* ------------------------------------------------ corridas vivas */}
      <Cartao titulo="Corridas" descricao="Montando, na rua ou esperando acerto." largura="cheio">
        {central.corridas.length === 0 ? (
          <EmptyState titulo="Nenhuma corrida aberta" descricao="Ninguém na rua agora." />
        ) : (
          central.corridas.map((c) => (
            <LinhaLista key={c.corrida_id}>
              <div className="min-w-[180px] flex-1">
                <p className="m-0 text-[14px] font-semibold text-ink">{c.motoboy}</p>
                <p className="m-0 text-[12.5px] text-muted">
                  {c.pedidos} {c.pedidos === 1 ? "pedido" : "pedidos"}
                  {c.pendentes > 0 ? ` · ${c.pendentes} a conferir` : ""}
                  {c.transferidos > 0
                    ? ` · ${c.transferidos} passou para outro motoboy`
                    : ""}
                </p>
              </div>

              <Badge tom={STATUS[c.status].tom}>{STATUS[c.status].texto}</Badge>

              {c.dinheiro_na_rua > 0 ? (
                <span className="text-[13px] font-semibold text-tdf">
                  {formatBRL(c.dinheiro_na_rua)} na rua
                </span>
              ) : null}

              <div className="flex items-center gap-2">
                {c.status === "open" ? (
                  <Button
                    variante="primario"
                    disabled={enviando}
                    onClick={() => executar(() => despacharCorrida({ corrida_id: c.corrida_id }))}
                  >
                    Despachar
                  </Button>
                ) : null}
                <a
                  href={`/admin/entregas?corrida=${c.corrida_id}`}
                  className="text-[13.5px] font-semibold text-link no-underline"
                >
                  Abrir
                </a>
              </div>
            </LinhaLista>
          ))
        )}
      </Cartao>

      {/* --------------------------------------------- uma corrida aberta */}
      {corrida ? (
        <Cartao
          titulo={`Corrida de ${corrida.motoboy}`}
          descricao={STATUS[corrida.status].texto}
          largura="cheio"
        >
          {corrida.pedidos.map((p) => (
            <LinhaLista key={p.vinculo_id}>
              <div className="min-w-[180px] flex-1">
                <p className="m-0 text-[14px] font-semibold text-ink">
                  #{p.numero} · {p.cliente}
                </p>
                <p className="m-0 text-[12.5px] text-muted">
                  {SITUACAO[p.situacao]}
                  {p.motivo_da_falha ? ` · ${p.motivo_da_falha}` : ""}
                  {p.transferida_para ? ` para ${p.transferida_para}` : ""}
                  {p.recebida_de ? ` · recebida de ${p.recebida_de}` : ""}
                </p>
                {p.motivo_da_transferencia ? (
                  <p className="m-0 text-[12.5px] text-muted">{p.motivo_da_transferencia}</p>
                ) : null}
              </div>

              {/* Esperado e recebido lado a lado: são coisas diferentes. */}
              <div className="text-right">
                <p className="m-0 text-[13px] text-muted">
                  Pedido {formatBRL(p.total)} · {p.pagamento_esperado ?? "—"}
                </p>
                <p className="m-0 text-[13px] font-semibold text-ink">
                  {p.recebido > 0 ? `Recebido ${formatBRL(p.recebido)}` : "Sem recebimento"}
                  {p.recebido_em_dinheiro > 0 && !p.ja_entrou_na_gaveta
                    ? ` · em dinheiro, com o motoboy`
                    : ""}
                </p>
                {/* RN-RUN-009: dito na linha, porque é o que o acerto NÃO vai cobrar. */}
                {p.dinheiro_com_o_anterior ? (
                  <p className="m-0 text-[12.5px] text-tdf">
                    O dinheiro ficou com quem saiu — não entra neste acerto.
                  </p>
                ) : null}
              </div>

              {corrida.status === "settling" &&
              p.situacao === "delivered" &&
              p.recebido === 0 &&
              podeReceber &&
              cobraveis[p.pedido_id] ? (
                <Button
                  variante="primario"
                  onClick={() => {
                    const pedido = cobraveis[p.pedido_id];
                    if (pedido) setCobrando({ pedido, tentativa: crypto.randomUUID() });
                  }}
                >
                  Receber
                </Button>
              ) : null}

              {p.situacao === "pending" && corrida.status === "out" ? (
                <div className="flex items-center gap-2">
                  <Button
                    variante="primario"
                    disabled={enviando}
                    onClick={() =>
                      executar(() =>
                        registrarRetorno({ vinculo_id: p.vinculo_id, entregue: true }),
                      )
                    }
                  >
                    Entregue
                  </Button>
                  <Button
                    variante="secundario"
                    disabled={enviando}
                    onClick={() => setFalhando(p.vinculo_id)}
                  >
                    Não entregou
                  </Button>
                  {/* RN-RUN-008: a moto quebrou e outro vai buscar. */}
                  <Button
                    variante="secundario"
                    disabled={enviando}
                    onClick={() => setTransferindo(p.vinculo_id)}
                  >
                    Transferir
                  </Button>
                </div>
              ) : null}
            </LinhaLista>
          ))}

          {/* RN-STATE-008: falha exige motivo, e a tela pede antes de enviar. */}
          {falhando ? (
            <div className="mt-3 flex flex-col gap-2">
              <Textarea
                label="Por que a entrega não aconteceu?"
                value={motivoFalha}
                onChange={(e) => setMotivoFalha(e.target.value)}
                rows={2}
              />
              <div className="flex gap-2">
                <Button
                  variante="primario"
                  disabled={enviando || motivoFalha.trim().length < 3}
                  onClick={() =>
                    executar(() =>
                      registrarRetorno({
                        vinculo_id: falhando,
                        entregue: false,
                        motivo: motivoFalha.trim(),
                      }),
                    )
                  }
                >
                  Registrar a falha
                </Button>
                <Button variante="secundario" onClick={() => setFalhando(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : null}

          {/* RN-RUN-008: quem saiu com o pedido não é apagado; a transferência
              é um fato novo, com motivo obrigatório. */}
          {transferindo ? (
            <div className="mt-3 flex flex-col gap-2 border-t border-border-shalon pt-3">
              <p className="m-0 text-[13px] text-muted">
                O pedido continua em rota — o que muda é quem responde por ele. Quem saiu
                permanece no histórico, e o dinheiro que já recebeu continua sendo dele para
                prestar contas.
              </p>
              <SelectMenu
                label="Quem vai assumir"
                valor={destino}
                aoMudar={setDestino}
                opcoes={[
                  { valor: "", texto: "Escolha o motoboy" },
                  ...central.motoboys
                    .filter((m) => m.funcionario_id !== corrida.motoboy_id)
                    .map((m) => ({
                      valor: m.funcionario_id,
                      texto: `${m.nome}${m.ocupado ? " (já em rota)" : ""}`,
                    })),
                ]}
              />
              <Textarea
                label="Por que a entrega está mudando de mão?"
                hint="Fica no histórico das duas corridas."
                value={motivoTransferencia}
                onChange={(e) => setMotivoTransferencia(e.target.value)}
                rows={2}
              />
              <div className="flex gap-2">
                <Button
                  variante="primario"
                  disabled={enviando || !destino || motivoTransferencia.trim().length < 3}
                  onClick={() =>
                    executar(() =>
                      transferirEntrega({
                        vinculo_id: transferindo,
                        motoboy_id: destino,
                        motivo: motivoTransferencia.trim(),
                      }),
                    )
                  }
                >
                  Transferir a entrega
                </Button>
                <Button variante="secundario" onClick={() => setTransferindo(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : null}

          {/* ------------------------------------------------------ acerto */}
          {corrida.status === "settling" && podeAcertar ? (
            <div className="mt-4 border-t border-border-shalon pt-4">
              <ParDeDados
                chave="Deveria trazer em dinheiro"
                valor={formatBRL(corrida.esperado_em_dinheiro)}
              />
              {corrida.pedidos_sem_pagamento > 0 ? (
                <p className="m-0 mt-2 text-[12.5px] font-semibold text-tdf">
                  {corrida.pedidos_sem_pagamento}{" "}
                  {corrida.pedidos_sem_pagamento === 1 ? "entrega" : "entregas"} sem recebimento.
                  Use &ldquo;Receber&rdquo; em cada uma, com o que o cliente pagou, antes de acertar.
                </p>
              ) : null}

              {acertando ? (
                <div className="mt-3 flex flex-col gap-2">
                  <Input
                    label="Quanto ele trouxe em dinheiro"
                    inputMode="decimal"
                    value={devolvido}
                    onChange={(e) => setDevolvido(e.target.value)}
                  />
                  {diferenca !== null && diferenca !== 0 ? (
                    <p className="m-0 text-[13px] font-semibold text-tdf">
                      {diferenca < 0 ? "Falta" : "Sobra"} de {formatBRL(Math.abs(diferenca))}. O caixa
                      registra o que entrou de fato, e a diferença vai para o histórico do motoboy
                      (Equipe › Livro), onde a dona decide se lança no funcionário. Nada é
                      descontado sozinho.
                    </p>
                  ) : null}
                  {(diferenca !== null && diferenca !== 0) || exigeMotivo ? (
                    <Textarea
                      label="Motivo da diferença"
                      value={motivoAcerto}
                      onChange={(e) => setMotivoAcerto(e.target.value)}
                      rows={2}
                    />
                  ) : null}
                  <div className="flex gap-2">
                    <Button
                      variante="primario"
                      disabled={enviando || valorDevolvido === null || corrida.pedidos_sem_pagamento > 0}
                      onClick={() =>
                        executar(() =>
                          conciliarCorrida({
                            corrida_id: corrida.corrida_id,
                            devolvido: valorDevolvido ?? 0,
                            motivo: motivoAcerto.trim() || undefined,
                          }),
                        )
                      }
                    >
                      Concluir o acerto
                    </Button>
                    <Button variante="secundario" onClick={() => setAcertando(false)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variante="primario"
                  disabled={corrida.pedidos_sem_pagamento > 0}
                  onClick={() => setAcertando(true)}
                >
                  Fazer o acerto
                </Button>
              )}
            </div>
          ) : null}

          {corrida.acerto ? (
            <div className="mt-4 border-t border-border-shalon pt-4">
              <ParDeDados chave="Esperado" valor={formatBRL(corrida.acerto.esperado)} />
              <ParDeDados chave="Devolvido" valor={formatBRL(corrida.acerto.devolvido)} />
              <ParDeDados chave="Diferença" valor={formatBRL(corrida.acerto.diferenca)} />
              {corrida.acerto.motivo ? (
                <ParDeDados chave="Motivo" valor={corrida.acerto.motivo} />
              ) : null}
            </div>
          ) : null}
        </Cartao>
      ) : null}

      <GavetaDeCobranca
        key={cobrando?.pedido.id ?? "fechada"}
        pedido={cobrando?.pedido ?? null}
        tentativa={cobrando?.tentativa ?? null}
        formas={formasDeRecebimento}
        caixaAberto={caixaAberto}
        aoFechar={() => setCobrando(null)}
        aoConcluir={() => {
          setCobrando(null);
          router.refresh();
        }}
      />
    </div>
  );
}
