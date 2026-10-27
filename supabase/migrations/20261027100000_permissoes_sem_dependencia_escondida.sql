-- 0175 — Permissões sem dependência escondida
-- D-2026-10-27-168 · 03 §RBAC · 04 RN-RBAC-004 · CLAUDE.md §14
--
-- O PROBLEMA. Em 15/10 "Ver configurações" (`settings.view`) foi tirado do
-- Atendente para ele não abrir a tela de Configurações. Mas as formas de
-- pagamento e as bandeiras só eram legíveis com essa permissão: o PDV e o
-- recebimento de pedidos passaram a abrir com a lista de formas VAZIA, e a
-- balconista não conseguia fechar a venda. Nada na tela de permissões dizia
-- que uma coisa dependia da outra. A Julia teve de virar Owner/Admin.
--
-- Do mesmo jeito, o Histórico de vendas do PDV exigia "Ver o financeiro"
-- (`finance.view`) — permissão do módulo Financeiro, não do caixa.
--
-- A REGRA desta migration: cada permissão vale pelo que o nome diz.
--  * formas de pagamento e bandeiras são CADASTRO DE LEITURA para toda a
--    equipe interna ativa (não são dado sensível: são "Dinheiro", "Débito",
--    "Visa"…). Alterar continua exigindo `settings.manage`;
--  * o Histórico de vendas do PDV passa a exigir "Ver o caixa" (`cash.view`)
--    e "Ver pedidos" (`orders.view`), as permissões de quem opera o balcão.
--  * o resumo do fechamento (`resumo_do_fechamento`) era SECURITY INVOKER e
--    lia `payments`, que só abre com `finance.view`: quem fechava o caixa só
--    com "Ver o caixa" via "Recebido por forma de pagamento" VAZIO e a
--    contagem de pizzas zerada. Passa a SECURITY DEFINER com checagem própria
--    de `cash.view` — devolve só os totais da sessão, como o Histórico do PDV.
--    A tabela `payments` continua fechada atrás de `finance.view` (03 §17.3).
--  A chave Pix (`pix_key_settings`) continua exigindo `settings.view`.

-- 1. Formas e bandeiras: leitura para a equipe interna ativa.
drop policy payment_methods_select on public.payment_methods;
create policy payment_methods_select on public.payment_methods
  for select to authenticated
  using (public.current_app_user_id() is not null);

drop policy payment_brands_select on public.payment_brands;
create policy payment_brands_select on public.payment_brands
  for select to authenticated
  using (public.current_app_user_id() is not null);

-- 2. Histórico de vendas do PDV: `cash.view` no lugar de `finance.view`.
do $$
declare
  v_def text := pg_get_functiondef('public.historico_vendas_pdv(integer)'::regprocedure);
  v_novo text;
begin
  if v_def like '%0175: caixa, não financeiro%' then
    return;
  end if;

  v_novo := replace(v_def,
    E'  if not public.has_permission(''finance.view'')\n     or not public.has_permission(''orders.view'') then',
    E'  -- 0175: caixa, não financeiro — o histórico é do balcão.\n  if not public.has_permission(''cash.view'')\n     or not public.has_permission(''orders.view'') then');

  if v_novo = v_def then
    raise exception 'historico_vendas_pdv mudou: patch da permissão do histórico';
  end if;

  execute v_novo;
end;
$$;

-- 3. Resumo do fechamento: definer, com a checagem de `cash.view` dentro.
do $$
declare
  v_def text := pg_get_functiondef('public.resumo_do_fechamento(uuid)'::regprocedure);
  v_novo text;
begin
  if v_def like '%0175: quem vê o caixa vê o fechamento%' then
    return;
  end if;

  v_novo := replace(v_def,
    E'begin\n  select * into v_s from public.cash_sessions s',
    E'begin\n  -- 0175: quem vê o caixa vê o fechamento (só os totais; `payments` segue fechada).\n  if not public.has_permission(''cash.view'') then\n    return jsonb_build_object(''ok'', false, ''erro'', ''Você não tem permissão para ver o caixa.'');\n  end if;\n\n  select * into v_s from public.cash_sessions s');

  if v_novo = v_def then
    raise exception 'resumo_do_fechamento mudou: patch da permissão do fechamento';
  end if;

  execute v_novo;
end;
$$;

alter function public.resumo_do_fechamento(uuid) security definer;
revoke all on function public.resumo_do_fechamento(uuid) from public, anon;
grant execute on function public.resumo_do_fechamento(uuid) to authenticated;
