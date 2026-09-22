-- 0080 — A-18: transferência excepcional de entrega já em rota
-- 04-REGRAS-NEGOCIO.md RN-RUN-008 e RN-RUN-009 · 02 §11.5 · 03 §19.6
-- CLAUDE.md §21, §22, §26, §33, §34
--
-- O CASO: João saiu com três pedidos, a moto quebrou, e Pedro vai buscar um
-- deles. Antes de sair, trocar de motoboy é `atribuir_entrega`, que reescreve
-- o vínculo. Depois de sair NÃO PODE SER A MESMA COISA: o pedido está na rua,
-- e quem saiu com ele é um fato, não um campo editável (CLAUDE.md §22).
--
-- POR PEDIDO, NÃO PELA CORRIDA. A corrida de João continua existindo com os
-- outros dois; só a responsabilidade por aquele pedido muda de mão.
--
-- E O DINHEIRO NÃO SE MOVE AQUI. A transferência não cria pagamento, não cria
-- movimento de caixa e não muda recebimento nenhum. O que ela decide é de
-- quem o acerto vai cobrar cada entrega.

-- --------------------------------------------------------------- estados
-- `transferred` é diferente de `reassigned`: um é troca ANTES de sair (o
-- pedido nunca esteve na rua com aquele motoboy), o outro é transferência
-- DEPOIS (ele esteve). Misturá-los apagaria a diferença entre "ia levar" e
-- "estava levando".
alter table public.driver_run_orders drop constraint driver_run_orders_situacao;
alter table public.driver_run_orders add constraint driver_run_orders_situacao check (
  delivery_status in ('pending', 'delivered', 'failed', 'reassigned', 'transferred'));

comment on column public.driver_run_orders.delivery_status is
  'pending · delivered · failed · reassigned (trocado antes de sair) · transferred (transferido já em rota)';

-- ---------------------------------------------------- o fato da transferência
-- Tabela própria porque a transferência é um EVENTO com dois lados, e nenhum
-- dos dois vínculos sozinho consegue contar a história inteira.
create table public.delivery_transfers (
  id uuid primary key default gen_random_uuid(),

  order_id uuid not null references public.orders (id) on delete restrict,

  -- De onde saiu.
  from_run_id uuid not null references public.driver_runs (id) on delete restrict,
  from_link_id uuid not null references public.driver_run_orders (id) on delete restrict,
  from_employee_id uuid not null references public.employees (id) on delete restrict,

  -- Para onde foi.
  to_run_id uuid not null references public.driver_runs (id) on delete restrict,
  to_link_id uuid not null references public.driver_run_orders (id) on delete restrict,
  to_employee_id uuid not null references public.employees (id) on delete restrict,

  -- RN-RUN-008: motivo obrigatório. É excepcional; tem de ser explicada.
  reason text not null,
  notes text,

  transferred_by uuid not null references public.app_users (id) on delete restrict,
  transferred_at timestamptz not null default now(),

  constraint delivery_transfers_motivo check (length(btrim(reason)) >= 3),
  -- Transferir para o mesmo motoboy não é transferência.
  constraint delivery_transfers_motoboys_distintos check (from_employee_id <> to_employee_id),
  constraint delivery_transfers_corridas_distintas check (from_run_id <> to_run_id)
);

create index delivery_transfers_pedido on public.delivery_transfers (order_id);
create index delivery_transfers_origem on public.delivery_transfers (from_run_id);
create index delivery_transfers_destino on public.delivery_transfers (to_run_id);

comment on table public.delivery_transfers is
  'RN-RUN-008: transferência de responsabilidade por entrega já em rota. Nunca apaga quem saiu com o pedido.';

alter table public.delivery_transfers enable row level security;
alter table public.delivery_transfers force  row level security;

create policy delivery_transfers_select on public.delivery_transfers
  for select to authenticated using (public.has_permission('deliveries.view'));

-- ------------------------------------------- responsabilidade pelo dinheiro
-- RN-RUN-009. Dinheiro que JÁ FOI RECEBIDO fica com quem o recebeu, mesmo que
-- a entrega passe a outro. Sem esta coluna, o acerto seguiria o vínculo de
-- entrega e cobraria de Pedro um dinheiro que está no bolso de João.
--
-- Nulo é o caso normal: ninguém recebeu nada ainda, e o acerto segue o
-- vínculo de quem entregou.
alter table public.payments
  add column responsible_driver_run_id uuid references public.driver_runs (id) on delete restrict;

