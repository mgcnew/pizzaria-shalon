-- 0138 — a fogazza se monta no card
-- 04 RN-FOG-001, RN-FOG-003, RN-FOG-009 · D-2026-09-30-102
--
-- O ACHADO (no uso real do dev). Montar a fogazza por sabor exigia três
-- passos em três telas: criar o tamanho "vendido como fogazza", ligar o card
-- a uma categoria e, sabor por sabor, abrir cada pizza para dar o preço de
-- fogazza. No meio do caminho a tela aceitou dar ao card "Fogazza doce" o
-- tamanho Tradicional — de PIZZA —, e o card virou pizza: 8 fatias, meio a
-- meio, borda.
--
-- O QUE MUDA:
--
--   1. Produto do tipo fogazza não tem tamanho (RN-FOG-009). A fogazza comum
--      tem preço próprio; o card vende os sabores. Nenhum dos dois recebe
--      variação — o banco recusa, e produto com variação não vira fogazza.
--
--   2. `montar_fogazza(card, categoria, sabores)`: numa operação só, liga o
--      card à categoria de sabores, garante o tamanho de fogazza (cria
--      "Fogazza" se não houver nenhum) e grava quais sabores entram e por
--      quanto. O preço continua morando no próprio sabor — a variação dele no
--      tamanho de fogazza, como desde a 0134 —; aqui só muda de onde se edita.
--      Sabor que sai da fogazza tem a variação DESATIVADA, não apagada: ela
--      pode ter promoção, código de barras e histórico.
--
-- Não há dado a converter: no dev, o único card com tamanho de pizza é
-- corrigido à parte (item 3 da decisão); na produção não há produto.

-- ------------------------------------------------ 1. fogazza sem tamanho
create or replace function public.tg_variante_fogazza_coerente()
returns trigger language plpgsql set search_path = ''
as $$
begin
  -- RN-FOG-009: produto do tipo fogazza não tem tamanho nenhum.
  if exists (select 1 from public.products p
              where p.id = new.product_id and p.product_type = 'fogazza') then
    raise exception 'Fogazza não tem tamanho: a fogazza comum tem preço próprio, e o card vende os sabores.'
      using errcode = '23514';
  end if;

  if exists (select 1 from public.pizza_sizes s
              where s.id = new.size_id and s.sold_as = 'fogazza')
     and not exists (select 1 from public.products p
                      where p.id = new.product_id and p.product_type = 'pizza') then
    raise exception 'O tamanho de fogazza só pode ser habilitado em sabores de pizza.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.tg_produto_fogazza_coerente()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.flavor_size_id is not null and not exists (
       select 1 from public.pizza_sizes s
        where s.id = new.flavor_size_id and s.sold_as = 'fogazza') then
    raise exception 'O tamanho escolhido não é um tamanho de fogazza.'
      using errcode = '23514';
  end if;

  if new.product_type <> 'pizza' and exists (
       select 1 from public.product_variants pv
         join public.pizza_sizes s on s.id = pv.size_id
        where pv.product_id = new.id and s.sold_as = 'fogazza') then
    raise exception 'Este sabor tem preço de fogazza: ele precisa continuar sendo do tipo pizza.'
      using errcode = '23514';
  end if;

  -- RN-FOG-009: um produto com tamanhos não vira fogazza.
  if new.product_type = 'fogazza'
     and (tg_op = 'INSERT' or old.product_type is distinct from 'fogazza')
     and exists (select 1 from public.product_variants pv where pv.product_id = new.id) then
    raise exception 'Este produto tem tamanhos; fogazza não tem tamanho. Remova os tamanhos antes.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

