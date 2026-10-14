"use client";

import { useState } from "react";
import { formatBRL } from "@/lib/format";
import { filtrarSabores } from "@/domain/catalogo/buscaDeSabor";
import type { SaborParaFogazza } from "@/application/catalogo/tipos";

/**
 * Os sabores da categoria, para marcar quem entra na fogazza e por quanto
 * (RN-FOG-003, D-2026-09-30-102).
 *
 * Vive DENTRO do formulário do card: cada linha manda `sabor`, `entra_<id>`,
 * `preco_<id>` e `preco_fds_<id>` (fim de semana, opcional —
 * D-2026-10-14-119), e quem salva é `montar_fogazza`, tudo numa operação. O filtro
 * só esconde linhas (com CSS, não desmonta): linha escondida continua indo no
 * envio, senão filtrar e salvar tiraria sabores da fogazza sem ninguém ver.
 */
export function ListaSaboresDaFogazza({
  sabores,
  podeGerenciar,
}: {
  sabores: SaborParaFogazza[];
  podeGerenciar: boolean;
}) {
  const [marcados, setMarcados] = useState<Set<string>>(
    () => new Set(sabores.filter((s) => s.entra).map((s) => s.id)),
  );
  const [termo, setTermo] = useState("");
  const visiveis = new Set(filtrarSabores(sabores, termo).map((s) => s.id));

  function alternar(id: string) {
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  if (sabores.length === 0) {
    return (
      <p className="m-0 text-[13.5px] text-ink-2">
        Esta categoria não tem sabores de pizza cadastrados.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <p className="m-0 text-[13.5px] text-ink-2">
          {marcados.size} de {sabores.length} sabores à venda como fogazza.
        </p>
        {podeGerenciar ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMarcados(new Set(sabores.map((s) => s.id)))}
              className="min-h-touch cursor-pointer rounded-11 border-[1.5px] border-border-shalon bg-surface px-3 text-[13px] font-semibold text-ink"
            >
              Marcar todos
            </button>
            <button
              type="button"
              onClick={() => setMarcados(new Set())}
              className="min-h-touch cursor-pointer rounded-11 border-[1.5px] border-border-shalon bg-surface px-3 text-[13px] font-semibold text-ink"
            >
              Desmarcar todos
            </button>
          </div>
        ) : null}
      </div>

      <label htmlFor="filtro-sabores-fogazza" className="sr-only">
        Filtrar sabores
      </label>
      <input
        id="filtro-sabores-fogazza"
        value={termo}
        onChange={(e) => setTermo(e.target.value)}
        placeholder="Filtrar sabores…"
        autoComplete="off"
        className="min-h-touch w-full rounded-11 border-[1.5px] border-border-shalon bg-surface px-3 text-[15px] text-ink focus:border-brand-orange focus:outline-none"
      />

      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {sabores.map((s) => {
          const entra = marcados.has(s.id);
          return (
            <li
              key={s.id}
              className={[
                "flex flex-wrap items-center gap-3 rounded-12 border border-border-shalon bg-surface px-3 py-2",
                visiveis.has(s.id) ? "" : "hidden",
              ].join(" ")}
            >
              <input type="hidden" name="sabor" value={s.id} />
              <input type="hidden" name={`nome_${s.id}`} value={s.nome} />
              <label className="flex min-h-touch min-w-0 flex-1 cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  name={`entra_${s.id}`}
                  checked={entra}
                  disabled={!podeGerenciar}
                  onChange={() => alternar(s.id)}
                  className="h-5 w-5 shrink-0 accent-brand-red"
                />
                <span className="min-w-0">
                  <span className="block text-[14.5px] font-semibold text-ink">
                    {s.nome}
                    {s.ativo ? "" : " · inativo"}
                  </span>
                  <span className="block truncate text-[12.5px] text-muted">
                    {s.preco_pizza !== null ? `Pizza: ${formatBRL(s.preco_pizza)}` : "Pizza sem preço"}
                    {s.descricao ? ` · ${s.descricao}` : ""}
                  </span>
                </span>
              </label>
              <label className="flex items-center gap-2 text-[13px] text-ink-2">
                <span>Fogazza R$</span>
                <input
                  name={`preco_${s.id}`}
                  inputMode="decimal"
                  defaultValue={
                    s.preco_fogazza !== null ? s.preco_fogazza.toFixed(2).replace(".", ",") : ""
                  }
                  placeholder="0,00"
                  disabled={!podeGerenciar || !entra}
                  aria-label={`Preço de fogazza de ${s.nome}`}
                  className="min-h-touch w-24 rounded-11 border-[1.5px] border-border-shalon bg-surface px-2 text-right text-[15px] tabular-nums text-ink focus:border-brand-orange focus:outline-none disabled:opacity-50"
                />
              </label>
              <label className="flex items-center gap-2 text-[13px] text-ink-2">
                <span title="Sexta, sábado e domingo">Fim de semana R$</span>
                <input
                  name={`preco_fds_${s.id}`}
                  inputMode="decimal"
                  defaultValue={
                    s.preco_fogazza_fim_de_semana !== null
                      ? s.preco_fogazza_fim_de_semana.toFixed(2).replace(".", ",")
                      : ""
                  }
                  placeholder="igual"
                  disabled={!podeGerenciar || !entra}
                  aria-label={`Preço de fogazza de ${s.nome} na sexta, sábado e domingo`}
                  className="min-h-touch w-24 rounded-11 border-[1.5px] border-border-shalon bg-surface px-2 text-right text-[15px] tabular-nums text-ink focus:border-brand-orange focus:outline-none disabled:opacity-50"
                />
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
