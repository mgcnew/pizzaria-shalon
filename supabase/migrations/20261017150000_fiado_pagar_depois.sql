-- 0167 — Fiado: deixar o pagamento para depois
-- D-2026-10-17-153 · CLAUDE.md §24, §25, §28, §33, §34 · RN-CAIXA-014, RN-CAIXA-018
--
-- O cliente identificado pode levar e pagar depois. O fiado NÃO é pagamento:
-- `payment_status` continua 'pending' (é a verdade — ninguém pagou), e o
-- pedido só ganha a marca de que o valor ficou em aberto DE PROPÓSITO, com
-- quem autorizou, quando e uma observação.
--
-- Por que não dá quebra de caixa: o esperado da gaveta e o dinheiro do
-- motoboy vêm dos PAGAMENTOS registrados, não do pedido. Sem pagamento, nada
-- é esperado. Quando o cliente pagar, o recebimento normal (`registrar_
-- pagamento`) entra no caixa aberto daquele dia, e a receita conta ali.
--
-- O que muda:
--   · permissão nova `orders.defer_payment` (Owner/Admin; dá para conceder a
--     outros papéis na tela de permissões);
--   · retirada em fiado pode ser concluída sem pagamento;
--   · fiado sai da fila "a receber" do dia (PDV e Pedidos) — a cobrança
--     dele acontece pela ficha do cliente / tela do pedido;
--   · fila, entregas, ficha do cliente, balcão e lista de clientes passam a
--     enxergar o valor em aberto.

-- 1. Permissão ----------------------------------------------------------------
insert into public.permissions (code, module, action, description)
values ('orders.defer_payment', 'orders', 'defer', 'Deixar o pagamento para depois (fiado)')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r, public.permissions p
 where r.name = 'Owner/Admin' and p.code = 'orders.defer_payment'
on conflict do nothing;

-- 2. Marca no pedido ------------------------------------------------------------
alter table public.orders
  add column deferred_at timestamptz,
  add column deferred_by uuid references public.app_users (id),
  add column deferred_note text;

alter table public.orders
  add constraint orders_fiado_com_cliente check (deferred_at is null or customer_id is not null),
  add constraint orders_fiado_observacao check (deferred_note is null or length(deferred_note) <= 300);

create index orders_fiado_em_aberto on public.orders (customer_id)
  where deferred_at is not null and payment_status in ('pending', 'reversed');

comment on column public.orders.deferred_at is
  'Fiado: o valor ficou para depois por decisão da loja. Não é pagamento (payment_status segue pending).';

-- 3. Valor em aberto por pedido de fiado -----------------------------------------
-- Total menos o que já foi pago (recebimento parcial continua em aberto).
create or replace function public.fiado_por_pedido()
returns table (order_id uuid, customer_id uuid, em_aberto numeric, desde timestamptz)
language sql
stable
security definer
set search_path to ''
as $function$
  select o.id, o.customer_id,
         greatest(o.total - coalesce((select sum(p.amount) from public.payments p
                                       where p.order_id = o.id and p.status = 'confirmed'), 0), 0)::numeric(12,2),
         o.deferred_at
    from public.orders o
   where o.deferred_at is not null
     and o.payment_status in ('pending', 'reversed')
     and o.status not in ('cancelled', 'rejected');
$function$;

revoke all on function public.fiado_por_pedido() from public, anon, authenticated;

