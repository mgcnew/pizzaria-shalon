-- 0046 — Auditoria do cadastro de clientes e índices que faltavam
-- CLAUDE.md §33 e §39 · 03-RLS-RBAC-SEGURANCA.md §13

-- ------------------------------------------------------------- auditoria
-- O QUE **NÃO** É AUDITADO AQUI, e por quê.
--
-- A criação do pedido não vira registro de auditoria: ela já nasce com
-- `order_status_history`, que é o histórico próprio do pedido, e o autor é o
-- cliente — não um funcionário praticando um ato administrativo. Encher
-- `audit_logs` de "system" a cada pedido só tornaria a auditoria real mais
-- difícil de ler.
--
-- O que é sensível no cadastro de clientes é o BLOQUEIO (§33) e qualquer
-- edição feita por gente de dentro. É isso que este gatilho registra.
create or replace function public.tg_audit_cliente()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_mudou_bloqueio boolean := old.is_blocked is distinct from new.is_blocked;
begin
  -- Atualização vinda do próprio checkout (sem usuário interno) e que não
  -- mexe no bloqueio é rotina de cadastro, não ato administrativo.
  if v_ator is null and not v_mudou_bloqueio then
    return new;
  end if;

  if to_jsonb(old) = to_jsonb(new) then
    return new;
  end if;

  perform public.log_audit(
    case when v_mudou_bloqueio and new.is_blocked then 'bloquear_cliente'
         when v_mudou_bloqueio then 'desbloquear_cliente'
         else 'update_customers' end,
    'customers', new.id, to_jsonb(old), to_jsonb(new),
    case when v_mudou_bloqueio then new.blocked_reason_internal end
  );
  return new;
end;
$$;

comment on function public.tg_audit_cliente is 'Audita bloqueio e edição interna do cliente. Rotina do checkout não polui a auditoria.';

create trigger audit_customers
  after update on public.customers
  for each row execute function public.tg_audit_cliente();

-- Endereço do cliente muda por conta dele, no checkout. O que interessa é o
-- snapshot do pedido, que é imutável — e esse já existe.

-- -------------------------------------------------------------- índices
-- Chaves estrangeiras sem índice de cobertura, apontadas pelo linter.
-- Todas apontam para quem DECIDIU algo: a consulta natural é "o que esta
-- pessoa aprovou/cancelou/aceitou".
create index customers_bloqueado_por on public.customers (blocked_by)
  where blocked_by is not null;
create index orders_aceito_por on public.orders (accepted_by)
  where accepted_by is not null;
create index orders_cancelado_por on public.orders (cancelled_by)
  where cancelled_by is not null;
create index orders_aprovacao_decidida_por on public.orders (delivery_approval_decided_by)
  where delivery_approval_decided_by is not null;
create index orders_faixa_entrega on public.orders (delivery_fee_band_id)
  where delivery_fee_band_id is not null;
