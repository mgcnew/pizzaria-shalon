"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useState, type MouseEvent } from "react";

/**
 * Fecha um painel (gaveta, popover, menu) quando a navegação que ele disparou
 * se conclui, e não no clique.
 *
 * Fechar no clique escondia o `IndicadorDeNavegacao` do item escolhido: o
 * painel sumia e a tela antiga ficava parada, sem sinal nenhum, até o servidor
 * responder. Assim, o item clicado continua visível e pulsando até a URL mudar,
 * que é o instante em que o skeleton ou a tela nova aparece.
 *
 * `aoClicarEmLink` cobre o único caso em que a URL não muda, o link para o
 * endereço atual. Sem ele, o painel ficaria aberto.
 */
export function useFecharAoNavegar(fechar: () => void) {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const url = query ? `${pathname}?${query}` : pathname;
  const [ultimaUrl, setUltimaUrl] = useState(url);

  // Ajuste de estado durante a renderização: é o padrão do React para reagir
  // à mudança de um valor sem efeito. A comparação impede o laço.
  if (url !== ultimaUrl) {
    setUltimaUrl(url);
    fechar();
  }

  return function aoClicarEmLink(evento: MouseEvent<HTMLAnchorElement>) {
    if (evento.currentTarget.href === window.location.href) fechar();
  };
}
