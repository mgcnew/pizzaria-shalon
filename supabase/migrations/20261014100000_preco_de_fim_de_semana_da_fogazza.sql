-- 0148 — Preço de fim de semana da fogazza por sabor
-- D-2026-10-14-119 · 04-REGRAS-NEGOCIO.md RN-FOG-010 (nova), RN-FOG-002,
-- RN-PIZZA-005 · CLAUDE.md §16
--
-- A REGRA, decidida pela dona em 14/10/2026:
--   · cada sabor pode ter, além do preço de fogazza, um PREÇO DE FIM DE
--     SEMANA, opcional. Em branco = o mesmo preço todos os dias;
--   · fim de semana é SEXTA, SÁBADO E DOMINGO;
--   · vale o RELÓGIO, no fuso da loja: pedido às 00:30 de segunda é preço de
--     semana; às 00:30 de sexta já é de fim de semana. Não segue o turno;
--   · só a fogazza POR SABOR (variação num tamanho vendido como fogazza). A
--     fogazza comum, de preço próprio, não muda;
--   · promoção vigente continua valendo por cima de qualquer preço, como
--     sempre (RN-PIZZA-005).
--
-- ONDE ENTRA. O preço cobrado sai de `preco_efetivo_variante`, chamado por
-- `montar_item` (a autoridade do preço, CLAUDE.md §16): basta ela saber do
-- fim de semana. As demais funções lêem `price` direto só para mostrar "de
-- R$ X" e marcar promoção — passam a ler `preco_regular_variante`, para a
-- vitrine não chamar de promoção o preço de semana num sábado.
--
-- Essas funções são REDEFINIDAS a partir da última versão de cada uma no
-- repositório, com só as linhas de preço trocadas (comentário em cada uma).

-- --------------------------------------------------------------- coluna
alter table public.product_variants
  add column weekend_price numeric(10,2),
  add constraint product_variants_weekend_price_positivo check (weekend_price is null or weekend_price > 0);

comment on column public.product_variants.weekend_price is
  'D-2026-10-14-119: preço de sexta, sábado e domingo (relógio da loja). Só em tamanho vendido como fogazza. Nulo = mesmo preço todo dia.';

-- Só a fogazza por sabor tem preço de fim de semana. Um CHECK não enxerga o
-- tamanho, por isso o gatilho.
create or replace function public.validar_preco_de_fim_de_semana()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.weekend_price is not null and not exists (
    select 1 from public.pizza_sizes s where s.id = new.size_id and s.sold_as = 'fogazza'
  ) then
    raise exception 'Preço de fim de semana só existe na fogazza por sabor.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger product_variants_preco_de_fim_de_semana
  before insert or update of weekend_price, size_id on public.product_variants
  for each row execute function public.validar_preco_de_fim_de_semana();

-- ----------------------------------------------------------- é fim de semana?
-- Sexta (5), sábado (6) ou domingo (7) no fuso da loja. SECURITY DEFINER só
-- para ler o fuso: o visitante não lê `store_settings`, e devolve apenas um
-- booleano.
create or replace function public.e_fim_de_semana(p_em timestamptz default now())
returns boolean language sql stable security definer set search_path = ''
as $$
  select extract(isodow from p_em at time zone coalesce(
           (select s.timezone from public.store_settings s limit 1),
           'America/Sao_Paulo')) in (5, 6, 7);
$$;

revoke all on function public.e_fim_de_semana(timestamptz) from public;
grant execute on function public.e_fim_de_semana(timestamptz) to anon, authenticated;

comment on function public.e_fim_de_semana is
  'D-2026-10-14-119: sexta, sábado ou domingo pelo relógio, no fuso da loja.';

-- -------------------------------------------------------- preço regular
-- O preço de tabela do momento, sem promoção: o de fim de semana quando
-- existe e é sexta/sábado/domingo; senão, o preço normal.
create or replace function public.preco_regular_variante(
  p_variant_id uuid, p_em timestamptz default now()
) returns numeric language sql stable set search_path = ''
as $$
  select case
           when pv.weekend_price is not null and public.e_fim_de_semana(p_em) then pv.weekend_price
           else pv.price
         end
    from public.product_variants pv
   where pv.id = p_variant_id;
