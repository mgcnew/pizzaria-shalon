-- =============================================================================
-- EXIGE PRODUÇÃO — o produto informa se precisa de preparo
--
-- 04-REGRAS-NEGOCIO.md RN-EST-* · 09-PDV-FRENTE-DE-CAIXA.md §0.3 · CLAUDE.md §16, §21
--
-- O PROBLEMA. Até aqui o sistema supunha que TODO pedido passa pela produção:
-- `acoes_do_pedido` oferecia `iniciar_producao` para todo `confirmed`, e
-- `marcar_pronto` só existia a partir de `in_production`. Uma Coca-Cola sozinha
-- era obrigada a atravessar um "Em produção" que é ficção.
--
-- O QUE NÃO SERVIA. `products.product_type` (pizza/fogazza/drink/combo/other)
-- classifica o que o produto É, não se precisa de preparo: `other` cobre tanto
-- uma porção de batata quanto um bolo pronto, e um combo pode ter os dois.
--
-- A REGRA É CONSERVADORA: o pedido exige produção a menos que se consiga
-- PROVAR que nenhum item exige. Errar mandando à cozinha custa uma conferência;
-- errar para o outro lado é pizza que nunca é assada.
--
-- NADA AQUI TOCA DINHEIRO. `payment_status` continua eixo separado do status
-- operacional, e `registrar_pagamento` fica intacta.
--
-- POR QUE ESTA MIGRATION ALTERA `criar_pedido` E `aplicar_revisao` POR PATCH,
-- e não recopiando as duas funções inteiras (554 e 88 linhas): copiar texto de
-- autoridade de pedido é convite a erro de transcrição, e uma cópia velha
-- reverteria silenciosamente correções anteriores. Aqui o patch é cirúrgico,
-- a âncora é verificada, e a migration ABORTA se não encontrar exatamente uma
-- ocorrência — ela nunca aplica pela metade.
-- =============================================================================

-- ----------------------------------------------------------------- 1. colunas
alter table public.products
  add column if not exists requires_production boolean not null default true;

alter table public.orders
  add column if not exists requires_production boolean not null default true;

comment on column public.products.requires_production is
  'O produto precisa ser preparado? Default true: produto existente continua indo para a produção até ser marcado como "Não".';

comment on column public.orders.requires_production is
  'Snapshot: algum item deste pedido exige preparo? Calculado na criação e recalculado quando uma revisão troca os itens.';

-- ------------------------------------------------------------------ 2. a regra
--
-- UMA função, chamada de DOIS lugares (`criar_pedido` e `aplicar_revisao`).
-- Duas cópias divergiriam no dia em que alguém ajustasse só uma — e o sintoma
-- seria uma pizza não assada.
--
-- Cada ramo do `or` é uma forma de NÃO conseguir provar que o item dispensa
-- preparo. O `coalesce(..., true)` é o que torna o desconhecido conservador.
create or replace function public.pedido_exige_producao(p_order_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
      from public.order_items i
     where i.order_id = p_order_id
       and (
         -- Item sem produto identificado: não dá para afirmar nada.
         i.product_id is null

         -- O produto exige, ou o produto sumiu do catálogo.
         or coalesce((select p.requires_production
                        from public.products p where p.id = i.product_id), true)

         -- Meio a meio: qualquer sabor que exija, ou que não se saiba qual é.
         or exists (select 1
                      from public.order_item_flavors f
                      left join public.products fp on fp.id = f.flavor_product_id
                     where f.order_item_id = i.id
                       and coalesce(fp.requires_production, true))

         -- Combo: o COMPONENTE manda, mesmo que o combo esteja marcado como
         -- "não exige". Combo de pizza + refrigerante vai para a cozinha.
         or exists (select 1
                      from public.order_combo_components cc
                      left join public.products cp on cp.id = cc.component_product_id
                     where cc.order_item_id = i.id
                       and coalesce(cp.requires_production, true))
       )
  );
$$;

revoke all on function public.pedido_exige_producao(uuid) from public, anon, authenticated;

comment on function public.pedido_exige_producao is
  'Regra conservadora: exige produção a menos que TODOS os itens provem o contrário.';