-- ----------------------------------------------- 2. montar a fogazza
create or replace function public.montar_fogazza(
  p_card_id uuid,
  p_categoria_id uuid,
  p_sabores jsonb default '[]'::jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_card     record;
  v_tamanho  uuid;
  v_item     jsonb;
  v_sabor    uuid;
  v_preco    numeric(10,2);
  v_entram   integer := 0;
  v_saem     integer := 0;
  v_criou    boolean := false;
begin
  if not (select public.has_permission('catalog.manage')) then
    raise exception 'Você não tem permissão para alterar o catálogo.' using errcode = '42501';
  end if;

  select p.id, p.product_type, p.flavor_category_id, p.flavor_size_id
    into v_card
    from public.products p
   where p.id = p_card_id
   for update;

  if v_card.id is null then
    raise exception 'Produto não encontrado.' using errcode = '23514';
  end if;
  if v_card.product_type <> 'fogazza' then
    raise exception 'Só um produto do tipo fogazza monta sabores de fogazza.' using errcode = '23514';
  end if;

  -- Sem categoria: volta a ser fogazza comum, de preço próprio. Os preços de
  -- fogazza já gravados nos sabores não são tocados.
  if p_categoria_id is null then
    update public.products
       set flavor_category_id = null, flavor_size_id = null
     where id = p_card_id;
    perform public.log_audit('fogazza_montar', 'products', p_card_id,
      jsonb_build_object('categoria', v_card.flavor_category_id),
      jsonb_build_object('categoria', null), null);
    return jsonb_build_object('ok', true, 'fogazza_comum', true);
  end if;

  if not exists (select 1 from public.categories c where c.id = p_categoria_id) then
    raise exception 'Categoria não encontrada.' using errcode = '23514';
  end if;

  -- O tamanho: o do card, ou o único tamanho de fogazza ativo, ou um novo.
  v_tamanho := v_card.flavor_size_id;
  if v_tamanho is null then
    select s.id into v_tamanho
      from public.pizza_sizes s
     where s.sold_as = 'fogazza' and s.is_active
     order by s.sort_order, s.name
     limit 1;
  end if;
  if v_tamanho is null then
    if exists (select 1 from public.pizza_sizes s where lower(s.name) = 'fogazza') then
      raise exception 'Já existe um tamanho chamado "Fogazza" vendido como pizza. Renomeie-o ou marque-o como fogazza em Tamanhos.'
        using errcode = '23514';
    end if;
    insert into public.pizza_sizes (name, slice_count, max_flavors, sold_as, sort_order)
    values ('Fogazza', 1, 1, 'fogazza',
            coalesce((select max(sort_order) from public.pizza_sizes), 0) + 1)
    returning id into v_tamanho;
    v_criou := true;
  end if;

  update public.products
     set flavor_category_id = p_categoria_id, flavor_size_id = v_tamanho
   where id = p_card_id;

  -- Os sabores: [{ "produto_id": uuid, "preco": number | null }].
  -- Preço preenchido = entra, por esse preço. Nulo = sai.
  if jsonb_typeof(coalesce(p_sabores, '[]'::jsonb)) <> 'array' then
    raise exception 'Lista de sabores inválida.' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_sabores, '[]'::jsonb)) loop
    v_sabor := (v_item ->> 'produto_id')::uuid;

    if not exists (select 1 from public.products p
                    where p.id = v_sabor and p.product_type = 'pizza'
                      and p.category_id = p_categoria_id) then
      raise exception 'Um dos sabores não é pizza desta categoria.' using errcode = '23514';
    end if;

    if v_item -> 'preco' is null or jsonb_typeof(v_item -> 'preco') = 'null' then
      update public.product_variants
         set is_active = false
       where product_id = v_sabor and size_id = v_tamanho and is_active;
      if found then v_saem := v_saem + 1; end if;
    else
      v_preco := (v_item ->> 'preco')::numeric(10,2);
      if v_preco is null or v_preco <= 0 then
        raise exception 'Informe um preço maior que zero para cada sabor que entra.'
          using errcode = '23514';
      end if;
      insert into public.product_variants (product_id, size_id, price, is_active)
      values (v_sabor, v_tamanho, v_preco, true)
      on conflict (product_id, size_id)
      do update set price = excluded.price, is_active = true;
      v_entram := v_entram + 1;
    end if;
  end loop;

  perform public.log_audit('fogazza_montar', 'products', p_card_id,
    jsonb_build_object('categoria', v_card.flavor_category_id, 'tamanho', v_card.flavor_size_id),
    jsonb_build_object('categoria', p_categoria_id, 'tamanho', v_tamanho,
                       'tamanho_criado', v_criou, 'entram', v_entram, 'saem', v_saem),
    null);

  return jsonb_build_object('ok', true, 'tamanho_id', v_tamanho,
    'tamanho_criado', v_criou, 'entram', v_entram, 'saem', v_saem);
end;
$$;

comment on function public.montar_fogazza(uuid, uuid, jsonb) is
  'Monta o card de fogazza: categoria de sabores, tamanho de fogazza (cria se faltar) e quais sabores entram, com preço (RN-FOG-003). catalog.manage; auditada.';
revoke all on function public.montar_fogazza(uuid, uuid, jsonb) from public, anon;
grant execute on function public.montar_fogazza(uuid, uuid, jsonb) to authenticated;
