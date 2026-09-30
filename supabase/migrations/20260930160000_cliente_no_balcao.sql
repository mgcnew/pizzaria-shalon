-- 0140 — o balcão reconhece o cliente pelo WhatsApp
-- 04 RN-MAN-007 · 03 §12.2 · D-2026-09-30-104
--
-- No "Novo pedido", ao digitar o WhatsApp completo, a equipe passa a ver
-- quem é o cliente e o que ele costuma pedir — em vez de redigitar tudo e
-- descobrir só na gravação que ele existia (ou que estava bloqueado).
--
-- UMA função, só para a equipe, pelo número EXATO. Não é busca: não existe
-- "digite parte do número e veja a base". O público continua sem nenhum
-- caminho de consulta de cliente por telefone (03 §12.1).
--
-- Exige as DUAS permissões: `orders.create_manual` (é o contexto do
-- lançamento) e `customers.view` (é dado de cliente). O Atendente tem as duas.
--
-- DEVOLVE, e só isso:
--   · cliente: nome, desde quando, quantos pedidos concluídos, último pedido,
--     ticket médio e, se bloqueado, o motivo interno (a equipe pode ver;
--     o cliente nunca — RN-CLI-008);
--   · endereços salvos ativos, sem repetir o mesmo endereço (address_key),
--     o preferencial primeiro;
--   · o último pedido não cancelado/rejeitado, com a configuração de cada
--     item (`configuracao_do_item`) para o balcão repetir — REPRECIFICADA pelo
--     cardápio de hoje, na tela, pelo motor de sempre;
--   · o que ele mais pede (produto + tamanho, pedidos concluídos), pronto
--     para pôr no pedido;
--   · a forma de pagamento que ele mais usa, só como sugestão.
--
-- Nada aqui grava, precifica ou decide disponibilidade.

