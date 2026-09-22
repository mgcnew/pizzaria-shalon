-- 0086 — Defeito: `v_antes` era referenciado sem ter sido atribuído
-- Encontrado pelo teste do complemento (`equipe_fase8b.sql`).
--
-- Em `salvar_funcionario`, `v_antes` é um `record` preenchido só no caminho
-- da EDIÇÃO. Na criação, o `case when v_novo then null else v_antes.full_name`
-- da chamada de auditoria ainda assim referencia o record — e o PL/pgSQL
-- precisa da estrutura da tupla para montar a expressão, mesmo no ramo que
-- não seria escolhido. Resultado: criar funcionário falhava sempre (55000).
--
-- É o mesmo tropeço da 0084, e a correção é a mesma: montar o "antes" numa
-- variável `jsonb` no ramo em que ele existe, e passar a variável.

create or replace function public.salvar_funcionario(p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_id uuid := nullif(p_dados ->> 'id', '')::uuid;
  v_nome text := nullif(btrim(coalesce(p_dados ->> 'nome', '')), '');
  v_tipo text := coalesce(nullif(p_dados ->> 'tipo', ''), 'other');
  v_entregador boolean := coalesce((p_dados ->> 'entregador')::boolean, false);
  v_antes record;
  -- O estado anterior já em jsonb: na criação ele é simplesmente nulo, e
  -- nenhuma expressão precisa olhar para um record que não existe.
  v_antes_json jsonb;
  v_novo boolean;
begin
  if v_ator is null then
    return jsonb_build_object('ok', false, 'erro', 'Sessão não identificada.');
  end if;
  if not public.has_permission('employees.manage') then
    return jsonb_build_object('ok', false, 'erro',
      'Você não tem permissão para gerenciar funcionários.');
  end if;

  if v_nome is null or length(v_nome) < 2 then
    return jsonb_build_object('ok', false, 'erro', 'Informe o nome completo.');
  end if;
  if v_tipo not in ('owner', 'counter', 'driver', 'other') then
    return jsonb_build_object('ok', false, 'erro', 'Tipo de funcionário inválido.');
  end if;

  v_novo := v_id is null;

  if v_novo then
    insert into public.employees (
      full_name, phone, employee_type, is_driver, started_at, notes)
    values (
      v_nome,
      nullif(btrim(coalesce(p_dados ->> 'telefone', '')), ''),
      v_tipo, v_entregador,
      nullif(p_dados ->> 'admitido_em', '')::date,
      nullif(btrim(coalesce(p_dados ->> 'observacao', '')), ''))
    returning id into v_id;
  else
    select * into v_antes from public.employees e where e.id = v_id for update;
    if v_antes.id is null then
      return jsonb_build_object('ok', false, 'erro', 'Funcionário não encontrado.');
    end if;

    v_antes_json := jsonb_build_object(
      'nome', v_antes.full_name, 'tipo', v_antes.employee_type,
      'entregador', v_antes.is_driver, 'telefone', v_antes.phone);

    -- Desligamento e reativação têm rotina própria, com motivo e data. Editar
    -- o cadastro não muda a situação de ninguém por acidente (RN-FUNC-001).
    update public.employees
       set full_name = v_nome,
           phone = nullif(btrim(coalesce(p_dados ->> 'telefone', '')), ''),
           employee_type = v_tipo,
           is_driver = v_entregador,
           started_at = nullif(p_dados ->> 'admitido_em', '')::date,
           notes = nullif(btrim(coalesce(p_dados ->> 'observacao', '')), '')
     where id = v_id;
  end if;

  perform public.log_audit(
    case when v_novo then 'funcionario_criar' else 'funcionario_editar' end,
    'employees', v_id,
    v_antes_json,
    jsonb_build_object('nome', v_nome, 'tipo', v_tipo, 'entregador', v_entregador),
    null);

  return jsonb_build_object('ok', true, 'funcionario_id', v_id, 'criado', v_novo);
end;
$$;

comment on function public.salvar_funcionario is
  'RN-FUNC-001: cadastro e edição. Situação (ativo/desligado) tem rotina própria.';

revoke all on function public.salvar_funcionario(jsonb) from public, anon;
grant execute on function public.salvar_funcionario(jsonb) to authenticated;
