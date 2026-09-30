-- A referência salarial continua separada dos dados operacionais da equipe.
-- Um valor pode ser combinado por diária ou por mês; lançamentos do livro
-- seguem independentes e nunca alteram esta referência automaticamente.
alter table public.employee_financial_profiles
  add column salary_basis text not null default 'monthly'
  constraint employee_financial_base_valida check (salary_basis in ('daily', 'monthly'));

comment on column public.employee_financial_profiles.salary_basis is
  'Unidade do valor combinado: diária ou mês. Não calcula folha nem desconto.';

-- Salva cadastro e referência na mesma transação quando o usuário possui as
-- duas permissões. Chamadas antigas sem salario_valor preservam o perfil.
create function public.salvar_funcionario_com_referencia(p_dados jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_ator uuid := public.current_app_user_id();
  v_resultado jsonb;
  v_id uuid;
  v_valor numeric(12,2);
  v_base text;
  v_anterior record;
begin
  if p_dados ? 'salario_valor' then
    if v_ator is null or not public.has_permission('employees.manage')
       or not public.has_permission('employees.finance.manage')
       or not public.has_permission('employees.finance.view') then
      return jsonb_build_object('ok', false, 'erro',
        'Você não tem permissão para definir o salário do funcionário.');
    end if;

    if p_dados -> 'salario_valor' <> 'null'::jsonb then
      if jsonb_typeof(p_dados -> 'salario_valor') <> 'number'
         or (p_dados ->> 'salario_valor') !~ '^[0-9]{1,10}(\.[0-9]{1,2})?$' then
        return jsonb_build_object('ok', false, 'erro', 'Informe um salário válido em reais.');
      end if;
      v_valor := (p_dados ->> 'salario_valor')::numeric(12,2);
      v_base := p_dados ->> 'salario_base';
      if v_base not in ('daily', 'monthly') or v_base is null then
        return jsonb_build_object('ok', false, 'erro', 'Escolha diária ou mensal.');
      end if;
    else
      v_valor := null;
      v_base := 'monthly';
    end if;
  end if;

  v_resultado := public.salvar_funcionario(p_dados);
  if not coalesce((v_resultado ->> 'ok')::boolean, false)
     or not (p_dados ? 'salario_valor') then
    return v_resultado;
  end if;

  v_id := (v_resultado ->> 'funcionario_id')::uuid;
  select salary_reference, salary_basis into v_anterior
    from public.employee_financial_profiles where employee_id = v_id for update;
  if not found then
    insert into public.employee_financial_profiles
      (employee_id, salary_reference, salary_basis, updated_by)
    values (v_id, v_valor, v_base, v_ator);
  elsif v_anterior.salary_reference is distinct from v_valor
     or v_anterior.salary_basis is distinct from v_base then
    update public.employee_financial_profiles
       set salary_reference = v_valor,
           salary_basis = v_base,
           updated_by = v_ator
     where employee_id = v_id;
  end if;

  return v_resultado;
end;
$$;

revoke all on function public.salvar_funcionario_com_referencia(jsonb) from public, anon;
grant execute on function public.salvar_funcionario_com_referencia(jsonb) to authenticated;
