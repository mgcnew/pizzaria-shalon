-- Histórico financeiro operacional do PDV.
-- Reúne toda venda que teve pagamento, independentemente da origem ou de ter
-- exigido produção. A projeção é somente leitura; o estorno continua passando
-- exclusivamente por `reverter_pagamento` e pela permissão `finance.reverse`.

create or replace function public.historico_vendas_pdv(p_limite integer default 100)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_limite integer := greatest(1, least(coalesce(p_limite, 100), 300));
  v_vendas jsonb;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;

  if not public.has_permission('finance.view')
     or not public.has_permission('orders.view') then
    return jsonb_build_object('ok', false,
      'erro', 'Você não tem permissão para consultar o histórico de vendas.');
  end if;

  with pagamentos as (
    select p.order_id,
           min(p.received_at) as pago_em,
           max(p.reversed_at) as estornado_em,
           string_agg(distinct concat_ws(' · ', p.payment_method_name_snapshot,
                                                 p.payment_brand_name_snapshot), ' + '
                      order by concat_ws(' · ', p.payment_method_name_snapshot,
                                                p.payment_brand_name_snapshot)) as formas,
           sum(p.amount) as valor,
           bool_or(p.status = 'confirmed') as tem_confirmado
      from public.payments p
     where p.status in ('confirmed', 'reversed')
     group by p.order_id
  ), recentes as (
    select o.id,
           o.order_number,
           o.source,
           o.customer_name_snapshot,
           o.fulfillment_type,
           o.status,
           o.payment_status,
           o.requires_production,
           o.total,
           o.created_at,
           p.pago_em,
           p.estornado_em,
           p.formas,
           p.valor,
           p.tem_confirmado
      from pagamentos p
      join public.orders o on o.id = p.order_id
     order by p.pago_em desc, o.order_number desc
     limit v_limite
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'pedido_id', r.id,
           'numero', r.order_number,
           'origem', r.source,
           'cliente', r.customer_name_snapshot,
           'modalidade', r.fulfillment_type,
           'status_pedido', r.status,
           'situacao_pagamento', r.payment_status,
           'exige_producao', r.requires_production,
           'total_pedido', r.total,
           'valor_pago', r.valor,
           'formas', r.formas,
           'criado_em', r.created_at,
           'pago_em', r.pago_em,
           'estornado_em', r.estornado_em,
           'pode_estornar', r.tem_confirmado)
         order by r.pago_em desc, r.order_number desc), '[]'::jsonb)
    into v_vendas
    from recentes r;

  return jsonb_build_object('ok', true, 'vendas', v_vendas);
end;
$$;

revoke all on function public.historico_vendas_pdv(integer) from public, anon;
grant execute on function public.historico_vendas_pdv(integer) to authenticated;

comment on function public.historico_vendas_pdv is
  'Histórico de vendas com pagamento confirmado ou estornado, de qualquer origem, para consulta no PDV.';