create index payments_corrida_responsavel on public.payments (responsible_driver_run_id)
  where responsible_driver_run_id is not null;

comment on column public.payments.responsible_driver_run_id is
  'RN-RUN-009: corrida que responde por este dinheiro no acerto. Preenchida quando a entrega é transferida depois do recebimento.';

-- ============================================================ transferir
create or replace function public.transferir_entrega(p_vinculo_id uuid, p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_motivo text := nullif(btrim(coalesce(p_dados ->> 'motivo', '')), '');
  v_vinculo record;
  v_origem record;
  v_pedido record;
  v_destino record;
  v_run record;
  v_run_id uuid;
  v_novo uuid;
  v_id uuid;
  v_carimbados integer := 0;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  -- Ato OPERACIONAL: quem cuida da rua resolve moto quebrada. Ele não move
  -- dinheiro — só decide de quem o acerto vai cobrar o que ainda não foi
  -- recebido. O dinheiro já recebido fica carimbado com quem o tem.
  if not public.has_permission('deliveries.manage') then
    return jsonb_build_object('ok', false, 'erro',
      'Você não tem permissão para gerenciar entregas.');
  end if;
  if v_motivo is null then
    return jsonb_build_object('ok', false, 'erro',
      'Informe o motivo da transferência.');
  end if;

  select * into v_vinculo from public.driver_run_orders o
    where o.id = p_vinculo_id for update;
  if v_vinculo.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Entrega não encontrada.');
  end if;

  -- Entrega já conferida não se transfere por fluxo comum: ela ACONTECEU.
  if v_vinculo.delivery_status <> 'pending' then
    return jsonb_build_object('ok', false, 'ja_conferida', true,
      'situacao', v_vinculo.delivery_status,
      'erro', case v_vinculo.delivery_status
                when 'delivered' then 'Esta entrega já foi concluída e não pode ser transferida.'
                when 'failed'    then 'Esta entrega já foi registrada como não realizada.'
                else 'Esta entrega não está mais ativa nesta corrida.' end);
  end if;

  select * into v_origem from public.driver_runs r
    where r.id = v_vinculo.driver_run_id for update;

  -- Só EM ROTA. Antes de sair, o caminho é `atribuir_entrega`, que é troca e
  -- não transferência — e manda a mensagem dizer isso.
  if v_origem.status <> 'out' then
    return jsonb_build_object('ok', false, 'nao_esta_em_rota', true,
      'status', v_origem.status,
      'erro', 'Esta corrida ainda não saiu. Para trocar o motoboy antes da saída, use a atribuição.');
  end if;

  select * into v_pedido from public.orders d where d.id = v_vinculo.order_id for update;
  -- RN-RUN-008: o pedido continua em rota. Nada aqui o devolve para "pronto".
  if v_pedido.status <> 'out_for_delivery' then
    return jsonb_build_object('ok', false, 'erro',
      'Só pedido em rota pode ser transferido.', 'status', v_pedido.status);
  end if;

  -- Dinheiro já recolhido é acerto encerrado daquele pedido: transferir
  -- depois disso seria mexer em conta fechada.
  if exists (select 1 from public.payments p
              where p.order_id = v_pedido.id and p.status = 'confirmed'
                and p.cash_session_id is not null) then
    return jsonb_build_object('ok', false, 'ja_conciliado', true, 'erro',
      'O dinheiro deste pedido já entrou no caixa. Ele não pode ser transferido.');
  end if;

  select * into v_destino from public.employees e
    where e.id = nullif(p_dados ->> 'motoboy_id', '')::uuid;
  if v_destino.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Motoboy não encontrado.');
  end if;
  if not v_destino.is_driver then
    return jsonb_build_object('ok', false, 'erro',
      format('%s não está cadastrado como entregador.', v_destino.full_name));
  end if;
  -- RN-FUNC-001: desligado continua existindo e não opera.
  if v_destino.employment_status <> 'active' then
    return jsonb_build_object('ok', false, 'erro',
      format('%s não está ativo e não pode assumir entregas.', v_destino.full_name));
  end if;
  if v_destino.id = v_origem.driver_employee_id then
    return jsonb_build_object('ok', false, 'erro',
      'O pedido já está com esse motoboy.');
  end if;

  -- A corrida de destino: a que ele já tem viva, ou uma que nasce na rua —
  -- porque ele está saindo AGORA para assumir a entrega.
  select * into v_run from public.driver_runs r
    where r.driver_employee_id = v_destino.id and r.status in ('open', 'out')
    order by r.created_at desc limit 1 for update;

  if v_run.id is null then
    insert into public.driver_runs (driver_employee_id, status, departed_at, created_by)
    values (v_destino.id, 'out', now(), v_ator)
    returning id into v_run_id;
  else
    v_run_id := v_run.id;
  end if;

  -- RN-RUN-009: o que ele JÁ RECEBEU continua sendo dele para prestar contas.
  update public.payments p
     set responsible_driver_run_id = v_origem.id
   where p.order_id = v_pedido.id
     and p.status = 'confirmed'
     and p.payment_method_family_snapshot = 'cash'
     and p.cash_session_id is null
     and p.responsible_driver_run_id is null;
  get diagnostics v_carimbados = row_count;

  -- O vínculo antigo PERMANECE, dizendo que ele estava levando.
  update public.driver_run_orders
     set delivery_status = 'transferred'
   where id = p_vinculo_id;

  insert into public.driver_run_orders (driver_run_id, order_id, assigned_by)
  values (v_run_id, v_pedido.id, v_ator)
  returning id into v_novo;

  insert into public.delivery_transfers (
    order_id, from_run_id, from_link_id, from_employee_id,
    to_run_id, to_link_id, to_employee_id,
    reason, notes, transferred_by)
  values (
    v_pedido.id, v_origem.id, p_vinculo_id, v_origem.driver_employee_id,
    v_run_id, v_novo, v_destino.id,
    v_motivo, nullif(btrim(coalesce(p_dados ->> 'observacao', '')), ''), v_ator)
  returning id into v_id;

  perform public.log_audit('entrega_transferir', 'orders', v_pedido.id,
    jsonb_build_object('corrida', v_origem.id, 'motoboy', v_origem.driver_employee_id),
    jsonb_build_object('corrida', v_run_id, 'motoboy', v_destino.id,
                       'pagamentos_carimbados', v_carimbados),
    v_motivo);

  return jsonb_build_object('ok', true, 'transferencia_id', v_id,
    'corrida_destino', v_run_id, 'vinculo_destino', v_novo,
    -- Quantos recebimentos continuaram sob responsabilidade de quem saiu.
    'dinheiro_permanece_com_o_anterior', v_carimbados > 0);
end;
$$;

comment on function public.transferir_entrega is
  'RN-RUN-008/009: transfere a responsabilidade por UMA entrega em rota. Não move dinheiro.';

revoke all on function public.transferir_entrega(uuid, jsonb) from public, anon;
grant execute on function public.transferir_entrega(uuid, jsonb) to authenticated;

-- ================================================= despacho tolera o já-saído
-- Uma corrida sendo montada pode receber uma entrega transferida, que JÁ ESTÁ
-- na rua. Mandar `comando_pedido` despachá-la de novo falharia — e a corrida
-- inteira ficaria presa por causa de um pedido que já saiu.
--
-- A proteção de §34 continua: nada que não esteja pronto sai. O que muda é
-- que "já saiu" deixa de ser tratado como "não pode sair".
create or replace function public.despachar_corrida(p_run_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_run record;
  v_vinculo record;
  v_res jsonb;
  v_saiu integer := 0;
  v_ja_na_rua integer := 0;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('deliveries.manage') then
    return jsonb_build_object('ok', false, 'erro',
      'Você não tem permissão para gerenciar entregas.');
  end if;

  select * into v_run from public.driver_runs r where r.id = p_run_id for update;
  if v_run.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Corrida não encontrada.');
  end if;
  if v_run.status <> 'open' then
    return jsonb_build_object('ok', false, 'ja_saiu', true,
      'erro', 'Esta corrida já saiu.', 'status', v_run.status);
  end if;

  if not exists (select 1 from public.driver_run_orders o
                  where o.driver_run_id = p_run_id and o.delivery_status = 'pending') then
    return jsonb_build_object('ok', false, 'erro',
      'Não há pedido nesta corrida para despachar.');
  end if;

  -- Confere TODOS antes de mover QUALQUER um: meia corrida na rua e meia na
  -- loja seria pior que não ter saído (CLAUDE.md §34).
  if exists (
    select 1 from public.driver_run_orders o
      join public.orders d on d.id = o.order_id
     where o.driver_run_id = p_run_id and o.delivery_status = 'pending'
       and d.status not in ('ready_for_delivery', 'out_for_delivery')
  ) then
    return jsonb_build_object('ok', false, 'erro',
      'Algum pedido desta corrida não está pronto para sair. Confira a fila.');
  end if;

  for v_vinculo in
    select o.*, d.status as pedido_status
      from public.driver_run_orders o
      join public.orders d on d.id = o.order_id
     where o.driver_run_id = p_run_id and o.delivery_status = 'pending'
  loop
    if v_vinculo.pedido_status = 'out_for_delivery' then
      -- Entrega transferida: já estava na rua antes desta corrida sair.
      v_ja_na_rua := v_ja_na_rua + 1;
      continue;
    end if;

    -- CLAUDE.md §21: a transição é da máquina de estados, não daqui.
    v_res := public.comando_pedido(v_vinculo.order_id, 'despachar');
    if not (v_res ->> 'ok')::boolean then
      raise exception 'Não foi possível despachar o pedido: %', v_res ->> 'erro';
    end if;
    v_saiu := v_saiu + 1;
  end loop;

  update public.driver_runs
     set status = 'out', departed_at = now()
   where id = p_run_id;

  perform public.log_audit('entrega_saida', 'driver_runs', p_run_id,
    jsonb_build_object('status', 'open'),
    jsonb_build_object('status', 'out', 'pedidos', v_saiu,
                       'ja_estavam_na_rua', v_ja_na_rua), null);

  return jsonb_build_object('ok', true, 'pedidos', v_saiu,
    'ja_estavam_na_rua', v_ja_na_rua);
end;
$$;

comment on function public.despachar_corrida is 'RN-RUN-002. Chama `comando_pedido` para cada pedido — não grava status. Entrega transferida já está em rota.';

revoke all on function public.despachar_corrida(uuid) from public, anon;
grant execute on function public.despachar_corrida(uuid) to authenticated;

-- ============================================ a quem cada dinheiro pertence
-- Uma fonte só para "que recebimentos em dinheiro esta corrida responde".
-- O acerto e o painel consultam esta função — não duas somas parecidas que
-- poderiam divergir depois de uma transferência.
create or replace function public.dinheiro_da_corrida(p_run_id uuid, p_so_entregues boolean)
returns numeric language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(p.amount), 0)::numeric(12,2)
    from public.payments p
   where p.status = 'confirmed'
     and p.payment_method_family_snapshot = 'cash'
     and p.cash_session_id is null
     and (
       -- RN-RUN-009: carimbo explícito ganha do vínculo de entrega.
       p.responsible_driver_run_id = p_run_id
       or (p.responsible_driver_run_id is null and exists (
             select 1 from public.driver_run_orders o
              where o.driver_run_id = p_run_id
                and o.order_id = p.order_id
                and case when p_so_entregues
                         then o.delivery_status = 'delivered'
                         -- `transferred` e `reassigned` ficam de fora: o
                         -- dinheiro não pode aparecer em duas corridas.
                         else o.delivery_status in ('pending', 'delivered', 'failed')
                    end))
     );
$$;

comment on function public.dinheiro_da_corrida is
  'RN-RUN-009: recebimentos em dinheiro sob responsabilidade da corrida. `p_so_entregues` separa o acerto (entregue) do painel (na rua).';

revoke all on function public.dinheiro_da_corrida(uuid, boolean) from public, anon;
grant execute on function public.dinheiro_da_corrida(uuid, boolean) to authenticated;
