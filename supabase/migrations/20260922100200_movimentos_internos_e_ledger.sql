-- 0074 — Movimentos internos e o livro do funcionário
-- 02-MODELO-DADOS-SUPABASE.md §13.3 e §14 · 03-RLS-RBAC-SEGURANCA.md §18 e §20
-- 04-REGRAS-NEGOCIO.md RN-CONS-001..005, RN-CORT-001/002, RN-PERDA-001/002,
-- RN-CLASS-001, RN-EMPFIN-001..003, RN-FUNC-003
--
-- SÃO DOIS LIVROS, e a separação entre eles é o ponto inteiro desta migration.
--
-- `internal_product_movements` responde "que produto saiu sem ser vendido" —
-- cortesia, consumo do funcionário, consumo do proprietário, perda. Nenhum
-- deles é venda, nenhum vira receita, e nenhum aparece como pedido concluído
-- (RN-CLASS-001).
--
-- `employee_ledger_entries` responde "o que entrou no histórico financeiro
-- daquela pessoa" — adiantamento, consumo lançado, diferença autorizada. É
-- outro livro, com outra permissão, e é POR ISSO que o Atendente pode
-- registrar o consumo de um colega sem nunca enxergar o financeiro dele
-- (§18.2, RN-FUNC-003).
--
-- Registrar um consumo NÃO cria automaticamente um lançamento. Quem decide
-- que aquele consumo vira dívida é alguém com permissão financeira, num ato
-- separado — é o que RN-RUN-006 manda para a diferença do motoboy, e vale
-- igual aqui.

-- ------------------------------------------------- movimentos internos
create table public.internal_product_movements (
  id uuid primary key default gen_random_uuid(),

  movement_type text not null,

  -- RN-CONS-001/004: consumo tem dono. Cortesia e perda não têm — e se
  -- tivessem, pareceriam consumo, que é exatamente a confusão que
  -- RN-CLASS-001 manda evitar.
  employee_id uuid references public.employees (id) on delete restrict,

  reason text not null,
  -- RN-CORT-002: cortesia exige autorizador.
  authorized_by uuid references public.app_users (id) on delete restrict,

  occurred_at timestamptz not null default now(),
  status text not null default 'confirmed',

  attachment_asset_id uuid references public.media_assets (id) on delete set null,
  notes text,

  created_by uuid not null references public.app_users (id) on delete restrict,
  created_at timestamptz not null default now(),

  reversed_by uuid references public.app_users (id) on delete restrict,
  reversed_at timestamptz,
  reversal_reason text,

  constraint internal_movements_tipo check (movement_type in (
    'courtesy', 'employee_consumption', 'owner_consumption', 'loss')),
  constraint internal_movements_motivo check (length(btrim(reason)) >= 3),
  constraint internal_movements_status check (status in ('confirmed', 'reversed')),

  constraint internal_movements_funcionario_coerente check (
    case movement_type
      when 'employee_consumption' then employee_id is not null
      when 'owner_consumption'    then true
      else employee_id is null
    end
  ),
  constraint internal_movements_cortesia_autorizada check (
    movement_type <> 'courtesy' or authorized_by is not null),

  constraint internal_movements_reversao_coerente check (
    (status = 'confirmed' and reversed_by is null and reversed_at is null)
    or (status = 'reversed' and reversed_by is not null and reversed_at is not null
        and reversal_reason is not null and length(btrim(reversal_reason)) >= 3))
);

create index internal_movements_por_tipo on public.internal_product_movements (movement_type, occurred_at desc);
create index internal_movements_do_funcionario on public.internal_product_movements (employee_id, occurred_at desc)
  where employee_id is not null;
create index internal_movements_criados_por on public.internal_product_movements (created_by);

comment on table public.internal_product_movements is 'RN-CLASS-001: saída de produto que NÃO é venda. Nunca entra em faturamento.';

create table public.internal_product_movement_items (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid not null references public.internal_product_movements (id) on delete cascade,

  product_id uuid references public.products (id) on delete set null,
  variant_id uuid references public.product_variants (id) on delete set null,

  -- Snapshot: o relatório de amanhã não pode mudar porque o cardápio mudou
  -- hoje (CLAUDE.md §16).
  product_name_snapshot text not null,
  size_name_snapshot text,
  quantity numeric(10, 2) not null,
  -- "Valor de REFERÊNCIA", e o nome é literal: serve para dimensionar o
  -- movimento, não para cobrar nem para faturar (RN-CONS-002).
  reference_unit_price numeric(12, 2),
  observation text,

  constraint internal_movement_items_quantidade check (quantity > 0),
  constraint internal_movement_items_preco check (
    reference_unit_price is null or reference_unit_price >= 0)
);

create index internal_movement_items_do_movimento on public.internal_product_movement_items (movement_id);

comment on column public.internal_product_movement_items.reference_unit_price is
  'Valor de REFERÊNCIA. Dimensiona o movimento; não cobra e não fatura (RN-CONS-002).';

