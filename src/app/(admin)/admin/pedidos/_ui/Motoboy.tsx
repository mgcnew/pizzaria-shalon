"use client";

import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import {
  listarFormasDeRecebimento,
  listarMotoboysParaDespacho,
  motoboyVoltou,
  obterAReceberDoMotoboy,
  sairComEntregas,
  type EntregaPronta,
  type MotoboyParaDespacho,
} from "@/application/entregas/acoes";
import type { AReceberDoMotoboy, EntregaAReceber } from "@/application/entregas/tipos";
import { obterPagamentoDoPedidoNoPdv } from "@/application/pdv/acoes";
import type { PagamentoDoPedido } from "@/application/caixa/tipos";
import { useAvisarOperacaoEmVoo } from "@/ui/operacaoEmVoo";
import { formatBRL } from "@/lib/format";
import { Recebimento, type FormaParaRecebimento } from "./Recebimento";
import { aEntregarNaVolta } from "@/domain/entrega/voltaDoMotoboy";

/**
 * O motoboy na tela Pedidos (D-2026-10-27-174): a saída e a volta.
 *
 * SAIR. "Saiu com…" escolhe o motoboy, junta as outras entregas prontas que
 * vão na mesma viagem e registra o troco que ele levou da gaveta — num ato só
 * (`sair_com_entregas`).
 *
 * VOLTAR. "Fulano voltou" mostra as entregas dele, recebe o que falta (o mesmo
 * `Recebimento` de sempre, com o dinheiro "com o motoboy") e confere o que ele
 * entrega: dinheiro das entregas mais o troco. Só então as entregas saem dos
 * pedidos em aberto (`motoboy_voltou`, tudo ou nada). Os valores aqui são
 * conferência: quem cobra é o servidor.
 */

