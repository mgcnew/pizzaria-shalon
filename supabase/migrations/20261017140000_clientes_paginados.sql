-- 0166 — Lista de clientes paginada
-- D-2026-10-17-152
--
-- `clientes_analiticos` aceita `deslocamento` (quantos pular) junto do
-- `limite`, para a tela de Clientes mostrar uma página por vez em vez de
-- carregar a base inteira. Total, resumo e ordem continuam iguais.

do $$
declare
  v_def text := pg_get_functiondef('public.clientes_analiticos(jsonb)'::regprocedure);
  v_novo text := v_def;
begin
  if v_def like '%v_deslocamento%' then
    return;
  end if;

  v_novo := replace(v_novo,
    E'  v_ordem text := coalesce(nullif(p_filtros ->> ''ordem'', ''''), ''ausencia'');',
    E'  v_ordem text := coalesce(nullif(p_filtros ->> ''ordem'', ''''), ''ausencia'');\n'
    || E'  -- Página (0166): quantos clientes pular antes do limite.\n'
    || E'  v_deslocamento integer := greatest(coalesce(nullif(p_filtros ->> ''deslocamento'', '''')::integer, 0), 0);');

  v_novo := replace(v_novo,
    E'       f.nome\n     limit v_limite\n  )',
    E'       f.nome\n     limit v_limite offset v_deslocamento\n  )');

  v_novo := replace(v_novo,
    E'    ''limite'', v_limite,',
    E'    ''limite'', v_limite,\n    ''deslocamento'', v_deslocamento,');

  if v_novo not like '%offset v_deslocamento%'
     or v_novo not like '%''deslocamento'', v_deslocamento%' then
    raise exception 'clientes_analiticos mudou: o patch da paginação não encontrou todos os trechos';
  end if;

  execute v_novo;
end;
$$;
