-- =============================================================================
-- CRUD DO CÓDIGO DE BARRAS + AVISO DE EAN — Fase 12 (PDV), Etapa 3
--
-- 09-PDV-FRENTE-DE-CAIXA.md §2.3, §6.1, §8.2, Etapa 3 do §13
-- 03-RLS-RBAC-SEGURANCA.md §33.2-A · CLAUDE.md §33, §34, §37
-- Decisão: D-2026-09-25-78, item 1 (EAN avisa, nunca bloqueia)
--
-- ESCOPO: administrar `product_barcodes`. NÃO tem resolução de código, nem
-- busca do PDV, nem `pedidos_a_receber`, nem tela.
--
-- POR QUE RPC, E NÃO ESCRITA DIRETA COM RLS COMO NO RESTO DO CATÁLOGO
--
-- O resto do catálogo escreve direto na tabela e deixa a policy decidir — e
-- não é auditado (`rls_fase3` cenário 11.7 afirma isso de propósito). Código
-- de barras é diferente por duas razões:
--
--   1. §8.2 exige `log_audit` explícito, e auditoria não sai de um INSERT solto;
--   2. trocar o primário exige DUAS escritas na ordem certa. Deixar isso para o
--      cliente significaria pedir que ele apagasse o primário anterior antes de
--      cadastrar o novo — e entre os dois passos o item ficaria sem primário,
--      ou o cliente desistiria no meio e deixaria assim.
--
-- O preço de usar RPC é que `SECURITY DEFINER` não passa pela policy. Então a
-- permissão é verificada NO CORPO de cada função, explicitamente, e a suíte
-- mede isso papel por papel.
--
-- O QUE CONTINUA SENDO DECIDIDO PELO BANCO, E NÃO AQUI
--
-- Unicidade global, alvo único, no máximo um primário por alvo e o comprimento
-- do código continuam sendo os índices e as CHECKs da Etapa 2. Estas funções
-- checam algumas dessas coisas ANTES, e só para dar mensagem melhor — nunca
-- como única barreira (mesma postura do `application/catalogo/acoes.ts`).
-- =============================================================================

-- ============================================================== EAN: O AVISO

-- O DÍGITO VERIFICADOR, E TRÊS RESPOSTAS EM VEZ DE DUAS.
--
-- `true`  = é um EAN e fecha;
-- `false` = é um EAN e NÃO fecha  → é o único caso que gera aviso;
-- `null`  = NÃO É UM EAN, então a pergunta não se aplica.
--
-- O `null` é o que impede esta função de virar autoridade sobre a existência do
-- código. Código interno impresso pela casa não segue EAN, não é candidato, e
-- não deve produzir aviso algum — bloquear, ou mesmo avisar, impediria um uso
-- legítimo (§2.3).
--
-- IMMUTABLE e sem I/O: é aritmética sobre um padrão público fixo.
create or replace function public.ean_valido(p_codigo text)
returns boolean language plpgsql immutable set search_path = ''
as $$
declare
  v      text;
  v_n    integer;
  v_soma integer := 0;
  v_i    integer;
begin
  -- Julga o NORMALIZADO, o mesmo texto sobre o qual existe a unicidade. Julgar
  -- o digitado faria "789 1234 5678 95" parecer não-EAN só por causa dos
  -- espaços.
  v := public.normalizar_codigo_de_barras(p_codigo);

  -- Candidato é o que é só dígito e tem exatamente 8 ou 13 deles. Zeros à
  -- esquerda contam como dígito: `0012345678905` é EAN-13, não um número de
  -- onze dígitos.
  if v !~ '^[0-9]+$' or length(v) not in (8, 13) then
    return null;
  end if;

  -- Peso 3 no dígito imediatamente à esquerda do verificador, alternando para a
  -- esquerda. Isso dá peso 3 nas posições PARES do EAN-13 e nas ÍMPARES do
  -- EAN-8, sem precisar de dois ramos.
  v_n := length(v) - 1;
  for v_i in 1 .. v_n loop
    v_soma := v_soma
      + substr(v, v_i, 1)::integer * case when (v_n - v_i) % 2 = 0 then 3 else 1 end;
  end loop;

  return ((10 - (v_soma % 10)) % 10) = substr(v, length(v), 1)::integer;
