import { formatBRL } from "@/lib/format";
import { StatusBadge, Input } from "@/ui/components";
import { EmptyState } from "@/ui/patterns";
import {
  listarPromocoes,
  listarProdutos,
  listarTamanhos,
  listarVariacoes,
} from "@/application/catalogo/consultas";
import {
  salvarPromocao,
  alternarAtivoPromocao,
  removerPromocao,
} from "@/application/catalogo/acoes";
import type { PromocaoAdmin, SituacaoPromocao } from "@/application/catalogo/tipos";
import { FormularioAcao } from "./FormularioAcao";
import { BotaoAcao } from "./BotaoAcao";
import { NovoItem } from "./NovoItem";
import { SeletorDeItensDaPromocao, type OpcaoDeItem } from "./SeletorDeItensDaPromocao";
import { QuandoValeAPromocao } from "./QuandoValeAPromocao";

/**
 * Promoções — aba do design, com o cartão de nome, status, valor e período.
 *
 * V1 = PREÇO PROMOCIONAL SIMPLES (CLAUDE.md §19). Sem cupom, sem leve-3-pague-2,
 * sem cashback, sem motor de descontos.
 *
 * A SITUAÇÃO NÃO É UM CAMPO: vem calculada do banco a partir do período e do
 * liga/desliga. Uma promoção não "vira" encerrada por rotina — ela apenas
 * deixa de valer quando a data passa (RN-PROMO-002).
 *
 * Períodos sobrepostos para o mesmo alvo são recusados pelo próprio banco
 * (RN-PROMO-004), não por validação de tela.
 */

const TOM: Record<SituacaoPromocao, "sucesso" | "info" | "neutro" | "atencao"> = {
  vigente: "sucesso",
  fora_do_dia: "atencao",
  agendada: "info",
  encerrada: "neutro",
  inativa: "neutro",
};

const ROTULO: Record<SituacaoPromocao, string> = {
  vigente: "Valendo agora",
  fora_do_dia: "Hoje não vale",
  agendada: "Agendada",
  encerrada: "Encerrada",
  inativa: "Pausada",
};

const DIA_LONGO: Record<number, string> = {
  1: "segunda", 2: "terça", 3: "quarta", 4: "quinta", 5: "sexta", 6: "sábado", 7: "domingo",
};

