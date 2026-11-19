-- 0185 — O cliente que volta é reconhecido e valorizado, sem prêmio
-- D-2026-11-19-193 · 01 "saudação curta" · 03 §10.2, §11, §12.1 · CLAUDE.md §29, §46
--
-- Decisão do Marcelo (19/11/2026): fazer o cliente se sentir valorizado SEM
-- programa de fidelidade. Nada de ponto, desconto, cupom ou prêmio (CLAUDE.md
-- §19 e §46). Só reconhecimento:
--   · "Que bom te ver de novo, Maria!" no cardápio;
--   · "Pedir de novo" o último pedido concluído, com os preços de hoje;
--   · um marco comemorado ("seu 10º pedido por aqui") ao enviar o pedido;
--   · um selo com o sabor que a pessoa mais pede ("Fã de Calabresa").
--
-- QUEM ABRE: só quem tem a credencial do navegador, como `cliente_do_dispositivo`
-- (0142). Não existe caminho por WhatsApp, nome ou link de acompanhamento.
--
-- O QUE CONTA: só os pedidos feitos DESTE navegador (`orders.public_device_id`).
-- A credencial autoriza "apenas o conjunto de pedidos associado àquele
-- dispositivo" (03 §11). Pedido feito no balcão com o mesmo WhatsApp não
-- entra: contá-lo diria ao navegador algo que ele não fez.
--
-- O QUE VOLTA, e só isso: o primeiro nome, quantos pedidos deste navegador não
-- foram recusados nem cancelados, o sabor mais pedido (a partir de 3 pedidos
-- concluídos) e os itens do último pedido concluído, para remontar. Nada de
-- valores, datas, endereço ou status de pedido.
--
-- Credencial malformada, desconhecida, revogada, sem cliente ou de cliente
-- bloqueado recebem a mesma resposta vazia.

create or replace function public.cliente_valorizado(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_dispositivo uuid;
  v_nome text;
  v_pedidos integer;
  v_favorito record;
  v_ultimo uuid;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('encontrado', false);
  end if;

  select d.id, c.name
    into v_dispositivo, v_nome
    from public.public_devices d
    join public.customers c on c.id = d.customer_id
   where d.token_hash = public.hash_token(p_token)
     and d.revoked_at is null
     and not c.is_blocked;

  if v_dispositivo is null then
    return jsonb_build_object('encontrado', false);
  end if;

  select count(*) into v_pedidos
    from public.orders o
   where o.public_device_id = v_dispositivo
     and o.status not in ('rejected', 'cancelled');

  -- O sabor que mais aparece, por pedidos concluídos (não por fatia): meio a
  -- meio de Calabresa conta uma vez para a Calabresa naquele pedido.
  select f.flavor_name_snapshot as nome, count(distinct o.id) as vezes
    into v_favorito
    from public.orders o
    join public.order_items i on i.order_id = o.id
    join public.order_item_flavors f on f.order_item_id = i.id
   where o.public_device_id = v_dispositivo
     and o.status = 'completed'
   group by f.flavor_name_snapshot
   order by count(distinct o.id) desc, max(o.created_at) desc
   limit 1;

  select o.id into v_ultimo
    from public.orders o
   where o.public_device_id = v_dispositivo
     and o.status = 'completed'
   order by o.created_at desc
   limit 1;

  return jsonb_build_object(
    'encontrado', true,
    'nome', split_part(btrim(v_nome), ' ', 1),
    'pedidos', v_pedidos,
    'sabor_favorito', case when coalesce(v_favorito.vezes, 0) >= 3
      then jsonb_build_object('nome', v_favorito.nome, 'vezes', v_favorito.vezes) end,
    -- A configuração de cada item, para a tela remontar pelo motor de hoje
    -- (preço, promoção e disponibilidade atuais). Nunca o preço antigo.
    'ultimo_pedido', case when v_ultimo is null then null else jsonb_build_object(
      'itens', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'nome', i.product_name_snapshot,
                 'produto_slug', p.slug,
                 'configuracao', public.configuracao_do_item(i.id))
               order by i.line_number)
          from public.order_items i
          left join public.products p on p.id = i.product_id
         where i.order_id = v_ultimo
           and i.product_id is not null), '[]'::jsonb)) end);
end;
$$;

comment on function public.cliente_valorizado(text) is
  'D-2026-11-19-193: com a credencial do navegador, primeiro nome, pedidos deste navegador, sabor mais pedido e último pedido para repetir. Sem prêmio e sem nada de outro aparelho.';
revoke all on function public.cliente_valorizado(text) from public;
grant execute on function public.cliente_valorizado(text) to anon, authenticated;

do $post$
begin
  if not exists (select 1 from pg_proc where proname = 'cliente_valorizado') then
    raise exception 'cliente_valorizado não foi criada';
  end if;
end;
$post$;
