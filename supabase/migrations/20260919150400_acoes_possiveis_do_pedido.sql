-- 0054 — O que dá para fazer com este pedido, agora
-- CLAUDE.md §9 e §21 · 05-PLANO-IMPLEMENTACAO.md §10.2
--
-- POR QUE ISTO EXISTE.
--
-- A interface precisa saber quais botões mostrar. A tentação é reimplementar
-- a máquina de estados em TypeScript para decidir isso — e aí passam a
-- existir duas verdades sobre quando se pode aceitar um pedido, que
-- divergem no primeiro ajuste.
--
-- Em vez disso o servidor responde: "para este pedido, neste estado, com as
-- permissões deste usuário, as ações são estas". A interface só desenha.
-- Continua valendo que o comando revalida tudo por conta própria: esta
-- lista é conveniência, não autorização.

create table public.order_commands (
  comando text primary key,
  rotulo text not null,
  exige_motivo boolean not null default false,
  destrutivo boolean not null default false,
  sort_order integer not null
);

alter table public.order_commands enable row level security;
alter table public.order_commands force row level security;

create policy order_commands_select on public.order_commands
  for select to authenticated using (public.has_permission('orders.view'));

insert into public.order_commands (comando, rotulo, exige_motivo, destrutivo, sort_order) values
  ('confirmar_pix',           'Confirmar Pix recebido',   false, false, 10),
  ('aprovar_entrega',         'Aprovar entrega',          false, false, 20),
  ('rejeitar_entrega',        'Recusar entrega',          true,  true,  30),
  ('aceitar',                 'Aceitar pedido',           false, false, 40),
  ('iniciar_producao',        'Iniciar produção',         false, false, 50),
  ('marcar_pronto',           'Marcar como pronto',       false, false, 60),
  ('despachar',               'Saiu para entrega',        false, false, 70),
  ('concluir',                'Concluir',                 false, false, 80),
  ('registrar_falha_entrega', 'Registrar falha na entrega', true, true,  90),
  ('rejeitar',                'Rejeitar pedido',          true,  true, 100),
  ('cancelar',                'Cancelar pedido',          true,  true, 110);

comment on table public.order_commands is 'Rótulo e exigências de cada comando. A aplicabilidade é decidida em acoes_do_pedido.';

create or replace function public.acoes_do_pedido(p_order_id uuid)
returns jsonb language sql stable set search_path = ''
as $$
  with pedido as (
    select o.id, o.status, o.fulfillment_type, o.delivery_approval_status,
           pi.pix_confirmation_status as pix,
           exists (select 1 from public.order_revisions r
                    where r.order_id = o.id and r.status = 'pending_customer') as revisao_aberta
    from public.orders o
    left join public.order_payment_intents pi on pi.order_id = o.id
    where o.id = p_order_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'comando', c.comando, 'rotulo', c.rotulo,
           'exige_motivo', c.exige_motivo, 'destrutivo', c.destrutivo)
         order by c.sort_order), '[]'::jsonb)
  from public.order_commands c, pedido p
  where
    -- Permissão semântica efetiva do usuário, no momento (RN-RBAC-004).
    public.has_permission(public.permissao_do_comando(c.comando))
    and case c.comando
      -- Pendências que não dependem do status, e sim da própria dimensão.
      when 'confirmar_pix'    then p.pix = 'pending'
      when 'aprovar_entrega'  then p.delivery_approval_status = 'pending'
      when 'rejeitar_entrega' then p.delivery_approval_status = 'pending'

      -- O status já expressa os bloqueios: com Pix ou entrega pendentes o
      -- pedido nem chega a `waiting_store_confirmation`.
      when 'aceitar'          then p.status = 'waiting_store_confirmation'
                                   and not p.revisao_aberta
      when 'iniciar_producao' then p.status = 'confirmed'
      when 'marcar_pronto'    then p.status = 'in_production'
      when 'despachar'        then p.status = 'ready_for_delivery'

      -- Concluir vale para retirada no balcão, entrega finalizada e também
      -- depois de uma falha resolvida (RN-STATE-008).
      when 'concluir'         then p.status in ('ready_for_pickup', 'out_for_delivery',
                                                'delivery_failed')
      when 'registrar_falha_entrega' then p.status = 'out_for_delivery'

      -- RN-STATE-009: rejeição é antes da aceitação operacional.
      when 'rejeitar'         then p.status in ('waiting_pix_confirmation',
                                                'waiting_delivery_approval',
                                                'waiting_store_confirmation',
                                                'change_requested_waiting_customer')
      -- Cancelar existe enquanto o pedido estiver vivo.
      when 'cancelar'         then p.status not in ('completed', 'rejected', 'cancelled')
      else false
    end;
$$;

revoke all on function public.acoes_do_pedido(uuid) from public, anon;
grant execute on function public.acoes_do_pedido(uuid) to authenticated;

comment on function public.acoes_do_pedido is 'O que ESTE usuário pode fazer com ESTE pedido agora. Conveniência: o comando revalida tudo.';

-- As duas projeções passam a devolver as ações junto, para a interface não
-- precisar de uma segunda ida ao servidor por pedido.
create or replace function public.fila_de_pedidos(p_encerrados boolean default false)
returns jsonb language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(f order by f.criado_em desc), '[]'::jsonb)
  from (
    select
      o.id, o.order_number as numero, o.status, o.fulfillment_type as modalidade,
      o.source as origem,
      o.customer_name_snapshot as cliente,
      o.subtotal, o.delivery_fee as taxa_entrega, o.total,
      o.created_at as criado_em, o.accepted_at as aceito_em,
      o.estimated_min_minutes as estimativa_min,
      o.estimated_max_minutes as estimativa_max,
      o.general_note as observacao,
      o.delivery_route_distance_km as distancia_km,
      (select count(*) from public.order_items i where i.order_id = o.id) as itens,
      pi.payment_method_name_snapshot as forma_pagamento,
      pi.expected_change_amount as troco,
      (pi.pix_confirmation_status = 'pending') as aguarda_pix,
      (o.delivery_approval_status = 'pending') as aguarda_aprovacao_entrega,
      exists (select 1 from public.order_revisions r
               where r.order_id = o.id and r.status = 'pending_customer') as aguarda_cliente,
      (o.status in ('completed', 'rejected', 'cancelled')) as encerrado,
      public.acoes_do_pedido(o.id) as acoes
    from public.orders o
    left join public.order_payment_intents pi on pi.order_id = o.id
    where (o.status in ('completed', 'rejected', 'cancelled')) = p_encerrados
  ) f;
$$;

comment on function public.fila_de_pedidos is 'Central operacional. INVOKER: sem orders.view não retorna nada.';
