-- 0061 — Estrutura do caixa: registradoras, sessões, movimentos e correções
-- 02-MODELO-DADOS-SUPABASE.md §12 · 04-REGRAS-NEGOCIO.md RN-CAIXA-001..016
-- 03-RLS-RBAC-SEGURANCA.md §16 · CLAUDE.md §25, §33, §34
--
-- SESSÃO NÃO É DIA. É a distinção que a estrutura precisa sustentar antes de
-- qualquer RPC: `operational_date` é a data local da ABERTURA e serve para
-- agrupar e procurar, não para fechar nada. Uma sessão aberta às 19h de
-- sábado e encerrada às 2h de domingo tem uma data operacional só, e a
-- meia-noite não a tocou (RN-CAIXA-004/005).

-- ---------------------------------------------------------- registradoras
-- 02 §12.1: separar o ponto FÍSICO da sessão, mesmo havendo um só. Sem isso,
-- "uma sessão ativa por vez" não teria a que se referir — e amanhã, com dois
-- balcões, a regra teria de ser reescrita em vez de ganhar uma linha.
create table public.cash_registers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),

  constraint cash_registers_nome check (length(btrim(name)) between 2 and 60),
  constraint cash_registers_nome_unico unique (name)
);

comment on table public.cash_registers is '02 §12.1: o ponto físico de caixa. A V1 opera com um, e a regra de sessão única se refere a ele.';