-- 4. Deixar para pagar depois ---------------------------------------------------
create or replace function public.deixar_para_pagar_depois(p_order_id uuid, p_observacao text default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_ator uuid := public.current_app_user_id();
  v_obs text := nullif(btrim(coalesce(p_observacao, '')), '');
  v_pedido record;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('orders.defer_payment') then
    return jsonb_build_object('ok', false, 'erro', 'Você não tem permissão para deixar o pagamento para depois.');
  end if;
  if v_obs is not null and length(v_obs) > 300 then
    return jsonb_build_object('ok', false, 'erro', 'Observação longa demais (máximo 300 caracteres).');
  end if;

  select * into v_pedido from public.orders o where o.id = p_order_id for update;
  if v_pedido.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Pedido não encontrado.');
  end if;
  if v_pedido.customer_id is null then
    return jsonb_build_object('ok', false, 'erro',
      'Fiado só para cliente identificado (com nome e WhatsApp).');
  end if;
  if v_pedido.status in ('cancelled', 'rejected') then
    return jsonb_build_object('ok', false, 'erro', 'Pedido cancelado ou rejeitado não vai para o fiado.');
  end if;
  if v_pedido.payment_status = 'confirmed' then
    return jsonb_build_object('ok', false, 'erro', 'Este pedido já está pago.');
  end if;
  if v_pedido.deferred_at is not null then
    return jsonb_build_object('ok', false, 'ja_fiado', true, 'erro', 'Este pedido já está no fiado.');
  end if;

  update public.orders
     set deferred_at = now(), deferred_by = v_ator, deferred_note = v_obs
   where id = p_order_id;

  perform public.log_audit('pedido_fiado', 'orders', p_order_id,
    jsonb_build_object('payment_status', v_pedido.payment_status),
    jsonb_build_object('fiado', true, 'total', v_pedido.total), v_obs);

  return jsonb_build_object('ok', true);
end;
$function$;

-- 5. Desfazer (com motivo) ---------------------------------------------------------
create or replace function public.desfazer_fiado(p_order_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_ator uuid := public.current_app_user_id();
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_pedido record;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('orders.defer_payment') then
    return jsonb_build_object('ok', false, 'erro', 'Você não tem permissão para mexer no fiado.');
  end if;
  if v_motivo is null or length(v_motivo) < 3 then
    return jsonb_build_object('ok', false, 'erro', 'Informe o motivo para desfazer o fiado.');
  end if;

  select * into v_pedido from public.orders o where o.id = p_order_id for update;
  if v_pedido.id is null or v_pedido.deferred_at is null then
    return jsonb_build_object('ok', false, 'erro', 'Este pedido não está no fiado.');
  end if;
  if v_pedido.payment_status = 'confirmed' then
    return jsonb_build_object('ok', false, 'erro', 'O fiado deste pedido já foi pago.');
  end if;
  -- Retirada concluída no fiado ficaria concluída sem pagamento e sem fiado.
  if v_pedido.status = 'completed' and v_pedido.fulfillment_type = 'pickup' then
    return jsonb_build_object('ok', false, 'erro',
      'A retirada já foi concluída no fiado. Para acertar, registre o recebimento.');
  end if;

  update public.orders
     set deferred_at = null, deferred_by = null, deferred_note = null
   where id = p_order_id;

  perform public.log_audit('pedido_fiado_desfeito', 'orders', p_order_id,
    jsonb_build_object('fiado', true, 'desde', v_pedido.deferred_at, 'observacao', v_pedido.deferred_note),
    jsonb_build_object('fiado', false), v_motivo);

  return jsonb_build_object('ok', true);
end;
$function$;

-- 6. Lista de fiados em aberto (Dashboard e conferência) ---------------------------
create or replace function public.fiados_em_aberto()
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not (public.has_permission('payments.register') or public.has_permission('customers.view')) then
    return jsonb_build_object('ok', false, 'erro', 'Você não tem permissão para ver o fiado.');
  end if;
  return jsonb_build_object(
    'ok', true,
    'total', coalesce((select sum(f.em_aberto) from public.fiado_por_pedido() f), 0),
    'clientes', (select count(distinct f.customer_id) from public.fiado_por_pedido() f),
    'pedidos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'pedido_id', o.id, 'numero', o.order_number,
               'cliente_id', o.customer_id, 'cliente', o.customer_name_snapshot,
               'whatsapp', o.customer_whatsapp_snapshot,
               'total', o.total, 'em_aberto', f.em_aberto,
               'desde', f.desde,
               'dias', (public.dia_da_loja(now()) - public.dia_da_loja(f.desde)),
               'observacao', o.deferred_note)
             order by f.desde)
        from public.fiado_por_pedido() f
        join public.orders o on o.id = f.order_id), '[]'::jsonb));
end;
$function$;

revoke all on function public.deixar_para_pagar_depois(uuid, text) from public, anon;
revoke all on function public.desfazer_fiado(uuid, text) from public, anon;
revoke all on function public.fiados_em_aberto() from public, anon;
grant execute on function public.deixar_para_pagar_depois(uuid, text) to authenticated;
grant execute on function public.desfazer_fiado(uuid, text) to authenticated;
grant execute on function public.fiados_em_aberto() to authenticated;

-- 7. Patches nas funções existentes ------------------------------------------------
do $$
declare
  v_def text;
  v_novo text;
