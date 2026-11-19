/**
 * Leva a pessoa ao campo que falta preencher (D-2026-11-19-191 e 192).
 *
 * Seletor de menu e grupos não têm `id` no controle: o `id` fica no
 * contêiner, e o foco vai para o primeiro controle dentro dele. A rolagem
 * vem antes do foco, centralizada, para o campo não ficar escondido atrás
 * de barra fixa no celular.
 */
export function focarCampo(id: string) {
  const alvo = document.getElementById(id);
  if (!alvo) return;
  const controle = alvo.matches("input, textarea, button, select")
    ? alvo
    : alvo.querySelector<HTMLElement>("input, textarea, button, select");
  const destino = controle ?? alvo;
  destino.scrollIntoView({ block: "center", behavior: "smooth" });
  destino.focus({ preventScroll: true });
}

/** Dois quadros: o que acabou de aparecer precisa estar na tela antes do foco. */
export function focarCampoDepoisDeDesenhar(id: string) {
  requestAnimationFrame(() => requestAnimationFrame(() => focarCampo(id)));
}
