-- 0147 — Impressão pelo balcão: o celular pede, o notebook imprime
-- D-2026-10-08-116 (entrega 3) · 04-REGRAS-NEGOCIO.md RN-PRINT-001..006
-- CLAUDE.md §32, §33, §34, §40
--
-- O celular não alcança a impressora de 80 mm, que está no USB do notebook.
-- Então ele não imprime: ele REGISTRA o pedido de impressão com transporte
-- `balcao-80mm`, e o notebook marcado como "impressora do balcão", com o
-- painel aberto, recebe pelo Realtime, PEGA o pedido e imprime.
--
-- Nada de fila nova: a fila é o próprio `order_prints`, que já tinha os
-- estados certos. `requested` é "esperando o balcão"; `sent` é "o balcão
-- pegou e mandou para a impressora". `confirmed`/`error` continuam sendo
-- de quem olhou o papel.

-- --------------------------------------------------------------- colunas
-- As linhas COM ESTILO. `content_preview` é texto puro e cortado em 4000
-- caracteres — uma comanda grande de 48 colunas passa disso, e o balcão
-- imprimiria pela metade. Só é preenchida quando outro aparelho vai imprimir.
alter table public.order_prints
  add column content_lines jsonb,
  add column sent_by uuid references public.app_users(id);

alter table public.order_prints
  add constraint order_prints_balcao_tem_linhas
  check (transport is distinct from 'balcao-80mm' or jsonb_typeof(content_lines) = 'array');

comment on column public.order_prints.content_lines is
  'Linhas do documento com estilo, para o aparelho do balcão imprimir. Só no transporte balcao-80mm.';
comment on column public.order_prints.sent_by is
  'Quem estava logado no aparelho que pegou e enviou à impressora (impressão pelo balcão).';

-- A fila do balcão: o que ainda não foi pego.
create index order_prints_fila_do_balcao on public.order_prints (requested_at)
  where status = 'requested' and transport = 'balcao-80mm';

-- ------------------------------------------------------ registrar_impressao
-- Mesma função, um parâmetro a mais (`p_linhas`). A assinatura muda, então a
-- antiga sai: duas versões com argumentos padrão deixariam a chamada ambígua.
drop function public.registrar_impressao(uuid, text, text, text);

create function public.registrar_impressao(
  p_order_id uuid, p_tipo text, p_conteudo text, p_transporte text default null,
  p_linhas jsonb default null)
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
  if p_transporte = 'balcao-80mm' and coalesce(jsonb_typeof(p_linhas), '') <> 'array' then
    return jsonb_build_object('ok', false, 'erro', 'Documento sem linhas para o balcão.');
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
    requested_by, content_hash, content_preview, content_lines)
  values (
    p_order_id, v_revisao, p_tipo, v_via, 'requested', p_transporte, v_ator,
    encode(extensions.digest(p_conteudo, 'sha256'), 'hex'),
    left(p_conteudo, 4000),
    case when p_transporte = 'balcao-80mm' then p_linhas end)
  returning id into v_id;

  perform public.log_audit(
    case when v_via = 1 then 'imprimir_' || p_tipo else 'reimprimir_' || p_tipo end,
    'orders', p_order_id, null,
    jsonb_build_object('via', v_via, 'impressao_id', v_id), null);

  return jsonb_build_object('ok', true, 'impressao_id', v_id, 'via', v_via);
end;
$$;

revoke all on function public.registrar_impressao(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.registrar_impressao(uuid, text, text, text, jsonb) to authenticated;

comment on function public.registrar_impressao is
  'RN-PRINT-001/004: comanda só após aceite; toda via registrada. balcao-80mm guarda as linhas para o notebook imprimir.';

-- ----------------------------------------------------- pegar_impressao_do_balcao
-- O notebook do balcão pega um pedido de impressão. É a trava contra imprimir
-- duas vezes (§34): com dois aparelhos marcados como balcão, ou o mesmo
-- evento chegando duas vezes, só um passa de `requested` para `sent`.
--
-- PRAZO DE 2 MINUTOS. Pedido de impressão mais velho que isso NÃO imprime:
-- vira `error` com o motivo. Sem prazo, ligar o notebook à noite imprimiria
-- de uma vez as comandas que ninguém pegou à tarde — papel que a cozinha
-- leria como pedido novo.
create or replace function public.pegar_impressao_do_balcao(p_print_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_print record;
  v_numero bigint;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  -- Quem pode emitir comanda ou reimprimir pode operar a impressora.
  if not (public.has_permission('orders.accept') or public.has_permission('orders.reprint')) then
    return jsonb_build_object('ok', false, 'erro', 'Você não tem permissão para imprimir.');
  end if;

  select * into v_print from public.order_prints p where p.id = p_print_id for update;
  if v_print.id is null or v_print.transport is distinct from 'balcao-80mm' then
    return jsonb_build_object('ok', false, 'erro', 'Impressão não encontrada.');
  end if;
  if v_print.status <> 'requested' then
    return jsonb_build_object('ok', false, 'motivo', 'ja_pega', 'erro', 'Outro aparelho já pegou esta impressão.');
  end if;

  if v_print.requested_at < now() - interval '2 minutes' then
    update public.order_prints
       set status = 'error',
           error_message = 'O balcão não respondeu a tempo. Emita de novo se ainda precisar.'
     where id = p_print_id;
    return jsonb_build_object('ok', false, 'motivo', 'expirou',
      'erro', 'Pedido de impressão antigo demais; não foi impresso.');
  end if;

  update public.order_prints
     set status = 'sent', sent_at = now(), sent_by = v_ator
   where id = p_print_id;

  select o.order_number into v_numero from public.orders o where o.id = v_print.order_id;

  return jsonb_build_object(
    'ok', true,
    'impressao_id', v_print.id,
    'tipo', v_print.document_type,
    'via', v_print.copy_number,
    'numero', v_numero,
    'linhas', v_print.content_lines);
end;
$$;

revoke all on function public.pegar_impressao_do_balcao(uuid) from public, anon;
grant execute on function public.pegar_impressao_do_balcao(uuid) to authenticated;

comment on function public.pegar_impressao_do_balcao is
  'D-2026-10-08-116: o balcão pega o pedido de impressão. Só um aparelho passa; mais de 2 minutos vira erro.';

-- ---------------------------------------------------------------- realtime
-- §40: valor operacional claro — sem isto o notebook só imprimiria quando
-- alguém recarregasse a tela. A autorização é a do RLS: o assinante recebe
-- o que `order_prints_select` deixaria ler (`orders.view`).
alter publication supabase_realtime add table public.order_prints;
