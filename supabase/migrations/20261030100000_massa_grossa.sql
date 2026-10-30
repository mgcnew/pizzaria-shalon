-- 0181 — Massa grossa
-- D-2026-10-30-176 · RN-ADD-007
--
-- A massa grossa é uma opção paga da pizza, escolhida numa seção própria. O
-- cadastro aproveita `addons` e `addon_size_prices`, e o pedido aproveita o
-- caminho e o snapshot dos adicionais (`order_item_addons`). O que muda é que
-- ela NÃO é ingrediente:
--   · não conta no teto de adicionais nem nos ingredientes inclusos;
--   · é sempre cobrada pelo preço do tamanho;
--   · não depende do interruptor global de adicionais;
--   · só existe em pizza: nunca em fogazza.
--
-- Nasce SEM preço: até a loja cadastrar o valor em Produtos › Adicionais, ela
-- não é oferecida (a ausência de preço já quer dizer "não existe nesse tamanho").

alter table public.addons
  add column kind text not null default 'ingrediente';

-- O nome começar com "Massa" é o que permite às telas e à comanda reconhecê-la
-- pelo snapshot do pedido, que guarda só o nome.
alter table public.addons
  add constraint addons_kind check (kind in ('ingrediente', 'massa')),
  add constraint addons_massa_nome check (kind <> 'massa' or name ilike 'massa%');

comment on column public.addons.kind is
  'ingrediente: adicional comum. massa: opção de massa da pizza, fora do teto e dos inclusos (RN-ADD-007).';

insert into public.addons (name, kind, sort_order)
values ('Massa grossa', 'massa', 0)
on conflict (name) do update set kind = 'massa';

-- ------------------------------------------------ quando a massa é oferecida
create or replace function public.massa_permitida(
  p_product_id uuid, p_size_id uuid, p_addon_id uuid
) returns boolean language sql stable set search_path = ''
as $$
  select
    exists (
      select 1 from public.addons a
      where a.id = p_addon_id and a.kind = 'massa'
        and a.is_active and a.is_temporarily_available
    )
    and exists (
      select 1 from public.products p
      where p.id = p_product_id and p.product_type = 'pizza'
    )
    and exists (
      select 1
        from public.addon_size_prices asp
        join public.pizza_sizes s on s.id = asp.size_id
       where asp.addon_id = p_addon_id and asp.size_id = p_size_id
         and asp.is_active and s.sold_as = 'pizza'
    )
    -- A exceção por produto é a mesma dos adicionais (RN-ADD-006).
    and coalesce(
      (
        select r.is_allowed
        from public.product_addon_rules r
        where r.product_id = p_product_id
          and r.addon_id = p_addon_id
          and (r.size_id is null or r.size_id = p_size_id)
        order by (r.size_id is not null) desc
        limit 1
      ),
      true
    );
$$;
comment on function public.massa_permitida(uuid, uuid, uuid) is
  'RN-ADD-007: massa ativa, disponível, com preço no tamanho, em pizza e sem proibição no produto.';

create or replace function public.massas_publicas(p_product_id uuid, p_size_id uuid)
returns table (id uuid, nome text, preco numeric) language sql stable set search_path = ''
as $$
  select a.id, a.name, asp.price
  from public.addons a
  join public.addon_size_prices asp on asp.addon_id = a.id and asp.size_id = p_size_id
  where a.kind = 'massa' and public.massa_permitida(p_product_id, p_size_id, a.id)
  order by a.sort_order, a.name;
$$;

revoke all on function public.massa_permitida(uuid, uuid, uuid) from public;
revoke all on function public.massas_publicas(uuid, uuid) from public;
grant execute on function public.massa_permitida(uuid, uuid, uuid) to anon, authenticated;
grant execute on function public.massas_publicas(uuid, uuid) to anon, authenticated;

-- A lista de ingredientes deixa de trazer a massa.
create or replace function public.adicionais_publicos(p_product_id uuid, p_size_id uuid)
returns table (id uuid, nome text, preco numeric) language sql stable set search_path = ''
as $$
  select a.id, a.name, asp.price
  from public.addons a
  join public.addon_size_prices asp on asp.addon_id = a.id and asp.size_id = p_size_id
  where a.kind = 'ingrediente'
    and public.adicional_permitido(p_product_id, p_size_id, a.id)
  order by a.sort_order, a.name;
