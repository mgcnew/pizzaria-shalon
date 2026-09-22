-- 0064 — Pagamento realizado: split, troco, reversão e o portão da conclusão
-- 04-REGRAS-NEGOCIO.md RN-PGTO-002/003/004/005/006, RN-CAIXA-001/003/014
-- 02-MODELO-DADOS-SUPABASE.md §10.5 · 01-DOCUMENTO-MESTRE.md §79.12 e §79.18
-- CLAUDE.md §16, §24, §34 · Invariantes 11, 13 e 14 de 04 §44
--
-- A INTENÇÃO NUNCA É TOCADA. `order_payment_intents` continua dizendo o que o
-- cliente escolheu no checkout, mesmo quando ele pagou outra coisa. Quem
-- responde "quanto entrou" é `payments`, e é ela que os relatórios usam
-- (RN-PGTO-003). Sobrescrever a intenção para "arrumar" o histórico apagaria
-- justamente o dado que explica a diferença.
--
-- VENDA NÃO É O QUE O CLIENTE ENTREGOU NA MÃO. Venda de R$ 45 com nota de
-- R$ 50 é R$ 45 de receita e R$ 5 de troco: `amount` guarda 45,
-- `tendered_amount` guarda 50 e `change_amount` guarda 5. O caixa físico
-- recebe 45 líquidos.

alter table public.payments
  -- Snapshot do meio de pagamento (CLAUDE.md §16): renomear ou desativar a
  -- forma no cadastro não pode reescrever o que foi recebido ontem.
  add column payment_method_name_snapshot text,
  add column payment_method_family_snapshot text,
  add column payment_brand_name_snapshot text,

  -- Dinheiro: o que veio na mão e o troco devolvido.
  add column tendered_amount numeric(12, 2),
  add column change_amount numeric(12, 2),

  -- Onde o dinheiro entrou. NULO significa "não entrou em gaveta nenhuma" —
  -- ou porque é uma exceção autorizada (RN-CAIXA-003), ou porque o valor
  -- ainda está fora do balcão (RN-CAIXA-014). Nos dois casos, não é caixa
  -- físico.
  add column cash_session_id uuid references public.cash_sessions (id) on delete restrict,

  -- Proteção contra clique duplo e reenvio (CLAUDE.md §34).
  add column idempotency_key uuid,

  -- Reversão vinculada: o original fica (RN-FIN-003/004).
  add column reverses_payment_id uuid references public.payments (id) on delete restrict,
  add column reversed_at timestamptz,
  add column reversed_by uuid references public.app_users (id) on delete restrict,
  add column reversal_reason text;

alter table public.payments
  add constraint payments_troco_coerente check (
    (tendered_amount is null and change_amount is null)
    or (tendered_amount is not null and change_amount is not null
        and tendered_amount >= amount
        and change_amount = tendered_amount - amount)
  ),
  add constraint payments_reversao_coerente check (
    (reversed_at is null and reversed_by is null)
    or (reversed_at is not null and reversed_by is not null
        and reversal_reason is not null and length(btrim(reversal_reason)) >= 3)
  ),
  -- Centavos exatos. Sem tolerância: uma "diferença de arredondamento"
  -- aceita em silêncio é dinheiro que ninguém explica depois (§24).
  add constraint payments_centavos check (amount = round(amount, 2));

create unique index payments_idempotencia on public.payments (idempotency_key)
  where idempotency_key is not null;
create unique index payments_reversao_unica on public.payments (reverses_payment_id)
  where reverses_payment_id is not null;
create index payments_da_sessao on public.payments (cash_session_id) where cash_session_id is not null;

comment on column public.payments.amount is 'A VENDA. Não é o que o cliente entregou na mão — isso é tendered_amount.';
comment on column public.payments.cash_session_id is 'Nulo = não entrou em gaveta. Exceção autorizada ou valor ainda fora (RN-CAIXA-014).';

-- `driver_run_id` está previsto em 02 §10.5 e NÃO foi criado aqui: depende de
-- `driver_runs`, que é da Fase 8. O que a Fase 7 precisa dela — saber que há
-- dinheiro fora da gaveta — já é respondido por `cash_session_id is null`.