function formatarData(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function quandoVale(p: PromocaoAdmin): string {
  const dias =
    p.dias && p.dias.length < 7
      ? `Toda ${[...p.dias].sort((a, b) => a - b).map((d) => DIA_LONGO[d]).join(", ")}`
      : "Todos os dias";
  const periodo = p.fim
    ? `de ${formatarData(p.inicio)} até ${formatarData(p.fim)}`
    : `a partir de ${formatarData(p.inicio)}, sem data para acabar`;
  return `${dias} · ${periodo}`;
}

/** A situação da promoção inteira, a partir da de cada item. */
function situacaoDaCampanha(itens: PromocaoAdmin[]): SituacaoPromocao {
  const ordem: SituacaoPromocao[] = ["vigente", "fora_do_dia", "agendada", "encerrada", "inativa"];
  return ordem.find((o) => itens.some((i) => i.situacao === o)) ?? "inativa";
}

export async function PainelPromocoes({ podeGerenciar }: { podeGerenciar: boolean }) {
  const [promocoes, produtos, tamanhos] = await Promise.all([
    listarPromocoes(),
    listarProdutos(),
    listarTamanhos(),
  ]);

  // Alvos possíveis (RN-PROMO-003): uma VARIAÇÃO específica, ou um produto de
  // preço próprio — bebida, fogazza, combo. Produto com tamanho de pizza não
  // pode ser alvo direto: a autoridade de preço dele está na variação.
  const comVariacao = produtos.filter((p) => p.ativo && p.tamanhos > 0);

  const variacoesPorProduto = await Promise.all(
    comVariacao.map(async (p) => ({ produto: p, variacoes: await listarVariacoes(p.id) })),
  );

  // O preço de fogazza não conta como tamanho (D-2026-09-29-100): a pizza de
  // preço único que também é vendida como fogazza continua podendo ter
  // promoção no produto — e a fogazza dela, na variação.
  const tamanhosDeFogazza = new Set(
    tamanhos.filter((t) => t.sold_as === "fogazza").map((t) => t.id),
  );
  const soFogazza = new Set(
    variacoesPorProduto
      .filter(({ variacoes }) => variacoes.every((v) => tamanhosDeFogazza.has(v.tamanho_id)))
      .map(({ produto }) => produto.id),
  );
  const comPrecoProprio = produtos.filter(
    (p) => p.ativo && p.preco_base !== null && (p.tamanhos === 0 || soFogazza.has(p.id)),
  );

  const opcoes: OpcaoDeItem[] = [
    ...variacoesPorProduto.flatMap(({ produto, variacoes }) =>
      variacoes.map((v) => ({
        valor: `variant:${v.id}`,
        nome: `${produto.nome} · ${v.tamanho_nome}`,
        detalhe: formatBRL(v.preco),
        grupo: produto.categoria_nome,
      })),
    ),
    ...comPrecoProprio.map((p) => ({
      valor: `product:${p.id}`,
      nome: p.nome,
      detalhe: p.preco_base === null ? "—" : formatBRL(p.preco_base),
      grupo: p.categoria_nome,
    })),
  ];

  // Uma promoção = todas as linhas com a mesma campanha.
  const campanhas = new Map<string, PromocaoAdmin[]>();
  for (const p of promocoes) {
    const lista = campanhas.get(p.campanha_id) ?? [];
    lista.push(p);
    campanhas.set(p.campanha_id, lista);
  }
  const grupos = [...campanhas.values()];
  const vigentes = grupos.filter((g) => situacaoDaCampanha(g) === "vigente").length;

  return (
    <div className="flex flex-col gap-4">
      {podeGerenciar ? (
        <NovoItem
          titulo="Nova promoção"
          descricao="Escolha os itens, o preço e quando vale. Um preço promocional simples — sem cupom nem desconto percentual."
          aberto={grupos.length === 0}
        >
          <FormularioAcao acao={salvarPromocao} rotulo="Criar promoção" limparAoSalvar>
            <Input label="Nome da promoção" name="nome" required placeholder="Ex.: Terça da Calabresa" />
            <SeletorDeItensDaPromocao opcoes={opcoes} />
            <Input
              label="Preço promocional (cada item)"
              name="preco"
              inputMode="decimal"
              required
              placeholder="Ex.: 45,90"
              hint="Este valor substitui o preço normal de cada item marcado."
            />
            <QuandoValeAPromocao />
            <Input
              label="Limite por pedido (opcional)"
              name="limite"
              type="number"
              min={1}
              hint="Quantas unidades de cada item podem sair em promoção por pedido."
            />
          </FormularioAcao>
        </NovoItem>
      ) : null}

      {grupos.length === 0 ? (
        <EmptyState
          titulo="Nenhuma promoção cadastrada"
          descricao="Uma promoção define um preço promocional para um ou mais itens, com dias da semana, período ou os dois."
        />
      ) : (
        <>
          <p className="m-0 text-[13.5px] text-ink-2">
            {grupos.length === 1 ? "1 promoção" : `${grupos.length} promoções`}
            {vigentes > 0 ? ` · ${vigentes} valendo agora` : " · nenhuma valendo agora"}
          </p>
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
            {grupos.map((itens) => {
              const primeiro = itens[0]!;
              const situacao = situacaoDaCampanha(itens);
              const pausada = situacao === "inativa";
              return (
                <article
                  key={primeiro.campanha_id}
                  className={[
                    "rounded-14 border border-border-shalon bg-surface p-[14px]",
                    pausada || situacao === "encerrada" ? "opacity-80" : "",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-[10px]">
                    <h3 className="m-0 text-[16px] font-bold text-ink">{primeiro.nome}</h3>
                    <StatusBadge tom={TOM[situacao]}>{ROTULO[situacao]}</StatusBadge>
                  </div>

                  <p className="m-0 mt-1 text-[13px] text-ink-2">{quandoVale(primeiro)}</p>

                  <ul className="m-0 mt-3 flex list-none flex-col gap-1 p-0">
                    {itens.map((i) => (
                      <li key={i.id} className="flex items-baseline justify-between gap-3 text-[13.5px]">
                        <span className="min-w-0 truncate text-ink">{i.alvo_nome ?? "item removido"}</span>
                        <span className="shrink-0 tabular-nums">
                          <span className="font-bold text-ink">{formatBRL(i.preco_promocional)}</span>
                          {i.preco_normal !== null ? (
                            <span className="ml-1.5 text-[12.5px] text-muted line-through">
                              {formatBRL(i.preco_normal)}
                            </span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {primeiro.limite_por_pedido !== null ? (
                    <p className="m-0 mt-2 text-[12.5px] text-muted">
                      Limite de {primeiro.limite_por_pedido} por pedido
                    </p>
                  ) : null}

                  {podeGerenciar ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border-shalon pt-3">
                      <BotaoAcao
                        acao={alternarAtivoPromocao}
                        campos={{ campanha: primeiro.campanha_id, ativar: String(pausada) }}
                      >
                        {pausada ? "Retomar" : "Pausar"}
                      </BotaoAcao>
                      <BotaoAcao
                        acao={removerPromocao}
                        campos={{ campanha: primeiro.campanha_id }}
                        tom="perigo"
                        confirmar="Excluir esta promoção?"
                      >
                        Excluir
                      </BotaoAcao>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
