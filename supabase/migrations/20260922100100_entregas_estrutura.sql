-- 0073 — Estrutura das entregas: corrida, pedidos da corrida e acerto
-- 02-MODELO-DADOS-SUPABASE.md §11 · 04-REGRAS-NEGOCIO.md RN-RUN-001..007,
-- RN-MOTO-001..004, RN-PGTO-014 · 03-RLS-RBAC-SEGURANCA.md §19
--
-- O QUE ESTA ESTRUTURA PRECISA IMPEDIR, antes de qualquer tela: que o
-- dinheiro suma entre a entrega e o caixa. Por isso o pedido continua com o
-- valor dele, a corrida não soma nada em cima, e o acerto é o único lugar
-- onde o dinheiro muda de mão para a gaveta.
--
-- UMA CORRIDA NÃO É UM PEDIDO GRANDE. Ela agrupa pedidos e nada mais:
-- total, pagamento esperado, pagamento realizado e situação continuam de
-- cada pedido, um por um. Somar tudo na corrida perderia justamente a
-- rastreabilidade que o acerto precisa ter (RN-RUN-002).

-- ------------------------------------------------------------- corrida
create table public.driver_runs (
  id uuid primary key default gen_random_uuid(),
  -- RN-MOTO-001: motoboy é FUNCIONÁRIO, e pode não ter login nenhum. A
  -- corrida aponta para `employees`, nunca para `app_users`.
  driver_employee_id uuid not null references public.employees (id) on delete restrict,

  status text not null default 'open',

  departed_at timestamptz,
  returned_at timestamptz,
  settled_at timestamptz,
  settled_by uuid references public.app_users (id) on delete restrict,

  notes text,
  created_by uuid not null references public.app_users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint driver_runs_status check (status in ('open', 'out', 'settling', 'settled')),

  -- Cada estado tem o carimbo que o comprova. `out` sem horário de saída
  -- seria uma corrida que saiu sem ter saído.
  constraint driver_runs_carimbos_coerentes check (
    (status = 'open'     and departed_at is null and returned_at is null and settled_at is null)
    or (status = 'out'      and departed_at is not null and returned_at is null and settled_at is null)
    or (status = 'settling' and departed_at is not null and returned_at is not null and settled_at is null)
    or (status = 'settled'  and departed_at is not null and returned_at is not null
                            and settled_at is not null and settled_by is not null)
  )
);

-- Um motoboy não sai duas vezes ao mesmo tempo. O índice decide a corrida
-- entre dois atendentes clicando junto (CLAUDE.md §34).
create unique index driver_runs_uma_ativa_por_motoboy
  on public.driver_runs (driver_employee_id)
  where status in ('open', 'out', 'settling');

create index driver_runs_por_status on public.driver_runs (status, created_at desc);
create index driver_runs_do_motoboy on public.driver_runs (driver_employee_id, created_at desc);

comment on table public.driver_runs is 'RN-RUN-001: agrupa pedidos de um motoboy. Não soma valores — cada pedido guarda o seu.';

create trigger driver_runs_updated_at
  before update on public.driver_runs
  for each row execute function public.tg_set_updated_at();

-- --------------------------------------------------- pedidos da corrida
create table public.driver_run_orders (
  id uuid primary key default gen_random_uuid(),
  driver_run_id uuid not null references public.driver_runs (id) on delete restrict,
  order_id uuid not null references public.orders (id) on delete restrict,

  delivery_status text not null default 'pending',
  failure_reason text,
  delivered_at timestamptz,

  -- §3: quem atribuiu e quando. Troca de motoboy não apaga isto.
  assigned_by uuid not null references public.app_users (id) on delete restrict,
  assigned_at timestamptz not null default now(),

  created_at timestamptz not null default now(),

  constraint driver_run_orders_situacao check (
    delivery_status in ('pending', 'delivered', 'failed', 'reassigned')),
  constraint driver_run_orders_falha_com_motivo check (
    delivery_status <> 'failed'
    or (failure_reason is not null and length(btrim(failure_reason)) >= 3)),
  constraint driver_run_orders_entrega_com_horario check (
    (delivery_status = 'delivered') = (delivered_at is not null)),
  constraint driver_run_orders_uma_vez_por_corrida unique (driver_run_id, order_id)
);

