-- =============================================================================
-- O CADASTRO PRECISA LER O QUE PASSOU A ESCREVER
--
-- `catalogo_produtos_admin` alimenta a tela de Produtos (e `obterProduto`, que
-- filtra a mesma lista). Sem a coluna aqui, o formulário não teria como marcar
-- a caixa no estado certo ao abrir um produto já classificado.
--
-- Assinatura muda, então é `drop` + recriação; os GRANTs voltam logo abaixo.
-- Projeção de leitura apenas: nenhuma regra, nenhum dado alterado.
-- =============================================================================
do $patch$
declare
  v_src text;
  v_a1  text := E'ordem integer)';
  v_n1  text := E'ordem integer, exige_producao boolean)';
  v_a2  text := E'    m.storage_path, p.sort_order\n  from public.products p';
  v_n2  text := E'    m.storage_path, p.sort_order, p.requires_production\n  from public.products p';
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'catalogo_produtos_admin';

  if v_src is null then
    raise exception 'catalogo_produtos_admin não existe';
  end if;

  if position('exige_producao' in v_src) > 0 then
    raise notice 'catalogo_produtos_admin já informa exige_producao; nada a fazer';
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

  drop function public.catalogo_produtos_admin();
  execute v_src;

  revoke all on function public.catalogo_produtos_admin() from public, anon;
  grant execute on function public.catalogo_produtos_admin() to authenticated, service_role;
end $patch$;

do $post$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='catalogo_produtos_admin'
                    and pg_get_function_result(p.oid) like '%exige_producao boolean%') then
    raise exception 'catalogo_produtos_admin não devolve exige_producao';
  end if;

  if not has_function_privilege('authenticated', 'public.catalogo_produtos_admin()', 'execute') then
    raise exception 'authenticated perdeu execute em catalogo_produtos_admin';
  end if;
  if has_function_privilege('anon', 'public.catalogo_produtos_admin()', 'execute') then
    raise exception 'anon ganhou execute em catalogo_produtos_admin';
  end if;
end $post$;
