"use client";

import { useRef, useState, useTransition } from "react";
import { Button, Input, Select, StatusBadge, Textarea } from "@/ui/components";
import { Aviso, Cartao, EmptyState } from "@/ui/patterns";
import { formatBRL } from "@/lib/format";
import {
  estornarLancamento,
  registrarLancamento,
  salvarCategoria,
} from "@/application/caixa/acoes";
import type {
  CategoriaFinanceira,
  LancamentoFinanceiro,
} from "@/application/caixa/tipos";

/**
 * /admin/financeiro
 *
 * DOIS CONCEITOS QUE NÃO SE MISTURAM, e é isso que a tela precisa deixar
 * óbvio:
 *
 *   · DESPESA é gasto do negócio — a conta de luz, o fornecedor. Ela pode
 *     ou não ter saído da gaveta, e essa é a caixa de seleção "paga pelo
 *     caixa";
 *   · SANGRIA é dinheiro saindo da gaveta para o cofre. Não é gasto, e por
 *     isso não mora aqui: mora em /admin/caixa (RN-CAIXA-008/010).
 *
 * E nada desta tela é receita de venda. Venda vive em `payments`, ligada a
 * um pedido. Aqui é o outro livro (03 §17.1).
 */

type Aba = "lancamentos" | "categorias";

const TIPOS: Record<CategoriaFinanceira["tipo"], string> = {
  income: "Entrada",
  expense: "Despesa",
  both: "Entrada e despesa",
};

function paraNumero(texto: string): number | null {
  const limpo = texto.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (limpo === "") return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

export function PainelFinanceiro({
  categorias,
  lancamentos,
  formas,
  caixaAberto,
  tentativa,
}: {
  categorias: CategoriaFinanceira[];
  lancamentos: LancamentoFinanceiro[];
  formas: { id: string; nome: string }[];
  caixaAberto: boolean;
  tentativa: string;
}) {
  const [aba, setAba] = useState<Aba>("lancamentos");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const chave = useRef(tentativa);

  function executar(acao: () => Promise<{ ok: boolean; erro?: string }>) {
    setErro(null);
    iniciar(async () => {
      const r = await acao();
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível concluir esta ação.");
        return;
      }
      chave.current = crypto.randomUUID();
    });
  }

  const ativas = categorias.filter((c) => c.ativa);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Seções do financeiro">
        <Button
          variante={aba === "lancamentos" ? "primario" : "secundario"}
          tamanho="md"
          role="tab"
          aria-selected={aba === "lancamentos"}
          onClick={() => setAba("lancamentos")}
        >
          Lançamentos
        </Button>
        <Button
          variante={aba === "categorias" ? "primario" : "secundario"}
          tamanho="md"
          role="tab"
          aria-selected={aba === "categorias"}
          onClick={() => setAba("categorias")}
        >
          Categorias
        </Button>
      </div>

      {erro ? <Aviso erro={erro} /> : null}

      {aba === "lancamentos" ? (
        <>
          {ativas.length === 0 ? (
            <Cartao largura="cheio">
              <EmptyState
                titulo="Nenhuma categoria cadastrada"
                descricao="O plano de contas é da pizzaria — nada foi criado por padrão. Crie ao menos uma categoria antes de lançar entradas ou despesas."
                acao={
                  <Button tamanho="md" onClick={() => setAba("categorias")}>
                    Criar categoria
                  </Button>
                }
              />
            </Cartao>
          ) : (
            <Cartao
              titulo="Novo lançamento"
              descricao="Despesa é gasto do negócio. Sangria é dinheiro mudando de lugar, e fica em Caixa."
            >
              <form
                className="flex flex-col gap-3"
                action={(dados) => {
                  const valor = paraNumero(String(dados.get("valor") ?? ""));
                  if (valor === null || valor <= 0) {
                    setErro("Informe um valor maior que zero.");
                    return;
                  }
                  const forma = String(dados.get("forma_id") ?? "");
                  executar(() =>
                    registrarLancamento({
                      tipo: String(dados.get("tipo") ?? "expense") as "income" | "expense",
                      categoria_id: String(dados.get("categoria_id") ?? ""),
                      valor,
                      descricao: String(dados.get("descricao") ?? "").trim(),
                      ...(forma ? { forma_id: forma } : {}),
                      pelo_caixa: dados.get("pelo_caixa") === "on",
                      tentativa: chave.current,
                    }),
                  );
                }}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select name="tipo" label="Tipo" defaultValue="expense">
                    <option value="expense">Despesa</option>
                    <option value="income">Entrada</option>
                  </Select>
                  <Select name="categoria_id" label="Categoria" required>
                    {ativas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </Select>
                  <Input
                    name="valor"
                    label="Valor"
                    inputMode="decimal"
                    placeholder="0,00"
                    required
                  />
                  <Select name="forma_id" label="Forma (opcional)" defaultValue="">
                    <option value="">Não informar</option>
                    {formas.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nome}
                      </option>
                    ))}
                  </Select>
                </div>

                <Textarea name="descricao" label="Descrição" rows={2} required />

                <label className="flex items-center gap-[10px] text-[13.5px] text-ink">
                  <input
                    type="checkbox"
                    name="pelo_caixa"
                    disabled={!caixaAberto}
                    className="h-[18px] w-[18px] accent-[var(--cta)]"
                  />
                  <span>
                    Saiu (ou entrou) pelo caixa agora
                    {caixaAberto ? "" : " — exige caixa aberto"}
                  </span>
                </label>

                <div>
                  <Button type="submit" disabled={enviando}>
                    {enviando ? "Registrando…" : "Registrar lançamento"}
                  </Button>
                </div>
              </form>
            </Cartao>
          )}

          <Cartao titulo="Histórico" largura="cheio">
            {lancamentos.length === 0 ? (
              <p className="m-0 text-[13.5px] text-muted">Nenhum lançamento registrado.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col p-0">
                {lancamentos.map((l) => (
                  <LinhaDeLancamento
                    key={l.id}
                    lancamento={l}
                    enviando={enviando}
                    aoEstornar={(motivo) =>
                      executar(() => estornarLancamento({ lancamento_id: l.id, motivo }))
                    }
                  />
                ))}
              </ul>
            )}
          </Cartao>
        </>
      ) : (
        <>
          <Cartao
            titulo="Nova categoria"
            descricao="Nenhuma categoria vem pronta: os nomes são da pizzaria."
          >
            <form
              className="flex flex-wrap items-end gap-3"
              action={(dados) =>
                executar(() =>
                  salvarCategoria({
                    nome: String(dados.get("nome") ?? "").trim(),
                    tipo: String(dados.get("tipo") ?? "expense") as CategoriaFinanceira["tipo"],
                  }),
                )
              }
            >
              <Input name="nome" label="Nome" required />
              <Select name="tipo" label="Serve para" defaultValue="expense">
                <option value="expense">Despesa</option>
                <option value="income">Entrada</option>
                <option value="both">Entrada e despesa</option>
              </Select>
              <Button type="submit" disabled={enviando}>
                Criar
              </Button>
            </form>
          </Cartao>

          <Cartao titulo="Categorias" largura="cheio">
            {categorias.length === 0 ? (
              <p className="m-0 text-[13.5px] text-muted">Nenhuma categoria ainda.</p>
            ) : (
              categorias.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-border-shalon py-[10px] last:border-b-0"
                >
                  <div>
                    <p className="m-0 text-[13.5px] font-semibold text-ink">{c.nome}</p>
                    <p className="m-0 text-[12.5px] text-muted">{TIPOS[c.tipo]}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge tom={c.ativa ? "sucesso" : "neutro"}>
                      {c.ativa ? "Ativa" : "Inativa"}
                    </StatusBadge>
                    <Button
                      variante="secundario"
                      tamanho="sm"
                      disabled={enviando}
                      onClick={() =>
                        executar(() =>
                          salvarCategoria({
                            id: c.id,
                            nome: c.nome,
                            tipo: c.tipo,
                            ativa: !c.ativa,
                          }),
                        )
                      }
                    >
                      {c.ativa ? "Desativar" : "Reativar"}
                    </Button>
                  </div>
                </div>
              ))
            )}
            <p className="m-0 mt-3 text-[12.5px] text-muted">
              Categoria não é apagada: ela é desativada. Apagar levaria junto o significado dos
              lançamentos antigos.
            </p>
          </Cartao>
        </>
      )}
    </div>
  );
}

