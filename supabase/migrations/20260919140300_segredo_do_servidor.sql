-- 0040 — Segredo compartilhado servidor ↔ banco
-- 03-RLS-RBAC-SEGURANCA.md §9.1 · CLAUDE.md §13 e §16
--
-- O PROBLEMA QUE ISTO RESOLVE.
--
-- `criar_pedido` precisa ser SECURITY DEFINER: §9.1 proíbe dar INSERT em
-- `orders` ao papel `anon`. Mas a função fica exposta em /rest/v1/rpc, e a
-- DISTÂNCIA da entrega não pode ser calculada dentro do Postgres — ela vem
-- do provedor de rotas, chamado pelo servidor Node.
--
-- Sem uma prova de origem, qualquer pessoa chamaria a RPC direto do
-- navegador informando "0,5 km" e pagaria a menor taxa. Preço, taxa e
-- distância não podem vir do cliente (CLAUDE.md §16).
--
-- SOLUÇÃO: um segredo que só o SERVIDOR conhece. O Server Action o envia
-- junto; a função recusa qualquer chamada sem ele. O navegador nunca o vê,
-- porque Server Action roda no servidor.
--
-- O QUE ISTO **NÃO** É: não é `service_role`. Não concede acesso a nada —
-- apenas prova que a chamada partiu do nosso servidor. Continua valendo
-- todo o RLS, e `criar_pedido` revalida tudo por conta própria.

create table public.server_secrets (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,
  valor text not null,
  created_at timestamptz not null default now(),
  rotated_at timestamptz,

  constraint server_secrets_chave check (chave ~ '^[a-z][a-z0-9_]*$'),
  constraint server_secrets_valor check (length(valor) >= 32)
);

-- RLS ligado e NENHUMA policy: ninguém lê por consulta, em papel algum.
-- Sem `force`, de propósito — as funções SECURITY DEFINER rodam como dono da
-- tabela e precisam conseguir ler.
alter table public.server_secrets enable row level security;

comment on table public.server_secrets is 'Segredo de origem servidor→banco. Sem policy: só funções SECURITY DEFINER leem.';

-- Valor gerado AQUI, aleatório. Nenhum segredo nasce escrito em código nem
-- em migration versionada.
insert into public.server_secrets (chave, valor)
values ('checkout_origem', encode(extensions.gen_random_bytes(48), 'hex'));

-- Confere a prova de origem. `pg_catalog` para comparação sem atalho de
-- curto-circuito não é necessário aqui: a comparação é de igualdade simples
-- sobre um valor de 96 caracteres, e o canal é TLS.
create or replace function public.origem_confiavel(p_segredo text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.server_secrets s
    where s.chave = 'checkout_origem'
      and p_segredo is not null
      and s.valor = p_segredo
  );
$$;

revoke all on function public.origem_confiavel(text) from public, anon, authenticated;

comment on function public.origem_confiavel is 'Prova que a chamada veio do nosso servidor, não do navegador.';

-- A Owner precisa ler o valor UMA vez para colocar em .env.local. Exige
-- `settings.manage`: é configuração crítica (03 §7.2).
create or replace function public.ler_segredo_do_servidor(p_chave text)
returns text language sql stable security definer set search_path = ''
as $$
  select s.valor
  from public.server_secrets s
  where s.chave = p_chave
    and public.has_permission('settings.manage');
$$;

revoke all on function public.ler_segredo_do_servidor(text) from public, anon, authenticated;
grant execute on function public.ler_segredo_do_servidor(text) to authenticated;

comment on function public.ler_segredo_do_servidor is 'Leitura única pela Owner, para configurar o ambiente. Exige settings.manage.';
