"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePopoverFixo } from "@/ui/hooks/usePopoverFixo";

/**
 * Data, data e hora, ou hora — no tema do sistema, no lugar do seletor do
 * navegador (que não aceita as cores da Shalon).
 *
 * O VALOR É O MESMO DO CAMPO NATIVO, para nada mudar no servidor:
 *   data      "AAAA-MM-DD"
 *   dataHora  "AAAA-MM-DDTHH:mm"
 *   hora      "HH:mm"
 * É hora de parede, sem fuso — exatamente como o `<input type="datetime-local">`.
 *
 * Funciona como o `SelectMenu`: controlado (`valor` + `aoMudar`) ou num
 * formulário de server action (`name` + `valorInicial`, volta ao inicial
 * quando o formulário é reiniciado). `required` participa da validação do
 * navegador. O painel abre num portal, acima de modais.
 */

type Modo = "data" | "dataHora" | "hora";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const DIAS_DA_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];
const HORAS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTOS = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

const dois = (n: number) => String(n).padStart(2, "0");

type Partes = { data: string | null; hora: string | null };

function separar(valor: string, modo: Modo): Partes {
  if (!valor) return { data: null, hora: null };
  if (modo === "hora") return { data: null, hora: /^\d{2}:\d{2}/.test(valor) ? valor.slice(0, 5) : null };
  const [data, hora] = valor.split("T");
  return {
    data: data && /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : null,
    hora: hora && /^\d{2}:\d{2}/.test(hora) ? hora.slice(0, 5) : null,
  };
}

function juntar(partes: Partes, modo: Modo): string {
  if (modo === "hora") return partes.hora ?? "";
  if (modo === "data") return partes.data ?? "";
  if (!partes.data) return "";
  return `${partes.data}T${partes.hora ?? "00:00"}`;
}

function exibir(valor: string, modo: Modo): string | null {
  const { data, hora } = separar(valor, modo);
  if (modo === "hora") return hora;
  if (!data) return null;
  const [a, m, d] = data.split("-");
  const texto = `${d}/${m}/${a}`;
  return modo === "dataHora" ? `${texto}, ${hora ?? "00:00"}` : texto;
}

function hojeISO(): string {
  const h = new Date();
  return `${h.getFullYear()}-${dois(h.getMonth() + 1)}-${dois(h.getDate())}`;
}

/** As 42 casas do mês (6 semanas), começando no domingo. */
function casasDoMes(ano: number, mes: number): { iso: string; dia: number; doMes: boolean }[] {
  const primeiro = new Date(ano, mes, 1);
  const inicio = new Date(ano, mes, 1 - primeiro.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i);
    return {
      iso: `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`,
      dia: d.getDate(),
      doMes: d.getMonth() === mes,
    };
  });
}

const PLACEHOLDER: Record<Modo, string> = {
  data: "dd/mm/aaaa",
  dataHora: "dd/mm/aaaa, --:--",
  hora: "--:--",
};

