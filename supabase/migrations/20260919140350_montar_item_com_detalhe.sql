-- 0041 — montar_item passa a devolver o DETALHE estruturado
--
-- Por quê: os snapshots do pedido (02 §9.3 a §9.6) precisam de sabor,
-- porção, borda, adicional, promoção e preço de tabela — não só do total.
-- Recalcular isso dentro de `criar_pedido` criaria uma SEGUNDA verdade sobre
-- a mesma configuração (CLAUDE.md §17). Melhor a mesma função devolver tudo.
--
-- A `portion` sai daqui já pronta: 1,0 para pizza inteira e 0,5 por metade,
-- que é o que RN-PIZZA-006 e RN-POP-001 usam para ranquear sem ler texto.
create or replace function public.montar_item(p_item jsonb)
returns jsonb language plpgsql stable set search_path = ''
as $$
declare
  v_produto record;
  v_variacao_id uuid;
  v_size_id uuid;
  v_tamanho_nome text;
  v_categoria_nome text;
  v_sabores uuid[];
  v_borda_id uuid;
  v_borda_nome text;
  v_adicionais uuid[];
  v_qtd integer;
  v_preco_base numeric;
  v_preco_borda numeric := 0;
  v_preco_adicionais numeric := 0;
  v_rotulos text[] := '{}';
  v_nomes text;
  v_limite integer;
  v_max_adicionais integer;
  v_id uuid;
  v_nome text;
  v_variacao_governante uuid;
  v_preco_regular numeric;
  v_promocao_id uuid;
  v_promocao_nome text;
  v_tipo_item text;
  v_detalhe_sabores jsonb := '[]'::jsonb;
  v_detalhe_adicionais jsonb := '[]'::jsonb;
  v_detalhe_combo jsonb := '[]'::jsonb;
  v_porcao numeric;
