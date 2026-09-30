import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatBRL } from "@/lib/format";
import { Input, Select, StatusBadge } from "@/ui/components";
import { Cartao, LinhaLista } from "@/ui/patterns";
import { obterSessaoInterna, podeNaUI } from "@/application/auth/sessao";
import {
  lerCodigosDeBarras,
  listarCategorias,
  listarTamanhos,
  listarSaboresParaFogazza,
  listarVariacoes,
  obterEscolhaDeSabor,
  obterProduto,
} from "@/application/catalogo/consultas";
import {
  alternarAtivoProduto,
  alternarDisponibilidadeProduto,
  alternarDisponibilidadeVariacao,
  montarFogazza,
  removerVariacao,
  salvarVariacao,
} from "@/application/catalogo/acoes";
import { substituirImagemDoProduto, urlPublica } from "@/application/midia/imagem";
import { AbasEdicaoProduto, type SecaoEdicaoProduto } from "./AbasEdicaoProduto";
import { BotaoAcao } from "./BotaoAcao";
import { FormularioAcao } from "./FormularioAcao";
import { FormularioProduto } from "./FormularioProduto";
import { PainelCodigosDeBarras } from "./PainelCodigosDeBarras";
import { ModalFerramentaCatalogo } from "./ModalFerramentaCatalogo";
import { ListaSaboresDaFogazza } from "./ListaSaboresDaFogazza";

