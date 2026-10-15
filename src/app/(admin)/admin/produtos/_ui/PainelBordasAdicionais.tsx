import { StatusBadge, Input, SelectMenu } from "@/ui/components";
import { Cartao, LinhaLista } from "@/ui/patterns";
import {
  listarAdicionais,
  listarBordas,
  listarPrecosDeAdicionais,
  listarPrecosDeBordas,
  listarTamanhos,
} from "@/application/catalogo/consultas";
import {
  salvarAdicional,
  salvarBorda,
  salvarPrecosDoItem,
  copiarPrecosDeAdicionais,
  alternarAtivoSimples,
  alternarDisponibilidadeSimples,
} from "@/application/catalogo/acoes";
import { FormularioAcao } from "./FormularioAcao";
import { BotaoAcao } from "./BotaoAcao";
import { NovoItem } from "./NovoItem";

/**
 * Bordas e adicionais — abas de lista do design.
 *
 * O ponto central, que vale para os dois: PREÇO E DISPONIBILIDADE SÃO POR
 * TAMANHO (RN-BORDA-002 e RN-ADD-002). A ausência de preço em um tamanho já
 * significa "não existe nesse tamanho" — por isso o campo em branco remove a
 * oferta em vez de gravar zero.
 *
 * A borda compatível com um tamanho vale por padrão para as pizzas daquele
 * tamanho (RN-BORDA-003); as exceções por produto ficam na tela do produto.
 */
