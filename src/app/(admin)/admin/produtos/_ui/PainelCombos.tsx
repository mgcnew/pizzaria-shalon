import Link from "next/link";
import { formatBRL } from "@/lib/format";
import { StatusBadge, Input, SelectMenu } from "@/ui/components";
import { Cartao, EmptyState, LinhaLista } from "@/ui/patterns";
import {
  listarCombos,
  listarComponentesDoCombo,
  listarProdutos,
  listarVariacoes,
} from "@/application/catalogo/consultas";
import { adicionarComponente, removerComponente } from "@/application/catalogo/acoes";
import { FormularioAcao } from "./FormularioAcao";
import { BotaoAcao } from "./BotaoAcao";

/**
 * Combos — aba do design aprovado, com o cartão de nome, status, composição e
 * preço em Bricolage Grotesque tabular.
 *
 * ADAPTAÇÃO OBRIGATÓRIA EM RELAÇÃO AO PROTÓTIPO: o modal de combo do design
 * dizia "Defina os itens inclusos e as escolhas permitidas (ex.: 1 pizza com
 * até 2 sabores + 1 refrigerante entre as opções ativas). A composição é
 * dinâmica." Isso foi SUPERADO por D-2026-09-17-03 e 79.5: a V1 tem combo
 * FIXO, sem grupos de escolha e sem substituição. A tela reflete a regra
 * vigente — cada componente é um item exato, e pizza exige tamanho definido.
 *
 * RN-COMBO-004/005: a disponibilidade não é um botão. Ela é derivada dos
 * componentes, e volta sozinha quando todos voltarem.
 */
export async function PainelCombos({ podeGerenciar }: { podeGerenciar: boolean }) {
  const [combos, produtos] = await Promise.all([listarCombos(), listarProdutos()]);

  const candidatos = produtos.filter((p) => p.tipo !== "combo" && p.ativo);

  // Variações de cada candidato do tipo pizza: RN-COMBO-003 exige tamanho.
  const variacoesPorProduto = new Map(
    await Promise.all(
      candidatos
        .filter((p) => p.tamanhos > 0)
        .map(
          async (p) => [p.id, await listarVariacoes(p.id)] as const,
        ),
    ),
  );

  if (combos.length === 0) {
    return (
      <EmptyState
        titulo="Nenhum combo cadastrado"
        descricao="Crie um produto do tipo Combo com preço próprio e depois defina os itens exatos que ele inclui."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 max-w-[70ch] text-[13.5px] text-ink-2">
        Combos da V1 são fixos: o cliente não substitui item, não escolhe entre opções e não
        transforma a pizza do combo em meio a meio. Se qualquer componente ficar indisponível, o
        combo sai do cardápio sozinho e volta quando todos voltarem.
      </p>

      {await Promise.all(
        combos.map(async (combo) => {
          const componentes = await listarComponentesDoCombo(combo.id);
          return (
            <Cartao key={combo.id} largura="cheio">
              <div className="flex flex-wrap items-center justify-between gap-[10px]">
                <h3 className="m-0 text-[16px] font-bold text-ink">{combo.nome}</h3>
                <div className="flex items-center gap-2">
                  <StatusBadge tom={combo.disponivel ? "sucesso" : "atencao"}>
                    {combo.disponivel
                      ? "Disponível"
                      : combo.componentes === 0
                        ? "Sem componentes"
                        : "Componente indisponível"}
                  </StatusBadge>
                  <Link
                    href={`/admin/produtos/${combo.id}`}
                    className="text-[13px] font-semibold text-ink-2 hover:text-ink lg:hidden"
                  >
                    Editar dados
                  </Link>
                  <Link
                    href={`/admin/produtos?editar=${combo.id}`}
                    className="hidden text-[13px] font-semibold text-ink-2 hover:text-ink lg:inline"
                  >
                    Editar dados
                  </Link>
                </div>
              </div>

              <p className="mt-[6px] text-[13.5px] text-ink-2">
                Composição: {combo.composicao ?? "nenhum item definido"}
              </p>

              <p className="mt-[10px] font-display text-[21px] font-extrabold tabular-nums text-ink">
                {combo.preco_efetivo === null ? "—" : formatBRL(combo.preco_efetivo)}
              </p>
              {/* 79.5: a soma dos componentes é informação administrativa. O
                  preço cobrado é o do combo (RN-COMBO-006). */}
              {combo.soma_componentes !== null ? (
                <p className="mt-[2px] text-[12.5px] text-muted">
                  Somados separadamente, os itens dariam {formatBRL(combo.soma_componentes)} — esta
                  informação é só para conferência; o preço cobrado é o do combo.
                </p>
              ) : null}

              <div className="mt-3">
                {componentes.map((c) => (
                  <LinhaLista key={c.id}>
                    <p className="m-0 min-w-[160px] flex-1 text-[14px] font-semibold text-ink">
                      {c.quantidade}× {c.produtoNome}
                      {c.tamanhoNome ? (
                        <span className="font-normal text-ink-2"> · {c.tamanhoNome}</span>
                      ) : null}
                    </p>
                    {podeGerenciar ? (
                      <BotaoAcao
                        acao={removerComponente}
                        campos={{ id: c.id, combo_id: combo.id }}
                        tom="perigo"
                      >
                        Remover
                      </BotaoAcao>
                    ) : null}
                  </LinhaLista>
                ))}
              </div>

              {podeGerenciar ? (
              <div className="mt-3 rounded-12 border border-border-shalon bg-elev p-3">
                <FormularioAcao
                  acao={adicionarComponente}
                  rotulo="Adicionar item ao combo"
                  variante="secundario"
                >
                  <input type="hidden" name="combo_id" value={combo.id} />
                  <SelectMenu
                    label="Item"
                    name="produto_id"
                    required
                    placeholder="Escolha o produto"
                    opcoes={candidatos.map((p) => ({ valor: p.id, texto: p.nome }))}
                  />
                  <SelectMenu
                    label="Tamanho (obrigatório para pizza)"
                    name="variacao_id"
                    hint="Pizza dentro de combo é exata: sem tamanho definido, o cliente poderia escolher — e a V1 não permite."
                    opcoes={[
                      { valor: "", texto: "Sem tamanho (produto simples)" },
                      ...[...variacoesPorProduto.entries()].flatMap(([produtoId, variacoes]) => {
                        const produto = candidatos.find((p) => p.id === produtoId);
                        return variacoes.map((v) => ({
                          valor: v.id,
                          texto: `${produto?.nome ?? ""} · ${v.tamanho_nome}`,
                        }));
                      }),
                    ]}
                  />
                  <Input
                    label="Quantidade"
                    name="quantidade"
                    type="number"
                    min={1}
                    defaultValue={1}
                    required
                  />
                </FormularioAcao>
              </div>
              ) : null}
            </Cartao>
          );
        }),
      )}
    </div>
  );
}