$$;

revoke all on function public.preco_regular_variante(uuid, timestamptz) from public;
grant execute on function public.preco_regular_variante(uuid, timestamptz) to anon, authenticated;

comment on function public.preco_regular_variante is
  'D-2026-10-14-119: preço de tabela do momento (fim de semana quando houver), sem promoção.';

-- -------------------------------------------------------- preço efetivo
-- Mesma regra de sempre (RN-PIZZA-005): promoção vigente, senão o preço de
-- tabela — agora o do momento.
create or replace function public.preco_efetivo_variante(
  p_variant_id uuid, p_em timestamptz default now()
) returns numeric language sql stable set search_path = ''
as $$
  select coalesce(
    (
      select pr.promotional_price
      from public.promotions pr
      where pr.variant_id = p_variant_id
        and pr.is_active
        and pr.starts_at <= p_em
        and (pr.ends_at is null or pr.ends_at > p_em)
      order by pr.starts_at desc
      limit 1
    ),
    public.preco_regular_variante(p_variant_id, p_em)
  );
$$;
comment on function public.preco_efetivo_variante is
  'RN-PIZZA-005: promocional válido quando existir; senão o preço de tabela do momento (fim de semana, D-2026-10-14-119).';

-- montar_fogazza: última versão em 20260930120000_fogazza_montada_no_card.sql, agora com o preço de fim de semana.
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
  v_preco_fds numeric(10,2);
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

  -- Os sabores: [{ "produto_id": uuid, "preco": number | null,
  --               "preco_fim_de_semana": number | null }].
  -- Preço preenchido = entra, por esse preço. Nulo = sai. Preço de fim de
  -- semana (D-2026-10-14-119) é opcional: vazio = o mesmo preço todo dia.
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
      v_preco_fds := nullif(v_item ->> 'preco_fim_de_semana', '')::numeric(10,2);
      if v_preco_fds is not null and v_preco_fds <= 0 then
        raise exception 'O preço de fim de semana precisa ser maior que zero (ou fica em branco).'
          using errcode = '23514';
      end if;
      insert into public.product_variants (product_id, size_id, price, weekend_price, is_active)
      values (v_sabor, v_tamanho, v_preco, v_preco_fds, true)
      on conflict (product_id, size_id)
      do update set price = excluded.price, weekend_price = excluded.weekend_price, is_active = true;
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

-- sabores_da_fogazza: última versão em 20260929160000_fogazza_vitrine.sql, só com as linhas de preço trocadas.
create or replace function public.sabores_da_fogazza(p_card_id uuid)
returns table (
  variacao_id uuid, produto_id uuid, nome text, slug text, descricao text,
  preco_de numeric, preco numeric, em_promocao boolean, disponivel boolean,
  imagem_path text, tamanho_id uuid, tamanho_nome text, fatias integer
)
language sql stable set search_path = ''
as $$
  select
    pv.id, p.id, p.name, p.slug, p.short_description,
    public.preco_regular_variante(pv.id),
    public.preco_efetivo_variante(pv.id),
    public.preco_efetivo_variante(pv.id) < public.preco_regular_variante(pv.id),
    coalesce(public.variante_disponivel(pv.id), false),
    public.caminho_publico_da_midia(p.image_asset_id),
    s.id, s.name, s.slice_count
  from public.products card
  join public.pizza_sizes s
    on s.id = card.flavor_size_id and s.sold_as = 'fogazza' and s.is_active
  join public.product_variants pv
    on pv.size_id = s.id and pv.is_active
  join public.products p
    on p.id = pv.product_id
   and p.category_id = card.flavor_category_id
   and p.product_type = 'pizza'
   -- Explícito: o painel enxerga produto inativo pelo RLS, e a lista do
   -- balcão tem de ser a mesma do cliente.
   and p.is_active
  where card.id = p_card_id
  order by p.sort_order, p.name;
$$;