$$;

-- "Copiar preços" serve aos ingredientes da fogazza: a massa não vai junto.
create or replace function public.copiar_precos_adicionais(p_de uuid, p_para uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_copiados integer;
begin
  if not (select public.has_permission('catalog.manage')) then
    raise exception 'Você não tem permissão para alterar o catálogo.' using errcode = '42501';
  end if;

  if p_de is null or p_para is null or p_de = p_para then
    raise exception 'Escolha dois tamanhos diferentes.' using errcode = '23514';
  end if;
  if (select count(*) from public.pizza_sizes where id in (p_de, p_para)) <> 2 then
    raise exception 'Tamanho não encontrado.' using errcode = '23514';
  end if;

  insert into public.addon_size_prices (addon_id, size_id, price, is_active)
  select a.addon_id, p_para, a.price, a.is_active
    from public.addon_size_prices a
    join public.addons ad on ad.id = a.addon_id
   where a.size_id = p_de and ad.kind = 'ingrediente'
  on conflict (addon_id, size_id)
  do update set price = excluded.price, is_active = excluded.is_active, updated_at = now();
  get diagnostics v_copiados = row_count;

  perform public.log_audit(
    'adicionais_copiar_precos', 'pizza_sizes', p_para,
    jsonb_build_object('de', p_de), jsonb_build_object('copiados', v_copiados), null);

  return jsonb_build_object('ok', true, 'copiados', v_copiados);
end;
$$;

-- ---------------------------------------------------------------- montar_item
-- Patch no lugar, como nas migrations anteriores: a massa é tirada da lista de
-- adicionais antes das regras de teto e de inclusos, e somada depois. Se a
-- função não tiver os trechos esperados, nada é aplicado.
do $$
declare
  v_def text := pg_get_functiondef('public.montar_item(jsonb)'::regprocedure);
  v_novo text := v_def;
begin
  if v_def like '%v_massas%' then
    return;
  end if;

  if regexp_count(v_def, 'v_adicionais uuid\[\];') <> 1
     or regexp_count(v_def, 'if cardinality\(v_adicionais\) > 0 then') <> 1
     or regexp_count(v_def, 'v_qtd := coalesce\(\(p_item ->> ''quantidade''\)::integer, 1\);') <> 1
     or v_def not like '%v_produto.addons_included%' then
    raise exception 'montar_item mudou: o patch da massa grossa não encontrou os trechos esperados';
  end if;

  v_novo := replace(v_novo, 'v_adicionais uuid[];',
    'v_adicionais uuid[];
  v_massas uuid[];
  v_preco_massa numeric;
  v_nome_massa text;');

  v_novo := replace(v_novo, 'if cardinality(v_adicionais) > 0 then',
    'v_massas := array(select a.id from public.addons a
                      where a.id = any (v_adicionais) and a.kind = ''massa'');
  v_adicionais := array(select t.aid from unnest(v_adicionais) as t(aid)
                         where not (t.aid = any (v_massas)));

  if cardinality(v_adicionais) > 0 then');

  v_novo := replace(v_novo, 'v_qtd := coalesce((p_item ->> ''quantidade'')::integer, 1);',
    'if cardinality(v_massas) > 1 then
    return jsonb_build_object(''ok'', false, ''nome'', v_nome,
      ''erro'', ''Escolha só uma massa.'');
  end if;

  if cardinality(v_massas) = 1 then
    if v_size_id is null
       or not public.massa_permitida(v_produto.id, v_size_id, v_massas[1]) then
      return jsonb_build_object(''ok'', false, ''nome'', v_nome,
        ''erro'', ''A massa escolhida não está disponível para este item.'');
    end if;

    v_preco_massa := public.preco_adicional(v_massas[1], v_size_id);
    select a.name into v_nome_massa from public.addons a where a.id = v_massas[1];

    v_preco_adicionais := v_preco_adicionais + v_preco_massa;
    v_detalhe_adicionais := coalesce(v_detalhe_adicionais, ''[]''::jsonb)
      || jsonb_build_array(jsonb_build_object(
           ''id'', v_massas[1], ''nome'', v_nome_massa, ''preco'', v_preco_massa));
    v_rotulos := v_rotulos || v_nome_massa;
  end if;

  v_qtd := coalesce((p_item ->> ''quantidade'')::integer, 1);');

  execute v_novo;
end;
$$;
