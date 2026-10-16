-- 0156 — A bandeira do cartão deixa de ser escolha obrigatória
-- D-2026-10-15-131 · RN-PGTO-006 (revisada)
--
-- Pedido da dona: ninguém — nem o cliente, nem a balconista — escolhe mais a
-- bandeira. Escolhe-se a FORMA (débito, crédito, voucher, Pix) e a tela mostra
-- as bandeiras aceitas apenas como legenda.
--
-- No servidor: a bandeira continua podendo ser enviada (e, se for, é validada
-- contra a forma), mas a AUSÊNCIA dela não barra mais o pedido nem o
-- recebimento. `requires_brand` passa a significar "esta forma mostra a
-- legenda de bandeiras".
--
-- Patch no lugar das duas funções (criar_pedido e registrar_pagamento), pelo
-- mesmo motivo da 0148: foram alteradas por várias migrations.

do $$
declare
  v_fn record;
  v_def text;
  v_novo text;
begin
  for v_fn in
    select p.oid, p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('criar_pedido', 'registrar_pagamento')
  loop
    v_def := pg_get_functiondef(v_fn.oid);
    continue when v_def like '%A bandeira informada não é aceita%';

    -- if v_bandeira_id is null then return ... 'Escolha a bandeira ...' end if;
    -- vira: só recusa uma bandeira que FOI enviada e não vale para a forma.
    v_novo := regexp_replace(
      v_def,
      'if v_bandeira_id is null then\s+return jsonb_build_object\(''ok'', false, ''erro'',\s+format\(''Escolha a bandeira aceita para %s\.'', v_forma\.name\)\);\s+end if;',
      'if v_bandeira_id is null and nullif(' ||
        case when v_fn.proname = 'criar_pedido'
             then 'p_pedido -> ''pagamento'' ->> ''bandeira_id'''
             else 'v_linha ->> ''bandeira_id''' end ||
        ', '''') is not null then
      return jsonb_build_object(''ok'', false, ''erro'',
        format(''A bandeira informada não é aceita para %s.'', v_forma.name));
    end if;',
      'g');

    if v_novo = v_def then
      raise exception 'função % mudou: o patch da bandeira não encontrou o trecho esperado', v_fn.proname;
    end if;
    execute v_novo;
  end loop;
end;
$$;
