-- 0150 — Promoção por dia da semana e promoção com vários itens
-- D-2026-10-15-125 · RN-PROMO-002, RN-PROMO-004 (ampliada) · CLAUDE.md §19
--
-- Dois pedidos da Shalon:
--   1. "toda terça, quarta e quinta" sem refazer a promoção a cada semana:
--      a promoção ganha DIAS DA SEMANA, além do período por datas. Os dois
--      se combinam (a promoção vale nos dias marcados, dentro do período).
--      `weekdays` nulo = todos os dias, que é o comportamento de sempre.
--   2. a mesma promoção para VÁRIOS itens: cada item continua sendo uma linha
--      (preço, limite e vigência por alvo, como já era), ligada às demais por
--      `campaign_id`. A tela trata o conjunto como uma promoção só.
--
-- O preço continua sendo UM preço promocional simples por alvo (CLAUDE.md §19):
-- não há desconto percentual nem motor de regras.

-- ------------------------------------------------------------------ colunas
alter table public.promotions
  add column weekdays smallint[],
  add column campaign_id uuid not null default gen_random_uuid();

alter table public.promotions
  add constraint promotions_dias_validos check (
    weekdays is null
    or (cardinality(weekdays) between 1 and 7
        and weekdays <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[])
  );

comment on column public.promotions.weekdays is
  'Dias da semana em que vale (ISO: 1 = segunda … 7 = domingo). Nulo = todos os dias.';
comment on column public.promotions.campaign_id is
  'Liga as linhas criadas juntas para vários itens. Sem agrupamento, cada linha é a própria campanha.';

create index promotions_campaign_idx on public.promotions (campaign_id);

-- ------------------------------------------------------------------- helper
-- Mesma fonte de fuso do preço de fim de semana (e_fim_de_semana).
create or replace function public.promocao_no_dia(p_dias smallint[], p_em timestamptz default now())
returns boolean language sql stable security definer set search_path = ''
as $$
  select p_dias is null
      or extract(isodow from p_em at time zone coalesce(
           (select s.timezone from public.store_settings s limit 1),
           'America/Sao_Paulo'))::smallint = any (p_dias);
$$;

revoke all on function public.promocao_no_dia(smallint[], timestamptz) from public;
grant execute on function public.promocao_no_dia(smallint[], timestamptz) to anon, authenticated;

-- ------------------------------------------------- vigência nas funções
-- A condição "dentro do período" estava escrita em cada função que precifica.
-- Cada ocorrência ganha, ao lado, o teste do dia da semana. Patch no lugar,
-- para não recriar as funções a partir de arquivos que já foram alteradas
-- depois (o mesmo cuidado da 0148).
do $$
declare
  v_fn record;
  v_def text;
  v_novo text;
begin
  for v_fn in
    select p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('banner_visivel', 'buscar_catalogo_pdv', 'catalogo_variacoes_admin',
                         'limite_do_item', 'montar_item', 'preco_efetivo_produto',
                         'preco_efetivo_variante', 'vitrine_do_catalogo')
  loop
    v_def := pg_get_functiondef(v_fn.oid);
    continue when v_def like '%promocao_no_dia%';
    v_novo := regexp_replace(
      v_def,
      '\(pr\.ends_at is null or pr\.ends_at > (p_em|now\(\))\)',
      '(pr.ends_at is null or pr.ends_at > \1) and public.promocao_no_dia(pr.weekdays, \1)',
      'g');
    if v_novo <> v_def then
      execute v_novo;
    end if;
  end loop;
end;
$$;

-- --------------------------------------------- sobreposição (RN-PROMO-004)
-- As duas EXCLUDE olhavam só o período. Com dias da semana, duas promoções
-- do mesmo item podem coexistir se os dias não se cruzam (terça-quinta e
-- sexta-domingo). Exclusion constraint não expressa "conjuntos de dias com
-- interseção", então a garantia vira gatilho — com lock por alvo, para que
-- duas telas abertas ao mesmo tempo continuem sem furar a regra.
alter table public.promotions drop constraint promotions_sem_sobreposicao_produto;
alter table public.promotions drop constraint promotions_sem_sobreposicao_variacao;

create or replace function public.promotions_sem_sobreposicao()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if not new.is_active then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('promotions:' || coalesce(new.product_id, new.variant_id)::text));

  if exists (
    select 1 from public.promotions o
     where o.id <> new.id
       and o.is_active
       and o.product_id is not distinct from new.product_id
       and o.variant_id is not distinct from new.variant_id
       and tstzrange(o.starts_at, o.ends_at, '[)') && tstzrange(new.starts_at, new.ends_at, '[)')
       and (o.weekdays is null or new.weekdays is null or o.weekdays && new.weekdays)
  ) then
    raise exception 'Já existe uma promoção ativa para este item nesse período e nesses dias (RN-PROMO-004).'
      using errcode = '23P01', constraint = 'promotions_sem_sobreposicao';
  end if;
  return new;
