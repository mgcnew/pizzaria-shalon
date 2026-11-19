-- =============================================================================
-- TESTES DO CLIENTE VALORIZADO — D-2026-11-19-193 (migration 0185)
-- 03 §10.2, §11, §12.1 · CLAUDE.md §29, §46
-- Transação com ROLLBACK: nada fica gravado.
--
-- NO DEV, OS PEDIDOS SÃO REAIS. `order_number_seq` não volta com o rollback,
-- então o teste guarda onde a sequência estava e a devolve no fim, se nenhum
-- pedido de verdade entrou enquanto ele rodava.
-- =============================================================================
begin;

select set_config('teste.sequencia', (select last_value::text from public.order_number_seq), true);

create temporary table resultado_teste (
  n serial, cenario text, esperado text, obtido text, passou boolean
) on commit drop;
grant all on resultado_teste to authenticated, anon;
grant all on sequence resultado_teste_n_seq to authenticated, anon;

create or replace function pg_temp.checar(p_cenario text, p_esperado text, p_obtido text)
returns void language plpgsql as $$
begin
  insert into resultado_teste (cenario, esperado, obtido, passou)
  values (p_cenario, p_esperado, p_obtido, p_esperado is not distinct from p_obtido);
end;
$$;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
  ('92929292-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dona92@teste.local','x',now(),now(),now());
insert into public.employees (id, full_name, employee_type, is_driver, employment_status) values
  ('a9292929-0000-0000-0000-000000000001','Dona V9','owner',false,'active');
insert into public.app_users (id, auth_user_id, employee_id, is_active) values
  ('b9292929-0000-0000-0000-000000000001','92929292-1111-1111-1111-111111111111','a9292929-0000-0000-0000-000000000001',true);
insert into public.user_roles (app_user_id, role_id)
select 'b9292929-0000-0000-0000-000000000001', id from public.roles where name = 'Owner/Admin';

update public.store_settings set delivery_minimum_enabled = false;
delete from public.store_hours;
insert into public.store_hours (weekday, is_closed, opens_at, closes_at, sort_order)
select g, false, '00:00', '23:59', g from generate_series(0,6) g;

insert into public.pizza_sizes (id, name, slice_count, max_flavors, sort_order)
values ('d9292929-0000-0000-0000-000000000001','Grande V9', 8, 2, 892);
insert into public.categories (id, name, slug, sort_order)
values ('c9292929-0000-0000-0000-000000000001','Pizzas V9','pizzas-v9', 892);
insert into public.products (id, category_id, product_type, name, slug, sort_order, is_active)
values ('b9292929-1000-0000-0000-000000000001','c9292929-0000-0000-0000-000000000001','pizza','Calabresa V9','calabresa-v9', 1, true);
insert into public.product_variants (id, product_id, size_id, price, is_active, is_temporarily_available)
values ('a9292929-1000-0000-0000-000000000001','b9292929-1000-0000-0000-000000000001','d9292929-0000-0000-0000-000000000001', 50.00, true, true);

select set_config('teste.dinheiro', (select id::text from public.payment_methods where code='dinheiro'), true);
select set_config('teste.token', repeat('ab', 32), true);

-- Atalho do teste: quem roda o cenário não tem (nem deve ter) escrita direta.
create or replace function pg_temp.forcar_status(p_id uuid, p_status text)
returns void language sql security definer as $$
  update public.orders set status = p_status where id = p_id;
$$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"92929292-1111-1111-1111-111111111111","role":"authenticated"}';

-- Pedido feito "deste navegador": a credencial vai junto, como no checkout.
create or replace function pg_temp.pedido()
returns uuid language plpgsql as $$
declare v_idem text := gen_random_uuid()::text; v_r jsonb;
begin
  v_r := public.criar_pedido(jsonb_build_object(
    'idempotency_key', v_idem,
    'tracking_token', md5(v_idem) || md5(v_idem || ':2'),
    'origem', 'counter', 'modalidade', 'pickup',
    'dispositivo_token', current_setting('teste.token', true),
    'cliente', jsonb_build_object('nome', 'Marina Teste V9', 'whatsapp', '11960000001'),
    'itens', jsonb_build_array(jsonb_build_object(
      'produto_id','b9292929-1000-0000-0000-000000000001',
      'variacao_id','a9292929-1000-0000-0000-000000000001','quantidade', 2)),
    'pagamento', jsonb_build_object('forma_id', current_setting('teste.dinheiro', true))), '');
  if not coalesce((v_r ->> 'ok')::boolean, false) then raise exception 'fixture: %', v_r; end if;
  return (v_r ->> 'pedido_id')::uuid;
end;
$$;

do $$
declare v_id uuid; v_r jsonb; i int;
begin
  for i in 1..3 loop
    v_id := pg_temp.pedido();
    perform pg_temp.forcar_status(v_id, 'completed');
  end loop;
  v_id := pg_temp.pedido();
  perform pg_temp.forcar_status(v_id, 'cancelled');

  v_r := public.cliente_valorizado(current_setting('teste.token', true));
  perform pg_temp.checar('reconhece o aparelho', 'true', v_r ->> 'encontrado');
  perform pg_temp.checar('só o primeiro nome', 'Marina', v_r ->> 'nome');
  perform pg_temp.checar('cancelado não conta', '3', v_r ->> 'pedidos');
  perform pg_temp.checar('sabor favorito com 3 pedidos', 'Calabresa V9', v_r -> 'sabor_favorito' ->> 'nome');
  perform pg_temp.checar('último pedido com 1 item', '1',
    jsonb_array_length(v_r -> 'ultimo_pedido' -> 'itens')::text);
  perform pg_temp.checar('configuração remontável', '2',
    v_r -> 'ultimo_pedido' -> 'itens' -> 0 -> 'configuracao' ->> 'quantidade');
  perform pg_temp.checar('configuração com a variação', 'a9292929-1000-0000-0000-000000000001',
    v_r -> 'ultimo_pedido' -> 'itens' -> 0 -> 'configuracao' ->> 'variacao_id');
  perform pg_temp.checar('não devolve valores', 'false',
    (v_r::text like '%100.00%' or v_r::text like '%total%')::text);
  perform pg_temp.checar('token inválido não acha', 'false', public.cliente_valorizado('xyz') ->> 'encontrado');
  perform pg_temp.checar('outro aparelho não acha', 'false',
    public.cliente_valorizado(repeat('cd', 32)) ->> 'encontrado');
end;
$$;

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$
begin
  perform pg_temp.checar('visitante sem login consegue usar', 'true',
    public.cliente_valorizado(current_setting('teste.token', true)) ->> 'encontrado');
end;
$$;

reset role;
do $$
declare v_inicio bigint := current_setting('teste.sequencia')::bigint;
begin
  if not exists (select 1 from public.orders o
                  where o.order_number > v_inicio
                    and o.customer_name_snapshot not like '%V9%') then
    perform setval('public.order_number_seq', v_inicio, true);
  end if;
end;
$$;

select n, cenario, esperado, obtido, passou from resultado_teste order by n;
select case when count(*) filter (where not passou) = 0 then 'TUDO PASSOU' else 'FALHOU' end as resumo from resultado_teste;

rollback;
