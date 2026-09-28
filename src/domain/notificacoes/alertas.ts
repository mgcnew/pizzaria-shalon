/** Uma tarefa nova, não um log de toda mudança do pedido. */
export type TipoAlerta =
  | "new_order"
  | "production_needed"
  | "ready_for_pickup"
  | "ready_for_delivery"
  | "delivery_failed";

export type AreaAlerta = "atendimento" | "producao" | "entrega";

export const AREAS_ALERTA: { id: AreaAlerta; nome: string }[] = [
  { id: "atendimento", nome: "Atendimento" },
  { id: "producao", nome: "Produção" },
  { id: "entrega", nome: "Entrega" },
];

const DEFINICOES: Record<TipoAlerta, { titulo: string; area: AreaAlerta }> = {
  new_order: { titulo: "Novo pedido", area: "atendimento" },
  production_needed: { titulo: "Iniciar produção", area: "producao" },
  ready_for_pickup: { titulo: "Pronto para retirada", area: "atendimento" },
  ready_for_delivery: { titulo: "Aguardando despacho", area: "entrega" },
  delivery_failed: { titulo: "Falha na entrega", area: "atendimento" },
};

export function definirAlerta(tipo: TipoAlerta) {
  return DEFINICOES[tipo];
}

export function lerAreasSalvas(valor: string | null): AreaAlerta[] {
  if (!valor) return ["atendimento"];
  try {
    const lista: unknown = JSON.parse(valor);
    if (!Array.isArray(lista)) return ["atendimento"];
    return AREAS_ALERTA.map(({ id }) => id).filter((id) => lista.includes(id));
  } catch {
    return ["atendimento"];
  }
}
