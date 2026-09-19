-- 0051 — Registro de impressão e o ranking "Mais pedidos" (A-16)
-- 04-REGRAS-NEGOCIO.md RN-PRINT-001..006, RN-POP-001..004 · CLAUDE.md §32, §33

-- ------------------------------------------------------------ impressão
-- RN-PRINT-001 e RN-PRINT-002: a comanda de produção só existe depois que o
-- pedido foi efetivamente aceito. Pedido aguardando Pix, aprovação de
-- entrega ou resposta do cliente NÃO imprime — nem "só para adiantar".
create or replace function public.registrar_impressao(
  p_order_id uuid, p_tipo text, p_conteudo text, p_transporte text default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_pedido record;
  v_via integer;
  v_revisao uuid;
  v_id uuid;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if p_tipo not in ('comanda', 'alteracao') then
    return jsonb_build_object('ok', false, 'erro', 'Tipo de documento inválido.');
  end if;
  if coalesce(btrim(p_conteudo), '') = '' then
    return jsonb_build_object('ok', false, 'erro', 'Documento vazio.');
  end if;

  select * into v_pedido from public.orders o where o.id = p_order_id;
  if v_pedido.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Pedido não encontrado.');
  end if;

  if v_pedido.status not in ('confirmed', 'in_production', 'ready_for_pickup',
                             'ready_for_delivery', 'out_for_delivery',
                             'delivery_failed', 'completed') then
    return jsonb_build_object('ok', false, 'erro',
      'A comanda só sai depois que o pedido for aceito.');
  end if;

  select coalesce(max(p.copy_number), 0) + 1 into v_via
    from public.order_prints p
   where p.order_id = p_order_id and p.document_type = p_tipo;

  -- Primeira via é operação normal; da segunda em diante é REIMPRESSÃO, que
  -- tem permissão própria e é auditada (RN-PRINT-004).
  if v_via = 1 then
    if not public.has_permission('orders.accept') then
      return jsonb_build_object('ok', false, 'erro', 'Você não tem permissão para emitir a comanda.');
    end if;
  else
    if not public.has_permission('orders.reprint') then
      return jsonb_build_object('ok', false, 'erro', 'Você não tem permissão para reimprimir.');
    end if;
  end if;

  if p_tipo = 'alteracao' then
    select r.id into v_revisao from public.order_revisions r
     where r.order_id = p_order_id and r.status = 'applied'
     order by r.revision_number desc limit 1;
    if v_revisao is null then
      return jsonb_build_object('ok', false, 'erro',
        'Não há alteração aplicada para imprimir.');
    end if;
  end if;

  -- Nasce como `requested`. Quem disparou ainda não sabe se saiu no papel.
  insert into public.order_prints (
    order_id, revision_id, document_type, copy_number, status, transport,
    requested_by, content_hash, content_preview)
  values (
    p_order_id, v_revisao, p_tipo, v_via, 'requested', p_transporte, v_ator,
    encode(extensions.digest(p_conteudo, 'sha256'), 'hex'),
    left(p_conteudo, 4000))
  returning id into v_id;

  perform public.log_audit(
    case when v_via = 1 then 'imprimir_' || p_tipo else 'reimprimir_' || p_tipo end,
    'orders', p_order_id, null,
    jsonb_build_object('via', v_via, 'impressao_id', v_id), null);

  return jsonb_build_object('ok', true, 'impressao_id', v_id, 'via', v_via);
end;
$$;

revoke all on function public.registrar_impressao(uuid, text, text, text) from public, anon;
grant execute on function public.registrar_impressao(uuid, text, text, text) to authenticated;

comment on function public.registrar_impressao is 'RN-PRINT-001/004: comanda só após aceite; toda via registrada.';

-- O desfecho real do transporte. Sem esta chamada, a impressão fica
-- eternamente `requested` — que é a verdade quando ninguém confirmou nada.
create or replace function public.atualizar_impressao(
  p_print_id uuid, p_status text, p_erro text default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_print record;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('orders.reprint') then
    return jsonb_build_object('ok', false, 'erro', 'Você não tem permissão para esta ação.');
  end if;
  if p_status not in ('sent', 'confirmed', 'error') then
    return jsonb_build_object('ok', false, 'erro', 'Estado de impressão inválido.');
  end if;
  if p_status = 'error' and coalesce(btrim(p_erro), '') = '' then
    return jsonb_build_object('ok', false, 'erro', 'Informe o que falhou.');
  end if;

  select * into v_print from public.order_prints p where p.id = p_print_id for update;
  if v_print.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Impressão não encontrada.');
  end if;
  if v_print.status in ('confirmed', 'error') then
    return jsonb_build_object('ok', false, 'erro', 'Esta impressão já foi encerrada.');
  end if;

  update public.order_prints
     set status = p_status,
         error_message = case when p_status = 'error' then p_erro else error_message end,
         sent_at = case when p_status in ('sent', 'confirmed') then coalesce(sent_at, now()) else sent_at end,
         confirmed_at = case when p_status = 'confirmed' then now() else confirmed_at end
   where id = p_print_id;

  return jsonb_build_object('ok', true, 'status', p_status);
end;
$$;

revoke all on function public.atualizar_impressao(uuid, text, text) from public, anon;
grant execute on function public.atualizar_impressao(uuid, text, text) to authenticated;

comment on function public.atualizar_impressao is 'Estado REAL do transporte. Nada vira "confirmado" sem alguém confirmar.';

-- --------------------------------------------------------- A-16
-- RN-POP-001 a RN-POP-004.
--
-- Contagem por QUANTIDADE vendida, não por faturamento (RN-POP-002), em
-- janela móvel de 30 dias, somente pedidos concluídos.
--
-- Meio a meio: cada sabor recebe a sua fração — é para isso que
-- `order_item_flavors.portion` existe, e por isso o ranking não precisa
-- interpretar texto.
--
-- Combo conta como COMBO: publicamente o que foi vendido é o combo, não os
-- componentes dele (RN-COMBO). Por isso os itens de combo entram pelo
-- `product_id` do próprio item e seus componentes são ignorados aqui.
--
-- RN-POP-004: nenhum impulso artificial. Produto novo aparece quando
-- vender, e não antes. Isto é OUTRA COISA que o Destaque manual
-- (`is_featured`, RN-DEST-001), que continua independente.
create or replace function public.mais_pedidos(p_limite integer default 6)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'produto_id', r.produto_id, 'quantidade', r.quantidade)
         order by r.quantidade desc, r.nome), '[]'::jsonb)
  from (
    select p.id as produto_id, p.name as nome, sum(x.qtd) as quantidade
    from (
      -- Pizza: a fração de cada sabor, multiplicada pela quantidade da linha.
      select f.flavor_product_id as product_id, f.portion * i.quantity as qtd
      from public.order_items i
      join public.orders o on o.id = i.order_id
      join public.order_item_flavors f on f.order_item_id = i.id
      where o.status = 'completed'
        and o.completed_at >= now() - interval '30 days'

      union all

      -- Demais itens, combo incluído: a linha inteira, no produto da linha.
      select i.product_id, i.quantity::numeric
      from public.order_items i
      join public.orders o on o.id = i.order_id
      where o.status = 'completed'
        and o.completed_at >= now() - interval '30 days'
        and not exists (select 1 from public.order_item_flavors f
                         where f.order_item_id = i.id)
    ) x
    join public.products p on p.id = x.product_id
    where public.produto_disponivel(p.id)
    group by p.id, p.name
  ) r
  where r.quantidade > 0
  limit greatest(coalesce(p_limite, 6), 0);
$$;

revoke all on function public.mais_pedidos(integer) from public;
grant execute on function public.mais_pedidos(integer) to anon, authenticated;

comment on function public.mais_pedidos is 'RN-POP-001..004: 30 dias, concluídos, por quantidade, meio a meio por fração, sem impulso.';
