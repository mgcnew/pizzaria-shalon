-- 0088 — Remarketing: consentimento, templates e tentativas de contato
-- 02-MODELO-DADOS-SUPABASE.md §15.1, §15.2, §15.3 · 01-DOCUMENTO-MESTRE.md §79.22
-- 04-REGRAS-NEGOCIO.md RN-RMKT-001..008, RN-CLI-007 · 03 §12 · CLAUDE.md §31
--
-- O QUE ESTA ESTRUTURA PRECISA SUSTENTAR, antes de qualquer tela:
--
-- 1. CONSENTIMENTO É HISTÓRICO, não um booleano que alguém sobrescreve. Hoje
--    `customers.marketing_consent` guarda o estado atual; quem disse o quê e
--    quando não existia em lugar nenhum. `marketing_consent_history` é esse
--    registro, e é ele que sustenta "o cliente pediu para não receber".
--
-- 2. TENTATIVA NÃO É ENVIO. Abrir o WhatsApp com a mensagem pronta é uma
--    coisa; ter falado com a pessoa é outra. Por isso `result` nasce nulo:
--    o contato é PREPARADO, e o desfecho é informado depois, por quem falou.
--
-- 3. COMPRA POSTERIOR NÃO É CAUSA. `subsequent_order_id` diz que houve
--    compra depois do contato — e o nome `returned_after_contact` é
--    deliberadamente temporal (RN-RMKT-005). Nenhuma coluna aqui afirma que
--    a campanha gerou a venda, e nenhuma projeção da Fase 9 vai afirmar.

-- ============================================== histórico de consentimento
create table public.marketing_consent_history (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete restrict,

  consent boolean not null,
  -- De onde veio a decisão. `checkout` é o cliente marcando a caixa;
  -- `remarketing` é ele pedindo para parar durante um contato; `admin` é a
  -- Shalon registrando o pedido dele por outro canal.
  source text not null,
  notes text,

  -- Quem registrou. Nulo quando foi o próprio cliente, pelo checkout.
  actor_type text not null default 'customer',
  actor_user_id uuid references public.app_users (id) on delete set null,

  created_at timestamptz not null default now(),

  constraint marketing_consent_history_origem check (
    source in ('checkout', 'remarketing', 'admin', 'import', 'other')),
  constraint marketing_consent_history_ator check (
    actor_type in ('customer', 'user', 'system')),
  -- Ato de funcionário tem autor; ato do cliente não tem.
  constraint marketing_consent_history_autor_coerente check (
    (actor_type = 'user') = (actor_user_id is not null))
);

create index marketing_consent_history_do_cliente
  on public.marketing_consent_history (customer_id, created_at desc);

comment on table public.marketing_consent_history is
  'RN-RMKT-006/007: histórico da autorização promocional. Comunicação operacional do pedido é independente (RN-RMKT-008).';

-- ==================================================== templates de mensagem
-- RN-RMKT-002: a mensagem é PRÉ-PREENCHIDA e editável antes de abrir o
-- WhatsApp. Nada aqui gera texto sozinho (CLAUDE.md §31: sem disparo
-- automático, sem campanha em massa).
create table public.remarketing_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  message text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,

  created_by uuid references public.app_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint remarketing_templates_nome check (length(btrim(name)) between 2 and 60),
  constraint remarketing_templates_nome_unico unique (name),
  constraint remarketing_templates_mensagem check (length(btrim(message)) between 5 and 700)
);

comment on table public.remarketing_templates is
  'Modelos de mensagem. Variáveis suportadas: {{nome}}, {{dias_sem_comprar}}, {{ultima_compra}}.';

create trigger remarketing_templates_updated_at
  before update on public.remarketing_templates
  for each row execute function public.tg_set_updated_at();

