-- 0164 — Pedido do cliente com taxa de entrega a confirmar
-- D-2026-10-17-149 · CLAUDE.md §20, §23, §33, §34
--
-- Quando o endereço do cliente não é localizado no mapa (ou o serviço de
-- rotas falha), o site deixava de aceitar a entrega e a venda se perdia.
-- Decisão da dona: o cliente pode enviar mesmo assim, com a taxa "a
-- confirmar pela loja (até R$ X)". X é a maior taxa entre as faixas ativas.
--
--   · o pedido nasce aguardando aprovação de entrega, com taxa 0 PROVISÓRIA
--     e marcado `taxa_a_confirmar` no endereço do pedido;
--   · a aprovação EXIGE a taxa (entre 0 e o teto que o cliente viu), com a
--     permissão `orders.override_delivery_fee`. Nunca sai R$ 0 por omissão:
--     sem a taxa digitada, não aprova. Acima do teto, recusa ou combina;
--   · Pix antecipado não é aceito nesse caso (não há total fechado);
--   · troco precisa cobrir subtotal + teto;
--   · a taxa definida fica guardada no endereço do cliente (como em 0163) e
--     é auditada (`taxa_entrega_manual`).
--
-- Só o caminho PÚBLICO usa isto. O balcão tem a taxa à mão (0161/0162).

-- 1. Teto mostrado ao cliente --------------------------------------------
create or replace function public.teto_da_taxa_de_entrega(p_segredo text)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_teto numeric;
begin
  if not public.origem_confiavel(p_segredo) then
    return jsonb_build_object('ok', false, 'erro', 'origem_nao_confiavel');
  end if;
  select max(b.fee) into v_teto from public.delivery_fee_bands b where b.is_active;
  if v_teto is null then
    return jsonb_build_object('ok', false, 'erro', 'entrega_nao_configurada');
  end if;
  return jsonb_build_object('ok', true, 'teto', v_teto);
end;
$function$;

revoke all on function public.teto_da_taxa_de_entrega(text) from public;
grant execute on function public.teto_da_taxa_de_entrega(text) to anon, authenticated;

-- 2. criar_pedido ----------------------------------------------------------
do $$
declare
  v_def text := pg_get_functiondef('public.criar_pedido(jsonb,text)'::regprocedure);
  v_novo text := v_def;
