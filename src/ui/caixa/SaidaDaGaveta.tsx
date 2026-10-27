"use client";

import { useRef, useState, useTransition } from "react";
import { Button, Input } from "@/ui/components";
import { Aviso } from "@/ui/patterns";
import { useAvisarOperacaoEmVoo } from "@/ui/operacaoEmVoo";
import { tirarDinheiroDaGaveta } from "@/application/caixa/acoes";
import { paraNumero } from "./FechamentoDeCaixa";

/**
 * Tirar dinheiro da gaveta (D-2026-10-27-171).
 *
 * O motivo é um toque, porque o que não se registra vira diferença no
 * fechamento. Retirada da dona é sangria; motoboy, compra e outro são despesa
 * paga pelo caixa e aparecem no Financeiro. O servidor decide e grava.
 */

const MOTIVOS = [
  { valor: "motoboy", rotulo: "Pagamento do motoboy", dica: "Nome do motoboy (opcional)" },
  { valor: "compra", rotulo: "Compra", dica: "O que foi comprado (opcional)" },
  { valor: "retirada", rotulo: "Retirada da dona", dica: "Observação (opcional)" },
  { valor: "outro", rotulo: "Outro", dica: "Para que foi o dinheiro (obrigatório)" },
] as const;

type Motivo = (typeof MOTIVOS)[number]["valor"];

export function SaidaDaGaveta({
  aoConcluir,
  aoCancelar,
}: {
  /** Depois de registrar: fecha o modal, ou confere o caixa de novo. */
  aoConcluir: () => void;
  aoCancelar: () => void;
}) {
  const [motivo, setMotivo] = useState<Motivo | null>(null);
  const [valorTexto, setValorTexto] = useState("");
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const tentativa = useRef(crypto.randomUUID());
  useAvisarOperacaoEmVoo(enviando);

  const escolhido = MOTIVOS.find((m) => m.valor === motivo);
  const valor = paraNumero(valorTexto);
  const pronto =
    motivo !== null && valor !== null && valor > 0 && (motivo !== "outro" || observacao.trim().length >= 3);

  function registrar() {
    if (!pronto || motivo === null || valor === null) return;
    setErro(null);
    iniciar(async () => {
      const r = await tirarDinheiroDaGaveta({
        motivo,
        valor,
        ...(observacao.trim() ? { observacao: observacao.trim() } : {}),
        tentativa: tentativa.current,
      });
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível registrar a saída.");
        return;
      }
      tentativa.current = crypto.randomUUID();
      aoConcluir();
    });
  }

  return (
    <form
      className="flex flex-col gap-4"
      action={registrar}
    >
      <p className="m-0 text-[13.5px] text-muted">
        Todo dinheiro que sai da gaveta precisa ser registrado, senão o caixa fecha com falta.
      </p>
      {erro ? <Aviso erro={erro} /> : null}

      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="mb-2 p-0 text-[13px] font-bold text-ink">Para que foi o dinheiro?</legend>
        <div className="grid grid-cols-2 gap-2">
          {MOTIVOS.map((m) => (
            <button
              key={m.valor}
              type="button"
              aria-pressed={motivo === m.valor}
              onClick={() => {
                setMotivo(m.valor);
                setErro(null);
              }}
              className={[
                "min-h-[48px] rounded-12 border px-3 text-[14px] font-semibold",
                motivo === m.valor ? "border-ink bg-ink text-surface" : "border-border-shalon bg-surface text-ink",
              ].join(" ")}
            >
              {m.rotulo}
            </button>
          ))}
        </div>
      </fieldset>

      <Input
        name="valor"
        label="Valor que saiu da gaveta"
        inputMode="decimal"
        placeholder="0,00"
        value={valorTexto}
        onChange={(e) => setValorTexto(e.target.value)}
        required
      />
      {escolhido ? (
        <Input
          name="observacao"
          label={escolhido.dica}
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          maxLength={300}
          required={escolhido.valor === "outro"}
        />
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!pronto || enviando}>
          {enviando ? "Registrando…" : "Registrar saída"}
        </Button>
        <Button type="button" variante="fantasma" onClick={aoCancelar}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
