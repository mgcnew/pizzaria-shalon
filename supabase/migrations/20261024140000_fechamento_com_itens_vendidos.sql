-- 0173 — Fechamento de caixa com a contagem de pizzas, fogazzas e bebidas
-- D-2026-10-24-166
--
-- O relatório de fechamento passa a dizer QUANTAS unidades saíram, além de
-- quanto dinheiro entrou. A contagem vem do servidor pelo mesmo motivo dos
-- totais da 0171: a tela não lê itens de pedido e não deve somar nada por conta.
--
-- O que conta:
--  * pedidos com ao menos um pagamento confirmado NESTA sessão — a mesma
--    base do "Recebido por forma de pagamento", então o relatório fala de um
--    conjunto só. Pedido cancelado/recusado ou com pagamento estornado fica
--    fora; pedido com dois pagamentos conta uma vez;
--  * pizza e fogazza: item `pizza`, separado pelo tamanho (`sold_as`). Meio a
--    meio é UMA pizza. Produto avulso entra pelo `product_type`;
--  * bebida: produto de tipo `drink`;
--  * combo: contam os COMPONENTES (cada um pelo seu tipo) vezes a quantidade
--    de combos — um combo de pizza + refrigerante soma 1 pizza e 1 bebida,
--    e o combo em si não é contado como unidade.
--  Qualquer outra coisa (tipo `other`) não entra em nenhum dos três.
--
-- Só ACRESCENTA a chave `itens_vendidos` ao JSON de `resumo_do_fechamento`;
-- as que já existiam não mudam. Continua SECURITY INVOKER.

do $$
declare
  v_def text := pg_get_functiondef('public.resumo_do_fechamento(uuid)'::regprocedure);
  v_novo text := v_def;
begin
  -- Já aplicada: não faz nada.
  if v_def like '%0173: itens vendidos%' then
    return;
  end if;

  v_novo := replace(v_novo,
    E'    -- RN-CAIXA-011: o esperado é do servidor.\n    ''esperado_em_dinheiro'', case when v_s.status = ''open''',
    E'    -- 0173: itens vendidos (pizzas, fogazzas e bebidas).\n    ''itens_vendidos'', (\n      select jsonb_build_object(\n               ''pizzas'', coalesce(sum(u.qtd) filter (where u.tipo = ''pizza''), 0),\n               ''fogazzas'', coalesce(sum(u.qtd) filter (where u.tipo = ''fogazza''), 0),\n               ''bebidas'', coalesce(sum(u.qtd) filter (where u.tipo = ''drink''), 0))\n        from (\n          select case\n                   when oi.item_type = ''pizza'' then\n                     case when s.sold_as = ''fogazza'' then ''fogazza'' else ''pizza'' end\n                   else pr.product_type\n                 end as tipo,\n                 oi.quantity as qtd\n            from public.order_items oi\n            left join public.products pr on pr.id = oi.product_id\n            left join public.pizza_sizes s on s.id = oi.size_id\n           where oi.item_type <> ''combo''\n             and oi.order_id in (select o.id from public.orders o\n                                  where o.status not in (''cancelled'', ''rejected'')\n                                    and exists (select 1 from public.payments p\n                                                 where p.order_id = o.id\n                                                   and p.cash_session_id = v_s.id\n                                                   and p.status = ''confirmed''))\n          union all\n          select case\n                   when pr.product_type = ''pizza'' and s.sold_as = ''fogazza'' then ''fogazza''\n                   else pr.product_type\n                 end,\n                 c.quantity * oi.quantity\n            from public.order_items oi\n            join public.order_combo_components c on c.order_item_id = oi.id\n            left join public.products pr on pr.id = c.component_product_id\n            left join public.product_variants v on v.id = c.component_variant_id\n            left join public.pizza_sizes s on s.id = v.size_id\n           where oi.item_type = ''combo''\n             and oi.order_id in (select o.id from public.orders o\n                                  where o.status not in (''cancelled'', ''rejected'')\n                                    and exists (select 1 from public.payments p\n                                                 where p.order_id = o.id\n                                                   and p.cash_session_id = v_s.id\n                                                   and p.status = ''confirmed''))\n        ) u),\n\n    -- RN-CAIXA-011: o esperado é do servidor.\n    ''esperado_em_dinheiro'', case when v_s.status = ''open''');

  if v_novo not like '%0173: itens vendidos%' then
    raise exception 'resumo_do_fechamento mudou: patch dos itens vendidos';
  end if;

  execute v_novo;
end;
$$;
