-- 0134 — fogazza vendida a partir do sabor de pizza (entrega 1: modelo)
-- 04 RN-FOG-002..006 · 02 §5.3, §5.2 · D-2026-09-29-98
--
-- A DECISÃO. A fogazza deixa de ser um produto por sabor. Cada sabor de pizza
-- ganha, se a Shalon quiser, um preço "como fogazza", e o cliente escolhe a
-- fogazza por dois cards de entrada ("Fogazza salgada", "Fogazza doce") que
-- listam os sabores. Aproveita o motor que já calcula e valida a pizza:
-- preço por sabor, promoção, disponibilidade, limite por pedido e comanda.
--
-- O MODELO:
--
--   pizza_sizes.sold_as        'pizza' (todos os existentes) ou 'fogazza'.
--                              O tamanho fogazza aceita 1 sabor e não tem
--                              borda. Só sabor de pizza pode usá-lo.
--
--   products.flavor_category_id + flavor_size_id
--                              Só no card de entrada (tipo fogazza): de qual
--                              categoria vêm os sabores e em qual tamanho de
--                              fogazza eles são vendidos.
--
-- As regras de integridade moram aqui, e não só na tela: a mensagem de cada
-- gatilho vai direto para a Owner (código 23514).
--
-- BLINDAGEM DO CARDÁPIO ATUAL. Até a entrega 2 criar a vitrine da fogazza,
-- nada disto pode aparecer para o cliente. Cadastrar o preço de fogazza num
-- sabor não pode fazer a página da pizza oferecer "Fogazza" como tamanho,
-- nem o card da pizza passar a dizer "a partir de R$ 17". Por isso as três
-- leituras públicas que olham tamanho (`cardapio_publico`, `tamanhos_publicos`
-- e `buscar_catalogo`) passam a considerar só tamanho vendido como pizza, e
-- escondem os cards de entrada.
--
-- `sabores_publicos(p_size_id)` NÃO muda: chamada com o tamanho fogazza, é
-- ela que vai listar os sabores na entrega 2. `produto_disponivel` também não
-- muda nesta entrega (ver D-2026-09-29-98).

-- --------------------------------------------------------------- estrutura
alter table public.pizza_sizes
  add column sold_as text not null default 'pizza';
alter table public.pizza_sizes
  add constraint pizza_sizes_vendido_como check (sold_as in ('pizza', 'fogazza')),
  add constraint pizza_sizes_fogazza_um_sabor check (sold_as <> 'fogazza' or max_flavors = 1);
comment on column public.pizza_sizes.sold_as is
  'pizza (padrão) ou fogazza: o tamanho em que um sabor de pizza é vendido como fogazza (RN-FOG-002).';

alter table public.products
  add column flavor_category_id uuid references public.categories (id) on delete restrict,
  add column flavor_size_id uuid references public.pizza_sizes (id) on delete restrict;
alter table public.products
  add constraint products_escolha_de_sabor check (
    (flavor_category_id is null and flavor_size_id is null)
    or (product_type = 'fogazza' and flavor_category_id is not null and flavor_size_id is not null));
comment on column public.products.flavor_category_id is
  'Card de entrada de fogazza: categoria de onde vêm os sabores (RN-FOG-003).';
comment on column public.products.flavor_size_id is
  'Card de entrada de fogazza: tamanho (vendido como fogazza) em que os sabores são vendidos.';

create index products_escolha_de_sabor_idx on public.products (flavor_category_id)
  where flavor_category_id is not null;

-- ----------------------------------------------------------------- gatilhos
-- Card de entrada aponta só para tamanho de fogazza; produto que usa o
-- tamanho de fogazza continua sendo pizza.
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
  return new;
end;
$$;
create trigger products_fogazza_coerente
  before insert or update of flavor_size_id, product_type on public.products
  for each row execute function public.tg_produto_fogazza_coerente();

-- O tamanho de fogazza só existe em sabor de pizza (RN-FOG-002).
create or replace function public.tg_variante_fogazza_coerente()
returns trigger language plpgsql set search_path = ''
as $$
begin
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
create trigger product_variants_fogazza_coerente
  before insert or update of size_id, product_id on public.product_variants
  for each row execute function public.tg_variante_fogazza_coerente();

-- Fogazza não tem borda (RN-FOG-004).
create or replace function public.tg_borda_fora_da_fogazza()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if exists (select 1 from public.pizza_sizes s
              where s.id = new.size_id and s.sold_as = 'fogazza') then
    raise exception 'Fogazza não tem borda: o tamanho de fogazza não recebe preço de borda.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger crust_size_prices_fora_da_fogazza
  before insert or update of size_id on public.crust_size_prices
  for each row execute function public.tg_borda_fora_da_fogazza();