-- O nome vem do próprio 02 §12.1 ("Pode existir inicialmente apenas Caixa
-- Principal"): é estrutura, não conteúdo inventado.
insert into public.cash_registers (id, name)
values ('00000000-0000-0000-0000-00000000ca1a', 'Caixa Principal');

-- --------------------------------------------------------------- sessões
create table public.cash_sessions (
  id uuid primary key default gen_random_uuid(),
  cash_register_id uuid not null references public.cash_registers (id) on delete restrict,

  -- Data LOCAL da abertura. Agrupa; não encerra.
  operational_date date not null,

  opened_at timestamptz not null default now(),
  opened_by uuid not null references public.app_users (id) on delete restrict,
  -- RN-CAIXA-002: fundo pode ser R$ 0,00. Zero é um valor, não ausência.
  opening_amount numeric(12, 2) not null default 0,

  status text not null default 'open',

  closed_at timestamptz,
  closed_by uuid references public.app_users (id) on delete restrict,

  -- Calculados pelo servidor no fechamento (03 §16.4). `counted` é o único
  -- que a pessoa informa.
  expected_cash_amount numeric(12, 2),
  counted_cash_amount numeric(12, 2),
  difference_amount numeric(12, 2),
  difference_reason text,

  -- RN-CAIXA-014: dinheiro que ainda não entrou na gaveta no momento do
  -- fechamento. Substitui o `has_pending_driver_runs` booleano previsto em
  -- 02 §12.2 por algo que diz QUANTO, e não apenas que existe — e não
  -- depende de `driver_runs`, que é da Fase 8.
  pending_external_cash_amount numeric(12, 2),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint cash_sessions_status check (status in ('open', 'closed')),
  constraint cash_sessions_fundo check (opening_amount >= 0),
  constraint cash_sessions_contado check (counted_cash_amount is null or counted_cash_amount >= 0),

  -- Fechada é fechada: ou todos os campos do fechamento existem, ou nenhum.
  constraint cash_sessions_fechamento_coerente check (
    (status = 'open'
      and closed_at is null and closed_by is null
      and expected_cash_amount is null and counted_cash_amount is null
      and difference_amount is null)
    or
    (status = 'closed'
      and closed_at is not null and closed_by is not null
      and expected_cash_amount is not null and counted_cash_amount is not null
      and difference_amount is not null)
  ),

  -- A diferença é derivada, nunca digitada.
  constraint cash_sessions_diferenca_derivada check (
    difference_amount is null
    or difference_amount = counted_cash_amount - expected_cash_amount
  ),

  -- RN-CAIXA-012: diferença exige justificativa. Diferença zero não exige.
  constraint cash_sessions_diferenca_justificada check (
    difference_amount is null
    or difference_amount = 0
    or (difference_reason is not null and length(btrim(difference_reason)) >= 3)
  )
);

-- RN-CAIXA-006: várias sessões no mesmo dia, UMA ativa por registradora.
-- No índice, e não na aplicação: duas abas clicando "abrir caixa" ao mesmo
-- tempo têm de colidir no banco (CLAUDE.md §34).
create unique index cash_sessions_uma_aberta_por_registradora
  on public.cash_sessions (cash_register_id)
  where status = 'open';

create index cash_sessions_por_data on public.cash_sessions (operational_date desc, opened_at desc);
create index cash_sessions_abertas_por on public.cash_sessions (opened_by);
create index cash_sessions_fechadas_por on public.cash_sessions (closed_by);

comment on table public.cash_sessions is 'RN-CAIXA-001..016. Sessão é operacional: a meia-noite não fecha, não cria e não troca.';
comment on column public.cash_sessions.operational_date is 'Data LOCAL da abertura. Agrupa e ordena; nunca encerra a sessão (RN-CAIXA-005).';
comment on column public.cash_sessions.pending_external_cash_amount is 'RN-CAIXA-014: dinheiro ainda fora da gaveta no fechamento. Não é caixa físico.';

create trigger cash_sessions_updated_at
  before update on public.cash_sessions
  for each row execute function public.tg_set_updated_at();

-- ------------------------------------------------------------ movimentos
-- 02 §12.3. APPEND-ONLY por decisão (03 §16.3): corrigir é acrescentar um
-- movimento de reversão apontando para o original, nunca alterar o valor de
-- um movimento já gravado. Por isso `reverses_movement_id` e não um
-- `amount` editável.
create table public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  cash_session_id uuid not null references public.cash_sessions (id) on delete restrict,

  movement_type text not null,
  direction text not null,
  amount numeric(12, 2) not null,

  order_id uuid references public.orders (id) on delete restrict,
  payment_id uuid references public.payments (id) on delete restrict,
  financial_entry_id uuid,

  reason text,
  created_by uuid not null references public.app_users (id) on delete restrict,
  created_at timestamptz not null default now(),

  -- Reversão: o original permanece e ganha o apontador para quem o anulou.
  reverses_movement_id uuid references public.cash_movements (id) on delete restrict,
  reversed_at timestamptz,
  reversed_by uuid references public.app_users (id) on delete restrict,
  reversal_reason text,

  constraint cash_movements_tipo check (movement_type in (
    'opening', 'sale_receipt', 'supply', 'withdrawal', 'expense', 'refund', 'adjustment', 'other')),
  constraint cash_movements_direcao check (direction in ('in', 'out')),
  -- Valor é sempre positivo; quem decide o sinal é `direction`. Guardar
  -- negativo permitiria uma sangria "de valor negativo" que soma no caixa.
  constraint cash_movements_valor check (amount > 0),

  -- Cada tipo tem um sentido físico próprio. Sangria que entra dinheiro, ou
  -- reforço que sai, seriam contradições (RN-CAIXA-008/009).
  constraint cash_movements_sentido_do_tipo check (
    (movement_type = 'opening'      and direction = 'in')
    or (movement_type = 'sale_receipt' and direction = 'in')
    or (movement_type = 'supply'       and direction = 'in')
    or (movement_type = 'withdrawal'   and direction = 'out')
    or (movement_type = 'expense'      and direction = 'out')
    or (movement_type in ('refund', 'adjustment', 'other'))
  ),

  constraint cash_movements_reversao_coerente check (
    (reversed_at is null and reversed_by is null)
    or (reversed_at is not null and reversed_by is not null
        and reversal_reason is not null and length(btrim(reversal_reason)) >= 3)
  ),

  -- Ajuste e sangria pedem motivo: são as linhas que alguém vai querer
  -- explicar depois (RN-CAIXA-008, §33).
  constraint cash_movements_motivo_quando_exigido check (
    movement_type not in ('withdrawal', 'adjustment', 'other')
    or (reason is not null and length(btrim(reason)) >= 3)
  )
);