end;
$$;

create trigger promotions_sem_sobreposicao
  before insert or update on public.promotions
  for each row execute function public.promotions_sem_sobreposicao();

-- --------------------------------------------------- listagem administrativa
drop function public.catalogo_promocoes_admin();

create function public.catalogo_promocoes_admin()
returns table(
  id uuid, nome text, alvo_tipo text, alvo_nome text,
  preco_promocional numeric, preco_normal numeric,
  inicio timestamptz, fim timestamptz, ativa boolean, situacao text,
  limite_por_pedido integer, campanha_id uuid, dias smallint[])
language sql stable set search_path = ''
as $$
  select
    pr.id, pr.name, pr.target_type,
    coalesce(p.name, pp.name || ' · ' || s.name),
    pr.promotional_price,
    coalesce(p.base_price, pv.price),
    pr.starts_at, pr.ends_at, pr.is_active,
    case
      when not pr.is_active then 'inativa'
      when pr.starts_at > now() then 'agendada'
      when pr.ends_at is not null and pr.ends_at <= now() then 'encerrada'
      when not public.promocao_no_dia(pr.weekdays, now()) then 'fora_do_dia'
      else 'vigente'
    end,
    pr.max_quantity_per_order,
    pr.campaign_id,
    pr.weekdays
  from public.promotions pr
  left join public.products p on p.id = pr.product_id
  left join public.product_variants pv on pv.id = pr.variant_id
  left join public.products pp on pp.id = pv.product_id
  left join public.pizza_sizes s on s.id = pv.size_id
  order by pr.starts_at desc, pr.name;
$$;

revoke all on function public.catalogo_promocoes_admin() from public, anon;
grant execute on function public.catalogo_promocoes_admin() to authenticated;

-- --------------------------------------------- banner de promoção com vários itens
-- Quando a campanha tem mais de um produto, o banner abre a página da
-- promoção (`/promocao/<id>`), com todos os itens; com um só, segue indo
-- direto ao produto, como antes.
create or replace function public.banners_publicos()
returns table(id uuid, titulo text, corpo text, imagem_path text, destino_tipo text,
              destino_slug text, url_externa text, ordem integer)
language sql stable set search_path = ''
as $$
  select
    b.id, b.title, b.body,
    public.caminho_publico_da_midia(b.image_asset_id),
    b.destination_type,
    coalesce(
      p.slug, c.slug,
      case when b.destination_type = 'promotion' and (
        select count(distinct coalesce(x.product_id, xv.product_id))
          from public.promotions x
          left join public.product_variants xv on xv.id = x.variant_id
         where x.campaign_id = pr.campaign_id and x.is_active) > 1
      then 'promocao/' || pr.id::text end,
      pp.slug),
    b.external_url,
    b.sort_order
  from public.banners b
  left join public.products p on p.id = b.destination_product_id
  left join public.categories c on c.id = b.destination_category_id
  left join public.promotions pr on pr.id = b.destination_promotion_id
  left join public.product_variants pv on pv.id = pr.variant_id
  left join public.products pp on pp.id = coalesce(pr.product_id, pv.product_id)
  where coalesce(public.banner_visivel(b.id), false)
    and public.caminho_publico_da_midia(b.image_asset_id) is not null
  order by b.sort_order, b.created_at;
$$;

-- --------------------------------------------------- página pública da promoção
-- Os produtos da campanha que estão valendo AGORA. Vazio = a página não existe
-- (promoção pausada, fora do dia ou encerrada).
create or replace function public.itens_da_promocao(p_promotion_id uuid)
returns table(produto_id uuid, nome_da_promocao text)
language sql stable security definer set search_path = ''
as $$
  select distinct coalesce(x.product_id, xv.product_id), x.name
    from public.promotions base
    join public.promotions x on x.campaign_id = base.campaign_id
    left join public.product_variants xv on xv.id = x.variant_id
   where base.id = p_promotion_id
     and x.is_active and x.starts_at <= now()
     and (x.ends_at is null or x.ends_at > now())
     and public.promocao_no_dia(x.weekdays, now());
$$;

revoke all on function public.itens_da_promocao(uuid) from public;
grant execute on function public.itens_da_promocao(uuid) to anon, authenticated;
