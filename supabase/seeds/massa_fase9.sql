-- =============================================================================
-- MASSA CONTROLADA DA FASE 9 — SOMENTE AMBIENTE DE DESENVOLVIMENTO
--
-- NÃO RODE EM PRODUÇÃO. Cria clientes, pedidos, pagamentos, entregas e
-- contatos FICTÍCIOS e reescreve `completed_at`/`received_at` para colocá-los
-- no passado — coisa que o produto não permite e não deve permitir.
--
-- TUDO QUE ESTE ARQUIVO CRIA É IDENTIFICÁVEL: nomes começam com `DEV `, e a
-- limpeza correspondente está em `limpeza_fase9.sql`.
--
-- -----------------------------------------------------------------------
-- POR QUE A MASSA PRECISA DE CONFIGURAÇÃO DE LOJA (investigado em 23/09)
-- -----------------------------------------------------------------------
-- O erro "A loja ainda não está recebendo pedidos" NÃO vem do horário: vem
-- de `criar_pedido` não encontrar NENHUMA linha em `store_settings`
-- (20260921170000, passo 3). O ambiente de desenvolvimento nunca foi
-- configurado.
--
-- O horário, esse, só é exigido do CAMINHO PÚBLICO:
--
--     if v_interno is null and not coalesce(public.loja_aberta(), false)
--
-- RN-MAN-006: a loja pausa o link público justamente quando está cheia, e
-- travar o balcão nesse momento impediria de atender quem está na frente do
-- atendente. Ou seja: pedido de balcão — que é como quase toda esta massa é
-- criada — **não** depende de loja aberta.
--
-- Portanto a configuração temporária é mínima e tem motivo por linha:
--   · `store_settings` (DEV)  — sem ela nenhum pedido existe;
--   · `store_hours`           — só para o ÚNICO pedido público, que é o que
--                               prova a fila "aguardando confirmação";
--   · `delivery_fee_bands`    — só para os pedidos de ENTREGA, que provam
--                               corrida, acerto e falha de entrega.
--
-- Nenhuma validação de produção foi removida, nenhum bypass foi criado e
-- nenhuma regra de loja foi afrouxada: a massa entra pelas mesmas RPCs que
-- a interface usa.
--
-- ESTADO ANTERIOR DO AMBIENTE, medido antes de rodar (23/09/2026):
--   store_settings 0 · store_hours 0 · delivery_fee_bands 0
--   customers 0 · orders 0 · driver_runs 0 · internal_product_movements 0
--   remarketing_templates 0 · employees 2 (nenhum motoboy)
--   cash_sessions 1 (aberta) · audit_logs 125
-- A limpeza devolve exatamente esses números, exceto `audit_logs`, que é
-- imutável por regra (CLAUDE.md §33).
--
-- EXECUTADA E REVERTIDA em 23/09/2026: 13 clientes, 26 pedidos (22
-- concluídos), 21 pagamentos, 1 corrida com acerto, 2 contatos de
-- remarketing. Depois da validação visual, `limpeza_fase9.sql` devolveu o
-- ambiente aos números acima. O que ficou está em
-- `docs/06-PENDENCIAS-VALIDACAO-PRODUCAO.md`, "Estado da Fase 9".
-- =============================================================================

begin;

-- ---------------------------------------------------- pré-requisitos (DEV)
insert into public.store_settings (
  id, store_name, whatsapp, address_street, address_number, address_neighborhood,
  address_city, address_state, address_postal_code, latitude, longitude,
  automatic_delivery_radius_km, delivery_eta_min_minutes, delivery_eta_max_minutes,
  pickup_eta_min_minutes, pickup_eta_max_minutes, addons_enabled, timezone
) values (
  'deadbeef-0000-0000-0000-0000000000d0','Pizzaria Shalon (DEV — massa de teste)',
  '5511900000000','Rua de Desenvolvimento','1','Centro','Cidade','SP','00000-000',
  -23.5, -46.6, 4.0, 40, 60, 20, 30, true, 'America/Sao_Paulo');

insert into public.store_hours (weekday, is_closed, opens_at, closes_at, sort_order)
select g, false, '00:00', '23:59', g from generate_series(0,6) g;

insert into public.delivery_fee_bands (min_distance_km, max_distance_km, fee, is_active, sort_order)
values (0, 10, 7.00, true, 1);

