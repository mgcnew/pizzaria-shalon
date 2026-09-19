-- 0047 — Revisões de pedido, registro de impressões e a permissão do Pix
-- 04-REGRAS-NEGOCIO.md RN-ALT-001..007, RN-PRINT-001..006 · CLAUDE.md §22, §32, §33
-- 03-RLS-RBAC-SEGURANCA.md §6 (matriz), §9, §13

-- ---------------------------------------------------------- permissão do Pix
-- A matriz de acesso (03 §6) diz, para Pix antecipado: Atendente padrão
-- "confirmar SE AUTORIZADO", Dono "confirmar". Ou seja, é permissão
-- concedível — não algo que o Atendente tem por definição, e também não
-- algo exclusivo do Dono para sempre.
--
-- Nenhuma das permissões existentes expressa isso: `orders.accept` é a
-- operação seguinte, e `finance.create` é lançamento financeiro. Confirmar
-- recebimento de Pix é uma ação semântica própria (CLAUDE.md §14).
--
-- Concedida ao Dono/Admin. O Atendente NÃO a recebe por padrão; quando a
-- Shalon quiser que o balcão confirme Pix, concede pela gestão de papéis.
insert into public.permissions (code, module, action, description)
values ('orders.confirm_pix', 'orders', 'confirm_pix',
        'Confirmar manualmente o recebimento de Pix antecipado por chave');

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r, public.permissions p
where r.name = 'Owner/Admin' and p.code = 'orders.confirm_pix';

-- ------------------------------------------------------------- revisões
-- RN-ALT-003 e RN-ALT-007: a alteração registra estado anterior, proposta,
-- responsável, horário e diferenças — e a aprovação NÃO sobrescreve o
-- histórico, cria revisão.
--
-- Motivo de existir uma tabela e não colunas no pedido: um pedido pode ser
-- alterado mais de uma vez, e cada proposta tem vida própria (proposta,
-- aguardando cliente, aprovada, recusada, retirada).
create table public.order_revisions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  revision_number integer not null,

  reason text not null,
  proposed_by uuid not null references public.app_users(id),
  proposed_at timestamptz not null default now(),

  -- RN-ALT-004: só exige aprovação quando itens ou total mudam.
  requires_customer_approval boolean not null,
  status text not null default 'pending_customer',

  -- RN-ALT-005: a tela de aprovação mostra anterior e novo.
  items_before jsonb not null,
  items_after jsonb not null,
  subtotal_before numeric(10,2) not null,
  total_before numeric(10,2) not null,
  subtotal_after numeric(10,2) not null,
  total_after numeric(10,2) not null,

  decided_at timestamptz,
  decided_by_customer boolean,
  applied_at timestamptz,

  created_at timestamptz not null default now(),

  constraint order_revisions_status check (
    status in ('pending_customer', 'approved', 'rejected', 'withdrawn', 'applied')),
  constraint order_revisions_numero unique (order_id, revision_number),
  constraint order_revisions_valores check (
    subtotal_before >= 0 and total_before >= 0 and
    subtotal_after >= 0 and total_after >= 0)
);

-- Só UMA proposta aberta por pedido: duas propostas simultâneas deixariam o
-- cliente sem saber o que está aprovando.
create unique index order_revisions_aberta
  on public.order_revisions (order_id)
  where status = 'pending_customer';

create index order_revisions_do_pedido on public.order_revisions (order_id, revision_number desc);
create index order_revisions_proposta_por on public.order_revisions (proposed_by);

comment on table public.order_revisions is 'RN-ALT: proposta de alteração com antes/depois. Aprovação cria revisão, não sobrescreve.';

-- ----------------------------------------------------------- impressões
-- RN-PRINT-004 e §33: reimpressão é registrada. E §12 da Fase 6: não
-- declarar "impresso" porque o navegador disparou algo.
--
-- Os quatro estados existem porque o transporte físico ainda não foi
-- escolhido (A-08) e porque alguns transportes simplesmente não confirmam:
--   requested — a operação pediu o documento;
--   sent      — os bytes saíram da aplicação;
--   confirmed — o equipamento confirmou;
--   error     — falhou, com motivo.
-- Nenhum caminho pula direto para `confirmed`.
create table public.order_prints (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  revision_id uuid references public.order_revisions(id),

  document_type text not null,
  copy_number integer not null default 1,

  status text not null default 'requested',
  transport text,
  error_message text,

  requested_by uuid not null references public.app_users(id),
  requested_at timestamptz not null default now(),
  sent_at timestamptz,
  confirmed_at timestamptz,

  -- Identifica o CONTEÚDO impresso. Duas vias iguais têm o mesmo hash;
  -- conteúdo diferente com o mesmo número de pedido denuncia divergência.
  content_hash text not null,
  content_preview text not null,

  constraint order_prints_documento check (document_type in ('comanda', 'alteracao')),
  constraint order_prints_status check (status in ('requested', 'sent', 'confirmed', 'error')),
  constraint order_prints_via check (copy_number >= 1),
  constraint order_prints_erro_tem_motivo check (status <> 'error' or error_message is not null)
);

create index order_prints_do_pedido on public.order_prints (order_id, requested_at desc);
create index order_prints_solicitado_por on public.order_prints (requested_by);
create index order_prints_da_revisao on public.order_prints (revision_id) where revision_id is not null;

comment on table public.order_prints is 'RN-PRINT-004: toda impressão e reimpressão registrada, com estado real do transporte.';

-- ------------------------------------------------------------------ RLS
alter table public.order_revisions enable row level security;
alter table public.order_revisions force row level security;
alter table public.order_prints enable row level security;
alter table public.order_prints force row level security;

-- Leitura interna por `orders.view`. Escrita NÃO tem policy: acontece
-- apenas dentro dos comandos de domínio (§9.1 aplicado à operação interna).
-- Nada para `anon`: o cliente vê a proposta pela projeção do token.
create policy order_revisions_select on public.order_revisions
  for select to authenticated using (public.has_permission('orders.view'));

create policy order_prints_select on public.order_prints
  for select to authenticated using (public.has_permission('orders.view'));
