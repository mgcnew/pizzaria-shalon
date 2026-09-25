-- =============================================================================
-- COLUNA DE CHAVE EM `customer_addresses` — Fase 11, cache (Fase A)
--
-- 02-MODELO-DADOS-SUPABASE.md §8.2 · CLAUDE.md §11, §39
--
-- Coluna GERADA, não coluna comum preenchida por aplicação ou trigger. A
-- diferença importa:
--
-- - não há backfill a escrever, e nenhum registro existente pode ficar sem
--   chave por engano;
-- - não há caminho pelo qual alguém grave uma chave que não corresponda ao
--   endereço da própria linha — nem a aplicação, nem SQL manual, nem uma
--   migration futura distraída. O banco recalcula sozinho a cada alteração
--   dos campos de origem;
-- - `criar_pedido` não precisa ser tocada, o que mantém este gate separado da
--   deduplicação de endereços (decisão de 25/09/2026: não misturar os dois).
--
-- A coluna é STORED porque é usada em índice e em consulta por igualdade.
--
-- NÃO há coluna de distância aqui. A Fase B foi aprovada conceitualmente mas
-- não implementada, e enquanto isso o §8.2 continua valendo como está:
-- "Taxa/distância não pertencem ao endereço salvo."
-- =============================================================================

alter table public.customer_addresses
  add column address_key text
    generated always as (
      public.chave_de_endereco(street, number, neighborhood, city, state, postal_code)
    ) stored;

comment on column public.customer_addresses.address_key is
  'Identidade geográfica derivada do endereço. Gerada pelo banco; complemento e referência não participam (RN-ENT-004).';

-- Índice parcial: só endereço ativo é candidato a reuso, e é a única condição
-- em que a consulta busca.
create index customer_addresses_por_chave
  on public.customer_addresses (address_key)
  where is_active;

-- =============================================================================
-- QUANDO A COORDENADA FOI VALIDADA
--
-- Descoberto pelo próprio teste da suíte (cenário "coordenada vencida NAO e
-- acerto", que falhou na primeira execução): `updated_at` NÃO serve para medir
-- a idade da coordenada.
--
-- A tabela tem `customer_addresses_updated_at`, um trigger que reescreve
-- `updated_at` a cada UPDATE. Marcar o endereço como preferido, trocar o
-- rótulo ou desativá-lo renovaria o prazo de validade de uma coordenada
-- antiga — sem que ninguém tivesse revalidado nada. Um cache que se renova
-- por engano é pior que não ter cache.
--
-- `geocoded_at` só se move quando a COORDENADA se move. O trigger abaixo
-- compara os campos geográficos: se nenhum mudou, o carimbo é preservado.
--
-- `criar_pedido` NÃO é tocada — decisão de 25/09/2026 de não misturar este
-- gate com alteração da função autoritativa. O trigger cobre insert e update
-- vindos de qualquer caminho, inclusive dela.
-- =============================================================================

alter table public.customer_addresses
  add column geocoded_at timestamptz;

comment on column public.customer_addresses.geocoded_at is
  'Quando a coordenada foi validada. Só muda quando a coordenada muda — ao contrário de updated_at.';

create or replace function public.tg_marcar_geocodificacao()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.latitude is not null then
      new.geocoded_at := coalesce(new.geocoded_at, now());
    end if;
    return new;
  end if;

  -- UPDATE: o carimbo acompanha a coordenada, não a linha.
  if new.latitude is distinct from old.latitude
     or new.longitude is distinct from old.longitude
     or new.geocode_provider is distinct from old.geocode_provider
     or new.geocode_confidence is distinct from old.geocode_confidence then
    new.geocoded_at := now();
  -- Alteração explícita do carimbo é respeitada: é o que permite corrigir um
  -- registro antigo, e é o que a suíte usa para envelhecer uma linha.
  elsif new.geocoded_at is distinct from old.geocoded_at then
    null;
  else
    new.geocoded_at := old.geocoded_at;
  end if;

  return new;
end;
$$;

comment on function public.tg_marcar_geocodificacao is
  'Mantém geocoded_at colado à coordenada. Impede que update alheio renove a validade do cache.';

create trigger customer_addresses_geocoded_at
  before insert or update on public.customer_addresses
  for each row execute function public.tg_marcar_geocodificacao();

-- Registros que já existem: a melhor aproximação disponível é `updated_at`,
-- porque endereço salvo nunca foi editado por nenhuma tela até hoje. Fica
-- registrado que é aproximação, não medição.
update public.customer_addresses
   set geocoded_at = updated_at
 where geocoded_at is null
   and latitude is not null;
