-- 0001 — Extensões e utilitários | Fase 2 (05-PLANO-IMPLEMENTACAO.md §6.1)
create extension if not exists pgcrypto with schema extensions;

create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.tg_set_updated_at is
  'Trigger utilitária: atualiza updated_at em UPDATE.';