begin
  begin
    select (p_item ->> 'produto_id')::uuid into v_id;
  exception when others then
    return jsonb_build_object('ok', false, 'erro', 'Produto não identificado.');
  end;

  select p.id, p.name, p.product_type, p.base_price, p.max_addons, p.slug, c.name as categoria
    into v_produto
    from public.products p
    join public.categories c on c.id = p.category_id
    where p.id = v_id;

  if v_produto.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Este item não está mais no cardápio.');
  end if;
  v_categoria_nome := v_produto.categoria;

  if not coalesce(public.produto_disponivel(v_produto.id), false) then
    return jsonb_build_object('ok', false, 'nome', v_produto.name,
      'erro', 'Indisponível no momento.');
  end if;

  v_sabores := coalesce(
    (select array_agg((x)::uuid) from jsonb_array_elements_text(
       coalesce(p_item -> 'sabores', '[]'::jsonb)) as t(x)),
    '{}');

  if (p_item ->> 'variacao_id') is not null then
    select pv.id, pv.size_id, s.name
      into v_variacao_id, v_size_id, v_tamanho_nome
      from public.product_variants pv
      join public.pizza_sizes s on s.id = pv.size_id
      where pv.id = (p_item ->> 'variacao_id')::uuid
        and pv.product_id = v_produto.id;

    if v_variacao_id is null then
      return jsonb_build_object('ok', false, 'nome', v_produto.name,
        'erro', 'Este tamanho não está mais disponível.');
    end if;

    if cardinality(v_sabores) = 0 then
      v_sabores := array[v_variacao_id];
    end if;

    if not (v_variacao_id = any (v_sabores)) then
      return jsonb_build_object('ok', false, 'nome', v_produto.name,
        'erro', 'O sabor principal precisa fazer parte da pizza.');
    end if;

    begin
      v_preco_base := public.preco_meio_a_meio(v_sabores);
    exception when others then
      return jsonb_build_object('ok', false, 'nome', v_produto.name,
        'erro', public.mensagem_ao_cliente(sqlerrm));
    end;

    select t.vid into v_variacao_governante
      from unnest(v_sabores) as t(vid)
      order by public.preco_efetivo_variante(t.vid) desc, t.vid
      limit 1;

    select string_agg(p.name, ' / ' order by p.name) into v_nomes
      from unnest(v_sabores) as t(vid)
      join public.product_variants pv on pv.id = t.vid
      join public.products p on p.id = pv.product_id;

    v_rotulos := v_rotulos || v_tamanho_nome;
    if cardinality(v_sabores) > 1 then
      v_rotulos := v_rotulos || ('Meio a meio: ' || v_nomes);
    end if;
    v_nome := v_nomes;
    v_tipo_item := 'pizza';

    -- RN-PIZZA-006: inteira vale 1; cada metade vale a fração igual.
    v_porcao := round(1.0 / cardinality(v_sabores), 4);

    select jsonb_agg(jsonb_build_object(
             'variacao_id', pv.id,
             'produto_id', p.id,
             'nome', p.name,
             'preco_efetivo', public.preco_efetivo_variante(pv.id),
             'porcao', v_porcao,
             'ordem', row_number() over (order by p.name)
           ) order by p.name)
      into v_detalhe_sabores
      from unnest(v_sabores) as t(vid)
      join public.product_variants pv on pv.id = t.vid
      join public.products p on p.id = pv.product_id;

    -- Preço de tabela do sabor que mandou no preço: permite dizer depois
    -- quanto a promoção reduziu, sem depender de ela ainda existir.
    select pv.price into v_preco_regular
      from public.product_variants pv where pv.id = v_variacao_governante;

    select pr.id, pr.name into v_promocao_id, v_promocao_nome
      from public.promotions pr
      where pr.variant_id = v_variacao_governante
        and pr.is_active and pr.starts_at <= now()
        and (pr.ends_at is null or pr.ends_at > now())
      limit 1;
  else
    if exists (select 1 from public.product_variants pv
                where pv.product_id = v_produto.id and pv.is_active) then
      return jsonb_build_object('ok', false, 'nome', v_produto.name,
        'erro', 'Escolha um tamanho.');
    end if;
    if cardinality(v_sabores) > 0 then
      return jsonb_build_object('ok', false, 'nome', v_produto.name,
        'erro', 'Este produto não tem sabores para escolher.');
    end if;

    v_preco_base := public.preco_efetivo_produto(v_produto.id);
    if v_preco_base is null then
      return jsonb_build_object('ok', false, 'nome', v_produto.name,
        'erro', 'Este item está sem preço no momento.');
    end if;
    v_nome := v_produto.name;
    v_tipo_item := case when v_produto.product_type = 'combo' then 'combo' else 'product' end;
    v_preco_regular := v_produto.base_price;

    select pr.id, pr.name into v_promocao_id, v_promocao_nome
      from public.promotions pr
      where pr.product_id = v_produto.id
        and pr.is_active and pr.starts_at <= now()
        and (pr.ends_at is null or pr.ends_at > now())
      limit 1;

    -- RN-COMBO-002: a composição EXATA do que está sendo vendido, para o
    -- snapshot de produção. O preço continua sendo o do combo.
    if v_produto.product_type = 'combo' then
      select jsonb_agg(jsonb_build_object(
               'produto_id', cc.component_product_id,
               'variacao_id', cc.component_variant_id,
               'nome', cp.name,
               'tamanho_nome', s.name,
               'quantidade', cc.quantity,
               'ordem', cc.sort_order
             ) order by cc.sort_order)
        into v_detalhe_combo
        from public.combo_components cc
        join public.products cp on cp.id = cc.component_product_id
        left join public.product_variants cv on cv.id = cc.component_variant_id
        left join public.pizza_sizes s on s.id = cv.size_id
        where cc.combo_product_id = v_produto.id;
    end if;
  end if;

  v_borda_id := nullif(p_item ->> 'borda_id', '')::uuid;
  if v_borda_id is not null then
    if v_variacao_id is null then
      return jsonb_build_object('ok', false, 'nome', v_nome,
        'erro', 'Borda só existe em pizza com tamanho.');
    end if;
    if not public.borda_permitida(v_produto.id, v_size_id, v_borda_id) then
      return jsonb_build_object('ok', false, 'nome', v_nome,
        'erro', 'Esta borda não está disponível para o tamanho escolhido.');
    end if;
    v_preco_borda := coalesce(public.preco_borda(v_borda_id, v_size_id), 0);
    select c.name into v_borda_nome from public.crusts c where c.id = v_borda_id;
    v_rotulos := v_rotulos || ('Borda: ' || v_borda_nome);
  end if;

  v_adicionais := coalesce(
    (select array_agg(distinct (x)::uuid) from jsonb_array_elements_text(
       coalesce(p_item -> 'adicionais', '[]'::jsonb)) as t(x)),
    '{}');

  if cardinality(v_adicionais) > 0 then
    if v_variacao_id is null then
      return jsonb_build_object('ok', false, 'nome', v_nome,
        'erro', 'Adicionais dependem do tamanho escolhido.');
    end if;

    v_max_adicionais := v_produto.max_addons;
    if v_max_adicionais is not null and cardinality(v_adicionais) > v_max_adicionais then
      return jsonb_build_object('ok', false, 'nome', v_nome,
        'erro', format('Escolha no máximo %s adicionais.', v_max_adicionais));
    end if;

    if exists (
      select 1 from unnest(v_adicionais) as t(aid)
      where not public.adicional_permitido(v_produto.id, v_size_id, t.aid)
    ) then
      return jsonb_build_object('ok', false, 'nome', v_nome,
        'erro', 'Um dos adicionais não está disponível para este item.');
    end if;

    select coalesce(sum(public.preco_adicional(t.aid, v_size_id)), 0)
      into v_preco_adicionais
      from unnest(v_adicionais) as t(aid);

    select jsonb_agg(jsonb_build_object(
             'id', a.id, 'nome', a.name,
             'preco', public.preco_adicional(a.id, v_size_id)
           ) order by a.name)
      into v_detalhe_adicionais
      from public.addons a where a.id = any (v_adicionais);

    v_rotulos := v_rotulos || ('Adicionais: ' || (
      select string_agg(a.name, ', ' order by a.name)
      from public.addons a where a.id = any (v_adicionais)));
  end if;

  v_qtd := coalesce((p_item ->> 'quantidade')::integer, 1);
  if v_qtd < 1 then
    return jsonb_build_object('ok', false, 'nome', v_nome, 'erro', 'Quantidade inválida.');
  end if;

  v_limite := public.limite_do_item(v_produto.id, v_variacao_governante);
  if v_limite is not null and v_qtd > v_limite then
    return jsonb_build_object('ok', false, 'nome', v_nome,
      'erro', format('Limite de %s por pedido para este item.', v_limite), 'limite', v_limite);
  end if;

  if length(coalesce(p_item ->> 'observacao', '')) > 300 then
    return jsonb_build_object('ok', false, 'nome', v_nome,
      'erro', 'A observação passou de 300 caracteres.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'nome', v_nome,
    'produto_nome', v_produto.name,
    'rotulos', to_jsonb(v_rotulos),
    'preco_base', v_preco_base,
    'preco_borda', v_preco_borda,
    'preco_adicionais', v_preco_adicionais,
    'preco_unitario', v_preco_base + v_preco_borda + v_preco_adicionais,
    'quantidade', v_qtd,
    'total', (v_preco_base + v_preco_borda + v_preco_adicionais) * v_qtd,
    'limite', v_limite,
    'em_promocao', v_promocao_id is not null,
    'detalhe', jsonb_build_object(
      'item_type', v_tipo_item,
      'produto_id', v_produto.id,
      'produto_nome', v_produto.name,
      'categoria_nome', v_categoria_nome,
      'tamanho_id', v_size_id,
      'tamanho_nome', v_tamanho_nome,
      'borda_id', v_borda_id,
      'borda_nome', v_borda_nome,
      'borda_preco', v_preco_borda,
      'sabores', coalesce(v_detalhe_sabores, '[]'::jsonb),
      'adicionais', coalesce(v_detalhe_adicionais, '[]'::jsonb),
      'combo', coalesce(v_detalhe_combo, '[]'::jsonb),
      'promocao_id', v_promocao_id,
      'promocao_nome', v_promocao_nome,
      'preco_regular', v_preco_regular
    )
  );
end;
$$;

comment on function public.montar_item is 'Valida, precifica e descreve uma configuração. Recebe escolhas, nunca preço (CLAUDE.md §16).';
