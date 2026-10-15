"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Input, SelectMenu, Textarea } from "@/ui/components";
import { Abas, Aviso, Cartao, EmptyState, LinhaLista, ParDeDados } from "@/ui/patterns";
import { formatBRL } from "@/lib/format";
import { EscolherProduto } from "../../pedidos/_ui/EscolherProduto";
import { PermissoesDosPapeis } from "./PermissoesDosPapeis";
import type { ItemDoRascunho } from "@/application/pedidos/tipos";
import type { FuncionarioBasico } from "@/application/equipe/consultas";
import { GestaoDaEquipe } from "./GestaoDaEquipe";
import { ConferenciaSalarial } from "./ConferenciaSalarial";
import {
  lancarNoFuncionario,
  registrarMovimentoInterno,
  reverterLancamentoFuncionario,
  reverterMovimentoInterno,
} from "@/application/equipe/acoes";
import { DiferencasDeAcerto } from "./DiferencasDeAcerto";
import type { DiferencaDeAcerto } from "@/application/equipe/tipos";
import type {
  HistoricoDoFuncionario,
  MembroDaEquipe,
  MovimentoInterno,
  PapelAtribuivel,
  ReferenciaSalarial,
  LancamentoParaConferencia,
  TipoDeMovimento,
} from "@/application/equipe/tipos";

/**
 * Movimentações internas e o histórico do funcionário.
 *
 * A TELA CARREGA A DISTINÇÃO que o banco garante (CLAUDE.md §15, §27):
 *
 *  - qualquer pessoa do balcão registra cortesia, consumo e perda;
 *  - o valor mostrado é DE REFERÊNCIA — não é venda, não é receita e não é
 *    cobrança;
 *  - o histórico e a referência salarial exigem a permissão financeira;
 *  - transformar um consumo em dívida é um segundo ato, explícito.
 *
 * O item usa o `EscolherProduto` do balcão, que usa o `NucleoConfigurador` do
 * cardápio. Uma pizza de cortesia é montada e precificada pelo mesmo caminho
 * de uma pizza vendida — o que muda é só que ela não vira venda.
 */

const TIPOS: { valor: TipoDeMovimento; texto: string; ajuda: string }[] = [
  { valor: "courtesy", texto: "Cortesia", ajuda: "Oferecida ao cliente. Exige quem autorizou." },
  {
    valor: "employee_consumption",
    texto: "Consumo de funcionário",
    ajuda: "Tem dono. Não vira dívida sozinho.",
  },
  { valor: "owner_consumption", texto: "Consumo do proprietário", ajuda: "Não é venda." },
  { valor: "loss", texto: "Perda / descarte", ajuda: "Queimou, caiu, estragou." },
];

const ROTULO_TIPO: Record<TipoDeMovimento, string> = {
  courtesy: "Cortesia",
  employee_consumption: "Consumo de funcionário",
  owner_consumption: "Consumo do proprietário",
  loss: "Perda / descarte",
};

const ROTULO_LANCAMENTO: Record<string, string> = {
  consumption: "Consumo",
  advance: "Adiantamento",
  discrepancy: "Diferença de acerto",
  adjustment: "Ajuste",
  other: "Outro",
};

const OPCOES_TIPO = TIPOS.map((tipo) => ({
  valor: tipo.valor,
  texto: tipo.texto,
  descricao: tipo.ajuda,
}));