-- ------------------------------------------------------- catálogo (DEV)
-- Dois produtos com `created_at` antigo. Sem eles, TODO o catálogo do
-- ambiente é "novo no período" e o ranking não teria nenhum produto
-- comparável para mostrar ao lado dos não comparáveis.
insert into public.products (id, category_id, product_type, name, slug,
                             short_description, sort_order, is_active, created_at)
select 'deadbeef-0000-0000-0000-0000000000d1',
       (select category_id from public.products where id = '6fdb1649-bf53-43a8-bec8-5c34ff3f8e25'),
       'pizza','DEV Pizza Forte','dev-pizza-forte','massa de teste', 900, true,
       now() - interval '200 days';
insert into public.products (id, category_id, product_type, name, slug,
                             short_description, sort_order, is_active, created_at)
select 'deadbeef-0000-0000-0000-0000000000d2',
       (select category_id from public.products where id = '6fdb1649-bf53-43a8-bec8-5c34ff3f8e25'),
       'pizza','DEV Pizza Parada','dev-pizza-parada','massa de teste', 901, true,
       now() - interval '200 days';

insert into public.product_variants (id, product_id, size_id, price, is_active, is_temporarily_available)
select 'deadbeef-0000-0000-0000-0000000000e1','deadbeef-0000-0000-0000-0000000000d1',
       (select size_id from public.product_variants where id = 'dd2d33f4-b1bf-4b3a-9c89-2af333a4c38c'),
       45.00, true, true;
insert into public.product_variants (id, product_id, size_id, price, is_active, is_temporarily_available)
select 'deadbeef-0000-0000-0000-0000000000e2','deadbeef-0000-0000-0000-0000000000d2',
       (select size_id from public.product_variants where id = 'dd2d33f4-b1bf-4b3a-9c89-2af333a4c38c'),
       45.00, true, true;

-- ------------------------------------------------------------- referências
select set_config('seed.forte',  'deadbeef-0000-0000-0000-0000000000d1', true);
select set_config('seed.v_forte','deadbeef-0000-0000-0000-0000000000e1', true);
select set_config('seed.mussa',  '6fdb1649-bf53-43a8-bec8-5c34ff3f8e25', true);
select set_config('seed.v_mussa','dd2d33f4-b1bf-4b3a-9c89-2af333a4c38c', true);
select set_config('seed.catu',   'b7868ad9-0330-478a-84e0-bed7559ae7c5', true);
select set_config('seed.v_catu', '3f9ea142-cdc3-4ca9-834f-25a1180f20ae', true);

select set_config('seed.dinheiro',
  (select id::text from public.payment_methods where code='dinheiro'), true);
select set_config('seed.pix',
  (select id::text from public.payment_methods where code='pix_maquininha'), true);
select set_config('seed.segredo',
  (select valor from public.server_secrets where chave='checkout_origem'), true);
select set_config('seed.ator',
  (select au.id::text from public.app_users au
     join public.employees e on e.id = au.employee_id
    where au.is_active and e.employment_status='active'
    order by e.employee_type = 'owner' desc limit 1), true);
select set_config('seed.auth',
  (select au.auth_user_id::text from public.app_users au
     join public.employees e on e.id = au.employee_id
    where au.is_active and e.employment_status='active'
    order by e.employee_type = 'owner' desc limit 1), true);

-- ------------------------------------------------------------- utilitários
-- Retirada paga: o pagamento vem ANTES de concluir, como o produto exige.
-- `completed_at` e `received_at` são reescritos DEPOIS do fluxo real, porque
-- não existe (e não deve existir) comando "concluir no passado".
create or replace function pg_temp.venda(
  p_nome text, p_whats text, p_quando timestamptz,
  p_produto uuid, p_variacao uuid, p_preco numeric,
  p_forma uuid default null, p_origem text default 'counter')
returns uuid language plpgsql security definer as $$
declare v_idem text := gen_random_uuid()::text; v_r jsonb; v_id uuid;
        v_forma uuid := coalesce(p_forma, current_setting('seed.dinheiro', true)::uuid);
