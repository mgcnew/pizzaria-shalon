"use client";

import { useState } from "react";
import { CampoDataHora } from "@/ui/components";

/**
 * "Quando vale" — dias da semana e período, separados e explicados (15/10/2026).
 *
 * Eram só duas datas: passou a data, refazia-se a promoção. Agora são DUAS
 * ferramentas, que se combinam, e a tela diz o que cada uma faz:
 *   · Dias da semana — a promoção se repete toda semana nos dias marcados.
 *     Nenhum marcado = todos os dias.
 *   · Período — de quando até quando ela existe. Sem fim, vale até pausar.
 * A frase no fim junta as duas, na linguagem de quem vai ler o balcão.
 */

const DIAS: { iso: number; curto: string; longo: string }[] = [
  { iso: 1, curto: "Seg", longo: "segunda" },
  { iso: 2, curto: "Ter", longo: "terça" },
  { iso: 3, curto: "Qua", longo: "quarta" },
  { iso: 4, curto: "Qui", longo: "quinta" },
  { iso: 5, curto: "Sex", longo: "sexta" },
  { iso: 6, curto: "Sáb", longo: "sábado" },
  { iso: 7, curto: "Dom", longo: "domingo" },
];

function listar(nomes: string[]): string {
  if (nomes.length <= 1) return nomes.join("");
  return `${nomes.slice(0, -1).join(", ")} e ${nomes.at(-1)}`;
}

export function QuandoValeAPromocao({
  variante = "promocao",
}: {
  /** `banner` troca os verbos: o banner "aparece", a promoção "vale". */
  variante?: "promocao" | "banner";
}) {
  const banner = variante === "banner";
  const verbo = banner ? "Aparece" : "Vale";
  const [dias, setDias] = useState<Set<number>>(new Set());
  const [temFim, setTemFim] = useState(false);

  function alternar(iso: number) {
    setDias((atual) => {
      const novo = new Set(atual);
      if (novo.has(iso)) novo.delete(iso);
      else novo.add(iso);
      return novo;
    });
  }

  const marcados = DIAS.filter((d) => dias.has(d.iso));
  const frase =
    marcados.length === 0 || marcados.length === 7
      ? `${verbo} todos os dias`
      : `${verbo} toda ${listar(marcados.map((d) => d.longo))}`.replace(
          /toda (.*)$/,
          (_t, resto: string) =>
            marcados.every((d) => d.iso === 6 || d.iso === 7)
              ? `todo ${resto}`
              : `toda ${resto}`,
        );

  const atalhos: { texto: string; dias: number[] }[] = [
    { texto: "Todos os dias", dias: [] },
    { texto: "Segunda a sexta", dias: [1, 2, 3, 4, 5] },
    { texto: "Fim de semana", dias: [6, 7] },
  ];

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="mb-1 p-0 text-[14px] font-bold text-ink">Dias da semana</legend>
        <p className="m-0 mb-2 text-[12.5px] text-muted">
          {banner ? "O banner" : "A promoção"} se repete toda semana nos dias marcados — não precisa
          refazer. Sem nenhum dia marcado, {banner ? "aparece" : "vale"} todos os dias.
        </p>
        <div className="flex flex-wrap gap-2">
          {DIAS.map((d) => {
            const ativo = dias.has(d.iso);
            return (
              <label
                key={d.iso}
                className={[
                  "flex min-h-[44px] min-w-[52px] cursor-pointer items-center justify-center rounded-pill border-[1.5px] px-3 text-[14px] font-semibold",
                  ativo
                    ? "border-brand-red bg-td text-tdf"
                    : "border-border-shalon bg-surface text-ink",
                ].join(" ")}
              >
                <input
                  type="checkbox"
                  name="dia"
                  value={d.iso}
                  checked={ativo}
                  onChange={() => alternar(d.iso)}
                  className="sr-only"
                />
                {d.curto}
              </label>
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {atalhos.map((a) => (
            <button
              key={a.texto}
              type="button"
              onClick={() => setDias(new Set(a.dias))}
              className="cursor-pointer border-0 bg-transparent p-0 py-1 text-[13px] font-semibold text-brand-red"
            >
              {a.texto}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="mb-1 p-0 text-[14px] font-bold text-ink">Período</legend>
        <p className="m-0 mb-2 text-[12.5px] text-muted">
          De quando até quando {banner ? "o banner existe" : "a promoção existe"}. Fora deste período{" "}
          {banner ? "ele não aparece" : "ela não vale"}, mesmo nos dias marcados.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <CampoDataHora
            label={banner ? "Aparece a partir de" : "Começa em"}
            name="inicio"
            modo="dataHora"
            hint={banner ? "Em branco: aparece agora." : "Em branco: começa agora."}
          />
          {temFim ? (
            <CampoDataHora label={banner ? "Sai do ar em" : "Termina em"} name="fim" modo="dataHora" />
          ) : (
            <div className="flex flex-col justify-end">
              <p className="m-0 mb-1 text-[13px] text-ink">Sem data para acabar.</p>
              <button
                type="button"
                onClick={() => setTemFim(true)}
                className="cursor-pointer self-start border-0 bg-transparent p-0 py-1 text-[13px] font-semibold text-brand-red"
              >
                Definir uma data de término
              </button>
            </div>
          )}
        </div>
        {temFim ? (
          <button
            type="button"
            onClick={() => setTemFim(false)}
            className="mt-1 cursor-pointer border-0 bg-transparent p-0 py-1 text-[13px] font-semibold text-brand-red"
          >
            Remover data de término
          </button>
        ) : null}
      </fieldset>

      <p
        role="status"
        className="m-0 rounded-12 border border-border-shalon bg-elev px-3 py-[10px] text-[13.5px] text-ink"
      >
        <span className="font-semibold">{frase}</span>
        {temFim
          ? ", dentro do período escolhido."
          : ", sem data para acabar. Você pode pausar quando quiser."}
      </p>
    </div>
  );
}
