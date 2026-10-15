"use client";

import { useState } from "react";
import { CampoDataHora } from "@/ui/components";

/**
 * Os sete dias numa tela só, com cópia entre eles (15/10/2026).
 *
 * Eram sete formulários, cada um com o seu "Salvar dia": configurar a semana
 * era repetir o mesmo horário sete vezes. Agora preenche-se um dia, copia-se
 * para os outros (todos, segunda a sexta, fim de semana) e salva-se uma vez.
 *
 * Fechar depois da meia-noite é válido (02 §3.2): a linha avisa "dia
 * seguinte" em vez de tratar como erro.
 */

export type DiaDeHorario = { fechado: boolean; abre: string; fecha: string };

const NOMES = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

// Índices 0 = domingo … 6 = sábado, como em `store_hours.weekday`.
const GRUPOS: { texto: string; dias: number[] }[] = [
  { texto: "Todos os dias", dias: [0, 1, 2, 3, 4, 5, 6] },
  { texto: "Segunda a sexta", dias: [1, 2, 3, 4, 5] },
  { texto: "Sábado e domingo", dias: [0, 6] },
];

export function EditorDeHorarios({
  inicial,
  somenteLeitura = false,
}: {
  inicial: DiaDeHorario[];
  somenteLeitura?: boolean;
}) {
  const [dias, setDias] = useState<DiaDeHorario[]>(inicial);
  const [copiando, setCopiando] = useState<number | null>(null);
  const [alterado, setAlterado] = useState(false);

  function mudar(i: number, parte: Partial<DiaDeHorario>) {
    setDias((atual) => atual.map((d, j) => (j === i ? { ...d, ...parte } : d)));
    setAlterado(true);
  }

  function copiar(de: number, para: number[]) {
    setDias((atual) => {
      const origem = atual[de]!;
      return atual.map((d, j) => (j !== de && para.includes(j) ? { ...origem } : d));
    });
    setAlterado(true);
    setCopiando(null);
  }

  return (
    <div className="flex flex-col">
      {/* O que vai ao servidor: um conjunto de campos por dia. */}
      {dias.map((d, i) => (
        <span key={i} hidden>
          <input type="hidden" name={`fechado_${i}`} value={d.fechado ? "sim" : "nao"} />
          <input type="hidden" name={`abre_${i}`} value={d.fechado ? "" : d.abre} />
          <input type="hidden" name={`fecha_${i}`} value={d.fechado ? "" : d.fecha} />
        </span>
      ))}

      <div className="divide-y divide-border-shalon">
        {dias.map((d, i) => {
          const viraMeiaNoite = !d.fechado && d.abre && d.fecha && d.fecha <= d.abre;
          return (
            <div key={NOMES[i]} className="flex flex-col gap-2 py-3 first:pt-1 last:pb-1">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <p className="m-0 w-[130px] shrink-0 text-[14px] font-bold text-ink">{NOMES[i]}</p>

                <label className="flex min-h-touch shrink-0 cursor-pointer items-center gap-2 text-[13.5px] font-semibold text-ink">
                  <input
                    type="checkbox"
                    checked={!d.fechado}
                    disabled={somenteLeitura}
                    onChange={(e) => mudar(i, { fechado: !e.target.checked })}
                    className="h-5 w-5 accent-[var(--brand-orange)]"
                  />
                  {d.fechado ? "Fechado" : "Aberto"}
                </label>

                {d.fechado ? (
                  <p className="m-0 text-[13px] text-muted">Sem atendimento neste dia.</p>
                ) : (
                  <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:max-w-[360px]">
                    <CampoDataHora
                      label="Abre"
                      modo="hora"
                      valor={d.abre}
                      aoMudar={(v) => mudar(i, { abre: v })}
                    />
                    <CampoDataHora
                      label="Fecha"
                      modo="hora"
                      valor={d.fecha}
                      aoMudar={(v) => mudar(i, { fecha: v })}
                    />
                  </div>
                )}

                {!somenteLeitura ? (
                  <button
                    type="button"
                    onClick={() => setCopiando(copiando === i ? null : i)}
                    aria-expanded={copiando === i}
                    className="ml-auto min-h-[40px] cursor-pointer rounded-10 border-[1.5px] border-border-shalon bg-transparent px-3 text-[13px] font-semibold text-ink hover:border-brand-orange"
                  >
                    Copiar para…
                  </button>
                ) : null}
              </div>

              {viraMeiaNoite ? (
                <p className="m-0 text-[12.5px] text-muted">
                  Fecha às {d.fecha}, já no dia seguinte.
                </p>
              ) : null}

              {copiando === i ? (
                <div
                  role="group"
                  aria-label={`Copiar o horário de ${NOMES[i]} para`}
                  className="flex flex-wrap items-center gap-2 rounded-12 bg-elev px-3 py-2"
                >
                  <span className="text-[13px] text-ink-2">
                    Usar o horário de {NOMES[i]} em:
                  </span>
                  {GRUPOS.map((g) => (
                    <button
                      key={g.texto}
                      type="button"
                      onClick={() => copiar(i, g.dias)}
                      className="min-h-[40px] cursor-pointer rounded-pill border-[1.5px] border-border-shalon bg-surface px-3 text-[13px] font-semibold text-ink hover:border-brand-orange"
                    >
                      {g.texto}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {alterado ? (
        <p role="status" className="m-0 mt-3 text-[13px] font-semibold text-ink">
          Alterações ainda não salvas.
        </p>
      ) : null}
    </div>
  );
}