export async function PainelBordasAdicionais({
  tipo,
  podeGerenciar,
}: {
  tipo: "borda" | "adicional";
  podeGerenciar: boolean;
}) {
  const ehBorda = tipo === "borda";

  const [itens, tamanhos, precos] = await Promise.all([
    ehBorda ? listarBordas() : listarAdicionais(),
    listarTamanhos(),
    ehBorda ? listarPrecosDeBordas() : listarPrecosDeAdicionais(),
  ]);

  // Fogazza não tem borda (RN-FOG-004): o tamanho de fogazza nem aparece
  // para borda. Para adicional ele aparece, com o preço próprio.
  const tamanhosAtivos = tamanhos.filter(
    (t) => t.is_active && !(ehBorda && t.sold_as === "fogazza"),
  );
  const tamanhosDePizza = tamanhosAtivos.filter((t) => t.sold_as === "pizza");
  const tamanhosDeFogazza = tamanhosAtivos.filter((t) => t.sold_as === "fogazza");
  // "Copiar preços da Tradicional" (decisão da Shalon): a Tradicional é a
  // origem sugerida; sem ela, o primeiro tamanho de pizza.
  const origemSugerida =
    tamanhosDePizza.find((t) => /tradicional/i.test(t.name)) ?? tamanhosDePizza[0];
  const tabela = ehBorda ? "crusts" : "addons";

  const precoDe = (itemId: string, tamanhoId: string): number | null => {
    const chave = ehBorda ? "crust_id" : "addon_id";
    const achado = (precos as unknown as Record<string, unknown>[]).find(
      (p) => p[chave] === itemId && p["size_id"] === tamanhoId,
    );
    return achado ? (achado["price"] as number) : null;
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 max-w-[70ch] text-[13.5px] text-ink-2">
        {ehBorda
          ? "Cada borda tem preço e disponibilidade por tamanho. Deixar o preço em branco significa que a borda não é oferecida naquele tamanho. O cliente escolhe no máximo uma borda por pizza."
          : "Cada adicional tem preço por tamanho. Um adicional entra ou não entra — não existe quantidade repetida do mesmo item. Em pizza meio a meio, o adicional vale para a pizza inteira."}
      </p>

      {tamanhosAtivos.length === 0 ? (
        <Cartao largura="cheio">
          <p className="m-0 py-2 text-[13.5px] text-muted">
            Cadastre ao menos um tamanho antes: o preço {ehBorda ? "da borda" : "do adicional"} é
            definido por tamanho.
          </p>
        </Cartao>
      ) : null}

      {!ehBorda && podeGerenciar && tamanhosDeFogazza.length > 0 && origemSugerida ? (
        <Cartao
          titulo="Preços dos adicionais na fogazza"
          descricao="Os adicionais da fogazza custam o mesmo de um tamanho de pizza. Copiar substitui, de uma vez, os preços que o tamanho de destino já tiver."
          largura="cheio"
        >
          <FormularioAcao
            acao={copiarPrecosDeAdicionais}
            rotulo={`Copiar preços da ${origemSugerida.name}`}
            variante="secundario"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectMenu
                label="Copiar de"
                name="de"
                valorInicial={origemSugerida.id}
                opcoes={tamanhosDePizza.map((t) => ({ valor: t.id, texto: t.name }))}
              />
              <SelectMenu
                label="Para"
                name="para"
                valorInicial={tamanhosDeFogazza[0]?.id ?? ""}
                opcoes={tamanhosDeFogazza.map((t) => ({ valor: t.id, texto: t.name }))}
              />
            </div>
          </FormularioAcao>
        </Cartao>
      ) : null}

      {itens.map((item) => {
        const oferecidoEm = tamanhosAtivos.filter((t) => precoDe(item.id, t.id) !== null).length;
        return (
          <Cartao key={item.id} largura="cheio">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className={["min-w-[140px] flex-1", item.is_active ? "" : "opacity-60"].join(" ")}>
                <p className="m-0 text-[15px] font-semibold text-ink">{item.name}</p>
                <p className="m-0 mt-[2px] text-[12.5px] text-muted">
                  {oferecidoEm === 0
                    ? "Não é oferecid" + (ehBorda ? "a" : "o") + " em nenhum tamanho"
                    : `Oferecid${ehBorda ? "a" : "o"} em ${oferecidoEm} de ${tamanhosAtivos.length} tamanhos`}
                </p>
              </div>
              {!item.is_active ? (
                <StatusBadge tom="neutro">Inativ{ehBorda ? "a" : "o"}</StatusBadge>
              ) : item.is_temporarily_available ? (
                <StatusBadge tom="sucesso">Disponível</StatusBadge>
              ) : (
                <StatusBadge tom="atencao">Indisponível hoje</StatusBadge>
              )}
              {podeGerenciar ? (
                <>
                  <BotaoAcao
                    acao={alternarDisponibilidadeSimples}
                    campos={{
                      tabela,
                      id: item.id,
                      disponivel: String(!item.is_temporarily_available),
                    }}
                  >
                    {item.is_temporarily_available ? "Em falta hoje" : "Voltou a ter"}
                  </BotaoAcao>
                  <BotaoAcao
                    acao={alternarAtivoSimples}
                    campos={{ tabela, id: item.id, ativar: String(!item.is_active) }}
                    {...(item.is_active
                      ? { confirmar: "Tirar do cardápio?", tom: "perigo" as const }
                      : {})}
                  >
                    {item.is_active ? "Inativar" : "Reativar"}
                  </BotaoAcao>
                </>
              ) : null}
            </div>

            {podeGerenciar && tamanhosAtivos.length > 0 ? (
              <FormularioAcao
                acao={salvarPrecosDoItem}
                rotulo="Salvar preços"
                variante="secundario"
                tamanho="sm"
                className="mt-3 border-t border-border-shalon pt-3"
              >
                <input type="hidden" name="tipo" value={tipo} />
                <input type="hidden" name="entidade_id" value={item.id} />
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
                  {tamanhosAtivos.map((t) => {
                    const preco = precoDe(item.id, t.id);
                    return (
                      <label key={t.id} className="flex min-w-0 flex-col gap-1">
                        <span className="truncate text-[12.5px] font-semibold text-ink-2">
                          {t.name}
                        </span>
                        <span className="flex min-h-[44px] items-center gap-1 rounded-11 border-[1.5px] border-border-shalon bg-surface px-3 focus-within:border-brand-orange">
                          <span aria-hidden="true" className="text-[13px] text-muted">
                            R$
                          </span>
                          <input
                            name={`preco_${t.id}`}
                            inputMode="decimal"
                            defaultValue={preco === null ? "" : preco.toFixed(2).replace(".", ",")}
                            placeholder="—"
                            aria-label={`Preço no tamanho ${t.name}; em branco não oferece`}
                            className="min-w-0 flex-1 border-0 bg-transparent text-[15px] tabular-nums text-ink outline-none placeholder:text-muted"
                          />
                        </span>
                      </label>
                    );
                  })}
                </div>
                <p className="m-0 text-[12.5px] text-muted">
                  Em branco, {ehBorda ? "a borda" : "o adicional"} não é oferecid
                  {ehBorda ? "a" : "o"} naquele tamanho.
                </p>
              </FormularioAcao>
            ) : null}
          </Cartao>
        );
      })}

      {podeGerenciar ? (
      <NovoItem titulo={ehBorda ? "Nova borda" : "Novo adicional"} aberto={itens.length === 0}>
        <FormularioAcao
          acao={ehBorda ? salvarBorda : salvarAdicional}
          rotulo={ehBorda ? "Criar borda" : "Criar adicional"}
          limparAoSalvar
        >
          <Input
            label="Nome"
            name="nome"
            required
            placeholder={ehBorda ? "Ex.: Catupiry" : "Ex.: Bacon"}
          />
          <Input label="Ordem" name="ordem" type="number" defaultValue={0} min={0} />
        </FormularioAcao>
      </NovoItem>
      ) : null}

      {itens.length === 0 ? (
        <LinhaLista>
          <p className="m-0 text-[13.5px] text-muted">
            Nenhum{ehBorda ? "a borda" : " adicional"} cadastrad{ehBorda ? "a" : "o"} ainda.
          </p>
        </LinhaLista>
      ) : null}
    </div>
  );
}
