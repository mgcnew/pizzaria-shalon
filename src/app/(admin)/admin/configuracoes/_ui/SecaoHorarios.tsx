import { StatusBadge } from "@/ui/components";
import { Cartao } from "@/ui/patterns";
import { listarHorarios } from "@/application/configuracoes/consultas";
import { salvarHorarios } from "@/application/configuracoes/acoes";
import { FormularioAcao } from "@/app/(admin)/admin/produtos/_ui/FormularioAcao";
import { EditorDeHorarios, type DiaDeHorario } from "./EditorDeHorarios";

/**
 * "Horários de funcionamento" — seção do design aprovado, com o mesmo aviso:
 * fora do horário o cardápio continua visível e o envio do pedido fica
 * bloqueado; sem agendamento futuro nesta versão (RN-LOJA-003).
 *
 * 02 §3.2: a janela PODE atravessar a meia-noite. Fechar às 02:00 tendo
 * aberto às 18:00 é válido e não é tratado como erro — a loja de pizza que
 * fecha depois da meia-noite é o caso normal, não a exceção.
 *
 * 15/10/2026: a semana inteira vira UM formulário, com cópia de um dia para
 * os outros, em vez de sete formulários de "Salvar dia".
 */
export async function SecaoHorarios({ podeGerenciar }: { podeGerenciar: boolean }) {
  const horarios = await listarHorarios();
  const porDia = new Map(horarios.map((h) => [h.weekday, h]));

  const inicial: DiaDeHorario[] = Array.from({ length: 7 }, (_, dia) => {
    const h = porDia.get(dia);
    // Dia sem registro nasce fechado: nada de abrir por omissão.
    return {
      fechado: !h || h.is_closed,
      abre: h?.opens_at?.slice(0, 5) ?? "18:00",
      fecha: h?.closes_at?.slice(0, 5) ?? "23:00",
    };
  });
  const diasAbertos = inicial.filter((d) => !d.fechado).length;

  return (
    <Cartao
      titulo="Horários de funcionamento"
      descricao="Fora do horário o cardápio continua visível e o envio do pedido fica bloqueado. Sem agendamento futuro nesta versão."
      largura="cheio"
    >
      <div className="mb-3">
        <StatusBadge tom={diasAbertos > 0 ? "sucesso" : "neutro"}>
          {diasAbertos === 0
            ? "Nenhum dia aberto"
            : diasAbertos === 7
              ? "Aberto todos os dias"
              : `Aberto em ${diasAbertos} dias da semana`}
        </StatusBadge>
      </div>

      {podeGerenciar ? (
        <FormularioAcao acao={salvarHorarios} rotulo="Salvar horários">
          <EditorDeHorarios inicial={inicial} />
        </FormularioAcao>
      ) : (
        <EditorDeHorarios inicial={inicial} somenteLeitura />
      )}
    </Cartao>
  );
}