begin
  if v_def like '%v_taxa_a_confirmar%' then
    return;
  end if;

  v_novo := replace(v_novo,
    E'  v_taxa_calculada numeric;\nbegin',
    E'  v_taxa_calculada numeric;\n  -- Taxa a confirmar pela loja, no pedido do cliente (0164).\n  v_taxa_a_confirmar boolean := false;\n  v_teto numeric;\nbegin');

  v_novo := replace(v_novo,
    E'    -- Com motivo, a rota é medida normalmente e só a taxa cobrada muda.\n    if v_taxa_manual is null or v_motivo_taxa is not null then',
    E'    v_taxa_a_confirmar := coalesce((p_pedido ->> ''taxa_a_confirmar'')::boolean, false);\n\n'
    || E'    if v_taxa_a_confirmar then\n'
    || E'      -- Endereço não localizado: a loja confirma a taxa na aprovação (0164).\n'
    || E'      if v_interno is not null or v_taxa_manual is not null then\n'
    || E'        return jsonb_build_object(''ok'', false, ''erro'', ''Taxa de entrega inválida.'');\n'
    || E'      end if;\n'
    || E'      select max(b.fee) into v_teto from public.delivery_fee_bands b where b.is_active;\n'
    || E'      if v_teto is null then\n'
    || E'        return jsonb_build_object(''ok'', false, ''erro'',\n'
    || E'          ''A entrega não está configurada. Você pode escolher retirada.'');\n'
    || E'      end if;\n'
    || E'      v_taxa := 0;\n'
    || E'      v_distancia := null;\n'
    || E'      v_faixa_id := null;\n'
    || E'      v_exige_aprovacao := true;\n'
    || E'    -- Com motivo, a rota é medida normalmente e só a taxa cobrada muda.\n'
    || E'    elsif v_taxa_manual is null or v_motivo_taxa is not null then');

  v_novo := replace(v_novo,
    E'  if v_forma.payment_family = ''pix_key''\n     and not exists',
    E'  if v_taxa_a_confirmar and v_forma.payment_family = ''pix_key'' then\n'
    || E'    return jsonb_build_object(''ok'', false, ''erro'',\n'
    || E'      ''Com a taxa de entrega a confirmar, o pagamento é feito na entrega.'');\n'
    || E'  end if;\n\n'
    || E'  if v_forma.payment_family = ''pix_key''\n     and not exists');

  v_novo := replace(v_novo,
    E'    if v_troco_para is null or v_troco_para < v_total then',
    E'    if v_troco_para is null or v_troco_para < v_total + coalesce(v_teto, 0) then');

  v_novo := replace(v_novo,
    E'      ''motivo_taxa'', v_motivo_taxa\n    ) end,',
    E'      ''motivo_taxa'', v_motivo_taxa,\n      ''taxa_a_confirmar'', v_taxa_a_confirmar,\n      ''taxa_teto'', v_teto\n    ) end,');

  v_novo := replace(v_novo,
    E'    ''aceito_na_criacao'', v_aceito_na_criacao,',
    E'    ''aceito_na_criacao'', v_aceito_na_criacao,\n    ''taxa_a_confirmar'', v_taxa_a_confirmar,');

  if v_novo not like '%elsif v_taxa_manual is null or v_motivo_taxa is not null then%'
     or v_novo not like '%Com a taxa de entrega a confirmar%'
     or v_novo not like '%v_total + coalesce(v_teto, 0)%'
     or v_novo not like '%''taxa_teto'', v_teto%'
     or v_novo not like '%''taxa_a_confirmar'', v_taxa_a_confirmar,%' then
    raise exception 'criar_pedido mudou: o patch da taxa a confirmar não encontrou todos os trechos';
  end if;

  execute v_novo;
end;
$$;

alter table public.orders drop constraint orders_entrega_com_snapshot;
alter table public.orders add constraint orders_entrega_com_snapshot check (
  fulfillment_type = 'pickup'
  or (delivery_address_snapshot is not null
      and (delivery_route_distance_km is not null
           or coalesce((delivery_address_snapshot ->> 'taxa_manual')::boolean, false)
           or coalesce((delivery_address_snapshot ->> 'taxa_a_confirmar')::boolean, false)))
);

-- 3. comando_pedido: aprovar a entrega exige a taxa ------------------------
do $$
declare
  v_def text := pg_get_functiondef('public.comando_pedido(uuid,text,jsonb)'::regprocedure);
  v_novo text := v_def;
