"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  buscarReferencias,
  concluirNota,
  criarNota,
  excluirNota,
  listarNotas,
  type NotaRapida,
  type ReferenciaDaNota,
  type TipoDeReferencia,
} from "@/application/notas/acoes";

/**
 * Bloco de notas rápido na topbar (D-2026-10-17-151).
 *
 * Compartilhado com a equipe: a nota que a balconista escreve aparece para
 * a dona em outro aparelho. Cada nota pode apontar para um pedido, cliente ou
 * produto, com link. Concluir tira da lista sem apagar; excluir é só de quem
 * escreveu.
 */

const TIPOS: Record<TipoDeReferencia, { nome: string; href: (id: string) => string }> = {
  order: { nome: "Pedido", href: (id) => `/admin/pedidos/${id}` },
  customer: { nome: "Cliente", href: (id) => `/admin/clientes/${id}` },
  product: { nome: "Produto", href: (id) => `/admin/produtos/${id}` },
};

const quando = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function IconeDoTipo({ tipo }: { tipo: TipoDeReferencia }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-[14px] shrink-0">
      {tipo === "order" ? (
        <>
          <path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z" />
          <path d="M9 8h6M9 12h6" />
        </>
      ) : tipo === "customer" ? (
        <>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </>
      ) : (
        <>
          <path d="M12 3 3 20h18Z" />
          <circle cx="11" cy="14" r="1" />
          <circle cx="14" cy="11" r="1" />
        </>
      )}
    </svg>
  );
}

function ChipDaReferencia({
  referencia,
  aoRemover,
  link = false,
}: {
  referencia: ReferenciaDaNota;
  aoRemover?: () => void;
  link?: boolean;
}) {
  const conteudo = (
    <>
      <IconeDoTipo tipo={referencia.tipo} />
      <span className="truncate">{referencia.rotulo}</span>
    </>
  );
  const classe =
    "inline-flex max-w-full items-center gap-1.5 rounded-pill border border-border-shalon bg-elev px-2.5 py-1 text-[12px] font-semibold text-ink";
  if (link) {
    return (
      <Link href={TIPOS[referencia.tipo].href(referencia.id)} title={`Abrir ${TIPOS[referencia.tipo].nome.toLowerCase()}`} className={`${classe} no-underline hover:border-brand-orange`}>
        {conteudo}
      </Link>
    );
  }
  return (
    <span className={classe}>
      {conteudo}
      {aoRemover ? (
        <button
          type="button"
          onClick={aoRemover}
          aria-label="Remover referência"
          className="-mr-1 ml-0.5 flex size-5 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-[14px] leading-none text-muted hover:bg-surface hover:text-ink"
        >
          ×
        </button>
      ) : null}
    </span>
  );
}

