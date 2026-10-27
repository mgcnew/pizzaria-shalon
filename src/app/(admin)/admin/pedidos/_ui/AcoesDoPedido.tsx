"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { executarComando } from "@/application/pedidos/acoes";
import {
  listarMotoboysParaDespacho,
  sairComMotoboy,
  type MotoboyParaDespacho,
} from "@/application/entregas/acoes";
import type { AcaoDoPedido } from "@/application/pedidos/tipos";
import { IndicadorDeNavegacao } from "@/ui/components/IndicadorDeNavegacao";
import { useFecharAoNavegar } from "@/ui/hooks/useFecharAoNavegar";
import { usePopoverFixo } from "@/ui/hooks/usePopoverFixo";
import { formatBRL } from "@/lib/format";
import { estiloDoComando } from "./estiloDasAcoes";

/**
 * "Despachar" de entrega vira "Saiu com…" (D-2026-10-27-172): toda entrega sai
 * com um motoboy (RN-STATE-007), e o banco recusa despachar sem ele.
 */
function rotuloDaAcao(acao: AcaoDoPedido): string {
  return acao.comando === "despachar" ? "Saiu com…" : acao.rotulo;
}

/**
 * Os comandos da máquina de estados, como botões.
 *
 * A lista vem PRONTA do servidor (`acoes_do_pedido`), já filtrada por
 * permissão e por estado. Este componente não sabe — e não deve saber — que
 * "aceitar" só vale em `waiting_store_confirmation`: essa regra vive no
 * banco, e duplicá-la aqui criaria uma segunda verdade (CLAUDE.md §21).
 *
 * Comando destrutivo pede motivo antes, num modal (`ModalDeMotivo`), e o
 * motivo é obrigatório de verdade: o banco recusa sem ele (RN-STATE-009 e
 * RN-STATE-010).
 *
 * DOIS LAYOUTS, UM CAMINHO SÓ. Em `"lista"` (cartão e tela do pedido) todos os
 * comandos viram botões lado a lado. Em `"linha"` (a tabela do desktop) só o
 * primeiro não destrutivo fica visível e o resto vai para um menu `⋯`.
 *
 * O motivo de ser uma prop, e não um segundo componente: o caminho destrutivo
 * — abrir o modal de motivo, exigir 3 caracteres, disparar, mostrar a recusa —
 * precisa existir UMA vez. Duplicá-lo para ganhar um layout é exatamente como
 * se perde a confirmação de um cancelamento numa das cópias.
 *
 * MEDIDO ANTES DE DESENHAR: nunca há dois caminhos para frente. Os comandos de
 * progressão (`iniciar_producao`, `marcar_pronto`, `despachar`, `concluir`) são
 * mutuamente exclusivos por status, e o pedido típico oferece DUAS ações — a de
 * avançar e cancelar. Por isso a primária é um botão de um clique, e não um
 * dropdown: um menu para escolher entre uma opção só custaria um clique a mais
 * na ação mais frequente do dia (CLAUDE.md §21).
 */
