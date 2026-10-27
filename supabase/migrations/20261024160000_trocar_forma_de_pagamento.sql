-- 0174 — Trocar a forma de pagamento de um pedido já pago
-- D-2026-10-24-167 · 04 RN-FIN-003/004, RN-CAIXA-015/016, RN-PGTO-002/003
-- CLAUDE.md §24, §25, §28, §34
--
-- O PROBLEMA. O pedido é lançado como dinheiro e o cliente paga no débito (ou o
-- contrário). O pagamento fica com a forma errada e o fechamento sai errado:
-- no dia 22/10, R$ 150 contados contra R$ 33 esperados, porque o que entrou em
-- dinheiro tinha sido lançado em outras formas.
--
-- O QUE JÁ EXISTIA era estornar e registrar de novo, em dois passos, e o estorno
-- de um pagamento de sessão fechada saía do caixa ABERTO AGORA (`reverter_pagamento`),
-- bagunçando o caixa de hoje sem consertar o do dia.
--
-- ESTA FUNÇÃO faz a troca em um ato só (tudo ou nada) e a atribui à SESSÃO
-- ORIGINAL do pagamento — a opção A aprovada em 24/10/2026:
--
--  1. o pagamento antigo vira `reversed` (motivo, quem e quando); se era dinheiro
--     da gaveta, ganha um movimento `refund` vinculado, NA MESMA sessão;
--  2. o novo pagamento entra na MESMA sessão, com o `received_at` do original —
--     a receita não muda de dia por causa de uma correção de forma;
--  3. sessão ABERTA: nada mais a fazer, o esperado se recalcula sozinho;
--     sessão FECHADA: o fechamento original é fotografado em `cash_session_corrections`
--     (`payment_change`, `before_snapshot`/`after_snapshot`), e o esperado e a
--     diferença gravados são recalculados. A contagem física NÃO é tocada;
--  4. a intenção do checkout (`order_payment_intents`) nunca é alterada.
--
-- PERMISSÃO: estornar (`finance.reverse`) E registrar pagamento
-- (`payments.register`) — a troca é as duas coisas.
--
-- FORA DESTA VERSÃO (recusado com mensagem clara, nunca feito pela metade):
--  * pedido de entrega ligado a uma saída (o acerto do motoboy tem a contabilidade
--    própria — RN-MOTO);
--  * pagamento que não entrou em nenhum caixa;
--  * pagamento espalhado por mais de uma sessão.

alter table public.cash_session_corrections
  drop constraint cash_session_corrections_tipo;
alter table public.cash_session_corrections
  add constraint cash_session_corrections_tipo
  check (correction_type in ('reopen', 'reclose', 'payment_change'));

