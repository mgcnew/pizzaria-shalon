-- 0070 — A resposta do pagamento no mesmo padrão monetário das colunas
-- CLAUDE.md §24 · RN-PGTO-005 · Ajuste sobre a 0064
--
-- O DESVIO, encontrado pelo cenário do troco.
--
-- As colunas de dinheiro são `numeric(12,2)`: o banco grava 50.00. Mas a
-- resposta da RPC era montada a partir das variáveis locais, cujo valor vem
-- do que foi digitado — então "recebido: 100" produzia "troco: 50", e o
-- mesmo troco lido da tabela dizia "50.00".
--
-- Nada estava errado no dinheiro: 50 e 50.00 são o mesmo número, e a coluna
-- sempre guardou a escala certa. O que estava errado era a MESMA função
-- responder em dois formatos conforme o que a pessoa digitou.
--
-- A correção é o cast explícito para `numeric(12,2)` na resposta. Ele NÃO
-- entra antes da validação de centavos — lá o valor precisa continuar cru,
-- senão 100,005 seria arredondado para 100,01 e passaria como válido em vez
-- de ser recusado.

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
      'somado', v_soma::numeric(12,2), 'total', v_pedido.total);
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
      -- numeric(12,2) explícito: é o mesmo padrão monetário das colunas.
      -- Sem o cast, "50" e "50.00" sairiam da mesma função conforme o que a
      -- pessoa digitou, e a resposta deixaria de espelhar o que foi gravado.
      'valor', v_valor::numeric(12,2),
      'recebido', v_recebido::numeric(12,2),
      'troco', v_troco::numeric(12,2),
      'na_gaveta', v_na_gaveta));
  end loop;

  update public.orders set payment_status = 'confirmed' where id = p_order_id;

  perform public.log_audit('pagamento_registrar', 'orders', p_order_id,
    jsonb_build_object('payment_status', v_pedido.payment_status,
                       'esperado', v_intencao.payment_method_name_snapshot,
                       'esperado_valor', v_intencao.amount_expected),
    jsonb_build_object('linhas', v_registrados, 'total', v_soma::numeric(12,2),
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
    'pedido_id', p_order_id, 'total', v_soma::numeric(12,2),
    'linhas', v_registrados,
    'divergiu_do_esperado', v_divergiu,
    'sem_caixa_aberto', v_excecao);
end;
$$;

comment on function public.registrar_pagamento is 'RN-PGTO-002/003: o que foi RECEBIDO. Um ato por pedido, com split. Resposta no mesmo padrão monetário das colunas.';