-- --------------------------------------------- 3. criar_pedido grava o snapshot
do $patch$
declare
  v_src  text;
  v_anc  text := E'  end loop;\n\n  insert into public.order_payment_intents (';
  v_novo text := E'  end loop;\n\n'
    || E'  -- O PEDIDO GUARDA SE PRECISA DE PREPARO, calculado a partir dos itens\n'
    || E'  -- que acabaram de ser gravados. Snapshot, e não leitura viva: marcar a\n'
    || E'  -- Coca como "não exige" amanhã não pode mudar o que os pedidos de ontem\n'
    || E'  -- oferecem (CLAUDE.md §16).\n'
    || E'  update public.orders\n'
    || E'     set requires_production = public.pedido_exige_producao(v_pedido_id)\n'
    || E'   where id = v_pedido_id;\n\n'
    || E'  insert into public.order_payment_intents (';
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'criar_pedido';

  if v_src is null then
    raise exception 'criar_pedido não existe';
  end if;

  -- Já aplicada? Então não faz nada e não quebra a reexecução.
  if position('pedido_exige_producao(v_pedido_id)' in v_src) > 0 then
    raise notice 'criar_pedido já grava requires_production; nada a fazer';
    return;
  end if;

  if (length(v_src) - length(replace(v_src, v_anc, ''))) / length(v_anc) <> 1 then
    raise exception 'Âncora não encontrada exatamente uma vez em criar_pedido — migration abortada';
  end if;

  execute replace(v_src, v_anc, v_novo);
end $patch$;

-- ------------------------------- 4. a revisão recalcula quando troca os itens
--
-- `aplicar_revisao` APAGA e reinsere os itens, então ela pode acrescentar uma
-- pizza a um pedido que só tinha bebida. Sem esta linha aquela pizza nunca
-- chegaria à produção. O `update` que já existia passa a gravar mais uma coluna.
do $patch$
declare
  v_src  text;
  v_anc  text := E'  update public.orders\n     set subtotal = v_rev.subtotal_after, total = v_rev.total_after\n   where id = v_rev.order_id;';
  v_novo text := E'  update public.orders\n'
    || E'     set subtotal = v_rev.subtotal_after, total = v_rev.total_after,\n'
    || E'         requires_production = public.pedido_exige_producao(v_rev.order_id)\n'
    || E'   where id = v_rev.order_id;';
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'aplicar_revisao';

  if v_src is null then
    raise exception 'aplicar_revisao não existe';
  end if;

  if position('pedido_exige_producao(v_rev.order_id)' in v_src) > 0 then
    raise notice 'aplicar_revisao já recalcula requires_production; nada a fazer';
    return;
  end if;

  if (length(v_src) - length(replace(v_src, v_anc, ''))) / length(v_anc) <> 1 then
    raise exception 'Âncora não encontrada exatamente uma vez em aplicar_revisao — migration abortada';
  end if;

  execute replace(v_src, v_anc, v_novo);
end $patch$;

