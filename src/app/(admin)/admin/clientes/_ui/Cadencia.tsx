import { Badge } from "@/ui/components";
import type { Cadencia as Valor } from "@/application/clientes/tipos";

/**
 * O selo de cadência — e as duas recusas honestas.
 *
 * `dados_insuficientes` e `base_fraca` NÃO são estados intermediários a
 * caminho de uma classificação: são a resposta. Com uma compra não há
 * intervalo; com duas há um intervalo, e um intervalo não é um hábito.
 * Dizer "afastado" porque alguém comprou duas vezes com quatro dias de
 * intervalo e ficou doze sem pedir seria matemática correta sobre
 * comportamento inexistente (RN-CRM-004).
 */

const SELOS: Record<Valor, { texto: string; tom: "destaque" | "atencao" | "indisponivel" | "promocao" }> = {
  recorrente: { texto: "Recorrente", tom: "destaque" },
  atencao: { texto: "Atenção", tom: "atencao" },
  afastado: { texto: "Afastado", tom: "promocao" },
  base_fraca: { texto: "Base fraca", tom: "indisponivel" },
  dados_insuficientes: { texto: "Sem histórico", tom: "indisponivel" },
};

export function Cadencia({ valor }: { valor: Valor }) {
  const selo = SELOS[valor];
  return <Badge tom={selo.tom}>{selo.texto}</Badge>;
}