-- Um movimento só pode ser revertido UMA vez (CLAUDE.md §34: duplo estorno).
create unique index cash_movements_reversao_unica
  on public.cash_movements (reverses_movement_id)
  where reverses_movement_id is not null;

-- Um pagamento gera no máximo um recebimento em caixa.
create unique index cash_movements_um_recebimento_por_pagamento
  on public.cash_movements (payment_id)
  where payment_id is not null and movement_type = 'sale_receipt';

create index cash_movements_da_sessao on public.cash_movements (cash_session_id, created_at desc);
create index cash_movements_do_pedido on public.cash_movements (order_id) where order_id is not null;
create index cash_movements_do_lancamento on public.cash_movements (financial_entry_id) where financial_entry_id is not null;
create index cash_movements_criados_por on public.cash_movements (created_by);
create index cash_movements_revertidos_por on public.cash_movements (reversed_by) where reversed_by is not null;

comment on table public.cash_movements is '02 §12.3. Append-only: corrigir é acrescentar reversão vinculada, nunca editar valor (03 §16.3).';
comment on column public.cash_movements.amount is 'Sempre positivo. O sinal físico é `direction` — sangria negativa somaria no caixa.';

-- ------------------------------------------------- correção de fechamento
-- 02 §12.4 e RN-CAIXA-016. Reabrir NÃO apaga o fechamento: ele é fotografado
-- em `before_snapshot` antes de a sessão voltar a `open`. É assim que o
-- fechamento original continua reconstruível depois da correção.
create table public.cash_session_corrections (
  id uuid primary key default gen_random_uuid(),
  cash_session_id uuid not null references public.cash_sessions (id) on delete restrict,
  correction_type text not null,
  reason text not null,
  before_snapshot jsonb not null,
  after_snapshot jsonb,
  created_by uuid not null references public.app_users (id) on delete restrict,
  created_at timestamptz not null default now(),

  constraint cash_session_corrections_tipo check (correction_type in ('reopen', 'reclose')),
  constraint cash_session_corrections_motivo check (length(btrim(reason)) >= 3)
);

create index cash_session_corrections_da_sessao
  on public.cash_session_corrections (cash_session_id, created_at desc);

comment on table public.cash_session_corrections is 'RN-CAIXA-016: reabertura excepcional preserva o fechamento original em before_snapshot.';

-- ------------------------------------------------------------------- RLS
-- Deny by default (CLAUDE.md §12). `anon` não aparece em policy nenhuma:
-- caixa não tem leitura pública, nem parcial (03 §33.6).
alter table public.cash_registers            enable row level security;
alter table public.cash_registers            force  row level security;
alter table public.cash_sessions             enable row level security;
alter table public.cash_sessions             force  row level security;
alter table public.cash_movements            enable row level security;
alter table public.cash_movements            force  row level security;
alter table public.cash_session_corrections  enable row level security;
alter table public.cash_session_corrections  force  row level security;

-- Somente SELECT por policy. Escrita acontece exclusivamente pelas RPCs
-- transacionais da 0065 — que são SECURITY DEFINER e verificam permissão,
-- pré-condição e auditoria. Sem policy de INSERT/UPDATE, /rest/v1 não grava
-- caixa nem com token válido.
create policy cash_registers_select on public.cash_registers
  for select to authenticated using (public.has_permission('cash.view'));

create policy cash_sessions_select on public.cash_sessions
  for select to authenticated using (public.has_permission('cash.view'));

create policy cash_movements_select on public.cash_movements
  for select to authenticated using (public.has_permission('cash.view'));

create policy cash_session_corrections_select on public.cash_session_corrections
  for select to authenticated using (public.has_permission('cash.view'));