export function CampoDataHora({
  label,
  name,
  modo = "data",
  valor,
  valorInicial = "",
  aoMudar,
  required = false,
  hint,
}: {
  label: string;
  name?: string;
  modo?: Modo;
  valor?: string;
  valorInicial?: string;
  aoMudar?: (valor: string) => void;
  required?: boolean;
  hint?: string;
}) {
  const idBase = useId().replace(/:/g, "");
  const botaoId = `campo-data-${idBase}`;
  const painelId = `${botaoId}-painel`;
  const hintId = hint ? `${botaoId}-hint` : undefined;

  const raizRef = useRef<HTMLDivElement>(null);
  const botaoRef = useRef<HTMLButtonElement>(null);
  const painelRef = useRef<HTMLDivElement>(null);

  const controlado = valor !== undefined;
  const [interno, setInterno] = useState(valorInicial);
  const atual = controlado ? valor : interno;
  const partes = separar(atual, modo);

  const [aberto, setAberto] = useState(false);
  const base = partes.data ?? hojeISO();
  const [mesVisivel, setMesVisivel] = useState({
    ano: Number(base.slice(0, 4)),
    mes: Number(base.slice(5, 7)) - 1,
  });

  const largura = modo === "dataHora" ? 412 : modo === "hora" ? 176 : 300;
  const posicao = usePopoverFixo(botaoRef, aberto, largura, 380, "inicio");
  // O painel é alto: se não couber embaixo, abre em cima; se não couber em
  // lugar nenhum, encosta na borda da tela. Medido depois de desenhar.
  const [topoAjustado, setTopoAjustado] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!aberto || !posicao) return;
    const painel = painelRef.current;
    const campo = botaoRef.current?.getBoundingClientRect();
    if (!painel || !campo) return;
    const altura = painel.offsetHeight;
    const margem = 8;
    let topo = campo.bottom + 4;
    if (topo + altura > window.innerHeight - margem) {
      const emCima = campo.top - 4 - altura;
      topo = emCima >= margem ? emCima : Math.max(margem, window.innerHeight - margem - altura);
    }
    setTopoAjustado(topo);
  }, [aberto, posicao]);

  function mudar(novo: string) {
    if (!controlado) setInterno(novo);
    aoMudar?.(novo);
  }

  // O formulário reiniciado depois da action volta ao valor inicial.
  useEffect(() => {
    if (controlado) return;
    const formulario = raizRef.current?.closest("form");
    if (!formulario) return;
    const reiniciar = () => setInterno(valorInicial);
    formulario.addEventListener("reset", reiniciar);
    return () => formulario.removeEventListener("reset", reiniciar);
  }, [controlado, valorInicial]);

  useEffect(() => {
    if (!aberto) return;
    function fora(evento: MouseEvent) {
      const alvo = evento.target as Node;
      if (!raizRef.current?.contains(alvo) && !painelRef.current?.contains(alvo)) setAberto(false);
    }
    function escape(evento: KeyboardEvent) {
      if (evento.key !== "Escape") return;
      setAberto(false);
      botaoRef.current?.focus();
    }
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", escape);
    };
  }, [aberto]);

  // A hora escolhida fica à vista nas colunas.
  useEffect(() => {
    if (!aberto || modo === "data") return;
    // Sem hora escolhida, as colunas abrem na hora de agora.
    const alvos = painelRef.current?.querySelectorAll<HTMLElement>('[data-hora-escolhida="true"]');
    const lista = alvos && alvos.length > 0
      ? Array.from(alvos)
      : Array.from(painelRef.current?.querySelectorAll<HTMLElement>('[data-hora-agora="true"]') ?? []);
    lista.forEach((el) => {
      const coluna = el.parentElement;
      if (coluna) coluna.scrollTop = el.offsetTop - coluna.clientHeight / 2 + el.clientHeight / 2;
    });
    // Só depois de o painel estar posicionado — antes disso ele nem existe.
  }, [aberto, modo, topoAjustado]);

  function abrir() {
    setTopoAjustado(null);
    const ref = partes.data ?? hojeISO();
    setMesVisivel({ ano: Number(ref.slice(0, 4)), mes: Number(ref.slice(5, 7)) - 1 });
    setAberto(true);
  }

  function fechar() {
    setAberto(false);
    botaoRef.current?.focus();
  }

  function escolherDia(iso: string) {
    mudar(juntar({ data: iso, hora: partes.hora }, modo));
    if (modo === "data") fechar();
  }

  function escolherHora(h: string | null, m: string | null) {
    const [hAtual, mAtual] = (partes.hora ?? "00:00").split(":");
    const hora = `${h ?? hAtual}:${m ?? mAtual}`;
    // Data e hora sem dia escolhido: a hora vale para hoje.
    mudar(juntar({ data: partes.data ?? (modo === "dataHora" ? hojeISO() : null), hora }, modo));
  }

  function mesAnterior() {
    setMesVisivel(({ ano, mes }) => (mes === 0 ? { ano: ano - 1, mes: 11 } : { ano, mes: mes - 1 }));
  }
  function mesSeguinte() {
    setMesVisivel(({ ano, mes }) => (mes === 11 ? { ano: ano + 1, mes: 0 } : { ano, mes: mes + 1 }));
  }

  const texto = exibir(atual, modo);
  const hoje = hojeISO();
  const [horaEscolhida, minutoEscolhido] = partes.hora ? partes.hora.split(":") : [null, null];
  // Minuto fora dos passos de 5 (vindo do banco) continua visível na lista.
  const minutos =
    minutoEscolhido && !MINUTOS.includes(minutoEscolhido)
      ? [...MINUTOS, minutoEscolhido].sort()
      : MINUTOS;

  const agora = new Date();
  const agoraNaColuna = (rotulo: string) =>
    rotulo === "Hora" ? dois(agora.getHours()) : dois(Math.floor(agora.getMinutes() / 5) * 5);

  const colunaDeHora = (
    rotulo: string,
    lista: readonly string[],
    escolhido: string | null,
    aoEscolher: (v: string) => void,
  ) => (
    <div className="flex min-w-0 flex-1 flex-col">
      <p className="m-0 mb-1 text-center text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
        {rotulo}
      </p>
      <div className="scrollbar-subtle relative flex max-h-[232px] flex-col gap-1 overflow-y-auto pr-0.5">
        {lista.map((v) => {
          const ativo = v === escolhido;
          return (
            <button
              key={v}
              type="button"
              data-hora-escolhida={ativo ? "true" : undefined}
              data-hora-agora={v === agoraNaColuna(rotulo) ? "true" : undefined}
              aria-pressed={ativo}
              onClick={() => aoEscolher(v)}
              className={[
                "min-h-[34px] shrink-0 cursor-pointer rounded-10 border-0 text-[14px] font-semibold tabular-nums",
                ativo ? "bg-cta text-cta-fg" : "bg-transparent text-ink hover:bg-tn",
              ].join(" ")}
            >
              {v}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div ref={raizRef} className="relative w-full">
      {name && !required ? <input type="hidden" name={name} value={atual} /> : null}
      {name && required ? (
        <input
          tabIndex={-1}
          aria-hidden="true"
          name={name}
          value={atual}
          required
          onChange={() => undefined}
          onFocus={() => botaoRef.current?.focus()}
          className="pointer-events-none absolute bottom-0 left-1/2 h-px w-px opacity-0"
        />
      ) : null}

      <label id={`${botaoId}-label`} htmlFor={botaoId} className="mb-[6px] block text-[14px] font-semibold text-ink">
        {label}
      </label>
      <button
        ref={botaoRef}
        id={botaoId}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-controls={painelId}
        aria-describedby={hintId}
        onClick={() => (aberto ? setAberto(false) : abrir())}
        className={[
          "motion-interactive flex min-h-[50px] w-full cursor-pointer items-center justify-between gap-3",
          "rounded-12 border-[1.5px] bg-surface px-[14px] py-[12px] text-left text-[16px] transition-colors focus:outline-none",
          texto ? "text-ink" : "text-muted",
          aberto ? "border-brand-orange" : "border-border-shalon hover:border-brand-orange focus:border-brand-orange",
        ].join(" ")}
      >
        <span className="tabular-nums">{texto ?? PLACEHOLDER[modo]}</span>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-muted" fill="none">
          {modo === "hora" ? (
            <>
              <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.7" />
              <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </>
          ) : (
            <>
              <rect x="3.5" y="5" width="17" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
              <path d="M3.5 9.5h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </>
          )}
        </svg>
      </button>

      {aberto && posicao
        ? createPortal(
            <div
              ref={painelRef}
              id={painelId}
              role="dialog"
              aria-labelledby={`${botaoId}-label`}
              style={{
                top: topoAjustado ?? posicao.top,
                left: posicao.left,
                width: largura,
                visibility: topoAjustado === null ? "hidden" : "visible",
              }}
              // O foco fica no campo: clicar no painel não o fecha por perda de foco.
              onMouseDown={(e) => e.preventDefault()}
              className="motion-popover-in fixed z-[100] flex gap-3 rounded-14 border border-border-shalon bg-surface p-3 shadow-[0_16px_42px_rgb(30_24_20/0.22)]"
            >
              {modo !== "hora" ? (
                <div className="w-[276px] shrink-0">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="m-0 text-[14.5px] font-bold text-ink">
                      {MESES[mesVisivel.mes]} de {mesVisivel.ano}
                    </p>
                    <div className="flex gap-1">
                      {[
                        { rotulo: "Mês anterior", acao: mesAnterior, d: "m12.5 5-5 5 5 5" },
                        { rotulo: "Próximo mês", acao: mesSeguinte, d: "m7.5 5 5 5-5 5" },
                      ].map((b) => (
                        <button
                          key={b.rotulo}
                          type="button"
                          aria-label={b.rotulo}
                          onClick={b.acao}
                          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-10 border-0 bg-transparent text-ink-2 hover:bg-tn"
                        >
                          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4" fill="none">
                            <path d={b.d} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-7 gap-0.5 text-center">
                    {DIAS_DA_SEMANA.map((d, i) => (
                      <span key={i} className="py-1 text-[11px] font-bold text-muted">
                        {d}
                      </span>
                    ))}
                    {casasDoMes(mesVisivel.ano, mesVisivel.mes).map((c) => {
                      const escolhido = c.iso === partes.data;
                      const ehHoje = c.iso === hoje;
                      return (
                        <button
                          key={c.iso}
                          type="button"
                          aria-pressed={escolhido}
                          aria-label={`${c.dia} de ${MESES[Number(c.iso.slice(5, 7)) - 1]?.toLowerCase()}`}
                          onClick={() => escolherDia(c.iso)}
                          className={[
                            "flex h-[36px] cursor-pointer items-center justify-center rounded-10 border-[1.5px] text-[13.5px] font-semibold tabular-nums",
                            escolhido
                              ? "border-cta bg-cta text-cta-fg"
                              : ehHoje
                                ? "border-brand-orange bg-transparent text-ink hover:bg-tn"
                                : "border-transparent bg-transparent hover:bg-tn",
                            !escolhido && !c.doMes ? "text-muted" : !escolhido ? "text-ink" : "",
                          ].join(" ")}
                        >
                          {c.dia}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-2 flex items-center justify-between border-t border-border-shalon pt-2">
                    <button
                      type="button"
                      onClick={() => mudar("")}
                      className="min-h-[34px] cursor-pointer rounded-10 border-0 bg-transparent px-2 text-[13px] font-semibold text-ink-2 hover:bg-tn"
                    >
                      Limpar
                    </button>
                    <button
                      type="button"
                      onClick={() => escolherDia(hoje)}
                      className="min-h-[34px] cursor-pointer rounded-10 border-0 bg-transparent px-2 text-[13px] font-semibold text-ink-2 hover:bg-tn"
                    >
                      Hoje
                    </button>
                    {modo === "dataHora" ? (
                      <button
                        type="button"
                        onClick={fechar}
                        className="min-h-[34px] cursor-pointer rounded-10 border-0 bg-cta px-3 text-[13px] font-bold text-cta-fg"
                      >
                        OK
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {modo !== "data" ? (
                <div className={["flex min-w-0 flex-1 gap-2", modo === "dataHora" ? "border-l border-border-shalon pl-3" : ""].join(" ")}>
                  {colunaDeHora("Hora", HORAS, horaEscolhida, (h) => escolherHora(h, null))}
                  {colunaDeHora("Min", minutos, minutoEscolhido, (m) => escolherHora(null, m))}
                </div>
              ) : null}
            </div>,
            document.body,
          )
        : null}

      {hint ? (
        <p id={hintId} className="mt-[6px] text-[12px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
