import { Input, Select, Textarea } from "@/ui/components";
import { Cartao } from "@/ui/patterns";
import { salvarProduto } from "@/application/catalogo/acoes";
import { TIPOS_PRODUTO, type Categoria, type ProdutoAdmin } from "@/application/catalogo/tipos";
import { FormularioAcao } from "./FormularioAcao";

/**
 * Dados básicos do produto — o passo "1 · Dados básicos" do modal do design.
 *
 * O protótipo tinha um seletor de tipo em pílulas e o aviso de que "as seções
 * de personalização mudam conforme o tipo — refrigerante não recebe sabores
 * nem borda" (RN-BEB-001; a fogazza por sabor é RN-FOG-002..006). Aqui o tipo é um
 * select porque o formulário é renderizado no servidor, sem estado de
 * cliente para trocar as pílulas.
 *
 * "Preço base" existe, como no design, mas com o esclarecimento que o
 * protótipo não dava: para pizza a autoridade de preço é a VARIAÇÃO por
 * tamanho (02 §5.2), não este campo.
 */
export function FormularioProduto({
  produto,
  categorias,
  integrado = false,
  numerado = true,
}: {
  produto?: ProdutoAdmin;
  categorias: Categoria[];
  integrado?: boolean;
  numerado?: boolean;
}) {
  const novo = !produto;
  const descricao = novo
    ? "Cada sabor de pizza é um produto próprio. Tamanhos e preços vêm depois de salvar."
    : undefined;

  const formulario = (
    <FormularioAcao acao={salvarProduto} rotulo={novo ? "Criar produto" : "Salvar alterações"}>
      {produto ? <input type="hidden" name="id" value={produto.id} /> : null}

      <Select
        label="Tipo de produto"
        name="tipo"
        required
        defaultValue={produto?.tipo ?? "pizza"}
        hint="Bebida não recebe tamanho, meio a meio nem borda. Fogazza por sabor: crie o produto do tipo Fogazza e, depois de salvar, escolha de onde vêm os sabores na aba Sabores."
      >
        {TIPOS_PRODUTO.map((t) => (
          <option key={t.valor} value={t.valor}>
            {t.rotulo}
          </option>
        ))}
      </Select>

      <Input
        label="Nome do produto"
        name="nome"
        required
        defaultValue={produto?.nome ?? ""}
        placeholder="Ex.: Calabresa"
      />

      <Textarea
        label="Descrição que o cliente vê no cardápio"
        name="descricao"
        defaultValue={produto?.descricao ?? ""}
      />

      <Select
        label="Categoria"
        name="categoria_id"
        required
        defaultValue={produto?.categoria_id ?? ""}
      >
        <option value="" disabled>
          Escolha a categoria
        </option>
        {categorias.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
            {c.is_active ? "" : " (inativa)"}
          </option>
        ))}
      </Select>

      <Input
        label="Preço próprio"
        name="preco"
        inputMode="decimal"
        defaultValue={produto?.preco_base === null || produto === undefined ? "" : String(produto.preco_base).replace(".", ",")}
        placeholder="Ex.: 56,90"
        hint="Use para bebida, fogazza, combo e pizza de preço único. Pizza com tamanhos ignora este campo — o preço é por tamanho. O preço de fogazza não conta como tamanho."
      />

      <Input
        label="Limite de quantidade por pedido (opcional)"
        name="limite_por_pedido"
        type="number"
        min={1}
        defaultValue={produto?.limite_por_pedido ?? ""}
      />

      <Input
        label="Limite de adicionais (opcional)"
        name="limite_adicionais"
        type="number"
        min={0}
        defaultValue={produto?.limite_adicionais ?? ""}
        hint="Em branco: sem limite."
      />

      <Input label="Ordem no cardápio" name="ordem" type="number" min={0} defaultValue={produto?.ordem ?? 0} />

      {/*
        EXIGE PRODUÇÃO — Sim/Não, e não uma caixa de marcar.
        Com checkbox, "desmarcado" e "campo não enviado" chegam iguais no
        servidor, e um produto novo nasceria sem produção por omissão. Rádio
        manda sempre um valor, então o default conservador do banco continua
        valendo de ponta a ponta.
      */}
      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-[6px] p-0 text-[14px] font-semibold text-ink">
          Exige produção
        </legend>
        <div className="flex flex-wrap gap-4">
          {[
            { valor: "sim", rotulo: "Sim" },
            { valor: "nao", rotulo: "Não" },
          ].map((op) => (
            <label
              key={op.valor}
              className="flex min-h-touch cursor-pointer items-center gap-[8px] text-[14px] text-ink"
            >
              <input
                type="radio"
                name="exige_producao"
                value={op.valor}
                defaultChecked={
                  op.valor === ((produto?.exige_producao ?? true) ? "sim" : "nao")
                }
                className="h-5 w-5 accent-[var(--brand-orange)]"
              />
              {op.rotulo}
            </label>
          ))}
        </div>
        <p className="m-0 mt-1 text-[12px] text-muted">
          Pizza e fogazza: Sim. Bebida e produto pronto: Não. Um pedido só com
          itens “Não” dispensa a fila de produção — e só ele.
        </p>
      </fieldset>

      <label className="flex min-h-touch items-center gap-[10px] text-[14px] font-semibold text-ink">
        <input
          type="checkbox"
          name="destaque"
          defaultChecked={produto?.destaque ?? false}
          className="h-5 w-5 accent-[var(--brand-orange)]"
        />
        Recomendado pela Shalon
      </label>
      <p className="m-0 -mt-1 text-[12px] text-muted">
        Destaque é escolha manual e independe do ranking de &ldquo;Mais pedidos&rdquo;.
      </p>
    </FormularioAcao>
  );

  if (integrado) {
    return (
      <section className="rounded-16 border border-border-shalon bg-surface p-4 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0">
        <div className="mb-4">
          <h3 className="m-0 text-[15.5px] font-bold text-ink">
            {numerado ? "1 · Dados básicos" : "Dados básicos"}
          </h3>
          {descricao ? <p className="mt-1 text-[12.5px] text-muted">{descricao}</p> : null}
        </div>
        {formulario}
      </section>
    );
  }

  return (
    <Cartao
      titulo={numerado ? "1 · Dados básicos" : "Dados básicos"}
      {...(descricao ? { descricao } : {})}
    >
      {formulario}
    </Cartao>
  );
}
