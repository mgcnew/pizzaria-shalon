"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { executarComando } from "@/application/pedidos/acoes";
import type { AcaoDoPedido } from "@/application/pedidos/tipos";
import { IndicadorDeNavegacao } from "@/ui/components/IndicadorDeNavegacao";
import { useFecharAoNavegar } from "@/ui/hooks/useFecharAoNavegar";
import { usePopoverFixo } from "@/ui/hooks/usePopoverFixo";
import { estiloDoComando } from "./estiloDasAcoes";

/**
 * Os comandos da máquina de estados, como botões.
 *
 * A lista vem PRONTA do servidor (`acoes_do_pedido`), já filtrada por
 * permissão e por estado. Este componente não sabe — e não deve saber — que
 * "aceitar" só vale em `waiting_store_confirmation`: essa regra vive no
 * banco, e duplicá-la aqui criaria uma segunda verdade (CLAUDE.md §21).
 *
 * Comando destrutivo pede motivo antes, e o motivo é obrigatório de verdade:
 * o banco recusa sem ele (RN-STATE-009 e RN-STATE-010).
 *
 * DOIS LAYOUTS, UM CAMINHO SÓ. Em `"lista"` (cartão e tela do pedido) todos os
 * comandos viram botões lado a lado. Em `"linha"` (a tabela do desktop) só o
 * primeiro não destrutivo fica visível e o resto vai para um menu `⋯`.
 *
 * O motivo de ser uma prop, e não um segundo componente: o caminho destrutivo
 * — abrir o campo de motivo, exigir 3 caracteres, disparar, mostrar a recusa —
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
}) {
  const [pedindoMotivo, setPedindoMotivo] = useState<AcaoDoPedido | null>(null);
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

  function disparar(acao: AcaoDoPedido, motivoInformado?: string) {
    setErro(null);
    iniciar(async () => {
      const r = await executarComando({
        pedido_id: pedidoId,
        comando: acao.comando,
        motivo: motivoInformado,
      });
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setPedindoMotivo(null);
      setMotivo("");
      setMenuAberto(false);
    });
  }

  function aoEscolher(acao: AcaoDoPedido) {
    setMenuAberto(false);
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
              {primaria.rotulo}
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
                      {acao.rotulo}
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
              {acao.rotulo}
            </button>
          ))}
        </div>
      )}

      {pedindoMotivo !== null ? (
        <div className="rounded-12 border border-border-shalon bg-elev p-3">
          <label
            htmlFor={`motivo-${pedidoId}`}
            className="mb-[6px] block text-[13.5px] font-semibold text-ink"
          >
            Motivo — {pedindoMotivo.rotulo}
          </label>
          <textarea
            id={`motivo-${pedidoId}`}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
            maxLength={400}
            className="w-full resize-y rounded-11 border-[1.5px] border-border-shalon bg-surface px-3 py-2 text-[14px] text-ink focus:border-brand-orange focus:outline-none"
          />
          <p className="m-0 mt-1 text-[12px] text-muted">
            Fica registrado no histórico do pedido e na auditoria.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={executando || motivo.trim().length < 3}
              onClick={() => disparar(pedindoMotivo, motivo.trim())}
              className="min-h-touch cursor-pointer rounded-11 border-0 bg-cta px-4 text-[14px] font-semibold text-cta-fg disabled:cursor-not-allowed disabled:bg-tn disabled:text-muted"
            >
              {executando ? "Registrando…" : "Confirmar"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPedindoMotivo(null);
                setMotivo("");
              }}
              className="min-h-touch cursor-pointer rounded-11 border-[1.5px] border-border-shalon bg-surface px-4 text-[14px] font-semibold text-ink"
            >
              Voltar
            </button>
          </div>
        </div>
      ) : null}

      {erro !== null ? (
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