end;
$$;

comment on function public.ean_valido is
  'Digito verificador de EAN-8/EAN-13. NULL quando o codigo nao e candidato a EAN. Nunca bloqueia nada (D-2026-09-25-78 item 1).';

-- A mensagem que a tela mostra. `is false` é deliberado: `null` (não é EAN) e
-- `true` (EAN correto) não produzem aviso nenhum.
create or replace function public.aviso_de_codigo_de_barras(p_codigo text)
returns text language sql immutable set search_path = ''
as $$
  select case when public.ean_valido(p_codigo) is false then
    'Este código tem '
    || length(public.normalizar_codigo_de_barras(p_codigo))
    || ' dígitos e parece um EAN, mas o dígito verificador não fecha. '
    || 'Confira a digitação — você pode salvar assim mesmo.'
  end;
$$;

comment on function public.aviso_de_codigo_de_barras is
  'Aviso para a tela. NULL quando nao ha o que avisar. Aviso, nunca bloqueio.';

-- ==================================================== O AJUDANTE DA TROCA

-- REBAIXA O PRIMÁRIO ATUAL DO ALVO. Metade da troca; a outra metade é de quem
-- chama.
--
-- Existe separado porque as três funções que promovem um primário precisam
-- exatamente disto, e escrever a mesma coisa três vezes é como as três
-- divergiriam.
--
-- DUAS ESCRITAS, NA ORDEM, E NUNCA UMA SÓ. Um único
-- `update ... set is_primary = (id = p_novo)` pareceria mais elegante e seria
-- uma armadilha: o índice único parcial é conferido linha a linha conforme o
-- UPDATE avança, não no fim do comando, e a ordem das linhas não é garantida.
-- Se a linha a promover fosse processada antes da linha a rebaixar, existiriam
-- dois primários no meio do caminho e o índice recusaria. Rebaixar PRIMEIRO,
-- num comando que termina, e promover DEPOIS elimina o estado intermediário.
create or replace function public.pdv_demover_primario(
  p_product_id uuid,
  p_variant_id uuid,
  p_exceto     uuid
) returns integer language plpgsql security definer set search_path = ''
as $$
declare v_qtd integer;
begin
  update public.product_barcodes b
     set is_primary = false
   where b.is_primary
     and (p_exceto is null or b.id <> p_exceto)
     and ((p_product_id is not null and b.product_id = p_product_id)
       or (p_variant_id is not null and b.variant_id = p_variant_id));
  get diagnostics v_qtd = row_count;
  return v_qtd;
end;
$$;

comment on function public.pdv_demover_primario is
  'Interna. Rebaixa o primario atual do alvo; quem chama promove o novo em seguida.';

-- Interna de verdade: ninguém a alcança pela API. Rebaixar um primário fora do
-- fluxo completo deixaria o item sem primário sem registrar nada.
revoke all on function public.pdv_demover_primario(uuid, uuid, uuid)
  from public, anon, authenticated;

-- ============================================================== LEITURA

-- `SECURITY INVOKER` DE PROPÓSITO, ao contrário de todas as outras aqui.
--
-- Uma leitura não precisa de poder emprestado: rodando como quem chama, a
-- policy `product_barcodes_select` decide, e a autoridade continua sendo uma
-- só. Um `SECURITY DEFINER` aqui teria de reimplementar `catalog.view` no
-- corpo, criando uma segunda regra de leitura que algum dia discordaria da
-- policy.
create or replace function public.codigos_de_barras_do_item(
  p_produto_id  uuid default null,
  p_variante_id uuid default null
) returns jsonb language sql stable security invoker set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id',                 b.id,
      'codigo',             b.code,
      'codigo_normalizado', b.code_normalized,
      'primario',           b.is_primary,
      'ean_valido',         public.ean_valido(b.code),
      'aviso_ean',          public.aviso_de_codigo_de_barras(b.code),
      'criado_em',          b.created_at
    ) order by b.is_primary desc, b.code_normalized), '[]'::jsonb)
  from public.product_barcodes b
  where (p_produto_id is not null and b.product_id = p_produto_id)
     or (p_variante_id is not null and b.variant_id = p_variante_id);
