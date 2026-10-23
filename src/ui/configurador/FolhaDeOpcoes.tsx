"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { filtrarSabores } from "@/domain/catalogo/buscaDeSabor";

/**
 * Folha de escolha do configurador: sabores do meio a meio, borda e adicionais.
 *
 * A página do produto mostra só o que JÁ foi escolhido, uma linha por escolha;
 * a lista inteira (são dezenas de sabores e de ingredientes) fica aqui, fora da
 * página, e só abre quando o cliente toca para escolher. Assim o configurador
 * não vira uma parede de opções e, ao mesmo tempo, o cliente vê as opções em
 * vez de ter de adivinhar um nome para digitar. As três seções usam esta mesma
 * folha para que uma escolha tenha o mesmo jeito em qualquer lugar da tela.
 *
 * Dois modos:
 *  - `unica`: tocar escolhe e fecha (sabor de uma metade, borda);
 *  - `multipla`: tocar marca/desmarca e a folha fica aberta até "Concluir"
 *    (adicionais).
 *
 * Esta folha só ESCOLHE. Preço, limites e disponibilidade continuam vindo do
 * servidor pelo núcleo (CLAUDE.md §16 e §17): `detalhe` é texto já pronto, que
 * o núcleo monta a partir do que o servidor devolveu, e `aviso` é a mensagem
 * que o servidor gerou — na folha aberta, a barra de ação fica coberta e o
 * motivo de uma combinação recusada precisa aparecer aqui dentro.
 *
 * Vai para o `body` por portal: o configurador também roda dentro de modais do
 * painel, cujo `transform` prenderia um `position: fixed` na caixa do modal.
 */
export type OpcaoDaFolha = {
  id: string;
  nome: string;
  descricao: string | null;
  /** Preço ou condição, já formatado: "R$ 44,00", "+ R$ 10,00", "Incluso". */
  detalhe: string;
  disponivel?: boolean;
};

