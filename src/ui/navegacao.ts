/**
 * Mapa de navegação.
 *
 * Os 11 módulos administrativos e as rotas públicas vêm de
 * 05-PLANO-IMPLEMENTACAO.md §5.2 e do design aprovado. Aqui existe apenas o
 * mapa de rotas — nenhuma permissão, nenhum badge de contagem e nenhuma regra
 * de visibilidade, que dependem de RBAC (Fase 2).
 */

export type ItemNav = { nome: string; href: string };

export const MENU_ADMIN: readonly ItemNav[] = [
  { nome: "Dashboard", href: "/admin" },
  { nome: "Pedidos", href: "/admin/pedidos" },
  // O PDV é a interface operacional de PDV + Caixa. A entrada "Caixa" existia
  // apontando para uma segunda tela do mesmo caixa, removida na consolidação.
  { nome: "PDV", href: "/admin/pdv" },
  { nome: "Entregas", href: "/admin/entregas" },
  { nome: "Produtos", href: "/admin/produtos" },
  { nome: "Clientes", href: "/admin/clientes" },
  { nome: "Remarketing", href: "/admin/remarketing" },
  { nome: "Entradas / Despesas", href: "/admin/financeiro" },
  { nome: "Funcionários / Equipe", href: "/admin/equipe" },
  { nome: "Relatórios", href: "/admin/relatorios" },
  { nome: "Configurações", href: "/admin/configuracoes" },
] as const;

export const ROTAS_PUBLICAS: readonly ItemNav[] = [
  { nome: "Cardápio", href: "/" },
  { nome: "Carrinho", href: "/carrinho" },
  { nome: "Checkout", href: "/checkout" },
  { nome: "Meus pedidos", href: "/meus-pedidos" },
  { nome: "Histórico", href: "/historico" },
  { nome: "Favoritos", href: "/favoritos" },
] as const;

/**
 * Permissão que abre cada módulo do administrativo (qualquer uma das listadas).
 *
 * É SÓ para a interface mostrar o item bloqueado e explicar por quê: quem
 * decide o que se pode ler ou fazer é o banco (RLS/RPC). Rota sem entrada
 * aqui — o painel e o perfil — é de todos.
 */
export const PERMISSAO_DA_ROTA: Readonly<Record<string, readonly string[]>> = {
  "/admin/pedidos": ["orders.view"],
  "/admin/pdv": ["orders.create_manual", "cash.view"],
  "/admin/entregas": ["deliveries.view"],
  "/admin/produtos": ["catalog.view"],
  "/admin/clientes": ["customers.view"],
  "/admin/remarketing": ["remarketing.view"],
  "/admin/financeiro": ["finance.view"],
  "/admin/equipe": ["employees.view"],
  "/admin/relatorios": ["reports.view"],
  "/admin/configuracoes": ["settings.view"],
};

/**
 * Telas sem a barra inferior do celular: têm botões próprios no rodapé, e duas
 * barras empilhadas tomariam a tela e causariam toque errado.
 */
export function barraInferiorOculta(rota: string): boolean {
  return ["/admin/pedidos/novo", "/admin/pdv"].some(
    (r) => rota === r || rota.startsWith(`${r}/`),
  );
}

/** A rota (ou a página dentro dela) está fora do que esta pessoa pode abrir? */
export function rotaBloqueada(rota: string, permissoes: readonly string[]): boolean {
  const modulo = Object.keys(PERMISSAO_DA_ROTA).find(
    (r) => rota === r || rota.startsWith(`${r}/`),
  );
  if (!modulo) return false;
  return !PERMISSAO_DA_ROTA[modulo]!.some((p) => permissoes.includes(p));
}
