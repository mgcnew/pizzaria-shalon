"use client";

import { useRef, useState, useTransition } from "react";
import { Button, Input } from "@/ui/components";
import { Aviso } from "@/ui/patterns";
import { useAvisarOperacaoEmVoo } from "@/ui/operacaoEmVoo";
import { formatBRL } from "@/lib/format";
import { tirarDinheiroDaGaveta } from "@/application/caixa/acoes";
import { paraNumero } from "./FechamentoDeCaixa";

/** O que ficou do fundo na gaveta, depois da resposta. */
export type RespostaDoFundo = { fundo: number; levado: number };

/**
 * Antes de contar: o fundo ainda está na gaveta? (D-2026-10-27-173)
 *
 * A dona costuma levar o fundo antes do fechamento. Sem registro, o esperado
 * continua com ele e o caixa fecha com uma falta que não existe. Aqui a
 * resposta vira uma retirada da dona — a mesma da saída rápida —, e o servidor
 * desconta do esperado. A contagem continua cega: o fundo quem abriu já sabe.
 */
export function PerguntaDoFundo({
  fundo,
  retiradas,
  aoResponder,
}: {
  fundo: number;
  /** Retiradas da dona já registradas neste caixa. */
  retiradas: number;
  aoResponder: (resposta: RespostaDoFundo) => void;
}) {
  const [parte, setParte] = useState(false);
  const [valorTexto, setValorTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const tentativa = useRef(crypto.randomUUID());
  useAvisarOperacaoEmVoo(enviando);

  const valor = paraNumero(valorTexto);
  const parteValida = valor !== null && valor > 0 && valor < fundo;

  function registrar(levado: number) {
    setErro(null);
    iniciar(async () => {
      const r = await tirarDinheiroDaGaveta({
        motivo: "retirada",
        valor: levado,
        observacao: levado === fundo ? "Fundo do caixa levado pela dona" : "Parte do fundo do caixa levada pela dona",
        tentativa: tentativa.current,
      });
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível registrar a retirada do fundo.");
        return;
      }
      aoResponder({ fundo, levado });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="m-0 font-display text-[18px] font-bold leading-tight text-ink">
          O fundo de {formatBRL(fundo)} ainda está na gaveta?
        </p>
        <p className="m-0 mt-1 text-[13.5px] leading-snug text-muted">
          Se a dona levou o fundo, isso fica registrado como retirada dela e o sistema deixa de esperar esse dinheiro.
        </p>
      </div>

      {retiradas > 0 ? (
        <p className="m-0 rounded-12 border border-twb bg-tw p-3 text-[13px] leading-snug text-twf">
          Já há <strong>{formatBRL(retiradas)}</strong> em retiradas da dona registradas neste caixa. Se o fundo já
          foi registrado ali, responda <strong>“Sim, está na gaveta”</strong> para não descontar duas vezes.
        </p>
      ) : null}

      {erro ? <Aviso erro={erro} /> : null}

      {parte ? (
        <form
          className="flex flex-col gap-3"
          action={() => {
            if (parteValida && valor !== null) registrar(valor);
          }}
        >
          <Input
            name="levado"
            label="Quanto a dona levou do fundo (R$)"
            inputMode="decimal"
            placeholder="0,00"
            value={valorTexto}
            onChange={(e) => setValorTexto(e.target.value)}
            required
            autoFocus
          />
          {valor !== null && valor >= fundo ? (
            <p className="m-0 text-[12.5px] text-muted">
              Se levou o fundo inteiro ou mais, volte e escolha “Não, a dona levou tudo”. O que passar do fundo é
              retirada da dona pelo botão “Tirar dinheiro”.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!parteValida || enviando}>
              {enviando ? "Registrando…" : "Registrar e contar"}
            </Button>
            <Button type="button" variante="fantasma" disabled={enviando} onClick={() => setParte(false)}>
              Voltar
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-2">
          <Button type="button" disabled={enviando} onClick={() => aoResponder({ fundo, levado: 0 })}>
            Sim, está na gaveta
          </Button>
          <Button type="button" variante="secundario" disabled={enviando} onClick={() => registrar(fundo)}>
            {enviando ? "Registrando…" : "Não, a dona levou tudo"}
          </Button>
          <Button type="button" variante="secundario" disabled={enviando} onClick={() => setParte(true)}>
            A dona levou só uma parte
          </Button>
        </div>
      )}
    </div>
  );
}
