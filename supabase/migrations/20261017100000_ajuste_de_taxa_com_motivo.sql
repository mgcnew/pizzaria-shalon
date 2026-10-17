-- 0162 — Ajuste manual da taxa calculada, com motivo
-- D-2026-10-16-143 · CLAUDE.md §20, §33
--
-- Dois casos de taxa à mão no balcão, agora distintos:
--   · o endereço NÃO foi localizado (0161): a atendente informa a taxa, sem
--     motivo — entende-se que não houve como calcular;
--   · o endereço FOI localizado e a taxa calculada não serve (ex.: o mapa
--     traçou rota longa demais): a atendente troca o valor, e o MOTIVO é
--     obrigatório. A rota segue medida e gravada (distância e faixa); só a
--     taxa cobrada é a informada.
--
-- Mesmas salvaguardas da 0161: só no caminho interno, com
-- `orders.override_delivery_fee`, valor entre 0 e 500, auditado. O ajuste NÃO
-- passa por cima de "fora da área": a rota é medida antes, e fora da área
-- continua recusado.

do $$
declare
  v_def text := pg_get_functiondef('public.criar_pedido(jsonb,text)'::regprocedure);
  v_novo text := v_def;
begin
  if v_def like '%v_motivo_taxa%' then
    return;
  end if;

  v_novo := replace(v_novo,
    E'  v_taxa_manual numeric;\nbegin',
    E'  v_taxa_manual numeric;\n  -- Ajuste da taxa calculada, com motivo (0162).\n  v_motivo_taxa text;\n  v_taxa_calculada numeric;\nbegin');

  v_novo := replace(v_novo,
    E'    if v_taxa_manual is null then\n    if (v_endereco ->> ''latitude'')',
    E'    v_motivo_taxa := nullif(btrim(coalesce(p_pedido ->> ''motivo_taxa_manual'', '''')), '''');\n    if v_motivo_taxa is not null and length(v_motivo_taxa) > 200 then\n      return jsonb_build_object(''ok'', false, ''erro'', ''Motivo da troca da taxa longo demais.'');\n    end if;\n\n    -- Com motivo, a rota é medida normalmente e só a taxa cobrada muda.\n    if v_taxa_manual is null or v_motivo_taxa is not null then\n    if (v_endereco ->> ''latitude'')');

  v_novo := replace(v_novo,
    E'    v_exige_aprovacao := v_distancia > v_loja.automatic_delivery_radius_km;\n    else',
    E'    v_exige_aprovacao := v_distancia > v_loja.automatic_delivery_radius_km;\n    if v_taxa_manual is not null then\n      v_taxa_calculada := v_taxa;\n      v_taxa := v_taxa_manual;\n    end if;\n    else');

  v_novo := replace(v_novo,
    E'      ''taxa_manual'', v_taxa_manual is not null\n    ) end,',
    E'      ''taxa_manual'', v_taxa_manual is not null,\n      ''taxa_calculada'', v_taxa_calculada,\n      ''motivo_taxa'', v_motivo_taxa\n    ) end,');

  v_novo := replace(v_novo,
    E'      jsonb_build_object(''taxa'', v_taxa_manual),\n      ''Taxa informada no balcão: a rota até o endereço não pôde ser calculada.'');',
    E'      jsonb_build_object(''taxa'', v_taxa_manual, ''taxa_calculada'', v_taxa_calculada,\n                         ''motivo'', v_motivo_taxa),\n      coalesce(''Taxa calculada trocada no balcão: '' || v_motivo_taxa,\n               ''Taxa informada no balcão: a rota até o endereço não pôde ser calculada.''));');

  if v_novo not like '%v_taxa_calculada := v_taxa;%'
     or v_novo not like '%or v_motivo_taxa is not null then%'
     or v_novo not like '%''motivo_taxa'', v_motivo_taxa%'
     or v_novo not like '%Taxa calculada trocada no balcão%' then
    raise exception 'criar_pedido mudou: o patch do ajuste de taxa não encontrou todos os trechos';
  end if;

  execute v_novo;
end;
$$;