function paraNumero(texto: string): number | null {
  const limpo = texto.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (limpo === "") return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

export function PainelDaEquipe({
  aba,
  funcionarios,
  equipe,
  papeis,
  movimentos,
  historico,
  diferencas = [],
  referencias,
  lancamentosDoMes,
  mesConferencia,
  funcionarioSelecionado,
  meuAppUserId,
  podeVerFinanceiro,
  podeLancar,
  podeGerirEquipe,
  podeGerirSalario,
  podeGerirAcesso,
  caixaAberto,
  podeGerirPermissoes = false,
  permissoesDosPapeis = { catalogo: [], papeis: [] },
}: {
  /** Aba corrente, vinda da URL: o estado de navegação mora lá, não aqui. */
  aba: string;
  funcionarios: FuncionarioBasico[];
  equipe: MembroDaEquipe[];
  papeis: PapelAtribuivel[];
  movimentos: MovimentoInterno[];
  historico: HistoricoDoFuncionario | null;
  /** Diferenças de acerto do motoboy escolhido (RN-RUN-006, 0144). */
  diferencas?: DiferencaDeAcerto[];
  referencias: ReferenciaSalarial[] | null;
  lancamentosDoMes: LancamentoParaConferencia[] | null;
  mesConferencia: string;
  funcionarioSelecionado: string | null;
  meuAppUserId: string | null;
  podeVerFinanceiro: boolean;
  podeLancar: boolean;
  /** `employees.manage`. */
  podeGerirEquipe: boolean;
  podeGerirSalario: boolean;
  /** `employees.manage` E `roles.manage`. */
  podeGerirAcesso: boolean;
  /** RN-EMPFIN-004: sem gaveta aberta, adiantamento em dinheiro não sai. */
  caixaAberto: boolean;
  /** `roles.manage`: mostra a aba de permissões dos papéis. */
  podeGerirPermissoes?: boolean;
  permissoesDosPapeis?: {
    catalogo: { id: string; codigo: string }[];
    papeis: import("@/application/equipe/tipos").PapelComPermissoes[];
  };
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  const [tipo, setTipo] = useState<TipoDeMovimento>("loss");
  const [funcionarioId, setFuncionarioId] = useState("");
  const [motivo, setMotivo] = useState("");
  const [itens, setItens] = useState<ItemDoRascunho[]>([]);

  const [estornando, setEstornando] = useState<string | null>(null);
  const [motivoEstorno, setMotivoEstorno] = useState("");

  const [lancando, setLancando] = useState<MovimentoInterno | null>(null);
  const [valorLancamento, setValorLancamento] = useState("");
  const [motivoLancamento, setMotivoLancamento] = useState("");

  const [adiantando, setAdiantando] = useState(false);
  const [valorAdiantamento, setValorAdiantamento] = useState("");
  const [motivoAdiantamento, setMotivoAdiantamento] = useState("");
  const [pelaGaveta, setPelaGaveta] = useState(true);

  const chave = useRef(crypto.randomUUID());
  const router = useRouter();

  function executar(acao: () => Promise<{ ok: boolean; erro?: string }>) {
    setErro(null);
    iniciar(async () => {
      const r = await acao();
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível concluir esta ação.");
        return;
      }
      chave.current = crypto.randomUUID();
      setItens([]);
      setMotivo("");
      setEstornando(null);
      setMotivoEstorno("");
      setLancando(null);
      setValorLancamento("");
      setMotivoLancamento("");
      setAdiantando(false);
      setValorAdiantamento("");
      setMotivoAdiantamento("");
    });
  }

  const exigeFuncionario = tipo === "employee_consumption";
  const totalReferencia = itens.reduce((s, i) => s + i.total, 0);

  const registro = (
    <div className="flex flex-col gap-4">
      <Cartao
        titulo="Registrar saída que não é venda"
        descricao="Cortesia, consumo e perda saem do estoque físico, mas nunca do faturamento."
        largura="cheio"
      >
        <div className="flex flex-col gap-3">
          <SelectMenu
            label="Tipo"
            hint={TIPOS.find((t) => t.valor === tipo)?.ajuda ?? ""}
            valor={tipo}
            aoMudar={(valor) => setTipo(valor as TipoDeMovimento)}
            opcoes={OPCOES_TIPO}
          />

          {/* RN-CONS-001: consumo tem dono. Cortesia e perda, não. */}
          {exigeFuncionario ? (
            <SelectMenu
              label="De quem foi o consumo"
              valor={funcionarioId}
              aoMudar={setFuncionarioId}
              opcoes={[
                { valor: "", texto: "Escolha o funcionário" },
                ...funcionarios
                .filter((f) => f.ativo)
                .map((f) => ({ valor: f.id, texto: f.nome })),
              ]}
            />
          ) : null}

          <Textarea
            label="Motivo"
            hint="Fica no histórico. Escreva o que aconteceu."
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={2}
          />
        </div>

        <div className="mt-4 border-t border-border-shalon pt-4">
          <EscolherProduto
            aoAdicionar={(item) => setItens((atual) => [...atual, item])}
            rotuloAcao="Incluir no movimento"
          />
        </div>

        {itens.length > 0 ? (
          <div className="mt-3">
            {itens.map((i, idx) => (
              <LinhaLista key={i.linha}>
                <span className="flex-1 text-[13.5px] text-ink">
                  {i.quantidade}× {i.nome}
                  {i.rotulos.length > 0 ? ` · ${i.rotulos.join(" · ")}` : ""}
                </span>
                <span className="text-[13px] text-muted">{formatBRL(i.total)}</span>
                <Button
                  variante="secundario"
                  onClick={() => setItens((a) => a.filter((_, n) => n !== idx))}
                >
                  Remover
                </Button>
              </LinhaLista>
            ))}

            {/* O número existe para dimensionar, não para cobrar. */}
            <p className="m-0 mt-3 text-[13px] text-muted">
              Valor de referência: <strong className="text-ink">{formatBRL(totalReferencia)}</strong>
              . Não é receita, não é dívida e não entra no faturamento.
            </p>
          </div>
        ) : null}

        <div className="mt-4">
          <Button
            variante="primario"
            disabled={
              enviando ||
              itens.length === 0 ||
              motivo.trim().length < 3 ||
              (exigeFuncionario && !funcionarioId)
            }
            onClick={() =>
              executar(() =>
                registrarMovimentoInterno({
                  tipo,
                  funcionario_id: exigeFuncionario ? funcionarioId : null,
                  // RN-CORT-002: quem registra assina a cortesia.
                  autorizado_por: tipo === "courtesy" ? meuAppUserId : null,
                  motivo: motivo.trim(),
                  itens: itens.map((i) => ({
                    produto_id: i.produtoId,
                    variacao_id: i.variacaoId,
                    sabores: i.sabores,
                    borda_id: i.bordaId,
                    adicionais: i.adicionais,
                    observacao: i.observacao || undefined,
                    quantidade: i.quantidade,
                  })),
                  tentativa: chave.current,
                }),
              )
            }
          >
            Registrar movimento
          </Button>
        </div>
      </Cartao>

      <Cartao titulo="Movimentos registrados" largura="cheio">
        {movimentos.length === 0 ? (
          <EmptyState titulo="Nada registrado" descricao="Nenhuma saída interna até agora." />
        ) : (
          movimentos.map((m) => (
            <LinhaLista key={m.movimento_id}>
              <div className="min-w-[200px] flex-1">
                <p className="m-0 text-[14px] font-semibold text-ink">
                  {ROTULO_TIPO[m.tipo]}
                  {m.funcionario ? ` · ${m.funcionario}` : ""}
                </p>
                <p className="m-0 text-[12.5px] text-muted">
                  {new Date(m.quando).toLocaleString("pt-BR")} · {m.motivo}
                </p>
                <p className="m-0 text-[12.5px] text-muted">
                  {m.itens.map((i) => `${i.quantidade}× ${i.nome}`).join(", ")}
                </p>
              </div>

              <span className="text-[13.5px] font-semibold text-ink">
                {formatBRL(m.valor_referencia)}
              </span>

              {m.status === "reversed" ? (
                <Badge tom="indisponivel">Estornado</Badge>
              ) : (
                <div className="flex items-center gap-2">
                  {podeLancar && m.funcionario_id && !m.tem_lancamento ? (
                    <Button variante="secundario" onClick={() => setLancando(m)}>
                      Lançar no funcionário
                    </Button>
                  ) : null}
                  <Button variante="secundario" onClick={() => setEstornando(m.movimento_id)}>
                    Estornar
                  </Button>
                </div>
              )}
            </LinhaLista>
          ))
        )}

        {/* §28: estorno é registro novo, com motivo. Nada é apagado. */}
        {estornando ? (
          <div className="mt-3 flex flex-col gap-2">
            <Textarea
              label="Por que está estornando?"
              value={motivoEstorno}
              onChange={(e) => setMotivoEstorno(e.target.value)}
              rows={2}
            />
            <div className="flex gap-2">
              <Button
                variante="primario"
                disabled={enviando || motivoEstorno.trim().length < 3}
                onClick={() =>
                  executar(() =>
                    reverterMovimentoInterno({
                      id: estornando,
                      motivo: motivoEstorno.trim(),
                    }),
                  )
                }
              >
                Confirmar estorno
              </Button>
              <Button variante="secundario" onClick={() => setEstornando(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : null}

        {/* RN-RUN-006 por analogia: virar dívida é ATO EXPLÍCITO e separado. */}
        {lancando ? (
          <div className="mt-3 flex flex-col gap-2 border-t border-border-shalon pt-3">
            <p className="m-0 text-[13px] text-muted">
              Isto registra no histórico de {lancando.funcionario} que ficou combinado acertar este
              consumo. <strong className="text-ink">Não desconta salário</strong> e não gera folha.
            </p>
            <Input
              label="Valor combinado"
              inputMode="decimal"
              hint={`Referência do movimento: ${formatBRL(lancando.valor_referencia)}`}
              value={valorLancamento}
              onChange={(e) => setValorLancamento(e.target.value)}
            />
            <Textarea
              label="Motivo"
              value={motivoLancamento}
              onChange={(e) => setMotivoLancamento(e.target.value)}
              rows={2}
            />
            <div className="flex gap-2">
              <Button
                variante="primario"
                disabled={
                  enviando ||
                  motivoLancamento.trim().length < 3 ||
                  (paraNumero(valorLancamento) ?? 0) <= 0
                }
                onClick={() =>
                  executar(() =>
                    lancarNoFuncionario({
                      funcionario_id: lancando.funcionario_id,
                      tipo: "consumption",
                      valor: paraNumero(valorLancamento) ?? 0,
                      movimento_id: lancando.movimento_id,
                      motivo: motivoLancamento.trim(),
                      tentativa: chave.current,
                    }),
                  )
                }
              >
                Lançar
              </Button>
              <Button variante="secundario" onClick={() => setLancando(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : null}
      </Cartao>
    </div>
  );

  const livro = (
    <Cartao
      titulo="Histórico e conferência do funcionário"
      descricao="Salário combinado, vales e outros lançamentos para conferência gerencial."
      largura="cheio"
    >
      <SelectMenu
        label="Funcionário"
        valor={funcionarioSelecionado ?? ""}
        aoMudar={(valor) => {
          router.push(`/admin/equipe?aba=livro&funcionario=${valor}`);
        }}
        opcoes={[
          { valor: "", texto: "Escolha o funcionário" },
          ...funcionarios.map((f) => ({ valor: f.id, texto: f.nome })),
        ]}
      />

      {funcionarioSelecionado ? (
        <ConferenciaSalarial
          key={`${funcionarioSelecionado}-${mesConferencia}`}
          referencia={referencias?.find((item) => item.funcionario_id === funcionarioSelecionado) ?? null}
          lancamentos={lancamentosDoMes}
          disponivel={referencias !== null && lancamentosDoMes !== null}
          mes={mesConferencia}
          aoMudarMes={(valor) => {
            router.push(`/admin/equipe?aba=livro&funcionario=${funcionarioSelecionado}&mes=${valor}`);
          }}
        />
      ) : null}

      {/* RN-EMPFIN-004: um fato, dois livros. A tela diz isso antes de gravar. */}
      {podeLancar && funcionarioSelecionado ? (
        <div className="mt-3 border-t border-border-shalon pt-3">
          {adiantando ? (
            <div className="flex flex-col gap-2">
              <Input
                label="Valor do adiantamento"
                inputMode="decimal"
                value={valorAdiantamento}
                onChange={(e) => setValorAdiantamento(e.target.value)}
              />
              <Textarea
                label="Motivo"
                value={motivoAdiantamento}
                onChange={(e) => setMotivoAdiantamento(e.target.value)}
                rows={2}
              />
              <label className="flex items-center gap-2 text-[13.5px] text-ink">
                <input
                  type="checkbox"
                  checked={pelaGaveta}
                  onChange={(e) => setPelaGaveta(e.target.checked)}
                />
                Pago em dinheiro, saindo da gaveta agora
              </label>
              <p className="m-0 text-[12.5px] text-muted">
                {pelaGaveta
                  ? "Isto cria os dois registros juntos: o lançamento aqui e a saída física do caixa. Um não existe sem o outro."
                  : "Sem saída de caixa: o lançamento fica só no histórico do funcionário."}
              </p>
              {pelaGaveta && !caixaAberto ? (
                <p className="m-0 text-[13px] font-semibold text-tdf">
                  Não há caixa aberto. Abra o caixa para pagar em dinheiro.
                </p>
              ) : null}
              <div className="flex gap-2">
                <Button
                  variante="primario"
                  disabled={
                    enviando ||
                    motivoAdiantamento.trim().length < 3 ||
                    (paraNumero(valorAdiantamento) ?? 0) <= 0 ||
                    (pelaGaveta && !caixaAberto)
                  }
                  onClick={() =>
                    executar(() =>
                      lancarNoFuncionario({
                        funcionario_id: funcionarioSelecionado,
                        tipo: "advance",
                        valor: paraNumero(valorAdiantamento) ?? 0,
                        motivo: motivoAdiantamento.trim(),
                        pelo_caixa: pelaGaveta,
                        tentativa: chave.current,
                      }),
                    )
                  }
                >
                  Registrar adiantamento
                </Button>
                <Button variante="secundario" onClick={() => setAdiantando(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <Button variante="secundario" onClick={() => setAdiantando(true)}>
              Registrar adiantamento
            </Button>
          )}
        </div>
      ) : null}

      {funcionarioSelecionado && diferencas.length > 0 ? (
        <DiferencasDeAcerto
          diferencas={diferencas}
          funcionarioId={funcionarioSelecionado}
          podeDecidir={podeLancar}
        />
      ) : null}

      {historico === null ? null : historico.lancamentos.length === 0 ? (
        <div className="mt-3">
          <EmptyState titulo="Sem lançamentos" descricao="Nada registrado para esta pessoa." />
        </div>
      ) : (
        <div className="mt-3">
          {historico.lancamentos.map((l) => (
            <LinhaLista key={l.lancamento_id}>
              <div className="min-w-[200px] flex-1">
                <p className="m-0 text-[14px] font-semibold text-ink">
                  {ROTULO_LANCAMENTO[l.tipo] ?? l.tipo}
                </p>
                <p className="m-0 text-[12.5px] text-muted">
                  {new Date(l.quando).toLocaleString("pt-BR")} · {l.motivo}
                </p>
                {l.pago_pela_gaveta ? (
                  <p className="m-0 text-[12.5px] text-muted">
                    Pago pela gaveta — há um movimento de caixa vinculado a este lançamento.
                  </p>
                ) : null}
              </div>
              <span className="text-[13.5px] font-semibold text-ink">{formatBRL(l.valor)}</span>
              {l.status === "reversed" ? (
                <Badge tom="indisponivel">Estornado</Badge>
              ) : podeLancar ? (
                <Button
                  variante="secundario"
                  disabled={enviando}
                  onClick={() => setEstornando(`lanc:${l.lancamento_id}`)}
                >
                  Estornar
                </Button>
              ) : null}
            </LinhaLista>
          ))}

          <div className="mt-3">
            <ParDeDados
              chave="Total em conferência"
              valor={formatBRL(historico.total_confirmado)}
            />
          </div>
          <p className="m-0 mt-2 text-[12.5px] text-muted">
            Este total é conferência, não cobrança automática. Nada aqui altera salário.
          </p>
        </div>
      )}

      {estornando?.startsWith("lanc:") ? (
        <div className="mt-3 flex flex-col gap-2">
          <Textarea
            label="Por que está estornando este lançamento?"
            value={motivoEstorno}
            onChange={(e) => setMotivoEstorno(e.target.value)}
            rows={2}
          />
          <div className="flex gap-2">
            <Button
              variante="primario"
              disabled={enviando || motivoEstorno.trim().length < 3}
              onClick={() =>
                executar(() =>
                  reverterLancamentoFuncionario({
                    id: estornando.slice(5),
                    motivo: motivoEstorno.trim(),
                  }),
                )
              }
            >
              Confirmar estorno
            </Button>
            <Button variante="secundario" onClick={() => setEstornando(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}
    </Cartao>
  );

  return (
    <div className="flex flex-col gap-4">
      <Aviso {...(erro ? { erro } : {})} />

      {/* Sem permissão financeira a aba sequer existe — e a RLS recusaria
          igual se alguém chamasse a projeção direto (CLAUDE.md §12). */}
      <Abas
        abas={[
          { nome: "Movimentações", valor: "movimentos" },
          { nome: "Equipe", valor: "equipe" },
          // A aba do dinheiro só existe para quem tem a permissão dele.
          ...(podeVerFinanceiro
            ? [{ nome: "Histórico financeiro", valor: "livro" }]
            : []),
          ...(podeGerirPermissoes ? [{ nome: "Permissões", valor: "permissoes" }] : []),
        ]}
        atual={aba}
        parametro="aba"
        base="/admin/equipe"
      />

      {aba === "equipe" ? (
        <GestaoDaEquipe
          equipe={equipe}
          papeis={papeis}
          referencias={referencias}
          podeGerir={podeGerirEquipe}
          podeGerirSalario={podeGerirSalario}
          podeGerirAcesso={podeGerirAcesso}
        />
      ) : aba === "permissoes" && podeGerirPermissoes ? (
        <PermissoesDosPapeis
          papeis={permissoesDosPapeis.papeis}
          catalogo={permissoesDosPapeis.catalogo}
        />
      ) : aba === "livro" && podeVerFinanceiro ? (
        livro
      ) : (
        registro
      )}
    </div>
  );
}
