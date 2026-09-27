-- =============================================================================
-- EXIGE PRODUÇÃO — a regra que decide se o pedido passa pela cozinha
--
-- 04-REGRAS-NEGOCIO.md RN-EST-* · CLAUDE.md §16, §21 · D-2026-09-27
--
-- A INVARIANTE DESTA MUDANÇA:
--
--   O pedido exige produção A MENOS QUE se consiga PROVAR que nenhum item
--   exige. Errar mandando à cozinha custa uma conferência; errar para o outro
--   lado é pizza que nunca é assada.
--
-- Por isso a suíte tem quatro blocos, e o B é o que importa:
--
--   A — os casos felizes: quem dispensa preparo, dispensa.
--   B — os casos OBSCUROS: item sem produto, produto apagado, meio a meio,
--       componente de combo. Todos devem cair para "exige". Se estes caírem,
--       a mudança está errada.
--   C — as AÇÕES que a autoridade oferece, que é onde a regra vira efeito.
--   D — o que NÃO pode ter mudado: dinheiro, permissões, fluxo normal.
--
-- NENHUM DADO REAL É APAGADO. Transação com ROLLBACK.
-- =============================================================================

begin;

create temporary table resultado_teste (
  n serial, cenario text, esperado text, obtido text, passou boolean
) on commit drop;

create or replace function pg_temp.checar(p_cenario text, p_esperado text, p_obtido text)
returns void language plpgsql as $h$
begin insert into resultado_teste (cenario, esperado, obtido, passou)
  values (p_cenario, p_esperado, p_obtido, p_esperado is not distinct from p_obtido); end; $h$;

/** Monta um pedido de ensaio e devolve o id. */
create or replace function pg_temp.pedido(p_tag text) returns uuid language plpgsql as $h$
declare v_id uuid;
begin
  insert into public.orders (tracking_token_hash, fulfillment_type, status,
    customer_name_snapshot, customer_whatsapp_snapshot, subtotal, total, source)
  values (p_tag, 'pickup', 'confirmed', 'Ensaio', '11999999999', 10, 10, 'counter')
  returning id into v_id;
  return v_id;
end; $h$;

/** Acrescenta um item ao pedido e devolve o id do item. */
create or replace function pg_temp.item(p_pedido uuid, p_linha int, p_tipo text,
  p_produto uuid, p_nome text) returns uuid language plpgsql as $h$
declare v_id uuid;
begin
  insert into public.order_items (order_id, line_number, item_type, product_id,
    product_name_snapshot, quantity, unit_price, line_total)
  values (p_pedido, p_linha, p_tipo, p_produto, p_nome, 1, 10, 10)
  returning id into v_id;
  return v_id;
end; $h$;

-- --------------------------------------------------------------- massa
-- Produtos de ensaio. `E ` no nome para nunca se confundir com o catálogo real.
insert into public.products (category_id, product_type, name, slug, base_price, requires_production)
select (select id from public.categories order by sort_order limit 1), v.t, v.n, v.s, v.p, v.r
from (values
  ('drink','E Coca','e-coca',8.0,false),
  ('drink','E Agua','e-agua',4.0,false),
  ('other','E Bolo pronto','e-bolo',20.0,false),
  ('pizza','E Pizza','e-pizza',50.0,true),
  ('pizza','E Calabresa','e-cala',52.0,true),
  ('fogazza','E Fogazza','e-foga',30.0,true),
  ('combo','E Combo sem preparo','e-combo-frio',18.0,false),
  ('combo','E Combo com pizza','e-combo-pizza',60.0,false)
) v(t,n,s,p,r);

