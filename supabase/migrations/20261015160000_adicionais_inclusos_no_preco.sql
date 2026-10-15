-- 0153 — Produto com adicionais inclusos no preço
-- D-2026-10-15-128 · RN-ADD-001/002 (ampliadas) · CLAUDE.md §16
--
-- "À sua escolha" (5 ingredientes) e "X-tudo" (6 ingredientes) vendem a
-- pizza e o cliente ESCOLHE os ingredientes sem que isso mude o preço. O
-- limite de ingredientes já existe (`products.max_addons`); faltava dizer
-- que, neste produto, o adicional é incluso — preço zero na conta.
--
-- A regra de preço continua inteira no servidor (`montar_item`): o cliente
-- nunca manda valor. O adicional segue precisando de preço por tamanho
-- cadastrado (é o que diz "este adicional existe neste tamanho").

alter table public.products
  add column addons_included boolean not null default false;

comment on column public.products.addons_included is
  'Adicionais inclusos no preço: o cliente escolhe (até max_addons) sem acréscimo. Padrão: falso.';

-- Patch no lugar de montar_item (a função foi alterada em várias migrations
-- posteriores; recriá-la de arquivo perderia essas alterações — cf. 0148).
do $$
declare
  v_def text := pg_get_functiondef('public.montar_item(jsonb)'::regprocedure);
  v_novo text;
begin
  if v_def like '%addons_included%' then
    return;
  end if;

  v_novo := replace(v_def, 'p.max_addons, p.slug', 'p.max_addons, p.addons_included, p.slug');

  v_novo := replace(v_novo,
    'coalesce(sum(public.preco_adicional(t.aid, v_size_id)), 0)',
    'case when v_produto.addons_included then 0 else coalesce(sum(public.preco_adicional(t.aid, v_size_id)), 0) end');

  v_novo := replace(v_novo,
    '''preco'', public.preco_adicional(a.id, v_size_id)',
    '''preco'', case when v_produto.addons_included then 0 else public.preco_adicional(a.id, v_size_id) end');

  if v_novo = v_def or v_novo not like '%v_produto.addons_included then 0 else coalesce%'
     or v_novo not like '%p.addons_included, p.slug%' then
    raise exception 'montar_item mudou: o patch dos adicionais inclusos não encontrou os trechos esperados';
  end if;

  execute v_novo;
end;
$$;
