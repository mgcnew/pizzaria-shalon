-- 0133 — a busca do cardápio casa PALAVRAS, não o trecho inteiro
-- RN-BUSCA-001/002 · D-2026-09-29-97
--
-- O DEFEITO. `buscar_catalogo` procurava o termo inteiro como um só trecho
-- do nome, da descrição, da categoria ou de um tamanho. Funcionava enquanto o
-- nome repetia tudo ("Pizza calabresa"). Com os sabores renomeados para o
-- nome do sabor ("Calabresa", D-2026-09-29-97), "pizza calabresa" deixou de
-- achar qualquer coisa, porque "pizza" está na categoria e "calabresa" no
-- nome, e o trecho inteiro não está em lugar nenhum. Medido no DEV:
--
--   calabresa            →  8        pizza calabresa     →  0
--   pizza de calabresa   →  0        chocolate morango   →  0  (já antes)
--   broto calabresa      →  0  (tamanho + sabor, já antes)
--
-- A CORREÇÃO. O termo vira palavras, e cada palavra precisa aparecer em algum
-- lugar do produto: nome, descrição, categoria ou tamanho oferecido.
-- Palavras de ligação ("de", "com", "c/"…) não contam. Se só sobrar palavra
-- de ligação, vale o termo inteiro, como antes. O que casa no NOME vem
-- primeiro, e a palavra inteira no nome antes do trecho.
--
-- O QUE NÃO MUDA. Continua INVOKER, sob o RLS de `products` (é ele que
-- esconde o produto inativo), sem acento e sem caixa (`sem_acento`), com a
-- mesma saída e os mesmos grants. Continua `like` sem índice: com ~100
-- produtos, cada busca varre o catálogo em poucos milissegundos.
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
  candidatos as (
    select
      p.id,
      public.sem_acento(p.name) as nome_n,
      public.sem_acento(concat_ws(' ',
        p.name, p.short_description, c.name,
        (select string_agg(s.name, ' ')
           from public.product_variants pv
           join public.pizza_sizes s on s.id = pv.size_id
          where pv.product_id = p.id and pv.is_active))) as texto
    from public.products p
    join public.categories c on c.id = p.category_id, termo
    where length(termo.t) > 0
  ),
  encontrados as (
    select k.id,
           -- Palavra inteira no nome pesa mais que trecho: "pizza calabresa"
           -- põe a Calabresa antes de "À moda do pizzaiolo". O termo vem do
           -- usuário; os metacaracteres de regex são escapados.
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
      (select min(pv.price) from public.product_variants pv
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
comment on function public.buscar_catalogo(text) is
  'Busca do cardapio publico: cada palavra do termo em nome, descricao, categoria ou tamanho; ignora palavras de ligacao (0133).';
