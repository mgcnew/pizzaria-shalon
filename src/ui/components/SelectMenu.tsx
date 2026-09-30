"use client";

import { useEffect, useId, useRef, useState } from "react";

export type OpcaoSelectMenu = {
  valor: string;
  texto: string;
  descricao?: string;
  /** Opções com o mesmo grupo aparecem sob um título (equivale a `optgroup`). */
  grupo?: string;
};

/**
 * Lista suspensa no tema do sistema, no lugar do `<select>` do navegador.
 *
 * Funciona dos dois jeitos:
 *  - CONTROLADA, com `valor` + `aoMudar`, para telas com estado;
 *  - NÃO CONTROLADA, com `name` + `valorInicial`, para formulários de server
 *    action. O valor vai num campo com `name`, e volta ao inicial quando o
 *    formulário é reiniciado (o React 19 reinicia depois da action).
 *
 * `placeholder` é o texto quando nada está escolhido — o valor enviado fica
 * vazio, como no `<option value="" disabled>`. Com `required`, o navegador
 * recusa o envio sem escolha, igual ao `<select required>`.
 */
export function SelectMenu({
  name,
  label,
  opcoes,
  valor,
  valorInicial = "",
  aoMudar,
  hint,
  placeholder,
  required = false,
  labelOculto = false,
}: {
  name?: string;
  label: string;
  opcoes: readonly OpcaoSelectMenu[];
  valor?: string;
  valorInicial?: string;
  aoMudar?: (valor: string) => void;
  hint?: string;
  placeholder?: string;
  required?: boolean;
  labelOculto?: boolean;
}) {
  const idBase = useId().replace(/:/g, "");
  const botaoId = `select-menu-${idBase}`;
  const listaId = `${botaoId}-lista`;
  const hintId = hint ? `${botaoId}-hint` : undefined;
  const raizRef = useRef<HTMLDivElement>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const busca = useRef({ texto: "", ate: 0 });

  const controlada = valor !== undefined;
  const [valorInterno, setValorInterno] = useState(valorInicial);
  const valorAtual = controlada ? valor : valorInterno;

  const [aberto, setAberto] = useState(false);
  const encontrado = opcoes.findIndex((opcao) => opcao.valor === valorAtual);
  // Sem placeholder, mantém o comportamento de sempre: mostra a primeira.
  const indiceSelecionado = encontrado >= 0 ? encontrado : placeholder !== undefined ? -1 : 0;
  const [indiceAtivo, setIndiceAtivo] = useState(Math.max(0, indiceSelecionado));
  const selecionada = indiceSelecionado >= 0 ? opcoes[indiceSelecionado] : undefined;
  const valorEfetivo = selecionada?.valor ?? "";

  // O React 19 reinicia o formulário depois da action; o campo acompanha.
  useEffect(() => {
    if (controlada) return;
    const formulario = raizRef.current?.closest("form");
    if (!formulario) return;
    const reiniciar = () => setValorInterno(valorInicial);
    formulario.addEventListener("reset", reiniciar);
    return () => formulario.removeEventListener("reset", reiniciar);
  }, [controlada, valorInicial]);

  useEffect(() => {
    if (!aberto) return;

    function fecharAoClicarFora(evento: MouseEvent) {
      if (!raizRef.current?.contains(evento.target as Node)) setAberto(false);
    }

    function fecharComEscape(evento: KeyboardEvent) {
      if (evento.key !== "Escape") return;
      setAberto(false);
      botaoRef.current?.focus();
    }

    document.addEventListener("mousedown", fecharAoClicarFora);
    document.addEventListener("keydown", fecharComEscape);
    return () => {
      document.removeEventListener("mousedown", fecharAoClicarFora);
      document.removeEventListener("keydown", fecharComEscape);
    };
  }, [aberto]);

  // Mantém a opção ativa à vista quando a lista é longa.
  useEffect(() => {
    if (!aberto) return;
    document.getElementById(`${botaoId}-opcao-${indiceAtivo}`)?.scrollIntoView({ block: "nearest" });
  }, [aberto, indiceAtivo, botaoId]);

  function abrir() {
    setIndiceAtivo(Math.max(0, indiceSelecionado));
    setAberto(true);
  }

  function escolher(indice: number) {
    const opcao = opcoes[indice];
    if (!opcao) return;
    if (!controlada) setValorInterno(opcao.valor);
    aoMudar?.(opcao.valor);
    setAberto(false);
    botaoRef.current?.focus();
  }

  /** Digitar o começo do nome leva à opção, como no `<select>` nativo. */
  function buscarPorTexto(tecla: string) {
    const agora = Date.now();
    busca.current = {
      texto: (agora < busca.current.ate ? busca.current.texto : "") + tecla.toLowerCase(),
      ate: agora + 700,
    };
    const alvo = busca.current.texto;
    const inicio = aberto ? indiceAtivo : Math.max(0, indiceSelecionado);
    // Uma letra só pula para a PRÓXIMA que começa com ela; continuar
    // digitando refina a partir da atual.
    const deslocamento = alvo.length > 1 ? 0 : 1;
    for (let k = 0; k < opcoes.length; k++) {
      const i = (inicio + deslocamento + k) % opcoes.length;
      if (opcoes[i]?.texto.toLowerCase().startsWith(alvo)) {
        if (aberto) setIndiceAtivo(i);
        else escolher(i);
        return;
      }
    }
  }

  function navegar(evento: React.KeyboardEvent<HTMLButtonElement>) {
    if (evento.key === "ArrowDown" || evento.key === "ArrowUp") {
      evento.preventDefault();
      if (!aberto) {
        abrir();
        return;
      }
      const passo = evento.key === "ArrowDown" ? 1 : -1;
      setIndiceAtivo((atual) => (atual + passo + opcoes.length) % opcoes.length);
      return;
    }

    if (evento.key === "Home" && aberto) {
      evento.preventDefault();
      setIndiceAtivo(0);
      return;
    }

    if (evento.key === "End" && aberto) {
      evento.preventDefault();
      setIndiceAtivo(opcoes.length - 1);
      return;
    }

    if ((evento.key === "Enter" || evento.key === " ") && aberto) {
      evento.preventDefault();
      escolher(indiceAtivo);
      return;
    }

    if (evento.key.length === 1 && evento.key !== " " && !evento.ctrlKey && !evento.metaKey && !evento.altKey) {
      buscarPorTexto(evento.key);
    }
  }

  return (
    <div
      ref={raizRef}
      className="relative w-full"
      onBlur={(evento) => {
        if (!evento.currentTarget.contains(evento.relatedTarget)) setAberto(false);
      }}
    >
      {name && !required ? <input type="hidden" name={name} value={valorEfetivo} /> : null}
      {/* Obrigatório: campo de texto invisível, porque `hidden` não participa
          da validação do navegador. O foco vai para o botão. */}
      {name && required ? (
        <input
          tabIndex={-1}
          aria-hidden="true"
          name={name}
          value={valorEfetivo}
          required
          onChange={() => undefined}
          onFocus={() => botaoRef.current?.focus()}
          className="pointer-events-none absolute bottom-0 left-1/2 h-px w-px opacity-0"
        />
      ) : null}
      <label
        id={`${botaoId}-label`}
        className={labelOculto ? "sr-only" : "mb-[6px] block text-[14px] font-semibold text-ink"}
      >
        {label}
      </label>
      <button
        ref={botaoRef}
        id={botaoId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-autocomplete="none"
        aria-expanded={aberto}
        aria-controls={listaId}
        aria-labelledby={`${botaoId}-label ${botaoId}`}
        aria-describedby={hintId}
        aria-required={required || undefined}
        aria-activedescendant={aberto ? `${botaoId}-opcao-${indiceAtivo}` : undefined}
        onClick={() => (aberto ? setAberto(false) : abrir())}
        onKeyDown={navegar}
        className={[
          "motion-interactive flex min-h-[46px] w-full cursor-pointer items-center justify-between gap-3",
          "rounded-11 border-[1.5px] bg-surface px-3 py-[10px] text-left text-[14px] font-medium",
          "transition-colors focus:outline-none",
          selecionada ? "text-ink" : "text-muted",
          aberto ? "border-brand-orange" : "border-border-shalon hover:border-brand-orange focus:border-brand-orange",
        ].join(" ")}
      >
        <span className="min-w-0 truncate">{selecionada?.texto ?? placeholder ?? "Selecione"}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className={`motion-interactive h-4 w-4 shrink-0 text-muted transition-transform ${aberto ? "rotate-180" : ""}`}
          fill="none"
        >
          <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {aberto ? (
        <div
          id={listaId}
          role="listbox"
          aria-labelledby={`${botaoId}-label`}
          className="motion-popover-in scrollbar-subtle absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-[280px] overflow-y-auto rounded-12 border border-border-shalon bg-surface p-1.5 shadow-[0_16px_42px_rgb(30_24_20/0.22)]"
        >
          {opcoes.length === 0 ? (
            <p className="m-0 px-3 py-2.5 text-[13px] text-muted">Nenhuma opção.</p>
          ) : null}
          {opcoes.map((opcao, indice) => {
            const selecionadaAgora = indice === indiceSelecionado;
            const ativa = indice === indiceAtivo;
            const abreGrupo = opcao.grupo !== undefined && opcao.grupo !== opcoes[indice - 1]?.grupo;
            return (
              <div key={`${opcao.grupo ?? ""}|${opcao.valor}`}>
                {abreGrupo ? (
                  <p
                    role="presentation"
                    className="m-0 px-3 pb-1 pt-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-muted"
                  >
                    {opcao.grupo}
                  </p>
                ) : null}
                <div
                  id={`${botaoId}-opcao-${indice}`}
                  role="option"
                  aria-selected={selecionadaAgora}
                  onMouseEnter={() => setIndiceAtivo(indice)}
                  onMouseDown={(evento) => {
                    evento.preventDefault();
                    escolher(indice);
                  }}
                  className={[
                    "flex cursor-pointer items-center gap-3 rounded-10 px-3 py-2.5 text-left",
                    ativa ? "bg-tn" : "bg-transparent",
                  ].join(" ")}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-semibold text-ink">{opcao.texto}</span>
                    {opcao.descricao ? (
                      <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">
                        {opcao.descricao}
                      </span>
                    ) : null}
                  </span>
                  {selecionadaAgora ? (
                    <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-cta" fill="none">
                      <path d="m4 10 3.5 3.5L16 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {hint ? (
        <p id={hintId} className="mt-[6px] text-[12px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
