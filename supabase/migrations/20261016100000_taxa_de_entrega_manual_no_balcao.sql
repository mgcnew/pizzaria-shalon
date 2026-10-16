-- 0161 — Taxa de entrega informada à mão, no balcão, quando a rota falha
-- D-2026-10-16-138 · CLAUDE.md §20, §33 · RN-ENT (exceção controlada)
--
-- O balcão às vezes não consegue localizar o endereço (CEP desconhecido, rua
-- que o provedor de rotas não acha). Sem rota não havia taxa, e o pedido não
-- saía. A dona pediu uma saída para ESSE caso: a atendente informa o valor.
--
-- Salvaguardas, todas no servidor:
--   · só no caminho INTERNO (lançamento pelo painel). O cliente do link nunca
--     informa taxa: `taxa_manual` vinda do público é recusada;
--   · exige `orders.override_delivery_fee`, a permissão que já existia para
--     "alterar manualmente a taxa de entrega";
--   · valor entre 0 e 500;
--   · fica AUDITADO (`taxa_entrega_manual`) e marcado no endereço do pedido
--     (`taxa_manual: true`), sem distância e sem faixa — nada de distância
--     inventada. A taxa nunca vira R$ 0 por acidente: zero só se digitado.
--
-- Patch no lugar de `criar_pedido` (alterada por várias migrations; cf. 0148).

do $$
declare
  v_def text := pg_get_functiondef('public.criar_pedido(jsonb,text)'::regprocedure);
  v_novo text := v_def;
begin
  if v_def like '%v_taxa_manual%' then
    return;
  end if;

  -- 1. variável
  v_novo := replace(v_novo,
    E'  v_aceito_na_criacao boolean := false;\nbegin',
    E'  v_aceito_na_criacao boolean := false;\n  -- Taxa informada à mão no balcão quando a rota falha (0161).\n  v_taxa_manual numeric;\nbegin');

  -- 2. desvio do cálculo de rota
  v_novo := replace(v_novo,
    E'    if (v_endereco ->> ''latitude'') is null or (v_endereco ->> ''longitude'') is null then',
    E'    begin\n      v_taxa_manual := nullif(p_pedido ->> ''taxa_manual'', '''')::numeric;\n    exception when others then\n      return jsonb_build_object(''ok'', false, ''erro'', ''Taxa de entrega inválida.'');\n    end;\n\n    if v_taxa_manual is not null then\n      if v_interno is null or not public.has_permission(''orders.override_delivery_fee'') then\n        return jsonb_build_object(''ok'', false, ''erro'',\n          ''Você não tem permissão para informar a taxa de entrega.'');\n      end if;\n      if v_taxa_manual < 0 or v_taxa_manual > 500 then\n        return jsonb_build_object(''ok'', false, ''erro'', ''Taxa de entrega fora do esperado.'');\n      end if;\n      v_taxa_manual := round(v_taxa_manual, 2);\n    end if;\n\n    if v_taxa_manual is null then\n    if (v_endereco ->> ''latitude'') is null or (v_endereco ->> ''longitude'') is null then');

  v_novo := replace(v_novo,
    E'    v_exige_aprovacao := v_distancia > v_loja.automatic_delivery_radius_km;',
    E'    v_exige_aprovacao := v_distancia > v_loja.automatic_delivery_radius_km;\n    else\n      -- Sem rota: sem distância e sem faixa. A taxa é a informada.\n      v_taxa := v_taxa_manual;\n      v_distancia := null;\n      v_faixa_id := null;\n      v_exige_aprovacao := false;\n    end if;');

  -- 3. marca no endereço do pedido
  v_novo := replace(v_novo,
    E'      ''confianca'', v_endereco ->> ''confianca''\n    ) end,',
    E'      ''confianca'', v_endereco ->> ''confianca'',\n      ''taxa_manual'', v_taxa_manual is not null\n    ) end,');

  -- 4. auditoria
  v_novo := replace(v_novo,
    E'  return jsonb_build_object(\n    ''ok'', true, ''ja_existia'', false,',
    E'  if v_taxa_manual is not null then\n    perform public.log_audit(''taxa_entrega_manual'', ''orders'', v_pedido_id, null,\n      jsonb_build_object(''taxa'', v_taxa_manual),\n      ''Taxa informada no balcão: a rota até o endereço não pôde ser calculada.'');\n  end if;\n\n  return jsonb_build_object(\n    ''ok'', true, ''ja_existia'', false,');

  if v_novo not like '%if v_taxa_manual is null then%'
     or v_novo not like '%v_taxa := v_taxa_manual;%'
     or v_novo not like '%''taxa_manual'', v_taxa_manual is not null%'
     or v_novo not like '%taxa_entrega_manual%' then
    raise exception 'criar_pedido mudou: o patch da taxa manual não encontrou todos os trechos';
  end if;

  execute v_novo;
end;
$$;

-- Entrega com taxa informada à mão não tem distância: a regra do pedido passa
-- a aceitar isso SÓ quando o endereço do pedido diz `taxa_manual: true`.
alter table public.orders drop constraint orders_entrega_com_snapshot;
alter table public.orders add constraint orders_entrega_com_snapshot check (
  fulfillment_type = 'pickup'
  or (delivery_address_snapshot is not null
      and (delivery_route_distance_km is not null
           or coalesce((delivery_address_snapshot ->> 'taxa_manual')::boolean, false)))
);