function paraNumero(texto: string): number | null {
  const limpo = texto.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (limpo === "") return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

const centavos = (n: number) => Math.round(n * 100);

const BOTAO_PRIMARIO =
  "min-h-touch cursor-pointer rounded-11 border-0 bg-cta px-4 text-[14px] font-semibold text-cta-fg disabled:cursor-not-allowed disabled:bg-tn disabled:text-muted";
const BOTAO_SECUNDARIO =
  "min-h-touch cursor-pointer rounded-11 border-[1.5px] border-border-shalon bg-surface px-4 text-[14px] font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-60";
const CAMPO =
  "min-h-touch w-full rounded-11 border-[1.5px] border-border-shalon bg-surface px-3 text-[15px] text-ink outline-none focus:border-brand-orange";

/** Moldura dos dois modais: foco, Escape, rolagem travada e véu. */
function Casca({
  titulo,
  tituloId,
  ocupado,
  aoFechar,
  children,
}: {
  titulo: string;
  tituloId: string;
  ocupado: boolean;
  aoFechar: () => void;
  children: ReactNode;
}) {
  const painel = useRef<HTMLDivElement>(null);
  const fechar = useRef(aoFechar);
  useEffect(() => {
    fechar.current = aoFechar;
  }, [aoFechar]);

  useEffect(() => {
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    painel.current?.focus();
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") fechar.current();
    }
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflow;
      anterior?.focus();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[95] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      onMouseDown={(evento) => {
        if (evento.target === evento.currentTarget && !ocupado) aoFechar();
      }}
    >
      <div
        ref={painel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-20 border border-border-shalon bg-surface p-5 shadow-2xl outline-none sm:max-w-[520px] sm:rounded-20"
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 id={tituloId} className="m-0 font-display text-[19px] font-bold text-ink">
            {titulo}
          </h2>
          <button
            type="button"
            aria-label="Fechar"
            onClick={aoFechar}
            disabled={ocupado}
            className="flex size-10 cursor-pointer items-center justify-center rounded-full border border-border-shalon bg-elev text-[20px] text-ink"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Erro({ texto }: { texto: string | null }) {
  if (texto === null) return null;
  return (
    <p role="alert" className="m-0 mt-3 rounded-10 bg-td px-3 py-2 text-[13px] font-semibold text-tdf">
      {texto}
    </p>
  );
}

// ============================================================== Saiu com…

export function ModalSaiuCom({ pedidoId, aoFechar }: { pedidoId: string; aoFechar: () => void }) {
  const [motoboys, setMotoboys] = useState<MotoboyParaDespacho[] | null>(null);
  const [prontas, setProntas] = useState<EntregaPronta[]>([]);
  const [escolhido, setEscolhido] = useState<MotoboyParaDespacho | null>(null);
  const [juntas, setJuntas] = useState<string[]>([]);
  const [trocoTexto, setTrocoTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  useAvisarOperacaoEmVoo(enviando);
  const tituloId = `saiu-com-${pedidoId}-titulo`;

  useEffect(() => {
    let ativo = true;
    listarMotoboysParaDespacho()
      .then((r) => {
        if (!ativo) return;
        if (r.ok) {
          setMotoboys(r.motoboys);
          setProntas(r.prontas.filter((p) => p.pedido_id !== pedidoId));
        } else {
          setMotoboys([]);
          setErro(r.erro);
        }
      })
      .catch(() => ativo && (setMotoboys([]), setErro("Não foi possível carregar os motoboys agora.")));
    return () => {
      ativo = false;
    };
  }, [pedidoId]);

  const troco = trocoTexto.trim() === "" ? 0 : paraNumero(trocoTexto);
  const trocoValido = troco !== null && troco >= 0;

  function sair() {
    if (escolhido === null || !trocoValido) return;
    setErro(null);
    iniciar(async () => {
      const r = await sairComEntregas({
        motoboy_id: escolhido.id,
        pedidos: [pedidoId, ...juntas],
        troco: troco ?? 0,
      });
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível despachar.");
        return;
      }
      aoFechar();
    });
  }

  return (
    <Casca
      titulo={escolhido ? `Saindo com ${escolhido.nome}` : "Quem vai levar?"}
      tituloId={tituloId}
      ocupado={enviando}
      aoFechar={aoFechar}
    >
      {escolhido === null ? (
        <>
          <p className="m-0 mb-4 text-[13.5px] text-ink-2">
            Toque no motoboy que está saindo. Depois você junta as outras entregas desta viagem.
          </p>
          {motoboys === null ? (
            <div aria-hidden="true" className="flex flex-col gap-2">
              <div className="h-[52px] animate-pulse rounded-12 bg-tn" />
              <div className="h-[52px] animate-pulse rounded-12 bg-tn" />
            </div>
          ) : motoboys.length === 0 ? (
            <p className="m-0 rounded-12 border-[1.5px] border-twb bg-tw p-3 text-[13.5px] leading-snug text-twf">
              Nenhum motoboy disponível. Cadastre os motoboys em Equipe, marcados como entregadores. Quem foi
              marcado como ausente hoje não aparece aqui.
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {motoboys.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setErro(null);
                      setEscolhido(m);
                    }}
                    className="flex min-h-[52px] w-full cursor-pointer items-center justify-between gap-3 rounded-12 border-[1.5px] border-border-shalon bg-surface px-4 text-left hover:bg-elev"
                  >
                    <span className="text-[15px] font-semibold text-ink">{m.nome}</span>
                    <span className="text-[12.5px] text-muted">
                      {m.na_rua
                        ? `na rua · ${m.entregas_na_rua} ${m.entregas_na_rua === 1 ? "entrega" : "entregas"}`
                        : m.presente
                          ? "veio hoje"
                          : "presença não marcada"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(evento) => {
            evento.preventDefault();
            sair();
          }}
        >
          {prontas.length > 0 ? (
            <fieldset className="m-0 min-w-0 border-0 p-0">
              <legend className="mb-2 p-0 text-[13.5px] font-bold text-ink">Vai levar também?</legend>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {prontas.map((p) => {
                  const marcada = juntas.includes(p.pedido_id);
                  return (
                    <li key={p.pedido_id}>
                      <label className="flex min-h-[52px] cursor-pointer items-center gap-3 rounded-12 border-[1.5px] border-border-shalon bg-surface px-4 has-[:checked]:border-ink">
                        <input
                          type="checkbox"
                          checked={marcada}
                          onChange={() =>
                            setJuntas((atual) =>
                              marcada ? atual.filter((id) => id !== p.pedido_id) : [...atual, p.pedido_id],
                            )
                          }
                          className="size-5 accent-[var(--shalon-cta-bg)]"
                        />
                        <span className="min-w-0 flex-1 text-[14px] text-ink">
                          <strong>#{p.numero}</strong>
                          {p.cliente ? ` · ${p.cliente}` : ""}
                          {p.bairro ? <span className="text-muted"> · {p.bairro}</span> : null}
                        </span>
                        <span className="text-[13px] tabular-nums text-ink-2">{formatBRL(p.total)}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          ) : (
            <p className="m-0 text-[13.5px] text-ink-2">Nenhuma outra entrega pronta para ir junto.</p>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-[13.5px] font-bold text-ink">Troco que ele levou da gaveta (R$)</span>
            <input
              inputMode="decimal"
              placeholder="0,00"
              value={trocoTexto}
              onChange={(e) => setTrocoTexto(e.target.value)}
              className={CAMPO}
            />
            <span className="text-[12.5px] text-muted">
              Deixe em branco se ele não levou troco. O troco volta para a gaveta quando ele voltar.
            </span>
          </label>

          <Erro texto={erro} />

          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={enviando || !trocoValido} className={BOTAO_PRIMARIO}>
              {enviando
                ? "Despachando…"
                : juntas.length > 0
                  ? `Saiu com ${juntas.length + 1} entregas`
                  : `Saiu com ${escolhido.nome}`}
            </button>
            <button
              type="button"
              disabled={enviando}
              onClick={() => setEscolhido(null)}
              className={BOTAO_SECUNDARIO}
            >
              Trocar motoboy
            </button>
          </div>
        </form>
      )}
    </Casca>
  );
}

// ======================================================== Motoboy voltou

export function ModalMotoboyVoltou({
  corridaId,
  nome,
  aoFechar,
}: {
  corridaId: string;
  /** Nome para o título enquanto a corrida carrega. */
  nome: string | null;
  aoFechar: () => void;
}) {
  const [dados, setDados] = useState<AReceberDoMotoboy | null>(null);
  const [formas, setFormas] = useState<FormaParaRecebimento[]>([]);
  // pedido_id → motivo. Presente = não foi entregue.
  const [falhas, setFalhas] = useState<Record<string, string>>({});
  const [recebendo, setRecebendo] = useState<{
    pedido: EntregaAReceber;
    pagamento: PagamentoDoPedido | null;
    tentativa: string;
  } | null>(null);
  const [outroValor, setOutroValor] = useState(false);
  const [valorTexto, setValorTexto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  useAvisarOperacaoEmVoo(enviando);
  const tituloId = `voltou-${corridaId}-titulo`;

  const carregar = useCallback(async () => {
    const r = await obterAReceberDoMotoboy(corridaId);
    if (r.ok) setDados(r.corrida);
    else setErro(r.erro);
  }, [corridaId]);

  useEffect(() => {
    let ativo = true;
    Promise.all([obterAReceberDoMotoboy(corridaId), listarFormasDeRecebimento()])
      .then(([r, f]) => {
        if (!ativo) return;
        setFormas(f);
        if (r.ok) setDados(r.corrida);
        else setErro(r.erro);
      })
      .catch(() => ativo && setErro("Não foi possível carregar as entregas do motoboy agora."));
    return () => {
      ativo = false;
    };
  }, [corridaId]);

  function abrirRecebimento(pedido: EntregaAReceber) {
    setErro(null);
    iniciar(async () => {
      const pagamento = await obterPagamentoDoPedidoNoPdv(pedido.pedido_id);
      setRecebendo({ pedido, pagamento, tentativa: crypto.randomUUID() });
    });
  }

  const quitado = (p: EntregaAReceber) => p.fiado || centavos(p.pago) >= centavos(p.total);
  const pedidos = dados?.pedidos ?? [];
  const entregues = pedidos.filter((p) => !(p.pedido_id in falhas));
  const faltaReceber = entregues.filter((p) => !quitado(p));
  const falhaSemMotivo = Object.values(falhas).some((m) => m.trim().length < 3);
  const aEntregar = aEntregarNaVolta(pedidos, new Set(Object.keys(falhas)), dados?.troco ?? 0);
  const dasEntregas = aEntregarNaVolta(pedidos, new Set(Object.keys(falhas)), 0);
  const pronto = dados !== null && pedidos.length > 0 && faltaReceber.length === 0 && !falhaSemMotivo;

  const valorOutro = paraNumero(valorTexto);
  const diferente = outroValor && valorOutro !== null && centavos(valorOutro) !== centavos(aEntregar);

  function concluir(devolvido: number) {
    setErro(null);
    iniciar(async () => {
      const r = await motoboyVoltou({
        corrida_id: corridaId,
        falhas: Object.entries(falhas).map(([pedido_id, m]) => ({ pedido_id, motivo: m.trim() })),
        devolvido,
        ...(diferente && motivo.trim() ? { motivo: motivo.trim() } : {}),
      });
      if (!r.ok) {
        setErro(r.erro);
        // Recusa no meio: nada foi gravado, mas a corrida pode ter mudado.
        void carregar();
        return;
      }
      aoFechar();
    });
  }

  const nomeDoMotoboy = dados?.motoboy ?? nome ?? "Motoboy";

  return (
    <Casca
      titulo={`${nomeDoMotoboy} voltou`}
      tituloId={tituloId}
      ocupado={enviando}
      aoFechar={aoFechar}
    >
      {dados === null ? (
        erro === null ? (
          <div aria-hidden="true" className="flex flex-col gap-2">
            <div className="h-[60px] animate-pulse rounded-12 bg-tn" />
            <div className="h-[60px] animate-pulse rounded-12 bg-tn" />
          </div>
        ) : (
          <Erro texto={erro} />
        )
      ) : dados.status === "settled" ? (
        <p className="m-0 rounded-12 border border-tgb bg-tg p-3 text-[14px] text-tgf">
          Esta saída já foi acertada.
        </p>
      ) : recebendo ? (
        <div className="flex flex-col gap-3">
          <p className="m-0 text-[14px] text-ink-2">
            Como o cliente pagou <strong className="text-ink">#{recebendo.pedido.numero}</strong>
            {recebendo.pedido.cliente ? ` · ${recebendo.pedido.cliente}` : ""}
          </p>
          <Recebimento
            pedidoId={recebendo.pedido.pedido_id}
            total={recebendo.pedido.total}
            pagamento={recebendo.pagamento}
            formas={formas}
            caixaAberto={dados.caixa_aberto}
            tentativa={recebendo.tentativa}
            formaInicialId={formas.find((f) => f.nome === recebendo.pedido.forma_esperada)?.id ?? null}
            momento="depois_da_saida"
            aoConcluir={() => {
              setRecebendo(null);
              void carregar();
            }}
          />
          <button type="button" onClick={() => setRecebendo(null)} className={BOTAO_SECUNDARIO}>
            Voltar às entregas
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="m-0 text-[13.5px] text-ink-2">
            Lance o pagamento de cada entrega como o cliente pagou e marque a que não foi entregue. No fim, confira o dinheiro
            que {nomeDoMotoboy} entrega.
          </p>

          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {pedidos.map((p) => {
              const falhou = p.pedido_id in falhas;
              const ok = quitado(p);
              return (
                <li key={p.pedido_id} className="rounded-12 border-[1.5px] border-border-shalon bg-surface p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 text-[14px] text-ink">
                      <strong>#{p.numero}</strong>
                      {p.cliente ? ` · ${p.cliente}` : ""}
                      {p.bairro ? <span className="text-muted"> · {p.bairro}</span> : null}
                    </span>
                    <span className="text-[14px] font-semibold tabular-nums text-ink">{formatBRL(p.total)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {falhou ? (
                      <span className="rounded-pill bg-td px-2.5 py-1 text-[12.5px] font-semibold text-tdf">
                        Não entregue
                      </span>
                    ) : p.fiado ? (
                      <span className="rounded-pill bg-tn px-2.5 py-1 text-[12.5px] font-semibold text-ink-2">
                        Fiado
                      </span>
                    ) : ok ? (
                      <span className="rounded-pill bg-tg px-2.5 py-1 text-[12.5px] font-semibold text-tgf">
                        Recebido{p.dinheiro_com_ele > 0 ? ` · ${formatBRL(p.dinheiro_com_ele)} em dinheiro` : ""}
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={enviando}
                        onClick={() => abrirRecebimento(p)}
                        className="min-h-10 cursor-pointer rounded-10 border border-tgb bg-transparent px-3 text-[13px] font-semibold text-tgf hover:bg-tg disabled:opacity-60"
                      >
                        Lançar pagamento {formatBRL(Math.max(0, p.total - p.pago))}
                        {p.forma_esperada ? ` · ${p.forma_esperada}` : ""}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={enviando}
                      aria-pressed={falhou}
                      onClick={() =>
                        setFalhas((atual) => {
                          const proximo = { ...atual };
                          if (falhou) delete proximo[p.pedido_id];
                          else proximo[p.pedido_id] = "";
                          return proximo;
                        })
                      }
                      className="min-h-10 cursor-pointer rounded-10 border border-border-shalon bg-transparent px-3 text-[13px] font-semibold text-ink-2 hover:bg-elev disabled:opacity-60"
                    >
                      {falhou ? "Foi entregue" : "Não foi entregue"}
                    </button>
                  </div>
                  {falhou ? (
                    <input
                      aria-label={`Por que o pedido ${p.numero} não foi entregue`}
                      placeholder="Por que não foi entregue? (ex.: cliente não atendeu)"
                      value={falhas[p.pedido_id] ?? ""}
                      onChange={(e) => setFalhas((atual) => ({ ...atual, [p.pedido_id]: e.target.value }))}
                      maxLength={300}
                      className={`${CAMPO} mt-2`}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>

          <div className="rounded-14 border border-border-shalon bg-elev p-4">
            <p className="m-0 text-[13px] font-semibold text-muted">{nomeDoMotoboy} precisa entregar</p>
            <p className="m-0 mt-1 font-display text-[30px] font-extrabold leading-none tabular-nums text-ink">
              {formatBRL(aEntregar)}
            </p>
            <p className="m-0 mt-2 text-[12.5px] text-muted">
              {formatBRL(dasEntregas)} das entregas em dinheiro
              {dados.troco > 0 ? ` + ${formatBRL(dados.troco)} de troco que ele levou` : ""}. Cartão e Pix não
              entram aqui.
            </p>
          </div>

          {faltaReceber.length > 0 ? (
            <p className="m-0 text-[13px] text-ink-2">
              Falta lançar o pagamento de {faltaReceber.length === 1 ? "1 entrega" : `${faltaReceber.length} entregas`} acima.
            </p>
          ) : null}

          {outroValor ? (
            <div className="flex flex-col gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[13.5px] font-bold text-ink">Quanto ele entregou (R$)</span>
                <input
                  inputMode="decimal"
                  placeholder="0,00"
                  value={valorTexto}
                  onChange={(e) => setValorTexto(e.target.value)}
                  className={CAMPO}
                  autoFocus
                />
              </label>
              {diferente && valorOutro !== null ? (
                <>
                  <p className="m-0 text-[13px] font-semibold text-tdf">
                    {valorOutro < aEntregar
                      ? `Faltam ${formatBRL(aEntregar - valorOutro)}.`
                      : `Sobram ${formatBRL(valorOutro - aEntregar)}.`}{" "}
                    Só quem pode conciliar a diferença do acerto conclui assim.
                  </p>
                  <input
                    aria-label="Motivo da diferença"
                    placeholder="O que aconteceu? (obrigatório)"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    maxLength={300}
                    className={CAMPO}
                  />
                </>
              ) : null}
            </div>
          ) : null}

          <Erro texto={erro} />

          <div className="flex flex-wrap gap-2">
            {outroValor ? (
              <>
                <button
                  type="button"
                  disabled={
                    !pronto || enviando || valorOutro === null || valorOutro < 0 || (diferente && motivo.trim().length < 3)
                  }
                  onClick={() => valorOutro !== null && concluir(valorOutro)}
                  className={BOTAO_PRIMARIO}
                >
                  {enviando ? "Concluindo…" : "Concluir"}
                </button>
                <button
                  type="button"
                  disabled={enviando}
                  onClick={() => {
                    setOutroValor(false);
                    setValorTexto("");
                    setMotivo("");
                  }}
                  className={BOTAO_SECUNDARIO}
                >
                  Voltar
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={!pronto || enviando}
                  onClick={() => concluir(aEntregar)}
                  className={BOTAO_PRIMARIO}
                >
                  {enviando ? "Concluindo…" : `Recebi ${formatBRL(aEntregar)}`}
                </button>
                <button
                  type="button"
                  disabled={!pronto || enviando}
                  onClick={() => setOutroValor(true)}
                  className={BOTAO_SECUNDARIO}
                >
                  Entregou outro valor
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </Casca>
  );
}
