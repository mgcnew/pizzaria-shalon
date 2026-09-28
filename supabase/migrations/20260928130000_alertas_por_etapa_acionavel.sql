-- Só transições que entregam uma nova tarefa geram alerta. O pedido novo
-- continua separado; mudanças de andamento não devem tocar para toda equipe.

alter table public.admin_notifications
  drop constraint admin_notifications_kind_check;
alter table public.admin_notifications
  add constraint admin_notifications_kind_check check (kind in (
    'new_order', 'production_needed', 'ready_for_pickup',
    'ready_for_delivery', 'delivery_failed'
  ));

drop policy admin_notifications_select on public.admin_notifications;
create policy admin_notifications_select on public.admin_notifications
  for select to authenticated using (
    public.has_permission('orders.view')
    and case
      when kind in ('ready_for_delivery', 'delivery_failed')
        then public.has_permission('deliveries.manage')
      else public.has_permission('orders.accept')
    end
  );

-- O snapshot de produção só fica pronto depois dos itens de criar_pedido.
-- Pedido já aceito nasce como tarefa de produção, não como um segundo alerta
-- genérico de novo pedido.
create or replace function public.tg_notificar_novo_pedido()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.source = 'counter' and not coalesce(new.requires_production, true) then
    return new;
  end if;

  if new.status in ('waiting_pix_confirmation', 'waiting_delivery_approval',
                    'waiting_store_confirmation') then
    insert into public.admin_notifications (kind, order_id, order_number)
    values ('new_order', new.id, new.order_number)
    on conflict (kind, order_id) do nothing;
  elsif new.status = 'confirmed' and new.requires_production then
    insert into public.admin_notifications (kind, order_id, order_number)
    values ('production_needed', new.id, new.order_number)
    on conflict (kind, order_id) do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.tg_notificar_etapa_pedido()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_kind text;
begin
  if new.status is not distinct from old.status
     or (new.source = 'counter' and not coalesce(new.requires_production, true)) then
    return new;
  end if;

  v_kind := case
    when new.status = 'confirmed' and new.requires_production then 'production_needed'
    when new.status = 'ready_for_pickup' then 'ready_for_pickup'
    when new.status = 'ready_for_delivery' then 'ready_for_delivery'
    when new.status = 'delivery_failed' then 'delivery_failed'
    else null
  end;

  if v_kind is not null then
    insert into public.admin_notifications (kind, order_id, order_number)
    values (v_kind, new.id, new.order_number)
    on conflict (kind, order_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.tg_notificar_etapa_pedido() from public, anon, authenticated;

create trigger orders_admin_notify_action
  after update of status on public.orders
  for each row execute function public.tg_notificar_etapa_pedido();

-- O sino mostra pendências atuais; o histórico permanece depois da transição.
create or replace function public.notificacao_admin_resolvida(p_kind text, p_status text)
returns boolean language sql immutable set search_path = ''
as $$
  select case p_kind
    when 'new_order' then p_status not in (
      'waiting_pix_confirmation', 'waiting_delivery_approval',
      'waiting_store_confirmation'
    )
    when 'production_needed' then p_status <> 'confirmed'
    when 'ready_for_pickup' then p_status <> 'ready_for_pickup'
    when 'ready_for_delivery' then p_status <> 'ready_for_delivery'
    when 'delivery_failed' then p_status <> 'delivery_failed'
    else true
  end;
$$;

revoke all on function public.notificacao_admin_resolvida(text, text) from public, anon;
grant execute on function public.notificacao_admin_resolvida(text, text) to authenticated;

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
    'resolved', public.notificacao_admin_resolvida(n.kind, o.status)
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
   where not public.notificacao_admin_resolvida(n.kind, o.status)
     and not exists (
       select 1 from public.admin_notification_reads r
       where r.notification_id = n.id
         and r.app_user_id = public.current_app_user_id()
     );

  return jsonb_build_object('items', v_itens, 'unread_count', v_nao_lidas);
end;
$$;