begin
  v_r := public.criar_pedido(jsonb_build_object(
    'idempotency_key', v_idem,
    'tracking_token', md5(v_idem) || md5(v_idem || ':s'),
    'origem', p_origem, 'modalidade','pickup',
    'cliente', jsonb_build_object('nome', p_nome, 'whatsapp', p_whats,
                                  'consentimento_marketing', true),
    'itens', jsonb_build_array(jsonb_build_object(
      'produto_id', p_produto, 'variacao_id', p_variacao, 'quantidade', 1)),
    'pagamento', jsonb_build_object('forma_id', v_forma)
  ), '');
  if not coalesce((v_r ->> 'ok')::boolean, false) then
    raise exception 'seed: pedido recusado: %', v_r;
  end if;
  v_id := (v_r ->> 'pedido_id')::uuid;
  perform public.comando_pedido(v_id, 'iniciar_producao');
  perform public.comando_pedido(v_id, 'marcar_pronto');
  v_r := public.registrar_pagamento(v_id, jsonb_build_object(
    'idempotency_key', gen_random_uuid()::text,
    'linhas', jsonb_build_array(jsonb_build_object('forma_id', v_forma, 'valor', p_preco))));
  if not coalesce((v_r ->> 'ok')::boolean, false) then
    raise exception 'seed: pagamento recusado: %', v_r;
  end if;
  v_r := public.comando_pedido(v_id, 'concluir');
  if not coalesce((v_r ->> 'ok')::boolean, false) then
    raise exception 'seed: conclusao recusada: %', v_r;
  end if;
  update public.payments set received_at = p_quando where order_id = v_id;
  update public.orders set completed_at = p_quando, created_at = p_quando where id = v_id;
  return v_id;
end;
$$;

-- Pedido de ENTREGA, parado em `ready_for_delivery`, pronto para virar corrida.
create or replace function pg_temp.entrega(
  p_nome text, p_whats text, p_produto uuid, p_variacao uuid)
returns uuid language plpgsql security definer as $$
declare v_idem text := gen_random_uuid()::text; v_r jsonb; v_id uuid;
begin
  v_r := public.criar_pedido(jsonb_build_object(
    'idempotency_key', v_idem,
    'tracking_token', md5(v_idem) || md5(v_idem || ':e'),
    'origem','whatsapp','modalidade','delivery',
    'cliente', jsonb_build_object('nome', p_nome, 'whatsapp', p_whats,
                                  'consentimento_marketing', true),
    'endereco', jsonb_build_object('logradouro','Rua de Desenvolvimento','numero','9',
      'bairro','Centro','cidade','Cidade','uf','SP',
      'latitude',-23.51,'longitude',-46.61,'confianca','exata','provedor','seed'),
    'rota', jsonb_build_object('distancia_km', 2.0, 'provedor','seed'),
    'itens', jsonb_build_array(jsonb_build_object(
      'produto_id', p_produto, 'variacao_id', p_variacao, 'quantidade', 1)),
    'pagamento', jsonb_build_object('forma_id', current_setting('seed.dinheiro', true))
  ), '');
  if not coalesce((v_r ->> 'ok')::boolean, false) then
    raise exception 'seed: entrega recusada: %', v_r;
  end if;
  v_id := (v_r ->> 'pedido_id')::uuid;
  perform public.comando_pedido(v_id, 'iniciar_producao');
  perform public.comando_pedido(v_id, 'marcar_pronto');
  return v_id;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('seed.auth', true), 'role','authenticated')::text, true);

-- =========================================================== CADÊNCIAS
-- SEMANAL EM DIA — 4 compras a cada 7 dias, última há 3 → recorrente.
-- Duas formas de pagamento diferentes, de propósito.
select pg_temp.venda('DEV Ana Semanal','(11) 98100-0001', now() - interval '24 days',
  current_setting('seed.forte')::uuid, current_setting('seed.v_forte')::uuid, 45.00);
select pg_temp.venda('DEV Ana Semanal','(11) 98100-0001', now() - interval '17 days',
  current_setting('seed.forte')::uuid, current_setting('seed.v_forte')::uuid, 45.00,
  current_setting('seed.pix')::uuid);
select pg_temp.venda('DEV Ana Semanal','(11) 98100-0001', now() - interval '10 days',
  current_setting('seed.mussa')::uuid, current_setting('seed.v_mussa')::uuid, 37.99);
select pg_temp.venda('DEV Ana Semanal','(11) 98100-0001', now() - interval '3 days',
  current_setting('seed.forte')::uuid, current_setting('seed.v_forte')::uuid, 45.00,
  null, 'whatsapp');