export function AcoesDoPedido({
  pedidoId,
  acoes,
  compacto = false,
  modo = "lista",
  comPrimaria = true,
  itensAdicionais = [],
  tetoDaTaxa = null,
}: {
  pedidoId: string;
  acoes: AcaoDoPedido[];
  compacto?: boolean;
  modo?: "lista" | "linha";
  /**
   * Em `"linha"`, `false` manda TODOS os comandos para o menu — usado quando a
   * linha já tem outra primária, como "Receber" num pedido que está devendo.
   */
  comPrimaria?: boolean;
  itensAdicionais?: { rotulo: string; href: string }[];
  /**
   * Pedido do cliente com a taxa a confirmar (D-2026-10-17-149): o teto que
   * ele viu. Com ele, "Aprovar entrega" abre o campo da taxa antes.
   */
  tetoDaTaxa?: number | null;
}) {
  const [pedindoMotivo, setPedindoMotivo] = useState<AcaoDoPedido | null>(null);
  // Aprovar entrega com taxa a definir: `teto` vem da fila, ou da recusa do
  // banco quando a tela ainda não sabia (`exige_taxa`).
  const [pedindoTaxa, setPedindoTaxa] = useState<{ acao: AcaoDoPedido; teto: number | null } | null>(null);
  const [taxa, setTaxa] = useState("");
  const [escolhendoMotoboy, setEscolhendoMotoboy] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [menuAberto, setMenuAberto] = useState(false);
  // "Ver detalhes" e "Emitir comanda" abrem modal por query, sem skeleton de
  // rota: o menu fica aberto, com o item pulsando, até o modal chegar.
  const aoClicarEmLink = useFecharAoNavegar(() => setMenuAberto(false));
  const [executando, iniciar] = useTransition();
  const menuId = useId();
  const caixaDoMenu = useRef<HTMLDivElement | null>(null);
  const conteudoDoMenu = useRef<HTMLDivElement | null>(null);

  const primaria =
    modo === "linha" && comPrimaria ? (acoes.find((a) => !a.destrutivo) ?? null) : null;
  const noMenu = modo === "linha" ? acoes.filter((a) => a !== primaria) : [];
  const posicaoMenu = usePopoverFixo(
    caixaDoMenu,
    menuAberto,
    220,
    (noMenu.length + itensAdicionais.length) * 44 + 12,
  );
  const menuPosicionado = posicaoMenu !== null;

  useEffect(() => {
    if (menuAberto && menuPosicionado) {
      conteudoDoMenu.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus();
    }
  // Só no instante em que o portal aparece, não em cada reposicionamento.
  }, [menuAberto, menuPosicionado]);

  /*
   * Fecha o menu ao clicar fora ou apertar Escape. Sem isto, um menu aberto
   * numa linha ficaria aberto enquanto o operador clica em outra — e numa
   * tabela com um menu por linha, viram vários abertos ao mesmo tempo.
   */
  useEffect(() => {
    if (!menuAberto) return;
    const aoClicar = (e: MouseEvent) => {
      if (!caixaDoMenu.current?.contains(e.target as Node) &&
          !conteudoDoMenu.current?.contains(e.target as Node)) setMenuAberto(false);
    };
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuAberto(false);
        caixaDoMenu.current?.querySelector("button")?.focus();
      }
    };
    document.addEventListener("pointerdown", aoClicar);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("pointerdown", aoClicar);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [menuAberto]);

  function disparar(acao: AcaoDoPedido, motivoInformado?: string, taxaInformada?: number) {
    setErro(null);
    iniciar(async () => {
      const r = await executarComando({
        pedido_id: pedidoId,
        comando: acao.comando,
        motivo: motivoInformado,
        taxa: taxaInformada,
      });
      if (!r.ok) {
        if (r.exige_taxa && pedindoTaxa === null) {
          setPedindoTaxa({ acao, teto: tetoDaTaxa });
          return;
        }
        setErro(r.erro);
        return;
      }
      setPedindoMotivo(null);
      setMotivo("");
      setPedindoTaxa(null);
      setTaxa("");
      setMenuAberto(false);
    });
  }

  function aoEscolher(acao: AcaoDoPedido) {
    setMenuAberto(false);
    if (acao.comando === "despachar") {
      setErro(null);
      setEscolhendoMotoboy(true);
      return;
    }
    if (acao.comando === "aprovar_entrega" && tetoDaTaxa !== null) {
      setPedindoTaxa({ acao, teto: tetoDaTaxa });
      return;
    }
    if (acao.exige_motivo) {
      setPedindoMotivo(acao);
      return;
    }
    disparar(acao);
  }

  /*
   * A PRIMÁRIA é a primeira não destrutiva, na ordem que o banco definiu
   * (`order_commands.sort_order`). Não é escolha desta tela: se amanhã um
   * comando novo entrar antes, ele vira a primária sozinho.
   */
  if (acoes.length === 0 && itensAdicionais.length === 0 && erro === null) return null;

  const classeBotao = (acao: AcaoDoPedido) =>
    [
      "min-h-touch cursor-pointer whitespace-nowrap rounded-10 border bg-transparent font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-orange disabled:cursor-not-allowed disabled:opacity-60 lg:min-h-10",
      compacto ? "px-2.5 text-[12px]" : "px-3 text-[13px]",
      estiloDoComando(acao.comando, acao.destrutivo),
    ].join(" ");

  return (
    <div className="flex flex-col gap-2">
      {modo === "linha" ? (
        <div className="flex items-center gap-1">
          {primaria !== null ? (
            <button
              type="button"
              disabled={executando}
              onClick={() => aoEscolher(primaria)}
              className={classeBotao(primaria)}
            >
              {rotuloDaAcao(primaria)}
            </button>
          ) : null}

          {noMenu.length > 0 || itensAdicionais.length > 0 ? (
            <div ref={caixaDoMenu} className="relative">
              {/*
               * O `⋯` guarda o que é destrutivo. Não é só economia de largura:
               * tira o cancelar de encostado na ação que o dedo procura. E o
               * clique acidental continua não cancelando nada — todo comando
               * destrutivo tem `exige_motivo`, então o que abre é um campo.
               */}
              <button
                type="button"
                disabled={executando}
                aria-haspopup="menu"
                aria-expanded={menuAberto}
                aria-controls={menuAberto ? menuId : undefined}
                aria-label="Mais ações"
                title="Mais ações"
                onClick={() => setMenuAberto((v) => !v)}
                className="min-h-touch min-w-touch cursor-pointer rounded-11 border-[1.5px] border-border-shalon bg-surface px-2 text-[15px] font-bold leading-none text-ink-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                ⋯
              </button>

              {menuAberto && posicaoMenu ? createPortal(
                <div
                  id={menuId}
                  ref={conteudoDoMenu}
                  role="menu"
                  style={posicaoMenu}
                  onKeyDown={(evento) => {
                    if (evento.key !== "ArrowDown" && evento.key !== "ArrowUp") return;
                    const itens = [...(conteudoDoMenu.current?.querySelectorAll<HTMLElement>("[role='menuitem']:not([disabled])") ?? [])];
                    if (!itens.length) return;
                    evento.preventDefault();
                    const atual = itens.indexOf(document.activeElement as HTMLElement);
                    const deslocamento = evento.key === "ArrowDown" ? 1 : -1;
                    itens[(atual + deslocamento + itens.length) % itens.length]?.focus();
                  }}
                  className="motion-popover-in fixed z-[80] flex w-[min(220px,calc(100vw-16px))] flex-col overflow-y-auto rounded-12 border border-border-shalon bg-surface shadow-[0_8px_24px_rgb(41_37_36/0.16)]"
                >
                  {itensAdicionais.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      role="menuitem"
                      onClick={aoClicarEmLink}
                      className="flex min-h-touch items-center justify-between gap-3 border-0 bg-transparent px-3 text-[13.5px] font-semibold text-ink no-underline hover:bg-elev"
                    >
                      {item.rotulo}
                      <IndicadorDeNavegacao />
                    </Link>
                  ))}
                  {itensAdicionais.length > 0 && noMenu.length > 0 ? (
                    <div className="mx-3 border-t border-border-shalon" />
                  ) : null}
                  {noMenu.map((acao) => (
                    <button
                      key={acao.comando}
                      type="button"
                      role="menuitem"
                      disabled={executando}
                      onClick={() => aoEscolher(acao)}
                      className={[
                        "min-h-touch cursor-pointer border-0 bg-transparent px-3 text-left text-[13.5px] font-semibold",
                        "hover:bg-elev disabled:cursor-not-allowed disabled:opacity-60",
                        acao.destrutivo ? "text-tdf" : "text-ink",
                      ].join(" ")}
                    >
                      {rotuloDaAcao(acao)}
                    </button>
                  ))}
                </div>, document.body,
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {acoes.map((acao) => (
            <button
              key={acao.comando}
              type="button"
              disabled={executando}
              onClick={() => aoEscolher(acao)}
              className={classeBotao(acao)}
            >
              {rotuloDaAcao(acao)}
            </button>
          ))}
        </div>
      )}

      {pedindoMotivo !== null
        ? createPortal(
            <ModalDeMotivo
              acao={pedindoMotivo}
              campoId={`motivo-${pedidoId}`}
              motivo={motivo}
              aoMudarMotivo={setMotivo}
              executando={executando}
              erro={erro}
              aoConfirmar={() => disparar(pedindoMotivo, motivo.trim())}
              aoFechar={() => {
                if (executando) return;
                setPedindoMotivo(null);
                setMotivo("");
                setErro(null);
              }}
            />,
            document.body,
          )
        : null}

      {pedindoTaxa !== null
        ? createPortal(
            <ModalDaTaxa
              campoId={`taxa-${pedidoId}`}
              teto={pedindoTaxa.teto}
              taxa={taxa}
              aoMudarTaxa={setTaxa}
              executando={executando}
              erro={erro}
              aoConfirmar={(valor) => disparar(pedindoTaxa.acao, undefined, valor)}
              aoFechar={() => {
                if (executando) return;
                setPedindoTaxa(null);
                setTaxa("");
                setErro(null);
              }}
            />,
            document.body,
          )
        : null}

      {escolhendoMotoboy
        ? createPortal(
            <ModalDoMotoboy
              pedidoId={pedidoId}
              aoFechar={() => setEscolhendoMotoboy(false)}
            />,
            document.body,
          )
        : null}

      {erro !== null && pedindoMotivo === null && pedindoTaxa === null ? (
        <p
          role="alert"
          className="m-0 rounded-10 bg-td px-3 py-2 text-[13px] font-semibold text-tdf"
        >
          {erro}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Motivo de um comando destrutivo (rejeitar, cancelar), num modal.
 *
 * Antes o campo abria embaixo dos botões. Na tabela, isso esticava a linha e,
 * em notebook de tela menor, empurrava o campo para fora da coluna de ações
 * (14/10/2026). O caminho continua o mesmo: motivo de pelo menos 3
 * caracteres, e o banco recusa sem ele (RN-STATE-009 e RN-STATE-010).
 */
function ModalDeMotivo({
  acao,
  campoId,
  motivo,
  aoMudarMotivo,
  executando,
  erro,
  aoConfirmar,
  aoFechar,
}: {
  acao: AcaoDoPedido;
  campoId: string;
  motivo: string;
  aoMudarMotivo: (motivo: string) => void;
  executando: boolean;
  erro: string | null;
  aoConfirmar: () => void;
  aoFechar: () => void;
}) {
  const campo = useRef<HTMLTextAreaElement>(null);
  const tituloId = `${campoId}-titulo`;
  // Ref para o efeito rodar UMA vez: `aoFechar` é recriada a cada tecla, e
  // reexecutar o efeito perderia o foco anterior que ele devolve ao fechar.
  const fechar = useRef(aoFechar);
  useEffect(() => {
    fechar.current = aoFechar;
  }, [aoFechar]);

  useEffect(() => {
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    campo.current?.focus();
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
        if (evento.target === evento.currentTarget) aoFechar();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-20 border border-border-shalon bg-surface p-5 shadow-2xl sm:max-w-[480px] sm:rounded-20"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id={tituloId} className="m-0 font-display text-[19px] font-bold text-ink">
            {acao.rotulo}
          </h2>
          <button
            type="button"
            aria-label="Fechar"
            onClick={aoFechar}
            className="flex size-10 cursor-pointer items-center justify-center rounded-full border border-border-shalon bg-elev text-[20px] text-ink"
          >
            ×
          </button>
        </div>

        <form
          onSubmit={(evento) => {
            evento.preventDefault();
            if (!executando && motivo.trim().length >= 3) aoConfirmar();
          }}
        >
          <label htmlFor={campoId} className="mb-[6px] block text-[13.5px] font-semibold text-ink">
            Motivo
          </label>
          <textarea
            ref={campo}
            id={campoId}
            value={motivo}
            onChange={(e) => aoMudarMotivo(e.target.value)}
            rows={3}
            maxLength={400}
            className="w-full resize-y rounded-11 border-[1.5px] border-border-shalon bg-surface px-3 py-2 text-[14px] text-ink focus:border-brand-orange focus:outline-none"
          />
          <p className="m-0 mt-1 text-[12px] text-muted">
            Fica registrado no histórico do pedido e na auditoria.
          </p>

          {erro !== null ? (
            <p role="alert" className="m-0 mt-3 rounded-10 bg-td px-3 py-2 text-[13px] font-semibold text-tdf">
              {erro}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={executando || motivo.trim().length < 3}
              className="min-h-touch cursor-pointer rounded-11 border-0 bg-cta px-4 text-[14px] font-semibold text-cta-fg disabled:cursor-not-allowed disabled:bg-tn disabled:text-muted"
            >
              {executando ? "Registrando…" : "Confirmar"}
            </button>
            <button
              type="button"
              onClick={aoFechar}
              disabled={executando}
              className="min-h-touch cursor-pointer rounded-11 border-[1.5px] border-border-shalon bg-surface px-4 text-[14px] font-semibold text-ink disabled:opacity-60"
            >
              Voltar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * A taxa de entrega de um pedido do cliente cujo endereço não foi localizado
 * (D-2026-10-17-149). Aprovar a entrega define a taxa; o banco recusa sem
 * ela e acima do teto que o cliente viu, e a guarda no endereço dele.
 */
function ModalDaTaxa({
  campoId,
  teto,
  taxa,
  aoMudarTaxa,
  executando,
  erro,
  aoConfirmar,
  aoFechar,
}: {
  campoId: string;
  teto: number | null;
  taxa: string;
  aoMudarTaxa: (taxa: string) => void;
  executando: boolean;
  erro: string | null;
  aoConfirmar: (valor: number) => void;
  aoFechar: () => void;
}) {
  const campo = useRef<HTMLInputElement>(null);
  const tituloId = `${campoId}-titulo`;
  const fechar = useRef(aoFechar);
  useEffect(() => {
    fechar.current = aoFechar;
  }, [aoFechar]);

  useEffect(() => {
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    campo.current?.focus();
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

  const numero = Number(taxa.replace(/\s/g, "").replace(",", "."));
  const valor =
    taxa.trim() !== "" && Number.isFinite(numero) && numero >= 0 && numero <= (teto ?? 500)
      ? Math.round(numero * 100) / 100
      : null;
  const acimaDoTeto = teto !== null && taxa.trim() !== "" && Number.isFinite(numero) && numero > teto;

  return (
    <div
      className="fixed inset-0 z-[95] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      onMouseDown={(evento) => {
        if (evento.target === evento.currentTarget) aoFechar();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-20 border border-border-shalon bg-surface p-5 shadow-2xl sm:max-w-[480px] sm:rounded-20"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id={tituloId} className="m-0 font-display text-[19px] font-bold text-ink">
            Aprovar entrega
          </h2>
          <button
            type="button"
            aria-label="Fechar"
            onClick={aoFechar}
            className="flex size-10 cursor-pointer items-center justify-center rounded-full border border-border-shalon bg-elev text-[20px] text-ink"
          >
            ×
          </button>
        </div>

        <p className="m-0 mb-3 text-[13.5px] text-ink-2">
          O endereço deste pedido não foi localizado no mapa. Confira o endereço e informe a taxa
          de entrega{teto !== null ? <> — o cliente aceitou até <strong>{formatBRL(teto)}</strong></> : null}.
        </p>

        <form
          onSubmit={(evento) => {
            evento.preventDefault();
            if (!executando && valor !== null) aoConfirmar(valor);
          }}
        >
          <label htmlFor={campoId} className="mb-[6px] block text-[13.5px] font-semibold text-ink">
            Taxa de entrega (R$)
          </label>
          <input
            ref={campo}
            id={campoId}
            value={taxa}
            onChange={(e) => aoMudarTaxa(e.target.value)}
            inputMode="decimal"
            placeholder="Ex.: 6,00"
            className="min-h-touch w-full rounded-11 border-[1.5px] border-border-shalon bg-surface px-3 text-[15px] text-ink focus:border-brand-orange focus:outline-none"
          />
          <p className="m-0 mt-1 text-[12px] text-muted">
            Fica guardada no endereço do cliente para os próximos pedidos e registrada na auditoria.
          </p>

          {acimaDoTeto ? (
            <p className="m-0 mt-3 rounded-10 bg-tw px-3 py-2 text-[13px] font-semibold text-twf">
              Acima do que o cliente aceitou. Combine com ele antes ou recuse a entrega.
            </p>
          ) : null}

          {erro !== null ? (
            <p role="alert" className="m-0 mt-3 rounded-10 bg-td px-3 py-2 text-[13px] font-semibold text-tdf">
              {erro}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={executando || valor === null}
              className="min-h-touch cursor-pointer rounded-11 border-0 bg-cta px-4 text-[14px] font-semibold text-cta-fg disabled:cursor-not-allowed disabled:bg-tn disabled:text-muted"
            >
              {executando ? "Aprovando…" : valor !== null ? `Aprovar com ${formatBRL(valor)}` : "Aprovar"}
            </button>
            <button
              type="button"
              onClick={aoFechar}
              disabled={executando}
              className="min-h-touch cursor-pointer rounded-11 border-[1.5px] border-border-shalon bg-surface px-4 text-[14px] font-semibold text-ink disabled:opacity-60"
            >
              Voltar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * "Saiu com…" (D-2026-10-27-172): quem leva a entrega, num toque.
 *
 * A lista vem do servidor na hora (`motoboys_para_despacho`): só entregadores
 * ativos e sem falta hoje, primeiro quem já está na rua. Tocar num nome
 * vincula e despacha (`sair_com_motoboy`); motoboy na rua leva o pedido na
 * mesma saída, e o acerto acontece na volta, em Entregas.
 */
function ModalDoMotoboy({ pedidoId, aoFechar }: { pedidoId: string; aoFechar: () => void }) {
  const [lista, setLista] = useState<MotoboyParaDespacho[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const painel = useRef<HTMLDivElement>(null);
  const tituloId = `motoboy-${pedidoId}-titulo`;
  const fechar = useRef(aoFechar);
  useEffect(() => {
    fechar.current = aoFechar;
  }, [aoFechar]);

  useEffect(() => {
    let ativo = true;
    listarMotoboysParaDespacho()
      .then((r) => {
        if (!ativo) return;
        if (r.ok) setLista(r.motoboys);
        else {
          setLista([]);
          setErro(r.erro);
        }
      })
      .catch(() => ativo && (setLista([]), setErro("Não foi possível carregar os motoboys agora.")));
    return () => {
      ativo = false;
    };
  }, []);

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

  function escolher(motoboy: MotoboyParaDespacho) {
    setErro(null);
    iniciar(async () => {
      const r = await sairComMotoboy({ pedido_id: pedidoId, motoboy_id: motoboy.id });
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível despachar.");
        return;
      }
      aoFechar();
    });
  }

  return (
    <div
      className="fixed inset-0 z-[95] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      onMouseDown={(evento) => {
        if (evento.target === evento.currentTarget && !enviando) aoFechar();
      }}
    >
      <div
        ref={painel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-20 border border-border-shalon bg-surface p-5 shadow-2xl outline-none sm:max-w-[480px] sm:rounded-20"
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 id={tituloId} className="m-0 font-display text-[19px] font-bold text-ink">
            Quem vai levar?
          </h2>
          <button
            type="button"
            aria-label="Fechar"
            onClick={aoFechar}
            disabled={enviando}
            className="flex size-10 cursor-pointer items-center justify-center rounded-full border border-border-shalon bg-elev text-[20px] text-ink"
          >
            ×
          </button>
        </div>
        <p className="m-0 mb-4 text-[13.5px] text-ink-2">
          Toque no motoboy que está saindo com este pedido. Na volta, o acerto dele é feito em Entregas.
        </p>

        {lista === null ? (
          <div aria-hidden="true" className="flex flex-col gap-2">
            <div className="h-[52px] animate-pulse rounded-12 bg-tn" />
            <div className="h-[52px] animate-pulse rounded-12 bg-tn" />
          </div>
        ) : lista.length === 0 ? (
          <p className="m-0 rounded-12 border-[1.5px] border-twb bg-tw p-3 text-[13.5px] leading-snug text-twf">
            Nenhum motoboy disponível. Cadastre os motoboys em Equipe, marcados como entregadores. Quem foi
            marcado como ausente hoje não aparece aqui.
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {lista.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  disabled={enviando}
                  onClick={() => escolher(m)}
                  className="flex min-h-[52px] w-full cursor-pointer items-center justify-between gap-3 rounded-12 border-[1.5px] border-border-shalon bg-surface px-4 text-left hover:bg-elev disabled:cursor-not-allowed disabled:opacity-60"
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

        {erro !== null ? (
          <p role="alert" className="m-0 mt-3 rounded-10 bg-td px-3 py-2 text-[13px] font-semibold text-tdf">
            {erro}
          </p>
        ) : null}

        {enviando ? <p role="status" className="m-0 mt-3 text-[13px] text-muted">Despachando…</p> : null}
      </div>
    </div>
  );
}

