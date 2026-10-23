-- 0170 — WhatsApp opcional nos canais Telefone e Balcão
-- D-2026-10-23-157 · amplia D-2026-10-22-156 e D-2026-09-26-81
--
-- Cliente que liga ou chega ao balcão e não quer passar o WhatsApp. Antes, só a
-- retirada no balcão podia ser lançada sem telefone. Agora, nas MESMAS
-- condições de segurança — lançamento interno, WhatsApp realmente vazio —,
-- vale para os canais `counter` e `phone`, em retirada e em entrega.
--
-- O que muda de verdade na ENTREGA: não existe cliente cadastrado (a identidade
-- do cliente é o WhatsApp, `customers_whatsapp_unico`), e
-- `customer_addresses.customer_id` é NOT NULL. Por isso o endereço NÃO é salvo
-- para uso futuro: ele fica só no snapshot do pedido
-- (`orders.delivery_address_snapshot`), que já guarda tudo que a entrega, a
-- comanda e a corrida precisam. A taxa combinada também não fica guardada no
-- endereço (já era condicional a haver endereço salvo).
--
-- Nome: continua opcional só na retirada do balcão (vira "Balcão"). Em entrega
-- e em pedido por telefone ele é obrigatório — sem nome não há a quem entregar
-- nem quem chamar na retirada.
--
-- Telefone digitado pela metade continua barrando (v_whats = '' só vale se o
-- campo veio realmente vazio). Checkout público e os demais canais (WhatsApp,
-- iFood, outro) continuam exigindo WhatsApp.

do $$
declare
  v_def text := pg_get_functiondef('public.criar_pedido(jsonb,text)'::regprocedure);
  v_novo text := v_def;
begin
  -- Já aplicada: não faz nada.
  if v_def like '%0170: WhatsApp opcional no balcão e no telefone%' then
    return;
  end if;

  -- 1. A condição que abre a porta do "sem cliente".
  v_novo := replace(v_novo,
    E'  v_balcao_anonimo := v_interno is not null\n                  and v_origem = ''counter''\n                  and v_modalidade = ''pickup''\n                  -- 0169: basta não ter telefone; o nome é opcional.\n                  and v_whats = '''';',
    E'  v_balcao_anonimo := v_interno is not null\n                  -- 0169: basta não ter telefone; o nome é opcional.\n                  -- 0170: WhatsApp opcional no balcão e no telefone,\n                  -- em retirada e em entrega.\n                  and v_whats = ''''\n                  and v_origem in (''counter'', ''phone'');');

  -- 2. O nome só é opcional na retirada do balcão; no resto, sem nome não há
  --    a quem entregar nem quem chamar (sem nome, a retirada do balcão vira "Balcão").
  v_novo := replace(v_novo,
    E'    v_nome := coalesce(nullif(v_nome, ''''), ''Balcão'');',
    E'    -- 0170: nome obrigatório em entrega e em pedido por telefone.\n    if (v_modalidade = ''delivery'' or v_origem = ''phone'') and length(v_nome) < 2 then\n      return jsonb_build_object(''ok'', false, ''erro'', ''Informe o nome do cliente.'');\n    end if;\n    v_nome := coalesce(nullif(v_nome, ''''), ''Balcão'');');

  -- 3. Sem cliente não há onde salvar o endereço: ele fica só no pedido.
  v_novo := replace(v_novo,
    E'    if v_endereco_id is null then\n      insert into public.customer_addresses (',
    E'    -- 0170: sem cliente, o endereço fica só no snapshot do pedido;\n    if v_endereco_id is null and v_cliente_id is not null then\n      insert into public.customer_addresses (');

  if v_novo not like '%0170: WhatsApp opcional no balcão e no telefone%'
     or v_novo not like '%0170: nome obrigatório em entrega e em pedido por telefone%'
     or v_novo not like '%0170: sem cliente, o endereço fica só no snapshot do pedido%' then
    raise exception 'criar_pedido mudou: patch do WhatsApp opcional no balcão e no telefone';
  end if;

  execute v_novo;
end;
$$;