-- =============================================================== BLOCO A
-- Quem dispensa preparo, dispensa.
do $a$
declare v_p uuid;
begin
  v_p := pg_temp.pedido('e-a1');
  perform pg_temp.item(v_p, 1, 'product', (select id from public.products where slug='e-coca'), 'E Coca');
  perform pg_temp.checar('A1 · só Coca não vai para a produção',
    'false', public.pedido_exige_producao(v_p)::text);

  v_p := pg_temp.pedido('e-a2');
  perform pg_temp.item(v_p, 1, 'product', (select id from public.products where slug='e-agua'), 'E Agua');
  perform pg_temp.item(v_p, 2, 'product', (select id from public.products where slug='e-coca'), 'E Coca');
  perform pg_temp.checar('A2 · Água + Coca não vai para a produção',
    'false', public.pedido_exige_producao(v_p)::text);

  v_p := pg_temp.pedido('e-a3');
  perform pg_temp.item(v_p, 1, 'product', (select id from public.products where slug='e-bolo'), 'E Bolo');
  perform pg_temp.checar('A3 · produto pronto não vai para a produção',
    'false', public.pedido_exige_producao(v_p)::text);

  v_p := pg_temp.pedido('e-a4');
  perform pg_temp.item(v_p, 1, 'product', (select id from public.products where slug='e-pizza'), 'E Pizza');
  perform pg_temp.checar('A4 · só Pizza vai para a produção',
    'true', public.pedido_exige_producao(v_p)::text);

  v_p := pg_temp.pedido('e-a5');
  perform pg_temp.item(v_p, 1, 'product', (select id from public.products where slug='e-pizza'), 'E Pizza');
  perform pg_temp.item(v_p, 2, 'product', (select id from public.products where slug='e-coca'), 'E Coca');
  perform pg_temp.checar('A5 · Pizza + Coca vai para a produção (o misto vai inteiro)',
    'true', public.pedido_exige_producao(v_p)::text);

  v_p := pg_temp.pedido('e-a6');
  perform pg_temp.item(v_p, 1, 'product', (select id from public.products where slug='e-pizza'), 'E Pizza');
  perform pg_temp.item(v_p, 2, 'product', (select id from public.products where slug='e-foga'), 'E Fogazza');
  perform pg_temp.checar('A6 · Pizza + Fogazza vai para a produção',
    'true', public.pedido_exige_producao(v_p)::text);
end $a$;

