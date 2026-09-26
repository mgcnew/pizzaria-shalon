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
  { nome: "PDV", href: "/admin/pdv" },
  { nome: "Caixa", href: "/admin/caixa" },
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
