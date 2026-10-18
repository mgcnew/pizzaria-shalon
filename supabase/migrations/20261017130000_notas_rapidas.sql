-- 0165 — Bloco de notas rápido do painel
-- D-2026-10-17-151 · CLAUDE.md §12, §33
--
-- Notas curtas da equipe, abertas pela topbar. Compartilhadas: todos os
-- usuários internos ativos veem as mesmas notas, com quem escreveu e quando.
-- Uma nota pode referenciar UM pedido, cliente ou produto; o rótulo da
-- referência é montado no servidor no momento da criação (snapshot), e
-- referenciar pedido/cliente exige a permissão de ver pedido/cliente.
--
-- Acesso só por funções SECURITY DEFINER que exigem usuário interno ativo.
-- A tabela tem RLS sem política: chamada direta não lê nem grava nada.

create table public.quick_notes (
  id uuid primary key default gen_random_uuid(),
  body text not null check (length(btrim(body)) between 1 and 1000),
  ref_type text check (ref_type in ('order', 'customer', 'product')),
  order_id uuid references public.orders (id) on delete set null,
  customer_id uuid references public.customers (id) on delete set null,
  product_id uuid references public.products (id) on delete set null,
  ref_label text,
  created_by uuid not null references public.app_users (id),
  created_at timestamptz not null default now(),
  done_at timestamptz,
  done_by uuid references public.app_users (id),
  constraint quick_notes_referencia check (
    (ref_type is null and order_id is null and customer_id is null and product_id is null and ref_label is null)
    or (ref_type = 'order' and customer_id is null and product_id is null and ref_label is not null)
    or (ref_type = 'customer' and order_id is null and product_id is null and ref_label is not null)
    or (ref_type = 'product' and order_id is null and customer_id is null and ref_label is not null)
  )
);

create index quick_notes_abertas on public.quick_notes (created_at desc) where done_at is null;
create index quick_notes_concluidas on public.quick_notes (done_at desc) where done_at is not null;

alter table public.quick_notes enable row level security;
revoke all on public.quick_notes from anon, authenticated;

comment on table public.quick_notes is
  'Bloco de notas rápido da equipe (topbar do painel). Acesso só pelas funções notas_rapidas*.';

-- Projeção de uma nota ------------------------------------------------------
create or replace function public.nota_rapida_json(n public.quick_notes)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select jsonb_build_object(
    'id', n.id,
    'texto', n.body,
    'criada_em', n.created_at,
    'autor', (select e.full_name from public.app_users au
                join public.employees e on e.id = au.employee_id where au.id = n.created_by),
    'minha', n.created_by = public.current_app_user_id(),
    'concluida_em', n.done_at,
    'concluida_por', (select e.full_name from public.app_users au
                        join public.employees e on e.id = au.employee_id where au.id = n.done_by),
    'referencia', case when n.ref_type is null then null else jsonb_build_object(
      'tipo', n.ref_type,
      'id', coalesce(n.order_id, n.customer_id, n.product_id),
      'rotulo', n.ref_label) end
  );
$function$;

revoke all on function public.nota_rapida_json(public.quick_notes) from public, anon, authenticated;