create or replace function public.trocar_forma_de_pagamento(p_order_id uuid, p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_motivo text := nullif(btrim(coalesce(p_dados ->> 'motivo', '')), '');
  v_idem uuid;
  v_pedido record;
  v_pag record;
  v_mov record;
  v_sessao record;
  v_linha jsonb;
  v_forma record;
  v_bandeira_id uuid;
  v_bandeira_nome text;
  v_valor numeric;
  v_recebido numeric;
  v_troco numeric;
  v_soma numeric := 0;
  v_vistos text[] := '{}';
  v_chave text;
  v_qtd integer;
  v_sem_sessao integer;
  v_sessoes integer;
  v_total_original numeric;
  v_recebido_em timestamptz;
  v_pagamento_id uuid;
  v_primeira boolean := true;
  v_na_gaveta boolean;
  v_antes jsonb := '[]'::jsonb;
  v_depois jsonb := '[]'::jsonb;
  v_snapshot jsonb;
  v_esperado numeric;
  v_diferenca numeric;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not (public.has_permission('finance.reverse') and public.has_permission('payments.register')) then
    return jsonb_build_object('ok', false, 'erro',
      'Você não tem permissão para trocar a forma de pagamento.');
  end if;
  if v_motivo is null or length(v_motivo) < 3 then
    return jsonb_build_object('ok', false, 'erro', 'Informe o motivo da troca.');
  end if;

  -- 1. IDEMPOTÊNCIA — antes de qualquer escrita.
  begin
    v_idem := nullif(p_dados ->> 'idempotency_key', '')::uuid;
  exception when others then
    v_idem := null;
  end;
  if v_idem is not null and exists (select 1 from public.payments p where p.idempotency_key = v_idem) then
    return jsonb_build_object('ok', true, 'ja_existia', true, 'pedido_id', p_order_id);
  end if;

  -- 2. O PEDIDO — travado: duas pessoas não trocam o mesmo pagamento juntas.
  select * into v_pedido from public.orders o where o.id = p_order_id for update;
  if v_pedido.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Pedido não encontrado.');
  end if;
  if v_pedido.status in ('cancelled', 'rejected') then
    return jsonb_build_object('ok', false, 'erro', 'Pedido cancelado ou rejeitado não tem forma a trocar.');
  end if;

  select count(*), count(*) filter (where p.cash_session_id is null),
         count(distinct p.cash_session_id), coalesce(sum(p.amount), 0), min(p.received_at)
    into v_qtd, v_sem_sessao, v_sessoes, v_total_original, v_recebido_em
    from public.payments p
   where p.order_id = p_order_id and p.status = 'confirmed';

  if v_qtd = 0 then
    return jsonb_build_object('ok', false, 'erro', 'Este pedido não tem pagamento confirmado.');
  end if;
  if exists (select 1 from public.driver_run_orders r where r.order_id = p_order_id) then
    return jsonb_build_object('ok', false, 'erro',
      'Este pedido saiu em uma entrega. O acerto do motoboy cuida do dinheiro dele; a troca de forma ainda não vale para pedido de entrega.');
  end if;
  if v_sem_sessao > 0 then
    return jsonb_build_object('ok', false, 'erro',
      'Este pagamento não entrou em nenhum caixa. A troca de forma ainda não vale para ele.');
  end if;
  if v_sessoes > 1 then
    return jsonb_build_object('ok', false, 'erro',
      'Este pedido tem pagamentos em mais de uma sessão de caixa. A troca de forma ainda não vale para ele.');
  end if;

  select s.* into v_sessao from public.cash_sessions s
   where s.id = (select p.cash_session_id from public.payments p
                  where p.order_id = p_order_id and p.status = 'confirmed' limit 1)
   for update;

  -- 3. AS LINHAS NOVAS — validadas TODAS antes de gravar QUALQUER uma.
  if jsonb_typeof(p_dados -> 'linhas') <> 'array'
     or jsonb_array_length(p_dados -> 'linhas') = 0 then
    return jsonb_build_object('ok', false, 'erro', 'Informe a nova forma de pagamento.');
  end if;
  if jsonb_array_length(p_dados -> 'linhas') > 6 then
    return jsonb_build_object('ok', false, 'erro', 'Divisão com formas demais.');
  end if;

  for v_linha in select * from jsonb_array_elements(p_dados -> 'linhas') loop
    begin
      v_valor := nullif(v_linha ->> 'valor', '')::numeric;
    exception when others then
      v_valor := null;
    end;
    if v_valor is null or v_valor <= 0 then
      return jsonb_build_object('ok', false, 'erro', 'Cada forma precisa de um valor maior que zero.');
    end if;
    if v_valor <> round(v_valor, 2) then
      return jsonb_build_object('ok', false, 'erro', 'Valor com mais de dois decimais.');
    end if;

    select * into v_forma from public.payment_methods m
      where m.id = nullif(v_linha ->> 'forma_id', '')::uuid and m.is_active;
    if v_forma.id is null then
      return jsonb_build_object('ok', false, 'erro', 'Forma de pagamento inválida ou inativa.');
    end if;

    v_bandeira_id := null;
    if v_forma.requires_brand then
      select b.id into v_bandeira_id from public.payment_brands b
        where b.id = nullif(v_linha ->> 'bandeira_id', '')::uuid
          and b.payment_method_id = v_forma.id and b.is_active;
      if v_bandeira_id is null and nullif(v_linha ->> 'bandeira_id', '') is not null then
        return jsonb_build_object('ok', false, 'erro',
          format('A bandeira informada não é aceita para %s.', v_forma.name));
      end if;
    end if;

    v_chave := v_forma.id::text || ':' || coalesce(v_bandeira_id::text, '-');
    if v_chave = any(v_vistos) then
      return jsonb_build_object('ok', false, 'erro',
        format('%s aparece duas vezes na divisão. Some em uma linha só.', v_forma.name));
    end if;
    v_vistos := v_vistos || v_chave;

    if nullif(v_linha ->> 'recebido', '') is not null then
      if v_forma.payment_family <> 'cash' then
        return jsonb_build_object('ok', false, 'erro', 'Troco só se aplica a pagamento em dinheiro.');
      end if;
      v_recebido := (v_linha ->> 'recebido')::numeric;
      if v_recebido < v_valor then
        return jsonb_build_object('ok', false, 'erro',
          'O valor recebido em dinheiro não pode ser menor que o valor da linha.');
      end if;
    end if;

    v_soma := v_soma + v_valor;
  end loop;

  -- A soma tem de fechar com o que foi cobrado: trocar a forma não muda o valor.
  if v_soma <> v_total_original then
    return jsonb_build_object('ok', false, 'soma_divergente', true,
      'erro', 'A soma das formas não fecha com o valor já pago.',
      'somado', v_soma::numeric(12,2), 'total', v_total_original::numeric(12,2));
  end if;

  -- Trocar por exatamente o que já está registrado não é troca.
  if v_qtd = 1 and jsonb_array_length(p_dados -> 'linhas') = 1 then
    select * into v_pag from public.payments p
      where p.order_id = p_order_id and p.status = 'confirmed';
    if v_pag.payment_method_id = nullif(p_dados -> 'linhas' -> 0 ->> 'forma_id', '')::uuid
       and v_pag.payment_brand_id is not distinct from nullif(p_dados -> 'linhas' -> 0 ->> 'bandeira_id', '')::uuid then
      return jsonb_build_object('ok', false, 'erro', 'Essa já é a forma registrada neste pedido.');
    end if;
  end if;

  -- 4. ESTORNA O QUE ESTAVA REGISTRADO — na sessão ORIGINAL.
  for v_pag in
    select * from public.payments p
     where p.order_id = p_order_id and p.status = 'confirmed'
     order by p.created_at
     for update
  loop
    v_antes := v_antes || jsonb_build_array(jsonb_build_object(
      'forma', v_pag.payment_method_name_snapshot, 'familia', v_pag.payment_method_family_snapshot,
      'bandeira', v_pag.payment_brand_name_snapshot, 'valor', v_pag.amount));

    select * into v_mov from public.cash_movements m
      where m.payment_id = v_pag.id and m.movement_type = 'sale_receipt' and m.reversed_at is null;

    if v_mov.id is not null then
      insert into public.cash_movements (
        cash_session_id, movement_type, direction, amount,
        order_id, payment_id, reason, created_by, reverses_movement_id)
      values (v_sessao.id, 'refund', 'out', v_mov.amount,
        p_order_id, v_pag.id, 'Troca de forma: ' || v_motivo, v_ator, v_mov.id);

      update public.cash_movements
         set reversed_at = now(), reversed_by = v_ator, reversal_reason = 'Troca de forma: ' || v_motivo
       where id = v_mov.id;
    end if;

    update public.payments
       set status = 'reversed', reversed_at = now(), reversed_by = v_ator,
           reversal_reason = 'Troca de forma: ' || v_motivo
     where id = v_pag.id;
  end loop;

  -- 5. REGISTRA O QUE FOI DE FATO RECEBIDO — na mesma sessão e no mesmo dia.
  for v_linha in select * from jsonb_array_elements(p_dados -> 'linhas') loop
    v_valor := (v_linha ->> 'valor')::numeric;
    select * into v_forma from public.payment_methods m where m.id = (v_linha ->> 'forma_id')::uuid;

    v_bandeira_id := null;
    v_bandeira_nome := null;
    if v_forma.requires_brand then
      select b.id, b.name into v_bandeira_id, v_bandeira_nome
        from public.payment_brands b where b.id = nullif(v_linha ->> 'bandeira_id', '')::uuid;
    end if;

    v_recebido := nullif(v_linha ->> 'recebido', '')::numeric;
    v_troco := case when v_recebido is not null then v_recebido - v_valor end;
    v_na_gaveta := v_forma.payment_family = 'cash' and coalesce((v_linha ->> 'na_gaveta')::boolean, true);

    insert into public.payments (
      order_id, payment_method_id, payment_brand_id,
      payment_method_name_snapshot, payment_method_family_snapshot, payment_brand_name_snapshot,
      amount, tendered_amount, change_amount,
      status, received_at, confirmed_by, cash_session_id,
      idempotency_key, notes
    ) values (
      p_order_id, v_forma.id, v_bandeira_id,
      v_forma.name, v_forma.payment_family, v_bandeira_nome,
      v_valor, v_recebido, v_troco,
      'confirmed', v_recebido_em, v_ator, v_sessao.id,
      case when v_primeira then v_idem end,
      'Troca de forma de pagamento: ' || v_motivo
    ) returning id into v_pagamento_id;
    v_primeira := false;

    if v_na_gaveta then
      insert into public.cash_movements (
        cash_session_id, movement_type, direction, amount, order_id, payment_id, created_by)
      values (v_sessao.id, 'sale_receipt', 'in', v_valor, p_order_id, v_pagamento_id, v_ator);
    end if;

    v_depois := v_depois || jsonb_build_array(jsonb_build_object(
      'forma', v_forma.name, 'familia', v_forma.payment_family,
      'bandeira', v_bandeira_nome, 'valor', v_valor::numeric(12,2)));
  end loop;

  -- 6. SESSÃO FECHADA — o fechamento original fica guardado; esperado e
  -- diferença são recalculados. A contagem física não é tocada.
  if v_sessao.status = 'closed' then
    v_esperado := public.esperado_em_caixa(v_sessao.id);
    v_diferenca := v_sessao.counted_cash_amount - v_esperado;
    v_snapshot := jsonb_build_object(
      'esperado', v_sessao.expected_cash_amount, 'contado', v_sessao.counted_cash_amount,
      'diferenca', v_sessao.difference_amount, 'justificativa', v_sessao.difference_reason);

    update public.cash_sessions
       set expected_cash_amount = v_esperado,
           difference_amount = v_diferenca,
           -- A diferença só pode existir com justificativa (RN-CAIXA-012). Se a
           -- correção CRIA uma diferença onde não havia, a justificativa é a própria troca.
           difference_reason = case
             when v_diferenca <> 0 and (difference_reason is null or length(btrim(difference_reason)) < 3)
               then 'Correção de forma de pagamento: ' || v_motivo
             else difference_reason end
     where id = v_sessao.id;

    insert into public.cash_session_corrections (
      cash_session_id, correction_type, reason, before_snapshot, after_snapshot, created_by)
    values (v_sessao.id, 'payment_change', v_motivo, v_snapshot,
      jsonb_build_object('esperado', v_esperado, 'contado', v_sessao.counted_cash_amount,
                         'diferenca', v_diferenca, 'pedido_id', p_order_id,
                         'de', v_antes, 'para', v_depois),
      v_ator);

    perform public.log_audit('caixa_correcao_pagamento', 'cash_sessions', v_sessao.id,
      v_snapshot,
      jsonb_build_object('esperado', v_esperado, 'diferenca', v_diferenca, 'pedido_id', p_order_id),
      v_motivo);
  end if;

  perform public.log_audit('pagamento_trocar_forma', 'orders', p_order_id,
    jsonb_build_object('linhas', v_antes, 'cash_session_id', v_sessao.id),
    jsonb_build_object('linhas', v_depois, 'total', v_soma::numeric(12,2),
                       'sessao_fechada', v_sessao.status = 'closed'),
    v_motivo);

  return jsonb_build_object('ok', true, 'ja_existia', false, 'pedido_id', p_order_id,
    'sessao_id', v_sessao.id, 'sessao_fechada', v_sessao.status = 'closed',
    'esperado', v_esperado, 'diferenca', v_diferenca,
    'de', v_antes, 'para', v_depois);
end;
$$;

comment on function public.trocar_forma_de_pagamento is
  'D-2026-10-24-167: troca a forma de pagamento na sessão ORIGINAL, em um ato. Sessão fechada: fechamento original preservado em cash_session_corrections.';

revoke all on function public.trocar_forma_de_pagamento(uuid, jsonb) from public, anon;
grant execute on function public.trocar_forma_de_pagamento(uuid, jsonb) to authenticated;
