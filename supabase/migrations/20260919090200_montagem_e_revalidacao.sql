-- 0032 — Montagem de item e revalidação do carrinho
-- 02-MODELO-DADOS-SUPABASE.md §19 · 01-DOCUMENTO-MESTRE.md §79.9
-- 04-REGRAS-NEGOCIO.md RN-VALID-001 a 005, RN-CART-004/005, RN-PROMO-006/007
-- CLAUDE.md §16 · 03-RLS-RBAC-SEGURANCA.md §8.2 e §25
--
-- AQUI MORA A AUTORIDADE COMERCIAL DA EXPERIÊNCIA PÚBLICA.
--
-- `montar_item` recebe IDs e escolhas — NUNCA preço — e devolve o preço
-- calculado agora. A mesma função serve para a prévia enquanto o cliente
-- monta a pizza e para a linha que entra no carrinho, então não existe uma
-- segunda fórmula em React (CLAUDE.md §17).
--
-- `revalidar_carrinho` reexecuta tudo e compara com o que o navegador
-- mostrava. Diferença comercial vira RECONFIRMAÇÃO, não mudança silenciosa
-- (79.9).
--
-- Escopo da Fase 4: item, preço e disponibilidade. Endereço, taxa de
-- entrega, pagamento e criação de pedido são da Fase 5 e não estão aqui.

-- Limite aplicável de quantidade (RN-PROMO-006): o mais restritivo entre o
-- limite do produto e o da promoção que efetivamente determinou o preço
-- (RN-PROMO-007 — promoção que não influenciou o preço não consome limite).
create or replace function public.limite_do_item(
  p_product_id uuid, p_variant_id uuid default null
) returns integer language sql stable set search_path = ''
as $$
  select least(
    (select p.max_quantity_per_order from public.products p where p.id = p_product_id),
    (
      select pr.max_quantity_per_order
      from public.promotions pr
      where pr.is_active and pr.starts_at <= now()
        and (pr.ends_at is null or pr.ends_at > now())
        and (
          (p_variant_id is not null and pr.variant_id = p_variant_id)
          or (p_variant_id is null and pr.product_id = p_product_id)
        )
      limit 1
    )
  );
$$;

comment on function public.limite_do_item is 'RN-PROMO-006: entre limite do produto e da promoção, vale o mais restritivo.';

