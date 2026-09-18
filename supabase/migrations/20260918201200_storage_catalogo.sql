-- 0023 — Storage do catálogo
-- 03-RLS-RBAC-SEGURANCA.md §23.1, §23.3, §23.4 e §24 · CLAUDE.md §35
-- 01-DOCUMENTO-MESTRE.md §79.7
--
-- Bucket PÚBLICO só para mídia que é mesmo pública: produto, combo, banner e
-- identidade da loja (§23.1). Comprovantes e anexos financeiros vão para
-- bucket privado nas fases 7+ e NÃO são criados aqui.
--
-- O binário fica aqui; a referência e os metadados ficam em media_assets.
-- Base64 em coluna de negócio continua proibido (RN-PROD-003).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'catalogo', 'catalogo', true,
  3145728,  -- 3 MB: o pipeline otimiza ANTES de enviar; o limite é a rede de segurança
  array['image/webp', 'image/png', 'image/jpeg', 'image/avif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Leitura pública: é o cardápio. Escrita continua restrita (§23.1:
-- "Upload/replace/delete continua restrito a usuário autorizado").
create policy "catalogo leitura publica" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'catalogo');

create policy "catalogo escrita com catalog.manage" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'catalogo' and public.has_permission('catalog.manage'));

create policy "catalogo atualizacao com catalog.manage" on storage.objects
  for update to authenticated
  using (bucket_id = 'catalogo' and public.has_permission('catalog.manage'))
  with check (bucket_id = 'catalogo' and public.has_permission('catalog.manage'));

-- §23.4: o objeto antigo só é removido DEPOIS que a referência foi atualizada
-- e não há mais quem aponte para ele. A policy autoriza; a ordem correta é
-- responsabilidade do caso de uso.
create policy "catalogo remocao com catalog.manage" on storage.objects
  for delete to authenticated
  using (bucket_id = 'catalogo' and public.has_permission('catalog.manage'));