function LinhaDeLancamento({
  lancamento,
  enviando,
  aoEstornar,
}: {
  lancamento: LancamentoFinanceiro;
  enviando: boolean;
  aoEstornar: (motivo: string) => void;
}) {
  const [abrindo, setAbrindo] = useState(false);
  const estornado = lancamento.status === "reversed";
  const entrada = lancamento.tipo === "income";

  return (
    <li className="flex flex-col gap-2 border-b border-border-shalon py-[10px] last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 text-[13.5px] font-semibold text-ink">
            {lancamento.descricao}
            {lancamento.corrige ? " · correção" : ""}
          </p>
          <p className="m-0 text-[12.5px] text-muted">
            {lancamento.categoria ?? "Sem categoria"} ·{" "}
            {new Date(lancamento.quando).toLocaleString("pt-BR")}
            {lancamento.por ? ` · ${lancamento.por}` : ""}
            {lancamento.pelo_caixa ? " · pelo caixa" : ""}
          </p>
          {estornado && lancamento.motivo_estorno ? (
            <p className="m-0 text-[12.5px] text-tdf">Estornado: {lancamento.motivo_estorno}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`text-[14px] font-bold ${estornado ? "text-muted line-through" : entrada ? "text-tgf" : "text-tdf"}`}
          >
            {entrada ? "+" : "−"} {formatBRL(lancamento.valor)}
          </span>
          {!estornado ? (
            <Button variante="fantasma" tamanho="sm" onClick={() => setAbrindo(!abrindo)}>
              Estornar
            </Button>
          ) : null}
        </div>
      </div>

      {abrindo ? (
        <form
          className="flex flex-wrap items-end gap-2"
          action={(dados) => {
            const motivo = String(dados.get("motivo") ?? "").trim();
            if (motivo.length < 3) return;
            aoEstornar(motivo);
            setAbrindo(false);
          }}
        >
          <Input name="motivo" label="Motivo do estorno" required />
          <Button type="submit" variante="perigo" tamanho="md" disabled={enviando}>
            Estornar {formatBRL(lancamento.valor)}
          </Button>
        </form>
      ) : null}
    </li>
  );
}