export async function EdicaoProduto({
  id,
  emModal = false,
  fecharComVoltar = false,
}: {
  id: string;
  emModal?: boolean;
  fecharComVoltar?: boolean;
}) {
  const [produto, categorias, tamanhos, sessao, variacoes] = await Promise.all([
    obterProduto(id),
    listarCategorias(),
    listarTamanhos(),
    obterSessaoInterna(),
    listarVariacoes(id),
  ]);

  if (!produto) {
    if (emModal) return null;
    notFound();
  }

  const podeGerenciar = podeNaUI(sessao, "catalog.manage");
  // Card de entrada de fogazza (RN-FOG-003): de onde vêm os sabores. Só é lido
  // para produto do tipo fogazza.
  const escolhaDeSabor =
    produto.tipo === "fogazza" ? await obterEscolhaDeSabor(produto.id) : null;
  const ehCardDeFogazza = Boolean(escolhaDeSabor?.categoria_sabores_id);
  // RN-FOG-009: fogazza não tem tamanho. A comum tem preço próprio, e o card
  // vende os sabores — nenhuma das duas mostra a aba Tamanhos.
  const usaTamanho = produto.tipo !== "combo" && produto.tipo !== "fogazza";
  const saboresParaFogazza =
    escolhaDeSabor?.categoria_sabores_id
      ? await listarSaboresParaFogazza(
          escolhaDeSabor.categoria_sabores_id,
          escolhaDeSabor.tamanho_fogazza_id,
        )
      : [];
  // O tamanho de fogazza só existe em sabor de pizza (RN-FOG-002); o banco
  // recusaria, a tela nem oferece.
  const tamanhosDisponiveis = tamanhos.filter(
    (t) =>
      t.is_active &&
      !variacoes.some((v) => v.tamanho_id === t.id) &&
      (t.sold_as === "pizza" || produto.tipo === "pizza"),
  );
  const imagemUrl = produto.imagem_path ? await urlPublica(produto.imagem_path) : null;

  // Uma leitura para o produto e uma por variante. São poucas — o catálogo da
  // Shalon tem dois tamanhos — e cada uma é filtrada pela policy `catalog.view`.
  const [codigosDoProduto, codigosDasVariacoes] = await Promise.all([
    lerCodigosDeBarras({ produtoId: produto.id }),
    Promise.all(
      variacoes.map(async (v) => ({
        variacao: v,
        codigos: await lerCodigosDeBarras({ varianteId: v.id }),
      })),
    ),
  ]);

  // 09 §2.3: um código no PRODUTO resolve direto só se o produto não tiver
  // variante ativa. Tendo, o leitor pede o tamanho. A tela não proíbe — a regra
  // é sobre resolução, não sobre cadastro — mas precisa dizer o que vai
  // acontecer, senão alguém cadastra no produto e estranha o PDV depois.
  const temVarianteAtiva = variacoes.some((v) => v.ativa);

  const dados = (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tom={produto.disponivel ? "sucesso" : produto.ativo ? "atencao" : "neutro"}>
          {produto.disponivel ? "Disponível" : produto.ativo ? "Indisponível" : "Inativo"}
        </StatusBadge>
        {podeGerenciar ? (
          <>
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
          </>
        ) : null}
      </div>
      <FormularioProduto produto={produto} categorias={categorias} numerado={false} />
    </div>
  );

  const tamanhosHabilitados = usaTamanho ? (
    <Cartao
      titulo="Tamanhos habilitados"
      descricao="Nem toda pizza precisa existir em todos os tamanhos. O preço é por combinação produto × tamanho."
      largura="cheio"
    >
      {variacoes.length === 0 ? (
        <p className="m-0 py-2 text-[13.5px] text-muted">
          Nenhum tamanho habilitado. Sem ao menos um tamanho disponível, este produto não aparece
          para o cliente.
        </p>
      ) : (
        variacoes.map((v) => (
          <LinhaLista key={v.id}>
            <div className="min-w-[160px] flex-1">
              <p className="m-0 text-[14px] font-semibold text-ink">{v.tamanho_nome}</p>
              <p className="mt-[2px] text-[12.5px] text-muted">
                {v.fatias} fatias · {v.max_sabores === 1 ? "1 sabor" : `até ${v.max_sabores} sabores`}
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
  ) : null;

  const personalizacao = produto.tipo === "pizza" ? (
    <Cartao titulo="Personalização" largura="cheio">
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
          O preço considerado é sempre o do sabor de maior valor — essa regra não é configurável.
        </p>
      </div>
      <p className="mt-[10px] text-[12.5px] text-muted">
        Bordas e adicionais seguem as listas ativas nas abas correspondentes.
      </p>
    </Cartao>
  ) : null;

  const imagem = (
    <Cartao titulo="Imagem do produto" largura="cheio">
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
            hint="Até 8 MB. A imagem é redimensionada e convertida para WebP; a anterior só é apagada depois que a troca dá certo."
          />
        </FormularioAcao>
      ) : null}
    </Cartao>
  );

  const codigosDeBarras = (
    <div className="flex flex-col gap-4">
      <PainelCodigosDeBarras
        titulo="Códigos do produto"
        descricao={
          temVarianteAtiva
            ? "Este produto tem tamanhos. Um código cadastrado aqui não entra direto pelo leitor: o PDV vai pedir para escolher o tamanho. Para bipar e entrar, use os códigos por tamanho abaixo."
            : "O código cadastrado aqui entra direto pelo leitor. Vários códigos por item são permitidos — EAN do fabricante e código interno da casa convivem."
        }
        produtoId={produto.id}
        codigos={codigosDoProduto}
        podeGerenciar={podeGerenciar}
      />

      {codigosDasVariacoes.map(({ variacao, codigos }) => (
        <PainelCodigosDeBarras
          key={variacao.id}
          titulo={`Códigos · ${variacao.tamanho_nome}`}
          descricao="Código deste tamanho. É o que entra direto pelo leitor, sem pedir escolha."
          produtoId={produto.id}
          varianteId={variacao.id}
          codigos={codigos}
          podeGerenciar={podeGerenciar}
        />
      ))}
    </div>
  );

  const categoriaDosSabores = escolhaDeSabor?.categoria_sabores_id ?? "";
  const saboresDaFogazza =
    escolhaDeSabor !== null ? (
      <Cartao
        titulo="Sabores da fogazza"
        descricao="Escolha de qual categoria de pizza vêm os sabores e marque quais entram, com o preço de fogazza de cada um. O preço fica guardado no próprio sabor. Em branco, é uma fogazza comum, com preço próprio."
        largura="cheio"
      >
        {podeGerenciar ? (
          <FormularioAcao acao={montarFogazza} rotulo="Salvar sabores da fogazza">
            <input type="hidden" name="produto_id" value={produto.id} />
            <input type="hidden" name="categoria_da_lista" value={categoriaDosSabores} />
            <Select
              label="Sabores de"
              name="categoria_sabores_id"
              defaultValue={categoriaDosSabores}
              hint={
                categoriaDosSabores
                  ? "Ao trocar a categoria, salve para ver os sabores dela."
                  : "Escolha a categoria e salve para ver a lista de sabores."
              }
            >
              <option value="">Nenhuma (fogazza comum)</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            {categoriaDosSabores ? (
              <ListaSaboresDaFogazza sabores={saboresParaFogazza} podeGerenciar={podeGerenciar} />
            ) : null}
          </FormularioAcao>
        ) : ehCardDeFogazza ? (
          <ListaSaboresDaFogazza sabores={saboresParaFogazza} podeGerenciar={false} />
        ) : (
          <p className="m-0 text-[13.5px] text-ink-2">Fogazza comum, com preço próprio.</p>
        )}
      </Cartao>
    ) : null;

  const secoes: SecaoEdicaoProduto[] = [
    { id: "dados", nome: "Dados", conteudo: dados },
    ...(saboresDaFogazza
      ? [{ id: "sabores", nome: "Sabores", conteudo: saboresDaFogazza }]
      : []),
    ...(tamanhosHabilitados
      ? [{ id: "tamanhos", nome: "Tamanhos", conteudo: tamanhosHabilitados }]
      : []),
    ...(personalizacao
      ? [{ id: "personalizacao", nome: "Personalização", conteudo: personalizacao }]
      : []),
    { id: "codigos", nome: "Códigos de barras", conteudo: codigosDeBarras },
    { id: "imagem", nome: "Imagem", conteudo: imagem },
  ];

  const abas = <AbasEdicaoProduto secoes={secoes} />;

  if (emModal) {
    return (
      <ModalFerramentaCatalogo
        titulo={`Editar · ${produto.nome}`}
        tamanho="compacto"
        fecharComVoltar={fecharComVoltar}
      >
        {abas}
      </ModalFerramentaCatalogo>
    );
  }

  return (
    <div className="flex max-w-[720px] flex-col gap-4">
      <Link href="/admin/produtos" className="text-[13.5px] font-semibold text-ink-2">
        ← Voltar ao cardápio
      </Link>
      <h1 className="m-0 font-display text-[22px] font-extrabold text-ink">{produto.nome}</h1>
      {abas}
    </div>
  );
}
