"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ProvedorDeOperacaoEmVoo } from "@/ui/operacaoEmVoo";
import { useRealtimeDoPdv } from "./useRealtimeDoPdv";
import { NovaVenda } from "./NovaVenda";
import {
  PainelDoCaixa,
  type ComandosDoCaixa,
  type EstadoVisivelDoCaixa,
} from "@/ui/caixa/PainelDoCaixa";
import {
  decidirAtalho,
  teclasAtivas,
  type AcaoDoPdv,
  type ContextoDoPdv,
} from "./atalhos";
import type { FormaDePagamento } from "@/application/checkout/tipos";

/**
 * O TECLADO DO PDV — Fase 12, Etapa 9.
 *
 * 09-PDV-FRENTE-DE-CAIXA.md §3, §4.1 · CLAUDE.md §38
 *
 * POR QUE UM LISTENER SÓ, E NO NÍVEL DA TELA.
 *
 * Os atalhos não pertencem a nenhum painel: F8 decide entre a venda e o pedido
 * selecionado, e essas duas coisas moram em componentes irmãos. Dois listeners
 * precisariam combinar quem age, e "combinar" entre dois lugares é exatamente
 * como duas teclas passam a disparar juntas.
 *
 * Então: um listener aqui, a decisão inteira em `atalhos.ts`, e cada painel
 * expõe duas funções — `estado()`, que diz como ele está, e `executar()`, que
 * faz a ação que é dele. Nenhuma decisão mora nos painéis, nenhum estado sobe
 * para cá.
 *
 * `estado()` é FUNÇÃO e não prop de propósito: o contexto é lido no instante da
 * tecla. Se fosse prop, cada caractere digitado no carrinho re-renderizaria a
 * tela inteira para manter o casco informado.
 */

/** O contrato de cada área. Pequeno porque a decisão não está aqui. */
export type AreaComTeclado = {
  /** Como esta área está agora. O que ela não sabe, ela não informa. */
  estado: () => Partial<ContextoDoPdv>;
  /** Executa a ação que é dela. Chamada só com ação do próprio prefixo. */
  executar: (acao: AcaoDoPdv) => void;
};

/** Onde o `Escape` do PDV cede a vez: menu, modal ou drawer por cima. */
const SELETOR_POR_CIMA = [
  '[aria-modal="true"]',
  '[role="dialog"]',
  '[role="menu"]',
  '[aria-haspopup="menu"][aria-expanded="true"]',
  '[aria-haspopup="listbox"][aria-expanded="true"]',
].join(", ");

/** Quanto tempo parado antes de o campo de leitura reconquistar o foco (§2.2). */
const OCIOSO_MS = 15_000;

