-- 0169 — Retirada no balcão só com o nome
-- D-2026-10-22-156 · amplia D-2026-09-26-81
--
-- Cliente que pede no balcão e não quer passar o telefone. Antes, sem
-- telefone só passava a venda totalmente anônima (nome E telefone vazios).
-- Agora, nas MESMAS condições — lançamento interno, origem `counter`,
-- retirada —, basta o nome: o pedido não vincula cliente (sem histórico e sem
-- fiado), e o nome digitado vai para o snapshot, para chamar no balcão e
-- sair na comanda. Sem nome, continua "Balcão".
--
-- Entrega e os demais canais continuam exigindo WhatsApp.

do $$
declare
  v_def text := pg_get_functiondef('public.criar_pedido(jsonb,text)'::regprocedure);
  v_novo text := v_def;
begin
  if v_def like '%coalesce(nullif(v_nome, ''''), ''Balcão'')%' then
    return;
  end if;

  v_novo := replace(v_novo,
    E'                  and v_modalidade = ''pickup''\n                  and v_nome = ''''\n                  and v_whats = '''';',
    E'                  and v_modalidade = ''pickup''\n                  -- 0169: basta não ter telefone; o nome é opcional.\n                  and v_whats = '''';');

  v_novo := replace(v_novo,
    E'    v_nome := ''Balcão'';',
    E'    v_nome := coalesce(nullif(v_nome, ''''), ''Balcão'');');

  if v_novo not like '%0169: basta não ter telefone%'
     or v_novo not like '%coalesce(nullif(v_nome, ''''), ''Balcão'')%' then
    raise exception 'criar_pedido mudou: patch do balcão só com nome';
  end if;

  execute v_novo;
end;
$$;
