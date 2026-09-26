-- =============================================================================
-- RESOLUÇÃO DE CÓDIGO E BUSCA DO PDV — Fase 12 (PDV), Etapa 4
--
-- 09-PDV-FRENTE-DE-CAIXA.md §2.1, §2.3, §6.1, §6.4, Etapa 4 do §13
-- 03-RLS-RBAC-SEGURANCA.md §33.2-A · CLAUDE.md §16, §37
-- Decisão: D-2026-09-25-78
--
-- ESCOPO: responder "o que é este código?" e "o que casa com este texto?".
-- NÃO tem `pedidos_a_receber` (Etapa 5) e NÃO tem tela.
--
-- POR QUE UMA FUNÇÃO DE BUSCA SEPARADA, EM VEZ DE ALTERAR `buscar_catalogo`
--
-- §6.4: `buscar_catalogo` serve a VITRINE PÚBLICA e é executável por `anon`.
-- Acrescentar variantes, códigos de barras e itens inativos nela ampliaria a
-- superfície pública para atender uma necessidade interna — e o cardápio do
-- cliente passaria a carregar dado que não é dele. Uma função separada custa
-- pouco e isola o risco. `buscar_catalogo` fica intocada, e a suíte afirma isso.
--
-- O QUE A RESOLUÇÃO **NÃO** FAZ
--
-- Não escolhe tamanho. Não inventa item. Não esconde item indisponível.
--
-- Esse terceiro ponto merece explicação, porque é onde seria fácil inventar
-- regra: §6.1 lista `disponibilidade` como CAMPO DE SAÍDA do resolver, ao lado
-- do preço efetivo — não como filtro. Então um código válido de um item
-- indisponível resolve, e devolve `disponivel: false`.
--
-- Filtrar seria pior na operação: o bipe devolveria "código não encontrado", e
-- a pessoa iria procurar um problema de cadastro que não existe, em vez de ler
-- "a Coca acabou". Quem decide o que fazer com um item indisponível é o PDV.
-- =============================================================================

-- ====================================================== RESOLVER O CÓDIGO

-- `SECURITY DEFINER` COM VERIFICAÇÃO EXPLÍCITA, e não `INVOKER` como a leitura
-- da Etapa 3. A diferença é a pergunta que cada uma responde.
--
-- `codigos_de_barras_do_item` LISTA os códigos de um item dentro da tela de
-- catálogo: ali, lista vazia é resposta honesta para quem não pode ver.
--
-- Aqui a pergunta é "o que é este código?", e devolver "não encontrado" para
-- quem não tem `catalog.view` seria uma resposta ERRADA: mandaria o operador
-- procurar um cadastro que existe. Falta de permissão e código inexistente são
-- coisas diferentes e precisam de respostas diferentes.
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
      'preco_de', v_variante.price,
      'em_promocao', public.preco_efetivo_variante(v_variante.id) <> v_variante.price,
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
            'preco_de', pv.price,
            'em_promocao', public.preco_efetivo_variante(pv.id) <> pv.price,
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

comment on function public.resolver_codigo_de_barras is
  'Codigo -> produto OU variante, com preco efetivo, disponibilidade e precisa_escolher_variante. Nao escolhe tamanho. catalog.view.';

-- ========================================================= BUSCA DO PDV

-- Como `buscar_catalogo`, com três diferenças que existem por necessidade
-- interna: devolve as VARIANTES com id e preço, casa CÓDIGO exato, e mostra
-- item inativo com a bandeira `ativo` em vez de escondê-lo.
--
-- A terceira é operacional: quem está no balcão precisa saber que o item existe
-- e está inativo, senão vai cadastrar de novo. O cliente, na vitrine, não.
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
        'preco_de', pv.price,
        'em_promocao', public.preco_efetivo_variante(pv.id) <> pv.price,
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

comment on function public.buscar_catalogo_pdv is
  'Busca interna do PDV: variantes com id e preco, casa codigo exato, mostra inativo com bandeira. catalog.view.';

-- ============================================================== PRIVILÉGIOS

-- A superfície pública NÃO cresce. `buscar_catalogo` continua sendo a da
-- vitrine, e estas duas não são alcançáveis por `anon` (§6.4).
revoke all on function public.resolver_codigo_de_barras(text) from public, anon;
revoke all on function public.buscar_catalogo_pdv(text) from public, anon;

grant execute on function public.resolver_codigo_de_barras(text) to authenticated;
grant execute on function public.buscar_catalogo_pdv(text) to authenticated;
