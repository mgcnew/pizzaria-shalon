-- 0146 — busca sem função por produto
-- Desempenho · D-2026-10-02-115 · nenhuma regra muda
--
-- Depois da 0145 a busca ainda levava ~60 ms: para casar o termo com os
-- sabores de um card de fogazza, ela chamava `sabores_da_fogazza` (que
-- calcula preço e disponibilidade de cada sabor) só para ler os NOMES. Agora
-- os nomes vêm por junção, com os mesmos filtros da função. A suíte
-- `vitrine_do_catalogo.sql` confere que a busca pelo nome do sabor continua
-- achando o card.

create or replace function public.buscar_catalogo(p_termo text)
returns table (
  id uuid, nome text, slug text, tipo text, descricao text,
  categoria_nome text, categoria_slug text,
  preco_de numeric, preco numeric, em_promocao boolean,
  disponivel boolean, imagem_path text
)
language sql
stable
set search_path = ''
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
          where pv.product_id = p.id and pv.is_active),
        -- Os nomes dos sabores do card de fogazza (os mesmos de
        -- `sabores_da_fogazza`), por junção: a função, chamada produto a
        -- produto, custava ~45 ms por busca. Só texto para casar a busca;
        -- preço e disponibilidade vêm da vitrine.
        (select string_agg(sp.name, ' ')
           from public.pizza_sizes s
           join public.product_variants pv on pv.size_id = s.id and pv.is_active
           join public.products sp
             on sp.id = pv.product_id
            and sp.category_id = p.flavor_category_id
            and sp.product_type = 'pizza'
            and sp.is_active
          where s.id = p.flavor_size_id
            and s.sold_as = 'fogazza'
            and s.is_active))) as texto
    from public.products p
    join public.categories c on c.id = p.category_id, termo
    where length(termo.t) > 0
      and p.is_active and c.is_active
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
    v.preco_de, v.preco, v.em_promocao,
    v.disponivel,
    public.caminho_publico_da_midia(p.image_asset_id)
  from encontrados e
  join public.products p on p.id = e.id
  join public.categories c on c.id = p.category_id
  join public.vitrine_do_catalogo() v on v.produto_id = p.id
  order by
    e.palavra_no_nome desc,
    e.no_nome desc,
    v.disponivel desc,
    p.name;
$$;