begin
  if v_def like '%taxa_a_confirmar%' then
    return;
  end if;

  v_novo := replace(v_novo,
    E'  v_revisao_aberta boolean;\nbegin',
    E'  v_revisao_aberta boolean;\n  -- Taxa definida na aprovação (0164).\n  v_taxa numeric;\n  v_teto numeric;\nbegin');

  v_novo := replace(v_novo,
    E'      return jsonb_build_object(''ok'', false, ''erro'', ''Este pedido não aguarda aprovação de entrega.'');\n    end if;\n',
    E'      return jsonb_build_object(''ok'', false, ''erro'', ''Este pedido não aguarda aprovação de entrega.'');\n    end if;\n\n'
    || E'    -- Endereço não localizado: a aprovação define a taxa (0164).\n'
    || E'    if coalesce((v_pedido.delivery_address_snapshot ->> ''taxa_a_confirmar'')::boolean, false)\n'
    || E'       and (v_pedido.delivery_address_snapshot ->> ''taxa_definida'') is null then\n'
    || E'      if not public.has_permission(''orders.override_delivery_fee'') then\n'
    || E'        return jsonb_build_object(''ok'', false, ''erro'',\n'
    || E'          ''Você não tem permissão para definir a taxa de entrega.'');\n'
    || E'      end if;\n'
    || E'      begin\n'
    || E'        v_taxa := nullif(p_dados ->> ''taxa'', '''')::numeric;\n'
    || E'      exception when others then\n'
    || E'        return jsonb_build_object(''ok'', false, ''erro'', ''Taxa de entrega inválida.'');\n'
    || E'      end;\n'
    || E'      if v_taxa is null then\n'
    || E'        return jsonb_build_object(''ok'', false, ''exige_taxa'', true,\n'
    || E'          ''erro'', ''Informe a taxa de entrega para aprovar.'');\n'
    || E'      end if;\n'
    || E'      v_teto := (v_pedido.delivery_address_snapshot ->> ''taxa_teto'')::numeric;\n'
    || E'      if v_taxa < 0 or v_teto is null or v_taxa > v_teto then\n'
    || E'        return jsonb_build_object(''ok'', false, ''erro'',\n'
    || E'          format(''A taxa precisa ficar até R$ %s, o limite que o cliente viu. Acima disso, recuse ou combine com o cliente.'',\n'
    || E'                 to_char(v_teto, ''FM999G999D00'')));\n'
    || E'      end if;\n'
    || E'      v_taxa := round(v_taxa, 2);\n\n'
    || E'      update public.orders\n'
    || E'         set delivery_fee = v_taxa,\n'
    || E'             total = subtotal + v_taxa,\n'
    || E'             delivery_address_snapshot = delivery_address_snapshot\n'
    || E'               || jsonb_build_object(''taxa_definida'', v_taxa)\n'
    || E'       where id = p_order_id;\n\n'
    || E'      update public.order_payment_intents\n'
    || E'         set amount_expected = v_pedido.subtotal + v_taxa,\n'
    || E'             expected_change_amount = case when change_for_amount is not null\n'
    || E'               then change_for_amount - (v_pedido.subtotal + v_taxa) end\n'
    || E'       where order_id = p_order_id;\n\n'
    || E'      -- Fica guardada no endereço do cliente, como a taxa do balcão (0163).\n'
    || E'      update public.customer_addresses\n'
    || E'         set agreed_delivery_fee = v_taxa,\n'
    || E'             agreed_fee_reason = ''Endereço não localizado no mapa'',\n'
    || E'             agreed_fee_at = now(),\n'
    || E'             agreed_fee_by = v_ator\n'
    || E'       where id = nullif(v_pedido.delivery_address_snapshot ->> ''endereco_id'', '''')::uuid;\n\n'
    || E'      perform public.log_audit(''taxa_entrega_manual'', ''orders'', p_order_id,\n'
    || E'        jsonb_build_object(''taxa'', v_pedido.delivery_fee),\n'
    || E'        jsonb_build_object(''taxa'', v_taxa, ''teto'', v_teto),\n'
    || E'        ''Taxa definida na aprovação: o endereço do cliente não foi localizado no mapa.'');\n'
    || E'    end if;\n');

  if v_novo not like '%Taxa definida na aprovação%' or v_novo not like '%v_teto numeric;%' then
    raise exception 'comando_pedido mudou: o patch da taxa a confirmar não encontrou todos os trechos';
  end if;

  execute v_novo;
end;
$$;

-- 4. fila: diz que a taxa está por definir (e o teto) ---------------------------------
do $$
declare
  v_def text := pg_get_functiondef('public.fila_de_pedidos(boolean)'::regprocedure);
  v_novo text;
begin
  if v_def like '%taxa_a_definir%' then
    return;
  end if;
  v_novo := replace(v_def,
    E'      (o.delivery_approval_status = ''pending'') as aguarda_aprovacao_entrega,',
    E'      (o.delivery_approval_status = ''pending'') as aguarda_aprovacao_entrega,\n'
    || E'      -- O teto que o cliente viu, enquanto a taxa não foi definida; senão null.\n'
    || E'      case when coalesce((o.delivery_address_snapshot ->> ''taxa_a_confirmar'')::boolean, false)\n'
    || E'            and (o.delivery_address_snapshot ->> ''taxa_definida'') is null\n'
    || E'           then (o.delivery_address_snapshot ->> ''taxa_teto'')::numeric end as taxa_a_definir,');
  if v_novo = v_def then
    raise exception 'fila_de_pedidos mudou: não achei onde marcar a taxa a definir';
  end if;
  execute v_novo;
end;
$$;
