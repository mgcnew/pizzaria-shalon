-- 0143 — o acerto do motoboy só fecha com cada entrega recebida
-- 04 RN-RUN-003 · RN-PGTO-012/014 · D-2026-10-01-111
--
-- O ACHADO. O acerto (`conciliar_corrida`) só recolhe para a gaveta o
-- dinheiro de recebimentos JÁ REGISTRADOS. Entrega concluída sem recebimento
-- era só avisada: dava para acertar digitando "quanto ele trouxe", e o valor
-- virava "sobra" sem entrar no caixa, enquanto o pedido ficava a receber
-- para sempre.
--
-- A CORREÇÃO. Agora o recebimento é feito no próprio acerto (a tela abre a
-- mesma cobrança da fila de pedidos), e o banco recusa concluir enquanto
-- houver entrega concluída desta corrida sem pagamento confirmado. Não há
-- outro jeito de dinheiro da rua entrar no caixa sem pedido por trás.
--
-- POR PATCH, como a 20260927200000_exige_producao: copiar a função inteira
-- arriscaria desfazer a 20260922110100 (acerto segue a responsabilidade). A
-- âncora é verificada e a migration ABORTA se não a achar exatamente uma vez.

do $patch$
declare
  v_src  text;
  v_anc  text := E'                      where p.order_id = o.order_id and p.status = ''confirmed'');\n';
  v_novo text := v_anc
    || E'\n'
    || E'  -- O recebimento é feito no acerto; sem ele, não há acerto (0143).\n'
    || E'  if v_sem_pagamento > 0 then\n'
    || E'    return jsonb_build_object(''ok'', false, ''sem_recebimento'', true,\n'
    || E'      ''erro'', format(''%s entrega(s) sem recebimento. Registre o que o cliente pagou em cada uma antes de concluir o acerto.'', v_sem_pagamento),\n'
    || E'      ''pedidos_sem_pagamento'', v_sem_pagamento);\n'
    || E'  end if;\n';
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'conciliar_corrida';

  if v_src is null then
    raise exception 'conciliar_corrida não existe';
  end if;

  -- Já aplicada? Então não faz nada e não quebra a reexecução.
  if position('O recebimento é feito no acerto; sem ele, não há acerto' in v_src) > 0 then
    raise notice 'conciliar_corrida já exige recebimento; nada a fazer';
    return;
  end if;

  if (length(v_src) - length(replace(v_src, v_anc, ''))) / length(v_anc) <> 1 then
    raise exception 'Âncora não encontrada exatamente uma vez em conciliar_corrida — migration abortada';
  end if;

  execute replace(v_src, v_anc, v_novo);
end $patch$;

do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'conciliar_corrida'
                    and p.prosecdef
                    and pg_get_functiondef(p.oid) like '%sem_recebimento%') then
    raise exception 'conciliar_corrida não ficou como esperado';
  end if;
end $$;
