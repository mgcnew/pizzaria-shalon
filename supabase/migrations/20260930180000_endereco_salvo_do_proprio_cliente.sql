-- 0141 — o endereço salvo usado no pedido tem de ser do próprio cliente
-- 03 §12.1 · D-2026-09-30-105
--
-- O ACHADO. `criar_pedido` aceita `endereco.id` e, quando ele vem, usa o id
-- sem inserir linha nova — mas não conferia DE QUEM era o endereço. O
-- checkout público repassa o id que vem do navegador. Com isso:
--   · um id de endereço de OUTRO cliente ficava gravado no snapshot do
--     pedido, apontando para o cadastro alheio;
--   · um id inventado fazia o endereço real do cliente nunca ser salvo.
-- Não havia vazamento (o snapshot usa os campos digitados, e o `endereco_id`
-- não é devolvido ao público), mas o vínculo ficava errado.
--
-- A CORREÇÃO. O id só vale se for de um endereço ATIVO do cliente deste
-- pedido. Qualquer outro caso vira `null`, e o fluxo normal insere o endereço
-- para o cliente certo. Nada é recusado: o pedido segue igual.
--
-- POR PATCH, e não recopiando a função (≈560 linhas): mesmo motivo da
-- 20260927200000_exige_producao — copiar texto de autoridade de pedido é
-- convite a erro de transcrição. A âncora é verificada e a migration ABORTA
-- se não a encontrar exatamente uma vez.

do $patch$
declare
  v_src  text;
  v_anc  text := E'    begin\n'
    || E'      v_endereco_id := nullif(v_endereco ->> ''id'', '''')::uuid;\n'
    || E'    exception when others then\n'
    || E'      v_endereco_id := null;\n'
    || E'    end;\n';
  v_novo text := v_anc
    || E'\n'
    || E'    -- O endereço salvo só vale se for DESTE cliente e estiver ativo (0141).\n'
    || E'    -- Id alheio ou inventado vira endereço novo, pelo fluxo normal.\n'
    || E'    if v_endereco_id is not null and not exists (\n'
    || E'      select 1 from public.customer_addresses a\n'
    || E'       where a.id = v_endereco_id\n'
    || E'         and a.customer_id = v_cliente_id\n'
    || E'         and a.is_active) then\n'
    || E'      v_endereco_id := null;\n'
    || E'    end if;\n';
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'criar_pedido';

  if v_src is null then
    raise exception 'criar_pedido não existe';
  end if;

  -- Já aplicada? Então não faz nada e não quebra a reexecução.
  if position('O endereço salvo só vale se for DESTE cliente' in v_src) > 0 then
    raise notice 'criar_pedido já confere o dono do endereço; nada a fazer';
    return;
  end if;

  if (length(v_src) - length(replace(v_src, v_anc, ''))) / length(v_anc) <> 1 then
    raise exception 'Âncora não encontrada exatamente uma vez em criar_pedido — migration abortada';
  end if;

  execute replace(v_src, v_anc, v_novo);
end $patch$;

-- As autoridades preservadas: continua DEFINER, e o anon continua podendo
-- chamar (é a porta do checkout público).
do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'criar_pedido'
                    and p.prosecdef
                    and pg_get_functiondef(p.oid) like '%a.customer_id = v_cliente_id%') then
    raise exception 'criar_pedido não ficou como esperado';
  end if;
end $$;
