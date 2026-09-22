-- 0071 — Comprovante financeiro: bucket privado, vínculo e evidência que fica
-- 05-PLANO-IMPLEMENTACAO.md §11.3 · 03-RLS-RBAC-SEGURANCA.md §23.2, §23.3, §23.4, §24
-- 04-REGRAS-NEGOCIO.md RN-FIN-002/003/004 · CLAUDE.md §35
--
-- A FASE 3 JÁ TINHA PREVISTO ISTO. `media_assets.asset_type` aceita
-- `financial_receipt` desde a 0013, e a 0023 diz com todas as letras:
-- "Comprovantes e anexos financeiros vão para bucket privado nas fases 7+ e
-- NÃO são criados aqui". Então não há infraestrutura nova de mídia — há o
-- bucket que faltava, e a separação mínima de acesso.
--
-- O QUE SEPARA COMPROVANTE DE IMAGEM DE PRODUTO: a foto do produto É para
-- ser vista por qualquer um; o comprovante não pode ser visto por ninguém
-- sem `finance.view`. Mesmo cofre de metadados, chaves diferentes.
--
-- COMPROVANTE NÃO CONFIRMA PAGAMENTO. Anexar evidência não muda status, não
-- reconhece receita e não dispensa a confirmação manual (RN-PGTO-010). Não há
-- OCR e não há leitura automática do arquivo: o sistema guarda, não interpreta.

-- ------------------------------------------------------------ bucket
-- Privado (§23.2). Tipos e tamanho definidos ANTES da implementação, como
-- §24 exige para anexo privado: imagem web e PDF, até 5 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'comprovantes', 'comprovantes', false,
  5242880,
  array['image/webp', 'image/png', 'image/jpeg', 'application/pdf']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- NENHUMA policy para `anon`, em nenhum comando. Comprovante financeiro não
-- tem leitura pública nem parcial — o acesso é por URL assinada curta, e a
-- assinatura só é emitida a quem passou por `finance.view`.
create policy "comprovantes leitura com finance.view" on storage.objects
  for select to authenticated
  using (bucket_id = 'comprovantes' and public.has_permission('finance.view'));

create policy "comprovantes escrita com finance.create" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'comprovantes' and public.has_permission('finance.create'));

-- §23.4: o objeto antigo sai DEPOIS que a referência foi trocada. A policy
-- autoriza; a ordem correta é responsabilidade do caso de uso.
create policy "comprovantes remocao com finance.create" on storage.objects
  for delete to authenticated
  using (bucket_id = 'comprovantes' and public.has_permission('finance.create'));

-- ------------------------------------------- media_assets por tipo de ativo
-- As policies da Fase 3 falavam só de catálogo. Como estão, quem tem
-- `catalog.view` — o Atendente padrão — enxergaria a LINHA de um comprovante
-- financeiro em /rest/v1: nome do arquivo, caminho, quem enviou. O binário
-- continuaria protegido pelo bucket, mas metadado de comprovante também é
-- dado financeiro (03 §17.3).
--
-- Agora a chave depende do que o ativo é.
drop policy media_assets_select on public.media_assets;
drop policy media_assets_insert on public.media_assets;
drop policy media_assets_delete on public.media_assets;

create policy media_assets_select on public.media_assets
  for select to authenticated
  using (
    case when asset_type = 'financial_receipt'
         then public.has_permission('finance.view')
         else public.has_permission('catalog.view')
    end
  );

create policy media_assets_insert on public.media_assets
  for insert to authenticated
  with check (
    case when asset_type = 'financial_receipt'
         then public.has_permission('finance.create')
         else public.has_permission('catalog.manage')
    end
  );

create policy media_assets_delete on public.media_assets
  for delete to authenticated
  using (
    case when asset_type = 'financial_receipt'
         then public.has_permission('finance.create')
         else public.has_permission('catalog.manage')
    end
  );

create index media_assets_comprovantes on public.media_assets (asset_type)
  where asset_type = 'financial_receipt';

