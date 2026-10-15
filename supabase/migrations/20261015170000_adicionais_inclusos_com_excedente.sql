-- 0154 — Adicionais inclusos com excedente cobrado
-- D-2026-10-15-129 (revisa D-2026-10-15-128)
--
-- Em "À sua escolha" e "X-tudo", o limite (5 e 6) deixa de ser TETO e passa a
-- ser a QUANTIDADE INCLUSA: os primeiros N ingredientes não custam nada; cada
-- ingrediente a mais soma o seu preço (R$ 5,00 na Tradicional).
--
-- Para o cliente a conta é sempre a mais favorável: os N inclusos são os de
-- MAIOR preço da escolha; o excedente são os mais baratos. Com todos a
-- R$ 5,00 é indiferente; se um dia os preços diferirem, ninguém paga caro por
-- ter escolhido na ordem errada.
--
-- Em produto SEM adicionais inclusos nada muda: `max_addons` segue sendo teto.

do $$
declare
  v_def text := pg_get_functiondef('public.montar_item(jsonb)'::regprocedure);
  v_novo text := v_def;
begin
  if v_def like '%rn > coalesce(v_produto.max_addons%' then
    return;
  end if;

  -- 1. Teto só para quem não tem adicionais inclusos.
  v_novo := replace(v_novo,
    'if v_max_adicionais is not null and cardinality(v_adicionais) > v_max_adicionais then',
    'if v_max_adicionais is not null and not v_produto.addons_included and cardinality(v_adicionais) > v_max_adicionais then');

  -- 2. Soma: nos inclusos, só o que passa da quantidade inclusa.
  v_novo := regexp_replace(v_novo,
    'select case when v_produto\.addons_included then 0 else coalesce\(sum\(public\.preco_adicional\(t\.aid, v_size_id\)\), 0\) end\s+into v_preco_adicionais\s+from unnest\(v_adicionais\) as t\(aid\);',
    'select coalesce(sum(x.pr), 0)
      into v_preco_adicionais
      from (select public.preco_adicional(t.aid, v_size_id) as pr,
                   row_number() over (order by public.preco_adicional(t.aid, v_size_id) desc, t.aid) as rn
              from unnest(v_adicionais) as t(aid)) x
     where not v_produto.addons_included or x.rn > coalesce(v_produto.max_addons, 0);');

  -- 3. Detalhe: cada adicional com o preço que de fato entrou na conta.
  v_novo := regexp_replace(v_novo,
    '''preco'', case when v_produto\.addons_included then 0 else public\.preco_adicional\(a\.id, v_size_id\) end\s+\) order by a\.name\)\s+into v_detalhe_adicionais\s+from public\.addons a where a\.id = any \(v_adicionais\);',
    '''preco'', case when v_produto.addons_included and a.rn <= coalesce(v_produto.max_addons, 0)
                          then 0 else a.pr end
           ) order by a.name)
      into v_detalhe_adicionais
      from (select ad.id, ad.name, public.preco_adicional(ad.id, v_size_id) as pr,
                   row_number() over (order by public.preco_adicional(ad.id, v_size_id) desc, ad.id) as rn
              from public.addons ad where ad.id = any (v_adicionais)) a;');

  if v_novo = v_def
     or v_novo not like '%not v_produto.addons_included and cardinality%'
     or v_novo not like '%x.rn > coalesce(v_produto.max_addons%'
     or v_novo not like '%a.rn <= coalesce(v_produto.max_addons%' then
    raise exception 'montar_item mudou: o patch do excedente de adicionais não encontrou os trechos esperados';
  end if;

  execute v_novo;
end;
$$;