-- tamanhos_publicos: última versão em 20260930140000_inativo_fora_do_cardapio.sql, só com as linhas de preço trocadas.
create or replace function public.tamanhos_publicos(p_product_id uuid)
returns table (
  variacao_id uuid, tamanho_id uuid, tamanho_nome text, fatias integer, max_sabores integer,
  preco_de numeric, preco numeric, em_promocao boolean, disponivel boolean
)
language sql stable set search_path = ''
as $$
  select
    pv.id, s.id, s.name, s.slice_count, s.max_flavors,
    public.preco_regular_variante(pv.id),
    public.preco_efetivo_variante(pv.id),
    public.preco_efetivo_variante(pv.id) < public.preco_regular_variante(pv.id),
    coalesce(public.variante_disponivel(pv.id), false)
  from public.product_variants pv
  join public.pizza_sizes s on s.id = pv.size_id
  where pv.product_id = p_product_id
    -- A página da pizza não oferece o tamanho de fogazza (RN-FOG-002).
    and s.sold_as = 'pizza'
    -- Tamanho inativo não é oferta, nem para a equipe logada (0139).
    and pv.is_active
  order by s.sort_order, s.name;
$$;

-- montar_item: última versão em 20260929170000_fogazza_em_preco_unico.sql, só com as linhas de preço trocadas.
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

    -- A ordem é calculada em subconsulta ANTES do agregado: `row_number()`
    -- é função de janela e o Postgres não aceita janela dentro de
    -- `jsonb_agg` (42P20). Isto quebrava toda pizza, não só meio a meio.
    select jsonb_agg(jsonb_build_object(
             'variacao_id', s.variacao_id, 'produto_id', s.produto_id,
             'nome', s.nome, 'preco_efetivo', s.preco_efetivo,
             'porcao', v_porcao, 'ordem', s.ordem) order by s.ordem)
      into v_detalhe_sabores
      from (
        select pv.id as variacao_id, p.id as produto_id, p.name as nome,
               public.preco_efetivo_variante(pv.id) as preco_efetivo,
               (row_number() over (order by p.name))::integer as ordem
        from unnest(v_sabores) as t(vid)
        join public.product_variants pv on pv.id = t.vid
        join public.products p on p.id = pv.product_id
      ) s;

    -- Preço de tabela do sabor que mandou no preço: permite dizer depois
    -- quanto a promoção reduziu, sem depender de ela ainda existir.
    select public.preco_regular_variante(pv.id) into v_preco_regular
      from public.product_variants pv where pv.id = v_variacao_governante;

    select pr.id, pr.name into v_promocao_id, v_promocao_nome
      from public.promotions pr
      where pr.variant_id = v_variacao_governante
        and pr.is_active and pr.starts_at <= now()
        and (pr.ends_at is null or pr.ends_at > now())
      limit 1;
  else
    -- Só tamanho de PIZZA obriga a escolher tamanho. A variação de fogazza
    -- não transforma a pizza de preço único em pizza com tamanhos (0136).
    if exists (select 1 from public.product_variants pv
                 join public.pizza_sizes s on s.id = pv.size_id
                where pv.product_id = v_produto.id and pv.is_active
                  and s.sold_as = 'pizza') then
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