-- =============================================================== BLOCO B
-- O QUE NÃO SE CONSEGUE PROVAR. Todos caem para "exige".
do $b$
declare v_p uuid; v_i uuid; v_fantasma uuid;
begin
  -- B1: item sem product_id.
  v_p := pg_temp.pedido('e-b1');
  perform pg_temp.item(v_p, 1, 'product', null, 'sem produto');
  perform pg_temp.checar('B1 · item sem product_id cai para exige',
    'true', public.pedido_exige_producao(v_p)::text);

  -- B2: produto que não está mais no catálogo.
  v_fantasma := gen_random_uuid();
  v_p := pg_temp.pedido('e-b2');
  insert into public.order_items (order_id, line_number, item_type, product_id,
    product_name_snapshot, quantity, unit_price, line_total)
  values (v_p, 1, 'product', null, 'produto apagado', 1, 10, 10);
  perform pg_temp.checar('B2 · referência desconhecida cai para exige',
    'true', public.pedido_exige_producao(v_p)::text);

  -- B3: meio a meio — o item não tem produto próprio, os sabores têm.
  v_p := pg_temp.pedido('e-b3');
  v_i := pg_temp.item(v_p, 1, 'pizza', null, 'Meio a meio');
  insert into public.order_item_flavors (order_item_id, flavor_product_id,
    flavor_name_snapshot, effective_price_snapshot, portion, sort_order)
  select v_i, p.id, p.name, 26, 0.5, 1 from public.products p where p.slug='e-pizza';
  insert into public.order_item_flavors (order_item_id, flavor_product_id,
    flavor_name_snapshot, effective_price_snapshot, portion, sort_order)
  select v_i, p.id, p.name, 26, 0.5, 2 from public.products p where p.slug='e-cala';
  perform pg_temp.checar('B3 · meio a meio cai para exige mesmo sem produto no item',
    'true', public.pedido_exige_producao(v_p)::text);

  -- B4: sabor cujo produto não se conhece.
  v_p := pg_temp.pedido('e-b4');
  v_i := pg_temp.item(v_p, 1, 'pizza', null, 'Meio a meio sem sabor conhecido');
  insert into public.order_item_flavors (order_item_id, flavor_product_id,
    flavor_name_snapshot, effective_price_snapshot, portion, sort_order)
  values (v_i, null, 'sabor sumido', 26, 1, 1);
  perform pg_temp.checar('B4 · sabor desconhecido cai para exige',
    'true', public.pedido_exige_producao(v_p)::text);

  -- B5: combo marcado "não exige" cujo COMPONENTE é pizza. O componente manda.
  v_p := pg_temp.pedido('e-b5');
  v_i := pg_temp.item(v_p, 1, 'combo',
    (select id from public.products where slug='e-combo-pizza'), 'E Combo com pizza');
  insert into public.order_combo_components (order_item_id, component_product_id,
    product_name_snapshot, quantity, sort_order)
  select v_i, p.id, p.name, 1, 1 from public.products p where p.slug='e-pizza';
  insert into public.order_combo_components (order_item_id, component_product_id,
    product_name_snapshot, quantity, sort_order)
  select v_i, p.id, p.name, 1, 2 from public.products p where p.slug='e-coca';
  perform pg_temp.checar('B5 · componente de combo manda sobre o combo',
    'true', public.pedido_exige_producao(v_p)::text);

  -- B6: combo frio de verdade — nenhum componente exige.
  v_p := pg_temp.pedido('e-b6');
  v_i := pg_temp.item(v_p, 1, 'combo',
    (select id from public.products where slug='e-combo-frio'), 'E Combo sem preparo');
  insert into public.order_combo_components (order_item_id, component_product_id,
    product_name_snapshot, quantity, sort_order)
  select v_i, p.id, p.name, 1, 1 from public.products p where p.slug='e-coca';
  insert into public.order_combo_components (order_item_id, component_product_id,
    product_name_snapshot, quantity, sort_order)
  select v_i, p.id, p.name, 1, 2 from public.products p where p.slug='e-agua';
  perform pg_temp.checar('B6 · combo realmente frio dispensa a produção',
    'false', public.pedido_exige_producao(v_p)::text);

  -- B7: pedido sem item nenhum. Não há o que preparar.
  v_p := pg_temp.pedido('e-b7');
  perform pg_temp.checar('B7 · pedido sem itens não inventa produção',
    'false', public.pedido_exige_producao(v_p)::text);
end $b$;

-- =============================================================== BLOCO C
-- A REGRA VIRANDO EFEITO. A mesma expressão que `acoes_do_pedido` usa.
do $c$
declare
  v_frio uuid; v_quente uuid;
begin
  v_frio := pg_temp.pedido('e-c1');
  perform pg_temp.item(v_frio, 1, 'product', (select id from public.products where slug='e-coca'), 'E Coca');
  update public.orders set requires_production = public.pedido_exige_producao(v_frio) where id = v_frio;

  v_quente := pg_temp.pedido('e-c2');
  perform pg_temp.item(v_quente, 1, 'product', (select id from public.products where slug='e-pizza'), 'E Pizza');
  update public.orders set requires_production = public.pedido_exige_producao(v_quente) where id = v_quente;

  perform pg_temp.checar('C1 · bebida NÃO oferece iniciar_producao', 'false',
    (select (o.status='confirmed' and o.requires_production)::text from public.orders o where o.id=v_frio));
  perform pg_temp.checar('C2 · bebida oferece marcar_pronto direto de confirmed', 'true',
    (select (o.status='in_production' or (o.status='confirmed' and not o.requires_production))::text
       from public.orders o where o.id=v_frio));
  perform pg_temp.checar('C3 · pizza oferece iniciar_producao', 'true',
    (select (o.status='confirmed' and o.requires_production)::text from public.orders o where o.id=v_quente));
  perform pg_temp.checar('C4 · pizza NÃO pula para pronto', 'false',
    (select (o.status='in_production' or (o.status='confirmed' and not o.requires_production))::text
       from public.orders o where o.id=v_quente));

  -- C5: PAGAR NÃO MEXE NO STATUS OPERACIONAL. Os dois eixos são separados.
  update public.orders set payment_status='confirmed' where id = v_quente;
  perform pg_temp.checar('C5 · pedido pago com pizza continua confirmed', 'confirmed',
    (select o.status from public.orders o where o.id=v_quente));
  perform pg_temp.checar('C6 · pedido pago com pizza continua exigindo produção', 'true',
    (select o.requires_production::text from public.orders o where o.id=v_quente));

  -- C7: a revisão troca os itens e o snapshot acompanha.
  delete from public.order_items where order_id = v_frio;
  perform pg_temp.item(v_frio, 1, 'product', (select id from public.products where slug='e-pizza'), 'E Pizza');
  update public.orders set requires_production = public.pedido_exige_producao(v_frio) where id = v_frio;
  perform pg_temp.checar('C7 · revisão que acrescenta pizza devolve o pedido à produção',
    'true', (select o.requires_production::text from public.orders o where o.id=v_frio));