-- Trocar o "vendido como" de um tamanho em uso não pode deixar o cadastro
-- incoerente. A tela só cria o tamanho; isto protege a edição direta.
create or replace function public.tg_tamanho_vendido_como()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.sold_as = old.sold_as then
    return new;
  end if;

  if old.sold_as = 'fogazza' and exists (
       select 1 from public.products p where p.flavor_size_id = new.id) then
    raise exception 'Este tamanho é usado por um card de fogazza e não pode deixar de ser fogazza.'
      using errcode = '23514';
  end if;

  if new.sold_as = 'fogazza' and exists (
       select 1 from public.crust_size_prices c where c.size_id = new.id) then
    raise exception 'Este tamanho tem preço de borda; fogazza não tem borda.'
      using errcode = '23514';
  end if;

  if new.sold_as = 'fogazza' and exists (
       select 1 from public.product_variants pv
         join public.products p on p.id = pv.product_id
        where pv.size_id = new.id and p.product_type <> 'pizza') then
    raise exception 'Este tamanho está em produtos que não são pizza; não pode virar fogazza.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger pizza_sizes_vendido_como
  before update of sold_as on public.pizza_sizes
  for each row execute function public.tg_tamanho_vendido_como();

revoke all on function public.tg_produto_fogazza_coerente() from public, anon, authenticated;
revoke all on function public.tg_variante_fogazza_coerente() from public, anon, authenticated;
revoke all on function public.tg_borda_fora_da_fogazza() from public, anon, authenticated;
revoke all on function public.tg_tamanho_vendido_como() from public, anon, authenticated;

-- ------------------------------------------- copiar preços de adicionais
-- "Os adicionais da fogazza custam o mesmo da Tradicional" (decisão da
-- Shalon): uma operação copia de uma vez os preços de um tamanho para outro,
-- sobrescrevendo o que já houver no destino. DEFINER para poder auditar
-- (`log_audit` não é executável por `authenticated`), com a MESMA permissão
-- das policies de escrita de `addon_size_prices`.
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
   where a.size_id = p_de
  on conflict (addon_id, size_id)
  do update set price = excluded.price, is_active = excluded.is_active, updated_at = now();
  get diagnostics v_copiados = row_count;

  perform public.log_audit(
    'adicionais_copiar_precos', 'pizza_sizes', p_para,
    jsonb_build_object('de', p_de), jsonb_build_object('copiados', v_copiados), null);

  return jsonb_build_object('ok', true, 'copiados', v_copiados);
end;
$$;
comment on function public.copiar_precos_adicionais(uuid, uuid) is
  'Copia os preços de adicionais de um tamanho para outro (RN-FOG-005). Exige catalog.manage; auditada.';
revoke all on function public.copiar_precos_adicionais(uuid, uuid) from public, anon;
grant execute on function public.copiar_precos_adicionais(uuid, uuid) to authenticated;

-- ------------------------------------------------ blindagem do cardápio
-- As mesmas funções de antes, com duas diferenças: só tamanho vendido como
-- pizza entra em preço, promoção, "tem tamanhos" e busca; e o card de
-- entrada de fogazza fica fora até a entrega 2.
create or replace function public.cardapio_publico(p_categoria_slug text default null)
returns table (
  id uuid, nome text, slug text, tipo text, descricao text,
  categoria_id uuid, categoria_nome text, categoria_slug text, categoria_ordem integer,
  preco_de numeric, preco numeric, preco_max numeric,
  em_promocao boolean, disponivel boolean, destaque boolean, tem_tamanhos boolean,
  imagem_path text, ordem integer, limite_por_pedido integer
)
language sql stable set search_path = ''
as $$
  with variantes_de_pizza as (
    select pv.*
      from public.product_variants pv
      join public.pizza_sizes s on s.id = pv.size_id
     where s.sold_as = 'pizza'
  )
  select
    p.id, p.name, p.slug, p.product_type, p.short_description,
    c.id, c.name, c.slug, c.sort_order,
    coalesce(
      (select min(pv.price) from variantes_de_pizza pv
        where pv.product_id = p.id and pv.is_active),
      p.base_price),
    coalesce(
      (select min(public.preco_efetivo_variante(pv.id)) from variantes_de_pizza pv
        where pv.product_id = p.id and pv.is_active),
      public.preco_efetivo_produto(p.id)),
    coalesce(
      (select max(public.preco_efetivo_variante(pv.id)) from variantes_de_pizza pv
        where pv.product_id = p.id and pv.is_active),
      public.preco_efetivo_produto(p.id)),
    exists (
      select 1 from public.promotions pr
      where pr.is_active and pr.starts_at <= now()
        and (pr.ends_at is null or pr.ends_at > now())
        and (pr.product_id = p.id
             or pr.variant_id in (select pv.id from variantes_de_pizza pv
                                   where pv.product_id = p.id))),
    coalesce(public.produto_disponivel(p.id), false),
    p.is_featured,
    exists (select 1 from variantes_de_pizza pv
             where pv.product_id = p.id and pv.is_active),
    public.caminho_publico_da_midia(p.image_asset_id),
    p.sort_order,
    p.max_quantity_per_order
  from public.products p
  join public.categories c on c.id = p.category_id
  where (p_categoria_slug is null or c.slug = p_categoria_slug)
    -- Card de entrada de fogazza: vitrine própria na entrega 2.
    and p.flavor_category_id is null
  order by c.sort_order, p.sort_order, p.name;
