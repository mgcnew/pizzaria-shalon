-- 0019 — Funções de domínio do catálogo
-- 04-REGRAS-NEGOCIO.md RN-PIZZA-004/005, RN-DISP-001/004, RN-COMBO-004/005,
--                      RN-BORDA-001/002/003, RN-ADD-001/002/005, RN-BANNER-003/004
-- CLAUDE.md §16 e §17 · 03-RLS-RBAC-SEGURANCA.md §8.2
--
-- AUTORIDADE DE PREÇO E DISPONIBILIDADE. A fórmula do meio a meio existe
-- UMA vez, aqui, e não é reescrita em nenhuma tela (CLAUDE.md §17).
--
-- SECURITY INVOKER de propósito: o RLS continua valendo dentro da função.
-- Quem não pode ler o produto não descobre o preço dele por aqui.

-- ------------------------------------------------- disponibilidade (combo)
-- RN-COMBO-004/005: a disponibilidade do combo é DERIVADA dos componentes,
-- nunca uma coluna gravada — coluna gravada dessincroniza em silêncio.
create or replace function public.combo_disponivel(p_combo_product_id uuid)
returns boolean language sql stable set search_path = ''
as $$
  select exists (
      select 1 from public.combo_components cc
      where cc.combo_product_id = p_combo_product_id
    )
    and not exists (
      select 1
      from public.combo_components cc
      join public.products cp on cp.id = cc.component_product_id
      join public.categories cat on cat.id = cp.category_id
      left join public.product_variants cv on cv.id = cc.component_variant_id
      where cc.combo_product_id = p_combo_product_id
        and (
          not cp.is_active or not cp.is_temporarily_available
          or not cat.is_active or not cat.is_temporarily_available
          or (cc.component_variant_id is not null
              and (cv.id is null or not cv.is_active or not cv.is_temporarily_available))
        )
    );
$$;

comment on function public.combo_disponivel is 'RN-COMBO-004: componente indisponível torna o combo indisponível para novos pedidos.';

-- ---------------------------------------------- disponibilidade (produto)
create or replace function public.produto_disponivel(p_product_id uuid)
returns boolean language sql stable set search_path = ''
as $$
  select
    -- RN-DISP-001: cadastro ativo E operação disponível. São dois estados.
    p.is_active and p.is_temporarily_available
    -- RN-DISP-004: categoria pausada indisponibiliza tudo que está nela, sem
    -- tocar no estado individual de cada produto. Ao despausar, cada produto
    -- volta a obedecer ao próprio estado — porque nada foi sobrescrito.
    and c.is_active and c.is_temporarily_available
    and (p.product_type <> 'combo' or public.combo_disponivel(p.id))
    -- Pizza cujos tamanhos estão todos indisponíveis não é vendável.
    and (
      not exists (select 1 from public.product_variants pv where pv.product_id = p.id)
      or exists (
        select 1 from public.product_variants pv
        where pv.product_id = p.id and pv.is_active and pv.is_temporarily_available
      )
    )
  from public.products p
  join public.categories c on c.id = p.category_id
  where p.id = p_product_id;
$$;

comment on function public.produto_disponivel is 'Disponibilidade efetiva: produto + categoria + (combo) componentes + (pizza) algum tamanho.';

create or replace function public.variante_disponivel(p_variant_id uuid)
returns boolean language sql stable set search_path = ''
as $$
  select pv.is_active and pv.is_temporarily_available
     and public.produto_disponivel(pv.product_id)
  from public.product_variants pv
  where pv.id = p_variant_id;
$$;

-- --------------------------------------------------------- preço efetivo
-- RN-PIZZA-005: preço efetivo = promocional válido, se houver; senão, normal.
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
    (select pv.price from public.product_variants pv where pv.id = p_variant_id)
  );
$$;

comment on function public.preco_efetivo_variante is 'RN-PIZZA-005: promocional válido quando existir; caso contrário, preço normal.';

create or replace function public.preco_efetivo_produto(
  p_product_id uuid, p_em timestamptz default now()
) returns numeric language sql stable set search_path = ''
as $$
  select coalesce(
    (
      select pr.promotional_price
      from public.promotions pr
      where pr.product_id = p_product_id
        and pr.is_active
        and pr.starts_at <= p_em
        and (pr.ends_at is null or pr.ends_at > p_em)
      order by pr.starts_at desc
      limit 1
    ),
    (select p.base_price from public.products p where p.id = p_product_id)
  );
$$;