-- ------------------------------------------- livro do funcionário
create table public.employee_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete restrict,

  entry_type text not null,
  amount numeric(12, 2) not null,
  occurred_at timestamptz not null default now(),

  reason text not null,
  notes text,
  status text not null default 'confirmed',

  -- Os vínculos que tornam o lançamento reconstruível: de onde ele veio.
  related_driver_run_id uuid references public.driver_runs (id) on delete restrict,
  related_internal_movement_id uuid references public.internal_product_movements (id) on delete restrict,
  attachment_asset_id uuid references public.media_assets (id) on delete set null,

  created_by uuid not null references public.app_users (id) on delete restrict,
  authorized_by uuid references public.app_users (id) on delete restrict,
  created_at timestamptz not null default now(),

  -- RN-FIN-003/004 vale aqui também: o original permanece.
  reverses_entry_id uuid references public.employee_ledger_entries (id) on delete restrict,
  reversed_by uuid references public.app_users (id) on delete restrict,
  reversed_at timestamptz,
  reversal_reason text,

  constraint employee_ledger_tipo check (entry_type in (
    'consumption', 'advance', 'discrepancy', 'adjustment', 'other')),
  constraint employee_ledger_valor check (amount > 0),
  constraint employee_ledger_motivo check (length(btrim(reason)) >= 3),
  constraint employee_ledger_status check (status in ('confirmed', 'reversed')),
  constraint employee_ledger_reversao_coerente check (
    (status = 'confirmed' and reversed_by is null and reversed_at is null)
    or (status = 'reversed' and reversed_by is not null and reversed_at is not null
        and reversal_reason is not null and length(btrim(reversal_reason)) >= 3))
);

-- Um lançamento é revertido no máximo uma vez, e um movimento interno vira
-- lançamento no máximo uma vez (CLAUDE.md §34).
create unique index employee_ledger_reversao_unica
  on public.employee_ledger_entries (reverses_entry_id)
  where reverses_entry_id is not null;
create unique index employee_ledger_um_por_movimento
  on public.employee_ledger_entries (related_internal_movement_id)
  where related_internal_movement_id is not null and status = 'confirmed';
create unique index employee_ledger_um_por_corrida
  on public.employee_ledger_entries (related_driver_run_id)
  where related_driver_run_id is not null and status = 'confirmed';

create index employee_ledger_do_funcionario on public.employee_ledger_entries (employee_id, occurred_at desc);

comment on table public.employee_ledger_entries is
  'RN-EMPFIN-002: conferência gerencial, NÃO folha de pagamento. Nada aqui desconta salário sozinho.';

-- ------------------------------------------------------------------- RLS
alter table public.internal_product_movements       enable row level security;
alter table public.internal_product_movements       force  row level security;
alter table public.internal_product_movement_items  enable row level security;
alter table public.internal_product_movement_items  force  row level security;
alter table public.employee_ledger_entries          enable row level security;
alter table public.employee_ledger_entries          force  row level security;

-- Movimento interno: quem opera o balcão enxerga.
create policy internal_movements_select on public.internal_product_movements
  for select to authenticated using (public.has_permission('internal.view'));

create policy internal_movement_items_select on public.internal_product_movement_items
  for select to authenticated using (public.has_permission('internal.view'));

-- O LIVRO DO FUNCIONÁRIO NÃO. Aqui mora o isolamento de RN-FUNC-003 e §18.2:
-- registrar o consumo de um colega não abre o financeiro dele. Quem lê é quem
-- tem `employees.finance.view` — ninguém mais, por tabela, RPC ou relação.
create policy employee_ledger_select on public.employee_ledger_entries
  for select to authenticated using (public.has_permission('employees.finance.view'));

-- ------------------------------ o anexo do funcionário no cofre da Fase 7
-- A 0071 roteou `financial_receipt` para `finance.*` e deixou o resto em
-- `catalog.*`. `employee_attachment` cairia no ramo do catálogo — e o vale
-- assinado de um consumo apareceria para quem administra o cardápio. Agora
-- cada tipo de ativo responde a quem tem de responder.
drop policy media_assets_select on public.media_assets;
drop policy media_assets_insert on public.media_assets;
drop policy media_assets_delete on public.media_assets;

create policy media_assets_select on public.media_assets
  for select to authenticated
  using (
    case asset_type
      when 'financial_receipt'   then public.has_permission('finance.view')
      when 'employee_attachment' then public.has_permission('internal.view')
      else public.has_permission('catalog.view')
    end
  );

create policy media_assets_insert on public.media_assets
  for insert to authenticated
  with check (
    case asset_type
      when 'financial_receipt'   then public.has_permission('finance.create')
      when 'employee_attachment' then public.has_permission('internal.register')
      else public.has_permission('catalog.manage')
    end
  );

create policy media_assets_delete on public.media_assets
  for delete to authenticated
  using (
    case asset_type
      when 'financial_receipt'   then public.has_permission('finance.create')
      when 'employee_attachment' then public.has_permission('internal.register')
      else public.has_permission('catalog.manage')
    end
  );

-- O bucket privado passa a aceitar também quem registra movimento interno.
-- Mesmo cofre, chaves diferentes: o caminho separa `lancamentos/` de
-- `consumo/`, e a permissão separa quem abre cada gaveta.
create policy "comprovantes leitura interna" on storage.objects
  for select to authenticated
  using (bucket_id = 'comprovantes' and public.has_permission('internal.view'));

create policy "comprovantes escrita interna" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'comprovantes' and public.has_permission('internal.register'));

create policy "comprovantes remocao interna" on storage.objects
  for delete to authenticated
  using (bucket_id = 'comprovantes' and public.has_permission('internal.register'));
