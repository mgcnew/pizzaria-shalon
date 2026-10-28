"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { Badge, Button, SelectMenu, StatusBadge, Textarea } from "@/ui/components";
import { Aviso, Cartao, EmptyState, LinhaLista, ParDeDados } from "@/ui/patterns";
import { formatBRL } from "@/lib/format";
import { marcarPresenca, transferirEntrega } from "@/application/entregas/acoes";
import type {
  CentralDeEntregas,
  Corrida,
  CorridaResumo,
  MotoboyDisponivel,
  PedidoDaCorrida,
} from "@/application/entregas/tipos";
import { situacaoDoMotoboy } from "@/domain/entrega/motoboys";
import { ModalMotoboyVoltou } from "../../pedidos/_ui/Motoboy";

/**
 * A central de entregas.
 *
 * A PERGUNTA QUE ELA RESPONDE EM UM OLHAR: quem está livre, quem está na rua
 * com o quê, e quanto dinheiro da Shalon está fora da gaveta agora.
 *
 * O QUE ELA NÃO FAZ MAIS (D-2026-10-27-174): despachar e acertar. A saída é o
 * "Saiu com…" e a volta é o "Fulano voltou", na tela Pedidos — o mesmo modal
 * que esta página abre para quem está aqui. Cada número vem do servidor.
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
  pending: "Na rua",
  delivered: "Entregue",
  failed: "Não entregue",
  reassigned: "Trocado antes da saída",
  transferred: "Transferido em rota",
};

export function PainelDeEntregas({
  central,
  corrida,
  podeAcertar,
  podeMarcarPresenca = false,
}: {
  central: CentralDeEntregas;
  corrida: Corrida | null;
  /** `deliveries.manage`: abrir o "Fulano voltou" e transferir em rota. O servidor confere. */
  podeAcertar: boolean;
  /** `employees.attendance`: marcar Veio ou Faltou. O servidor confere de novo. */
  podeMarcarPresenca?: boolean;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const [transferindo, setTransferindo] = useState<string | null>(null);
  const [motivoTransferencia, setMotivoTransferencia] = useState("");
  const [destino, setDestino] = useState("");
  const [voltou, setVoltou] = useState<{ corrida_id: string; nome: string } | null>(null);

  const chave = useRef(crypto.randomUUID());

  function executar(acao: () => Promise<{ ok: boolean; erro?: string }>) {
    setErro(null);
    iniciar(async () => {
      const r = await acao();
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível concluir esta ação.");
        return;
      }
      chave.current = crypto.randomUUID();
      setTransferindo(null);
      setMotivoTransferencia("");
      setDestino("");
    });
  }

  const naRua = central.corridas.reduce((s, c) => s + c.dinheiro_na_rua, 0);
  const trocoNaRua = central.corridas.reduce((s, c) => s + (c.troco ?? 0), 0);
  // Quem faltou hoje sai da escolha de quem recebe pedido. O servidor recusa
  // do mesmo jeito (`transferir_entrega`).
  const podeReceberEntrega = (m: MotoboyDisponivel) => (m.presenca ?? null) !== "absent";

  return (
    <div className="flex flex-col gap-5">
      <Aviso {...(erro ? { erro } : {})} />

      {/* RN-CAIXA-014: dito com todas as letras, longe do saldo do caixa. */}
      {naRua + trocoNaRua > 0 ? (
        <Cartao largura="cheio">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="m-0 text-[13.5px] text-muted">
              Dinheiro com os motoboys, ainda fora da gaveta
            </p>
            <p className="m-0 font-display text-[22px] font-bold text-ink">
              {formatBRL(naRua + trocoNaRua)}
            </p>
          </div>
          <p className="m-0 mt-1 text-[12.5px] text-muted">
            {formatBRL(naRua)} recebido das entregas
            {trocoNaRua > 0 ? ` + ${formatBRL(trocoNaRua)} de troco levado da gaveta` : ""}. Entra no caixa
            quando o motoboy voltar.
          </p>
        </Cartao>
      ) : null}

      {/* ------------------------------------------------------ motoboys */}
      <Cartao
        titulo="Motoboys"
        descricao={
          podeMarcarPresenca
            ? "Marque Veio ou Faltou no começo do turno: quem faltou não aparece na escolha do motoboy. Sem marcação, ele continua escolhível. O motoboy não precisa de login."
            : "Quem leva as entregas. O motoboy não precisa de login: basta estar cadastrado como entregador."
        }
        largura="cheio"
      >
        {central.motoboys.length === 0 ? (
          <EmptyState
            titulo="Nenhum motoboy cadastrado"
            descricao="Cadastre em Equipe e marque “Faz entregas”. Ele aparece aqui e na escolha do motoboy de cada pedido, sem precisar de acesso ao sistema."
            acao={
              <Link
                href="/admin/equipe"
                className="inline-flex min-h-touch items-center rounded-11 bg-cta px-4 text-[14px] font-semibold text-cta-fg no-underline"
              >
                Ir para Equipe
              </Link>
            }
          />
        ) : (
          [...central.motoboys]
            .map((m) => ({
              m,
              situacao: situacaoDoMotoboy(
                { ocupado: m.ocupado, presenca: m.presenca ?? null },
                central.corridas.find((c) => c.motoboy_id === m.funcionario_id),
              ),
            }))
            .sort((a, b) => a.situacao.ordem - b.situacao.ordem || a.m.nome.localeCompare(b.m.nome, "pt-BR"))
            .map(({ m, situacao }) => (
              <LinhaLista key={m.funcionario_id}>
                <div className="min-w-[180px] flex-1">
                  <p className="m-0 text-[14px] font-semibold text-ink">{m.nome}</p>
                  {situacao.detalhe ? <p className="m-0 text-[12.5px] text-muted">{situacao.detalhe}</p> : null}
                </div>
                <StatusBadge tom={situacao.tom}>{situacao.texto}</StatusBadge>
                {podeMarcarPresenca ? (
                  <div role="group" aria-label={`Presença de ${m.nome} hoje`} className="flex items-center gap-1.5">
                    {(
                      [
                        { valor: "present", rotulo: "Veio" },
                        { valor: "absent", rotulo: "Faltou" },
                      ] as const
                    ).map((opcao) => {
                      const ativo = (m.presenca ?? null) === opcao.valor;
                      return (
                        <button
                          key={opcao.valor}
                          type="button"
                          aria-pressed={ativo}
                          disabled={enviando}
                          // Tocar de novo na marca ativa a desfaz ("sem marcação").
                          onClick={() =>
                            executar(() =>
                              marcarPresenca({
                                funcionario_id: m.funcionario_id,
                                status: ativo ? null : opcao.valor,
                              }),
                            )
                          }
                          className={[
                            "motion-interactive min-h-touch cursor-pointer rounded-pill border-[1.5px] px-3.5 text-[13.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                            ativo
                              ? opcao.valor === "present"
                                ? "border-tgb bg-tg text-tgf"
                                : "border-tdb bg-td text-tdf"
                              : "border-border-shalon bg-surface text-ink hover:border-brand-orange",
                          ].join(" ")}
                        >
                          {opcao.rotulo}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </LinhaLista>
            ))
        )}
      </Cartao>

      {/* ------------------------------------------------ corridas vivas */}
      <Cartao
        titulo="Na rua agora"
        descricao="Quem saiu e com quais entregas. A volta é feita aqui ou na tela Pedidos."
        largura="cheio"
      >
        {central.corridas.length === 0 ? (
          <EmptyState titulo="Ninguém na rua" descricao="As saídas aparecem aqui pelo “Saiu com…” da tela Pedidos." />
        ) : (
          central.corridas.map((c) => (
            <LinhaLista key={c.corrida_id}>
              <div className="min-w-[180px] flex-1">
                <p className="m-0 text-[14px] font-semibold text-ink">{c.motoboy}</p>
                <p className="m-0 text-[12.5px] text-muted">
                  {c.saiu_em
                    ? `saiu às ${new Date(c.saiu_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · `
                    : ""}
                  {c.pendentes} {c.pendentes === 1 ? "entrega" : "entregas"}
                  {c.transferidos > 0 ? ` · ${c.transferidos} passou para outro motoboy` : ""}
                  {(c.troco ?? 0) > 0 ? ` · levou ${formatBRL(c.troco ?? 0)} de troco` : ""}
                </p>
              </div>

              <Badge tom={STATUS[c.status].tom}>{STATUS[c.status].texto}</Badge>

              {c.dinheiro_na_rua > 0 ? (
                <span className="text-[13px] font-semibold text-tdf">
                  {formatBRL(c.dinheiro_na_rua)} recebido
                </span>
              ) : null}

              <div className="flex items-center gap-2">
                {podeAcertar && (c.status === "out" || c.status === "settling") ? (
                  <Button
                    variante="primario"
                    onClick={() => setVoltou({ corrida_id: c.corrida_id, nome: c.motoboy })}
                  >
                    {c.motoboy} voltou
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
          titulo={`Saída de ${corrida.motoboy}`}
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

              <div className="text-right">
                <p className="m-0 text-[13px] text-muted">
                  Pedido {formatBRL(p.total)} · {p.pagamento_esperado ?? "—"}
                </p>
                {/* RN-RUN-009: dito na linha, porque é o que o acerto NÃO vai cobrar. */}
                {p.dinheiro_com_o_anterior ? (
                  <p className="m-0 text-[12.5px] text-tdf">
                    O dinheiro ficou com quem saiu — não entra neste acerto.
                  </p>
                ) : null}
              </div>

              {/* RN-RUN-008: a moto quebrou e outro vai buscar. */}
              {podeAcertar && p.situacao === "pending" && corrida.status === "out" ? (
                <Button
                  variante="secundario"
                  disabled={enviando}
                  onClick={() => setTransferindo(p.vinculo_id)}
                >
                  Transferir
                </Button>
              ) : null}
            </LinhaLista>
          ))}

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
                    .filter((m) => m.funcionario_id !== corrida.motoboy_id && podeReceberEntrega(m))
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

      {voltou
        ? createPortal(
            <ModalMotoboyVoltou
              corridaId={voltou.corrida_id}
              nome={voltou.nome}
              aoFechar={() => setVoltou(null)}
            />,
            document.body,
          )
        : null}
    </div>
  );
}
