-- 0022 — Auditoria das configurações críticas e das promoções
-- 03-RLS-RBAC-SEGURANCA.md §7.2 e §22.2 · 01-DOCUMENTO-MESTRE.md §79.25
-- CLAUDE.md §33 · RN-AUD-001
--
-- §22.2 exige auditar "configurações críticas". §7.2 detalha: horários,
-- fechamento temporário, endereço/geolocalização, faixas de entrega, raio de
-- aprovação automática, pedido mínimo, chave Pix, formas de pagamento,
-- estimativas e parâmetros de alerta. Todas estão cobertas abaixo.
--
-- A gravação é por TRIGGER, igual à Fase 2: nenhum caminho de escrita escapa,
-- nem o SQL Editor.

create trigger store_settings_audit after insert or update on public.store_settings
  for each row execute function public.tg_audit_generico('id');
create trigger store_hours_audit after insert or update or delete on public.store_hours
  for each row execute function public.tg_audit_generico('id');
create trigger delivery_fee_bands_audit after insert or update or delete on public.delivery_fee_bands
  for each row execute function public.tg_audit_generico('id');
create trigger alert_thresholds_audit after insert or update or delete on public.alert_thresholds
  for each row execute function public.tg_audit_generico('id');
create trigger payment_methods_audit after insert or update or delete on public.payment_methods
  for each row execute function public.tg_audit_generico('id');
create trigger payment_brands_audit after insert or update or delete on public.payment_brands
  for each row execute function public.tg_audit_generico('id');

-- Promoção é decisão de PREÇO com período. Não consta da lista mínima de
-- §22.2, mas "quem colocou este preço e quando" é exatamente a pergunta que
-- a auditoria existe para responder. Auditar a mais nunca viola a regra.
create trigger promotions_audit after insert or update or delete on public.promotions
  for each row execute function public.tg_audit_generico('id');

-- A chave Pix é auditada com o VALOR MASCARADO. Registrar que mudou, quem
-- mudou e quando é o objetivo; copiar a chave para dentro do log só ampliaria
-- a superfície do dado sem acrescentar nada à investigação (03 §31).
create or replace function public.tg_audit_pix()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_before jsonb; v_after jsonb;
begin
  if tg_op = 'INSERT' then
    v_before := null;
    v_after := to_jsonb(new) - 'pix_key';
  else
    v_before := to_jsonb(old) - 'pix_key';
    v_after := to_jsonb(new) - 'pix_key';
    if v_before = v_after and old.pix_key is not distinct from new.pix_key then
      return new;
    end if;
    -- Sinaliza a troca sem transportar o valor.
    if old.pix_key is distinct from new.pix_key then
      v_before := v_before || jsonb_build_object('pix_key', '[alterada]');
      v_after := v_after || jsonb_build_object('pix_key', '[alterada]');
    end if;
  end if;

  perform public.log_audit(
    lower(tg_op) || '_pix_key_settings', 'pix_key_settings', new.id, v_before, v_after
  );
  return new;
end;
$$;

comment on function public.tg_audit_pix is 'Auditoria da chave Pix com valor mascarado (03 §7.2 e §31).';

create trigger pix_key_settings_audit after insert or update on public.pix_key_settings
  for each row execute function public.tg_audit_pix();
