-- =============================================================================
-- TESTES DO EDITAR PEDIDO — D-2026-11-01-182 (migration 0182)
-- RN-ALT-009, RN-CAIXA-020 · CLAUDE.md §16, §22, §24, §28, §34
-- Transação com ROLLBACK. Medido por variação: o DEV pode ter caixa aberto de verdade.
-- =============================================================================
begin;

create temporary table resultado_teste (
  n serial, cenario text, esperado text, obtido text, passou boolean
) on commit drop;
grant all on resultado_teste to authenticated;
grant all on sequence resultado_teste_n_seq to authenticated;

create or replace function pg_temp.checar(p_cenario text, p_esperado text, p_obtido text)
returns void language plpgsql as $$
begin
  insert into resultado_teste (cenario, esperado, obtido, passou)
  values (p_cenario, p_esperado, p_obtido, p_esperado is not distinct from p_obtido);
end;
$$;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
  ('88888888-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dona8@teste.local','x',now(),now(),now()),
  ('88888888-3333-3333-3333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','observador8@teste.local','x',now(),now(),now());
insert into public.employees (id, full_name, employee_type, is_driver, employment_status) values
  ('a8a8a8a8-0000-0000-0000-000000000001','Dona F7','owner',false,'active'),
  ('a8a8a8a8-0000-0000-0000-000000000003','Observador F7','counter',false,'active');
insert into public.app_users (id, auth_user_id, employee_id, is_active) values
  ('b8b8b8b8-0000-0000-0000-000000000001','88888888-1111-1111-1111-111111111111','a8a8a8a8-0000-0000-0000-000000000001',true),
  ('b8b8b8b8-0000-0000-0000-000000000003','88888888-3333-3333-3333-333333333333','a8a8a8a8-0000-0000-0000-000000000003',true);
insert into public.user_roles (app_user_id, role_id)
select 'b8b8b8b8-0000-0000-0000-000000000001', id from public.roles where name = 'Owner/Admin';
insert into public.roles (id, name, description, is_system, is_active)
values ('c8c8c8c8-0000-0000-0000-00000000000f','Observador F7','So visualiza', false, true);
insert into public.role_permissions (role_id, permission_id)
select 'c8c8c8c8-0000-0000-0000-00000000000f', id from public.permissions where code = 'orders.view';
insert into public.user_roles (app_user_id, role_id)
values ('b8b8b8b8-0000-0000-0000-000000000003','c8c8c8c8-0000-0000-0000-00000000000f');

update public.store_settings set automatic_delivery_radius_km = 4, delivery_minimum_enabled = false;
delete from public.store_hours;
insert into public.store_hours (weekday, is_closed, opens_at, closes_at, sort_order)
select g, false, '00:00', '23:59', g from generate_series(0,6) g;
update public.delivery_fee_bands set is_active = false;
insert into public.delivery_fee_bands (min_distance_km, max_distance_km, fee, is_active, sort_order)
values (0, 4, 5.00, true, 901), (4, 10, 9.00, true, 902);

insert into public.pizza_sizes (id, name, slice_count, max_flavors, sort_order)
values ('d8d8d8d8-0000-0000-0000-000000000001','Grande F7', 8, 2, 801);
insert into public.categories (id, name, slug, sort_order)
values ('c8c8c8c8-0000-0000-0000-000000000001','Pizzas F7','pizzas-f7', 801);
insert into public.products (id, category_id, product_type, name, slug, sort_order, is_active)
values ('b8b8b8b8-1000-0000-0000-000000000001','c8c8c8c8-0000-0000-0000-000000000001','pizza','Calabresa F7','calabresa-f7', 1, true);
insert into public.product_variants (id, product_id, size_id, price, is_active, is_temporarily_available)
values ('a8a8a8a8-1000-0000-0000-000000000001','b8b8b8b8-1000-0000-0000-000000000001','d8d8d8d8-0000-0000-0000-000000000001', 50.00, true, true);

select set_config('teste.dinheiro', (select id::text from public.payment_methods where code='dinheiro'), true);
select set_config('teste.debito',   (select id::text from public.payment_methods where code='debito'), true);

-- Atalhos do teste: quem roda o cenário não tem (nem deve ter) escrita direta.
create or replace function pg_temp.forcar_status(p_id uuid, p_status text)
returns void language sql security definer as $$
  update public.orders set status = p_status where id = p_id;
$$;
create or replace function pg_temp.forcar_preco(p_preco numeric)
returns void language sql security definer as $$
  update public.product_variants set price = p_preco where id = 'a8a8a8a8-1000-0000-0000-000000000001';
$$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"88888888-1111-1111-1111-111111111111","role":"authenticated"}';
select public.abrir_caixa('{"fundo":0}'::jsonb);

