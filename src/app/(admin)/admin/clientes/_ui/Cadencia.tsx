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

/**
 * Versão discreta para a tabela (17/10/2026): ponto + texto, sem caixa
 * maiúscula. Numa lista, o selo repetido em cada linha disputava atenção com
 * o nome do cliente. A explicação da linha vai no `title`.
 */
const PONTOS: Record<Valor, { ponto: string; texto: string }> = {
  recorrente: { ponto: "bg-tgf", texto: "text-ink" },
  atencao: { ponto: "bg-twf", texto: "text-twf" },
  afastado: { ponto: "bg-tdf", texto: "text-tdf" },
  base_fraca: { ponto: "bg-muted", texto: "text-ink-2" },
  dados_insuficientes: { ponto: "bg-border-shalon", texto: "text-muted" },
};

export function CadenciaDiscreta({ valor, explicacao }: { valor: Valor; explicacao?: string }) {
  const tom = PONTOS[valor];
  return (
    <span title={explicacao} className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-semibold ${tom.texto}`}>
      <span aria-hidden="true" className={`size-[7px] shrink-0 rounded-full ${tom.ponto}`} />
      {SELOS[valor].texto}
    </span>
  );
}
