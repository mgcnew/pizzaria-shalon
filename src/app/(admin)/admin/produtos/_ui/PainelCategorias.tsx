import { StatusBadge, Input, Textarea } from "@/ui/components";
import { Cartao, LinhaLista } from "@/ui/patterns";
import { listarCategorias } from "@/application/catalogo/consultas";
import {
  salvarCategoria,
  alternarPausaCategoria,
  alternarAtivoCategoria,
} from "@/application/catalogo/acoes";
import { FormularioAcao } from "./FormularioAcao";
import { BotaoAcao } from "./BotaoAcao";

/**
 * Categorias — aba de lista do design ("Listas dinâmicas: o cardápio público
 * renderiza exatamente o que estiver ativo aqui").
 *
 * RN-DISP-001 e RN-DISP-004: a linha mostra DOIS estados separados, porque
 * eles são separados. "Inativa" some do cardápio; "Pausada" continua visível
 * e apenas impede novos pedidos dos produtos dela — e, ao despausar, cada
 * produto volta ao próprio estado, sem nada ter sido sobrescrito.
 */
export async function PainelCategorias({ podeGerenciar }: { podeGerenciar: boolean }) {
  const categorias = await listarCategorias();

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 max-w-[60ch] text-[13.5px] text-ink-2">
        Listas dinâmicas: o cardápio público renderiza exatamente o que estiver ativo aqui.
        Pausar uma categoria não apaga nada — os produtos dela apenas param de ser vendidos
        até você despausar.
      </p>

      <Cartao largura="cheio">
        {categorias.map((c) => (
          <LinhaLista key={c.id}>
            <div className="min-w-[160px] flex-1">
              <p className="m-0 text-[15px] font-semibold text-ink">{c.name}</p>
              <p className="mt-[2px] text-[12.5px] text-muted">
                /{c.slug}
                {c.temporary_unavailable_note ? ` · ${c.temporary_unavailable_note}` : ""}
              </p>
            </div>

            {!c.is_active ? (
              <StatusBadge tom="neutro">Inativa</StatusBadge>
            ) : c.is_temporarily_available ? (
              <StatusBadge tom="sucesso">Ativa</StatusBadge>
            ) : (
              <StatusBadge tom="atencao">Pausada</StatusBadge>
            )}

            {podeGerenciar ? (
            <>
            <BotaoAcao
              acao={alternarPausaCategoria}
              campos={{ id: c.id, pausar: String(c.is_temporarily_available) }}
            >
              {c.is_temporarily_available ? "Pausar" : "Despausar"}
            </BotaoAcao>
            <BotaoAcao
              acao={alternarAtivoCategoria}
              campos={{ id: c.id, ativar: String(!c.is_active) }}
            >
              {c.is_active ? "Inativar" : "Reativar"}
            </BotaoAcao>
            </>
            ) : null}
          </LinhaLista>
        ))}
      </Cartao>

      {podeGerenciar ? (
      <Cartao titulo="Nova categoria" descricao="O endereço público é gerado a partir do nome.">
        <FormularioAcao acao={salvarCategoria} rotulo="Criar categoria">
          <Input label="Nome" name="nome" required placeholder="Ex.: Pizzas Doces" />
          <Textarea label="Descrição (opcional)" name="descricao" />
          <Input label="Ordem no cardápio" name="ordem" type="number" defaultValue={0} min={0} />
        </FormularioAcao>
      </Cartao>
      ) : null}
    </div>
  );
}
