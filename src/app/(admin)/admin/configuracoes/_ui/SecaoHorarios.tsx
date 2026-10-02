import { CampoDataHora, StatusBadge } from "@/ui/components";
import { Cartao } from "@/ui/patterns";
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
      largura="cheio"
    >
      <div className="divide-y divide-border-shalon">
        {DIAS_DA_SEMANA.map((nome, dia) => {
          const h = porDia.get(dia);
          const viraMeiaNoite =
            h && !h.is_closed && h.opens_at && h.closes_at && h.closes_at <= h.opens_at;
          const horarioAtual = !h
            ? "Não configurado"
            : h.is_closed
              ? "Sem atendimento"
              : `${h.opens_at?.slice(0, 5)} — ${h.closes_at?.slice(0, 5)}${viraMeiaNoite ? " · dia seguinte" : ""}`;

          return (
            <div
              key={dia}
              className="grid items-center gap-3 py-4 first:pt-1 last:pb-1 lg:grid-cols-[minmax(170px,0.55fr)_minmax(440px,1.45fr)]"
            >
              <div className="flex min-w-0 items-center justify-between gap-3 lg:block">
                <div className="min-w-0">
                  <p className="m-0 text-[14px] font-bold text-ink">{nome}</p>
                  <p className="mt-1 truncate text-[12.5px] text-muted">{horarioAtual}</p>
                </div>
                <StatusBadge tom={h && !h.is_closed ? "sucesso" : "neutro"}>
                  {h && !h.is_closed ? "Aberto" : "Fechado"}
                </StatusBadge>
              </div>

              {podeGerenciar ? (
                <FormularioAcao
                  acao={salvarHorario}
                  rotulo="Salvar dia"
                  variante="secundario"
                  tamanho="sm"
                  className="w-full gap-2 sm:flex-row sm:items-end"
                >
                  <input type="hidden" name="dia" value={dia} />
                  <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                    <CampoDataHora
                      label="Abre"
                      name="abre"
                      modo="hora"
                      valorInicial={h?.opens_at?.slice(0, 5) ?? ""}
                    />
                    <CampoDataHora
                      label="Fecha"
                      name="fecha"
                      modo="hora"
                      valorInicial={h?.closes_at?.slice(0, 5) ?? ""}
                    />
                  </div>
                  <label className="flex min-h-touch shrink-0 items-center gap-2 rounded-11 border border-border-shalon px-3 text-[13px] font-semibold text-ink">
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
            </div>
          );
        })}
      </div>
    </Cartao>
  );
}
