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
-- COMO AS FUNÇÕES EXISTENTES SÃO ALTERADAS: em vez de recriadas a partir dos
-- arquivos, são lidas do próprio banco (`pg_get_functiondef`) e só as linhas
-- de preço são trocadas — a mesma técnica de 20260927200000_exige_producao,
-- que alterou `buscar_catalogo_pdv` e `resolver_codigo_de_barras` assim e
-- deixou os arquivos sem a versão final delas. Cada trecho trocado tem de
-- aparecer exatamente o número de vezes esperado; senão a migration aborta
-- inteira e nada muda. Reexecutar não faz mal: função já alterada é pulada.

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

-- ----------------------------------------------- funções existentes, no lugar
create type pg_temp.troca as (de text, para text, vezes integer);

create function pg_temp.trocar_no_corpo(p_funcao text, p_trocas pg_temp.troca[])
returns void language plpgsql as $f$
declare
  v_src text;
  v_t pg_temp.troca;
  v_achou integer;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = p_funcao;
  if v_src is null then
    raise exception '% não existe — migration abortada', p_funcao;
  end if;
  if position('weekend_price' in v_src) > 0 or position('preco_regular_variante' in v_src) > 0 then
    raise notice '% já tem o preço de fim de semana; nada a fazer', p_funcao;
    return;
  end if;
  foreach v_t in array p_trocas loop
    v_achou := (length(v_src) - length(replace(v_src, v_t.de, ''))) / length(v_t.de);
    if v_achou <> v_t.vezes then
      raise exception '%: trecho "%" aparece % vez(es), esperado % — migration abortada',
        p_funcao, v_t.de, v_achou, v_t.vezes;
    end if;
    v_src := replace(v_src, v_t.de, v_t.para);
  end loop;
  execute v_src;
end;
$f$;

-- montar_fogazza: grava o preço de fim de semana que vem do painel.
select pg_temp.trocar_no_corpo($t$montar_fogazza$t$, array[
  row($t$  v_preco    numeric(10,2);
$t$, $t$  v_preco    numeric(10,2);
  v_preco_fds numeric(10,2);
$t$, 1)::pg_temp.troca,
  row($t$      insert into public.product_variants (product_id, size_id, price, is_active)
      values (v_sabor, v_tamanho, v_preco, true)
      on conflict (product_id, size_id)
      do update set price = excluded.price, is_active = true;$t$, $t$      -- Preço de fim de semana (D-2026-10-14-119): opcional; vazio = mesmo preço todo dia.
      v_preco_fds := nullif(v_item ->> 'preco_fim_de_semana', '')::numeric(10,2);
      if v_preco_fds is not null and v_preco_fds <= 0 then
        raise exception 'O preço de fim de semana precisa ser maior que zero (ou fica em branco).'
          using errcode = '23514';
      end if;
      insert into public.product_variants (product_id, size_id, price, weekend_price, is_active)
      values (v_sabor, v_tamanho, v_preco, v_preco_fds, true)
      on conflict (product_id, size_id)
      do update set price = excluded.price, weekend_price = excluded.weekend_price, is_active = true;$t$, 1)::pg_temp.troca
]);
-- sabores_da_fogazza: "de" e promoção pelo preço do momento.
select pg_temp.trocar_no_corpo($t$sabores_da_fogazza$t$, array[
  row($t$    pv.price,
$t$, $t$    public.preco_regular_variante(pv.id),
$t$, 1)::pg_temp.troca,
  row($t$< pv.price,$t$, $t$< public.preco_regular_variante(pv.id),$t$, 1)::pg_temp.troca
]);
-- tamanhos_publicos: "de" e promoção pelo preço do momento.
select pg_temp.trocar_no_corpo($t$tamanhos_publicos$t$, array[
  row($t$    pv.price,
$t$, $t$    public.preco_regular_variante(pv.id),
$t$, 1)::pg_temp.troca,
  row($t$< pv.price,$t$, $t$< public.preco_regular_variante(pv.id),$t$, 1)::pg_temp.troca
]);
-- montar_item: o "preço regular" guardado no item é o do momento (o cobrado já vem de preco_efetivo_variante).
select pg_temp.trocar_no_corpo($t$montar_item$t$, array[
  row($t$select pv.price into v_preco_regular$t$, $t$select public.preco_regular_variante(pv.id) into v_preco_regular$t$, 1)::pg_temp.troca
]);
-- buscar_catalogo_pdv: "de" e promoção do PDV pelo preço do momento.
select pg_temp.trocar_no_corpo($t$buscar_catalogo_pdv$t$, array[
  row($t$(select min(pv.price) from$t$, $t$(select min(public.preco_regular_variante(pv.id)) from$t$, 1)::pg_temp.troca,
  row($t$'preco_de', pv.price,$t$, $t$'preco_de', public.preco_regular_variante(pv.id),$t$, 1)::pg_temp.troca,
  row($t$<> pv.price,$t$, $t$<> public.preco_regular_variante(pv.id),$t$, 1)::pg_temp.troca
]);
-- resolver_codigo_de_barras: "de" e promoção do bipe pelo preço do momento.
select pg_temp.trocar_no_corpo($t$resolver_codigo_de_barras$t$, array[
  row($t$'preco_de', v_variante.price,$t$, $t$'preco_de', public.preco_regular_variante(v_variante.id),$t$, 1)::pg_temp.troca,
  row($t$<> v_variante.price,$t$, $t$<> public.preco_regular_variante(v_variante.id),$t$, 1)::pg_temp.troca,
  row($t$'preco_de', pv.price,$t$, $t$'preco_de', public.preco_regular_variante(pv.id),$t$, 1)::pg_temp.troca,
  row($t$<> pv.price,$t$, $t$<> public.preco_regular_variante(pv.id),$t$, 1)::pg_temp.troca
]);
-- vitrine_do_catalogo: o preço de tabela do momento entra no começo, e tudo o que vem depois já o usa.
select pg_temp.trocar_no_corpo($t$vitrine_do_catalogo$t$, array[
  row($t$  with
$t$, $t$  with
  -- Sexta, sábado ou domingo no fuso da loja (D-2026-10-14-119), uma vez só.
  dia as (select public.e_fim_de_semana(now()) as fim_de_semana),
$t$, 1)::pg_temp.troca,
  row($t$    select pv.id, pv.product_id, pv.size_id, pv.price,$t$, $t$    select pv.id, pv.product_id, pv.size_id,
           case when pv.weekend_price is not null and dia.fim_de_semana then pv.weekend_price else pv.price end as price,$t$, 1)::pg_temp.troca,
  row($t$coalesce(pp.promotional_price, pv.price) as preco_efetivo,$t$, $t$coalesce(pp.promotional_price, case when pv.weekend_price is not null and dia.fim_de_semana then pv.weekend_price else pv.price end) as preco_efetivo,$t$, 1)::pg_temp.troca,
  row($t$      left join promocao_da_variante pp on pp.variant_id = pv.id
$t$, $t$      left join promocao_da_variante pp on pp.variant_id = pv.id
      cross join dia
$t$, 1)::pg_temp.troca
]);