-- buscar_catalogo_pdv: última versão em 20260926120000_resolucao_e_busca_pdv.sql, só com as linhas de preço trocadas.
create or replace function public.buscar_catalogo_pdv(p_termo text)
returns table (
  id uuid, nome text, slug text, tipo text, descricao text,
  categoria_nome text,
  preco_de numeric, preco numeric, em_promocao boolean,
  ativo boolean, disponivel boolean,
  tem_variante_ativa boolean, variantes jsonb,
  codigo_primario text, casou_codigo boolean
) language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.has_permission('catalog.view') then
    -- Sem permissão devolve conjunto vazio, e não exceção: isto alimenta uma
    -- lista de tela, e o botão já não deveria estar lá.
    return;
  end if;

  return query
  with termo as (
    select public.sem_acento(p_termo) as t,
           -- O MESMO normalizador do código de barras, para o termo digitado
           -- casar com o que está gravado. "789 1234" encontra "7891234".
           public.normalizar_codigo_de_barras(p_termo) as c
  ),
  -- Passo 1: filtro barato, só texto e código, sem precificar nada. Mesma
  -- estratégia de `buscar_catalogo` (migration 0033) — precificar antes de
  -- filtrar era o que a tornava lenta.
  encontrados as (
    select p.id as pid,
           exists (
             select 1 from public.product_barcodes b
              where b.code_normalized = termo.c
                and length(termo.c) > 0
                and (b.product_id = p.id
                     or b.variant_id in (select pv.id from public.product_variants pv
                                          where pv.product_id = p.id))
           ) as casou
      from public.products p
      join public.categories cat on cat.id = p.category_id, termo
     where length(btrim(termo.t)) > 0
       and (
         public.sem_acento(p.name) like '%' || termo.t || '%'
         or public.sem_acento(coalesce(p.short_description, '')) like '%' || termo.t || '%'
         or public.sem_acento(cat.name) like '%' || termo.t || '%'
         or exists (
           select 1 from public.product_variants pv
           join public.pizza_sizes s on s.id = pv.size_id
           where pv.product_id = p.id and pv.is_active
             and public.sem_acento(s.name) like '%' || termo.t || '%'
         )
         -- O código exato entra como critério de busca, e não só de ordenação:
         -- um código nunca casaria com o nome de nada.
         or exists (
           select 1 from public.product_barcodes b
            where b.code_normalized = termo.c
              and length(termo.c) > 0
              and (b.product_id = p.id
                   or b.variant_id in (select pv.id from public.product_variants pv
                                        where pv.product_id = p.id))
         )
       )
  )
  -- Passo 2: preço, disponibilidade e variantes só do que sobrou.
  select
    p.id, p.name, p.slug, p.product_type, p.short_description,
    cat.name,
    coalesce(
      (select min(public.preco_regular_variante(pv.id)) from public.product_variants pv
        where pv.product_id = p.id and pv.is_active),
      p.base_price),
    coalesce(
      (select min(public.preco_efetivo_variante(pv.id)) from public.product_variants pv
        where pv.product_id = p.id and pv.is_active),
      public.preco_efetivo_produto(p.id)),
    exists (
      select 1 from public.promotions pr
      where pr.is_active and pr.starts_at <= now()
        and (pr.ends_at is null or pr.ends_at > now())
        and (pr.product_id = p.id
             or pr.variant_id in (select pv.id from public.product_variants pv
                                   where pv.product_id = p.id))),
    p.is_active,
    coalesce(public.produto_disponivel(p.id), false),
    exists (select 1 from public.product_variants pv
             where pv.product_id = p.id and pv.is_active),
    -- Só as variantes ATIVAS: variante inativa não é oferta, e o PDV não deve
    -- mostrar um tamanho que não se vende.
    (select coalesce(jsonb_agg(jsonb_build_object(
        'id', pv.id,
        'tamanho_id', s.id,
        'tamanho_nome', s.name,
        'fatias', s.slice_count,
        'max_sabores', s.max_flavors,
        'preco', public.preco_efetivo_variante(pv.id),
        'preco_de', public.preco_regular_variante(pv.id),
        'em_promocao', public.preco_efetivo_variante(pv.id) <> public.preco_regular_variante(pv.id),
        'disponivel', coalesce(public.variante_disponivel(pv.id), false)
      ) order by s.sort_order, s.name), '[]'::jsonb)
     from public.product_variants pv
     join public.pizza_sizes s on s.id = pv.size_id
     where pv.product_id = p.id and pv.is_active),
    (select b.code from public.product_barcodes b
      where b.product_id = p.id and b.is_primary),
    e.casou
  from encontrados e
  join public.products p on p.id = e.pid
  join public.categories cat on cat.id = p.category_id, termo
  order by
    -- Quem casou o código vem primeiro: se a pessoa bipou, é isso que ela quer.
    e.casou desc,
    (public.sem_acento(p.name) like '%' || termo.t || '%') desc,
    coalesce(public.produto_disponivel(p.id), false) desc,
    p.is_active desc,
    p.name;
end;
$$;

-- resolver_codigo_de_barras: última versão em 20260926120000_resolucao_e_busca_pdv.sql, só com as linhas de preço trocadas.
create or replace function public.resolver_codigo_de_barras(p_codigo text)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_normal    text;
  v_barcode   record;
  v_variante  record;
  v_produto   record;
  v_ativas    integer;
