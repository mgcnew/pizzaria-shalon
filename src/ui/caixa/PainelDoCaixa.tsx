"use client";

import { useRef, useState, useTransition } from "react";
import { Button, Input, StatusBadge, Textarea } from "@/ui/components";
import { Aviso, Cartao, ParDeDados } from "@/ui/patterns";
import { useAvisarOperacaoEmVoo } from "@/ui/operacaoEmVoo";
import { formatBRL } from "@/lib/format";
import {
  abrirCaixa,
  estornarMovimento,
  fecharCaixa,
  movimentarCaixa,
} from "@/application/caixa/acoes";
import type { EstadoDoCaixa, MovimentoDoCaixa, ResumoDeFechamento } from "@/application/caixa/tipos";

/**
 * A tela do caixa.
 *
 * A PERGUNTA QUE ELA RESPONDE EM UM OLHAR: o caixa está aberto, quanto
 * deveria ter na gaveta, e o que precisa de atenção.
 *
 * O QUE ELA NÃO FAZ: decidir dinheiro. O "esperado" mostrado aqui vem do
 * servidor, e o fechamento usa o número que o servidor calcula no momento de
 * fechar — não este, que pode ter envelhecido na tela (03 §16.4). A
 * diferença exibida enquanto a pessoa digita é conferência, não autoridade.
 *
 * Cartão e Pix aparecem em bloco separado do dinheiro físico, de propósito:
 * tratá-los como papel na gaveta é exatamente o erro que faz um fechamento
 * bater sem estar certo (RN-CAIXA-014).
 */

type Painel = "nenhum" | "sangria" | "reforco" | "fechar";

const ROTULOS: Record<MovimentoDoCaixa["tipo"], string> = {
  opening: "Fundo inicial",
  sale_receipt: "Recebimento de pedido",
  supply: "Reforço",
  withdrawal: "Sangria",
  expense: "Despesa paga pelo caixa",
  refund: "Estorno de recebimento",
  adjustment: "Ajuste",
  other: "Entrada pelo caixa",
};

