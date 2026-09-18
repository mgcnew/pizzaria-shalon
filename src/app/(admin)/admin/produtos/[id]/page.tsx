import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatBRL } from "@/lib/format";
import { Input, Select, StatusBadge } from "@/ui/components";
import { Cartao, LinhaLista } from "@/ui/patterns";
import { obterSessaoInterna, podeNaUI } from "@/application/auth/sessao";
import {
  listarCategorias,
  listarTamanhos,
  listarVariacoes,
  obterProduto,
} from "@/application/catalogo/consultas";
import {
  alternarAtivoProduto,
  alternarDisponibilidadeProduto,
  alternarDisponibilidadeVariacao,
  removerVariacao,
  salvarVariacao,
} from "@/application/catalogo/acoes";
import { substituirImagemDoProduto, urlPublica } from "@/application/midia/imagem";
import { FormularioProduto } from "../_ui/FormularioProduto";
import { FormularioAcao } from "../_ui/FormularioAcao";
import { BotaoAcao } from "../_ui/BotaoAcao";

export const metadata: Metadata = { title: "Produto" };

/**
 * Edição de produto — o conteúdo do modal do design, em rota própria.
 *
 * Segue a mesma sequência numerada do protótipo:
 *   1 · Dados básicos
 *   2 · Tamanhos habilitados   (só para produto que usa tamanho)
 *   3 · Personalização         (o aviso de meio a meio)
 *
 * O bloco "3 · Personalização" do design afirmava "Até 2 sabores por pizza" —
 * número fixo. Aqui ele é lido do TAMANHO (RN-PIZZA-002/004), porque é o
 * tamanho que define o máximo de sabores e ele é configurável. A frase que o
 * design já trazia — "o preço considerado é sempre o do sabor de maior valor,
 * essa regra não é configurável" — continua literal, porque continua verdade
 * (RN-PIZZA-005).
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [produto, categorias, tamanhos, sessao] = await Promise.all([
    obterProduto(id),
    listarCategorias(),
    listarTamanhos(),
    obterSessaoInterna(),
  ]);

  if (!produto) notFound();

  const podeGerenciar = podeNaUI(sessao, "catalog.manage");
  const variacoes = await listarVariacoes(produto.id);
  const usaTamanho = produto.tipo !== "combo";
  const tamanhosDisponiveis = tamanhos.filter(
    (t) => t.is_active && !variacoes.some((v) => v.tamanho_id === t.id),
  );
  const imagemUrl = produto.imagem_path ? await urlPublica(produto.imagem_path) : null;

  return (
    <div className="flex max-w-[720px] flex-col gap-4">
      <Link href="/admin/produtos" className="text-[13.5px] font-semibold text-ink-2">
        ← Voltar ao cardápio
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="m-0 flex-1 font-display text-[22px] font-extrabold text-ink">
          {produto.nome}
        </h1>
        <StatusBadge tom={produto.disponivel ? "sucesso" : produto.ativo ? "atencao" : "neutro"}>
          {produto.disponivel ? "Disponível" : produto.ativo ? "Indisponível" : "Inativo"}
        </StatusBadge>
      </div>

      {podeGerenciar ? (
        <div className="flex flex-wrap gap-2">
          {/* RN-DISP-001: dois estados diferentes, dois botões diferentes. */}
          <BotaoAcao
            acao={alternarDisponibilidadeProduto}
            campos={{ id: produto.id, disponivel: String(!produto.disponivel_hoje) }}
          >
            {produto.disponivel_hoje ? "Marcar indisponível hoje" : "Voltar a vender"}
          </BotaoAcao>
          <BotaoAcao
            acao={alternarAtivoProduto}
            campos={{ id: produto.id, ativar: String(!produto.ativo) }}
            tom={produto.ativo ? "perigo" : "neutro"}
          >
            {produto.ativo ? "Inativar cadastro" : "Reativar cadastro"}
          </BotaoAcao>
        </div>
      ) : null}

      <FormularioProduto produto={produto} categorias={categorias} />

      {usaTamanho ? (
        <Cartao
          titulo="2 · Tamanhos habilitados"
          descricao="Nem toda pizza precisa existir em todos os tamanhos. O preço é por combinação produto × tamanho."
          largura="cheio"
        >
          {variacoes.length === 0 ? (
            <p className="m-0 py-2 text-[13.5px] text-muted">
              Nenhum tamanho habilitado. Sem ao menos um tamanho disponível, este produto não
              aparece para o cliente.
            </p>
          ) : (
            variacoes.map((v) => (
              <LinhaLista key={v.id}>
                <div className="min-w-[160px] flex-1">
                  <p className="m-0 text-[14px] font-semibold text-ink">{v.tamanho_nome}</p>
                  <p className="mt-[2px] text-[12.5px] text-muted">
                    {v.fatias} fatias ·{" "}
                    {v.max_sabores === 1 ? "1 sabor" : `até ${v.max_sabores} sabores`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="m-0 text-[14px] font-semibold tabular-nums text-ink">
                    {formatBRL(v.preco_efetivo)}
                  </p>
                  {v.em_promocao ? (
                    <p className="m-0 text-[12px] text-muted line-through">{formatBRL(v.preco)}</p>
                  ) : null}
                </div>
                <StatusBadge tom={v.disponivel ? "sucesso" : "atencao"}>
                  {v.disponivel ? "Disponível" : "Indisponível"}
                </StatusBadge>
                {podeGerenciar ? (
                  <>
                    <BotaoAcao
                      acao={alternarDisponibilidadeVariacao}
                      campos={{
                        id: v.id,
                        produto_id: produto.id,
                        disponivel: String(!v.disponivel_hoje),
                      }}
                    >
                      Alternar
                    </BotaoAcao>
                    <BotaoAcao
                      acao={removerVariacao}
                      campos={{ id: v.id, produto_id: produto.id }}
                      tom="perigo"
                    >
                      Remover
                    </BotaoAcao>
                  </>
                ) : null}
              </LinhaLista>
            ))
          )}

          {podeGerenciar && tamanhosDisponiveis.length > 0 ? (
            <div className="mt-3 rounded-12 border border-border-shalon bg-elev p-3">
              <FormularioAcao acao={salvarVariacao} rotulo="Habilitar tamanho" variante="secundario">
                <input type="hidden" name="produto_id" value={produto.id} />
                <Select label="Tamanho" name="tamanho_id" required defaultValue="">
                  <option value="" disabled>
                    Escolha o tamanho
                  </option>
                  {tamanhosDisponiveis.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
                <Input
                  label="Preço neste tamanho"
                  name="preco"
                  inputMode="decimal"
                  required
                  placeholder="Ex.: 62,90"
                />
              </FormularioAcao>
            </div>
          ) : null}
        </Cartao>
      ) : null}

      {produto.tipo === "pizza" ? (
        <Cartao titulo="3 · Personalização" largura="cheio">
          <div className="rounded-12 border border-twb bg-tw p-3">
            <p className="m-0 text-[13px] font-bold text-twf">
              {variacoes.some((v) => v.max_sabores > 1)
                ? "Meio a meio habilitado"
                : "Meio a meio indisponível nestes tamanhos"}
            </p>
            <p className="mt-1 text-[13px] text-ink-2">
              {variacoes.length === 0
                ? "Habilite um tamanho para definir quantos sabores a pizza aceita."
                : variacoes
                    .map((v) => `${v.tamanho_nome}: até ${v.max_sabores} sabor(es)`)
                    .join(" · ")}
            </p>
            <p className="mt-1 text-[13px] text-ink-2">
              O preço considerado é sempre o do sabor de maior valor — essa regra não é
              configurável.
            </p>
          </div>
          <p className="mt-[10px] text-[12.5px] text-muted">
            Bordas e adicionais seguem as listas ativas nas abas correspondentes.
          </p>
        </Cartao>
      ) : null}

      <Cartao titulo="Imagem" largura="cheio">
        {imagemUrl ? (
          <Image
            src={imagemUrl}
            alt={`Imagem de ${produto.nome}`}
            width={240}
            height={160}
            className="mb-3 h-40 w-60 rounded-12 object-cover"
          />
        ) : (
          <p className="m-0 mb-3 text-[13.5px] text-muted">
            Sem imagem. O cardápio usa o placeholder da Shalon enquanto não houver uma.
          </p>
        )}

        {podeGerenciar ? (
          <FormularioAcao
            acao={substituirImagemDoProduto}
            rotulo="Enviar imagem"
            variante="secundario"
          >
            <input type="hidden" name="produto_id" value={produto.id} />
            <Input
              label="Arquivo"
              name="arquivo"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              required
              hint="Até 8 MB. A imagem é redimensionada e convertida para WebP antes de ir para o Storage; a anterior só é apagada depois que a troca dá certo."
            />
          </FormularioAcao>
        ) : null}
      </Cartao>
    </div>
  );
}
