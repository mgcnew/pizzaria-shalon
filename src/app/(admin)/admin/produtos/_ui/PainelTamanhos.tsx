import { StatusBadge, Input } from "@/ui/components";
import { Cartao, LinhaLista } from "@/ui/patterns";
import { listarTamanhos } from "@/application/catalogo/consultas";
import { salvarTamanho, alternarAtivoTamanho } from "@/application/catalogo/acoes";
import { FormularioAcao } from "./FormularioAcao";
import { BotaoAcao } from "./BotaoAcao";

/**
 * Tamanhos — RN-PIZZA-002.
 *
 * Tamanho é entidade REUTILIZÁVEL, não categoria: "Tradicional" e "Brotinho"
 * são linhas desta tabela (D-2026-09-17-04). Cada tamanho define quantas
 * fatias tem e o MÁXIMO DE SABORES — é esse número que decide se existe meio
 * a meio naquele tamanho (RN-PIZZA-004). Máximo 1 = a interface nem oferece.
 */
export async function PainelTamanhos({ podeGerenciar }: { podeGerenciar: boolean }) {
  const tamanhos = await listarTamanhos();

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 max-w-[60ch] text-[13.5px] text-ink-2">
        Tamanhos são reutilizados por todas as pizzas. O máximo de sabores decide se aquele
        tamanho aceita meio a meio: com 1, o cliente não vê a opção. Em pizzas meio a meio, o
        preço considerado é sempre o do sabor de maior valor — essa regra não é configurável.
      </p>

      <Cartao largura="cheio">
        {tamanhos.length === 0 ? (
          <p className="m-0 py-3 text-[13.5px] text-muted">
            Nenhum tamanho cadastrado. Sem tamanho, uma pizza não tem como ter preço.
          </p>
        ) : (
          tamanhos.map((t) => (
            <LinhaLista key={t.id}>
              <div className="min-w-[160px] flex-1">
                <p className="m-0 text-[15px] font-semibold text-ink">{t.name}</p>
                <p className="mt-[2px] text-[12.5px] text-muted">
                  {t.slice_count} fatias ·{" "}
                  {t.max_flavors === 1
                    ? "1 sabor (sem meio a meio)"
                    : `até ${t.max_flavors} sabores`}
                </p>
              </div>
              <StatusBadge tom={t.is_active ? "sucesso" : "neutro"}>
                {t.is_active ? "Ativo" : "Inativo"}
              </StatusBadge>
              {podeGerenciar ? (
                <BotaoAcao
                  acao={alternarAtivoTamanho}
                  campos={{ id: t.id, ativar: String(!t.is_active) }}
                >
                  {t.is_active ? "Inativar" : "Reativar"}
                </BotaoAcao>
              ) : null}
            </LinhaLista>
          ))
        )}
      </Cartao>

      {podeGerenciar ? (
      <Cartao titulo="Novo tamanho">
        <FormularioAcao acao={salvarTamanho} rotulo="Criar tamanho">
          <Input label="Nome" name="nome" required placeholder="Ex.: Tradicional" />
          <Input label="Fatias" name="fatias" type="number" min={1} required defaultValue={8} />
          <Input
            label="Máximo de sabores"
            name="max_sabores"
            type="number"
            min={1}
            required
            defaultValue={2}
            hint="1 significa que este tamanho não aceita meio a meio."
          />
          <Input label="Ordem" name="ordem" type="number" defaultValue={0} min={0} />
        </FormularioAcao>
      </Cartao>
      ) : null}
    </div>
  );
}
