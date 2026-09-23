-- 0104 — `anexar_comprovante` deixa de aceitar o caminho como autoridade
-- 03-RLS-RBAC-SEGURANCA.md §23.2, §23.3 · CLAUDE.md §16, §34, §36
--
-- A SEGUNDA METADE DA VULNERABILIDADE DO BUCKET.
--
-- A 0103 fechou o Storage por namespace. Falta a porta do banco: a RPC
-- recebia `p_arquivo ->> 'caminho'` e gravava esse texto em
-- `media_assets.storage_path` sem olhar para ele — apesar de o comentário da
-- tabela afirmar que o caminho é "gerado pelo sistema". Quem chamasse a RPC
-- direto (ela é `grant execute ... to authenticated`, e a Server Action não é
-- fronteira de segurança) escolhia o domínio do arquivo escrevendo o texto
-- que quisesse.
--
-- AS SEIS CONFERÊNCIAS QUE PASSAM A EXISTIR, na ordem em que valem:
--
--   1. o ator tem `finance.create`                        (já existia)
--   2. o caminho pertence ao namespace financeiro, na forma exata
--   3. o UUID da entidade DENTRO do caminho é o lançamento que está sendo
--      anexado — não basta ser um caminho financeiro bem formado, tem de
--      ser o caminho DAQUELE lançamento
--   4. o objeto existe mesmo em `storage.objects`, no bucket `comprovantes`
--   5. o caminho ainda não está registrado em `media_assets` — asset já
--      associado não se reaproveita
--   6. bucket e `asset_type` são escritos pela função, nunca recebidos
--
-- A conferência 3 é a que impede um asset financeiro de migrar de dono: o
-- caminho carrega a entidade, e a entidade é verificada. Um arquivo criado
-- para o lançamento X não pode ser anexado ao lançamento Y, porque o
-- caminho de X não casa com Y.
--
-- O `mime` também deixa de ser livre: ele vai para o registro e a tela o usa,
-- então passa a ser conferido contra a mesma lista do bucket.
--
-- NADA MAIS MUDA. Permissão, congelamento por estorno, troca de referência,
-- remoção do asset anterior, auditoria e retorno seguem idênticos à 0069.

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
  -- A forma exata do namespace financeiro. A mesma que a policy do Storage
  -- exige na 0103 — as duas fronteiras concordam sobre o que é um caminho
  -- financeiro válido.
  v_forma constant text :=
    '^financeiro/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,5}$';
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

  -- 2. namespace e forma
  if v_caminho !~ v_forma then
    return jsonb_build_object('ok', false, 'erro', 'Arquivo não identificado.');
  end if;

  -- 3. a entidade dentro do caminho é ESTE lançamento
  if split_part(v_caminho, '/', 2) <> p_lancamento::text then
    return jsonb_build_object('ok', false, 'erro', 'Arquivo não identificado.');
  end if;

  if v_mime not in ('image/webp', 'image/png', 'image/jpeg', 'application/pdf') then
    return jsonb_build_object('ok', false, 'erro', 'Formato não aceito.');
  end if;

  -- 4. o objeto existe de fato, no bucket certo
  if not exists (
    select 1 from storage.objects o
     where o.bucket_id = 'comprovantes' and o.name = v_caminho
  ) then
    return jsonb_build_object('ok', false, 'erro', 'Arquivo não identificado.');
  end if;

  -- 5. caminho ainda não registrado
  if exists (select 1 from public.media_assets m where m.storage_path = v_caminho) then
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

  -- 6. bucket e asset_type são NOSSOS, não do chamador.
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

comment on function public.anexar_comprovante is 'Vincula evidência a um lançamento. Não confirma pagamento nem interpreta o arquivo. O caminho é conferido contra o namespace financeiro e contra a entidade (0104).';