function ehCampo(alvo: EventTarget | null): boolean {
  if (!(alvo instanceof HTMLElement)) return false;
  if (alvo.isContentEditable) return true;
  const tag = alvo.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function PdvComTeclado({
  formas,
  autorizado,
  caixa,
  tentativa,
  podeMovimentar,
}: {
  formas: FormaDePagamento[];
  autorizado: boolean;
  caixa: EstadoVisivelDoCaixa;
  tentativa: string;
  podeMovimentar: boolean;
}) {
  /**
   * O PDV acorda sozinho — Etapa 10.
   *
   * O hook assina `orders`, `cash_sessions` e `cash_movements`, agrupa a
   * rajada e adia o refresh enquanto houver dinheiro em voo. Nada aqui decide
   * nada: a autoridade continua no banco, e a tela só escolhe a hora de se
   * atualizar.
   */
  const realtime = useRealtimeDoPdv();
  const venda = useRef<AreaComTeclado | null>(null);
  const comandosDoCaixa = useRef<ComandosDoCaixa | null>(null);

  /**
   * A FAIXA É ESTADO, e não cálculo de render.
   *
   * Ler o contexto durante o render significaria tocar `venda.current` enquanto
   * React renderiza — que é justamente o que faz um componente não atualizar
   * quando devia. Então a faixa é recalculada em `avisar()`, chamada de dentro
   * de manipuladores de evento e dos efeitos dos painéis: nunca no render.
   */
  const [faixa, setFaixa] = useState<{ tecla: string; rotulo: string }[]>([]);

  const registrarVenda = useCallback((a: AreaComTeclado | null) => {
    venda.current = a;
  }, []);
  const registrarCaixa = useCallback((comandos: ComandosDoCaixa | null) => {
    comandosDoCaixa.current = comandos;
  }, []);

  /** O contexto completo da venda no instante da tecla. */
  const lerContexto = useCallback((): ContextoDoPdv => {
    const ativo = document.activeElement;
    return {
      focoEmCampo: ehCampo(ativo),
      focoNaLeitura:
        ativo instanceof HTMLElement && ativo.dataset.pdv === "leitura",
      leituraPreenchida: false,
      cedendoAVez: document.querySelector(SELETOR_POR_CIMA) !== null,
      temItens: false,
      podeSalvar: false,
      temResultados: false,
      configuradorAberto: false,
      podeMovimentarCaixa: caixa.aberto && podeMovimentar,
      ...venda.current?.estado(),
    };
  }, [caixa.aberto, podeMovimentar]);

  const avisar = useCallback(() => {
    setFaixa(teclasAtivas(lerContexto()));
  }, [lerContexto]);

  /** Roteia pelo prefixo para a venda ou para as operações da gaveta. */
  const executar = useCallback(
    (acao: AcaoDoPdv) => {
      if (acao === "caixa:reforco") return comandosDoCaixa.current?.abrirReforco();
      if (acao === "caixa:sangria") return comandosDoCaixa.current?.abrirSangria();
      if (acao.startsWith("venda:")) {
        venda.current?.executar(acao);
      }
    },
    [],
  );

  // ---------------------------------------------------------------- o listener
  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      // Repetição de tecla presa não vira dez ações.
      if (evento.repeat) return;

      const ctx = lerContexto();
      const acao = decidirAtalho(
        {
          key: evento.key,
          ctrlKey: evento.ctrlKey,
          metaKey: evento.metaKey,
          altKey: evento.altKey,
          shiftKey: evento.shiftKey,
        },
        ctx,
      );

      if (acao === null) return;

      // `preventDefault` SOMENTE quando a tecla virou ação nossa. F3 abriria o
      // "localizar" do navegador e F7 a navegação por cursor do Firefox; as
      // duas são canceláveis, e foi medido. O que não vira ação segue intacto.
      evento.preventDefault();
      executar(acao);
      avisar();
    }

    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [lerContexto, executar, avisar]);

  /**
   * A FAIXA TAMBÉM DEPENDE DO FOCO, não só do estado.
   *
   * `+`, `−`, `Delete` e as setas agem conforme quem tem o foco — então mover o
   * foco muda as teclas ativas sem mudar estado nenhum. Sem escutar isto, a
   * faixa anunciava as teclas do foco anterior; medido no navegador ao focar o
   * campo de leitura depois de mexer no seletor de forma de pagamento.
   */
  useEffect(() => {
    document.addEventListener("focusin", avisar);
    document.addEventListener("focusout", avisar);
    return () => {
      document.removeEventListener("focusin", avisar);
      document.removeEventListener("focusout", avisar);
    };
  }, [avisar]);

  // ----------------------------------------------- foco inicial e reconquista
  useEffect(() => {
    // O campo de leitura é o foco padrão da tela (§2.1). Sem isto o primeiro
    // bipe do turno se perde no vazio.
    venda.current?.executar("venda:focar-leitura");
    // A faixa não é preenchida aqui: os painéis chamam `aoMudar()` nos próprios
    // efeitos, que rodam ANTES deste — efeito de filho precede efeito de pai.
    // Chamar `avisar()` daqui seria um segundo caminho para o mesmo cálculo, e
    // o lint reprovaria o setState no corpo do efeito, com razão.
  }, []);

  useEffect(() => {
    let ultima = Date.now();
    const marcar = () => {
      ultima = Date.now();
    };
    const eventos = ["keydown", "pointerdown", "focusin"] as const;
    for (const e of eventos) document.addEventListener(e, marcar);

    /**
     * RECONQUISTA DE FOCO — §2.2, e com freio.
     *
     * O bipe se perde quando o foco está no vazio depois de uma navegação ou de
     * um clique em botão. Devolver o foco resolve isso. Mas roubar foco de
     * quem está digitando, ou de trás de um modal, seria muito pior do que o
     * problema: o operador veria a própria digitação sumir.
     *
     * Por isso três condições: ninguém digitando, nada por cima, e nenhum
     * painel de valor aberto.
     */
    const relogio = window.setInterval(() => {
      if (Date.now() - ultima < OCIOSO_MS) return;
      if (ehCampo(document.activeElement)) return;
      if (document.querySelector(SELETOR_POR_CIMA) !== null) return;

      const ctx = lerContexto();
      if (ctx.configuradorAberto) return;

      venda.current?.executar("venda:focar-leitura");
      ultima = Date.now();
    }, 5_000);

    return () => {
      window.clearInterval(relogio);
      for (const e of eventos) document.removeEventListener(e, marcar);
    };
  }, [lerContexto]);

  return (
    <ProvedorDeOperacaoEmVoo aoMudar={realtime.aoMudarOperacoes}>
      <div className="flex flex-col gap-5">
        {realtime.estado !== "ativo" ? (
          /*
           * A TELA DIZ A VERDADE quando não está atualizando sozinha (§37).
           *
           * Sem isto, um PDV desconectado pareceria idêntico a um atualizado — e
           * o operador confiaria numa fila velha. O aviso NÃO bloqueia nada: com
           * ou sem conexão, receber continua possível e continua seguro, porque
           * quem recusa a segunda cobrança é `registrar_pagamento`.
           */
          <p
            role="status"
            className="m-0 rounded-12 border-[1.5px] border-twb bg-tw px-3 py-2 text-[12.5px] font-semibold text-twf"
          >
            {realtime.estado === "conectando"
              ? "Conectando para atualizar em tempo real…"
              : "Sem atualização automática no momento — a fila e o caixa podem estar alguns segundos atrasados."}
          </p>
        ) : null}

        <NovaVenda
          formas={formas}
          autorizado={autorizado}
          registrar={registrarVenda}
          aoMudar={avisar}
        />

        <div className="flex flex-col gap-2 lg:sticky lg:bottom-3 lg:z-20">
          {/*
         * A FAIXA DE ATALHOS — §3, último parágrafo: "quem está aprendendo não
         * precisa decorar".
         *
         * Some onde não há teclado. `pointer: coarse` é dedo; abaixo de `lg` é
         * tablet e celular. Anunciar F7 para quem não tem F7 é ocupar altura da
         * tela para não informar nada. Quem decide é o CSS, nunca uma medição de
         * largura em JavaScript (CLAUDE.md §8).
         */}
          {faixa.length > 0 ? (
            <div
              aria-hidden="true"
              className="hidden flex-wrap items-center gap-x-4 gap-y-1 rounded-12 border border-border-shalon bg-elev/95 px-3 py-2 backdrop-blur lg:flex [@media(pointer:coarse)]:!hidden"
            >
              {faixa.map((t) => (
                <span key={t.tecla} className="flex items-center gap-1.5 text-[12px] text-ink-2">
                  <kbd className="rounded-8 border border-border-shalon bg-surface px-1.5 py-[1px] font-mono text-[11px] font-semibold text-ink">
                    {t.tecla}
                  </kbd>
                  {t.rotulo}
                </span>
              ))}
            </div>
          ) : null}

          <PainelDoCaixa
            estado={caixa}
            tentativa={tentativa}
            podeMovimentar={podeMovimentar}
            aoRegistrarComandos={registrarCaixa}
          />
        </div>
      </div>
    </ProvedorDeOperacaoEmVoo>
  );
}
