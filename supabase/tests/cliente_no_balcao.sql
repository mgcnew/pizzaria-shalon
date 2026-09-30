-- =============================================================================
-- O BALCÃO RECONHECE O CLIENTE PELO WHATSAPP
--
-- 04 RN-MAN-007 · 03 §12.2 · D-2026-09-30-104
-- Migration: 20260930160000_cliente_no_balcao.sql
--
-- O que esta suíte prova:
--   B1–B3  só a equipe com orders.create_manual + customers.view consulta;
--          o visitante nem executa;
--   B4–B5  número desconhecido ou incompleto não acha ninguém (não é busca);
--   B6–B8  resumo do cliente, endereços sem repetição, preferencial primeiro;
--   B9–B10 último pedido não cancelado, com a configuração de cada item;
--   B11–B12 mais pedidos por produto + tamanho, só ativos, prontos para montar;
--   B13    pagamento habitual;
--   B14    bloqueado vem marcado, com o motivo interno.
--
-- Fixtures próprias (sufixo F92). Transação com ROLLBACK: nada persiste.
-- =============================================================================

begin;

create temporary table resultado_teste (
  n serial, cenario text, esperado text, obtido text, passou boolean
) on commit drop;
grant all on resultado_teste to anon, authenticated;
grant all on sequence resultado_teste_n_seq to anon, authenticated;

create or replace function pg_temp.checar(p_cenario text, p_esperado text, p_obtido text)
returns void language plpgsql as $$
begin
  insert into resultado_teste (cenario, esperado, obtido, passou)
  values (p_cenario, p_esperado, p_obtido, p_esperado is not distinct from p_obtido);
end;
$$;

-- -----------------------------------------------------------------------------
-- FIXTURES
-- -----------------------------------------------------------------------------
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('92929292-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','balcao92@teste.local','x',now(),now(),now()),
  ('92929292-3333-3333-3333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','semcliente92@teste.local','x',now(),now(),now());
insert into public.employees (id, full_name, employee_type, is_driver, employment_status) values
  ('a9292929-0000-0000-0000-000000000001','Balcão F92','counter',false,'active'),
  ('a9292929-0000-0000-0000-000000000003','Sem cliente F92','counter',false,'active');
insert into public.app_users (id, auth_user_id, employee_id, is_active) values
  ('b9292929-0000-0000-0000-000000000001','92929292-1111-1111-1111-111111111111','a9292929-0000-0000-0000-000000000001',true),
  ('b9292929-0000-0000-0000-000000000003','92929292-3333-3333-3333-333333333333','a9292929-0000-0000-0000-000000000003',true);
insert into public.user_roles (app_user_id, role_id)
select 'b9292929-0000-0000-0000-000000000001', id from public.roles where name = 'Atendente';
-- Lança pedido, mas não vê clientes.
insert into public.roles (id, name, is_system, is_active)
values ('c9292929-0000-0000-0000-000000000001','Só lança F92', false, true);
insert into public.role_permissions (role_id, permission_id)
select 'c9292929-0000-0000-0000-000000000001', id from public.permissions where code = 'orders.create_manual';
insert into public.user_roles (app_user_id, role_id)
values ('b9292929-0000-0000-0000-000000000003','c9292929-0000-0000-0000-000000000001');

insert into public.pizza_sizes (id, name, slice_count, max_flavors, sort_order) values
  ('d9292929-0000-0000-0000-000000000001','Tradicional F92', 8, 2, 901);
insert into public.categories (id, name, slug, sort_order) values
  ('c2929292-0000-0000-0000-000000000001','Pizzas F92','pizzas-f92', 901);
insert into public.products (id, category_id, product_type, name, slug, base_price, sort_order, is_active) values
  ('e9292929-0000-0000-0000-000000000001','c2929292-0000-0000-0000-000000000001','pizza','Calabresa F92','calabresa-f92', null, 1, true),
  ('e9292929-0000-0000-0000-000000000002','c2929292-0000-0000-0000-000000000001','drink','Guaraná F92','guarana-f92', 8, 2, true),
  ('e9292929-0000-0000-0000-000000000003','c2929292-0000-0000-0000-000000000001','drink','Saiu F92','saiu-f92', 8, 3, false);
insert into public.product_variants (id, product_id, size_id, price) values
  ('f9292929-0000-0000-0000-000000000011','e9292929-0000-0000-0000-000000000001','d9292929-0000-0000-0000-000000000001', 50.00);

insert into public.customers (id, name, whatsapp_normalized, created_at) values
  ('09292929-0000-0000-0000-00000000000c','Cliente F92','11990000092', now() - interval '1 year');
insert into public.customers (id, name, whatsapp_normalized, is_blocked, blocked_reason_internal, blocked_at) values
  ('09292929-0000-0000-0000-00000000000b','Bloqueado F92','11990000093', true, 'Trote F92', now());

