-- =============================================================================
-- O MESMO NAVEGADOR RECONHECE O CLIENTE
--
-- 04 RN-CLI-004 · 03 §11, §12.1 · D-2026-10-01-107
-- Migration: 20261001100000_cliente_do_dispositivo.sql
--
-- O que esta suíte prova:
--   D1–D4  com a credencial, o visitante recebe nome, WhatsApp e endereços
--          do dono (sem repetir, preferido primeiro, sem inativo);
--   D5–D8  credencial malformada, desconhecida, revogada ou de cliente
--          bloqueado respondem igual: nada;
--   D9     a resposta não carrega histórico, bloqueio nem dado interno;
--   D10–D11 "Não sou eu" revoga, e só quem tem a credencial revoga.
--
-- Fixtures próprias (sufixo F90). Transação com ROLLBACK: nada persiste.
-- =============================================================================

begin;

create temporary table resultado_teste (
  n serial, cenario text, esperado text, obtido text, passou boolean
) on commit drop;
grant all on resultado_teste to anon, authenticated;
grant all on sequence resultado_teste_n_seq to anon, authenticated;

create or replace function pg_temp.checar(p_cenario text, p_esperado text, p_obtido text)
returns void language plpgsql as $$
begin
  insert into resultado_teste (cenario, esperado, obtido, passou)
  values (p_cenario, p_esperado, p_obtido, p_esperado is not distinct from p_obtido);
end;
$$;

-- -----------------------------------------------------------------------------
-- FIXTURES
-- -----------------------------------------------------------------------------
-- Credenciais: 64 hex. O banco guarda só o hash, como faz `criar_pedido`.
select set_config('teste.tok_a', repeat('a1', 32), true);
select set_config('teste.tok_b', repeat('b2', 32), true);
select set_config('teste.tok_r', repeat('c3', 32), true);
select set_config('teste.tok_x', repeat('d4', 32), true);

insert into public.customers (id, name, whatsapp_normalized, whatsapp_display) values
  ('09090909-0000-0000-0000-00000000000a','Cliente A F90','11990000090','(11) 99000-0090');
insert into public.customers (id, name, whatsapp_normalized, is_blocked, blocked_reason_internal, blocked_at) values
  ('09090909-0000-0000-0000-00000000000b','Bloqueado F90','11990000190', true, 'Motivo interno F90', now());

insert into public.customer_addresses (id, customer_id, is_preferred, street, number, neighborhood, city, state, created_at, is_active) values
  ('19090909-0000-0000-0000-000000000001','09090909-0000-0000-0000-00000000000a', false, 'Rua A F90', '1', 'Centro', 'Cidade', 'SP', now() - interval '9 days', true),
  ('19090909-0000-0000-0000-000000000002','09090909-0000-0000-0000-00000000000a', false, 'Rua A F90', '1', 'Centro', 'Cidade', 'SP', now() - interval '1 day', true),
  ('19090909-0000-0000-0000-000000000003','09090909-0000-0000-0000-00000000000a', true,  'Rua B F90', '2', 'Centro', 'Cidade', 'SP', now() - interval '20 days', true),
  ('19090909-0000-0000-0000-000000000004','09090909-0000-0000-0000-00000000000a', false, 'Rua C F90', '3', 'Centro', 'Cidade', 'SP', now(), false);

insert into public.public_devices (customer_id, token_hash, revoked_at) values
  ('09090909-0000-0000-0000-00000000000a', public.hash_token(current_setting('teste.tok_a')), null),
  ('09090909-0000-0000-0000-00000000000b', public.hash_token(current_setting('teste.tok_b')), null),
  ('09090909-0000-0000-0000-00000000000a', public.hash_token(current_setting('teste.tok_r')), now());

-- -----------------------------------------------------------------------------
-- D. RECONHECER
-- -----------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
create temporary table r90 on commit drop as
  select public.cliente_do_dispositivo(current_setting('teste.tok_a')) as r;

select pg_temp.checar('D1 com a credencial, o visitante é reconhecido', 'true|Cliente A F90|(11) 99000-0090',
  (select concat_ws('|', r ->> 'encontrado', r ->> 'nome', r ->> 'whatsapp') from r90));
select pg_temp.checar('D2 endereços: preferido primeiro, sem repetir, sem inativo', 'Rua B F90|Rua A F90',
  (select string_agg(e ->> 'logradouro', '|' order by n)
     from r90, jsonb_array_elements(r -> 'enderecos') with ordinality as x(e, n)));
select pg_temp.checar('D3 do endereço repetido vem o registro mais recente', '19090909-0000-0000-0000-000000000002',
  (select r #>> '{enderecos,1,id}' from r90));
select pg_temp.checar('D4 o preferido vem marcado', 'true',
  (select r #>> '{enderecos,0,preferido}' from r90));

select pg_temp.checar('D5 credencial malformada: nada', '{"encontrado": false}',
  public.cliente_do_dispositivo('11990000090')::text);
select pg_temp.checar('D6 credencial desconhecida: nada', '{"encontrado": false}',
  public.cliente_do_dispositivo(current_setting('teste.tok_x'))::text);
select pg_temp.checar('D7 credencial revogada: nada', '{"encontrado": false}',
  public.cliente_do_dispositivo(current_setting('teste.tok_r'))::text);
select pg_temp.checar('D8 cliente bloqueado: nada (nem o motivo)', '{"encontrado": false}',
  public.cliente_do_dispositivo(current_setting('teste.tok_b'))::text);

select pg_temp.checar('D9 a resposta só tem nome, WhatsApp e endereços', 'encontrado,enderecos,nome,whatsapp',
  (select string_agg(k, ',' order by k) from r90, jsonb_object_keys(r) k));

-- -----------------------------------------------------------------------------
-- "NÃO SOU EU"
-- -----------------------------------------------------------------------------
select public.esquecer_dispositivo(current_setting('teste.tok_x'));
select public.esquecer_dispositivo(current_setting('teste.tok_a'));
select pg_temp.checar('D10 depois de "Não sou eu", a credencial não reconhece mais', '{"encontrado": false}',
  public.cliente_do_dispositivo(current_setting('teste.tok_a'))::text);
reset role;

select pg_temp.checar('D11 só a credencial informada foi revogada', '1|1',
  (select count(*) filter (where revoked_at is not null and token_hash = public.hash_token(current_setting('teste.tok_a')))
          || '|' ||
          count(*) filter (where revoked_at is null and token_hash = public.hash_token(current_setting('teste.tok_b')))
     from public.public_devices));

-- -----------------------------------------------------------------------------
-- RESULTADO
-- -----------------------------------------------------------------------------
select n, cenario, esperado, obtido, passou from resultado_teste order by n;
select count(*) filter (where passou) as aprovados,
       count(*) filter (where not passou) as reprovados
from resultado_teste;

rollback;
