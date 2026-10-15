"use client";

import Form from "next/form";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { SelectMenu } from "@/ui/components";
import { IndicadorDeNavegacao, MarcaDeEspera } from "@/ui/components/IndicadorDeNavegacao";
import { useFecharAoNavegar } from "@/ui/hooks/useFecharAoNavegar";

/** O endereço que o `next/form` vai montar: os campos, na ordem do DOM. */
function destinoDoFormulario(formulario: HTMLFormElement) {
  const parametros = new URLSearchParams();
  for (const [nome, valor] of new FormData(formulario)) {
    if (typeof valor === "string") parametros.append(nome, valor);
  }
  return `${new URL(formulario.action).pathname}?${parametros.toString()}`;
}

type CategoriaFiltro = { id: string; nome: string };

export function FiltrosProdutos({
  busca,
  categoria,
  situacao,
  categorias,
}: {
  busca: string;
  categoria: string;
  situacao: string;
  categorias: readonly CategoriaFiltro[];
}) {
  const [aberto, setAberto] = useState(false);
  /**
   * Busca e filtros mudam só a query: não há skeleton de rota, e o `next/form`
   * navega com `router.push`, fora do alcance de `useFormStatus`. Por isso a
   * espera é estado local, que termina quando a URL muda.
   */
  const [aplicando, setAplicando] = useState(false);
  const aoClicarEmLink = useFecharAoNavegar(() => {
    setAberto(false);
    setAplicando(false);
  });
  const [categoriaSelecionada, setCategoriaSelecionada] = useState(categoria);
  const [situacaoSelecionada, setSituacaoSelecionada] = useState(situacao);
  const filtrosRef = useRef<HTMLDivElement>(null);
  const quantidadeAtivos = Number(Boolean(categoria)) + Number(Boolean(situacao));
  const hrefLimpar = busca
    ? `/admin/produtos?busca=${encodeURIComponent(busca)}`
    : "/admin/produtos";

  useEffect(() => {
    if (!aberto) return;

    function fecharAoClicarFora(evento: PointerEvent) {
      const alvo = evento.target as Element;
      // A lista de opções do SelectMenu é desenhada fora deste painel (portal):
      // tocar numa opção NÃO é clicar fora, e fechar aqui descartava o filtro.
      if (alvo.closest?.('[role="listbox"]')) return;
      if (!filtrosRef.current?.contains(alvo)) setAberto(false);
    }

    function fecharComEscape(evento: KeyboardEvent) {
      if (evento.key === "Escape") setAberto(false);
    }

    document.addEventListener("pointerdown", fecharAoClicarFora);
    document.addEventListener("keydown", fecharComEscape);
    return () => {
      document.removeEventListener("pointerdown", fecharAoClicarFora);
      document.removeEventListener("keydown", fecharComEscape);
    };
  }, [aberto]);

  return (
    <Form
      action="/admin/produtos"
      onSubmit={(evento: FormEvent<HTMLFormElement>) => {
        // Enviar o que já está na tela não muda a URL e, portanto, nunca
        // encerraria a espera.
        if (destinoDoFormulario(evento.currentTarget) === `${location.pathname}${location.search}`) {
          setAberto(false);
          return;
        }
        setAplicando(true);
      }}
      className="mb-[14px] flex items-center gap-[10px]"
    >
      <input type="hidden" name="aba" value="produtos" />

      <div className="motion-interactive relative flex min-h-[48px] min-w-0 flex-1 items-center gap-[10px] rounded-12 border-[1.5px] border-border-shalon bg-surface px-[14px] transition-colors focus-within:border-brand-orange">
        <MarcaDeEspera pendente={aplicando} forma="traco" />
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="19"
          height="19"
          className="h-[19px] w-[19px] shrink-0 text-muted"
        >
          <circle cx="10.7" cy="10.7" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="m15.3 15.3 4.1 4.1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <label htmlFor="busca-produto" className="sr-only">
          Buscar produto ou categoria
        </label>
        <input
          id="busca-produto"
          type="search"
          name="busca"
          defaultValue={busca}
          placeholder="Buscar produto ou categoria"
          enterKeyHint="search"
          className="min-h-[46px] min-w-0 flex-1 border-0 bg-transparent text-[15px] text-ink outline-none placeholder:text-muted"
        />
      </div>

      <div ref={filtrosRef} className="relative z-10 shrink-0">
        <button
          type="button"
          aria-label="Filtrar produtos"
          aria-haspopup="dialog"
          aria-expanded={aberto}
          aria-controls="painel-filtros-produtos"
          onClick={() => {
            if (!aberto) {
              setCategoriaSelecionada(categoria);
              setSituacaoSelecionada(situacao);
            }
            setAberto((valor) => !valor);
          }}
          className={[
            "motion-interactive inline-flex min-h-[48px] cursor-pointer items-center gap-2 rounded-12 border-[1.5px] px-[14px] text-[14px] font-semibold transition-colors",
            aberto || quantidadeAtivos > 0
              ? "border-brand-orange bg-elev text-ink"
              : "border-border-shalon bg-surface text-ink hover:border-brand-orange",
          ].join(" ")}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" className="h-[18px] w-[18px]">
            <path d="M4 6h16M7 12h10M10 18h4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          </svg>
          <span className="hidden sm:inline">Filtrar</span>
          {quantidadeAtivos > 0 ? (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-pill bg-brand-orange px-1 text-[11px] font-bold text-white">
              {quantidadeAtivos}
            </span>
          ) : null}
        </button>

        <div
          id="painel-filtros-produtos"
          role="dialog"
          aria-label="Filtros de produtos"
          hidden={!aberto}
          className={[
            "absolute right-0 top-[calc(100%+8px)] w-[min(340px,calc(100vw-32px))] rounded-14 border border-border-shalon bg-surface p-4 shadow-[0_16px_42px_rgb(30_24_20/0.16)]",
            aberto ? "motion-popover-in" : "",
          ].join(" ")}
        >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="m-0 text-[15px] font-bold text-ink">Filtrar produtos</p>
                <p className="mb-0 mt-0.5 text-[12px] text-muted">
                  Refine por categoria e disponibilidade.
                </p>
              </div>
              {quantidadeAtivos > 0 ? (
                <Link
                  href={hrefLimpar}
                  onClick={aoClicarEmLink}
                  className="motion-interactive relative inline-flex min-h-[34px] items-center px-1 text-[12px] font-semibold text-brand-red transition-colors hover:text-danger"
                >
                  Limpar
                  <IndicadorDeNavegacao forma="traco" className="!inset-x-1 !bottom-1" />
                </Link>
              ) : null}
            </div>

            <div className="grid gap-3">
              <SelectMenu
                name="categoria"
                label="Categoria"
                valor={categoriaSelecionada}
                aoMudar={setCategoriaSelecionada}
                opcoes={[
                  { valor: "", texto: "Todas as categorias" },
                  ...categorias.map((item) => ({ valor: item.id, texto: item.nome })),
                ]}
              />

              <SelectMenu
                name="situacao"
                label="Status"
                valor={situacaoSelecionada}
                aoMudar={setSituacaoSelecionada}
                opcoes={[
                  { valor: "", texto: "Qualquer status" },
                  { valor: "disponivel", texto: "Disponíveis" },
                  { valor: "indisponivel", texto: "Indisponíveis" },
                  { valor: "hoje", texto: "Indisponíveis hoje" },
                  { valor: "inativo", texto: "Inativos" },
                  { valor: "promo", texto: "Em promoção" },
                ]}
              />
            </div>

            <button
              type="submit"
              aria-busy={aplicando || undefined}
              className="motion-interactive relative mt-4 inline-flex min-h-touch w-full cursor-pointer items-center justify-center rounded-11 bg-cta px-4 text-[14px] font-bold text-cta-fg transition-opacity hover:opacity-90"
            >
              Aplicar filtros
              <MarcaDeEspera pendente={aplicando} forma="traco" tom="texto" />
            </button>
        </div>
      </div>
    </Form>
  );
}