-- Dois registros do mesmo endereço (mesma chave, que é gerada) e um
-- preferencial diferente.
insert into public.customer_addresses (id, customer_id, is_preferred, street, number, neighborhood, city, state, created_at) values
  ('19292929-0000-0000-0000-000000000001','09292929-0000-0000-0000-00000000000c', false, 'Rua A', '1', 'Centro', 'Cidade', 'SP', now() - interval '10 days'),
  ('19292929-0000-0000-0000-000000000002','09292929-0000-0000-0000-00000000000c', false, 'Rua A', '1', 'Centro', 'Cidade', 'SP', now() - interval '2 days'),
  ('19292929-0000-0000-0000-000000000003','09292929-0000-0000-0000-00000000000c', true,  'Rua B', '2', 'Centro', 'Cidade', 'SP', now() - interval '30 days');
insert into public.customer_addresses (id, customer_id, street, number, neighborhood, city, state, is_active) values
  ('19292929-0000-0000-0000-000000000004','09292929-0000-0000-0000-00000000000c', 'Rua C', '3', 'Centro', 'Cidade', 'SP', false);

-- Três concluídos (Calabresa em todos, Guaraná em um, o inativo em dois) e um
-- cancelado mais recente, que não conta como último pedido.
insert into public.orders (id, customer_id, tracking_token_hash, fulfillment_type, status,
  customer_name_snapshot, customer_whatsapp_snapshot, subtotal, total, created_at) values
  ('29292929-0000-0000-0000-000000000001','09292929-0000-0000-0000-00000000000c','f92-1','pickup','completed','Cliente F92','11990000092', 50, 50, now() - interval '9 days'),
  ('29292929-0000-0000-0000-000000000002','09292929-0000-0000-0000-00000000000c','f92-2','pickup','completed','Cliente F92','11990000092', 66, 66, now() - interval '5 days'),
  ('29292929-0000-0000-0000-000000000003','09292929-0000-0000-0000-00000000000c','f92-3','pickup','completed','Cliente F92','11990000092', 58, 58, now() - interval '3 days'),
  ('29292929-0000-0000-0000-000000000004','09292929-0000-0000-0000-00000000000c','f92-4','pickup','cancelled','Cliente F92','11990000092', 8, 8, now() - interval '1 day');
insert into public.order_items (id, order_id, line_number, item_type, product_id, product_name_snapshot,
  quantity, unit_price, line_total, size_id, size_name_snapshot) values
  ('39292929-0000-0000-0000-000000000001','29292929-0000-0000-0000-000000000001',1,'pizza','e9292929-0000-0000-0000-000000000001','Calabresa F92',1,50,50,'d9292929-0000-0000-0000-000000000001','Tradicional F92'),
  ('39292929-0000-0000-0000-000000000002','29292929-0000-0000-0000-000000000002',1,'pizza','e9292929-0000-0000-0000-000000000001','Calabresa F92',1,50,50,'d9292929-0000-0000-0000-000000000001','Tradicional F92'),
  ('39292929-0000-0000-0000-000000000003','29292929-0000-0000-0000-000000000002',2,'product','e9292929-0000-0000-0000-000000000003','Saiu F92',2,8,16,null,null),
  ('39292929-0000-0000-0000-000000000004','29292929-0000-0000-0000-000000000003',1,'pizza','e9292929-0000-0000-0000-000000000001','Calabresa F92',1,50,50,'d9292929-0000-0000-0000-000000000001','Tradicional F92'),
  ('39292929-0000-0000-0000-000000000005','29292929-0000-0000-0000-000000000003',2,'product','e9292929-0000-0000-0000-000000000002','Guaraná F92',1,8,8,null,null),
  ('39292929-0000-0000-0000-000000000006','29292929-0000-0000-0000-000000000004',1,'product','e9292929-0000-0000-0000-000000000003','Saiu F92',1,8,8,null,null);
insert into public.order_item_flavors (order_item_id, flavor_product_id, flavor_name_snapshot, variant_id, effective_price_snapshot, portion) values
  ('39292929-0000-0000-0000-000000000004','e9292929-0000-0000-0000-000000000001','Calabresa F92','f9292929-0000-0000-0000-000000000011', 50, 1);
update public.order_items set observation = 'Bem assada'
 where id = '39292929-0000-0000-0000-000000000004';

-- Pagou duas vezes com a mesma forma (com troco) e uma com outra.
insert into public.order_payment_intents (order_id, payment_method_id, payment_method_name_snapshot,
  payment_method_family_snapshot, amount_expected, needs_change, change_for_amount, expected_change_amount)
select o.id, pm.id, pm.name, pm.payment_family, o.total, o.id <> '29292929-0000-0000-0000-000000000003',
       case when o.id <> '29292929-0000-0000-0000-000000000003' then 100 end,
       case when o.id <> '29292929-0000-0000-0000-000000000003' then 100 - o.total end
  from public.orders o,
       (select * from public.payment_methods order by sort_order, code limit 1) pm
 where o.id in ('29292929-0000-0000-0000-000000000002','29292929-0000-0000-0000-000000000003');