create or replace function pg_temp.pedido(p_qtd integer default 2)
returns uuid language plpgsql as $$
declare v_idem text := gen_random_uuid()::text; v_r jsonb;
begin
  v_r := public.criar_pedido(jsonb_build_object(
    'idempotency_key', v_idem,
    'tracking_token', md5(v_idem) || md5(v_idem || ':2'),
    'origem', 'counter', 'modalidade', 'pickup',
    'cliente', jsonb_build_object('nome', 'Cliente F7', 'whatsapp', '11980000001'),
    'itens', jsonb_build_array(jsonb_build_object(
      'produto_id','b8b8b8b8-1000-0000-0000-000000000001',
      'variacao_id','a8a8a8a8-1000-0000-0000-000000000001','quantidade', p_qtd)),
    'pagamento', jsonb_build_object('forma_id', current_setting('teste.dinheiro', true))), '');
  return (v_r ->> 'pedido_id')::uuid;
end;
$$;

-- Edita o pedido partindo de "mantém tudo", na versão atual.
create or replace function pg_temp.editar(p_id uuid, p_extra jsonb)
returns jsonb language plpgsql as $$
declare v_base jsonb;
begin
  select jsonb_build_object('versao', o.updated_at, 'motivo_tipo', 'customer', 'canal', 'phone',
           'motivo', 'Cliente ligou',
           'itens', (select jsonb_agg(jsonb_build_object('linha', i.line_number, 'quantidade', i.quantity))
                       from public.order_items i where i.order_id = o.id))
    into v_base from public.orders o where o.id = p_id;
  return public.editar_pedido(p_id, v_base || p_extra);
end;
$$;

create or replace function pg_temp.pagar(p_id uuid, p_valor numeric)
returns void language plpgsql as $$
begin
  perform public.registrar_pagamento(p_id, jsonb_build_object(
    'idempotency_key', gen_random_uuid()::text,
    'linhas', jsonb_build_array(jsonb_build_object(
      'forma_id', current_setting('teste.dinheiro', true), 'valor', p_valor))));
end;
$$;

create or replace function pg_temp.endereco(p_km numeric)
returns jsonb language sql as $$
  select jsonb_build_object('modalidade','delivery',
    'endereco', jsonb_build_object('logradouro','Rua F','numero','7','bairro','Centro',
      'cidade','Cidade','uf','XX','latitude',-23.51,'longitude',-46.61,'confianca','exata'),
    'rota', jsonb_build_object('distancia_km', p_km, 'provedor','teste'));
$$;

do $$
declare
  v_id uuid; v_r jsonb; v_o record; v_sessao uuid; v_antes numeric; v_pag uuid;
