-- 0034 — Corrige o acúmulo de motivos na revalidação
--
-- DEFEITO ENCONTRADO NO NAVEGADOR, não no papel: com o carrinho aberto, o
-- preço de um sabor foi alterado no administrativo. A tela deveria mostrar
-- "anterior → atual" e exigir aceite (79.9). Não mostrou nada.
--
-- Causa: `v_motivos := v_motivos || 'preco_alterado'`. Em `text[] || 'literal'`
-- o literal é `unknown`, e o Postgres tenta lê-lo como ARRAY, não como
-- elemento — erro 22P02, "malformed array literal". Ou seja: a revalidação
-- falhava EXATAMENTE no caso que ela existe para tratar. Enquanto nada
-- mudava, tudo passava; quando algo mudava, a função explodia.
--
-- Correção: cast explícito para text. O caminho de erro da interface também
-- foi corrigido em separado — revalidação que falha agora BLOQUEIA o avanço,
-- em vez de deixar seguir com o preço antigo.
create or replace function public.revalidar_carrinho(p_itens jsonb)
returns jsonb language plpgsql stable set search_path = ''
as $$
declare
  v_item jsonb;
  v_res jsonb;
  v_saida jsonb := '[]'::jsonb;
  v_subtotal numeric := 0;
  v_reconfirmar boolean := false;
  v_motivos text[] := '{}';
  v_visto numeric;
  v_atual numeric;
  v_mudou boolean;
  v_n integer;
begin
  if jsonb_typeof(p_itens) <> 'array' then
    return jsonb_build_object('ok', false, 'erro', 'Carrinho inválido.');
  end if;

  v_n := jsonb_array_length(p_itens);
  if v_n > 60 then
    return jsonb_build_object('ok', false, 'erro', 'Carrinho grande demais.');
  end if;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_res := public.montar_item(v_item);

    v_visto := nullif(v_item ->> 'preco_unitario_visto', '')::numeric;
    v_atual := nullif(v_res ->> 'preco_unitario', '')::numeric;
    v_mudou := (v_res ->> 'ok')::boolean
               and v_visto is not null
               and v_atual is not null
               and v_visto <> v_atual;

    if (v_res ->> 'ok')::boolean then
      v_subtotal := v_subtotal + coalesce((v_res ->> 'total')::numeric, 0);
      if v_mudou and not ('preco_alterado' = any (v_motivos)) then
        v_motivos := array_append(v_motivos, 'preco_alterado'::text);
      end if;
      if v_mudou then v_reconfirmar := true; end if;
    else
      v_reconfirmar := true;
      if not ('item_invalido' = any (v_motivos)) then
        v_motivos := array_append(v_motivos, 'item_invalido'::text);
      end if;
    end if;

    v_saida := v_saida || jsonb_build_array(
      v_res
      || jsonb_build_object(
        'linha', v_item ->> 'linha',
        'preco_visto', v_visto,
        'mudou_preco', coalesce(v_mudou, false)
      )
    );
  end loop;

  return jsonb_build_object(
    'ok', true,
    'loja_aberta', coalesce(public.loja_aberta(), false),
    'itens', v_saida,
    'subtotal', v_subtotal,
    'exige_reconfirmacao', v_reconfirmar,
    'motivos', to_jsonb(v_motivos)
  );
end;
$$;

comment on function public.revalidar_carrinho is '79.9: diferença comercial vira reconfirmação, nunca alteração silenciosa.';