-- Listar --------------------------------------------------------------------
create or replace function public.notas_rapidas(p_concluidas boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if public.current_app_user_id() is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  return jsonb_build_object('ok', true, 'notas', coalesce((
    select jsonb_agg(public.nota_rapida_json(n)
                     order by case when p_concluidas then n.done_at else n.created_at end desc)
      from (select * from public.quick_notes q
             where (q.done_at is not null) = coalesce(p_concluidas, false)
             order by case when p_concluidas then q.done_at else q.created_at end desc
             limit 60) n
  ), '[]'::jsonb),
  'abertas', (select count(*) from public.quick_notes q where q.done_at is null));
end;
$function$;

-- Criar ---------------------------------------------------------------------
create or replace function public.criar_nota_rapida(
  p_texto text, p_ref_tipo text default null, p_ref_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_ator uuid := public.current_app_user_id();
  v_texto text := btrim(coalesce(p_texto, ''));
  v_rotulo text;
  v_nota public.quick_notes;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if length(v_texto) = 0 then
    return jsonb_build_object('ok', false, 'erro', 'Escreva a anotação.');
  end if;
  if length(v_texto) > 1000 then
    return jsonb_build_object('ok', false, 'erro', 'Anotação longa demais (máximo 1000 caracteres).');
  end if;

  if p_ref_tipo is not null then
    if p_ref_id is null then
      return jsonb_build_object('ok', false, 'erro', 'Referência inválida.');
    end if;
    if p_ref_tipo = 'order' then
      if not public.has_permission('orders.view') then
        return jsonb_build_object('ok', false, 'erro', 'Você não pode referenciar pedidos.');
      end if;
      select '#' || o.order_number || ' · ' || o.customer_name_snapshot into v_rotulo
        from public.orders o where o.id = p_ref_id;
    elsif p_ref_tipo = 'customer' then
      if not public.has_permission('customers.view') then
        return jsonb_build_object('ok', false, 'erro', 'Você não pode referenciar clientes.');
      end if;
      select c.name into v_rotulo from public.customers c where c.id = p_ref_id;
    elsif p_ref_tipo = 'product' then
      select p.name into v_rotulo from public.products p where p.id = p_ref_id;
    else
      return jsonb_build_object('ok', false, 'erro', 'Referência inválida.');
    end if;
    if v_rotulo is null then
      return jsonb_build_object('ok', false, 'erro', 'Não encontramos o item referenciado.');
    end if;
  end if;

  insert into public.quick_notes (body, ref_type, order_id, customer_id, product_id, ref_label, created_by)
  values (v_texto, p_ref_tipo,
          case when p_ref_tipo = 'order' then p_ref_id end,
          case when p_ref_tipo = 'customer' then p_ref_id end,
          case when p_ref_tipo = 'product' then p_ref_id end,
          v_rotulo, v_ator)
  returning * into v_nota;

  return jsonb_build_object('ok', true, 'nota', public.nota_rapida_json(v_nota));
end;
$function$;

-- Concluir / reabrir ----------------------------------------------------------
create or replace function public.concluir_nota_rapida(p_id uuid, p_concluida boolean default true)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_ator uuid := public.current_app_user_id();
  v_nota public.quick_notes;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  update public.quick_notes
     set done_at = case when p_concluida then now() end,
         done_by = case when p_concluida then v_ator end
   where id = p_id
  returning * into v_nota;
  if v_nota.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Anotação não encontrada.');
  end if;
  return jsonb_build_object('ok', true, 'nota', public.nota_rapida_json(v_nota));
end;
$function$;

-- Excluir: só quem escreveu --------------------------------------------------
create or replace function public.excluir_nota_rapida(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_ator uuid := public.current_app_user_id();
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  delete from public.quick_notes where id = p_id and created_by = v_ator;
  if not found then
    return jsonb_build_object('ok', false, 'erro', 'Só quem escreveu pode excluir a anotação.');
  end if;
  return jsonb_build_object('ok', true);
end;
$function$;

-- Buscar o que referenciar -----------------------------------------------------
create or replace function public.referencias_para_nota(p_termo text)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_termo text := btrim(coalesce(p_termo, ''));
  v_digitos text := regexp_replace(v_termo, '\D', '', 'g');
  v_resultado jsonb := '[]'::jsonb;
begin
  if public.current_app_user_id() is null or length(v_termo) = 0 then
    return '[]'::jsonb;
  end if;

  -- Pedido pelo número ("30" ou "#30").
  if public.has_permission('orders.view') and v_digitos <> '' and length(v_digitos) <= 9
     and v_termo ~ '^#?\s*\d+$' then
    v_resultado := v_resultado || coalesce((
      select jsonb_agg(jsonb_build_object('tipo', 'order', 'id', o.id,
               'rotulo', '#' || o.order_number || ' · ' || o.customer_name_snapshot))
        from public.orders o where o.order_number = v_digitos::bigint), '[]'::jsonb);
  end if;

  if length(v_termo) >= 2 then
    if public.has_permission('customers.view') then
      v_resultado := v_resultado || coalesce((
        select jsonb_agg(jsonb_build_object('tipo', 'customer', 'id', c.id,
                 'rotulo', c.name, 'detalhe', c.whatsapp_display))
          from (select * from public.customers c
                 where c.name ilike '%' || v_termo || '%'
                    or (length(v_digitos) >= 4 and c.whatsapp_normalized like '%' || v_digitos || '%')
                 order by c.updated_at desc limit 5) c), '[]'::jsonb);
    end if;

    v_resultado := v_resultado || coalesce((
      select jsonb_agg(jsonb_build_object('tipo', 'product', 'id', p.id, 'rotulo', p.name))
        from (select * from public.products p
               where p.is_active and p.name ilike '%' || v_termo || '%'
               order by p.name limit 5) p), '[]'::jsonb);
  end if;

  return v_resultado;
end;
$function$;

revoke all on function public.notas_rapidas(boolean) from public, anon;
revoke all on function public.criar_nota_rapida(text, text, uuid) from public, anon;
revoke all on function public.concluir_nota_rapida(uuid, boolean) from public, anon;
revoke all on function public.excluir_nota_rapida(uuid) from public, anon;
revoke all on function public.referencias_para_nota(text) from public, anon;
grant execute on function public.notas_rapidas(boolean) to authenticated;
grant execute on function public.criar_nota_rapida(text, text, uuid) to authenticated;
grant execute on function public.concluir_nota_rapida(uuid, boolean) to authenticated;
grant execute on function public.excluir_nota_rapida(uuid) to authenticated;
grant execute on function public.referencias_para_nota(text) to authenticated;