begin
  if not public.has_permission('catalog.view') then
    return jsonb_build_object('ok', false, 'bloqueio', 'sem_permissao',
      'erro', 'Você não tem permissão para consultar o catálogo.');
  end if;

  -- A NORMALIZAÇÃO AUTORITATIVA, a mesma função que gerou a coluna e sustenta
  -- o índice único. Comparar de qualquer outro jeito aqui — lower(), trim() à
  -- mão, um regex diferente — faria o bipe deixar de casar com o que está
  -- gravado. Zeros à esquerda preservados vêm de graça por isso.
  v_normal := public.normalizar_codigo_de_barras(p_codigo);

  select b.* into v_barcode
    from public.product_barcodes b
   where b.code_normalized = v_normal;

  -- NÃO ENCONTRADO É UM RESULTADO, e não um erro nem um item vazio. O PDV cai
  -- na busca por nome (§2.1) em vez de adicionar coisa nenhuma ao carrinho.
  if not found then
    return jsonb_build_object('ok', true, 'encontrado', false,
      'codigo_normalizado', v_normal);
  end if;

  -- ---------------------------------------------------------- variante
  -- Código de variante resolve DIRETO para aquela variante. Não há escolha a
  -- fazer: o tamanho já está no código.
  if v_barcode.variant_id is not null then
    select pv.id, pv.price, pv.is_active, pv.product_id,
           s.id as size_id, s.name as size_name, s.slice_count, s.max_flavors,
           p.name as produto_nome, p.product_type, p.slug as produto_slug
      into v_variante
      from public.product_variants pv
      join public.pizza_sizes s on s.id = pv.size_id
      join public.products p on p.id = pv.product_id
     where pv.id = v_barcode.variant_id;

    return jsonb_build_object(
      'ok', true, 'encontrado', true, 'alvo', 'variante',
      'precisa_escolher_variante', false,
      'codigo', v_barcode.code, 'codigo_normalizado', v_normal,
      'variante_id', v_variante.id,
      'produto_id', v_variante.product_id,
      'produto_nome', v_variante.produto_nome,
      'produto_slug', v_variante.produto_slug,
      'tipo', v_variante.product_type,
      'tamanho_id', v_variante.size_id,
      'tamanho_nome', v_variante.size_name,
      'fatias', v_variante.slice_count,
      'max_sabores', v_variante.max_flavors,
      'preco', public.preco_efetivo_variante(v_variante.id),
      'preco_de', public.preco_regular_variante(v_variante.id),
      'em_promocao', public.preco_efetivo_variante(v_variante.id) <> public.preco_regular_variante(v_variante.id),
      'ativo', v_variante.is_active,
      'disponivel', coalesce(public.variante_disponivel(v_variante.id), false));
  end if;

  -- ---------------------------------------------------------- produto
  select p.id, p.name, p.slug, p.product_type, p.base_price, p.is_active
    into v_produto
    from public.products p
   where p.id = v_barcode.product_id;

  -- §2.3, e a palavra que importa é ATIVA: um código no produto resolve direto
  -- só se o produto não tiver variante ativa. Variante inativa não é oferta,
  -- então não obriga a escolher nada.
  select count(*) into v_ativas
    from public.product_variants pv
   where pv.product_id = v_produto.id and pv.is_active;

  if v_ativas > 0 then
    -- PRECISA ESCOLHER, E AQUI NÃO SE ESCOLHE. Nenhum `variante_id` no topo da
    -- resposta, de propósito: escolher um tamanho por conta própria seria
    -- decidir preço no lugar da pessoa, em cima de dinheiro. A lista vai junto
    -- só para o configurador não precisar de uma segunda ida ao servidor.
    return jsonb_build_object(
      'ok', true, 'encontrado', true, 'alvo', 'produto',
      'precisa_escolher_variante', true,
      'codigo', v_barcode.code, 'codigo_normalizado', v_normal,
      'produto_id', v_produto.id,
      'produto_nome', v_produto.name,
      'produto_slug', v_produto.slug,
      'tipo', v_produto.product_type,
      'ativo', v_produto.is_active,
      'disponivel', coalesce(public.produto_disponivel(v_produto.id), false),
      'variantes', (
        select coalesce(jsonb_agg(jsonb_build_object(
            'id', pv.id,
            'tamanho_id', s.id,
            'tamanho_nome', s.name,
            'fatias', s.slice_count,
            'max_sabores', s.max_flavors,
            'preco', public.preco_efetivo_variante(pv.id),
            'preco_de', public.preco_regular_variante(pv.id),
            'em_promocao', public.preco_efetivo_variante(pv.id) <> public.preco_regular_variante(pv.id),
            'disponivel', coalesce(public.variante_disponivel(pv.id), false)
          ) order by s.sort_order, s.name), '[]'::jsonb)
        from public.product_variants pv
        join public.pizza_sizes s on s.id = pv.size_id
        where pv.product_id = v_produto.id and pv.is_active));
  end if;

  -- Produto simples — bebida, fogazza, combo. Bipa e entra.
  return jsonb_build_object(
    'ok', true, 'encontrado', true, 'alvo', 'produto',
    'precisa_escolher_variante', false,
    'codigo', v_barcode.code, 'codigo_normalizado', v_normal,
    'produto_id', v_produto.id,
    'produto_nome', v_produto.name,
    'produto_slug', v_produto.slug,
    'tipo', v_produto.product_type,
    'preco', public.preco_efetivo_produto(v_produto.id),
    'preco_de', v_produto.base_price,
    'em_promocao', public.preco_efetivo_produto(v_produto.id) is distinct from v_produto.base_price,
    'ativo', v_produto.is_active,
    'disponivel', coalesce(public.produto_disponivel(v_produto.id), false));
