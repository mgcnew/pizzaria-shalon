"use client";

import { useRef, useState, useTransition } from "react";
import { Button, Input, Select, StatusBadge } from "@/ui/components";
import { Aviso, ParDeDados } from "@/ui/patterns";
import { formatBRL } from "@/lib/format";
import { estornarPagamento, registrarPagamento } from "@/application/caixa/acoes";
import type { PagamentoDoPedido } from "@/application/caixa/tipos";

/**
 * Registro do pagamento REALIZADO, ao lado do esperado.
 *
 * Os dois ficam na mesma tela e nenhum substitui o outro: quando o cliente
 * escolheu dinheiro e pagou no débito, a tela mostra as duas coisas, porque
 * é essa diferença que explica o caixa depois (RN-PGTO-002).
 *
 * A DIVISÃO é o caso normal do balcão, não uma exceção: R$ 30 em dinheiro e
 * R$ 25 no cartão é um pagamento de duas linhas. A soma é conferida pelo
 * servidor contra o total do pedido — a conta que aparece enquanto a pessoa
 * digita é ajuda visual, não autoridade (§24).
 *
 * "Entrou na gaveta agora" existe por causa de RN-CAIXA-014: dinheiro que
 * voltou com quem entregou não é dinheiro no caixa, e marcar que entrou
 * quando não entrou é exatamente como se fecha um caixa com número falso.
 */

export type FormaParaRecebimento = {
  id: string;
  nome: string;
  familia: string;
  exige_bandeira: boolean;
  bandeiras: { id: string; nome: string }[];
};

type Linha = { forma_id: string; bandeira_id: string; valor: string; recebido: string; na_gaveta: boolean };