-- ================================================== tentativas de contato
create table public.remarketing_contacts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete restrict,
  template_id uuid references public.remarketing_templates (id) on delete set null,

  channel text not null default 'whatsapp',

  -- O segmento que originou a sugestão, para o relatório saber de onde a
  -- pessoa veio. É rótulo de seleção, não campanha com disparo.
  segment text,

  -- §28: guarda o texto REALMENTE preparado, porque o funcionário pode ter
  -- editado. Não guarda mais dado pessoal do que isso — telefone e endereço
  -- continuam só no cadastro.
  message_snapshot text not null,

  -- RN-RMKT-003/004: o resultado é informado DEPOIS, por quem falou. Nulo
  -- significa "preparado, sem desfecho informado" — e é assim que a tela
  -- distingue tentativa de conversa.
  result text,
  result_at timestamptz,
  result_by uuid references public.app_users (id) on delete set null,
  notes text,

  -- RN-RMKT-005: houve compra DEPOIS. Temporal, nunca causal.
  subsequent_order_id uuid references public.orders (id) on delete set null,
  returned_after_contact boolean not null default false,

  prepared_by uuid not null references public.app_users (id) on delete restrict,
  contacted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint remarketing_contacts_canal check (channel in ('whatsapp', 'phone', 'other')),
  constraint remarketing_contacts_resultado check (
    result is null
    or result in ('contacted', 'no_response', 'interested', 'opted_out', 'other')),
  -- Resultado informado tem autor e horário. Sem resultado, nenhum dos dois.
  constraint remarketing_contacts_resultado_coerente check (
    (result is null and result_at is null and result_by is null)
    or (result is not null and result_at is not null and result_by is not null)),
  constraint remarketing_contacts_mensagem check (length(btrim(message_snapshot)) >= 5),
  -- A marca de retorno depende do pedido que a sustenta: sem pedido, a
  -- afirmação não teria como ser conferida.
  constraint remarketing_contacts_retorno_coerente check (
    returned_after_contact = (subsequent_order_id is not null))
);

create index remarketing_contacts_do_cliente
  on public.remarketing_contacts (customer_id, contacted_at desc);
create index remarketing_contacts_por_data
  on public.remarketing_contacts (contacted_at desc);
create index remarketing_contacts_sem_resultado
  on public.remarketing_contacts (contacted_at desc) where result is null;
create index remarketing_contacts_preparado_por on public.remarketing_contacts (prepared_by);
create index remarketing_contacts_resultado_por on public.remarketing_contacts (result_by);
create index remarketing_contacts_pedido_posterior
  on public.remarketing_contacts (subsequent_order_id) where subsequent_order_id is not null;
create index remarketing_contacts_template on public.remarketing_contacts (template_id);

comment on table public.remarketing_contacts is
  'RN-RMKT-003/004/005: tentativa preparada, desfecho informado depois. Compra posterior é temporal, nunca causal.';
comment on column public.remarketing_contacts.result is
  'Nulo = preparado sem desfecho informado. Abrir o WhatsApp NÃO é falar com a pessoa.';
comment on column public.remarketing_contacts.returned_after_contact is
  'RN-RMKT-005: houve compra depois do contato. Não afirma que o contato a causou.';

create trigger remarketing_contacts_updated_at
  before update on public.remarketing_contacts
  for each row execute function public.tg_set_updated_at();

-- ------------------------------------------------------------------- RLS
-- Deny by default (CLAUDE.md §12). `anon` não aparece em policy nenhuma:
-- remarketing é operação interna, e o cliente não consulta o que a pizzaria
-- anotou sobre ele.
alter table public.marketing_consent_history enable row level security;
alter table public.marketing_consent_history force  row level security;
alter table public.remarketing_templates     enable row level security;
alter table public.remarketing_templates     force  row level security;
alter table public.remarketing_contacts      enable row level security;
alter table public.remarketing_contacts      force  row level security;

-- Consentimento é dado do cliente: quem enxerga cliente, enxerga.
create policy marketing_consent_history_select on public.marketing_consent_history
  for select to authenticated using (public.has_permission('customers.view'));

-- Template é conteúdo operacional de remarketing.
create policy remarketing_templates_select on public.remarketing_templates
  for select to authenticated using (public.has_permission('remarketing.view'));

create policy remarketing_contacts_select on public.remarketing_contacts
  for select to authenticated using (public.has_permission('remarketing.view'));

-- Escrita nenhuma por policy: acontece só pelas RPCs da 0091, que verificam
-- permissão, consentimento e pré-condição. Sem policy de INSERT/UPDATE,
-- /rest/v1 não grava contato nem consentimento.

-- ------------------------------------------------------------- auditoria
-- §33 e §22.2: consentimento é decisão do cliente sobre os próprios dados, e
-- toda mudança dele fica registrada. O contato em si tem tabela própria que
-- já é o registro do ato; auditar duas vezes só encheria `audit_logs`.
create trigger marketing_consent_history_audit
  after insert on public.marketing_consent_history
  for each row execute function public.tg_audit_generico('customer_id');

create trigger remarketing_templates_audit
  after insert or update or delete on public.remarketing_templates
  for each row execute function public.tg_audit_generico('id');