begin
  select id into v_sessao from public.cash_sessions where status = 'open' order by opened_at desc limit 1;

  -- JUSTIFICATIVA ------------------------------------------------------------
  v_id := pg_temp.pedido();
  v_r := pg_temp.editar(v_id, '{"motivo":""}');
  perform pg_temp.checar('sem motivo recusa', 'false', v_r ->> 'ok');
  v_r := pg_temp.editar(v_id, '{"motivo_tipo":null}');
  perform pg_temp.checar('sem tipo recusa', 'false', v_r ->> 'ok');
  v_r := pg_temp.editar(v_id, '{"canal":null}');
  perform pg_temp.checar('cliente pediu sem canal recusa', 'false', v_r ->> 'ok');
  v_r := pg_temp.editar(v_id, '{"versao":"2020-01-01T00:00:00Z"}');
  perform pg_temp.checar('versão velha recusa', 'true', v_r ->> 'versao_obsoleta');
  v_r := pg_temp.editar(v_id, '{}');
  perform pg_temp.checar('nada mudou recusa', 'Nenhuma mudança para salvar.', v_r ->> 'erro');

  -- PREÇO: o que fica mantém; o novo paga o atual ---------------------------------
  perform pg_temp.forcar_preco(60);
  v_r := pg_temp.editar(v_id, jsonb_build_object('itens', jsonb_build_array(
    jsonb_build_object('linha', 1, 'quantidade', 1),
    jsonb_build_object('produto_id','b8b8b8b8-1000-0000-0000-000000000001',
      'variacao_id','a8a8a8a8-1000-0000-0000-000000000001','quantidade',1))));
  select * into v_o from public.orders where id = v_id;
  perform pg_temp.checar('mantém 50 e novo a 60', '110.00', v_o.total::text);
  perform pg_temp.checar('revisão aplicada com motivo', 'applied|Cliente ligou|edit',
    (select status || '|' || reason || '|' || kind from public.order_revisions where order_id = v_id));
  perform pg_temp.checar('auditada', '1',
    (select count(*)::text from public.audit_logs where entity_id = v_id and action = 'pedido_editar'));
  perform pg_temp.forcar_preco(50);

  -- TELEFONE não gera papel ---------------------------------------------------------
  v_r := pg_temp.editar(v_id, '{"whatsapp":"11980000002"}');
  perform pg_temp.checar('só telefone não afeta comanda', 'false', v_r ->> 'afeta_comanda');

  -- MODALIDADE -----------------------------------------------------------------------
  v_id := pg_temp.pedido(1);
  perform pg_temp.forcar_status(v_id, 'ready_for_pickup');
  v_r := pg_temp.editar(v_id, pg_temp.endereco(2));
  select * into v_o from public.orders where id = v_id;
  perform pg_temp.checar('retirada vira entrega', 'delivery|ready_for_delivery|5.00|55.00',
    concat_ws('|', v_o.fulfillment_type, v_o.status, v_o.delivery_fee, v_o.total));
  v_r := pg_temp.editar(v_id, '{"modalidade":"pickup"}');
  select * into v_o from public.orders where id = v_id;
  perform pg_temp.checar('entrega vira retirada', 'pickup|ready_for_pickup|0.00|50.00|t',
    concat_ws('|', v_o.fulfillment_type, v_o.status, v_o.delivery_fee, v_o.total,
              case when v_o.delivery_address_snapshot is null then 't' else 'f' end));
  v_r := pg_temp.editar(v_id, pg_temp.endereco(50));
  perform pg_temp.checar('fora de área bloqueia', 'true', v_r ->> 'fora_de_area');
  v_r := pg_temp.editar(v_id, pg_temp.endereco(6));
  select * into v_o from public.orders where id = v_id;
  perform pg_temp.checar('acima do raio: quem edita aprova', 'approved|9.00',
    concat_ws('|', v_o.delivery_approval_status, v_o.delivery_fee));
  v_r := pg_temp.editar(v_id, (pg_temp.endereco(2) - 'rota'));
  perform pg_temp.checar('sem rota não vira taxa zero', 'false', v_r ->> 'ok');

  -- ESTADO ------------------------------------------------------------------------------
  perform pg_temp.forcar_status(v_id, 'out_for_delivery');
  v_r := pg_temp.editar(v_id, '{"whatsapp":"11980000003"}');
  perform pg_temp.checar('na rua não edita', 'false', v_r ->> 'ok');
  perform pg_temp.forcar_status(v_id, 'ready_for_delivery');

  -- JÁ PAGO: total sobe ---------------------------------------------------------------------
  v_id := pg_temp.pedido(1);
  perform pg_temp.pagar(v_id, 50);
  v_r := pg_temp.editar(v_id, '{"itens":[{"linha":1,"quantidade":2}]}');
  perform pg_temp.checar('total sobe: falta receber', '50.00', v_r ->> 'a_receber');
  perform pg_temp.checar('volta a pendente', 'pending',
    (select payment_status from public.orders where id = v_id));

  -- JÁ PAGO: total baixa ----------------------------------------------------------------------
  v_id := pg_temp.pedido(2);
  perform pg_temp.pagar(v_id, 100);
  v_r := pg_temp.editar(v_id, '{"itens":[{"linha":1,"quantidade":1}]}');
  perform pg_temp.checar('total baixa: pede devolução', '50.00', v_r ->> 'valor');
  perform pg_temp.checar('sem devolução nada mudou', '100.00',
    (select total::text from public.orders where id = v_id));

  v_antes := public.esperado_em_caixa(v_sessao);
  select id into v_pag from public.payments where order_id = v_id and status = 'confirmed';
  v_r := pg_temp.editar(v_id, jsonb_build_object('itens', '[{"linha":1,"quantidade":1}]'::jsonb, 'devolver_de', v_pag));
  perform pg_temp.checar('devolução salva', 'true|50.00', concat_ws('|', v_r ->> 'ok', v_r ->> 'devolvido'));
  perform pg_temp.checar('gaveta perde só a devolução', '-50.00',
    (public.esperado_em_caixa(v_sessao) - v_antes)::text);
  perform pg_temp.checar('recebido fecha com o total', '50.00|confirmed',
    (select sum(p.amount)::text || '|' || max(o.payment_status)
       from public.payments p join public.orders o on o.id = p.order_id
      where p.order_id = v_id and p.status = 'confirmed'));
  perform pg_temp.checar('linha antiga preservada como estorno', '100.00',
    (select amount::text from public.payments where id = v_pag and status = 'reversed'));
  v_antes := public.esperado_em_caixa(v_sessao);
  perform public.reverter_pagamento(v_id, 'Estorno teste');
  perform pg_temp.checar('estorno depois tira só o que ficou', '-50.00',
    (public.esperado_em_caixa(v_sessao) - v_antes)::text);
end;
$$;

set local request.jwt.claims = '{"sub":"88888888-3333-3333-3333-333333333333","role":"authenticated"}';
do $$
declare v_id uuid;
begin
  select id into v_id from public.orders where customer_name_snapshot = 'Cliente F7' limit 1;
  perform pg_temp.checar('sem permissão recusa', 'false',
    public.editar_pedido(v_id, '{"motivo_tipo":"mistake","motivo":"abc"}') ->> 'ok');
end;
$$;

select n, cenario, esperado, obtido, passou from resultado_teste order by n;
select case when count(*) filter (where not passou) = 0 then 'TUDO PASSOU' else 'FALHOU' end as resumo from resultado_teste;

rollback;