function paraNumero(texto: string): number | null {
  const limpo = texto.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (limpo === "") return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

function linhaVazia(formas: FormaParaRecebimento[], total: string): Linha {
  return {
    forma_id: formas[0]?.id ?? "",
    bandeira_id: "",
    valor: total,
    recebido: "",
    na_gaveta: true,
  };
}

export function Recebimento({
  pedidoId,
  total,
  pagamento,
  formas,
  caixaAberto,
  tentativa,
}: {
  pedidoId: string;
  total: number;
  pagamento: PagamentoDoPedido | null;
  formas: FormaParaRecebimento[];
  caixaAberto: boolean;
  tentativa: string;
}) {
  const totalTexto = total.toFixed(2).replace(".", ",");
  const [linhas, setLinhas] = useState<Linha[]>([linhaVazia(formas, totalTexto)]);
  const [erro, setErro] = useState<string | null>(null);
  const [estornando, setEstornando] = useState(false);
  const [enviando, iniciar] = useTransition();
  const chave = useRef(tentativa);

  const confirmados = (pagamento?.realizado ?? []).filter((p) => p.status === "confirmed");
  const jaPago = confirmados.length > 0;

  const somado = linhas.reduce((s, l) => s + (paraNumero(l.valor) ?? 0), 0);
  const fecha = Math.round(somado * 100) === Math.round(total * 100);

  function atualizar(i: number, campo: keyof Linha, valor: string | boolean) {
    setLinhas(linhas.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));
  }

  function executar(acao: () => Promise<{ ok: boolean; erro?: string }>) {
    setErro(null);
    iniciar(async () => {
      const r = await acao();
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível concluir esta ação.");
        return;
      }
      chave.current = crypto.randomUUID();
      setLinhas([linhaVazia(formas, totalTexto)]);
      setEstornando(false);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* ------------------------------------------------- o esperado */}
      {pagamento?.esperado ? (
        <div>
          <p className="m-0 text-[12px] font-semibold uppercase tracking-wide text-muted">
            Esperado no checkout
          </p>
          <p className="m-0 text-[14.5px] text-ink">
            {pagamento.esperado.metodo}
            {pagamento.esperado.bandeira ? ` · ${pagamento.esperado.bandeira}` : ""}
          </p>
          {pagamento.esperado.troco_esperado != null ? (
            <p className="m-0 text-[13.5px] font-semibold text-twf">
              Troco para {formatBRL(pagamento.esperado.troco_para ?? 0)} — levar{" "}
              {formatBRL(pagamento.esperado.troco_esperado)}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* ------------------------------------------------ o realizado */}
      <div className="border-t border-border-shalon pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="m-0 text-[12px] font-semibold uppercase tracking-wide text-muted">
            Recebido de fato
          </p>
          {jaPago ? (
            <StatusBadge tom="sucesso">Pago</StatusBadge>
          ) : (
            <StatusBadge tom="atencao">Não registrado</StatusBadge>
          )}
        </div>

        {(pagamento?.realizado ?? []).length === 0 ? (
          <p className="m-0 mt-1 text-[13.5px] text-muted">
            Nada recebido ainda. Registre quando o dinheiro entrar.
          </p>
        ) : (
          <div className="mt-2">
            {(pagamento?.realizado ?? []).map((p) => (
              <ParDeDados
                key={p.id}
                chave={`${p.metodo ?? "—"}${p.bandeira ? ` · ${p.bandeira}` : ""}${
                  p.status === "reversed" ? " · estornado" : p.na_gaveta ? "" : " · fora da gaveta"
                }`}
                valor={
                  <span className={p.status === "reversed" ? "text-muted line-through" : ""}>
                    {formatBRL(p.valor)}
                    {p.troco != null ? ` (troco ${formatBRL(p.troco)})` : ""}
                  </span>
                }
              />
            ))}
          </div>
        )}
      </div>

      {erro ? <Aviso erro={erro} /> : null}

      {/* -------------------------------------------------- registrar */}
      {!jaPago ? (
        <form
          className="flex flex-col gap-3 border-t border-border-shalon pt-3"
          action={() => {
            const montadas = linhas.map((l) => {
              const forma = formas.find((f) => f.id === l.forma_id);
              const recebido = paraNumero(l.recebido);
              return {
                forma_id: l.forma_id,
                ...(l.bandeira_id ? { bandeira_id: l.bandeira_id } : {}),
                valor: paraNumero(l.valor) ?? 0,
                ...(forma?.familia === "cash" && recebido !== null ? { recebido } : {}),
                na_gaveta: forma?.familia === "cash" ? l.na_gaveta : true,
              };
            });
            executar(() =>
              registrarPagamento({
                pedido_id: pedidoId,
                linhas: montadas,
                tentativa: chave.current,
              }),
            );
          }}
        >
          {!caixaAberto ? (
            <p className="m-0 rounded-10 bg-tw px-3 py-2 text-[13px] font-semibold text-twf">
              Não há caixa aberto. Venda normal exige caixa aberto — abra o caixa antes de
              registrar o recebimento.
            </p>
          ) : null}

          {linhas.map((linha, i) => {
            const forma = formas.find((f) => f.id === linha.forma_id);
            return (
              <div key={i} className="flex flex-col gap-2 rounded-12 bg-elev p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Select
                    label={linhas.length > 1 ? `Forma ${i + 1}` : "Forma"}
                    value={linha.forma_id}
                    onChange={(e) => {
                      atualizar(i, "forma_id", e.target.value);
                      atualizar(i, "bandeira_id", "");
                    }}
                  >
                    {formas.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nome}
                      </option>
                    ))}
                  </Select>
                  <Input
                    label="Valor"
                    inputMode="decimal"
                    value={linha.valor}
                    onChange={(e) => atualizar(i, "valor", e.target.value)}
                  />
                </div>

                {forma?.exige_bandeira ? (
                  <Select
                    label="Bandeira"
                    value={linha.bandeira_id}
                    onChange={(e) => atualizar(i, "bandeira_id", e.target.value)}
                  >
                    <option value="">Selecione</option>
                    {forma.bandeiras.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.nome}
                      </option>
                    ))}
                  </Select>
                ) : null}

                {forma?.familia === "cash" ? (
                  <>
                    <Input
                      label="Recebido em mãos (opcional)"
                      inputMode="decimal"
                      placeholder="para calcular o troco"
                      value={linha.recebido}
                      onChange={(e) => atualizar(i, "recebido", e.target.value)}
                    />
                    <label className="flex items-center gap-[10px] text-[13px] text-ink">
                      <input
                        type="checkbox"
                        checked={linha.na_gaveta}
                        onChange={(e) => atualizar(i, "na_gaveta", e.target.checked)}
                        className="h-[18px] w-[18px] accent-[var(--cta)]"
                      />
                      <span>Este dinheiro entrou na gaveta agora</span>
                    </label>
                  </>
                ) : null}

                {linhas.length > 1 ? (
                  <Button
                    variante="fantasma"
                    tamanho="sm"
                    onClick={() => setLinhas(linhas.filter((_, j) => j !== i))}
                  >
                    Remover esta forma
                  </Button>
                ) : null}
              </div>
            );
          })}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              variante="secundario"
              tamanho="sm"
              onClick={() => setLinhas([...linhas, { ...linhaVazia(formas, "0,00") }])}
            >
              Dividir em outra forma
            </Button>
            <span className={`text-[13.5px] font-semibold ${fecha ? "text-tgf" : "text-tdf"}`}>
              {formatBRL(somado)} de {formatBRL(total)}
            </span>
          </div>

          <Button type="submit" disabled={enviando}>
            {enviando ? "Registrando…" : `Registrar ${formatBRL(somado)} recebidos`}
          </Button>
        </form>
      ) : (
        <div className="border-t border-border-shalon pt-3">
          {estornando ? (
            <form
              className="flex flex-wrap items-end gap-2"
              action={(dados) => {
                const motivo = String(dados.get("motivo") ?? "").trim();
                if (motivo.length < 3) return;
                executar(() => estornarPagamento({ pedido_id: pedidoId, motivo }));
              }}
            >
              <Input name="motivo" label="Motivo do estorno" required />
              <Button type="submit" variante="perigo" tamanho="md" disabled={enviando}>
                Estornar recebimento
              </Button>
              <Button variante="fantasma" tamanho="md" onClick={() => setEstornando(false)}>
                Cancelar
              </Button>
            </form>
          ) : (
            <Button variante="fantasma" tamanho="sm" onClick={() => setEstornando(true)}>
              Estornar recebimento
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