$$;

create or replace function public.tamanhos_publicos(p_product_id uuid)
returns table (
  variacao_id uuid, tamanho_id uuid, tamanho_nome text, fatias integer, max_sabores integer,
  preco_de numeric, preco numeric, em_promocao boolean, disponivel boolean
)
language sql stable set search_path = ''
as $$
  select
    pv.id, s.id, s.name, s.slice_count, s.max_flavors,
    pv.price,
    public.preco_efetivo_variante(pv.id),
    public.preco_efetivo_variante(pv.id) < pv.price,
    coalesce(public.variante_disponivel(pv.id), false)
  from public.product_variants pv
  join public.pizza_sizes s on s.id = pv.size_id
  where pv.product_id = p_product_id
    -- A página da pizza não oferece o tamanho de fogazza (RN-FOG-002).
    and s.sold_as = 'pizza'
  order by s.sort_order, s.name;
$$;

create or replace function public.buscar_catalogo(p_termo text)
returns table (
  id uuid, nome text, slug text, tipo text, descricao text,
  categoria_nome text, categoria_slug text,
  preco_de numeric, preco numeric, em_promocao boolean, disponivel boolean,
  imagem_path text
)
language sql stable set search_path = ''
as $$
  with termo as (
    select public.sem_acento(btrim(coalesce(p_termo, ''))) as t
  ),
  palavras as (
    select coalesce(
      (select array_agg(w)
         from termo, regexp_split_to_table(termo.t, '\s+') as w
        where w <> ''
          and w not in ('a', 'o', 'as', 'os', 'e', 'de', 'da', 'do', 'das', 'dos',
                        'com', 'c/', 'c', 'na', 'no', 'em')),
      array[(select t from termo)]
    ) as lista
  ),
  variantes_de_pizza as (
    select pv.*, s.name as tamanho_nome
      from public.product_variants pv
      join public.pizza_sizes s on s.id = pv.size_id
     where s.sold_as = 'pizza'
  ),
  candidatos as (
    select
      p.id,
      public.sem_acento(p.name) as nome_n,
      public.sem_acento(concat_ws(' ',
        p.name, p.short_description, c.name,
        (select string_agg(pv.tamanho_nome, ' ')
           from variantes_de_pizza pv
          where pv.product_id = p.id and pv.is_active))) as texto
    from public.products p
    join public.categories c on c.id = p.category_id, termo
    where length(termo.t) > 0
      and p.flavor_category_id is null
  ),
  encontrados as (
    select k.id,
           (select count(*) from unnest(pl.lista) as w
             where k.nome_n ~ ('\m' || regexp_replace(w, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '\M'))
             as palavra_no_nome,
           (select count(*) from unnest(pl.lista) as w
             where k.nome_n like '%' || w || '%') as no_nome
    from candidatos k, palavras pl
    where not exists (
      select 1 from unnest(pl.lista) as w where k.texto not like '%' || w || '%')
  )
  select
    p.id, p.name, p.slug, p.product_type, p.short_description,
    c.name, c.slug,
    coalesce(
      (select min(pv.price) from variantes_de_pizza pv
        where pv.product_id = p.id and pv.is_active),
      p.base_price),
    coalesce(
      (select min(public.preco_efetivo_variante(pv.id)) from variantes_de_pizza pv
        where pv.product_id = p.id and pv.is_active),
      public.preco_efetivo_produto(p.id)),
    exists (
      select 1 from public.promotions pr
      where pr.is_active and pr.starts_at <= now()
        and (pr.ends_at is null or pr.ends_at > now())
        and (pr.product_id = p.id
             or pr.variant_id in (select pv.id from variantes_de_pizza pv
                                   where pv.product_id = p.id))),
    coalesce(public.produto_disponivel(p.id), false),
    public.caminho_publico_da_midia(p.image_asset_id)
  from encontrados e
  join public.products p on p.id = e.id
  join public.categories c on c.id = p.category_id
  order by
    e.palavra_no_nome desc,
    e.no_nome desc,
    coalesce(public.produto_disponivel(p.id), false) desc,
    p.name;
$$;
