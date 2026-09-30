import { formatBRL } from "@/lib/format";
import { StatusBadge, Input, SelectMenu } from "@/ui/components";
import { Cartao, EmptyState } from "@/ui/patterns";
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
import type { SituacaoPromocao } from "@/application/catalogo/tipos";
import { FormularioAcao } from "./FormularioAcao";
import { BotaoAcao } from "./BotaoAcao";

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

const TOM: Record<SituacaoPromocao, "sucesso" | "info" | "neutro"> = {
  vigente: "sucesso",
  agendada: "info",
  encerrada: "neutro",
  inativa: "neutro",
};

const ROTULO: Record<SituacaoPromocao, string> = {
  vigente: "Vigente",
  agendada: "Agendada",
  encerrada: "Encerrada",
  inativa: "Desativada",
};

function formatarData(iso: string | null): string {
  if (!iso) return "sem data de término";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

  return (
    <div className="flex flex-col gap-4">
      {promocoes.length === 0 ? (
        <EmptyState
          titulo="Nenhuma promoção cadastrada"
          descricao="Uma promoção define um preço promocional para um item, com período programado ou até você desativar."
        />
      ) : (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
          {promocoes.map((p) => (
            <article
              key={p.id}
              className="rounded-14 border border-border-shalon bg-surface p-[14px]"
            >
              <div className="flex items-center justify-between gap-[10px]">
                <h3 className="m-0 text-[16px] font-bold text-ink">{p.nome}</h3>
                <StatusBadge tom={TOM[p.situacao]}>{ROTULO[p.situacao]}</StatusBadge>
              </div>

              <p className="mt-[6px] text-[13.5px] text-ink-2">
                {p.alvo_nome ?? "item removido"}
              </p>

              <div className="mt-[10px] flex items-baseline gap-2">
                <span className="text-[15px] font-bold text-ink">
                  {formatBRL(p.preco_promocional)}
                </span>
                {p.preco_normal !== null ? (
                  <span className="text-[13px] text-muted line-through">
                    {formatBRL(p.preco_normal)}
                  </span>
                ) : null}
              </div>

              <p className="mt-[4px] text-[12.5px] text-muted">
                De {formatarData(p.inicio)} até {formatarData(p.fim)}
              </p>
              {p.limite_por_pedido !== null ? (
                <p className="mt-[2px] text-[12.5px] text-muted">
                  Limite de {p.limite_por_pedido} por pedido
                </p>
              ) : null}

              {podeGerenciar ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <BotaoAcao
                  acao={alternarAtivoPromocao}
                  campos={{ id: p.id, ativar: String(!p.ativa) }}
                >
                  {p.ativa ? "Desativar" : "Reativar"}
                </BotaoAcao>
                <BotaoAcao acao={removerPromocao} campos={{ id: p.id }} tom="perigo">
                  Excluir
                </BotaoAcao>
              </div>
              ) : null}
            </article>
          ))}
        </div>
      )}

      {podeGerenciar ? (
      <Cartao
        titulo="Nova promoção"
        descricao="Sem data de término, a promoção vale até você desativá-la."
      >
        <FormularioAcao acao={salvarPromocao} rotulo="Criar promoção">
          <Input label="Nome" name="nome" required placeholder="Ex.: Terça da Calabresa" />

          <SelectMenu
            label="Item em promoção"
            name="alvo"
            required
            placeholder="Escolha o item"
            opcoes={[
              ...variacoesPorProduto.flatMap(({ produto, variacoes }) =>
                variacoes.map((v) => ({
                  valor: `variant:${v.id}`,
                  texto: `${produto.nome} · ${v.tamanho_nome} (${formatBRL(v.preco)})`,
                  grupo: produto.nome,
                })),
              ),
              ...comPrecoProprio.map((p) => ({
                valor: `product:${p.id}`,
                texto: `${p.nome} (${p.preco_base === null ? "—" : formatBRL(p.preco_base)})`,
                grupo: "Preço próprio (bebida, fogazza, combo, pizza de preço único)",
              })),
            ]}
          />

          <Input
            label="Preço promocional"
            name="preco"
            inputMode="decimal"
            required
            placeholder="Ex.: 45,90"
          />
          <Input label="Começa em" name="inicio" type="datetime-local" required />
          <Input
            label="Termina em (opcional)"
            name="fim"
            type="datetime-local"
            hint="Em branco: vale até desativação manual."
          />
          <Input
            label="Limite por pedido (opcional)"
            name="limite"
            type="number"
            min={1}
            hint="Independente do limite normal do produto; quando os dois existem, vale o mais restritivo."
          />
        </FormularioAcao>
      </Cartao>
      ) : null}
    </div>
  );
}