insert into public.order_payment_intents (order_id, payment_method_id, payment_method_name_snapshot,
  payment_method_family_snapshot, amount_expected)
select '29292929-0000-0000-0000-000000000001', pm.id, pm.name, pm.payment_family, 50
  from (select * from public.payment_methods order by sort_order, code offset 1 limit 1) pm;

-- -----------------------------------------------------------------------------
-- B. CONSULTA
-- -----------------------------------------------------------------------------
select pg_temp.checar('B1 anon não executa a consulta', 'false',
  has_function_privilege('anon', 'public.cliente_para_balcao(text)', 'execute')::text);

set local role authenticated;
set local request.jwt.claims = '{"sub":"92929292-3333-3333-3333-333333333333","role":"authenticated"}';
select pg_temp.checar('B2 quem lança mas não vê clientes é recusado', 'false|Você não tem permissão para consultar clientes.',
  (select concat_ws('|', r ->> 'ok', r ->> 'erro') from (select public.cliente_para_balcao('11990000092') r) t));
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"92929292-1111-1111-1111-111111111111","role":"authenticated"}';
create temporary table r92 on commit drop as
  select public.cliente_para_balcao('(11) 99000-0092') as r;
select pg_temp.checar('B3 o Atendente consulta (com máscara no número)', 'true|true',
  (select concat_ws('|', r ->> 'ok', r ->> 'encontrado') from r92));
select pg_temp.checar('B4 número desconhecido não acha ninguém', 'false',
  (public.cliente_para_balcao('11990000000') ->> 'encontrado'));
select pg_temp.checar('B5 pedaço do número não é busca', 'false',
  (public.cliente_para_balcao('0000092') ->> 'encontrado'));
select pg_temp.checar('B6 resumo: nome, concluídos, ticket médio, não bloqueado', 'Cliente F92|3|58.00|false',
  (select concat_ws('|', r #>> '{cliente,nome}', r #>> '{cliente,pedidos}',
                    r #>> '{cliente,ticket_medio}', r #>> '{cliente,bloqueado}') from r92));
select pg_temp.checar('B7 endereços: preferencial primeiro, sem repetir, sem inativo', 'Rua B|Rua A',
  (select string_agg(e ->> 'logradouro', '|' order by n)
     from r92, jsonb_array_elements(r -> 'enderecos') with ordinality as x(e, n)));
select pg_temp.checar('B8 do endereço repetido vem o registro mais recente', '19292929-0000-0000-0000-000000000002',
  (select r #>> '{enderecos,1,id}' from r92));
select pg_temp.checar('B9 último pedido ignora o cancelado', 'pickup|Calabresa F92,Guaraná F92',
  (select (r #>> '{ultimo_pedido,modalidade}') || '|' ||
          (select string_agg(i ->> 'nome', ',') from jsonb_array_elements(r #> '{ultimo_pedido,itens}') i)
     from r92));
select pg_temp.checar('B10 ...com a configuração para repetir', 'f9292929-0000-0000-0000-000000000011|Bem assada|1',
  (select concat_ws('|', r #>> '{ultimo_pedido,itens,0,configuracao,variacao_id}',
                    r #>> '{ultimo_pedido,itens,0,configuracao,observacao}',
                    r #>> '{ultimo_pedido,itens,0,configuracao,quantidade}') from r92));
select pg_temp.checar('B11 mais pedidos: produto + tamanho, inativo fora', 'Calabresa F92 · Tradicional F92=3,Guaraná F92=1',
  (select string_agg((m ->> 'nome') || '=' || (m ->> 'vezes'), ',' order by n)
     from r92, jsonb_array_elements(r -> 'mais_pedidos') with ordinality as x(m, n)));
select pg_temp.checar('B12 ...pronto para montar no motor', '50.00',
  (select public.montar_item(r #> '{mais_pedidos,0,configuracao}') ->> 'preco_unitario' from r92));
select pg_temp.checar('B13 pagamento habitual: a forma mais usada, com troco', 'true|true',
  (select concat_ws('|',
     ((r #>> '{pagamento_habitual,forma_id}') = (select id::text from public.payment_methods order by sort_order, code limit 1))::text,
     r #>> '{pagamento_habitual,pede_troco}') from r92));
select pg_temp.checar('B14 bloqueado vem marcado, com o motivo interno', 'true|Trote F92|0',
  (select concat_ws('|', r #>> '{cliente,bloqueado}', r #>> '{cliente,motivo_bloqueio}',
                    jsonb_array_length(r -> 'enderecos'))
     from (select public.cliente_para_balcao('11990000093') r) t));
reset role;

-- -----------------------------------------------------------------------------
-- RESULTADO
-- -----------------------------------------------------------------------------
select n, cenario, esperado, obtido, passou from resultado_teste order by n;
select count(*) filter (where passou) as aprovados,
       count(*) filter (where not passou) as reprovados
from resultado_teste;

rollback;