-- ------------------------------------------------------------ meio a meio
-- RN-PIZZA-004 e RN-PIZZA-005. Levanta exceção em vez de devolver um preço
-- qualquer: combinação inválida não pode virar preço silencioso
-- (CLAUDE.md §20, "nunca deixar falha de cálculo produzir valor acidental").
create or replace function public.preco_meio_a_meio(
  p_variant_ids uuid[], p_em timestamptz default now()
) returns numeric language plpgsql stable set search_path = ''
as $$
declare
  v_pedidos integer;
  v_encontrados integer;
  v_tamanhos integer;
  v_size_id uuid;
  v_max_flavors integer;
  v_indisponivel integer;
  v_preco numeric;
begin
  if p_variant_ids is null or array_length(p_variant_ids, 1) is null then
    raise exception 'Informe ao menos um sabor' using errcode = '22023';
  end if;

  -- Sabores repetidos contam uma vez: pedir "Calabresa e Calabresa" é uma
  -- pizza de um sabor só.
  select count(distinct vid) into v_pedidos from unnest(p_variant_ids) as t(vid);

  select count(distinct pv.id), count(distinct pv.size_id)
    into v_encontrados, v_tamanhos
    from public.product_variants pv
    where pv.id = any (p_variant_ids);

  -- Sem RLS para ver a variação, ela simplesmente não existe para quem chama.
  if v_encontrados <> v_pedidos then
    raise exception 'Sabor inexistente ou nao acessivel' using errcode = '22023';
  end if;

  -- RN-PIZZA-004: "todos os sabores escolhidos disponíveis NO MESMO TAMANHO".
  if v_tamanhos <> 1 then
    raise exception 'Todos os sabores precisam estar no mesmo tamanho (RN-PIZZA-004)'
      using errcode = '22023';
  end if;

  select pv.size_id into v_size_id
    from public.product_variants pv where pv.id = any (p_variant_ids) limit 1;

  select s.max_flavors into v_max_flavors
    from public.pizza_sizes s where s.id = v_size_id and s.is_active;

  if v_max_flavors is null then
    raise exception 'Tamanho inativo ou inexistente' using errcode = '22023';
  end if;

  -- O TAMANHO decide quantos sabores cabem. Tamanho de 1 sabor não aceita
  -- meio a meio — a interface nem oferece, e aqui também não passa.
  if v_pedidos > v_max_flavors then
    raise exception 'Este tamanho aceita no maximo % sabor(es) (RN-PIZZA-004)', v_max_flavors
      using errcode = '22023';
  end if;

  select count(*) into v_indisponivel
    from unnest(p_variant_ids) as t(vid)
    where not coalesce(public.variante_disponivel(t.vid), false);

  if v_indisponivel > 0 then
    raise exception 'Sabor indisponivel no tamanho escolhido (RN-PIZZA-004)'
      using errcode = '22023';
  end if;

  -- RN-PIZZA-005: SEMPRE o MAIOR preço efetivo entre os sabores escolhidos.
  select max(public.preco_efetivo_variante(t.vid, p_em)) into v_preco
    from unnest(p_variant_ids) as t(vid);

  return v_preco;
end;
$$;

comment on function public.preco_meio_a_meio is 'RN-PIZZA-005: maior preço efetivo entre os sabores, mesmo tamanho, respeitando max_flavors.';

-- ---------------------------------------------------------------- bordas
-- RN-BORDA-003: compatível com o tamanho => elegível por padrão; a tabela de
-- exclusões registra a exceção.
create or replace function public.borda_permitida(
  p_product_id uuid, p_size_id uuid, p_crust_id uuid
) returns boolean language sql stable set search_path = ''
as $$
  select exists (
      select 1
      from public.crusts c
      join public.crust_size_prices csp on csp.crust_id = c.id and csp.size_id = p_size_id
      where c.id = p_crust_id
        and c.is_active and c.is_temporarily_available
        and csp.is_active and csp.is_temporarily_available
    )
    and not exists (
      select 1 from public.product_crust_exclusions e
      where e.product_id = p_product_id
        and e.crust_id = p_crust_id
        and (e.size_id is null or e.size_id = p_size_id)
    );
$$;

comment on function public.borda_permitida is 'RN-BORDA-003: elegível por padrão no tamanho compatível, salvo exclusão do produto.';

create or replace function public.preco_borda(p_crust_id uuid, p_size_id uuid)
returns numeric language sql stable set search_path = ''
as $$
  select csp.price from public.crust_size_prices csp
  where csp.crust_id = p_crust_id and csp.size_id = p_size_id and csp.is_active;
$$;

-- ------------------------------------------------------------ adicionais
-- RN-ADD-001: o recurso pode estar desligado globalmente. Esta leitura é
-- SECURITY DEFINER e devolve APENAS o booleano: o cliente público precisa
-- saber se adicionais existem, sem ganhar acesso a store_settings, que
-- guarda endereço, coordenadas e parâmetros internos (03 §7.1).
create or replace function public.adicionais_habilitados()
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((select s.addons_enabled from public.store_settings s limit 1), false);
$$;