-- Monta e precifica UMA configuração.
--
-- Entrada:
--   { produto_id, variacao_id?, sabores?[], borda_id?, adicionais?[],
--     observacao?, quantidade? }
--
-- Saída: objeto com ok/erro, preço unitário e os rótulos que a interface
-- exibe. A interface não recalcula nada disso.
create or replace function public.montar_item(p_item jsonb)
returns jsonb language plpgsql stable set search_path = ''
as $$
declare
  v_produto record;
  v_variacao record;
  v_sabores uuid[];
  v_borda_id uuid;
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
begin
  -- ------------------------------------------------ produto
  begin
    select (p_item ->> 'produto_id')::uuid into v_id;
  exception when others then
    return jsonb_build_object('ok', false, 'erro', 'Produto não identificado.');
  end;

  select p.id, p.name, p.product_type, p.base_price, p.max_addons, p.slug
    into v_produto
    from public.products p
    where p.id = v_id;

  -- Sem linha: produto inativo, inexistente, ou em categoria inativa. Para
  -- o cliente, os três casos são o mesmo: não existe.
  if v_produto.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Este item não está mais no cardápio.');
  end if;

  if not coalesce(public.produto_disponivel(v_produto.id), false) then
    return jsonb_build_object(
      'ok', false, 'nome', v_produto.name,
      'erro', 'Indisponível no momento.');
  end if;

  -- ------------------------------------------------ tamanho e sabores
  v_sabores := coalesce(
    (select array_agg((x)::uuid) from jsonb_array_elements_text(
       coalesce(p_item -> 'sabores', '[]'::jsonb)) as t(x)),
    '{}');

  if (p_item ->> 'variacao_id') is not null then
    select pv.id, pv.size_id, s.max_flavors, s.name
      into v_variacao
      from public.product_variants pv
      join public.pizza_sizes s on s.id = pv.size_id
      where pv.id = (p_item ->> 'variacao_id')::uuid
        and pv.product_id = v_produto.id;

    if v_variacao.id is null then
      return jsonb_build_object('ok', false, 'nome', v_produto.name,
        'erro', 'Tamanho inválido para este produto.');
    end if;

    -- A variação escolhida é sempre um dos sabores. Sem sabores informados,
    -- é pizza inteira do próprio produto.
    if cardinality(v_sabores) = 0 then
      v_sabores := array[v_variacao.id];
    end if;

    if not (v_variacao.id = any (v_sabores)) then
      return jsonb_build_object('ok', false, 'nome', v_produto.name,
        'erro', 'O sabor principal precisa fazer parte da pizza.');
    end if;

    -- RN-PIZZA-004/005: a função de domínio valida mesmo tamanho, máximo de
    -- sabores e disponibilidade, e devolve o MAIOR preço efetivo. Qualquer
    -- violação vira exceção, nunca um preço aproximado.
    begin
      v_preco_base := public.preco_meio_a_meio(v_sabores);
    exception when others then
      return jsonb_build_object('ok', false, 'nome', v_produto.name,
        'erro', sqlerrm);
    end;

    -- Qual variação determinou o preço — é o limite dela que vale
    -- (RN-PROMO-007).
    select t.vid into v_variacao_governante
      from unnest(v_sabores) as t(vid)
      order by public.preco_efetivo_variante(t.vid) desc, t.vid
      limit 1;

    select string_agg(p.name, ' / ' order by p.name) into v_nomes
      from unnest(v_sabores) as t(vid)
      join public.product_variants pv on pv.id = t.vid
      join public.products p on p.id = pv.product_id;

    v_rotulos := v_rotulos || v_variacao.name;
    if cardinality(v_sabores) > 1 then
      v_rotulos := v_rotulos || ('Meio a meio: ' || v_nomes);
    end if;
    v_nome := v_nomes;
  else
    -- Produto com tamanho exige tamanho escolhido.
    if exists (select 1 from public.product_variants pv
                where pv.product_id = v_produto.id and pv.is_active) then
      return jsonb_build_object('ok', false, 'nome', v_produto.name,
        'erro', 'Escolha um tamanho.');
    end if;
    if cardinality(v_sabores) > 0 then
      return jsonb_build_object('ok', false, 'nome', v_produto.name,
        'erro', 'Este produto não tem sabores para escolher.');
    end if;

    -- RN-FOG-001 e RN-BEB-001: produto simples usa o próprio preço.
    -- RN-COMBO-006: o combo também — nunca a soma dos componentes.
    v_preco_base := public.preco_efetivo_produto(v_produto.id);
    if v_preco_base is null then
      return jsonb_build_object('ok', false, 'nome', v_produto.name,
        'erro', 'Este item está sem preço no momento.');
    end if;
    v_nome := v_produto.name;
  end if;

  -- ------------------------------------------------ borda
  v_borda_id := nullif(p_item ->> 'borda_id', '')::uuid;
  if v_borda_id is not null then
    if v_variacao.id is null then
      return jsonb_build_object('ok', false, 'nome', v_nome,
        'erro', 'Borda só existe em pizza com tamanho.');
    end if;
    -- RN-BORDA-001/002/003: no máximo uma, compatível com o tamanho e não
    -- excluída para este produto.
    if not public.borda_permitida(v_produto.id, v_variacao.size_id, v_borda_id) then
      return jsonb_build_object('ok', false, 'nome', v_nome,
        'erro', 'Esta borda não está disponível para o tamanho escolhido.');
    end if;
    v_preco_borda := coalesce(public.preco_borda(v_borda_id, v_variacao.size_id), 0);
    v_rotulos := v_rotulos || ('Borda: ' ||
      (select c.name from public.crusts c where c.id = v_borda_id));
  end if;

  -- ------------------------------------------------ adicionais
  v_adicionais := coalesce(
    (select array_agg(distinct (x)::uuid) from jsonb_array_elements_text(
       coalesce(p_item -> 'adicionais', '[]'::jsonb)) as t(x)),
    '{}');

  if cardinality(v_adicionais) > 0 then
    if v_variacao.id is null then
      return jsonb_build_object('ok', false, 'nome', v_nome,
        'erro', 'Adicionais dependem do tamanho escolhido.');
    end if;

    -- RN-ADD-004: limite por produto, quando existir.
    v_max_adicionais := v_produto.max_addons;
    if v_max_adicionais is not null and cardinality(v_adicionais) > v_max_adicionais then
      return jsonb_build_object('ok', false, 'nome', v_nome,
        'erro', format('Escolha no máximo %s adicionais.', v_max_adicionais));
    end if;

    -- RN-ADD-001/002/006 e RN-ADD-005: valem para a pizza inteira.
    if exists (
      select 1 from unnest(v_adicionais) as t(aid)
      where not public.adicional_permitido(v_produto.id, v_variacao.size_id, t.aid)
    ) then
      return jsonb_build_object('ok', false, 'nome', v_nome,
        'erro', 'Um dos adicionais não está disponível para este item.');
    end if;

    select coalesce(sum(public.preco_adicional(t.aid, v_variacao.size_id)), 0)
      into v_preco_adicionais
      from unnest(v_adicionais) as t(aid);

    v_rotulos := v_rotulos || ('Adicionais: ' || (
      select string_agg(a.name, ', ' order by a.name)
      from public.addons a where a.id = any (v_adicionais)));
  end if;

  -- ------------------------------------------------ quantidade
  v_qtd := coalesce((p_item ->> 'quantidade')::integer, 1);
  if v_qtd < 1 then
    return jsonb_build_object('ok', false, 'nome', v_nome,
      'erro', 'Quantidade inválida.');
  end if;

  v_limite := public.limite_do_item(v_produto.id, v_variacao_governante);
  if v_limite is not null and v_qtd > v_limite then
    return jsonb_build_object('ok', false, 'nome', v_nome,
      'erro', format('Limite de %s por pedido para este item.', v_limite),
      'limite', v_limite);
  end if;

  -- RN-OBS-001: observação é texto livre do item; não existe ficha técnica.
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
    'em_promocao', v_preco_base < coalesce(
      (select pv.price from public.product_variants pv where pv.id = v_variacao_governante),
      (select p.base_price from public.products p where p.id = v_produto.id),
      v_preco_base)
  );