create or replace function public.cliente_para_balcao(p_whatsapp text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_whats   text := public.normalizar_whatsapp(p_whatsapp);
  v_cliente record;
  v_resumo  record;
  v_ultimo  record;
begin
  if not (public.has_permission('orders.create_manual')
          and public.has_permission('customers.view')) then
    return jsonb_build_object('ok', false, 'erro',
      'Você não tem permissão para consultar clientes.');
  end if;

  if v_whats !~ '^[0-9]{10,15}$' then
    return jsonb_build_object('ok', true, 'encontrado', false);
  end if;

  select c.id, c.name, c.created_at, c.is_blocked, c.blocked_reason_internal
    into v_cliente
    from public.customers c
   where c.whatsapp_normalized = v_whats;

  if v_cliente.id is null then
    return jsonb_build_object('ok', true, 'encontrado', false);
  end if;

  select count(*) filter (where o.status = 'completed') as concluidos,
         max(o.created_at) as ultimo_em,
         round(avg(o.total) filter (where o.status = 'completed'), 2) as ticket
    into v_resumo
    from public.orders o
   where o.customer_id = v_cliente.id;

  select o.id, o.order_number, o.created_at, o.fulfillment_type
    into v_ultimo
    from public.orders o
   where o.customer_id = v_cliente.id
     and o.status not in ('cancelled', 'rejected')
   order by o.created_at desc
   limit 1;

  return jsonb_build_object(
    'ok', true,
    'encontrado', true,
    'cliente', jsonb_build_object(
      'id', v_cliente.id,
      'nome', v_cliente.name,
      'desde', v_cliente.created_at,
      'pedidos', coalesce(v_resumo.concluidos, 0),
      'ultimo_em', v_resumo.ultimo_em,
      'ticket_medio', v_resumo.ticket,
      'bloqueado', v_cliente.is_blocked,
      'motivo_bloqueio', case when v_cliente.is_blocked then v_cliente.blocked_reason_internal end),

    -- O mesmo endereço salvo várias vezes aparece uma só (o mais recente).
    'enderecos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'rotulo', e.label,
               'logradouro', e.street, 'numero', e.number,
               'complemento', e.complement, 'bairro', e.neighborhood,
               'cidade', e.city, 'uf', e.state, 'cep', e.postal_code,
               'referencia', e.reference_point, 'preferido', e.is_preferred)
             order by e.is_preferred desc, e.created_at desc)
        from (
          select distinct on (coalesce(a.address_key, a.id::text)) a.*
            from public.customer_addresses a
           where a.customer_id = v_cliente.id and a.is_active
           order by coalesce(a.address_key, a.id::text), a.is_preferred desc, a.created_at desc
        ) e), '[]'::jsonb),

    'ultimo_pedido', case when v_ultimo.id is null then null else jsonb_build_object(
      'numero', v_ultimo.order_number,
      'em', v_ultimo.created_at,
      'modalidade', v_ultimo.fulfillment_type,
      'itens', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'nome', i.product_name_snapshot,
                 'produto_slug', p.slug,
                 'configuracao', public.configuracao_do_item(i.id))
               order by i.line_number)
          from public.order_items i
          left join public.products p on p.id = i.product_id
         where i.order_id = v_ultimo.id
           and i.item_type in ('pizza', 'product', 'combo')), '[]'::jsonb)) end,

    -- O que ele mais pede: produto + tamanho, por número de pedidos
    -- concluídos em que apareceu, só o que está ativo hoje. Vem com a
    -- configuração inteira (sem meio a meio, borda ou adicional) para o
    -- balcão pôr no pedido — a tela reprecifica pelo motor de sempre.
    'mais_pedidos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nome', t.nome, 'vezes', t.vezes,
               'configuracao', jsonb_build_object(
                 'produto_id', t.produto_id, 'variacao_id', t.variacao_id,
                 'sabores', '[]'::jsonb, 'borda_id', null, 'adicionais', '[]'::jsonb,
                 'observacao', '', 'quantidade', 1))
             order by t.vezes desc, t.nome)
        from (
          select p.id as produto_id, pv.id as variacao_id,
                 case when s.sold_as = 'fogazza' then 'Fogazza ' || p.name
                      else p.name || coalesce(' · ' || s.name, '') end as nome,
                 count(distinct o.id) as vezes
            from public.orders o
            join public.order_items i on i.order_id = o.id
            join public.products p on p.id = i.product_id
            left join public.pizza_sizes s on s.id = i.size_id
            left join public.product_variants pv
                   on pv.product_id = p.id and pv.size_id = i.size_id and pv.is_active
           where o.customer_id = v_cliente.id
             and o.status = 'completed'
             and p.is_active
             and (i.size_id is null or pv.id is not null)
           group by p.id, pv.id, p.name, s.name, s.sold_as
           order by count(distinct o.id) desc, 3
           limit 5
        ) t), '[]'::jsonb),

    -- A forma que ele mais usa nos últimos 10 pedidos, e se costuma pedir troco.
    'pagamento_habitual', (
      select jsonb_build_object('forma_id', x.payment_method_id,
                                'forma', x.nome, 'pede_troco', x.troco)
        from (
          select pi.payment_method_id, max(pi.payment_method_name_snapshot) as nome,
                 bool_or(pi.needs_change) as troco, count(*) as n
            from (select o.id from public.orders o
                   where o.customer_id = v_cliente.id
                     and o.status not in ('cancelled', 'rejected')
                   order by o.created_at desc limit 10) ult
            join public.order_payment_intents pi on pi.order_id = ult.id
           where pi.payment_method_id is not null
           group by pi.payment_method_id
           order by count(*) desc
           limit 1
        ) x)
  );
end;
$$;

comment on function public.cliente_para_balcao(text) is
  'Balcão: reconhece o cliente pelo WhatsApp exato (resumo, endereços, último pedido, mais pedidos, pagamento habitual). orders.create_manual + customers.view (RN-MAN-007).';
revoke all on function public.cliente_para_balcao(text) from public, anon;
grant execute on function public.cliente_para_balcao(text) to authenticated;
