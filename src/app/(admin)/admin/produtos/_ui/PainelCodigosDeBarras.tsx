import { Cartao } from "@/ui/patterns";
import { StatusBadge } from "@/ui/components";
import {
  alterarCodigoDeBarras,
  cadastrarCodigoDeBarras,
  definirCodigoPrimario,
  removerCodigoDeBarras,
} from "@/application/catalogo/codigosDeBarras";
import type { CodigoDeBarras } from "@/application/catalogo/tipos";
import { BotaoAcao } from "./BotaoAcao";
import { CampoCodigoDeBarras } from "./CampoCodigoDeBarras";
import { FormularioAcao } from "./FormularioAcao";

/**
 * Administração dos códigos de barras de um alvo — produto OU variante.
 *
 * 09-PDV-FRENTE-DE-CAIXA.md §2.3 · Etapa 3b
 *
 * NÃO DECIDE NADA. Cada botão chama uma das portas da Etapa 3, e é a RPC que
 * verifica `catalog.manage`, garante a unicidade global, troca o primário numa
 * transação e devolve o aviso de EAN. A tela nem normaliza código: o
 * `codigo_normalizado` exibido é o que o banco gerou.
 *
 * TUDO FUNCIONA POR MOUSE E TOQUE, sem atalho nenhum. A edição usa `<details>`,
 * que é divulgação nativa do HTML — abre no clique e no toque, não depende de
 * JavaScript e não rouba foco de teclado.
 */
export function PainelCodigosDeBarras({
  titulo,
  descricao,
  produtoId,
  varianteId,
  codigos,
  podeGerenciar,
}: {
  titulo: string;
  descricao: string;
  /** Sempre presente: é o alvo da revalidação da rota do produto. */
  produtoId: string;
  /** Quando presente, o alvo dos códigos é a variante, não o produto. */
  varianteId?: string;
  codigos: CodigoDeBarras[];
  podeGerenciar: boolean;
}) {
  // EXATAMENTE UM ALVO, e a rota a revalidar em campo separado.
  //
  // `rota_produto_id` existe porque o painel de uma variante precisa do id do
  // produto para revalidar a página — mas o alvo do código é a variante. Usar
  // `produto_id` para as duas coisas fazia a action mandar produto E variante
  // para a RPC, que recusa com `alvo_invalido`.
  const camposDoAlvo = varianteId
    ? { rota_produto_id: produtoId, variante_id: varianteId }
    : { rota_produto_id: produtoId, produto_id: produtoId };

  return (
    <Cartao titulo={titulo} descricao={descricao} largura="cheio">
      {codigos.length === 0 ? (
        <p className="m-0 py-2 text-[13.5px] text-muted">
          Nenhum código cadastrado. Sem código, este item continua vendável — só não
          entra pelo leitor.
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {codigos.map((codigo) => (
            <li
              key={codigo.id}
              className="rounded-12 border border-border-shalon bg-elev p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="m-0 flex-1 font-mono text-[15px] font-semibold tracking-wide text-ink">
                  {codigo.codigo}
                </p>

                {/* Qual é o principal precisa ser óbvio sem ler legenda. */}
                {codigo.primario ? (
                  <StatusBadge tom="sucesso">Principal</StatusBadge>
                ) : null}

                {podeGerenciar && !codigo.primario ? (
                  <FormularioAcao
                    acao={definirCodigoPrimario}
                    rotulo="Tornar principal"
                    variante="secundario"
                    tamanho="sm"
                  >
                    <input type="hidden" name="id" value={codigo.id} />
                    <input type="hidden" name="rota_produto_id" value={produtoId} />
                  </FormularioAcao>
                ) : null}

                {podeGerenciar ? (
                  <BotaoAcao
                    acao={removerCodigoDeBarras}
                    campos={{ id: codigo.id, rota_produto_id: produtoId }}
                    tom="perigo"
                  >
                    Remover
                  </BotaoAcao>
                ) : null}
              </div>

              {/*
                O que o banco gerou, mostrado quando difere do digitado. É o que
                o leitor vai casar, e ver a diferença explica por que "789 123"
                e "789123" são o mesmo código.
              */}
              {codigo.codigo_normalizado !== codigo.codigo ? (
                <p className="mt-[6px] text-[12px] text-muted">
                  O leitor compara por{" "}
                  <span className="font-mono">{codigo.codigo_normalizado}</span>
                </p>
              ) : null}

              {/* Aviso do servidor: o código está salvo, e segue com ressalva. */}
              {codigo.aviso_ean ? (
                <p
                  role="status"
                  className="m-0 mt-[6px] rounded-12 border border-twb bg-tw px-3 py-[8px] text-[12.5px] font-semibold text-twf"
                >
                  {codigo.aviso_ean}
                </p>
              ) : null}

              {podeGerenciar ? (
                <details className="mt-2">
                  <summary className="inline-flex min-h-touch cursor-pointer items-center text-[13px] font-semibold text-ink-2">
                    Editar este código
                  </summary>
                  <div className="mt-2">
                    <FormularioAcao
                      acao={alterarCodigoDeBarras}
                      rotulo="Salvar alteração"
                      variante="secundario"
                    >
                      <input type="hidden" name="id" value={codigo.id} />
                      <input type="hidden" name="rota_produto_id" value={produtoId} />
                      <CampoCodigoDeBarras
                        id={`codigo-${codigo.id}`}
                        defaultValue={codigo.codigo}
                        label="Código"
                      />
                      <label className="flex min-h-touch cursor-pointer items-center gap-2 text-[13.5px] text-ink">
                        <input
                          type="checkbox"
                          name="primario"
                          defaultChecked={codigo.primario}
                          className="h-4 w-4 cursor-pointer"
                        />
                        Este é o código principal do item
                      </label>
                    </FormularioAcao>
                  </div>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {podeGerenciar ? (
        <div className="mt-3 rounded-12 border border-border-shalon bg-elev p-3">
          <FormularioAcao
            acao={cadastrarCodigoDeBarras}
            rotulo="Cadastrar código"
            variante="secundario"
          >
            {Object.entries(camposDoAlvo).map(([nome, valor]) => (
              <input key={nome} type="hidden" name={nome} value={valor} />
            ))}
            <CampoCodigoDeBarras
              id={`novo-codigo-${varianteId ?? produtoId}`}
            />
            {/*
              Marcar principal aqui NÃO exige apagar o principal anterior: a RPC
              rebaixa o antigo na mesma transação (09 §2.3).
            */}
            <label className="flex min-h-touch cursor-pointer items-center gap-2 text-[13.5px] text-ink">
              <input type="checkbox" name="primario" className="h-4 w-4 cursor-pointer" />
              Usar como código principal
              {codigos.some((c) => c.primario) ? (
                <span className="text-muted">(substitui o principal atual)</span>
              ) : null}
            </label>
          </FormularioAcao>
        </div>
      ) : null}
    </Cartao>
  );
}