-- ------------------------------------------ 5. a autoridade das ações do pedido
--
-- `comando_pedido` valida o comando recebido contra ESTA função antes de
-- executar — "a pré-condição do comando, pela MESMA regra que a interface
-- consulta". Mudar aqui muda o que a tela oferece E o que o servidor aceita,
-- de uma vez. Não existe caminho por fora, e é por isso que a proteção mora
-- aqui e não na interface (CLAUDE.md §12).
--
-- Duas linhas mudam, e NENHUM status novo é criado:
--   · `iniciar_producao` deixa de valer para pedido que não exige preparo;
--   · `marcar_pronto` passa a valer direto de `confirmed` nesse caso.
--
-- O pedido de bebida faz `confirmed` -> Marcar pronto -> retirada/entrega ->
-- Concluir. Concluir DIRETO de `confirmed` ficou fora por decisão explícita:
-- a retirada só conclui com recebimento registrado (invariante 13 de 04 §44).
create or replace function public.acoes_do_pedido(p_order_id uuid)
returns jsonb language sql stable set search_path = ''
as $$
  with pedido as (
    select o.id, o.status, o.fulfillment_type, o.delivery_approval_status,
           o.requires_production,
           pi.pix_confirmation_status as pix,
           exists (select 1 from public.order_revisions r
                    where r.order_id = o.id and r.status = 'pending_customer') as revisao_aberta
    from public.orders o
    left join public.order_payment_intents pi on pi.order_id = o.id
    where o.id = p_order_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'comando', c.comando, 'rotulo', c.rotulo,
           'exige_motivo', c.exige_motivo, 'destrutivo', c.destrutivo)
         order by c.sort_order), '[]'::jsonb)
  from public.order_commands c, pedido p
  where
    -- Permissão semântica efetiva do usuário, no momento (RN-RBAC-004).
    public.has_permission(public.permissao_do_comando(c.comando))
    and case c.comando
      -- Pendências que não dependem do status, e sim da própria dimensão.
      when 'confirmar_pix'    then p.pix = 'pending'
      when 'aprovar_entrega'  then p.delivery_approval_status = 'pending'
      when 'rejeitar_entrega' then p.delivery_approval_status = 'pending'

      -- O status já expressa os bloqueios: com Pix ou entrega pendentes o
      -- pedido nem chega a `waiting_store_confirmation`.
      when 'aceitar'          then p.status = 'waiting_store_confirmation'
                                   and not p.revisao_aberta

      -- SÓ QUEM PRECISA DE PREPARO ENTRA NA PRODUÇÃO.
      when 'iniciar_producao' then p.status = 'confirmed' and p.requires_production

      -- E quem não precisa fica pronto direto, sem atravessar um "Em produção"
      -- que não descreve nada.
      when 'marcar_pronto'    then p.status = 'in_production'
                                   or (p.status = 'confirmed' and not p.requires_production)

      when 'despachar'        then p.status = 'ready_for_delivery'

      -- Concluir vale para retirada no balcão, entrega finalizada e também
      -- depois de uma falha resolvida (RN-STATE-008).
      when 'concluir'         then p.status in ('ready_for_pickup', 'out_for_delivery',
                                                'delivery_failed')
      when 'registrar_falha_entrega' then p.status = 'out_for_delivery'

      -- RN-STATE-009: rejeição é antes da aceitação operacional.
      when 'rejeitar'         then p.status in ('waiting_pix_confirmation',
                                                'waiting_delivery_approval',
                                                'waiting_store_confirmation',
                                                'change_requested_waiting_customer')
      -- Cancelar existe enquanto o pedido estiver vivo.
      when 'cancelar'         then p.status not in ('completed', 'rejected', 'cancelled')
      else false
    end;
$$;

-- ------------------------------------------------------------ postcondições
do $post$
declare
  v_n integer;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='products'
                    and column_name='requires_production') then
    raise exception 'products.requires_production não foi criada';
  end if;

  if not exists (select 1 from information_schema.columns
                  where table_schema='public' and table_name='orders'
                    and column_name='requires_production') then
    raise exception 'orders.requires_production não foi criada';
  end if;

  -- O COMPORTAMENTO CONSERVADOR, conferido e não presumido: nada do que já
  -- existia pode ter nascido como "não exige produção".
  select count(*) into v_n from public.products where not requires_production;
  if v_n <> 0 then
    raise exception 'A migration deixou % produto(s) sem produção; o esperado era zero', v_n;
  end if;

  select count(*) into v_n from public.orders where not requires_production;
  if v_n <> 0 then
    raise exception 'A migration deixou % pedido(s) sem produção; o esperado era zero', v_n;
  end if;

  -- Os dois patches realmente entraram.
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='criar_pedido'
                    and pg_get_functiondef(p.oid) like '%pedido_exige_producao(v_pedido_id)%') then
    raise exception 'criar_pedido não grava requires_production';
  end if;

  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='aplicar_revisao'
                    and pg_get_functiondef(p.oid) like '%pedido_exige_producao(v_rev.order_id)%') then
    raise exception 'aplicar_revisao não recalcula requires_production';
  end if;

  -- As autoridades preservadas: criar_pedido continua DEFINER e única porta,
  -- acoes_do_pedido continua INVOKER para o filtro de permissão valer para
  -- quem chama, e comando_pedido continua validando contra ela.
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='criar_pedido' and p.prosecdef) then
    raise exception 'criar_pedido deixou de ser SECURITY DEFINER';
  end if;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
              where n.nspname='public' and p.proname='acoes_do_pedido' and p.prosecdef) then
    raise exception 'acoes_do_pedido virou SECURITY DEFINER';
  end if;

  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                  where n.nspname='public' and p.proname='comando_pedido'
                    and pg_get_functiondef(p.oid) like '%acoes_do_pedido(p_order_id)%') then
    raise exception 'comando_pedido deixou de validar contra acoes_do_pedido';
  end if;
end $post$;