export function NotasRapidas() {
  const raiz = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const [aberto, setAberto] = useState(false);
  const [aba, setAba] = useState<"abertas" | "concluidas">("abertas");
  const [notas, setNotas] = useState<NotaRapida[] | null>(null);
  const [abertas, setAbertas] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [referencia, setReferencia] = useState<ReferenciaDaNota | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<{ termo: string; itens: ReferenciaDaNota[] } | null>(null);
  const [salvando, iniciarSalvar] = useTransition();
  const [, iniciarAcao] = useTransition();

  async function carregar(qual: "abertas" | "concluidas") {
    const r = await listarNotas(qual === "concluidas");
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    setErro(null);
    setNotas(r.notas);
    setAbertas(r.abertas);
  }

  // Contagem do selo ao montar e a cada 2 min: nota nova de outra pessoa
  // aparece sem precisar abrir.
  useEffect(() => {
    let vivo = true;
    async function contar() {
      const r = await listarNotas(false);
      if (vivo && r.ok) setAbertas(r.abertas);
    }
    void contar();
    const id = window.setInterval(contar, 120_000);
    return () => {
      vivo = false;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!aberto) return;
    function aoClicar(e: MouseEvent) {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false);
    }
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }
    document.addEventListener("pointerdown", aoClicar);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("pointerdown", aoClicar);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto]);

  // Busca da referência com espera curta; o resultado só vale para o termo
  // que o gerou.
  useEffect(() => {
    const limpo = termo.trim();
    if (!buscando || !limpo) return;
    let vivo = true;
    const id = window.setTimeout(async () => {
      const itens = await buscarReferencias(limpo);
      if (vivo) setResultados({ termo: limpo, itens });
    }, 250);
    return () => {
      vivo = false;
      window.clearTimeout(id);
    };
  }, [termo, buscando]);

  function abrir() {
    const proximo = !aberto;
    setAberto(proximo);
    if (proximo) {
      setAba("abertas");
      void carregar("abertas");
      window.setTimeout(() => campo.current?.focus(), 0);
    }
  }

  function trocarAba(qual: "abertas" | "concluidas") {
    setAba(qual);
    setNotas(null);
    void carregar(qual);
  }

  function salvar() {
    if (!texto.trim() || salvando) return;
    iniciarSalvar(async () => {
      const r = await criarNota({
        texto,
        referencia: referencia ? { tipo: referencia.tipo, id: referencia.id } : null,
      });
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setErro(null);
      setTexto("");
      setReferencia(null);
      setBuscando(false);
      setTermo("");
      setResultados(null);
      if (aba === "abertas") setNotas((atual) => [r.nota, ...(atual ?? [])]);
      setAbertas((n) => n + 1);
      campo.current?.focus();
    });
  }

  function alternarConcluida(nota: NotaRapida) {
    const concluir = nota.concluida_em === null;
    iniciarAcao(async () => {
      const r = await concluirNota(nota.id, concluir);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setNotas((atual) => (atual ?? []).filter((n) => n.id !== nota.id));
      setAbertas((n) => Math.max(0, n + (concluir ? -1 : 1)));
    });
  }

  function excluir(nota: NotaRapida) {
    if (!window.confirm("Excluir esta anotação?")) return;
    iniciarAcao(async () => {
      const r = await excluirNota(nota.id);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setNotas((atual) => (atual ?? []).filter((n) => n.id !== nota.id));
      if (nota.concluida_em === null) setAbertas((n) => Math.max(0, n - 1));
    });
  }

  const termoLimpo = termo.trim();
  const itensDaBusca = resultados && resultados.termo === termoLimpo ? resultados.itens : null;

  return (
    <div ref={raiz} className="relative shrink-0">
      <button
        type="button"
        onClick={abrir}
        aria-expanded={aberto}
        aria-label={abertas > 0 ? `Anotações rápidas: ${abertas} em aberto` : "Anotações rápidas"}
        title="Anotações rápidas"
        className="motion-interactive relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-12 border border-border-shalon bg-surface text-ink transition-colors hover:border-brand-orange hover:bg-elev sm:h-touch sm:w-touch"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[17px] w-[17px] sm:h-5 sm:w-5">
          <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" />
          <path d="M14 3v6h6M8 13h8M8 17h5" />
        </svg>
        {abertas > 0 ? (
          <span className="absolute -right-1 -top-1 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand-orange px-1 text-[10px] font-bold text-white">
            {abertas > 99 ? "99+" : abertas}
          </span>
        ) : null}
      </button>

      {aberto ? (
        <div
          role="dialog"
          aria-label="Anotações rápidas"
          className="motion-popover-in fixed inset-x-2 top-[60px] z-60 overflow-hidden rounded-16 border border-border-shalon bg-surface shadow-[0_18px_50px_rgb(30_24_20/0.2)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+8px)] sm:w-[400px]"
        >
          <div className="border-b border-border-shalon p-3">
            <h2 className="m-0 mb-2 text-[15px] font-bold text-ink">Anotações rápidas</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                salvar();
              }}
            >
              <label htmlFor="nota-rapida" className="sr-only">
                Nova anotação
              </label>
              <textarea
                ref={campo}
                id="nota-rapida"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    salvar();
                  }
                }}
                rows={3}
                maxLength={1000}
                placeholder="Anotar… ex.: cliente pediu para ligar antes de sair"
                className="w-full resize-y rounded-11 border-[1.5px] border-border-shalon bg-surface px-3 py-2 text-[14px] text-ink focus:border-brand-orange focus:outline-none"
              />

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {referencia ? (
                  <ChipDaReferencia referencia={referencia} aoRemover={() => setReferencia(null)} />
                ) : buscando ? null : (
                  <button
                    type="button"
                    onClick={() => setBuscando(true)}
                    className="min-h-[36px] cursor-pointer rounded-10 border border-dashed border-border-shalon bg-transparent px-2.5 text-[12.5px] font-semibold text-ink-2 hover:border-brand-orange hover:text-ink"
                  >
                    + Referenciar pedido, cliente ou produto
                  </button>
                )}
                <button
                  type="submit"
                  disabled={!texto.trim() || salvando}
                  className="ml-auto min-h-[36px] cursor-pointer rounded-10 border-0 bg-cta px-3.5 text-[13px] font-semibold text-cta-fg disabled:cursor-not-allowed disabled:bg-tn disabled:text-muted"
                >
                  {salvando ? "Salvando…" : "Salvar"}
                </button>
              </div>

              {buscando && !referencia ? (
                <div className="mt-2 rounded-11 border border-border-shalon bg-bg p-2">
                  <div className="flex items-center gap-2">
                    <label htmlFor="nota-referencia" className="sr-only">
                      Buscar pedido, cliente ou produto
                    </label>
                    <input
                      id="nota-referencia"
                      autoFocus
                      value={termo}
                      onChange={(e) => setTermo(e.target.value)}
                      placeholder="Nº do pedido, nome do cliente ou produto"
                      className="min-h-[36px] w-full rounded-10 border-[1.5px] border-border-shalon bg-surface px-2.5 text-[13px] text-ink focus:border-brand-orange focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setBuscando(false);
                        setTermo("");
                        setResultados(null);
                      }}
                      className="min-h-[36px] cursor-pointer rounded-10 border-0 bg-transparent px-2 text-[12.5px] font-semibold text-ink-2 hover:text-ink"
                    >
                      Cancelar
                    </button>
                  </div>
                  {termoLimpo ? (
                    <ul className="m-0 mt-1 max-h-[180px] list-none overflow-y-auto p-0">
                      {itensDaBusca === null ? (
                        <li className="px-2 py-2 text-[12.5px] text-muted">Buscando…</li>
                      ) : itensDaBusca.length === 0 ? (
                        <li className="px-2 py-2 text-[12.5px] text-muted">Nada encontrado.</li>
                      ) : (
                        itensDaBusca.map((item) => (
                          <li key={`${item.tipo}-${item.id}`}>
                            <button
                              type="button"
                              onClick={() => {
                                setReferencia(item);
                                setBuscando(false);
                                setTermo("");
                                setResultados(null);
                              }}
                              className="flex min-h-[40px] w-full cursor-pointer items-center gap-2 rounded-10 border-0 bg-transparent px-2 text-left text-[13px] text-ink hover:bg-elev"
                            >
                              <IconeDoTipo tipo={item.tipo} />
                              <span className="min-w-0 flex-1 truncate">{item.rotulo}</span>
                              <span className="shrink-0 text-[11px] text-muted">
                                {item.detalhe ?? TIPOS[item.tipo].nome}
                              </span>
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </form>
          </div>

          <div role="tablist" aria-label="Filtro das anotações" className="flex gap-1 border-b border-border-shalon px-3 py-2">
            {(["abertas", "concluidas"] as const).map((qual) => (
              <button
                key={qual}
                type="button"
                role="tab"
                aria-selected={aba === qual}
                onClick={() => trocarAba(qual)}
                className={[
                  "min-h-[32px] cursor-pointer rounded-pill border-0 px-3 text-[12.5px] font-semibold",
                  aba === qual ? "bg-cta text-cta-fg" : "bg-transparent text-ink-2 hover:bg-elev",
                ].join(" ")}
              >
                {qual === "abertas" ? `Em aberto${abertas > 0 ? ` (${abertas})` : ""}` : "Concluídas"}
              </button>
            ))}
          </div>

          {erro ? (
            <p role="alert" className="m-0 mx-3 mt-2 rounded-10 bg-td px-3 py-2 text-[12.5px] font-semibold text-tdf">
              {erro}
            </p>
          ) : null}

          <ul className="scrollbar-subtle m-0 max-h-[min(380px,50vh)] list-none overflow-y-auto p-2">
            {notas === null ? (
              <li className="px-3 py-5 text-center text-[13px] text-muted">Carregando…</li>
            ) : notas.length === 0 ? (
              <li className="px-3 py-5 text-center text-[13px] text-muted">
                {aba === "abertas" ? "Nenhuma anotação em aberto." : "Nenhuma anotação concluída."}
              </li>
            ) : (
              notas.map((nota) => (
                <li key={nota.id} className="flex gap-2 rounded-11 px-2 py-2 hover:bg-elev">
                  <input
                    type="checkbox"
                    checked={nota.concluida_em !== null}
                    onChange={() => alternarConcluida(nota)}
                    aria-label={nota.concluida_em === null ? "Marcar como concluída" : "Reabrir anotação"}
                    className="mt-[3px] size-[18px] shrink-0 cursor-pointer accent-brand-red"
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={`m-0 whitespace-pre-wrap break-words text-[13.5px] ${nota.concluida_em ? "text-muted line-through" : "text-ink"}`}
                    >
                      {nota.texto}
                    </p>
                    {nota.referencia ? (
                      <div className="mt-1">
                        <ChipDaReferencia referencia={nota.referencia} link />
                      </div>
                    ) : null}
                    <p className="m-0 mt-1 text-[11px] text-muted">
                      {nota.autor ?? "Equipe"} · {quando.format(new Date(nota.criada_em))}
                      {nota.concluida_em
                        ? ` · concluída${nota.concluida_por ? ` por ${nota.concluida_por}` : ""}`
                        : ""}
                    </p>
                  </div>
                  {nota.minha ? (
                    <button
                      type="button"
                      onClick={() => excluir(nota)}
                      aria-label="Excluir anotação"
                      title="Excluir"
                      className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-muted hover:bg-surface hover:text-tdf"
                    >
                      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-[15px]">
                        <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                      </svg>
                    </button>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