function paraNumero(texto: string): number | null {
  const limpo = texto.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (limpo === "") return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

export function PainelDoCaixa({
  estado,
  resumo,
  tentativa,
}: {
  estado: EstadoDoCaixa;
  resumo: ResumoDeFechamento | null;
  tentativa: string;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [painel, setPainel] = useState<Painel>("nenhum");
  const [enviando, iniciar] = useTransition();

  /*
   * Enquanto uma operação de caixa está em voo, o assinante do Realtime do PDV
   * adia o refresh: trocar `estado.aberto` no meio de um fechamento faria o
   * ramo inteiro do caixa aberto ser substituído, levando junto o valor já
   * contado. Sem provedor o hook não faz nada, o que mantém este painel
   * montável fora do PDV sem efeito colateral.
   */
  useAvisarOperacaoEmVoo(enviando);

  // Uma chave por tentativa: sobrevive a clique duplo e a retry de rede, e
  // muda quando o formulário é reaberto (CLAUDE.md §34).
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
      setPainel("nenhum");
    });
  }

  if (!estado.aberto) {
    return (
      <div className="flex flex-col gap-4">
        <Cartao largura="cheio">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge tom="neutro">Caixa fechado</StatusBadge>
            <p className="m-0 text-[13.5px] text-muted">
              Abra o caixa para começar a registrar recebimentos.
            </p>
          </div>
        </Cartao>

        {estado.dinheiro_fora_da_gaveta > 0 ? (
          <Cartao largura="cheio">
            <Aviso
              erro={`Há ${formatBRL(estado.dinheiro_fora_da_gaveta)} recebidos em dinheiro que ainda não entraram na gaveta.`}
            />
          </Cartao>
        ) : null}

        {estado.ultima ? (
          <Cartao titulo="Último fechamento" largura="cheio">
            <ParDeDados chave="Esperado" valor={formatBRL(estado.ultima.esperado)} />
            <ParDeDados chave="Contado" valor={formatBRL(estado.ultima.contado)} />
            <ParDeDados
              chave="Diferença"
              valor={
                <span className={estado.ultima.diferenca === 0 ? "" : "text-danger"}>
                  {formatBRL(estado.ultima.diferenca)}
                </span>
              }
            />
          </Cartao>
        ) : null}

        <Cartao titulo="Abrir caixa" descricao="O fundo pode ser R$ 0,00.">
          <Aviso {...(erro ? { erro } : {})} />
          <form
            className="mt-3 flex flex-wrap items-end gap-3"
            action={(dados) => {
              const fundo = paraNumero(String(dados.get("fundo") ?? "")) ?? 0;
              executar(() => abrirCaixa({ fundo }));
            }}
          >
            <Input
              name="fundo"
              label="Fundo inicial"
              inputMode="decimal"
              placeholder="0,00"
              defaultValue="0,00"
            />
            <Button type="submit" disabled={enviando}>
              {enviando ? "Abrindo…" : "Abrir caixa"}
            </Button>
          </form>
        </Cartao>
      </div>
    );
  }

  const esperado = estado.esperado_em_dinheiro;

  return (
    <div className="flex flex-col gap-4">
      {/* ------------------------------------------------ cabeçalho */}
      <Cartao largura="cheio">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge tom="sucesso">Caixa aberto</StatusBadge>
              <span className="text-[13px] text-muted">
                Aberto por {estado.aberta_por ?? "—"} ·{" "}
                {new Date(estado.aberta_em).toLocaleString("pt-BR")}
              </span>
            </div>
            <p className="m-0 mt-3 text-[13px] text-muted">Dinheiro esperado na gaveta</p>
            <p className="m-0 font-display text-[32px] font-bold leading-tight text-ink">
              {formatBRL(esperado)}
            </p>
            <p className="m-0 text-[12.5px] text-muted">
              Fundo de {formatBRL(estado.fundo)} · não inclui cartão nem Pix
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variante="secundario"
              tamanho="md"
              onClick={() => setPainel(painel === "reforco" ? "nenhum" : "reforco")}
            >
              Reforço
            </Button>
            <Button
              variante="secundario"
              tamanho="md"
              onClick={() => setPainel(painel === "sangria" ? "nenhum" : "sangria")}
            >
              Sangria
            </Button>
            <Button
              tamanho="md"
              onClick={() => setPainel(painel === "fechar" ? "nenhum" : "fechar")}
            >
              Fechar caixa
            </Button>
          </div>
        </div>
      </Cartao>

      {/* ---------------------------------------------------- alertas */}
      {estado.alerta_caixa_antigo ? (
        <Cartao largura="cheio">
          <Aviso
            erro={`Este caixa foi aberto em ${new Date(estado.aberta_em).toLocaleDateString("pt-BR")} e continua aberto. O sistema não fecha caixa sozinho — confira e feche quando for o caso.`}
          />
        </Cartao>
      ) : null}

      {estado.dinheiro_fora_da_gaveta > 0 ? (
        <Cartao largura="cheio">
          <Aviso
            erro={`${formatBRL(estado.dinheiro_fora_da_gaveta)} recebidos em dinheiro ainda não entraram na gaveta. Esse valor NÃO está no esperado acima.`}
          />
        </Cartao>
      ) : null}

      {erro ? (
        <Cartao largura="cheio">
          <Aviso erro={erro} />
        </Cartao>
      ) : null}

      {/* ----------------------------------------------- sangria/reforço */}
      {painel === "sangria" || painel === "reforco" ? (
        <Cartao
          titulo={painel === "sangria" ? "Registrar sangria" : "Registrar reforço"}
          descricao={
            painel === "sangria"
              ? "Dinheiro saindo fisicamente da gaveta. Não é despesa: o dinheiro continua sendo da pizzaria."
              : "Dinheiro entrando fisicamente na gaveta. Não é receita."
          }
        >
          <form
            className="flex flex-col gap-3"
            action={(dados) => {
              const valor = paraNumero(String(dados.get("valor") ?? ""));
              if (valor === null || valor <= 0) {
                setErro("Informe um valor maior que zero.");
                return;
              }
              const motivo = String(dados.get("motivo") ?? "").trim();
              executar(() =>
                movimentarCaixa({
                  tipo: painel === "sangria" ? "withdrawal" : "supply",
                  valor,
                  ...(motivo ? { motivo } : {}),
                  tentativa: chave.current,
                }),
              );
            }}
          >
            <Input name="valor" label="Valor" inputMode="decimal" placeholder="0,00" required />
            <Textarea
              name="motivo"
              label={painel === "sangria" ? "Motivo (obrigatório)" : "Motivo (opcional)"}
              rows={2}
              required={painel === "sangria"}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={enviando}>
                {enviando
                  ? "Registrando…"
                  : painel === "sangria"
                    ? "Retirar da gaveta"
                    : "Adicionar à gaveta"}
              </Button>
              <Button variante="fantasma" onClick={() => setPainel("nenhum")}>
                Cancelar
              </Button>
            </div>
          </form>
        </Cartao>
      ) : null}

      {/* -------------------------------------------------- fechamento */}
      {painel === "fechar" && resumo ? (
        <FormularioDeFechamento
          resumo={resumo}
          enviando={enviando}
          aoCancelar={() => setPainel("nenhum")}
          aoConfirmar={(contado, justificativa) =>
            executar(() =>
              fecharCaixa({ contado, ...(justificativa ? { justificativa } : {}) }),
            )
          }
        />
      ) : null}

      {/* ------------------------------------------- recebimentos e extrato */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Cartao
          titulo="Recebimentos por forma"
          descricao="Cartão e Pix entram aqui, mas não no dinheiro da gaveta."
          largura="cheio"
        >
          {estado.recebimentos_por_metodo.length === 0 ? (
            <p className="m-0 text-[13.5px] text-muted">Nenhum recebimento nesta sessão ainda.</p>
          ) : (
            estado.recebimentos_por_metodo.map((r) => (
              <ParDeDados
                key={r.metodo}
                chave={`${r.metodo}${r.familia === "cash" ? " (na gaveta)" : ""}`}
                valor={formatBRL(r.total)}
              />
            ))
          )}
        </Cartao>

        <Cartao titulo="Movimentos desta sessão" largura="cheio">
          {estado.movimentos.length === 0 ? (
            <p className="m-0 text-[13.5px] text-muted">Nenhum movimento ainda.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0">
              {estado.movimentos.map((m) => (
                <LinhaDeMovimento
                  key={m.id}
                  movimento={m}
                  enviando={enviando}
                  aoEstornar={(motivo) =>
                    executar(() => estornarMovimento({ movimento_id: m.id, motivo }))
                  }
                />
              ))}
            </ul>
          )}
        </Cartao>
      </div>
    </div>
  );
}

