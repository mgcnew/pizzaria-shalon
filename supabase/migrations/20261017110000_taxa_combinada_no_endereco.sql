-- 0163 — Taxa combinada guardada no endereço do cliente
-- D-2026-10-16-145
--
-- Quando a atendente informa a taxa à mão (endereço não localizado, ou troca
-- com motivo), o valor fica guardado NAQUELE endereço do cliente. No próximo
-- pedido, ao escolher o endereço salvo, o balcão já traz a taxa combinada —
-- sem refazer a conta nem perguntar de novo.
--
-- É SUGESTÃO para o balcão: o lançamento continua passando por
-- `criar_pedido`, com a mesma permissão (`orders.override_delivery_fee`) e a
-- mesma auditoria. O site do cliente não usa este valor.

alter table public.customer_addresses
  add column agreed_delivery_fee numeric(12, 2),
  add column agreed_fee_reason text,
  add column agreed_fee_at timestamptz,
  add column agreed_fee_by uuid references public.app_users (id) on delete set null;

alter table public.customer_addresses
  add constraint customer_addresses_taxa_combinada check (
    agreed_delivery_fee is null or (agreed_delivery_fee >= 0 and agreed_delivery_fee <= 500)
  );

comment on column public.customer_addresses.agreed_delivery_fee is
  'Taxa de entrega combinada no balcão para este endereço (sugestão para os próximos pedidos internos).';

do $$
declare
  v_def text;
  v_novo text;
begin
  -- criar_pedido: grava a taxa combinada no endereço do pedido.
  v_def := pg_get_functiondef('public.criar_pedido(jsonb,text)'::regprocedure);
  if v_def not like '%agreed_delivery_fee%' then
    v_novo := replace(v_def,
      E'  v_total := v_subtotal + v_taxa;',
      E'  -- Taxa informada à mão fica guardada no endereço (0163).\n  if v_taxa_manual is not null and v_endereco_id is not null then\n    update public.customer_addresses\n       set agreed_delivery_fee = v_taxa_manual,\n           agreed_fee_reason = coalesce(v_motivo_taxa, ''Endereço não localizado no mapa''),\n           agreed_fee_at = now(),\n           agreed_fee_by = v_interno\n     where id = v_endereco_id;\n  end if;\n\n  v_total := v_subtotal + v_taxa;');
    if v_novo = v_def then
      raise exception 'criar_pedido mudou: não achei onde gravar a taxa combinada';
    end if;
    execute v_novo;
  end if;

  -- cliente_para_balcao: devolve a taxa combinada de cada endereço salvo.
  v_def := pg_get_functiondef('public.cliente_para_balcao(text)'::regprocedure);
  if v_def not like '%taxa_combinada%' then
    v_novo := replace(v_def,
      E'''referencia'', e.reference_point, ''preferido'', e.is_preferred)',
      E'''referencia'', e.reference_point, ''preferido'', e.is_preferred,\n               ''taxa_combinada'', e.agreed_delivery_fee,\n               ''motivo_taxa_combinada'', e.agreed_fee_reason)');
    if v_novo = v_def then
      raise exception 'cliente_para_balcao mudou: não achei a lista de endereços';
    end if;
    execute v_novo;
  end if;
end;
$$;