-- 02 §11.4 é explícito: NÃO usar UNIQUE global em `order_id`, porque o mesmo
-- pedido pode ter uma segunda tentativa. O que não pode é estar em duas
-- saídas ATIVAS — e é isso que o índice parcial garante. Ao trocar de
-- motoboy, o vínculo anterior vira `reassigned` e a história fica.
create unique index driver_run_orders_uma_ativa_por_pedido
  on public.driver_run_orders (order_id)
  where delivery_status = 'pending';

create index driver_run_orders_da_corrida on public.driver_run_orders (driver_run_id);
create index driver_run_orders_do_pedido on public.driver_run_orders (order_id, created_at desc);

comment on table public.driver_run_orders is '02 §11.4: um vínculo ativo por pedido. Tentativa anterior vira reassigned/failed e permanece.';

-- --------------------------------------------------------------- acerto
-- RN-RUN-003/004. O acerto compara o que o motoboy DEVERIA trazer em
-- dinheiro com o que trouxe. Cartão e Pix aparecem no resumo da corrida, mas
-- não entram aqui: não há papel para conferir (02 §11.3).
create table public.driver_run_settlements (
  id uuid primary key default gen_random_uuid(),
  driver_run_id uuid not null references public.driver_runs (id) on delete restrict,

  expected_cash numeric(12, 2) not null,
  returned_cash numeric(12, 2) not null,
  difference numeric(12, 2) not null,
  difference_reason text,

  -- RN-RUN-004: anexo opcional. Vai para o bucket privado da Fase 7.
  attachment_asset_id uuid references public.media_assets (id) on delete set null,
  notes text,

  settled_by uuid not null references public.app_users (id) on delete restrict,
  settled_at timestamptz not null default now(),

  -- Onde o dinheiro entrou. Preenchido quando o acerto tem dinheiro a
  -- recolher; nulo quando a corrida foi toda em cartão/Pix.
  cash_session_id uuid references public.cash_sessions (id) on delete restrict,

  constraint driver_run_settlements_valores check (expected_cash >= 0 and returned_cash >= 0),
  -- A diferença é derivada, nunca digitada.
  constraint driver_run_settlements_diferenca_derivada check (
    difference = returned_cash - expected_cash),
  -- RN-RUN-004: diferença exige motivo. Acerto exato não exige.
  constraint driver_run_settlements_motivo_da_diferenca check (
    difference = 0
    or (difference_reason is not null and length(btrim(difference_reason)) >= 3)),
  -- CLAUDE.md §34: uma corrida se acerta uma vez.
  constraint driver_run_settlements_uma_por_corrida unique (driver_run_id)
);

create index driver_run_settlements_por_data on public.driver_run_settlements (settled_at desc);
create index driver_run_settlements_da_sessao on public.driver_run_settlements (cash_session_id)
  where cash_session_id is not null;

comment on table public.driver_run_settlements is 'RN-RUN-003/004. Compara dinheiro esperado e devolvido. Diferença NUNCA desconta salário (RN-RUN-005).';

-- ------------------------------------------------------------------- RLS
alter table public.driver_runs             enable row level security;
alter table public.driver_runs             force  row level security;
alter table public.driver_run_orders       enable row level security;
alter table public.driver_run_orders       force  row level security;
alter table public.driver_run_settlements  enable row level security;
alter table public.driver_run_settlements  force  row level security;

-- Deny by default. `anon` não aparece em policy nenhuma: entrega é operação
-- interna, e o cliente acompanha o pedido dele pelo token, não a corrida.
create policy driver_runs_select on public.driver_runs
  for select to authenticated using (public.has_permission('deliveries.view'));

create policy driver_run_orders_select on public.driver_run_orders
  for select to authenticated using (public.has_permission('deliveries.view'));

-- O acerto tem valores de dinheiro: quem o lê precisa enxergar entrega OU
-- caixa. Não basta enxergar pedido.
create policy driver_run_settlements_select on public.driver_run_settlements
  for select to authenticated
  using (public.has_permission('deliveries.view') or public.has_permission('cash.view'));
