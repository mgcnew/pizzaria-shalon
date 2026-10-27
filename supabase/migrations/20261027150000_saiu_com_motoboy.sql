-- 0178 — "Saiu com…": toda entrega sai vinculada a um motoboy
-- D-2026-10-27-172 · 04 RN-STATE-007, RN-RUN-001/002/003/004, RN-PGTO-014 · CLAUDE.md §21, §26
--
-- O PROBLEMA. Em 14 dias, 91 entregas foram concluídas e NENHUMA passou por uma
-- saída de motoboy: `driver_runs` nunca teve uma linha. O botão "Despachar" da
-- tela Pedidos (`comando_pedido 'despachar'`) punha o pedido em "Saiu para
-- entrega" sem motoboy — contra RN-STATE-007, que diz que vincular o pedido a
-- uma saída É a operação que o coloca na rua. Sem saída não há acerto, e o
-- dinheiro das entregas entrava (ou não) na gaveta por fora: entrega concluída
-- sem recebimento e dinheiro "fora da gaveta" esquecido.
--
-- E o acerto, mesmo que alguém tentasse, exigia `deliveries.settle` logo na
-- entrada — permissão que a balconista não tem, embora o rótulo de
-- `deliveries.manage` seja "Montar saídas e receber acerto do motoboy".
--
-- ESTA MIGRATION:
--  1. `comando_pedido 'despachar'` recusa entrega sem vínculo ativo com um
--     motoboy. Os caminhos que vinculam antes (`despachar_corrida`) seguem
--     iguais. Pedido que já estava na rua continua podendo ser concluído.
--  2. `sair_com_motoboy(pedido, motoboy)`: o "Saiu com…" da tela Pedidos, num
--     toque. Vincula (`atribuir_entrega`) e põe na rua: saída nova despacha
--     (`despachar_corrida`); motoboy que já está na rua leva este pedido junto.
--  3. `finalizar_pedido`: "Concluir" e "Falhou" da tela Pedidos. Entrega
--     vinculada passa pelo retorno do motoboy (`registrar_retorno`), que marca
--     o vínculo e manda a saída para o acerto quando não sobra nada pendente;
--     o resto segue `comando_pedido` como antes.
--  4. `conciliar_corrida` (o acerto) exige `deliveries.manage`; `deliveries.settle`
--     só quando o motoboy trouxe mais ou menos que o esperado (RN-RUN-004).
--  5. `motoboys_para_despacho()`: entregadores ativos, sem quem faltou hoje,
--     com a presença do dia e se já estão na rua.

-- ---------------------------------------------------------------------------
-- 1. Despachar entrega exige o motoboy
-- ---------------------------------------------------------------------------
do $$
declare
  v_def text := pg_get_functiondef('public.comando_pedido(uuid,text,jsonb)'::regprocedure);
  v_novo text;
begin
  if v_def like '%0178: entrega sai com motoboy%' then
    return;
  end if;

  v_novo := replace(v_def,
    E'  elsif p_comando = ''despachar'' then\n    v_novo := ''out_for_delivery'';',
    E'  elsif p_comando = ''despachar'' then\n    -- 0178: entrega sai com motoboy (RN-STATE-007). Quem vincula antes é\n    -- `sair_com_motoboy` ou a saída montada em Entregas.\n    if v_pedido.fulfillment_type = ''delivery''\n       and not exists (select 1 from public.driver_run_orders r\n                        where r.order_id = p_order_id and r.delivery_status = ''pending'') then\n      return jsonb_build_object(''ok'', false, ''bloqueio'', ''motoboy'',\n        ''erro'', ''Escolha o motoboy que vai levar esta entrega.'');\n    end if;\n    v_novo := ''out_for_delivery'';');

  if v_novo = v_def then
    raise exception 'comando_pedido mudou: patch do despachar com motoboy';
  end if;

  execute v_novo;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. "Saiu com…"
