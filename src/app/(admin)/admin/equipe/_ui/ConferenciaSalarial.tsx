"use client";

import { useState } from "react";
import type {
  LancamentoParaConferencia,
  ReferenciaSalarial,
} from "@/application/equipe/tipos";
import { formatBRL } from "@/lib/format";
import { calcularPrevisaoDePagamento } from "@/domain/equipe/conferencia";
import { Input, SelectMenu } from "@/ui/components";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const ROTULOS: Record<LancamentoParaConferencia["tipo"], string> = {
  advance: "Vale / adiantamento",
  consumption: "Consumo",
  discrepancy: "Diferença de acerto",
  adjustment: "Ajuste",
  other: "Outro lançamento",
};

export function ConferenciaSalarial({
  referencia,
  lancamentos,
  mes,
  aoMudarMes,
  disponivel,
}: {
  referencia: ReferenciaSalarial | null;
  lancamentos: LancamentoParaConferencia[] | null;
  mes: string;
  aoMudarMes: (mes: string) => void;
  disponivel: boolean;
}) {
  const [dias, setDias] = useState("");
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const anoSelecionado = Number(mes.slice(0, 4));
  const mesSelecionado = mes.slice(5, 7);
  const anos = Array.from({ length: 11 }, (_, indice) => anoSelecionado - 5 + indice);
  const diaria = referencia?.base === "daily";
  const diasValidos = /^\d{1,3}$/.test(dias) ? Number(dias) : 0;
  const previsao = referencia?.valor == null
    ? null
    : calcularPrevisaoDePagamento({
        valorReferencia: referencia.valor,
        base: referencia.base,
        diarias: diasValidos,
        lancamentos: lancamentos ?? [],
        selecionados,
      });

  return (
    <section className="mt-4 rounded-14 border border-border-shalon bg-elev p-4 sm:p-5" aria-label="Conferência de pagamento">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="m-0 font-display text-[17px] font-bold text-ink">Conferência de pagamento</h3>
          <p className="m-0 mt-1 text-[12.5px] text-muted">
            Simulação com o salário combinado atual. Não registra pagamento nem aplica desconto.
          </p>
        </div>
        <fieldset className="m-0 w-full min-w-0 border-0 p-0 sm:w-[290px] sm:shrink-0">
          <legend className="mb-1.5 text-[13px] font-semibold text-ink">
            Mês de referência do pagamento
          </legend>
          <div className="grid grid-cols-[minmax(0,1fr)_105px] gap-2">
            <SelectMenu
              label="Mês"
              valor={mesSelecionado}
              aoMudar={(valor) => aoMudarMes(`${anoSelecionado}-${valor}`)}
              opcoes={MESES.map((nome, indice) => ({
                valor: String(indice + 1).padStart(2, "0"),
                texto: nome,
              }))}
            />
            <SelectMenu
              label="Ano"
              valor={String(anoSelecionado)}
              aoMudar={(valor) => aoMudarMes(`${valor}-${mesSelecionado}`)}
              opcoes={anos.map((ano) => ({ valor: String(ano), texto: String(ano) }))}
            />
          </div>
        </fieldset>
      </div>

      {!disponivel ? (
        <p role="alert" className="m-0 mt-4 rounded-11 border border-tdb bg-td p-3 text-[13px] text-tdf">
          Não foi possível carregar os dados da conferência. Tente novamente.
        </p>
      ) : referencia?.valor == null ? (
        <p className="m-0 mt-4 rounded-11 border border-border-shalon bg-surface p-3 text-[13px] text-ink-2">
          Cadastre o salário combinado na aba Equipe para visualizar a previsão.
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-12 border border-border-shalon bg-surface p-3">
              <p className="m-0 text-[12px] text-muted">Combinado por {diaria ? "diária" : "mês"}</p>
              <p className="m-0 mt-1 font-display text-[20px] font-bold text-ink">
                {formatBRL(referencia.valor)}
              </p>
            </div>
            {diaria ? (
              <Input
                label="Diárias a considerar"
                type="number"
                min={0}
                max={366}
                step={1}
                value={dias}
                onChange={(evento) => {
                  const proximo = evento.target.value;
                  if (proximo === "" || (/^\d{1,3}$/.test(proximo) && Number(proximo) <= 366)) setDias(proximo);
                }}
                hint="Informe os dias manualmente; o sistema não controla ponto."
              />
            ) : null}
          </div>

          <div className="mt-4 border-t border-border-shalon pt-4">
            <h4 className="m-0 text-[14px] font-semibold text-ink">Vales e outros lançamentos do mês</h4>
            <p className="m-0 mt-1 text-[12px] text-muted">
              Nenhum lançamento é abatido por padrão. Marque apenas os que decidiu considerar.
            </p>
            {(lancamentos ?? []).length === 0 ? (
              <p className="m-0 mt-3 text-[13px] text-muted">Nenhum lançamento confirmado neste mês.</p>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                {(lancamentos ?? []).map((item) => (
                  <label key={item.id} className="flex cursor-pointer items-start gap-3 rounded-11 border border-border-shalon bg-surface p-3">
                    <input
                      type="checkbox"
                      checked={selecionados.includes(item.id)}
                      onChange={(evento) => setSelecionados((atual) =>
                        evento.target.checked
                          ? [...atual, item.id]
                          : atual.filter((id) => id !== item.id))}
                      className="mt-1 size-4 accent-cta"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold text-ink">{ROTULOS[item.tipo]}</span>
                      <span className="block text-[11.5px] text-muted">
                        {new Date(item.quando).toLocaleDateString("pt-BR")} · {item.motivo}
                      </span>
                    </span>
                    <strong className="shrink-0 text-[13px] tabular-nums text-ink">{formatBRL(item.valor)}</strong>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 rounded-12 border border-border-shalon bg-surface p-4">
            <div className="flex justify-between gap-3 text-[13px] text-ink-2">
              <span>Base para conferência</span><span>{previsao === null ? "—" : formatBRL(previsao.base)}</span>
            </div>
            <div className="mt-1 flex justify-between gap-3 text-[13px] text-ink-2">
              <span>Abatimentos selecionados</span><span>− {formatBRL(previsao?.abatimentos ?? 0)}</span>
            </div>
            <div className="mt-3 flex justify-between gap-3 border-t border-border-shalon pt-3 font-display text-[17px] font-bold text-ink">
              <span>Previsão para conferir</span>
              <span>{diaria && dias === "" ? "Informe as diárias" : formatBRL(previsao?.previsao ?? 0)}</span>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
