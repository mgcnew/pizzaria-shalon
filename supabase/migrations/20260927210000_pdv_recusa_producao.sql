-- =============================================================================
-- O PDV É VENDA RÁPIDA — produto que exige preparo não entra por ali
--
-- 09-PDV-FRENTE-DE-CAIXA.md §2.1, §2.3 · D-2026-09-27 (decisão 1)
--
-- A DESCOBERTA QUE DETERMINOU ONDE ISTO MORA. A Nova Venda do PDV chama
-- `criarPedidoManual` com `origem: 'counter'` — a MESMA action e a MESMA
-- `criar_pedido` de `/admin/pedidos/novo`. No nível da autoridade de criação
-- não existe sinal que distinga "venda rápida do PDV" de "pedido de balcão
-- lançado em Pedidos": são a mesma chamada com os mesmos parâmetros.
--
-- Logo, bloquear em `criar_pedido` por `origem = 'counter'` recusaria também
-- uma pizza de balcão legitimamente lançada pela página de Pedidos — que é
-- exatamente o erro de confundir CANAL com NECESSIDADE DE PREPARO.
--
-- Por isso a informação entra nas duas RPCs que só o PDV usa. Elas são
-- SECURITY DEFINER e exigem `catalog.view`; o dado vem do servidor, não do
-- navegador. `criar_pedido` continua autoridade única de criação, sem
-- parâmetro de canal novo e sem segunda RPC de venda.
--
-- E O QUE ISTO É, HONESTAMENTE: orientação de fluxo, não fronteira de
-- segurança. Quem insistisse por outro caminho criaria um pedido de balcão
-- com pizza — que é um pedido VÁLIDO, e que a regra de `requires_production`
-- manda para a produção normalmente. A proteção que importa (pizza não
-- escapar da cozinha) está na migration anterior, na autoridade.
-- =============================================================================

-- ------------------------------------------------- 1. o bipe informa o preparo
do $patch$
declare
  v_src text;
  v_a1  text := E'      ''produto_slug'', v_variante.produto_slug,\n';
  v_n1  text := E'      ''produto_slug'', v_variante.produto_slug,\n'
             || E'      ''exige_producao'', coalesce((select p2.requires_production\n'
             || E'          from public.products p2 where p2.id = v_variante.product_id), true),\n';
  v_a2  text := E'    ''produto_slug'', v_produto.slug,\n';
  v_n2  text := E'    ''produto_slug'', v_produto.slug,\n'
             || E'    ''exige_producao'', coalesce((select p2.requires_production\n'
             || E'        from public.products p2 where p2.id = v_produto.id), true),\n';
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'resolver_codigo_de_barras';

  if v_src is null then
    raise exception 'resolver_codigo_de_barras não existe';
  end if;

  if position('exige_producao' in v_src) > 0 then
    raise notice 'resolver_codigo_de_barras já informa exige_producao; nada a fazer';
    return;
  end if;

  -- A âncora da variante aparece uma vez; a do produto, duas (escolher
  -- tamanho e produto simples). Conferir antes evita patch pela metade.
  if (length(v_src) - length(replace(v_src, v_a1, ''))) / length(v_a1) <> 1 then
    raise exception 'Âncora de variante não encontrada exatamente uma vez';
  end if;
  if (length(v_src) - length(replace(v_src, v_a2, ''))) / length(v_a2) <> 2 then
    raise exception 'Âncora de produto não encontrada exatamente duas vezes';
  end if;

  v_src := replace(v_src, v_a1, v_n1);
  v_src := replace(v_src, v_a2, v_n2);
  execute v_src;
end $patch$;

-- --------------------------------------------- 2. a busca informa o mesmo
--
-- Aqui a assinatura muda (uma coluna a mais), e `create or replace` não aceita
-- troca de tipo de retorno: é `drop` + recriação. Os GRANTs morrem no `drop`,
-- então são devolvidos logo abaixo, exatamente como estavam.
do $patch$
declare
  v_src text;
  v_a1  text := E'casou_codigo boolean)';
  v_n1  text := E'casou_codigo boolean, exige_producao boolean)';
  v_a2  text := E'    e.casou\n  from encontrados e';
  v_n2  text := E'    e.casou,\n    coalesce(p.requires_production, true)\n  from encontrados e';
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'buscar_catalogo_pdv';

  if v_src is null then
    raise exception 'buscar_catalogo_pdv não existe';
  end if;

  if position('exige_producao' in v_src) > 0 then
    raise notice 'buscar_catalogo_pdv já informa exige_producao; nada a fazer';
    return;
  end if;

  if (length(v_src) - length(replace(v_src, v_a1, ''))) / length(v_a1) <> 1 then
    raise exception 'Âncora da assinatura não encontrada exatamente uma vez';
  end if;
  if (length(v_src) - length(replace(v_src, v_a2, ''))) / length(v_a2) <> 1 then
    raise exception 'Âncora da projeção não encontrada exatamente uma vez';
  end if;

  v_src := replace(v_src, v_a1, v_n1);
  v_src := replace(v_src, v_a2, v_n2);

  drop function public.buscar_catalogo_pdv(text);
  execute v_src;

  revoke all on function public.buscar_catalogo_pdv(text) from public, anon;
  grant execute on function public.buscar_catalogo_pdv(text) to authenticated, service_role;
end $patch$;

-- ------------------------------------------------------------ postcondições
do $post$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='resolver_codigo_de_barras'
                    and pg_get_functiondef(p.oid) like '%exige_producao%') then
    raise exception 'resolver_codigo_de_barras não informa exige_producao';
  end if;

  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='buscar_catalogo_pdv'
                    and pg_get_functiondef(p.oid) like '%exige_producao%') then
    raise exception 'buscar_catalogo_pdv não informa exige_producao';
  end if;

  -- Os GRANTs voltaram, e `anon` continua de fora.
  if not has_function_privilege('authenticated', 'public.buscar_catalogo_pdv(text)', 'execute') then
    raise exception 'authenticated perdeu execute em buscar_catalogo_pdv';
  end if;
  if has_function_privilege('anon', 'public.buscar_catalogo_pdv(text)', 'execute') then
    raise exception 'anon ganhou execute em buscar_catalogo_pdv';
  end if;

  -- As duas continuam DEFINER com o filtro de permissão próprio.
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='buscar_catalogo_pdv' and p.prosecdef) then
    raise exception 'buscar_catalogo_pdv deixou de ser SECURITY DEFINER';
  end if;

  -- E `criar_pedido` NÃO ganhou conceito de canal: segue sem parâmetro novo.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
              where n.nspname='public' and p.proname='criar_pedido'
                and pg_get_function_identity_arguments(p.oid) <> 'p_pedido jsonb, p_segredo text') then
    raise exception 'criar_pedido mudou de assinatura';
  end if;
end $post$;