end;
$$;

-- vitrine_do_catalogo: última versão em 20261002100000_vitrine_do_catalogo.sql, só com as linhas de preço trocadas.
create or replace function public.vitrine_do_catalogo()
returns table (
  produto_id uuid,
  preco_de numeric,
  preco numeric,
  preco_max numeric,
  em_promocao boolean,
  disponivel boolean,
  tem_tamanhos boolean
)
language sql
stable
set search_path = ''
as $$
  with
  -- Sexta, sábado ou domingo no fuso da loja (D-2026-10-14-119), uma vez só.
  dia as (select public.e_fim_de_semana(now()) as fim_de_semana),
  -- preco_efetivo_variante / preco_efetivo_produto: a promoção vigente mais
  -- recente do alvo, senão o preço normal.
  promocao_da_variante as (
    select distinct on (pr.variant_id) pr.variant_id, pr.promotional_price
      from public.promotions pr
     where pr.variant_id is not null
       and pr.is_active and pr.starts_at <= now()
       and (pr.ends_at is null or pr.ends_at > now())
     order by pr.variant_id, pr.starts_at desc
  ),
  promocao_do_produto as (
    select distinct on (pr.product_id) pr.product_id, pr.promotional_price
      from public.promotions pr
     where pr.product_id is not null
       and pr.is_active and pr.starts_at <= now()
       and (pr.ends_at is null or pr.ends_at > now())
     order by pr.product_id, pr.starts_at desc
  ),
  variantes as (
    select pv.id, pv.product_id, pv.size_id,
           case when pv.weekend_price is not null and dia.fim_de_semana then pv.weekend_price else pv.price end as price,
           pv.is_active, pv.is_temporarily_available, s.sold_as,
           coalesce(pp.promotional_price, case when pv.weekend_price is not null and dia.fim_de_semana then pv.weekend_price else pv.price end) as preco_efetivo,
           pp.variant_id is not null as tem_promocao
      from public.product_variants pv
      -- LEFT: "alguma variação à venda" (produto_disponivel) não olha o
      -- tamanho; o visitante pode não enxergar um tamanho desativado.
      left join public.pizza_sizes s on s.id = pv.size_id
      left join promocao_da_variante pp on pp.variant_id = pv.id
      cross join dia
  ),
  produtos as (
    select p.id, p.product_type, p.base_price, p.category_id,
           p.flavor_category_id,
           p.is_active and p.is_temporarily_available
             and c.is_active and c.is_temporarily_available as no_ar,
           coalesce(pp.promotional_price, p.base_price) as preco_efetivo,
           pp.product_id is not null as tem_promocao
      from public.products p
      join public.categories c on c.id = p.category_id
      left join promocao_do_produto pp on pp.product_id = p.id
  ),
  resumo_variantes as (
    select v.product_id,
           bool_or(v.is_active and v.is_temporarily_available) as alguma_a_venda,
           bool_or(v.sold_as = 'pizza') as tem_pizza,
           bool_or(v.sold_as = 'pizza' and v.is_active) as tem_pizza_ativa,
           bool_or(v.sold_as = 'pizza' and v.is_active
                   and v.is_temporarily_available) as pizza_a_venda,
           bool_or(v.sold_as = 'fogazza') as tem_fogazza,
           bool_or(v.sold_as = 'pizza' and v.tem_promocao) as pizza_em_promocao,
           min(v.price) filter (where v.sold_as = 'pizza' and v.is_active) as pizza_preco_de,
           min(v.preco_efetivo) filter (where v.sold_as = 'pizza' and v.is_active) as pizza_preco,
           max(v.preco_efetivo) filter (where v.sold_as = 'pizza' and v.is_active) as pizza_preco_max
      from variantes v
     group by v.product_id
  ),
  -- produto_disponivel. O combo (raro) segue pela função dele.
  base as (
    select p.*, r.*,
           p.no_ar
           and (p.product_type <> 'combo' or coalesce(public.combo_disponivel(p.id), false))
           and (coalesce(r.alguma_a_venda, false)
                or (p.base_price is not null and not coalesce(r.tem_pizza, false)))
             as disponivel_base
      from produtos p
      left join resumo_variantes r on r.product_id = p.id
  ),
  -- fogazza_a_venda: (tamanho, categoria) com algum card no ar.
  cards_no_ar as (
    select distinct card.flavor_size_id as size_id, card.flavor_category_id as category_id
      from public.products card
      join public.categories c on c.id = card.category_id
     where card.is_active and card.is_temporarily_available
       and c.is_active and c.is_temporarily_available
  ),
  -- sabores_da_fogazza, de todos os cards de uma vez.
  sabores as (
    select card.id as card_id,
           v.price as preco_de,
           v.preco_efetivo as preco,
           v.preco_efetivo < v.price as em_promocao,
           -- variante_disponivel
           v.is_temporarily_available
           and coalesce(b.disponivel_base, false)
           and exists (select 1 from cards_no_ar a
                        where a.size_id = v.size_id and a.category_id = p.category_id)
             as disponivel
      from public.products card
      join public.pizza_sizes s
        on s.id = card.flavor_size_id and s.sold_as = 'fogazza' and s.is_active
      join variantes v on v.size_id = s.id and v.is_active
      join public.products p
        on p.id = v.product_id
       and p.category_id = card.flavor_category_id
       and p.product_type = 'pizza'
       and p.is_active
      left join base b on b.id = p.id
  ),
  resumo_sabores as (
    select f.card_id,
           min(f.preco_de) as preco_de,
           min(f.preco) as preco,
           max(f.preco) as preco_max,
           bool_or(f.em_promocao) as em_promocao,
           bool_or(f.disponivel) as algum_disponivel
      from sabores f
     group by f.card_id
  )
  select
    b.id,
    case when b.flavor_category_id is not null then rs.preco_de
         else coalesce(b.pizza_preco_de, b.base_price) end,
    case when b.flavor_category_id is not null then rs.preco
         else coalesce(b.pizza_preco, b.preco_efetivo) end,
    case when b.flavor_category_id is not null then rs.preco_max
         else coalesce(b.pizza_preco_max, b.preco_efetivo) end,
    case when b.flavor_category_id is not null then coalesce(rs.em_promocao, false)
         else b.tem_promocao or coalesce(b.pizza_em_promocao, false) end,
    -- produto_disponivel_no_cardapio
    coalesce(case
      when b.flavor_category_id is not null then
        b.no_ar and coalesce(rs.algum_disponivel, false)
      when coalesce(b.tem_fogazza, false) then
        b.disponivel_base
        and case when coalesce(b.tem_pizza, false) then coalesce(b.pizza_a_venda, false)
                 else b.base_price is not null end
      else b.disponivel_base
    end, false),
    b.flavor_category_id is not null or coalesce(b.tem_pizza_ativa, false)
  from base b
  left join resumo_sabores rs on rs.card_id = b.id;
$$;