end;
$$;

comment on function public.montar_item is 'Valida e precifica uma configuração. Recebe escolhas, nunca preço (CLAUDE.md §16).';

-- Revalida o carrinho inteiro.
--
-- 79.9: "Mudanças de preço enquanto o carrinho está aberto nunca são
-- silenciosas: mostrar valor anterior → atual e exigir aceite."
create or replace function public.revalidar_carrinho(p_itens jsonb)
returns jsonb language plpgsql stable set search_path = ''
as $$
declare
  v_item jsonb;
  v_res jsonb;
  v_saida jsonb := '[]'::jsonb;
  v_subtotal numeric := 0;
  v_reconfirmar boolean := false;
  v_motivos text[] := '{}';
  v_visto numeric;
  v_atual numeric;
  v_mudou boolean;
  v_n integer;
begin
  if jsonb_typeof(p_itens) <> 'array' then
    return jsonb_build_object('ok', false, 'erro', 'Carrinho inválido.');
  end if;

  v_n := jsonb_array_length(p_itens);
  -- 03 §25: validação de tamanho de payload. Carrinho de pizzaria não tem
  -- 100 linhas; o limite existe contra abuso, não contra o cliente.
  if v_n > 60 then
    return jsonb_build_object('ok', false, 'erro', 'Carrinho grande demais.');
  end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_res := public.montar_item(v_item);

    v_visto := nullif(v_item ->> 'preco_unitario_visto', '')::numeric;
    v_atual := nullif(v_res ->> 'preco_unitario', '')::numeric;
    v_mudou := (v_res ->> 'ok')::boolean
               and v_visto is not null
               and v_atual is not null
               and v_visto <> v_atual;

    if (v_res ->> 'ok')::boolean then
      v_subtotal := v_subtotal + coalesce((v_res ->> 'total')::numeric, 0);
      if v_mudou then
        v_reconfirmar := true;
        if not ('preco_alterado' = any (v_motivos)) then
          v_motivos := v_motivos || 'preco_alterado';
        end if;
      end if;
    else
      v_reconfirmar := true;
      if not ('item_invalido' = any (v_motivos)) then
        v_motivos := v_motivos || 'item_invalido';
      end if;
    end if;

    v_saida := v_saida || jsonb_build_array(
      v_res
      || jsonb_build_object(
        'linha', v_item ->> 'linha',
        'preco_visto', v_visto,
        'mudou_preco', coalesce(v_mudou, false)
      )
    );
  end loop;

  return jsonb_build_object(
    'ok', true,
    -- RN-CART-003 e RN-LOJA-002/003: loja fechada NÃO apaga o carrinho nem
    -- esconde o cardápio; ela bloqueia seguir adiante.
    'loja_aberta', coalesce(public.loja_aberta(), false),
    'itens', v_saida,
    'subtotal', v_subtotal,
    'exige_reconfirmacao', v_reconfirmar,
    'motivos', to_jsonb(v_motivos)
  );
end;
$$;

comment on function public.revalidar_carrinho is '79.9: diferença comercial vira reconfirmação, nunca alteração silenciosa.';

revoke all on function public.limite_do_item(uuid, uuid) from public;
revoke all on function public.montar_item(jsonb) from public;
revoke all on function public.revalidar_carrinho(jsonb) from public;

grant execute on function public.limite_do_item(uuid, uuid) to anon, authenticated;
grant execute on function public.montar_item(jsonb) to anon, authenticated;
grant execute on function public.revalidar_carrinho(jsonb) to anon, authenticated;
