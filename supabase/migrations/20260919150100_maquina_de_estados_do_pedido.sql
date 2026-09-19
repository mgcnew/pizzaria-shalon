-- 0048 — Máquina de estados do pedido
-- 04-REGRAS-NEGOCIO.md RN-STATE-001..010 · CLAUDE.md §21, §33, §34
-- 03-RLS-RBAC-SEGURANCA.md §9
--
-- POR QUE ISTO É UMA FUNÇÃO E NÃO UMA POLICY DE UPDATE.
--
-- `orders` não tem policy de UPDATE para ninguém. Se tivesse, quem a
-- possuísse poderia gravar qualquer status direto em /rest/v1 — que é
-- exatamente o "dropdown genérico capaz de gravar qualquer status" proibido
-- por CLAUDE.md §21. Esconder o botão na interface não seria segurança.
--
-- Então toda transição passa por AQUI: um comando nomeado, com permissão
-- própria, pré-condições verificadas, efeito registrado e auditoria. Chamada
-- direta com transição inválida falha do mesmo jeito.

-- ------------------------------------------------- transições permitidas
-- Em tabela, e não em `case`, por três motivos: dá para consultar, dá para
-- testar sem executar comando nenhum, e a interface pode perguntar o que é
-- possível em vez de adivinhar.
create table public.order_status_transitions (
  from_status text not null,
  to_status text not null,
  primary key (from_status, to_status)
);

alter table public.order_status_transitions enable row level security;
alter table public.order_status_transitions force row level security;

create policy order_status_transitions_select on public.order_status_transitions
  for select to authenticated using (public.has_permission('orders.view'));

comment on table public.order_status_transitions is 'RN-STATE: o grafo permitido. Nada fora daqui acontece.';

insert into public.order_status_transitions (from_status, to_status) values
  -- RN-STATE-001: Pix confirmado devolve o pedido à fila normal — ou à
  -- aprovação de entrega, se essa condição também estiver pendente.
  ('waiting_pix_confirmation',          'waiting_delivery_approval'),
  ('waiting_pix_confirmation',          'waiting_store_confirmation'),
  ('waiting_pix_confirmation',          'rejected'),
  ('waiting_pix_confirmation',          'cancelled'),

  -- RN-STATE-002
  ('waiting_delivery_approval',         'waiting_store_confirmation'),
  ('waiting_delivery_approval',         'rejected'),
  ('waiting_delivery_approval',         'cancelled'),

  -- RN-STATE-003 e RN-ALT-004
  ('waiting_store_confirmation',        'confirmed'),
  ('waiting_store_confirmation',        'change_requested_waiting_customer'),
  ('waiting_store_confirmation',        'rejected'),
  ('waiting_store_confirmation',        'cancelled'),

  -- RN-ALT-006: sem resposta do cliente não há produção nem cancelamento
  -- automático. A saída daqui é sempre um ato de alguém.
  ('change_requested_waiting_customer', 'waiting_store_confirmation'),
  ('change_requested_waiting_customer', 'rejected'),
  ('change_requested_waiting_customer', 'cancelled'),

  -- RN-STATE-004
  ('confirmed',                         'in_production'),
  ('confirmed',                         'change_requested_waiting_customer'),
  ('confirmed',                         'cancelled'),

  -- RN-STATE-005 e RN-STATE-006: o "pronto" depende da modalidade.
  ('in_production',                     'ready_for_pickup'),
  ('in_production',                     'ready_for_delivery'),
  ('in_production',                     'cancelled'),

  ('ready_for_pickup',                  'completed'),
  ('ready_for_pickup',                  'cancelled'),

  ('ready_for_delivery',                'out_for_delivery'),
  ('ready_for_delivery',                'cancelled'),

  ('out_for_delivery',                  'completed'),
  ('out_for_delivery',                  'delivery_failed'),

  -- RN-STATE-008: a equipe decide depois entre nova tentativa e encerramento.
  ('delivery_failed',                   'out_for_delivery'),
  ('delivery_failed',                   'completed'),
  ('delivery_failed',                   'cancelled');

-- `completed`, `rejected` e `cancelled` não têm saída: são terminais.

create or replace function public.transicao_permitida(p_de text, p_para text)
returns boolean language sql stable set search_path = ''
as $$
  select exists (
    select 1 from public.order_status_transitions t
    where t.from_status = p_de and t.to_status = p_para
  );
$$;

revoke all on function public.transicao_permitida(text, text) from public, anon;
grant execute on function public.transicao_permitida(text, text) to authenticated;

