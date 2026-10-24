-- 0171 — Fechamento de caixa com o movimento completo e os totais do servidor
-- D-2026-10-23-163
--
-- O relatório de fechamento listava sangria, reforço, despesa e estorno um a um
-- e não trazia o total do que entrou nem do que saiu. Duas razões para o total
-- vir do servidor, e não ser somado na tela:
--
--  1. a lista da tela era INCOMPLETA: não trazia adiantamento a funcionário
--     (que sai da gaveta) nem outras saídas, e "estornos" juntava `refund` e
--     `adjustment` sem olhar o sentido. Somar o que aparecia podia dar um total
--     que não bate com o esperado;
--  2. o esperado já é do servidor (`esperado_em_caixa`): fundo + tudo que entrou
--     − tudo que saiu, em `cash_movements`. O fundo NÃO é um movimento
--     (`abrir_caixa` só grava `opening_amount`), então a conta fecha:
--        fundo + entrou_na_gaveta − saiu_da_gaveta = esperado.
--
-- Esta migration só ACRESCENTA chaves ao JSON de `resumo_do_fechamento`; as que
-- já existiam continuam iguais, para quem as lê não precisar mudar.
--
--   movimentos_da_gaveta  o movimento todo, agrupado por tipo e sentido — só os
--                         grupos que existem, então o que não teve movimento
--                         não aparece;
--   entrou_na_gaveta      soma de tudo que entrou (sem o fundo);
--   saiu_da_gaveta        soma de tudo que saiu;
--   total_recebido        o que foi recebido por todas as formas na sessão.
--
-- Continua SECURITY INVOKER: quem não pode ver os movimentos não recebe nada.

do $$
declare
  v_def text := pg_get_functiondef('public.resumo_do_fechamento(uuid)'::regprocedure);
  v_novo text := v_def;
begin
  -- Já aplicada: não faz nada.
  if v_def like '%0171: movimento completo da gaveta%' then
    return;
  end if;

  v_novo := replace(v_novo,
    E'    -- RN-CAIXA-011: o esperado é do servidor.\n    ''esperado_em_dinheiro'', case when v_s.status = ''open''',
    E'    -- 0171: movimento completo da gaveta e totais do servidor.\n    ''movimentos_da_gaveta'', coalesce((\n      select jsonb_agg(jsonb_build_object(''tipo'', g.movement_type, ''sentido'', g.direction, ''total'', g.total) order by g.movement_type, g.direction)\n        from (select m.movement_type, m.direction, sum(m.amount) as total\n                from public.cash_movements m\n               where m.cash_session_id = v_s.id\n               group by m.movement_type, m.direction) g), ''[]''::jsonb),\n    ''entrou_na_gaveta'', coalesce((select sum(m.amount) from public.cash_movements m\n                                   where m.cash_session_id = v_s.id and m.direction = ''in''), 0),\n    ''saiu_da_gaveta'', coalesce((select sum(m.amount) from public.cash_movements m\n                                 where m.cash_session_id = v_s.id and m.direction = ''out''), 0),\n    ''total_recebido'', coalesce((select sum(p.amount) from public.payments p\n                                 where p.cash_session_id = v_s.id and p.status = ''confirmed''), 0),\n\n    -- RN-CAIXA-011: o esperado é do servidor.\n    ''esperado_em_dinheiro'', case when v_s.status = ''open''');

  if v_novo not like '%0171: movimento completo da gaveta%' then
    raise exception 'resumo_do_fechamento mudou: patch do movimento completo da gaveta';
  end if;

  execute v_novo;
end;
$$;
