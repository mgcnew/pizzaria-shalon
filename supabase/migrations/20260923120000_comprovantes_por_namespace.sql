-- 0103 — o bucket `comprovantes` passa a ter namespace por domínio
-- 03-RLS-RBAC-SEGURANCA.md §23.2 · CLAUDE.md §12, §15, §35
--
-- A VULNERABILIDADE QUE ISTO FECHA (achada na Fase 10, §4).
--
-- As policies antigas decidiam por `bucket_id` e uma permissão ampla, e o
-- bucket serve mais de um domínio. O efeito, comprovado com papéis
-- customizados:
--
--   papel com `internal.view` e SEM `finance.view`  → lia comprovante
--                                                      financeiro, com
--                                                      metadados;
--   papel com `finance.view` e SEM `internal.view`  → lia anexo interno;
--   os dois inseriam objeto no domínio do outro.
--
-- Não era explorável no seed atual, porque o Atendente tem as duas
-- permissões e porque só o financeiro grava no bucket. Mas o sistema
-- suporta papel customizado, e CLAUDE.md §15 exige que registrar consumo
-- não dê acesso a histórico financeiro sensível.
--
-- A CORREÇÃO: o caminho passa a ser a fronteira, e ela é verificável olhando
-- para o próprio caminho. Uma permissão de um domínio NUNCA alcança o
-- namespace de outro.
--
--   financeiro/<entidade_id>/<uuid>.<ext>   →  finance.*
--   interno/<entidade_id>/<uuid>.<ext>      →  internal.*
--
-- POR QUE REGEX E NÃO `like 'financeiro/%'`. `like` aceitaria
-- `financeiro/../interno/x`, `financeiro2/...` e `financeiro/qualquer/coisa`.
-- O regex exige a forma inteira: namespace, UUID da entidade, UUID do
-- arquivo e extensão curta. Não há `..`, não há nível extra, não há prefixo
-- parecido que passe.
--
-- SOBRE O NAMESPACE `interno/`: ele é declarado aqui porque a permissão
-- interna precisa de um lugar próprio — e NÃO porque exista fluxo que o
-- use. Hoje nenhum RPC ou código grava anexo interno; as colunas
-- `attachment_asset_id` de `internal_product_movements`,
-- `employee_ledger_entries` e `driver_run_settlements` existem e estão
-- vazias. Esta migration não cria esse fluxo (Fase 10: não inventar
-- funcionalidade para preencher coluna sem uso).
--
-- SOBRE DELETE: concedido só no namespace financeiro, porque só lá existe
-- fluxo que remove — a substituição de comprovante apaga o objeto antigo
-- depois de trocar a referência (§23.4), e `remover_comprovante` desfaz o
-- vínculo. O namespace interno NÃO ganha DELETE: não há fluxo que remova, e
-- permitir apagar só porque se pode inserir seria conceder sem motivo.
--
-- SOBRE UPDATE: continua sem policy, nos dois namespaces. Substituir
-- comprovante é enviar objeto novo e apagar o antigo, nunca sobrescrever o
-- binário de uma evidência.
--
-- MIGRAÇÃO DE ARQUIVO: nenhuma. Comprovado antes desta migration: zero
-- objetos no bucket `comprovantes`, zero `media_assets` nele e zero
-- `attachment_asset_id` não nulo nas quatro tabelas que têm a coluna.

drop policy if exists "comprovantes leitura com finance.view" on storage.objects;
drop policy if exists "comprovantes escrita com finance.create" on storage.objects;
drop policy if exists "comprovantes remocao com finance.create" on storage.objects;
drop policy if exists "comprovantes leitura interna" on storage.objects;
drop policy if exists "comprovantes escrita interna" on storage.objects;
drop policy if exists "comprovantes remocao interna" on storage.objects;

-- ------------------------------------------------------------- financeiro
create policy "comprovantes financeiro leitura" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'comprovantes'
    and name ~ '^financeiro/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,5}$'
    and public.has_permission('finance.view')
  );

create policy "comprovantes financeiro escrita" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'comprovantes'
    and name ~ '^financeiro/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,5}$'
    and public.has_permission('finance.create')
  );

create policy "comprovantes financeiro remocao" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'comprovantes'
    and name ~ '^financeiro/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,5}$'
    and public.has_permission('finance.create')
  );

-- ---------------------------------------------------------------- interno
create policy "comprovantes interno leitura" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'comprovantes'
    and name ~ '^interno/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,5}$'
    and public.has_permission('internal.view')
  );

create policy "comprovantes interno escrita" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'comprovantes'
    and name ~ '^interno/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,5}$'
    and public.has_permission('internal.register')
  );