/** Uma linha do extrato, com estorno quando ela ainda pode ser estornada. */
function LinhaDeMovimento({
  movimento,
  enviando,
  aoEstornar,
}: {
  movimento: MovimentoDoCaixa;
  enviando: boolean;
  aoEstornar: (motivo: string) => void;
}) {
  const [abrindo, setAbrindo] = useState(false);
  const entra = movimento.sentido === "in";

  return (
    <li className="flex flex-col gap-2 border-b border-border-shalon py-[10px] last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 text-[13.5px] font-semibold text-ink">
            {ROTULOS[movimento.tipo]}
            {movimento.e_estorno ? " · estorno" : ""}
          </p>
          <p className="m-0 text-[12.5px] text-muted">
            {new Date(movimento.em).toLocaleString("pt-BR")}
            {movimento.por ? ` · ${movimento.por}` : ""}
            {movimento.motivo ? ` · ${movimento.motivo}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`text-[14px] font-bold ${movimento.estornado ? "text-muted line-through" : entra ? "text-tgf" : "text-tdf"}`}
          >
            {entra ? "+" : "−"} {formatBRL(movimento.valor)}
          </span>
          {!movimento.estornado && !movimento.e_estorno ? (
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
            Estornar {formatBRL(movimento.valor)}
          </Button>
        </form>
      ) : null}
    </li>
  );
}

/**
 * Fechamento.
 *
 * Mostra de onde vem o esperado, linha a linha, antes de pedir a contagem —
 * porque "o sistema diz que tem R$ 265" sem explicar por quê é o começo de
 * uma diferença que ninguém consegue justificar depois.
 */
function FormularioDeFechamento({
  resumo,
  enviando,
  aoCancelar,
  aoConfirmar,
}: {
  resumo: ResumoDeFechamento;
  enviando: boolean;
  aoCancelar: () => void;
  aoConfirmar: (contado: number, justificativa: string) => void;
}) {
  const [contadoTexto, setContadoTexto] = useState("");
  const contado = paraNumero(contadoTexto);
  // Conferência para quem está contando. A diferença que vale é a que o
  // servidor calcula no momento de fechar.
  const diferenca = contado === null ? null : contado - resumo.esperado_em_dinheiro;
  const precisaJustificar = diferenca !== null && diferenca !== 0;

  return (
    <Cartao titulo="Fechar caixa" descricao="Confira de onde vem o esperado antes de contar.">
      <div className="mb-4">
        <ParDeDados chave="Fundo inicial" valor={formatBRL(resumo.fundo_inicial)} />
        <ParDeDados
          chave="Recebido em dinheiro"
          valor={`+ ${formatBRL(resumo.recebido_em_dinheiro)}`}
        />
        <ParDeDados chave="Reforços" valor={`+ ${formatBRL(resumo.reforcos)}`} />
        <ParDeDados chave="Entradas pelo caixa" valor={`+ ${formatBRL(resumo.entradas_pelo_caixa)}`} />
        <ParDeDados chave="Sangrias" valor={`− ${formatBRL(resumo.sangrias)}`} />
        <ParDeDados
          chave="Despesas pagas pelo caixa"
          valor={`− ${formatBRL(resumo.despesas_pelo_caixa)}`}
        />
        <ParDeDados chave="Estornos" valor={formatBRL(resumo.estornos)} />
        <ParDeDados
          chave="Esperado na gaveta"
          valor={<strong>{formatBRL(resumo.esperado_em_dinheiro)}</strong>}
        />
      </div>

      {resumo.recebimentos_por_metodo.some((r) => r.familia !== "cash") ? (
        <div className="mb-4 rounded-12 border border-tib bg-ti p-3">
          <p className="m-0 text-[13px] font-semibold text-tif">
            Recebido em cartão, Pix e voucher — não entra na contagem da gaveta
          </p>
          <div className="mt-2">
            {resumo.recebimentos_por_metodo
              .filter((r) => r.familia !== "cash")
              .map((r) => (
                <ParDeDados key={r.metodo} chave={r.metodo} valor={formatBRL(r.total)} />
              ))}
          </div>
        </div>
      ) : null}

      {resumo.dinheiro_fora_da_gaveta > 0 ? (
        <div className="mb-4">
          <Aviso
            erro={`${formatBRL(resumo.dinheiro_fora_da_gaveta)} em dinheiro ainda estão fora da gaveta. O caixa pode ser fechado assim, mas esse valor não é dinheiro recebido aqui.`}
          />
        </div>
      ) : null}

      <form
        className="flex flex-col gap-3"
        action={(dados) => {
          const valor = paraNumero(String(dados.get("contado") ?? ""));
          if (valor === null || valor < 0) return;
          aoConfirmar(valor, String(dados.get("justificativa") ?? "").trim());
        }}
      >
        <Input
          name="contado"
          label="Valor contado na gaveta"
          inputMode="decimal"
          placeholder="0,00"
          value={contadoTexto}
          onChange={(e) => setContadoTexto(e.target.value)}
          required
        />

        {diferenca !== null ? (
          <p
            className={`m-0 text-[14px] font-semibold ${diferenca === 0 ? "text-tgf" : "text-tdf"}`}
          >
            {diferenca === 0
              ? "Sem diferença."
              : `Diferença de ${formatBRL(diferenca)} — ${diferenca > 0 ? "sobra" : "falta"} na gaveta.`}
          </p>
        ) : null}

        {precisaJustificar ? (
          <Textarea
            name="justificativa"
            label="Justificativa da diferença (obrigatória)"
            rows={2}
            required
          />
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={enviando || contado === null}>
            {enviando ? "Fechando…" : `Fechar com ${formatBRL(contado ?? 0)} contados`}
          </Button>
          <Button variante="fantasma" onClick={aoCancelar}>
            Cancelar
          </Button>
        </div>
      </form>
    </Cartao>
  );
}