-- ---------------------------------------------- permissão de cada comando
-- Fonte: as permissões semeadas na Fase 2. `orders.cancel` está descrita
-- como "Cancelar ou rejeitar pedido" — então rejeitar exige `orders.cancel`,
-- e não `orders.accept`. O Atendente padrão aceita e produz; rejeitar e
-- cancelar são do Dono.
create or replace function public.permissao_do_comando(p_comando text)
returns text language sql immutable set search_path = ''
as $$
  select case p_comando
    when 'confirmar_pix'           then 'orders.confirm_pix'
    when 'aprovar_entrega'         then 'orders.accept'
    when 'rejeitar_entrega'        then 'orders.cancel'
    when 'aceitar'                 then 'orders.accept'
    when 'iniciar_producao'        then 'orders.accept'
    when 'marcar_pronto'           then 'orders.accept'
    when 'despachar'               then 'orders.accept'
    when 'concluir'                then 'orders.accept'
    when 'registrar_falha_entrega' then 'orders.accept'
    when 'rejeitar'                then 'orders.cancel'
    when 'cancelar'                then 'orders.cancel'
  end;
$$;

revoke all on function public.permissao_do_comando(text) from public, anon;
grant execute on function public.permissao_do_comando(text) to authenticated;

-- ---------------------------------------------------------- o comando
create or replace function public.comando_pedido(
  p_order_id uuid, p_comando text, p_dados jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_permissao text;
  v_pedido record;
  v_pix text;
  v_novo text;
  v_motivo text;
  v_revisao_aberta boolean;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;

  v_permissao := public.permissao_do_comando(p_comando);
  if v_permissao is null then
    return jsonb_build_object('ok', false, 'erro', 'Comando desconhecido.');
  end if;

  -- RN-RBAC-004: decide a permissão semântica efetiva, nunca o nome do cargo.
  if not public.has_permission(v_permissao) then
    return jsonb_build_object('ok', false, 'erro', 'Você não tem permissão para esta ação.');
  end if;

  -- CLAUDE.md §34: trava a linha. Dois atendentes clicando "aceitar" ao
  -- mesmo tempo viram duas execuções em fila, e a segunda encontra o estado
  -- já mudado — em vez de as duas lerem o estado antigo.
  select * into v_pedido from public.orders o where o.id = p_order_id for update;
  if v_pedido.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Pedido não encontrado.');
  end if;

  select pi.pix_confirmation_status into v_pix
    from public.order_payment_intents pi where pi.order_id = p_order_id;

  select exists (select 1 from public.order_revisions r
                  where r.order_id = p_order_id and r.status = 'pending_customer')
    into v_revisao_aberta;

  v_motivo := nullif(btrim(coalesce(p_dados ->> 'motivo', '')), '');

  -- ------------------------------------------------------------ comandos
  if p_comando = 'confirmar_pix' then
    -- CLAUDE.md §23: selecionar Pix não é pagar. Alguém confirma, e fica
    -- registrado quem e quando.
    if v_pix is distinct from 'pending' then
      return jsonb_build_object('ok', false, 'erro', 'Este pedido não está aguardando Pix.');
    end if;

    update public.order_payment_intents
       set pix_confirmation_status = 'confirmed',
           pix_confirmed_by = v_ator, pix_confirmed_at = now()
     where order_id = p_order_id;

    -- O Pix deixa de bloquear; a aprovação de entrega, se pendente, continua.
    v_novo := case
      when v_pedido.delivery_approval_status = 'pending' then 'waiting_delivery_approval'
      else 'waiting_store_confirmation' end;

  elsif p_comando = 'aprovar_entrega' then
    if v_pedido.delivery_approval_status is distinct from 'pending' then
      return jsonb_build_object('ok', false, 'erro', 'Este pedido não aguarda aprovação de entrega.');
    end if;

    update public.orders
       set delivery_approval_status = 'approved',
           delivery_approval_decided_by = v_ator, delivery_approval_decided_at = now()
     where id = p_order_id;

    -- Se o Pix ainda bloqueia, o status não anda: só a dimensão da entrega
    -- foi resolvida (D-2026-09-19-37).
    v_novo := case
      when v_pedido.status = 'waiting_delivery_approval' then 'waiting_store_confirmation'
      else v_pedido.status end;

  elsif p_comando = 'rejeitar_entrega' then
    if v_pedido.delivery_approval_status is distinct from 'pending' then
      return jsonb_build_object('ok', false, 'erro', 'Este pedido não aguarda aprovação de entrega.');
    end if;
    if v_motivo is null then
      return jsonb_build_object('ok', false, 'erro', 'Informe o motivo da recusa.');
    end if;

    update public.orders
       set delivery_approval_status = 'rejected',
           delivery_approval_decided_by = v_ator, delivery_approval_decided_at = now(),
           rejection_reason = v_motivo
     where id = p_order_id;
    v_novo := 'rejected';

  elsif p_comando = 'aceitar' then
    -- RN-STATE-003: só com todas as pré-condições resolvidas. Cada bloqueio
    -- é dito por nome, para a operação saber o que resolver.
    if v_pix = 'pending' then
      return jsonb_build_object('ok', false, 'bloqueio', 'pix',
        'erro', 'O Pix ainda não foi confirmado.');
    end if;
    if v_pedido.delivery_approval_status = 'pending' then
      return jsonb_build_object('ok', false, 'bloqueio', 'entrega',
        'erro', 'A entrega ainda não foi aprovada.');
    end if;
    if v_revisao_aberta then
      return jsonb_build_object('ok', false, 'bloqueio', 'alteracao',
        'erro', 'Há uma alteração aguardando resposta do cliente.');
    end if;
    v_novo := 'confirmed';

  elsif p_comando = 'iniciar_producao' then
    v_novo := 'in_production';

  elsif p_comando = 'marcar_pronto' then
    -- RN-STATE-005/006: "pronto" tem dois significados, conforme a modalidade.
    v_novo := case when v_pedido.fulfillment_type = 'delivery'
                   then 'ready_for_delivery' else 'ready_for_pickup' end;

  elsif p_comando = 'despachar' then
    -- RN-STATE-007: a vinculação a uma saída de entrega é da Fase 7. Aqui o
    -- despacho é o ato operacional simples, sem inventar saída de motoboy.
    v_novo := 'out_for_delivery';

  elsif p_comando = 'concluir' then
    v_novo := 'completed';

  elsif p_comando = 'registrar_falha_entrega' then
    if v_motivo is null then
      return jsonb_build_object('ok', false, 'erro', 'Informe o motivo da falha na entrega.');
    end if;
    v_novo := 'delivery_failed';

  elsif p_comando = 'rejeitar' then
    -- RN-STATE-009: rejeição é antes do aceite e exige motivo.
    if v_motivo is null then
      return jsonb_build_object('ok', false, 'erro', 'Informe o motivo da rejeição.');
    end if;
    update public.orders set rejection_reason = v_motivo where id = p_order_id;
    v_novo := 'rejected';

  elsif p_comando = 'cancelar' then
    -- RN-STATE-010: cancelamento é distinto de rejeição e NUNCA apaga nada.
    if v_motivo is null then
      return jsonb_build_object('ok', false, 'erro', 'Informe o motivo do cancelamento.');
    end if;
    update public.orders
       set cancellation_reason = v_motivo, cancelled_by = v_ator, cancelled_at = now()
     where id = p_order_id;
    v_novo := 'cancelled';
  end if;

  -- ----------------------------------------------------------- transição
  if v_novo is distinct from v_pedido.status then
    if not public.transicao_permitida(v_pedido.status, v_novo) then
      return jsonb_build_object('ok', false, 'erro',
        format('Não é possível ir de "%s" para "%s".', v_pedido.status, v_novo),
        'de', v_pedido.status, 'para', v_novo);
    end if;

    update public.orders
       set status = v_novo,
           accepted_by  = case when v_novo = 'confirmed' then v_ator else accepted_by end,
           accepted_at  = case when v_novo = 'confirmed' then now() else accepted_at end,
           ready_at     = case when v_novo in ('ready_for_pickup','ready_for_delivery')
                               then now() else ready_at end,
           completed_at = case when v_novo = 'completed' then now() else completed_at end
     where id = p_order_id;

    insert into public.order_status_history
      (order_id, from_status, to_status, actor_type, actor_user_id, reason)
    values (p_order_id, v_pedido.status, v_novo, 'user', v_ator, v_motivo);
  end if;

  -- §33: ator, momento, ação, entidade, antes, depois e motivo.
  perform public.log_audit(
    'pedido_' || p_comando, 'orders', p_order_id,
    jsonb_build_object('status', v_pedido.status,
                       'delivery_approval_status', v_pedido.delivery_approval_status,
                       'pix', v_pix),
    jsonb_build_object('status', coalesce(v_novo, v_pedido.status)),
    v_motivo);

  return jsonb_build_object('ok', true, 'status', coalesce(v_novo, v_pedido.status));
end;
$$;

comment on function public.comando_pedido is 'CLAUDE.md §21: a única porta de transição. Comando nomeado, permissão, pré-condição, histórico e auditoria.';

revoke all on function public.comando_pedido(uuid, text, jsonb) from public, anon;
grant execute on function public.comando_pedido(uuid, text, jsonb) to authenticated;