begin
  -- 7.1 concluir: retirada em fiado conclui sem pagamento.
  v_def := pg_get_functiondef('public.comando_pedido(uuid,text,jsonb)'::regprocedure);
  if v_def not like '%deferred_at is null then%' then
    v_novo := replace(v_def,
      E'    if v_pedido.fulfillment_type = ''pickup''\n       and v_pedido.payment_status is distinct from ''confirmed'' then',
      E'    if v_pedido.fulfillment_type = ''pickup''\n       and v_pedido.payment_status is distinct from ''confirmed''\n       -- Fiado (0167): a loja decidiu receber depois.\n       and v_pedido.deferred_at is null then');
    if v_novo = v_def then raise exception 'comando_pedido mudou: patch do fiado'; end if;
    execute v_novo;
  end if;

  -- 7.2 a receber: fiado sai da fila de cobrança do dia.
  v_def := pg_get_functiondef('public.pedidos_a_receber()'::regprocedure);
  if v_def not like '%deferred_at%' then
    v_novo := replace(v_def,
      E'  where o.payment_status in (''pending'', ''reversed'')\n    and o.status not in (''cancelled'', ''rejected'')',
      E'  where o.payment_status in (''pending'', ''reversed'')\n    and o.status not in (''cancelled'', ''rejected'')\n    -- Fiado (0167) é cobrado pela ficha do cliente, não na fila do dia.\n    and o.deferred_at is null');
    if v_novo = v_def then raise exception 'pedidos_a_receber mudou: patch do fiado'; end if;
    execute v_novo;
  end if;

  -- 7.3 fila e encerrados: marca de fiado.
  v_def := pg_get_functiondef('public.fila_de_pedidos(boolean)'::regprocedure);
  if v_def not like '%as fiado%' then
    v_novo := replace(v_def,
      E'      (o.delivery_approval_status = ''pending'') as aguarda_aprovacao_entrega,',
      E'      (o.delivery_approval_status = ''pending'') as aguarda_aprovacao_entrega,\n      (o.deferred_at is not null and o.payment_status <> ''confirmed'') as fiado,');
    if v_novo = v_def then raise exception 'fila_de_pedidos mudou: patch do fiado'; end if;
    execute v_novo;
  end if;

  v_def := pg_get_functiondef('public.pedidos_encerrados(integer)'::regprocedure);
  if v_def not like '%as fiado%' then
    v_novo := replace(v_def,
      E'          (o.delivery_approval_status = ''pending'') as aguarda_aprovacao_entrega,',
      E'          (o.delivery_approval_status = ''pending'') as aguarda_aprovacao_entrega,\n          (o.deferred_at is not null and o.payment_status <> ''confirmed'') as fiado,');
    if v_novo = v_def then raise exception 'pedidos_encerrados mudou: patch do fiado'; end if;
    execute v_novo;
  end if;

  -- 7.4 pedido administrativo: dados do fiado.
  v_def := pg_get_functiondef('public.pedido_administrativo(uuid)'::regprocedure);
  if v_def not like '%deferred_at%' then
    v_novo := replace(v_def,
      E'    ''acoes'', public.acoes_do_pedido(o.id)',
      E'    ''fiado'', case when o.deferred_at is null then null else jsonb_build_object(\n'
      || E'      ''em'', o.deferred_at, ''observacao'', o.deferred_note,\n'
      || E'      ''por'', (select e.full_name from public.app_users au\n'
      || E'               join public.employees e on e.id = au.employee_id where au.id = o.deferred_by)) end,\n'
      || E'    ''status_pagamento'', o.payment_status,\n'
      || E'    ''acoes'', public.acoes_do_pedido(o.id)');
    if v_novo = v_def then raise exception 'pedido_administrativo mudou: patch do fiado'; end if;
    execute v_novo;
  end if;

  -- 7.5 central de entregas: o motoboy não cobra pedido em fiado.
  v_def := pg_get_functiondef('public.central_de_entregas()'::regprocedure);
  if v_def not like '%deferred_at%' then
    v_novo := replace(v_def,
      E'               ''ja_pago'', d.payment_status = ''confirmed'',',
      E'               ''ja_pago'', d.payment_status = ''confirmed'',\n               ''fiado'', d.deferred_at is not null and d.payment_status <> ''confirmed'',');
    if v_novo = v_def then raise exception 'central_de_entregas mudou: patch do fiado'; end if;
    execute v_novo;
  end if;

  -- 7.6 lista de clientes: valor em aberto e filtro "com fiado".
  v_def := pg_get_functiondef('public.clientes_analiticos(jsonb)'::regprocedure);
  if v_def not like '%em_aberto%' then
    v_novo := replace(v_def,
      E'  v_linhas jsonb;',
      E'  -- Só quem tem fiado em aberto (0167).\n  v_fiado boolean := coalesce(nullif(p_filtros ->> ''fiado'', '''')::boolean, false);\n  v_linhas jsonb;');
    v_novo := replace(v_novo,
      E' as classificacao\n    from public.customers c\n    left join public.padrao_de_compra() p on p.customer_id = c.id\n  ),',
      E' as classificacao,\n      coalesce(fa.valor, 0)::numeric(12,2) as em_aberto\n    from public.customers c\n    left join public.padrao_de_compra() p on p.customer_id = c.id\n    left join (select f.customer_id, sum(f.em_aberto) as valor\n                 from public.fiado_por_pedido() f group by f.customer_id) fa on fa.customer_id = c.id\n  ),');
    v_novo := replace(v_novo,
      E'       and b.pedidos >= v_min_pedidos',
      E'       and b.pedidos >= v_min_pedidos\n       and (not v_fiado or b.em_aberto > 0)');
    v_novo := replace(v_novo,
      E'               ''whatsapp'', f.whatsapp,',
      E'               ''whatsapp'', f.whatsapp,\n               ''em_aberto'', f.em_aberto,');
    v_novo := replace(v_novo,
      E'      ''sem_consentimento'', (select count(*)::integer from base where not aceita_promocao))',
      E'      ''sem_consentimento'', (select count(*)::integer from base where not aceita_promocao),\n      ''com_fiado'', (select count(*)::integer from base where em_aberto > 0),\n      ''fiado_total'', (select coalesce(sum(em_aberto), 0) from base))');
    if v_novo not like '%not v_fiado or b.em_aberto > 0%'
       or v_novo not like '%''em_aberto'', f.em_aberto%'
       or v_novo not like '%fa.customer_id = c.id%'
       or v_novo not like '%''fiado_total''%' then
      raise exception 'clientes_analiticos mudou: patch do fiado';
    end if;
    execute v_novo;
  end if;

  -- 7.7 ficha do cliente: fiado em aberto, pedido a pedido.
  v_def := pg_get_functiondef('public.cliente_detalhe(uuid)'::regprocedure);
  if v_def not like '%fiado_por_pedido%' then
    v_novo := replace(v_def,
      E'    ''consentimento_historico'', coalesce((',
      E'    ''fiado'', coalesce((\n'
      || E'      select jsonb_agg(jsonb_build_object(\n'
      || E'               ''pedido_id'', o.id, ''numero'', o.order_number, ''total'', o.total,\n'
      || E'               ''em_aberto'', f.em_aberto, ''desde'', f.desde, ''observacao'', o.deferred_note)\n'
      || E'             order by f.desde)\n'
      || E'        from public.fiado_por_pedido() f\n'
      || E'        join public.orders o on o.id = f.order_id\n'
      || E'       where f.customer_id = p_cliente), ''[]''::jsonb),\n\n'
      || E'    ''consentimento_historico'', coalesce((');
    if v_novo = v_def then raise exception 'cliente_detalhe mudou: patch do fiado'; end if;
    execute v_novo;
  end if;

  -- 7.8 balcão: aviso de fiado em aberto ao reconhecer o cliente.
  v_def := pg_get_functiondef('public.cliente_para_balcao(text)'::regprocedure);
  if v_def not like '%fiado_por_pedido%' then
    v_novo := replace(v_def,
      E'    ''pagamento_habitual'', (',
      E'    ''em_aberto'', (\n'
      || E'      select jsonb_build_object(''valor'', sum(f.em_aberto), ''pedidos'', count(*), ''desde'', min(f.desde))\n'
      || E'        from public.fiado_por_pedido() f\n'
      || E'       where f.customer_id = v_cliente.id\n'
      || E'      having count(*) > 0),\n\n'
      || E'    ''pagamento_habitual'', (');
    if v_novo = v_def then raise exception 'cliente_para_balcao mudou: patch do fiado'; end if;
    execute v_novo;
  end if;
end;
$$;
