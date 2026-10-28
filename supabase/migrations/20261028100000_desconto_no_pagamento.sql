-- 0180 — Desconto na hora do pagamento
-- D-2026-10-28-175 · 04 RN-PGTO-016 · CLAUDE.md §16, §19, §28, §33
--
-- O PROBLEMA. Às vezes a loja dá um desconto na hora de receber, e o sistema
-- não tinha como: o pagamento tem de fechar exatamente no total do pedido.
-- O desconto virava pagamento que não bate, ou diferença no fechamento.
--
-- A DECISÃO (dona, 27/10/2026). Desconto manual, em reais, com motivo, antes
-- de registrar o pagamento. A balconista dá até R$ 5,00 sozinha; acima disso,
-- só quem tem `orders.discount` (dona). Não é cupom nem promoção (§19).
--
-- ESTA MIGRATION:
--  1. `orders.discount_amount` (+ motivo, quem e quando). O total passa a ser
--     subtotal + taxa − desconto; o bruto continua sabido.
--  2. Permissão `orders.discount` (desconto acima do limite), para a dona.
--  3. `dar_desconto`: aplica, troca ou tira o desconto de um pedido ainda sem
--     pagamento. O servidor recalcula o total; a tela não manda total.
--  4. As três rotinas que recalculam o total (taxa aprovada, alteração
--     aplicada, acréscimo) respeitam o desconto.
--  5. Leituras: `pagamento_do_pedido` e `pedido_administrativo` trazem o
--     desconto; `resumo_do_fechamento` soma os descontos do caixa.

-- ---------------------------------------------------------------------------
-- 1. O desconto no pedido
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists discount_amount numeric(12,2) not null default 0,
  add column if not exists discount_reason text,
  add column if not exists discount_by uuid references public.app_users(id),
  add column if not exists discount_at timestamptz;

comment on column public.orders.discount_amount is
  'D-2026-10-28-175: desconto dado na hora do pagamento. total = subtotal + delivery_fee − discount_amount.';

alter table public.orders drop constraint orders_total_confere;
alter table public.orders add constraint orders_total_confere
  check (total = subtotal + delivery_fee - discount_amount);

alter table public.orders add constraint orders_desconto_valido check (
  discount_amount >= 0
  and discount_amount <= subtotal + delivery_fee
  and (discount_amount = 0
       or (discount_reason is not null and length(btrim(discount_reason)) >= 3
           and discount_at is not null)));

-- ---------------------------------------------------------------------------
-- 2. Permissão
-- ---------------------------------------------------------------------------
insert into public.permissions (code, module, action, description)
values ('orders.discount', 'orders', 'discount', 'Dar desconto acima de R$ 5,00 no pagamento')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
  from public.roles r, public.permissions p
 where r.name = 'Owner/Admin' and p.code = 'orders.discount'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 3. Dar, trocar ou tirar o desconto
