-- 0078 — Defeito: o item do movimento interno guardava o TAMANHO no lugar da
-- variação. Encontrado pelo teste da Fase 8 (`entregas_fase8.sql`).
--
-- `montar_item` devolve, no detalhe, `tamanho_id` — que é `pizza_sizes.id`.
-- A 0076 gravou esse valor em `internal_product_movement_items.variant_id`,
-- que referencia `product_variants`: a chave estrangeira recusou, e NENHUM
-- consumo, cortesia ou perda de pizza conseguia ser registrado.
--
-- A variação passa a vir da ESCOLHA que a pessoa fez — a mesma que
-- `montar_item` acabou de validar. Para meio a meio não há variação única
-- (são dois sabores, duas variações), e aí o campo fica nulo: quem carrega a
-- identidade do que saiu é o snapshot do nome, que agora usa o rótulo
-- completo que o configurador montou ("Calabresa / Mussarela").

create or replace function public.registrar_movimento_interno(p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_tipo text := nullif(p_dados ->> 'tipo', '');
  v_funcionario uuid;
  v_motivo text := nullif(btrim(coalesce(p_dados ->> 'motivo', '')), '');
  v_idem uuid;
  v_qtd integer;
  v_item jsonb;
  v_res jsonb;
  v_det jsonb;
  v_id uuid;
  v_total numeric := 0;
  v_linhas integer := 0;
  v_func record;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('internal.register') then
    return jsonb_build_object('ok', false, 'erro',
      'Você não tem permissão para registrar movimentos internos.');
  end if;

  if v_tipo not in ('courtesy', 'employee_consumption', 'owner_consumption', 'loss') then
    return jsonb_build_object('ok', false, 'erro', 'Tipo de movimento inválido.');
  end if;
  if v_motivo is null then
    return jsonb_build_object('ok', false, 'erro', 'Informe o motivo.');
  end if;

  begin
    v_idem := nullif(p_dados ->> 'idempotency_key', '')::uuid;
  exception when others then
    v_idem := null;
  end;
  if v_idem is not null then
    select count(*) into v_qtd from public.internal_product_movements m
      where m.idempotency_key = v_idem;
    if v_qtd > 0 then
      return jsonb_build_object('ok', true, 'ja_existia', true);
    end if;
  end if;

  begin
    v_funcionario := nullif(p_dados ->> 'funcionario_id', '')::uuid;
  exception when others then
    v_funcionario := null;
  end;

  -- RN-CONS-001: consumo de funcionário tem dono, e o dono existe.
  if v_tipo = 'employee_consumption' and v_funcionario is null then
    return jsonb_build_object('ok', false, 'erro', 'Escolha o funcionário.');
  end if;
  if v_funcionario is not null then
    select * into v_func from public.employees e where e.id = v_funcionario;
    if v_func.id is null then
      return jsonb_build_object('ok', false, 'erro', 'Funcionário não encontrado.');
    end if;
  end if;
  -- Cortesia e perda não têm funcionário: com um, pareceriam consumo, que é
  -- a confusão que RN-CLASS-001 manda evitar.
  if v_tipo in ('courtesy', 'loss') and v_funcionario is not null then
    return jsonb_build_object('ok', false, 'erro',
      'Cortesia e perda não são vinculadas a funcionário.');
  end if;
  -- RN-CORT-002: cortesia exige autorizador. Quem registra pode ser o
  -- próprio autorizador, mas alguém tem de assinar embaixo.
  if v_tipo = 'courtesy' and nullif(p_dados ->> 'autorizado_por', '') is null then
    return jsonb_build_object('ok', false, 'erro', 'Cortesia exige um autorizador.');
  end if;

  if jsonb_typeof(p_dados -> 'itens') <> 'array'
     or jsonb_array_length(p_dados -> 'itens') = 0 then
    return jsonb_build_object('ok', false, 'erro', 'Informe ao menos um item.');
  end if;

  -- Valida TODOS antes de gravar QUALQUER um.
  for v_item in select * from jsonb_array_elements(p_dados -> 'itens') loop
    v_res := public.montar_item(v_item);
    if not (v_res ->> 'ok')::boolean then
      return jsonb_build_object('ok', false,
        'erro', format('%s: %s', coalesce(v_res ->> 'nome', 'Item'), v_res ->> 'erro'));
    end if;
  end loop;

  insert into public.internal_product_movements (
    movement_type, employee_id, reason, authorized_by, occurred_at,
    attachment_asset_id, notes, created_by, idempotency_key)
  values (
    v_tipo, v_funcionario, v_motivo,
    nullif(p_dados ->> 'autorizado_por', '')::uuid,
    coalesce(nullif(p_dados ->> 'quando', '')::timestamptz, now()),
    nullif(p_dados ->> 'anexo_id', '')::uuid,
    nullif(btrim(coalesce(p_dados ->> 'observacao', '')), ''),
    v_ator, v_idem)
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(p_dados -> 'itens') loop
    v_res := public.montar_item(v_item);
    v_det := v_res -> 'detalhe';

    insert into public.internal_product_movement_items (
      movement_id, product_id, variant_id,
      product_name_snapshot, size_name_snapshot,
      quantity, reference_unit_price, observation)
    values (
      v_id,
      (v_det ->> 'produto_id')::uuid,
      -- A variação ESCOLHIDA, já validada por `montar_item`. Meio a meio não
      -- tem uma: são dois sabores, e o nome abaixo é quem diz quais.
      nullif(v_item ->> 'variacao_id', '')::uuid,
      -- O rótulo completo que o configurador montou. Para meio a meio isto é
      -- "Sabor A / Sabor B" — a única forma de o histórico continuar dizendo
      -- o que saiu depois que o cardápio mudar.
      coalesce(v_res ->> 'nome', v_det ->> 'produto_nome'),
      nullif(v_det ->> 'tamanho_nome', ''),
      (v_res ->> 'quantidade')::numeric,
      (v_res ->> 'preco_unitario')::numeric,
      nullif(btrim(coalesce(v_item ->> 'observacao', '')), ''));

    v_total := v_total + (v_res ->> 'total')::numeric;
    v_linhas := v_linhas + 1;
  end loop;

  perform public.log_audit('interno_' || v_tipo, 'internal_product_movements', v_id, null,
    jsonb_build_object('itens', v_linhas, 'valor_referencia', v_total::numeric(12,2),
                       'funcionario_id', v_funcionario),
    v_motivo);

  -- NÃO cria lançamento no livro do funcionário. Quem decide que este
  -- consumo vira dívida é alguém com permissão financeira, num ato separado.
  return jsonb_build_object('ok', true, 'ja_existia', false,
    'movimento_id', v_id, 'itens', v_linhas,
    'valor_referencia', v_total::numeric(12,2));
end;
$$;

revoke all on function public.registrar_movimento_interno(jsonb) from public, anon;
grant execute on function public.registrar_movimento_interno(jsonb) to authenticated;

comment on column public.internal_product_movement_items.variant_id is
  'Variação escolhida. Nula em meio a meio, onde há mais de uma — o nome do snapshot é quem identifica.';