-- ======================================================= anexar
-- O upload do binário acontece na Server Action, com o cliente da própria
-- pessoa, e quem autoriza é a policy do Storage. Esta função faz o resto em
-- UMA transação: registra o ativo e amarra ao lançamento.
--
-- Devolve o caminho do comprovante ANTERIOR quando havia um. Quem apaga o
-- objeto antigo é o caso de uso, depois que a referência já trocou — nunca
-- antes (§23.4).
create or replace function public.anexar_comprovante(p_lancamento uuid, p_arquivo jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_lanc record;
  v_asset uuid;
  v_antes_id uuid;
  v_antes_path text;
  v_caminho text := nullif(btrim(coalesce(p_arquivo ->> 'caminho', '')), '');
  v_mime text := nullif(btrim(coalesce(p_arquivo ->> 'mime', '')), '');
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('finance.create') then
    return jsonb_build_object('ok', false, 'erro',
      'Você não tem permissão para anexar comprovante.');
  end if;
  if v_caminho is null or v_mime is null then
    return jsonb_build_object('ok', false, 'erro', 'Arquivo não identificado.');
  end if;

  select * into v_lanc from public.financial_entries e
    where e.id = p_lancamento for update;
  if v_lanc.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Lançamento não encontrado.');
  end if;

  -- RN-FIN-003: lançamento estornado é histórico. A evidência do que ele foi
  -- não se troca depois — nem para "melhorar" o comprovante.
  if v_lanc.status <> 'confirmed' then
    return jsonb_build_object('ok', false, 'congelado', true, 'erro',
      'Este lançamento foi estornado. O comprovante dele não pode mais ser alterado.');
  end if;

  v_antes_id := v_lanc.attachment_asset_id;
  if v_antes_id is not null then
    select m.storage_path into v_antes_path
      from public.media_assets m where m.id = v_antes_id;
  end if;

  insert into public.media_assets (
    bucket, storage_path, mime_type, file_size_bytes,
    original_filename, asset_type, created_by)
  values (
    'comprovantes', v_caminho, v_mime,
    nullif(p_arquivo ->> 'bytes', '')::bigint,
    left(coalesce(p_arquivo ->> 'nome', ''), 180),
    'financial_receipt', v_ator)
  returning id into v_asset;

  update public.financial_entries
     set attachment_asset_id = v_asset
   where id = p_lancamento;

  -- A referência antiga já saiu; agora a linha dela pode sair também. O
  -- OBJETO no Storage é removido pelo caso de uso, depois desta transação.
  if v_antes_id is not null then
    delete from public.media_assets where id = v_antes_id;
  end if;

  perform public.log_audit('financeiro_comprovante_anexar', 'financial_entries',
    p_lancamento,
    jsonb_build_object('comprovante', v_antes_id),
    jsonb_build_object('comprovante', v_asset, 'mime', v_mime),
    null);

  return jsonb_build_object('ok', true, 'asset_id', v_asset,
    'anterior_path', v_antes_path);
end;
$$;

comment on function public.anexar_comprovante is 'Vincula evidência a um lançamento. Não confirma pagamento nem interpreta o arquivo.';

revoke all on function public.anexar_comprovante(uuid, jsonb) from public, anon;
grant execute on function public.anexar_comprovante(uuid, jsonb) to authenticated;

-- ======================================================= remover
-- Só enquanto o lançamento ainda pode ser alterado. Depois do estorno, a
-- evidência do movimento original fica — é o que a reversão preserva.
create or replace function public.remover_comprovante(p_lancamento uuid, p_motivo text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_lanc record;
  v_path text;
  v_asset uuid;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('finance.create') then
    return jsonb_build_object('ok', false, 'erro',
      'Você não tem permissão para remover comprovante.');
  end if;
  if v_motivo is null then
    return jsonb_build_object('ok', false, 'erro', 'Informe o motivo da remoção.');
  end if;

  select * into v_lanc from public.financial_entries e
    where e.id = p_lancamento for update;
  if v_lanc.id is null then
    return jsonb_build_object('ok', false, 'erro', 'Lançamento não encontrado.');
  end if;
  if v_lanc.attachment_asset_id is null then
    return jsonb_build_object('ok', false, 'erro', 'Este lançamento não tem comprovante.');
  end if;
  if v_lanc.status <> 'confirmed' then
    return jsonb_build_object('ok', false, 'congelado', true, 'erro',
      'Este lançamento foi estornado. O comprovante dele não pode mais ser removido.');
  end if;

  v_asset := v_lanc.attachment_asset_id;
  select m.storage_path into v_path from public.media_assets m where m.id = v_asset;

  update public.financial_entries set attachment_asset_id = null where id = p_lancamento;
  delete from public.media_assets where id = v_asset;

  perform public.log_audit('financeiro_comprovante_remover', 'financial_entries',
    p_lancamento,
    jsonb_build_object('comprovante', v_asset, 'caminho', v_path),
    jsonb_build_object('comprovante', null),
    v_motivo);

  return jsonb_build_object('ok', true, 'caminho', v_path);
end;
$$;

comment on function public.remover_comprovante is 'Remove o vínculo enquanto o lançamento é alterável. Estornado congela a evidência.';

revoke all on function public.remover_comprovante(uuid, text) from public, anon;
grant execute on function public.remover_comprovante(uuid, text) to authenticated;

-- ============================================ o comprovante na listagem
-- A projeção passa a dizer que existe comprovante e onde ele está, para a
-- tela pedir uma URL assinada. O caminho só chega a quem a RLS de
-- `media_assets` deixa ler — e agora isso significa `finance.view`.
create or replace function public.lancamentos_financeiros(p_filtros jsonb default '{}'::jsonb)
returns jsonb language sql stable security invoker set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'tipo', t.entry_type, 'valor', t.amount,
           'quando', t.occurred_at, 'descricao', t.description,
           'categoria', (select c.name from public.financial_categories c where c.id = t.category_id),
           'forma', t.payment_method_name_snapshot,
           'pelo_caixa', t.cash_session_id is not null,
           'status', t.status,
           'motivo_estorno', t.reversal_reason,
           'corrige', t.reverses_entry_id,
           'comprovante', (select jsonb_build_object(
                             'asset_id', m.id, 'caminho', m.storage_path,
                             'mime', m.mime_type, 'nome', m.original_filename)
                             from public.media_assets m
                            where m.id = t.attachment_asset_id),
           'por', (select e.full_name from public.app_users u
                     join public.employees e on e.id = u.employee_id
                    where u.id = t.created_by))
         order by t.occurred_at desc), '[]'::jsonb)
    from (select * from public.financial_entries fe
           where (nullif(p_filtros ->> 'tipo', '') is null
                  or fe.entry_type = p_filtros ->> 'tipo')
             and (nullif(p_filtros ->> 'categoria_id', '') is null
                  or fe.category_id = (p_filtros ->> 'categoria_id')::uuid)
             and (nullif(p_filtros ->> 'desde', '') is null
                  or fe.occurred_at >= (p_filtros ->> 'desde')::timestamptz)
           order by fe.occurred_at desc
           limit greatest(1, least(coalesce((p_filtros ->> 'limite')::integer, 100), 500))) t;
$$;

comment on function public.lancamentos_financeiros is 'RN-FIN-005: receita registrada e despesa, com o comprovante quando existe. Não calcula lucro nem margem.';

revoke all on function public.lancamentos_financeiros(jsonb) from public, anon;
grant execute on function public.lancamentos_financeiros(jsonb) to authenticated;
