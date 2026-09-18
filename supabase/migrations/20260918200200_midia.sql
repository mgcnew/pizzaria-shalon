-- 0013 — Mídia e Storage
-- 02-MODELO-DADOS-SUPABASE.md §7.1 · 03-RLS-RBAC-SEGURANCA.md §23 e §24
-- 01-DOCUMENTO-MESTRE.md §79.7 · CLAUDE.md §35
--
-- O arquivo vive no Storage; o banco guarda REFERÊNCIA e metadados.
-- Base64 em coluna de negócio é proibido (RN-PROD-003).

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  bucket text not null,
  -- Caminho gerado pelo sistema. O nome enviado pelo usuário é registrado
  -- só como metadado (§23.3: nome de arquivo do usuário não é autoridade).
  storage_path text not null unique,
  mime_type text not null,
  width integer,
  height integer,
  file_size_bytes bigint,
  original_filename text,
  asset_type text not null,
  created_by uuid references public.app_users (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint media_assets_tipo check (
    asset_type in ('product', 'banner', 'brand', 'employee_attachment', 'financial_receipt', 'other')
  ),
  -- §24: somente formatos web de imagem passam pelo pipeline do catálogo.
  constraint media_assets_mime check (mime_type ~ '^[a-z]+/[a-z0-9.+-]+$'),
  constraint media_assets_dimensoes check (
    (width is null or width > 0) and (height is null or height > 0)
  ),
  constraint media_assets_tamanho check (file_size_bytes is null or file_size_bytes > 0)
);

comment on table public.media_assets is 'Referência e metadados de arquivos no Storage. Nunca guarda o binário.';
comment on column public.media_assets.storage_path is 'Caminho controlado pelo sistema, não o nome enviado pelo usuário (03 §23.3).';