-- EM ATENÇÃO — cadência 7, ausência 12 (entre 1× e 2×).
select pg_temp.venda('DEV Bruno Atencao','(11) 98100-0002', now() - interval '26 days',
  current_setting('seed.forte')::uuid, current_setting('seed.v_forte')::uuid, 45.00);
select pg_temp.venda('DEV Bruno Atencao','(11) 98100-0002', now() - interval '19 days',
  current_setting('seed.forte')::uuid, current_setting('seed.v_forte')::uuid, 45.00);
select pg_temp.venda('DEV Bruno Atencao','(11) 98100-0002', now() - interval '12 days',
  current_setting('seed.catu')::uuid, current_setting('seed.v_catu')::uuid, 39.99,
  current_setting('seed.pix')::uuid);

-- AFASTADO — cadência 7, ausência 25 (acima de 2×). É quem recebe contato.
select pg_temp.venda('DEV Carla Afastada','(11) 98100-0003', now() - interval '39 days',
  current_setting('seed.forte')::uuid, current_setting('seed.v_forte')::uuid, 45.00);
select pg_temp.venda('DEV Carla Afastada','(11) 98100-0003', now() - interval '32 days',
  current_setting('seed.forte')::uuid, current_setting('seed.v_forte')::uuid, 45.00);
select pg_temp.venda('DEV Carla Afastada','(11) 98100-0003', now() - interval '25 days',
  current_setting('seed.mussa')::uuid, current_setting('seed.v_mussa')::uuid, 37.99);

-- MENSAL EM DIA — cadência 30, ausência 20 → recorrente. O contraste que
-- prova que a régua é INDIVIDUAL: 20 dias sumido é normal para quem compra
-- uma vez por mês e é alarme para quem compra toda semana.
-- As compras de -80 e -50 também dão base ao PERÍODO ANTERIOR.
select pg_temp.venda('DEV Diego Mensal','(11) 98100-0004', now() - interval '80 days',
  current_setting('seed.catu')::uuid, current_setting('seed.v_catu')::uuid, 39.99);
select pg_temp.venda('DEV Diego Mensal','(11) 98100-0004', now() - interval '50 days',
  current_setting('seed.catu')::uuid, current_setting('seed.v_catu')::uuid, 39.99);
select pg_temp.venda('DEV Diego Mensal','(11) 98100-0004', now() - interval '20 days',
  current_setting('seed.forte')::uuid, current_setting('seed.v_forte')::uuid, 45.00);

-- DUAS COMPRAS — base fraca. Um intervalo não é um hábito (RN-CRM-004).
select pg_temp.venda('DEV Elisa Duas','(11) 98100-0005', now() - interval '16 days',
  current_setting('seed.mussa')::uuid, current_setting('seed.v_mussa')::uuid, 37.99);
select pg_temp.venda('DEV Elisa Duas','(11) 98100-0005', now() - interval '12 days',
  current_setting('seed.mussa')::uuid, current_setting('seed.v_mussa')::uuid, 37.99);

-- UMA COMPRA — sem histórico. Ausência de 40 dias (faixas 15 e 30).
select pg_temp.venda('DEV Fabio Uma','(11) 98100-0006', now() - interval '40 days',
  current_setting('seed.mussa')::uuid, current_setting('seed.v_mussa')::uuid, 37.99);

-- SUMIDA HÁ MUITO — cadência 30, ausência 90. Cobre as faixas 60 e 90.
select pg_temp.venda('DEV Marta Sumida','(11) 98100-0009', now() - interval '150 days',
  current_setting('seed.forte')::uuid, current_setting('seed.v_forte')::uuid, 45.00);
select pg_temp.venda('DEV Marta Sumida','(11) 98100-0009', now() - interval '120 days',
  current_setting('seed.forte')::uuid, current_setting('seed.v_forte')::uuid, 45.00);
select pg_temp.venda('DEV Marta Sumida','(11) 98100-0009', now() - interval '90 days',
  current_setting('seed.forte')::uuid, current_setting('seed.v_forte')::uuid, 45.00);

