/** Tipos das configurações da loja (02 §3 e §10). */

export type Loja = {
  id: string;
  store_name: string;
  display_name: string | null;
  whatsapp: string;
  phone: string | null;
  address_street: string;
  address_number: string;
  address_complement: string | null;
  address_neighborhood: string;
  address_city: string;
  address_state: string;
  address_postal_code: string;
  latitude: number | null;
  longitude: number | null;
  geocode_provider: string | null;
  is_temporarily_closed: boolean;
  temporary_close_reason: string | null;
  delivery_minimum_enabled: boolean;
  delivery_minimum_subtotal: number | null;
  automatic_delivery_radius_km: number;
  delivery_eta_min_minutes: number;
  delivery_eta_max_minutes: number;
  pickup_eta_min_minutes: number;
  pickup_eta_max_minutes: number;
  current_delivery_eta_min_minutes: number | null;
  current_delivery_eta_max_minutes: number | null;
  current_pickup_eta_min_minutes: number | null;
  current_pickup_eta_max_minutes: number | null;
  addons_enabled: boolean;
  timezone: string;
};

export type Horario = {
  id: string;
  weekday: number;
  is_closed: boolean;
  opens_at: string | null;
  closes_at: string | null;
  sort_order: number;
};

export type FaixaEntregaRegistro = {
  id: string;
  min_distance_km: number;
  max_distance_km: number;
  fee: number;
  is_active: boolean;
  sort_order: number;
};

export type FormaPagamento = {
  id: string;
  code: string;
  name: string;
  payment_family: string;
  is_active: boolean;
  available_for_delivery: boolean;
  available_for_pickup: boolean;
  requires_brand: boolean;
  sort_order: number;
};

export type BandeiraPagamento = {
  id: string;
  payment_method_id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
};

export type ChavePix = {
  id: string;
  is_enabled: boolean;
  key_type: string | null;
  pix_key: string | null;
  recipient_name: string | null;
  instructions: string | null;
};

export type LimiteAlerta = {
  id: string;
  alert_key: string;
  threshold_minutes: number;
  is_active: boolean;
};

export type RegistroAuditoria = {
  id: string;
  created_at: string;
  action: string;
  entity_type: string;
  actor_type: string;
  reason: string | null;
};

/**
 * Chaves de alerta previstas em 02 §3.4.
 *
 * Os MINUTOS não são semeados: nenhum documento define qual é o limite certo
 * para a Shalon, e inventar número operacional não é papel da implementação.
 * A tela oferece as chaves; a Owner define o tempo.
 */
export const CHAVES_DE_ALERTA: { chave: string; rotulo: string }[] = [
  { chave: "order_waiting_confirmation", rotulo: "Pedido aguardando confirmação" },
  { chave: "pix_waiting_confirmation", rotulo: "Pix aguardando confirmação" },
  { chave: "delivery_approval_waiting", rotulo: "Entrega aguardando aprovação" },
  { chave: "customer_change_waiting", rotulo: "Cliente aguardando aprovar alteração" },
  { chave: "driver_run_pending_settlement", rotulo: "Saída de entrega sem acerto" },
];

export const DIAS_DA_SEMANA = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
] as const;