export function FolhaDeOpcoes({
  titulo,
  subtitulo,
  opcoes,
  modo,
  selecionados,
  comBusca = true,
  placeholder = "Buscar…",
  aviso = null,
  aoEscolher,
  aoFechar,
}: {
  titulo: string;
  subtitulo?: string;
  opcoes: OpcaoDaFolha[];
  modo: "unica" | "multipla";
  selecionados: string[];
  comBusca?: boolean;
  placeholder?: string;
  aviso?: string | null;
  aoEscolher: (id: string) => void;
  aoFechar: () => void;
}) {
  const [termo, setTermo] = useState("");
  const painelRef = useRef<HTMLElement>(null);
  const visiveis = filtrarSabores(opcoes, termo);

  // Foco no painel (e não na busca): no celular, focar o campo abriria o
  // teclado por cima da lista antes de o cliente ver uma única opção.
  useEffect(() => {
    painelRef.current?.focus();

    const rolagemAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function aoPressionarTecla(evento: KeyboardEvent) {
      if (evento.key === "Escape") aoFechar();
    }
    document.addEventListener("keydown", aoPressionarTecla);
    return () => {
      document.body.style.overflow = rolagemAnterior;
      document.removeEventListener("keydown", aoPressionarTecla);
    };
  }, [aoFechar]);

  return createPortal(
    <div className="fixed inset-0 z-80 flex items-end justify-center">
      <button
        type="button"
        aria-label="Fechar"
        tabIndex={-1}
        onClick={aoFechar}
        className="motion-backdrop-in absolute inset-0 cursor-default border-0 bg-[var(--shalon-scrim-drawer)]"
      />

      <section
        ref={painelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="folha-opcoes-titulo"
        className="animate-shalon-up relative flex max-h-[88dvh] w-full max-w-shalon flex-col rounded-t-22 border-t border-border-shalon bg-surface shadow-toast outline-none"
      >
        <header className="shrink-0 px-4 pb-3 pt-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 id="folha-opcoes-titulo" className="m-0 text-[18px] font-bold text-ink">
                {titulo}
              </h2>
              {subtitulo ? <p className="m-0 mt-[2px] text-[13px] text-muted">{subtitulo}</p> : null}
            </div>
            <button
              type="button"
              onClick={aoFechar}
              aria-label="Fechar"
              className="motion-interactive -mr-1 flex min-h-touch min-w-touch shrink-0 cursor-pointer items-center justify-center rounded-10 border-0 bg-tn text-ink-2 transition-colors hover:bg-border-shalon hover:text-ink"
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" style={{ width: 18, height: 18 }}>
                <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {comBusca ? (
            <div
              role="search"
              className="motion-interactive mt-3 flex min-h-[50px] items-center gap-[10px] rounded-10 border-[1.5px] border-border-shalon bg-elev px-[14px] transition-colors focus-within:border-brand-orange"
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                className="shrink-0 text-muted"
                style={{ width: 20, height: 20 }}
              >
                <circle cx="10.8" cy="10.8" r="6.3" stroke="currentColor" strokeWidth="1.8" />
                <path d="m15.5 15.5 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <label htmlFor="busca-folha-opcoes" className="sr-only">
                {placeholder}
              </label>
              <input
                id="busca-folha-opcoes"
                // `text`, e não `search`: o "×" nativo do navegador somaria um
                // segundo botão de limpar ao nosso, que tem o alvo de 44px.
                type="text"
                inputMode="search"
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                placeholder={placeholder}
                enterKeyHint="search"
                autoComplete="off"
                className="min-h-[48px] min-w-0 flex-1 border-0 bg-transparent text-[16px] text-ink outline-none placeholder:text-muted"
              />
              {termo ? (
                <button
                  type="button"
                  onClick={() => setTermo("")}
                  aria-label="Limpar busca"
                  className="motion-interactive flex min-h-touch min-w-touch cursor-pointer items-center justify-center rounded-10 border-0 bg-tn text-ink-2 transition-colors hover:bg-border-shalon hover:text-ink"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" style={{ width: 16, height: 16 }}>
                    <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </button>
              ) : null}
            </div>
          ) : null}
        </header>

        <div className="scrollbar-subtle min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-border-shalon px-4 pb-5 pt-3">
          {visiveis.length === 0 ? (
            <p
              role="status"
              className="m-0 rounded-13 border border-dashed border-border-shalon bg-elev px-4 py-6 text-center text-[14px] text-ink-2"
            >
              Nada encontrado com “{termo.trim()}”.
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {visiveis.map((o) => {
                const ativo = selecionados.includes(o.id);
                const disponivel = o.disponivel ?? true;
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      disabled={!disponivel}
                      onClick={() => aoEscolher(o.id)}
                      aria-pressed={ativo}
                      className={[
                        "motion-interactive flex min-h-[56px] w-full items-center gap-3 rounded-13 border-2 px-[14px] py-[13px] text-left transition-colors",
                        ativo ? "border-brand-red bg-td" : "border-border-shalon bg-surface",
                        disponivel
                          ? ativo
                            ? "cursor-pointer"
                            : "cursor-pointer hover:border-brand-orange"
                          : "cursor-not-allowed opacity-60",
                      ].join(" ")}
                    >
                      <span
                        aria-hidden="true"
                        className={[
                          "flex h-5 w-5 shrink-0 items-center justify-center border-2",
                          modo === "unica" ? "rounded-full" : "rounded-6",
                          ativo && modo === "multipla"
                            ? "border-brand-red bg-brand-red text-white"
                            : ativo
                              ? "border-brand-red"
                              : "border-border-shalon",
                        ].join(" ")}
                      >
                        {ativo ? (
                          modo === "unica" ? (
                            <span className="h-[10px] w-[10px] rounded-full bg-brand-red" />
                          ) : (
                            <svg viewBox="0 0 24 24" fill="none" style={{ width: 12, height: 12 }}>
                              <path
                                d="m5 12.5 4.5 4.5L19 7.5"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )
                        ) : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-semibold text-ink">
                          {o.nome}
                          {disponivel ? "" : " · indisponível hoje"}
                        </span>
                        {o.descricao ? (
                          <span className="line-clamp-2 block text-[13px] text-ink-2">{o.descricao}</span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-[14px] font-semibold tabular-nums text-ink-2">
                        {o.detalhe}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {modo === "multipla" ? (
          <footer className="shrink-0 border-t border-border-shalon px-4 pb-4 pt-3">
            {aviso ? (
              <p role="alert" className="m-0 mb-2 text-[13px] font-semibold text-tdf">
                {aviso}
              </p>
            ) : null}
            <button
              type="button"
              onClick={aoFechar}
              className="min-h-[52px] w-full cursor-pointer rounded-13 border-0 bg-cta text-[16px] font-bold text-cta-fg"
            >
              {selecionados.length === 0
                ? "Concluir"
                : `Concluir • ${selecionados.length} ${selecionados.length === 1 ? "escolhido" : "escolhidos"}`}
            </button>
          </footer>
        ) : null}
      </section>
    </div>,
    document.body,
  );
}
