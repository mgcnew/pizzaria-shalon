-- 0039 — Intenção de pagamento e pagamento realizado
-- 02-MODELO-DADOS-SUPABASE.md §10.4 e §10.5 · RN-PGTO-002/003/005/010
-- 01-DOCUMENTO-MESTRE.md §79.12 · CLAUDE.md §24
--
-- DUAS TABELAS PORQUE SÃO DUAS COISAS (CLAUDE.md §24):
--   · `order_payment_intents` — o que o cliente DECLAROU no checkout;
--   · `payments` — o que a Shalon efetivamente RECEBEU.
--
-- Relatório financeiro usa o realizado (RN-PGTO-003). Sobrescrever a
-- intenção para "corrigir" o histórico apagaria justamente a informação que
-- explica a diferença.
--
-- A Fase 5 cria apenas a INTENÇÃO. Recebimento é operação da Fase 6+.

create table public.order_payment_intents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,

  payment_method_id uuid references public.payment_methods (id) on delete set null,
  payment_method_name_snapshot text not null,
  payment_method_family_snapshot text not null,
  payment_brand_id uuid references public.payment_brands (id) on delete set null,
  payment_brand_name_snapshot text,

  amount_expected numeric(12, 2) not null,

  -- RN-PGTO-005: troco. O valor informado não pode ser menor que o total, e
  -- o troco esperado é CALCULADO, não digitado.
  needs_change boolean not null default false,
  change_for_amount numeric(12, 2),
  expected_change_amount numeric(12, 2),

  -- RN-PGTO-010: escolher Pix não marca como pago. Fica aguardando
  -- confirmação manual, que registra quem e quando (RN-PGTO-011).
  pix_confirmation_status text,
  pix_confirmed_by uuid references public.app_users (id) on delete set null,
  pix_confirmed_at timestamptz,

  created_at timestamptz not null default now(),

  constraint order_payment_intents_valor check (amount_expected >= 0),
  constraint order_payment_intents_troco_coerente check (
    (not needs_change and change_for_amount is null and expected_change_amount is null)
    or (needs_change and change_for_amount is not null and expected_change_amount is not null
        and change_for_amount >= amount_expected
        and expected_change_amount = change_for_amount - amount_expected)
  ),
  constraint order_payment_intents_pix check (
    pix_confirmation_status is null
    or pix_confirmation_status in ('pending', 'confirmed', 'rejected')
  ),
  -- Um pedido público declara UM meio de pagamento (RN-PGTO-004).
  constraint order_payment_intents_uma_por_pedido unique (order_id)
);

create index order_payment_intents_forma on public.order_payment_intents (payment_method_id);
create index order_payment_intents_bandeira on public.order_payment_intents (payment_brand_id);
create index order_payment_intents_confirmado_por on public.order_payment_intents (pix_confirmed_by);

comment on table public.order_payment_intents is 'O que o cliente declarou no checkout. Não é recebimento (RN-PGTO-002).';
comment on column public.order_payment_intents.expected_change_amount is 'RN-PGTO-005: troco calculado, nunca digitado.';

-- O que realmente entrou. Permite mais de uma linha para registrar
-- pagamento dividido no administrativo, embora o checkout público crie uma
-- intenção só (02 §10.5).
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  payment_method_id uuid references public.payment_methods (id) on delete set null,
  payment_brand_id uuid references public.payment_brands (id) on delete set null,
  amount numeric(12, 2) not null,
  status text not null default 'pending',
  received_at timestamptz,
  confirmed_by uuid references public.app_users (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),

  constraint payments_valor check (amount >= 0),
  constraint payments_status check (status in ('pending', 'confirmed', 'reversed'))
);

create index payments_do_pedido on public.payments (order_id, status);
create index payments_forma on public.payments (payment_method_id);
create index payments_bandeira on public.payments (payment_brand_id);
create index payments_confirmado_por on public.payments (confirmed_by);

comment on table public.payments is 'Recebimento real. Relatórios financeiros usam esta tabela, não a intenção (RN-PGTO-003).';