comment on function public.adicionais_habilitados is 'RN-ADD-001: expõe só o liga/desliga global de adicionais, sem abrir store_settings.';

create or replace function public.adicional_permitido(
  p_product_id uuid, p_size_id uuid, p_addon_id uuid
) returns boolean language sql stable set search_path = ''
as $$
  select
    public.adicionais_habilitados()
    and exists (
      select 1 from public.addons a
      where a.id = p_addon_id and a.is_active and a.is_temporarily_available
    )
    and (
      p_size_id is null
      or exists (
        select 1 from public.addon_size_prices asp
        where asp.addon_id = p_addon_id and asp.size_id = p_size_id and asp.is_active
      )
    )
    -- Regra explícita vence; a mais específica (com tamanho) vence a genérica.
    -- Sem regra alguma, vale o padrão permissivo das listas ativas.
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

comment on function public.adicional_permitido is 'RN-ADD-001/002. Sem regra cadastrada, o adicional ativo é permitido (D-2026-09-18-21).';

create or replace function public.preco_adicional(p_addon_id uuid, p_size_id uuid)
returns numeric language sql stable set search_path = ''
as $$
  select asp.price from public.addon_size_prices asp
  where asp.addon_id = p_addon_id and asp.size_id = p_size_id and asp.is_active;
$$;

-- --------------------------------------------------------------- banners
-- RN-BANNER-003/004: a visibilidade é derivada do período do banner E da
-- validade/disponibilidade do destino.
create or replace function public.banner_visivel(
  p_banner_id uuid, p_em timestamptz default now()
) returns boolean language sql stable set search_path = ''
as $$
  select b.is_active
     and (b.starts_at is null or b.starts_at <= p_em)
     and (b.ends_at is null or b.ends_at > p_em)
     and case b.destination_type
       when 'product' then coalesce(public.produto_disponivel(b.destination_product_id), false)
       when 'category' then exists (
         select 1 from public.categories c
         where c.id = b.destination_category_id and c.is_active and c.is_temporarily_available
       )
       when 'promotion' then exists (
         select 1 from public.promotions pr
         where pr.id = b.destination_promotion_id
           and pr.is_active and pr.starts_at <= p_em
           and (pr.ends_at is null or pr.ends_at > p_em)
       )
       else true
     end
  from public.banners b
  where b.id = p_banner_id;
$$;

comment on function public.banner_visivel is 'RN-BANNER-003/004: fora da validade da promoção ou com produto indisponível, o banner some.';

-- Execução explícita: PUBLIC não recebe nada por omissão (mesma postura da
-- migration 0009). São funções de leitura do catálogo, usadas pela loja.
revoke all on function public.combo_disponivel(uuid) from public;
revoke all on function public.produto_disponivel(uuid) from public;
revoke all on function public.variante_disponivel(uuid) from public;
revoke all on function public.preco_efetivo_variante(uuid, timestamptz) from public;
revoke all on function public.preco_efetivo_produto(uuid, timestamptz) from public;
revoke all on function public.preco_meio_a_meio(uuid[], timestamptz) from public;
revoke all on function public.borda_permitida(uuid, uuid, uuid) from public;
revoke all on function public.preco_borda(uuid, uuid) from public;
revoke all on function public.adicionais_habilitados() from public;
revoke all on function public.adicional_permitido(uuid, uuid, uuid) from public;
revoke all on function public.preco_adicional(uuid, uuid) from public;
revoke all on function public.banner_visivel(uuid, timestamptz) from public;

grant execute on function public.combo_disponivel(uuid) to anon, authenticated;
grant execute on function public.produto_disponivel(uuid) to anon, authenticated;
grant execute on function public.variante_disponivel(uuid) to anon, authenticated;
grant execute on function public.preco_efetivo_variante(uuid, timestamptz) to anon, authenticated;
grant execute on function public.preco_efetivo_produto(uuid, timestamptz) to anon, authenticated;
grant execute on function public.preco_meio_a_meio(uuid[], timestamptz) to anon, authenticated;
grant execute on function public.borda_permitida(uuid, uuid, uuid) to anon, authenticated;
grant execute on function public.preco_borda(uuid, uuid) to anon, authenticated;
grant execute on function public.adicionais_habilitados() to anon, authenticated;
grant execute on function public.adicional_permitido(uuid, uuid, uuid) to anon, authenticated;
grant execute on function public.preco_adicional(uuid, uuid) to anon, authenticated;
grant execute on function public.banner_visivel(uuid, timestamptz) to anon, authenticated;