$$;

comment on function public.codigos_de_barras_do_item is
  'Codigos de um produto ou variante. SECURITY INVOKER: quem autoriza e a policy catalog.view.';

-- ============================================================== ESCRITA

-- Quem já detém um código, em português, para a mensagem de recusa. Saber que
-- "já existe" não ajuda ninguém; saber ONDE está resolve o problema.
create or replace function public.pdv_dono_do_codigo(p_normalizado text)
returns text language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select 'no produto ' || p.name
       from public.product_barcodes b
       join public.products p on p.id = b.product_id
      where b.code_normalized = p_normalizado),
    (select 'na variação ' || p.name || ' / ' || s.name
       from public.product_barcodes b
       join public.product_variants pv on pv.id = b.variant_id
       join public.products p on p.id = pv.product_id
       join public.pizza_sizes s on s.id = pv.size_id
      where b.code_normalized = p_normalizado),
    'em outro item');
$$;

comment on function public.pdv_dono_do_codigo is
  'Interna. Nomeia o item que ja detem um codigo, para a mensagem de recusa.';

revoke all on function public.pdv_dono_do_codigo(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- cadastrar

create or replace function public.cadastrar_codigo_de_barras(p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator      uuid    := public.current_app_user_id();
  v_codigo    text    := coalesce(p_dados ->> 'codigo', '');
  v_produto   uuid    := nullif(p_dados ->> 'produto_id', '')::uuid;
  v_variante  uuid    := nullif(p_dados ->> 'variante_id', '')::uuid;
  v_primario  boolean := coalesce((p_dados ->> 'primario')::boolean, false);
  v_motivo    text    := nullif(btrim(coalesce(p_dados ->> 'motivo', '')), '');
  v_normal    text;
  v_id        uuid;
  v_demovidos integer := 0;
  v_indice    text;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;

  -- RN-RBAC-004: decide a permissão semântica, nunca o cargo.
  if not public.has_permission('catalog.manage') then
    return jsonb_build_object('ok', false, 'bloqueio', 'sem_permissao',
      'erro', 'Você não tem permissão para gerenciar o catálogo.');
  end if;

  v_normal := public.normalizar_codigo_de_barras(v_codigo);

  -- Alvo único. A CHECK do banco diria a mesma coisa; aqui a mensagem é útil.
  if (v_produto is null) = (v_variante is null) then
    return jsonb_build_object('ok', false, 'bloqueio', 'alvo_invalido',
      'erro', 'Informe exatamente um alvo: produto OU variante, nunca os dois.');
  end if;

  if v_produto is not null
     and not exists (select 1 from public.products p where p.id = v_produto) then
    return jsonb_build_object('ok', false, 'bloqueio', 'alvo_inexistente',
      'erro', 'Produto não encontrado.');
  end if;
  if v_variante is not null
     and not exists (select 1 from public.product_variants v where v.id = v_variante) then
    return jsonb_build_object('ok', false, 'bloqueio', 'alvo_inexistente',
      'erro', 'Variação não encontrada.');
  end if;

  if length(v_normal) < 4 or length(v_normal) > 48 then
    return jsonb_build_object('ok', false, 'bloqueio', 'codigo_invalido',
      'codigo_normalizado', v_normal,
      'erro', 'O código precisa ter de 4 a 48 caracteres úteis. '
              || 'Espaços e pontuação não contam.');
  end if;

  -- O BLOCO PROTEGIDO — o coração desta etapa.
  --
  -- Rebaixar e inserir acontecem JUNTOS OU NENHUM. O `exception` do plpgsql
  -- abre savepoint implícito, então se o INSERT falhar o rebaixamento é
  -- desfeito e o primário anterior continua primário. Sem isso, um código
  -- duplicado deixaria o item SEM primário nenhum — pior que a recusa.
  begin
    if v_primario then
      v_demovidos := public.pdv_demover_primario(v_produto, v_variante, null);
    end if;

    insert into public.product_barcodes (code, product_id, variant_id, is_primary, created_by)
    values (v_codigo, v_produto, v_variante, v_primario, v_ator)
    returning id into v_id;

  exception when unique_violation then
    -- O Postgres põe o NOME DO ÍNDICE aqui, e é isso que distingue os dois
    -- 23505 possíveis. Ler SQLERRM seria frágil e depende de idioma.
    get stacked diagnostics v_indice = constraint_name;

    if v_indice = 'product_barcodes_codigo' then
      return jsonb_build_object('ok', false, 'bloqueio', 'codigo_duplicado',
        'codigo_normalizado', v_normal,
        'erro', 'Este código já está cadastrado '
                || public.pdv_dono_do_codigo(v_normal)
                || '. Um código resolve para um único item.');
    end if;

    -- Sobra o índice do primário: outra sessão promoveu um primário deste alvo
    -- entre o rebaixamento e a inserção. O índice é o que torna a corrida
    -- segura; aqui só se traduz para o operador.
    return jsonb_build_object('ok', false, 'bloqueio', 'primario_concorrente',
      'erro', 'Outra pessoa marcou o código primário deste item agora mesmo. '
              || 'Recarregue e tente de novo.');
  end;

  -- §8.2: chamada explícita, que é o padrão do projeto para catálogo.
  perform public.log_audit('codigo_de_barras_cadastrar', 'product_barcodes', v_id,
    null,
    jsonb_build_object('codigo', v_codigo, 'codigo_normalizado', v_normal,
      'produto_id', v_produto, 'variante_id', v_variante,
      'primario', v_primario, 'primarios_demovidos', v_demovidos),
    v_motivo);

  return jsonb_build_object('ok', true, 'id', v_id,
    'codigo', v_codigo, 'codigo_normalizado', v_normal,
    'primario', v_primario, 'primarios_demovidos', v_demovidos,
    'ean_valido', public.ean_valido(v_codigo),
    'aviso_ean', public.aviso_de_codigo_de_barras(v_codigo));
end;
$$;

comment on function public.cadastrar_codigo_de_barras is
  'Cadastra codigo de barras. Promove a primario na mesma transacao quando pedido. catalog.manage.';

-- ------------------------------------------------------------------ alterar

create or replace function public.alterar_codigo_de_barras(
  p_id    uuid,
  p_dados jsonb
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator      uuid := public.current_app_user_id();
  v_antes     record;
  v_codigo    text;
  v_primario  boolean;
  v_motivo    text := nullif(btrim(coalesce(p_dados ->> 'motivo', '')), '');
  v_normal    text;
  v_demovidos integer := 0;
  v_indice    text;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('catalog.manage') then
    return jsonb_build_object('ok', false, 'bloqueio', 'sem_permissao',
      'erro', 'Você não tem permissão para gerenciar o catálogo.');
  end if;

  -- MOVER DE ALVO NÃO É ALTERAR. Aceitar isso silenciosamente transferiria um
  -- código de um produto para outro sem que a auditoria mostrasse uma troca de
  -- dono, e a operação legítima — remover e cadastrar — deixa os dois registros.
  if p_dados ? 'produto_id' or p_dados ? 'variante_id' then
    return jsonb_build_object('ok', false, 'bloqueio', 'alvo_imutavel',
      'erro', 'Um código não muda de item. Remova este e cadastre no outro item.');
  end if;

  -- `for update`: serializa duas alterações simultâneas da MESMA linha. A
  -- segunda espera, relê e decide em cima do estado real.
  select * into v_antes from public.product_barcodes where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'bloqueio', 'nao_encontrado',
      'erro', 'Código não encontrado.');
  end if;

  v_codigo   := coalesce(p_dados ->> 'codigo', v_antes.code);
  v_primario := coalesce((p_dados ->> 'primario')::boolean, v_antes.is_primary);
  v_normal   := public.normalizar_codigo_de_barras(v_codigo);

  if length(v_normal) < 4 or length(v_normal) > 48 then
    return jsonb_build_object('ok', false, 'bloqueio', 'codigo_invalido',
      'codigo_normalizado', v_normal,
      'erro', 'O código precisa ter de 4 a 48 caracteres úteis. '
              || 'Espaços e pontuação não contam.');
  end if;

  begin
    -- Só rebaixa quando está PROMOVENDO. Alterar o texto de um código que já
    -- era primário não mexe em mais ninguém.
    if v_primario and not v_antes.is_primary then
      v_demovidos := public.pdv_demover_primario(
        v_antes.product_id, v_antes.variant_id, p_id);
    end if;

    update public.product_barcodes
       set code = v_codigo, is_primary = v_primario
     where id = p_id;

  exception when unique_violation then
    get stacked diagnostics v_indice = constraint_name;
    if v_indice = 'product_barcodes_codigo' then
      return jsonb_build_object('ok', false, 'bloqueio', 'codigo_duplicado',
        'codigo_normalizado', v_normal,
        'erro', 'Este código já está cadastrado '
                || public.pdv_dono_do_codigo(v_normal)
                || '. Um código resolve para um único item.');
    end if;
    return jsonb_build_object('ok', false, 'bloqueio', 'primario_concorrente',
      'erro', 'Outra pessoa marcou o código primário deste item agora mesmo. '
              || 'Recarregue e tente de novo.');
  end;

  perform public.log_audit('codigo_de_barras_alterar', 'product_barcodes', p_id,
    jsonb_build_object('codigo', v_antes.code,
      'codigo_normalizado', v_antes.code_normalized,
      'primario', v_antes.is_primary),
    jsonb_build_object('codigo', v_codigo, 'codigo_normalizado', v_normal,
      'primario', v_primario, 'primarios_demovidos', v_demovidos),
    v_motivo);

  return jsonb_build_object('ok', true, 'id', p_id,
    'codigo', v_codigo, 'codigo_normalizado', v_normal,
    'primario', v_primario, 'primarios_demovidos', v_demovidos,
    'ean_valido', public.ean_valido(v_codigo),
    'aviso_ean', public.aviso_de_codigo_de_barras(v_codigo));
end;
$$;

comment on function public.alterar_codigo_de_barras is
  'Altera o texto e/ou o primario de um codigo. Nao move de item. catalog.manage.';

-- ------------------------------------------------------------------ remover

create or replace function public.remover_codigo_de_barras(
  p_id     uuid,
  p_motivo text default null
) returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator   uuid := public.current_app_user_id();
  v_antes  record;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('catalog.manage') then
    return jsonb_build_object('ok', false, 'bloqueio', 'sem_permissao',
      'erro', 'Você não tem permissão para gerenciar o catálogo.');
  end if;

  select * into v_antes from public.product_barcodes where id = p_id for update;

  -- Idempotente, mesma postura de `cancelar_pedido_com_estorno`: o duplo clique
  -- e o retry de rede são reais, e transformar isso em erro faria o operador
  -- procurar um problema que não existe.
  if not found then
    return jsonb_build_object('ok', true, 'ja_removido', true);
  end if;

  delete from public.product_barcodes where id = p_id;

  -- Auditoria ANTES de o registro desaparecer do alcance: o `before_data` é a
  -- única memória de que este código existiu (§28, §33).
  perform public.log_audit('codigo_de_barras_remover', 'product_barcodes', p_id,
    jsonb_build_object('codigo', v_antes.code,
      'codigo_normalizado', v_antes.code_normalized,
      'produto_id', v_antes.product_id, 'variante_id', v_antes.variant_id,
      'primario', v_antes.is_primary),
    null, v_motivo);

  -- Sem soft-delete, o código volta a estar livre — e dizer isso evita que
  -- alguém conclua que ficou "queimado".
  return jsonb_build_object('ok', true, 'ja_removido', false,
    'codigo_liberado', v_antes.code_normalized,
    'era_primario', v_antes.is_primary);
end;
$$;

comment on function public.remover_codigo_de_barras is
  'Remove um codigo e libera o valor para reuso. Idempotente. catalog.manage.';

-- ------------------------------------------------------- trocar o primário

create or replace function public.definir_codigo_primario(p_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator      uuid := public.current_app_user_id();
  v_antes     record;
  v_demovidos integer := 0;
  v_indice    text;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('catalog.manage') then
    return jsonb_build_object('ok', false, 'bloqueio', 'sem_permissao',
      'erro', 'Você não tem permissão para gerenciar o catálogo.');
  end if;

  select * into v_antes from public.product_barcodes where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'bloqueio', 'nao_encontrado',
      'erro', 'Código não encontrado.');
  end if;

  if v_antes.is_primary then
    return jsonb_build_object('ok', true, 'ja_primario', true,
      'primarios_demovidos', 0, 'id', p_id);
  end if;

  begin
    v_demovidos := public.pdv_demover_primario(
      v_antes.product_id, v_antes.variant_id, p_id);

    update public.product_barcodes set is_primary = true where id = p_id;

  exception when unique_violation then
    get stacked diagnostics v_indice = constraint_name;
    return jsonb_build_object('ok', false, 'bloqueio', 'primario_concorrente',
      'indice', v_indice,
      'erro', 'Outra pessoa marcou o código primário deste item agora mesmo. '
              || 'Recarregue e tente de novo.');
  end;

  perform public.log_audit('codigo_de_barras_primario', 'product_barcodes', p_id,
    jsonb_build_object('primario', false),
    jsonb_build_object('primario', true,
      'codigo_normalizado', v_antes.code_normalized,
      'primarios_demovidos', v_demovidos),
    null);

  return jsonb_build_object('ok', true, 'ja_primario', false,
    'id', p_id, 'primarios_demovidos', v_demovidos);
end;
$$;

comment on function public.definir_codigo_primario is
  'Troca o primario do alvo numa transacao: rebaixa o anterior e promove este. catalog.manage.';

-- ============================================================== PRIVILÉGIOS

-- `anon` não tem nada a fazer em nenhuma delas. A permissão semântica é
-- verificada no corpo das de escrita; na leitura, quem decide é a policy.
revoke all on function public.ean_valido(text) from public, anon;
revoke all on function public.aviso_de_codigo_de_barras(text) from public, anon;
revoke all on function public.codigos_de_barras_do_item(uuid, uuid) from public, anon;
revoke all on function public.cadastrar_codigo_de_barras(jsonb) from public, anon;
revoke all on function public.alterar_codigo_de_barras(uuid, jsonb) from public, anon;
revoke all on function public.remover_codigo_de_barras(uuid, text) from public, anon;
revoke all on function public.definir_codigo_primario(uuid) from public, anon;

grant execute on function public.ean_valido(text) to authenticated;
grant execute on function public.aviso_de_codigo_de_barras(text) to authenticated;
grant execute on function public.codigos_de_barras_do_item(uuid, uuid) to authenticated;
grant execute on function public.cadastrar_codigo_de_barras(jsonb) to authenticated;
grant execute on function public.alterar_codigo_de_barras(uuid, jsonb) to authenticated;
grant execute on function public.remover_codigo_de_barras(uuid, text) to authenticated;
grant execute on function public.definir_codigo_primario(uuid) to authenticated;