-- ---------------------------------------------------------------------------
create or replace function public.dar_desconto(p_order_id uuid, p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  -- Até este valor, quem recebe dá o desconto sozinho (decisão da dona).
  c_limite constant numeric := 5.00;
  v_ator uuid := public.current_app_user_id();
  v_pedido record;
  v_valor numeric;
  v_motivo text := nullif(btrim(coalesce(p_dados ->> 'motivo', '')), '');
  v_bruto numeric;
  v_ja_pago numeric;
  v_total numeric;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('payments.register') then
    return jsonb_build_object('ok', false, 'erro', 'Você não tem permissão para receber pagamento.');
  end if;

  begin
    v_valor := coalesce(nullif(p_dados ->> 'valor', '')::numeric, 0);
  exception when others then
    return jsonb_build_object('ok', false, 'erro', 'Valor do desconto inválido.');
  end;
  if v_valor < 0 or v_valor <> round(v_valor, 2) then
    return jsonb_build_object('ok', false, 'erro', 'Valor do desconto inválido.');
  end if;
  if v_valor > 0 and (v_motivo is null or length(v_motivo) < 3) then
    return jsonb_build_object('ok', false, 'erro', 'Diga o motivo do desconto.');
  end if;
  if length(coalesce(v_motivo, '')) > 200 then
    return jsonb_build_object('ok', false, 'erro', 'Motivo longo demais.');
  end if;

  select * into v_pedido from public.orders o where o.id = p_order_id for update;
  if v_pedido.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Pedido não encontrado.');
  end if;
  if v_pedido.status in ('cancelled', 'rejected') then
    return jsonb_build_object('ok', false, 'erro', 'Pedido cancelado ou rejeitado não recebe desconto.');
  end if;

  -- Desconto é combinado antes de pagar. Depois, o caminho é estornar.
  select coalesce(sum(p.amount), 0) into v_ja_pago from public.payments p
   where p.order_id = p_order_id and p.status = 'confirmed';
  if v_ja_pago > 0 then
    return jsonb_build_object('ok', false, 'ja_pago', true,
      'erro', 'Este pedido já tem pagamento registrado. Para dar desconto, estorne o pagamento antes.');
  end if;

  v_bruto := v_pedido.subtotal + v_pedido.delivery_fee;
  if v_valor > v_bruto then
    return jsonb_build_object('ok', false, 'erro', 'O desconto não pode ser maior que o pedido.');
  end if;
  if v_valor > c_limite and not public.has_permission('orders.discount') then
    return jsonb_build_object('ok', false, 'exige_permissao', true,
      'erro', 'Desconto acima de R$ 5,00 só com quem pode dar desconto livre. Chame a dona.');
  end if;

  -- Toque duplo: o mesmo desconto já está aplicado.
  if v_valor = v_pedido.discount_amount
     and coalesce(v_motivo, '') = coalesce(v_pedido.discount_reason, '') then
    return jsonb_build_object('ok', true, 'ja_existia', true,
      'total', v_pedido.total, 'desconto', v_pedido.discount_amount);
  end if;

  v_total := v_bruto - v_valor;

  update public.orders
     set discount_amount = v_valor,
         discount_reason = case when v_valor > 0 then v_motivo end,
         discount_by = case when v_valor > 0 then v_ator end,
         discount_at = case when v_valor > 0 then now() end,
         total = v_total
   where id = p_order_id;

  perform public.log_audit(
    case when v_valor > 0 then 'pedido_desconto' else 'pedido_desconto_retirado' end,
    'orders', p_order_id,
    jsonb_build_object('desconto', v_pedido.discount_amount, 'total', v_pedido.total,
                       'motivo', v_pedido.discount_reason),
    jsonb_build_object('desconto', v_valor, 'total', v_total),
    v_motivo);

  return jsonb_build_object('ok', true, 'total', v_total::numeric(12,2),
    'desconto', v_valor::numeric(12,2), 'bruto', v_bruto::numeric(12,2));
end;
$$;

comment on function public.dar_desconto is
  'D-2026-10-28-175: desconto na hora do pagamento, com motivo. Até R$ 5,00 com payments.register; acima, orders.discount. Só antes de pagar.';

revoke all on function public.dar_desconto(uuid, jsonb) from public, anon;
grant execute on function public.dar_desconto(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Quem recalcula o total respeita o desconto
-- ---------------------------------------------------------------------------

-- Taxa definida ao aprovar a entrega.
do $$
declare
  v_def text := pg_get_functiondef('public.comando_pedido(uuid,text,jsonb)'::regprocedure);
  v_novo text;
begin
  if v_def like '%0180: desconto na taxa%' then
    return;
  end if;

  v_novo := replace(v_def,
    E'         set delivery_fee = v_taxa,\n             total = subtotal + v_taxa,\n',
    E'         set delivery_fee = v_taxa,\n             -- 0180: desconto na taxa — o total desconta o que foi dado.\n             discount_amount = least(discount_amount, subtotal + v_taxa),\n             total = subtotal + v_taxa - least(discount_amount, subtotal + v_taxa),\n');

  if v_novo = v_def then
    raise exception 'comando_pedido mudou: patch do desconto na taxa';
  end if;

  execute v_novo;
end;
$$;

-- Alteração aplicada: o desconto continua, limitado ao novo valor.
do $$
declare
  v_def text := pg_get_functiondef('public.aplicar_revisao(uuid)'::regprocedure);
  v_novo text;
begin
  if v_def like '%0180: desconto na alteração%' then
    return;
  end if;

  v_novo := replace(v_def,
    E'     set subtotal = v_rev.subtotal_after, total = v_rev.total_after,\n',
    E'     -- 0180: desconto na alteração — continua, até o novo valor.\n     set subtotal = v_rev.subtotal_after,\n         discount_amount = least(discount_amount, v_rev.total_after),\n         total = v_rev.total_after - least(discount_amount, v_rev.total_after),\n');

  if v_novo = v_def then
    raise exception 'aplicar_revisao mudou: patch do desconto';
  end if;

  execute v_novo;
end;
$$;
-- `acrescentar_itens` soma ao total (total = total + v_soma): já preserva o desconto.

-- ---------------------------------------------------------------------------
-- 5. Leituras
-- ---------------------------------------------------------------------------
do $$
declare
  v_def text := pg_get_functiondef('public.pagamento_do_pedido(uuid)'::regprocedure);
  v_novo text;
begin
  if v_def like '%0180: desconto%' then
    return;
  end if;

  v_novo := replace(v_def,
    E'    ''situacao'', (select o.payment_status from public.orders o where o.id = p_order_id));',
    E'    -- 0180: desconto dado na hora do pagamento.\n    ''desconto'', (select case when o.discount_amount > 0 then jsonb_build_object(\n                    ''valor'', o.discount_amount, ''motivo'', o.discount_reason,\n                    ''bruto'', o.subtotal + o.delivery_fee, ''em'', o.discount_at) end\n                   from public.orders o where o.id = p_order_id),\n    ''situacao'', (select o.payment_status from public.orders o where o.id = p_order_id));');

  if v_novo = v_def then
    raise exception 'pagamento_do_pedido mudou: patch do desconto';
  end if;

  execute v_novo;
end;
$$;

do $$
declare
  v_def text := pg_get_functiondef('public.pedido_administrativo(uuid)'::regprocedure);
  v_novo text;
begin
  if v_def like '%0180: desconto%' then
    return;
  end if;

  v_novo := replace(v_def,
    E'''total'', o.total,\n',
    E'''total'', o.total,\n    -- 0180: desconto dado na hora do pagamento.\n    ''desconto'', jsonb_build_object(''valor'', o.discount_amount, ''motivo'', o.discount_reason),\n');

  if v_novo = v_def then
    raise exception 'pedido_administrativo mudou: patch do desconto';
  end if;

  execute v_novo;
end;
$$;

do $$
declare
  v_def text := pg_get_functiondef('public.resumo_do_fechamento(uuid)'::regprocedure);
  v_novo text;
begin
  if v_def like '%0180: descontos%' then
    return;
  end if;

  v_novo := replace(v_def,
    E'    -- 0176: pedidos do turno sem recebimento no caixa.\n',
    E'    -- 0180: descontos dados nos pedidos recebidos neste caixa.\n    ''descontos'', (\n      select jsonb_build_object(''total'', coalesce(sum(o.discount_amount), 0)::numeric(12,2),\n                                ''pedidos'', count(*))\n        from public.pedidos_do_caixa(v_s.id) pc\n        join public.orders o on o.id = pc.order_id\n       where pc.recebido_no_caixa and o.discount_amount > 0),\n\n    -- 0176: pedidos do turno sem recebimento no caixa.\n');

  if v_novo = v_def then
    raise exception 'resumo_do_fechamento mudou: patch dos descontos';
  end if;

  execute v_novo;
end;
$$;
