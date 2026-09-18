import { Input, StatusBadge } from "@/ui/components";
import { Cartao, LinhaLista } from "@/ui/patterns";
import { listarHorarios } from "@/application/configuracoes/consultas";
import { salvarHorario } from "@/application/configuracoes/acoes";
import { DIAS_DA_SEMANA } from "@/application/configuracoes/tipos";
import { FormularioAcao } from "@/app/(admin)/admin/produtos/_ui/FormularioAcao";

/**
 * "Horários de funcionamento" — seção do design aprovado, com o mesmo aviso:
 * fora do horário o cardápio continua visível e o envio do pedido fica
 * bloqueado; sem agendamento futuro nesta versão (RN-LOJA-003).
 *
 * 02 §3.2: a janela PODE atravessar a meia-noite. Fechar às 02:00 tendo
 * aberto às 18:00 é válido e não é tratado como erro — a loja de pizza que
 * fecha depois da meia-noite é o caso normal, não a exceção.
 */
export async function SecaoHorarios({ podeGerenciar }: { podeGerenciar: boolean }) {
  const horarios = await listarHorarios();
  const porDia = new Map(horarios.map((h) => [h.weekday, h]));

  return (
    <Cartao
      titulo="Horários de funcionamento"
      descricao="Fora do horário o cardápio continua visível e o envio do pedido fica bloqueado. Sem agendamento futuro nesta versão."
    >
      {DIAS_DA_SEMANA.map((nome, dia) => {
        const h = porDia.get(dia);
        const viraMeiaNoite =
          h && !h.is_closed && h.opens_at && h.closes_at && h.closes_at <= h.opens_at;

        return (
          <LinhaLista key={dia}>
            <span className="min-w-[110px] flex-1 text-[14px] font-semibold text-ink">{nome}</span>

            <span className="text-[13.5px] text-ink-2">
              {!h
                ? "não configurado"
                : h.is_closed
                  ? "Fechado"
                  : `${h.opens_at?.slice(0, 5)} — ${h.closes_at?.slice(0, 5)}${viraMeiaNoite ? " (do dia seguinte)" : ""}`}
            </span>

            <StatusBadge tom={h && !h.is_closed ? "sucesso" : "neutro"}>
              {h && !h.is_closed ? "Aberto" : "Fechado"}
            </StatusBadge>

            {podeGerenciar ? (
              <FormularioAcao
                acao={salvarHorario}
                rotulo="Salvar"
                variante="secundario"
                tamanho="sm"
                className="w-full gap-2 md:w-auto md:flex-row md:items-end"
              >
                <input type="hidden" name="dia" value={dia} />
                <Input
                  label="Abre"
                  name="abre"
                  type="time"
                  defaultValue={h?.opens_at?.slice(0, 5) ?? ""}
                />
                <Input
                  label="Fecha"
                  name="fecha"
                  type="time"
                  defaultValue={h?.closes_at?.slice(0, 5) ?? ""}
                />
                <label className="flex min-h-touch items-center gap-2 text-[13px] font-semibold text-ink">
                  <input
                    type="checkbox"
                    name="fechado"
                    defaultChecked={h?.is_closed ?? false}
                    className="h-5 w-5 accent-[var(--brand-orange)]"
                  />
                  Fechado
                </label>
              </FormularioAcao>
            ) : null}
          </LinhaLista>
        );
      })}
    </Cartao>
  );
}