-- ===================================================== FILA DO SITE
-- Caminho público: chega com o segredo de origem e PARA aguardando a loja
-- (RN-CHK-003). É o que dá conteúdo à central de atenção.
select public.criar_pedido(jsonb_build_object(
  'idempotency_key', gen_random_uuid()::text,
  'tracking_token', md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text),
  'origem','shalon_link','modalidade','pickup',
  'cliente', jsonb_build_object('nome','DEV Helena Site','whatsapp','(11) 98100-0008',
                                'consentimento_marketing', true),
  'itens', jsonb_build_array(jsonb_build_object(
    'produto_id', current_setting('seed.mussa')::uuid,
    'variacao_id', current_setting('seed.v_mussa')::uuid, 'quantidade', 1)),
  'pagamento', jsonb_build_object('forma_id', current_setting('seed.dinheiro', true))
), current_setting('seed.segredo', true));

-- ============================================ CANCELAMENTO E REJEIÇÃO
-- RN-STATE-009/010: são coisas diferentes, e nenhuma apaga o pedido.
select set_config('seed.cancelado', (public.criar_pedido(jsonb_build_object(
  'idempotency_key', gen_random_uuid()::text,
  'tracking_token', md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text),
  'origem','counter','modalidade','pickup',
  'cliente', jsonb_build_object('nome','DEV Joana Cancelada','whatsapp','(11) 98100-0010',
                                'consentimento_marketing', false),
  'itens', jsonb_build_array(jsonb_build_object(
    'produto_id', current_setting('seed.mussa')::uuid,
    'variacao_id', current_setting('seed.v_mussa')::uuid, 'quantidade', 1)),
  'pagamento', jsonb_build_object('forma_id', current_setting('seed.dinheiro', true))
), '') ->> 'pedido_id'), true);

select public.comando_pedido(current_setting('seed.cancelado', true)::uuid, 'cancelar',
  jsonb_build_object('motivo','Massa DEV: cliente desistiu.'));

select set_config('seed.rejeitado', (public.criar_pedido(jsonb_build_object(
  'idempotency_key', gen_random_uuid()::text,
  'tracking_token', md5(gen_random_uuid()::text) || md5(gen_random_uuid()::text),
  'origem','shalon_link','modalidade','pickup',
  'cliente', jsonb_build_object('nome','DEV Kleber Rejeitado','whatsapp','(11) 98100-0011',
                                'consentimento_marketing', false),
  'itens', jsonb_build_array(jsonb_build_object(
    'produto_id', current_setting('seed.mussa')::uuid,
    'variacao_id', current_setting('seed.v_mussa')::uuid, 'quantidade', 1)),
  'pagamento', jsonb_build_object('forma_id', current_setting('seed.dinheiro', true))
), current_setting('seed.segredo', true)) ->> 'pedido_id'), true);

select public.comando_pedido(current_setting('seed.rejeitado', true)::uuid, 'rejeitar',
  jsonb_build_object('motivo','Massa DEV: fora da área de entrega.'));

-- ================================================ ENTREGA E ACERTO
-- Motoboy DEV pela porta certa: a RPC de equipe, não INSERT direto.
select set_config('seed.motoboy', (public.salvar_funcionario(jsonb_build_object(
  'nome','DEV Motoboy','tipo','driver','entregador', true)) ->> 'funcionario_id'), true);

-- Entrega que dá certo: sai, entrega, volta e acerta em dinheiro.
select set_config('seed.p_entrega',
  pg_temp.entrega('DEV Igor Entrega','(11) 98100-0012',
    current_setting('seed.forte')::uuid, current_setting('seed.v_forte')::uuid)::text, true);

-- Entrega que falha: RN-RUN-007, falha não é dinheiro recebido.
select set_config('seed.p_falha',
  pg_temp.entrega('DEV Laura Falha','(11) 98100-0013',
    current_setting('seed.mussa')::uuid, current_setting('seed.v_mussa')::uuid)::text, true);

select public.atribuir_entrega(current_setting('seed.p_entrega', true)::uuid,
  jsonb_build_object('motoboy_id', current_setting('seed.motoboy', true)));
select public.atribuir_entrega(current_setting('seed.p_falha', true)::uuid,
  jsonb_build_object('motoboy_id', current_setting('seed.motoboy', true)));

select set_config('seed.corrida',
  (select driver_run_id::text from public.driver_run_orders
    where order_id = current_setting('seed.p_entrega', true)::uuid), true);

select public.despachar_corrida(current_setting('seed.corrida', true)::uuid);

-- Recebimento em dinheiro NA RUA: é faturamento e ainda não é caixa
-- (RN-CAIXA-014).
select public.registrar_pagamento(current_setting('seed.p_entrega', true)::uuid,
  jsonb_build_object('idempotency_key', gen_random_uuid()::text,
    'linhas', jsonb_build_array(jsonb_build_object(
      'forma_id', current_setting('seed.dinheiro', true), 'valor', 52.00))));