end $c$;

-- =============================================================== BLOCO D
-- O QUE NÃO PODE TER MUDADO.
do $d$
begin
  perform pg_temp.checar('D1 · nenhum produto REAL nasceu sem produção', '0',
    (select count(*)::text from public.products
      where not requires_production and slug not like 'e-%'));

  perform pg_temp.checar('D2 · nenhum pedido REAL nasceu sem produção', '0',
    (select count(*)::text from public.orders
      where not requires_production and tracking_token_hash not like 'e-%'));

  perform pg_temp.checar('D3 · criar_pedido continua SECURITY DEFINER', 'true',
    (select p.prosecdef::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='criar_pedido'));

  perform pg_temp.checar('D4 · criar_pedido continua com a mesma assinatura',
    'p_pedido jsonb, p_segredo text',
    (select pg_get_function_identity_arguments(p.oid) from pg_proc p
       join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='criar_pedido'));

  perform pg_temp.checar('D5 · acoes_do_pedido NÃO virou DEFINER', 'false',
    (select p.prosecdef::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='acoes_do_pedido'));

  perform pg_temp.checar('D6 · comando_pedido continua validando contra acoes_do_pedido', 'true',
    (select (pg_get_functiondef(p.oid) like '%acoes_do_pedido(p_order_id)%')::text
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='comando_pedido'));

  perform pg_temp.checar('D7 · nenhum status novo foi criado', '13',
    (select (length(pg_get_constraintdef(oid))
             - length(replace(pg_get_constraintdef(oid), '''::text', '')))::text
       from pg_constraint where conname='orders_status'));

  perform pg_temp.checar('D8 · anon continua sem ler produtos pela RPC do PDV', 'false',
    has_function_privilege('anon','public.buscar_catalogo_pdv(text)','execute')::text);

  perform pg_temp.checar('D9 · as duas RPCs do PDV informam exige_producao', 'true',
    ((select pg_get_functiondef(p.oid) like '%exige_producao%' from pg_proc p
        join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='buscar_catalogo_pdv')
     and
     (select pg_get_functiondef(p.oid) like '%exige_producao%' from pg_proc p
        join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='resolver_codigo_de_barras'))::text);
end $d$;

-- ------------------------------------------------------------- resultado
-- Uma saída só: o placar primeiro, depois cada cenário. Quem falha aparece
-- com o esperado e o obtido lado a lado.
select 0 as n,
       format('PLACAR: %s de %s passaram, %s falharam',
              count(*) filter (where passou), count(*),
              count(*) filter (where not passou)) as cenario,
       '' as esperado, '' as obtido,
       case when count(*) filter (where not passou) = 0 then 'TUDO OK' else 'HA FALHAS' end as r
  from resultado_teste
union all
select n, cenario, esperado, obtido, case when passou then 'OK' else 'FALHOU' end
  from resultado_teste
order by n;

rollback;
