-- 0062 — Estrutura do financeiro: categorias e lançamentos
-- 02-MODELO-DADOS-SUPABASE.md §13 · 04-REGRAS-NEGOCIO.md RN-FIN-001..005
-- 03-RLS-RBAC-SEGURANCA.md §17 · CLAUDE.md §27, §28, §33
--
-- ESTA TABELA NÃO É O LEDGER DE VENDAS. `financial_entries` guarda entrada e
-- despesa operacionais — a conta de luz, o troco comprado no banco, a venda
-- de uma caixa de garrafa vazia. O dinheiro de pedido vive em `payments`,
-- que é outro conceito (03 §17.1). Misturar os dois faria a receita de venda
-- depender de quem lançou a despesa certa.
--
-- E DESPESA NÃO É SANGRIA (RN-CAIXA-010). Sangria é dinheiro saindo da
-- gaveta para o cofre: o dinheiro continua sendo da Shalon. Despesa é gasto:
-- o dinheiro deixou de existir para o negócio. Quando a despesa é paga com o
-- caixa, ela produz TAMBÉM um movimento físico — mas são dois registros com
-- significados diferentes, e não um com dois nomes.

-- ---------------------------------------------------------- categorias
-- RN-FIN-001: configuráveis por usuário autorizado. Por isso NÃO há seed de
-- categorias aqui: "Fornecedores" ou "Contas" seriam conteúdo inventado por
-- mim, e a Shalon é quem nomeia o próprio plano de contas.
create table public.financial_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint financial_categories_nome check (length(btrim(name)) between 2 and 60),
  constraint financial_categories_nome_unico unique (name),
  constraint financial_categories_tipo check (kind in ('income', 'expense', 'both'))
);

create index financial_categories_ordem on public.financial_categories (is_active desc, sort_order, name);

comment on table public.financial_categories is 'RN-FIN-001: plano de contas configurável. Sem seed — quem nomeia é a Shalon.';

create trigger financial_categories_updated_at
  before update on public.financial_categories
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------- lançamentos
create table public.financial_entries (
  id uuid primary key default gen_random_uuid(),
  entry_type text not null,
  category_id uuid not null references public.financial_categories (id) on delete restrict,
  amount numeric(12, 2) not null,
  occurred_at timestamptz not null default now(),
  description text not null,

  -- Como foi pago/recebido. Nulo quando não se aplica.
  payment_method_id uuid references public.payment_methods (id) on delete set null,
  payment_method_name_snapshot text,

  -- Vínculo com a sessão quando o dinheiro passou pela gaveta. Nulo quando o
  -- lançamento não tocou o caixa físico — uma conta paga por transferência,
  -- por exemplo, é despesa e NÃO é saída de gaveta.
  cash_session_id uuid references public.cash_sessions (id) on delete restrict,

  attachment_asset_id uuid references public.media_assets (id) on delete set null,

  status text not null default 'confirmed',
  created_by uuid not null references public.app_users (id) on delete restrict,
  created_at timestamptz not null default now(),

  -- RN-FIN-003/004: o original permanece. `reverses_entry_id` é o vínculo
  -- que permite reconstruir original -> quem reverteu -> quando -> por quê.
  reverses_entry_id uuid references public.financial_entries (id) on delete restrict,
  reversed_by uuid references public.app_users (id) on delete restrict,
  reversed_at timestamptz,
  reversal_reason text,

  constraint financial_entries_tipo check (entry_type in ('income', 'expense')),
  constraint financial_entries_valor check (amount > 0),
  constraint financial_entries_descricao check (length(btrim(description)) >= 3),
  constraint financial_entries_status check (status in ('confirmed', 'reversed')),
  constraint financial_entries_reversao_coerente check (
    (status = 'confirmed' and reversed_by is null and reversed_at is null)
    or (status = 'reversed' and reversed_by is not null and reversed_at is not null
        and reversal_reason is not null and length(btrim(reversal_reason)) >= 3)
  )
);

-- CLAUDE.md §34: duplo estorno. Um lançamento é revertido no máximo uma vez.
create unique index financial_entries_reversao_unica
  on public.financial_entries (reverses_entry_id)
  where reverses_entry_id is not null;

create index financial_entries_por_data on public.financial_entries (occurred_at desc);
create index financial_entries_por_categoria on public.financial_entries (category_id, occurred_at desc);
create index financial_entries_da_sessao on public.financial_entries (cash_session_id) where cash_session_id is not null;
create index financial_entries_criados_por on public.financial_entries (created_by);

comment on table public.financial_entries is 'Entrada/despesa operacional. NÃO é o ledger de vendas — este é `payments` (03 §17.1).';
comment on column public.financial_entries.cash_session_id is 'Preenchido só quando o dinheiro passou pela gaveta. Despesa por transferência não é saída de caixa.';

-- A 0061 criou `cash_movements.financial_entry_id` sem FK porque a tabela
-- ainda não existia. Agora existe.
alter table public.cash_movements
  add constraint cash_movements_lancamento_fk
  foreign key (financial_entry_id) references public.financial_entries (id) on delete restrict;

-- ------------------------------------------------------------------- RLS
alter table public.financial_categories enable row level security;
alter table public.financial_categories force  row level security;
alter table public.financial_entries    enable row level security;
alter table public.financial_entries    force  row level security;

-- 03 §33.7: SELECT com `finance.view`; escrita só pelas RPCs.
create policy financial_categories_select on public.financial_categories
  for select to authenticated using (public.has_permission('finance.view'));

create policy financial_entries_select on public.financial_entries
  for select to authenticated using (public.has_permission('finance.view'));