-- ===========================================================================
-- REGISTRAR O PAGAMENTO RECEBIDO
-- ===========================================================================
-- UM ATO POR PEDIDO, com quantas linhas forem necessárias. O split do §8 é
-- um ato de duas linhas (R$ 30 dinheiro + R$ 25 débito), não dois atos de
-- meio pagamento. Isso evita a pergunta que os documentos não respondem —
-- "o que é um pedido parcialmente pago?" — sem tirar nada de quem opera.
create or replace function public.registrar_pagamento(p_order_id uuid, p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_pedido record;
  v_intencao record;
  v_sessao record;
  v_sessao_id uuid;
  v_excecao boolean := false;
  v_idem uuid;
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
  v_pagamento_id uuid;
  v_registrados jsonb := '[]'::jsonb;
  v_na_gaveta boolean;
  v_divergiu boolean := false;
  v_qtd integer;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('payments.register') then
    return jsonb_build_object('ok', false, 'erro',
      'Você não tem permissão para registrar pagamento.');
  end if;

  -- 1. IDEMPOTÊNCIA — antes de qualquer escrita.
  begin
    v_idem := nullif(p_dados ->> 'idempotency_key', '')::uuid;
  exception when others then
    v_idem := null;
  end;

  if v_idem is not null then
    select count(*) into v_qtd from public.payments p where p.idempotency_key = v_idem;
    if v_qtd > 0 then
      return jsonb_build_object('ok', true, 'ja_existia', true, 'pedido_id', p_order_id);
    end if;
  end if;

  -- 2. O PEDIDO — travado, porque duas pessoas podem estar no balcão.
  select * into v_pedido from public.orders o where o.id = p_order_id for update;
  if v_pedido.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Pedido não encontrado.');
  end if;
  if v_pedido.status in ('cancelled', 'rejected') then
    return jsonb_build_object('ok', false, 'erro',
      'Pedido cancelado ou rejeitado não recebe pagamento.');
  end if;

  select count(*) into v_qtd from public.payments p
    where p.order_id = p_order_id and p.status = 'confirmed';
  if v_qtd > 0 then
    return jsonb_build_object('ok', false, 'erro',
      'Este pedido já tem pagamento registrado. Para corrigir, estorne o anterior.',
      'ja_pago', true);
  end if;

  -- 3. CAIXA — RN-CAIXA-001: venda normal exige sessão aberta.
  -- RN-CAIXA-003 permite exceção, e ela é EXPLÍCITA: depende de permissão
  -- própria, é registrada e vai para a auditoria. Não é fallback silencioso.
  select * into v_sessao from public.cash_sessions s
    where s.status = 'open' order by s.opened_at desc limit 1;

  if v_sessao.id is null then
    if not public.has_permission('cash.bypass_session') then
      return jsonb_build_object('ok', false, 'sem_caixa', true, 'erro',
        'Não há caixa aberto. Abra o caixa antes de registrar o recebimento.');
    end if;
    v_excecao := true;
  else
    v_sessao_id := v_sessao.id;
  end if;

  -- 4. AS LINHAS — validadas TODAS antes de gravar QUALQUER uma.
  if jsonb_typeof(p_dados -> 'linhas') <> 'array'
     or jsonb_array_length(p_dados -> 'linhas') = 0 then
    return jsonb_build_object('ok', false, 'erro', 'Informe ao menos uma forma de pagamento.');
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

    -- RN-PGTO-006: bandeira é dado configurável e tem de pertencer à forma.
    -- Visa/Master não são regra de domínio; são linha de cadastro.
    if v_forma.requires_brand then
      select b.id, b.name into v_bandeira_id, v_bandeira_nome
        from public.payment_brands b
        where b.id = nullif(v_linha ->> 'bandeira_id', '')::uuid
          and b.payment_method_id = v_forma.id and b.is_active;
      if v_bandeira_id is null then
        return jsonb_build_object('ok', false, 'erro',
          format('Escolha a bandeira aceita para %s.', v_forma.name));
      end if;
    else
      v_bandeira_id := null;
    end if;

    -- Duas linhas da MESMA forma e bandeira são incoerentes: é uma linha só,
    -- com o valor somado. Aceitar as duas esconderia um erro de digitação.
    v_chave := v_forma.id::text || ':' || coalesce(v_bandeira_id::text, '-');
    if v_chave = any(v_vistos) then
      return jsonb_build_object('ok', false, 'erro',
        format('%s aparece duas vezes na divisão. Some em uma linha só.', v_forma.name));
    end if;
    v_vistos := v_vistos || v_chave;

    -- RN-PGTO-005: troco só existe em dinheiro.
    if nullif(v_linha ->> 'recebido', '') is not null then
      if v_forma.payment_family <> 'cash' then
        return jsonb_build_object('ok', false, 'erro',
          'Troco só se aplica a pagamento em dinheiro.');
      end if;
      v_recebido := (v_linha ->> 'recebido')::numeric;
      if v_recebido < v_valor then
        return jsonb_build_object('ok', false, 'erro',
          'O valor recebido em dinheiro não pode ser menor que o valor da linha.');
      end if;
    end if;

    v_soma := v_soma + v_valor;
  end loop;

  -- 5. A SOMA — exata, sem tolerância (§24).
  if v_soma <> v_pedido.total then
    return jsonb_build_object('ok', false, 'soma_divergente', true,
      'erro', 'A soma das formas não fecha com o total do pedido.',
      'somado', v_soma, 'total', v_pedido.total);
  end if;

  select * into v_intencao from public.order_payment_intents i where i.order_id = p_order_id;

  -- 6. GRAVAÇÃO
  for v_linha in select * from jsonb_array_elements(p_dados -> 'linhas') loop
    v_valor := (v_linha ->> 'valor')::numeric;

    select * into v_forma from public.payment_methods m
      where m.id = (v_linha ->> 'forma_id')::uuid;

    v_bandeira_id := null;
    v_bandeira_nome := null;
    if v_forma.requires_brand then
      select b.id, b.name into v_bandeira_id, v_bandeira_nome
        from public.payment_brands b where b.id = (v_linha ->> 'bandeira_id')::uuid;
    end if;

    v_recebido := nullif(v_linha ->> 'recebido', '')::numeric;
    v_troco := case when v_recebido is not null then v_recebido - v_valor end;

    -- RN-PGTO-002: o realizado diferiu do esperado? Fica dito na auditoria.
    if v_intencao.id is not null and v_forma.id is distinct from v_intencao.payment_method_id then
      v_divergiu := true;
    end if;

    -- Só dinheiro entra na gaveta. Cartão e Pix são recebimento, não papel
    -- na caixa — e tratá-los como dinheiro físico quebraria o fechamento
    -- (§13 da autorização, 03 §16.4).
    v_na_gaveta := v_forma.payment_family = 'cash'
                   and v_sessao_id is not null
                   and coalesce((v_linha ->> 'na_gaveta')::boolean, true);

    insert into public.payments (
      order_id, payment_method_id, payment_brand_id,
      payment_method_name_snapshot, payment_method_family_snapshot,
      payment_brand_name_snapshot,
      amount, tendered_amount, change_amount,
      status, received_at, confirmed_by, cash_session_id,
      idempotency_key, notes
    ) values (
      p_order_id, v_forma.id, v_bandeira_id,
      v_forma.name, v_forma.payment_family, v_bandeira_nome,
      v_valor, v_recebido, v_troco,
      'confirmed', now(), v_ator,
      -- Não-dinheiro também aponta para a sessão: o fechamento precisa
      -- listar recebimentos POR MÉTODO, e não só o que virou papel.
      case when v_na_gaveta or (v_forma.payment_family <> 'cash' and v_sessao_id is not null)
           then v_sessao_id end,
      v_idem, nullif(btrim(coalesce(p_dados ->> 'observacao', '')), '')
    ) returning id into v_pagamento_id;

    -- O movimento físico existe SÓ para dinheiro que entrou na gaveta.
    if v_na_gaveta then
      insert into public.cash_movements (
        cash_session_id, movement_type, direction, amount,
        order_id, payment_id, created_by)
      values (v_sessao_id, 'sale_receipt', 'in', v_valor,
        p_order_id, v_pagamento_id, v_ator);
    end if;

    v_registrados := v_registrados || jsonb_build_array(jsonb_build_object(
      'pagamento_id', v_pagamento_id, 'forma', v_forma.name,
      'familia', v_forma.payment_family, 'bandeira', v_bandeira_nome,
      'valor', v_valor, 'recebido', v_recebido, 'troco', v_troco,
      'na_gaveta', v_na_gaveta));
  end loop;

  update public.orders set payment_status = 'confirmed' where id = p_order_id;

  perform public.log_audit('pagamento_registrar', 'orders', p_order_id,
    jsonb_build_object('payment_status', v_pedido.payment_status,
                       'esperado', v_intencao.payment_method_name_snapshot,
                       'esperado_valor', v_intencao.amount_expected),
    jsonb_build_object('linhas', v_registrados, 'total', v_soma,
                       'divergiu_do_esperado', v_divergiu,
                       'sem_caixa_aberto', v_excecao,
                       'cash_session_id', v_sessao_id),
    nullif(btrim(coalesce(p_dados ->> 'observacao', '')), ''));

  -- RN-CAIXA-003: a exceção não some no meio do log de sucesso.
  if v_excecao then
    perform public.log_audit('caixa_excecao_sem_sessao', 'orders', p_order_id, null,
      jsonb_build_object('total', v_soma), 'Recebimento registrado sem caixa aberto');
  end if;

  return jsonb_build_object('ok', true, 'ja_existia', false,
    'pedido_id', p_order_id, 'total', v_soma,
    'linhas', v_registrados,
    'divergiu_do_esperado', v_divergiu,
    'sem_caixa_aberto', v_excecao);
end;
$$;

comment on function public.registrar_pagamento is 'RN-PGTO-002/003: o que foi RECEBIDO. Um ato por pedido, com split. Não toca a intenção do checkout.';

revoke all on function public.registrar_pagamento(uuid, jsonb) from public, anon;
grant execute on function public.registrar_pagamento(uuid, jsonb) to authenticated;

-- ===========================================================================
-- ESTORNAR
-- ===========================================================================
-- RN-FIN-003/004: nada é apagado. Cada pagamento vira `reversed` e cada
-- entrada de gaveta ganha um movimento compensatório VINCULADO ao original.
--
-- Para onde vai o movimento compensatório: se a sessão original ainda está
-- aberta, para ela. Se já fechou, para a sessão aberta agora — porque é daí
-- que o dinheiro sai de verdade, e porque mexer numa sessão fechada violaria
-- RN-CAIXA-015.
create or replace function public.reverter_pagamento(p_order_id uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_pedido record;
  v_pag record;
  v_mov record;
  v_sessao_aberta uuid;
  v_destino uuid;
  v_qtd integer := 0;
  v_total numeric := 0;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('finance.reverse') then
    return jsonb_build_object('ok', false, 'erro',
      'Você não tem permissão para estornar.');
  end if;
  if v_motivo is null then
    return jsonb_build_object('ok', false, 'erro', 'Informe o motivo do estorno.');
  end if;

  select * into v_pedido from public.orders o where o.id = p_order_id for update;
  if v_pedido.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Pedido não encontrado.');
  end if;

  select count(*) into v_qtd from public.payments p
    where p.order_id = p_order_id and p.status = 'confirmed';
  if v_qtd = 0 then
    return jsonb_build_object('ok', false, 'erro',
      'Este pedido não tem pagamento confirmado para estornar.');
  end if;

  select s.id into v_sessao_aberta from public.cash_sessions s
    where s.status = 'open' order by s.opened_at desc limit 1;

  for v_pag in
    select * from public.payments p
     where p.order_id = p_order_id and p.status = 'confirmed'
     for update
  loop
    select * into v_mov from public.cash_movements m
      where m.payment_id = v_pag.id and m.movement_type = 'sale_receipt'
        and m.reversed_at is null;

    if v_mov.id is not null then
      -- Dinheiro que entrou na gaveta precisa sair de alguma gaveta.
      v_destino := case when (select s.status from public.cash_sessions s
                               where s.id = v_mov.cash_session_id) = 'open'
                        then v_mov.cash_session_id else v_sessao_aberta end;

      if v_destino is null then
        return jsonb_build_object('ok', false, 'sem_caixa', true, 'erro',
          'O caixa daquele recebimento já foi fechado e não há caixa aberto agora. Abra o caixa para estornar.');
      end if;

      insert into public.cash_movements (
        cash_session_id, movement_type, direction, amount,
        order_id, payment_id, reason, created_by, reverses_movement_id)
      values (v_destino, 'refund', 'out', v_mov.amount,
        p_order_id, v_pag.id, v_motivo, v_ator, v_mov.id);

      update public.cash_movements
         set reversed_at = now(), reversed_by = v_ator, reversal_reason = v_motivo
       where id = v_mov.id;
    end if;

    update public.payments
       set status = 'reversed', reversed_at = now(),
           reversed_by = v_ator, reversal_reason = v_motivo
     where id = v_pag.id;

    v_total := v_total + v_pag.amount;
  end loop;

  update public.orders set payment_status = 'reversed' where id = p_order_id;

  perform public.log_audit('pagamento_estornar', 'orders', p_order_id,
    jsonb_build_object('payment_status', 'confirmed', 'total', v_total),
    jsonb_build_object('payment_status', 'reversed', 'linhas_estornadas', v_qtd),
    v_motivo);

  return jsonb_build_object('ok', true, 'estornadas', v_qtd, 'total', v_total);
end;
$$;

comment on function public.reverter_pagamento is 'RN-FIN-003/004: nada é apagado. Movimento compensatório vinculado ao original.';

revoke all on function public.reverter_pagamento(uuid, text) from public, anon;
grant execute on function public.reverter_pagamento(uuid, text) to authenticated;
