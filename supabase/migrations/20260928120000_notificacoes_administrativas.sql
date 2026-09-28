-- Notificações persistentes do painel. Realtime avisa; a projeção sob RLS
-- continua sendo a fonte de verdade. Sem telefone, endereço ou itens no evento.

create table public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('new_order')),
  order_id uuid not null references public.orders (id) on delete restrict,
  order_number bigint not null,
  created_at timestamptz not null default now(),
  unique (kind, order_id)
);

create index admin_notifications_recent_idx
  on public.admin_notifications (created_at desc, id desc);

create table public.admin_notification_reads (
  notification_id uuid not null references public.admin_notifications (id) on delete cascade,
  app_user_id uuid not null references public.app_users (id) on delete restrict,
  read_at timestamptz not null default now(),
  primary key (notification_id, app_user_id)
);

create index admin_notification_reads_user_idx
  on public.admin_notification_reads (app_user_id, read_at desc);

alter table public.admin_notifications enable row level security;
alter table public.admin_notifications force row level security;
alter table public.admin_notification_reads enable row level security;
alter table public.admin_notification_reads force row level security;

create policy admin_notifications_select on public.admin_notifications
  for select to authenticated using (public.has_permission('orders.view'));

create policy admin_notification_reads_select on public.admin_notification_reads
  for select to authenticated using (
    app_user_id = public.current_app_user_id()
    and public.has_permission('orders.view')
  );

create policy admin_notification_reads_insert on public.admin_notification_reads
  for insert to authenticated with check (
    app_user_id = public.current_app_user_id()
    and public.has_permission('orders.view')
    and exists (select 1 from public.admin_notifications n where n.id = notification_id)
  );

revoke all on public.admin_notifications from public, anon, authenticated;
revoke all on public.admin_notification_reads from public, anon, authenticated;
grant select on public.admin_notifications to authenticated;
grant select, insert on public.admin_notification_reads to authenticated;

create or replace function public.tg_notificar_novo_pedido()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  -- A venda rápida criada e concluída no próprio PDV não pede atenção nova.
  if new.source = 'counter' and not coalesce(new.requires_production, true) then
    return new;
  end if;

  insert into public.admin_notifications (kind, order_id, order_number)
  values ('new_order', new.id, new.order_number)
  on conflict (kind, order_id) do nothing;
  return new;
end;
$$;

revoke all on function public.tg_notificar_novo_pedido() from public, anon, authenticated;

-- criar_pedido grava requires_production DEPOIS de inserir itens. Escutar o
-- UPDATE do snapshot evita alertar vendas rápidas que terminarão no PDV.
create trigger orders_admin_notify_ready
  after update of requires_production on public.orders
  for each row execute function public.tg_notificar_novo_pedido();

-- Pedidos ainda abertos no momento da implantação já aparecem no sino, sem
-- tocar som: o componente só toca para eventos recebidos após conectar.
insert into public.admin_notifications (kind, order_id, order_number, created_at)
select 'new_order', o.id, o.order_number, o.created_at
  from public.orders o
 where o.status not in ('completed', 'rejected', 'cancelled')
   and (o.source <> 'counter' or o.requires_production)
on conflict (kind, order_id) do nothing;

create or replace function public.notificacoes_administrativas(p_limite integer default 30)
returns jsonb language plpgsql stable set search_path = ''
as $$
declare
  v_itens jsonb;
  v_nao_lidas integer;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', n.id, 'kind', n.kind, 'order_id', n.order_id,
    'order_number', n.order_number, 'created_at', n.created_at,
    'read', r.notification_id is not null,
    'resolved', o.status in ('completed', 'rejected', 'cancelled')
  ) order by n.created_at desc, n.id desc), '[]'::jsonb)
    into v_itens
    from (
      select * from public.admin_notifications
      order by created_at desc, id desc
      limit greatest(1, least(coalesce(p_limite, 30), 100))
    ) n
    join public.orders o on o.id = n.order_id
    left join public.admin_notification_reads r
      on r.notification_id = n.id and r.app_user_id = public.current_app_user_id();

  select count(*) into v_nao_lidas
    from public.admin_notifications n
    join public.orders o on o.id = n.order_id
   where o.status not in ('completed', 'rejected', 'cancelled')
     and not exists (
       select 1 from public.admin_notification_reads r
       where r.notification_id = n.id
         and r.app_user_id = public.current_app_user_id()
     );

  return jsonb_build_object('items', v_itens, 'unread_count', v_nao_lidas);
end;
$$;

revoke all on function public.notificacoes_administrativas(integer) from public, anon;
grant execute on function public.notificacoes_administrativas(integer) to authenticated;

create or replace function public.marcar_notificacao_lida(p_notificacao uuid)
returns jsonb language plpgsql set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
begin
  if v_ator is null or not public.has_permission('orders.view') then
    return jsonb_build_object('ok', false, 'erro', 'Sem permissão para notificações.');
  end if;

  insert into public.admin_notification_reads (notification_id, app_user_id)
  values (p_notificacao, v_ator)
  on conflict (notification_id, app_user_id) do nothing;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.marcar_notificacao_lida(uuid) from public, anon;
grant execute on function public.marcar_notificacao_lida(uuid) to authenticated;

alter publication supabase_realtime add table public.admin_notifications;