-- ---------------------------------------------------------------------------
create or replace function public.sair_com_motoboy(p_order_id uuid, p_motoboy_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_res jsonb;
  v_run record;
begin
  if public.current_app_user_id() is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;

  -- Vincula. `atribuir_entrega` checa permissão, modalidade, "pronto para
  -- entrega", motoboy ativo e presente, e abre a saída se não houver.
  v_res := public.atribuir_entrega(p_order_id, jsonb_build_object('motoboy_id', p_motoboy_id));
  if not coalesce((v_res ->> 'ok')::boolean, false) then
    return v_res;
  end if;

  select r.* into v_run
    from public.driver_run_orders o
    join public.driver_runs r on r.id = o.driver_run_id
   where o.order_id = p_order_id and o.delivery_status = 'pending'
   for update of r;

  if v_run.status = 'open' then
    -- Saída nova: sai agora, com o que estiver nela.
    v_res := public.despachar_corrida(v_run.id);
  else
    -- O motoboy já está na rua: este pedido vai junto, na mesma saída.
    v_res := public.comando_pedido(p_order_id, 'despachar', '{}'::jsonb);
  end if;

  if not coalesce((v_res ->> 'ok')::boolean, false) then
    -- O vínculo não pode ficar sem o pedido na rua: desfaz tudo.
    raise exception using message = coalesce(v_res ->> 'erro', 'Não foi possível despachar.'),
                          errcode = 'P0001';
  end if;

  return jsonb_build_object('ok', true, 'corrida_id', v_run.id);
exception
  when sqlstate 'P0001' then
    return jsonb_build_object('ok', false, 'erro', sqlerrm);
end;
$$;

comment on function public.sair_com_motoboy is
  'D-2026-10-27-172: "Saiu com…" da tela Pedidos — vincula a entrega ao motoboy e põe na rua, num ato.';

revoke all on function public.sair_com_motoboy(uuid, uuid) from public, anon;
grant execute on function public.sair_com_motoboy(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Concluir / falhou pela saída do motoboy
-- ---------------------------------------------------------------------------
create or replace function public.finalizar_pedido(p_order_id uuid, p_comando text, p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_vinculo uuid;
begin
  if p_comando in ('concluir', 'registrar_falha_entrega') then
    select o.id into v_vinculo
      from public.driver_run_orders o
      join public.driver_runs r on r.id = o.driver_run_id
     where o.order_id = p_order_id and o.delivery_status = 'pending' and r.status = 'out';

    if v_vinculo is not null then
      return public.registrar_retorno(v_vinculo, jsonb_build_object(
        'entregue', p_comando = 'concluir',
        'motivo', p_dados ->> 'motivo'));
    end if;
  end if;

  return public.comando_pedido(p_order_id, p_comando, p_dados);
end;
$$;

comment on function public.finalizar_pedido is
  'D-2026-10-27-172: comandos da tela Pedidos. Concluir/falhou de entrega vinculada vão pelo retorno do motoboy; o resto é comando_pedido.';

revoke all on function public.finalizar_pedido(uuid, text, jsonb) from public, anon;
grant execute on function public.finalizar_pedido(uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Acerto pela balconista; diferença com quem pode conciliar
-- ---------------------------------------------------------------------------
do $$
declare
  v_def text := pg_get_functiondef('public.conciliar_corrida(uuid,jsonb)'::regprocedure);
  v_novo text;
begin
  if v_def like '%0178: acerto é de quem monta a saída%' then
    return;
  end if;

  v_novo := replace(v_def,
    E'  if not public.has_permission(''deliveries.settle'') then\n    return jsonb_build_object(''ok'', false, ''erro'',\n      ''Você não tem permissão para fazer o acerto do motoboy.'');\n  end if;',
    E'  -- 0178: acerto é de quem monta a saída; diferença, de quem concilia.\n  if not public.has_permission(''deliveries.manage'') then\n    return jsonb_build_object(''ok'', false, ''erro'',\n      ''Você não tem permissão para fazer o acerto do motoboy.'');\n  end if;');

  v_novo := replace(v_novo,
    E'  v_diferenca := v_devolvido - v_esperado;\n',
    E'  v_diferenca := v_devolvido - v_esperado;\n\n  if v_diferenca <> 0 and not public.has_permission(''deliveries.settle'') then\n    return jsonb_build_object(''ok'', false, ''exige_conciliacao'', true,\n      ''erro'', format(''O motoboy trouxe R$ %s %s do que devia. Chame quem pode conciliar a diferença do acerto.'',\n        replace(to_char(abs(v_diferenca), ''FM999990.00''), ''.'', '',''), case when v_diferenca > 0 then ''a mais'' else ''a menos'' end),\n      ''esperado'', v_esperado, ''diferenca'', v_diferenca);\n  end if;\n');

  if v_novo = v_def or v_novo not like '%exige_conciliacao%' then
    raise exception 'conciliar_corrida mudou: patch da permissão do acerto';
  end if;

  execute v_novo;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Quem pode sair agora
-- ---------------------------------------------------------------------------
create or replace function public.motoboys_para_despacho()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.has_permission('deliveries.manage') then
    return jsonb_build_object('ok', false, 'erro', 'Você não tem permissão para gerenciar entregas.');
  end if;

  return jsonb_build_object('ok', true, 'motoboys', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', e.id, 'nome', e.full_name,
             'presente', coalesce(a.status = 'present', false),
             'na_rua', coalesce(r.status = 'out', false),
             'entregas_na_rua', coalesce(r.pendentes, 0))
           order by (r.status = 'out') desc nulls last, (a.status = 'present') desc nulls last, e.full_name)
      from public.employees e
      left join public.employee_attendance a
        on a.employee_id = e.id and a.work_date = public.dia_de_trabalho()
      left join lateral (
        select dr.status,
               (select count(*) from public.driver_run_orders o
                 where o.driver_run_id = dr.id and o.delivery_status = 'pending') as pendentes
          from public.driver_runs dr
         where dr.driver_employee_id = e.id and dr.status in ('open', 'out')
         order by dr.created_at desc limit 1) r on true
     where e.is_driver and e.employment_status = 'active'
       and a.status is distinct from 'absent'), '[]'::jsonb));
end;
$$;

comment on function public.motoboys_para_despacho is
  'D-2026-10-27-172: entregadores que podem levar uma entrega agora (ativos, sem falta hoje), com presença e se estão na rua.';

revoke all on function public.motoboys_para_despacho() from public, anon;
grant execute on function public.motoboys_para_despacho() to authenticated;
