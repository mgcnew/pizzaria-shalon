-- 0030 — Busca pública sem acento e sem caixa (pendência A-17)
-- 04-REGRAS-NEGOCIO.md RN-BUSCA-001 · 01-DOCUMENTO-MESTRE.md §79.8
-- 02-MODELO-DADOS-SUPABASE.md §22 · 05-PLANO-IMPLEMENTACAO.md §8.2
--
-- §22 manda "avaliar unaccent + pg_trgm/índice adequado durante a
-- implementação, sem hardcodar solução antes de testar no Supabase". É o que
-- esta migration faz: entrega a normalização, e a decisão sobre índice vem
-- da medição registrada no checkpoint da Fase 4.

create extension if not exists unaccent with schema extensions;

-- `unaccent` é STABLE, e índice de expressão exige IMMUTABLE. Este invólucro
-- fixa o dicionário pelo nome, o que torna a função determinística e
-- indexável. Sem ele, qualquer índice sobre a expressão seria recusado.
create or replace function public.sem_acento(p_texto text)
returns text language sql immutable parallel safe
set search_path = ''
as $$
  select lower(extensions.unaccent('extensions.unaccent', coalesce(p_texto, '')));
$$;

comment on function public.sem_acento is 'Normaliza texto para busca: minúsculas e sem acento (RN-BUSCA-001).';

revoke all on function public.sem_acento(text) from public;
grant execute on function public.sem_acento(text) to anon, authenticated;
