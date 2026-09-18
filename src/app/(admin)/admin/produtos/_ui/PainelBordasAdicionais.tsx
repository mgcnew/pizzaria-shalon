import { StatusBadge, Input } from "@/ui/components";
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
  salvarPrecoPorTamanho,
  alternarAtivoSimples,
  alternarDisponibilidadeSimples,
} from "@/application/catalogo/acoes";
import { FormularioAcao } from "./FormularioAcao";
import { BotaoAcao } from "./BotaoAcao";

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

  const tamanhosAtivos = tamanhos.filter((t) => t.is_active);
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

      {itens.map((item) => (
        <Cartao key={item.id} largura="cheio">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <p className="m-0 min-w-[140px] flex-1 text-[15px] font-semibold text-ink">
              {item.name}
            </p>
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
              Alternar disponibilidade
            </BotaoAcao>
            <BotaoAcao
              acao={alternarAtivoSimples}
              campos={{ tabela, id: item.id, ativar: String(!item.is_active) }}
            >
              {item.is_active ? "Inativar" : "Reativar"}
            </BotaoAcao>
              </>
            ) : null}
          </div>

          {podeGerenciar ? (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
            {tamanhosAtivos.map((t) => {
              const preco = precoDe(item.id, t.id);
              return (
                <div
                  key={t.id}
                  className="rounded-11 border border-border-shalon bg-elev p-3"
                >
                  <FormularioAcao
                    acao={salvarPrecoPorTamanho}
                    rotulo={preco === null ? "Oferecer neste tamanho" : "Salvar"}
                    variante="secundario"
                    tamanho="sm"
                  >
                    <input type="hidden" name="tipo" value={tipo} />
                    <input type="hidden" name="entidade_id" value={item.id} />
                    <input type="hidden" name="tamanho_id" value={t.id} />
                    <Input
                      label={t.name}
                      name="preco"
                      inputMode="decimal"
                      defaultValue={preco === null ? "" : String(preco).replace(".", ",")}
                      placeholder="Ex.: 8,00"
                      hint={preco === null ? "Em branco: não oferecido" : "Apague para remover"}
                    />
                  </FormularioAcao>
                </div>
              );
            })}
          </div>
          ) : null}
        </Cartao>
      ))}

      {podeGerenciar ? (
      <Cartao titulo={ehBorda ? "Nova borda" : "Novo adicional"}>
        <FormularioAcao
          acao={ehBorda ? salvarBorda : salvarAdicional}
          rotulo={ehBorda ? "Criar borda" : "Criar adicional"}
        >
          <Input
            label="Nome"
            name="nome"
            required
            placeholder={ehBorda ? "Ex.: Catupiry" : "Ex.: Bacon"}
          />
          <Input label="Ordem" name="ordem" type="number" defaultValue={0} min={0} />
        </FormularioAcao>
      </Cartao>
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