select public.registrar_retorno(
  (select id from public.driver_run_orders
    where order_id = current_setting('seed.p_entrega', true)::uuid),
  '{"entregue": true}'::jsonb);

select public.registrar_retorno(
  (select id from public.driver_run_orders
    where order_id = current_setting('seed.p_falha', true)::uuid),
  jsonb_build_object('entregue', false, 'motivo','Massa DEV: ninguém atendeu no endereço.'));

select public.conciliar_corrida(current_setting('seed.corrida', true)::uuid,
  jsonb_build_object('devolvido', 52.00));

-- ============================ VENDA REGISTRADA QUE NÃO É FATURAMENTO
-- Entrega concluída sem recebimento lançado: o caso real do pedido entregue
-- cujo pagamento ficou para depois (CLAUDE.md §24).
select set_config('seed.p_fiado',
  pg_temp.entrega('DEV Livia Fiado','(11) 98100-0014',
    current_setting('seed.catu')::uuid, current_setting('seed.v_catu')::uuid)::text, true);
select public.comando_pedido(current_setting('seed.p_fiado', true)::uuid, 'despachar');
select public.comando_pedido(current_setting('seed.p_fiado', true)::uuid, 'concluir');
update public.orders
   set completed_at = now() - interval '2 days', created_at = now() - interval '2 days'
 where id = current_setting('seed.p_fiado', true)::uuid;

-- ==================================================== NÃO É RECEITA
select public.registrar_movimento_interno(jsonb_build_object(
  'tipo','courtesy','motivo','Massa DEV: cortesia para cliente antigo',
  'autorizado_por', current_setting('seed.ator', true),
  'itens', jsonb_build_array(jsonb_build_object(
    'produto_id', current_setting('seed.mussa')::uuid,
    'variacao_id', current_setting('seed.v_mussa')::uuid, 'quantidade', 1))));

-- ======================================================= REMARKETING
select public.salvar_template_de_remarketing(jsonb_build_object(
  'nome','DEV Sentimos sua falta',
  'mensagem','Oi {{nome}}! Faz {{dias_sem_comprar}} dias que você não pede na Shalon. Hoje a pizza sai quentinha — quer que eu já anote?'));

-- Contato preparado para a cliente afastada, com desfecho informado.
select set_config('seed.contato',
  (public.preparar_contato_de_remarketing(jsonb_build_object(
     'cliente_id', (select id from public.customers
                     where whatsapp_normalized = public.normalizar_whatsapp('(11) 98100-0003')),
     'segmento','ausentes_15',
     'template_id', (select id from public.remarketing_templates
                      where name = 'DEV Sentimos sua falta')))
   ->> 'contato_id'), true);

select public.registrar_resultado_do_contato(jsonb_build_object(
  'contato_id', current_setting('seed.contato', true)::uuid,
  'resultado','contacted',
  'observacao','Massa DEV: respondeu que ia pensar.'));

-- COMPRA POSTERIOR AO CONTATO — fato temporal, nunca causa (RN-RMKT-005).
-- `clock_timestamp()` porque `now()` é congelado no início da transação: a
-- compra precisa ser posterior de verdade.
select pg_temp.venda('DEV Carla Afastada','(11) 98100-0003', clock_timestamp(),
  current_setting('seed.forte')::uuid, current_setting('seed.v_forte')::uuid, 45.00);

-- Um segundo contato SEM desfecho, para a fila "aguardando o desfecho".
select public.preparar_contato_de_remarketing(jsonb_build_object(
  'cliente_id', (select id from public.customers
                  where whatsapp_normalized = public.normalizar_whatsapp('(11) 98100-0009')),
  'segmento','ausentes_90',
  'template_id', (select id from public.remarketing_templates
                   where name = 'DEV Sentimos sua falta')));

-- OPT-OUT — o consentimento tem de valer (RN-RMKT-007).
select public.registrar_consentimento(jsonb_build_object(
  'cliente_id', (select id from public.customers
                  where whatsapp_normalized = public.normalizar_whatsapp('(11) 98100-0006')),
  'aceita', false, 'origem','admin',
  'observacao','Massa DEV: pediu para não receber promoções.'));

reset role;
commit;
