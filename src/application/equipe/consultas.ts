import "server-only";

import { getSupabaseServerClient } from "@/infrastructure/supabase/server";
import { logger } from "@/lib/logger";
import type {
  DiferencaDeAcerto,
  HistoricoDoFuncionario,
  MembroDaEquipe,
  MovimentoInterno,
  PapelAtribuivel,
  ReferenciaSalarial,
  LancamentoParaConferencia,
  TipoDeMovimento,
} from "./tipos";

/**
 * Leitura das movimentações internas e do livro do funcionário.
 *
 * As duas projeções são SECURITY INVOKER, e é por isso que o Atendente vê a
 * lista de movimentos e NÃO vê o livro: não há `if` aqui decidindo isso — a
 * policy de cada tabela decide, e uma só (03 §17, CLAUDE.md §15).
 */

export type FiltroDeMovimentos = {
  tipo?: TipoDeMovimento;
  funcionario_id?: string;
  de?: string;
  ate?: string;
  limite?: number;
};

export async function listarMovimentos(
  filtros: FiltroDeMovimentos = {},
): Promise<MovimentoInterno[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("movimentos_internos", {
    p_filtros: {
      tipo: filtros.tipo ?? null,
      funcionario_id: filtros.funcionario_id ?? null,
      de: filtros.de ?? null,
      ate: filtros.ate ?? null,
      limite: filtros.limite ?? 100,
    },
  });

  if (error) {
    logger.error("equipe:listarMovimentos", { code: (error as { code?: string }).code });
    return [];
  }
  return (data as MovimentoInterno[]) ?? [];
}

/**
 * O livro de um funcionário. Sem `employees.finance.view` volta vazio — e
 * vazio é a resposta correta, não um erro que revelaria que há algo ali.
 */
/**
 * Diferenças de acerto do motoboy, pendentes primeiro (RN-RUN-006, 0144).
 * Sem `employees.finance.view` a função do banco devolve lista vazia.
 */
export async function listarDiferencasDeAcerto(funcionarioId: string): Promise<DiferencaDeAcerto[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("diferencas_de_acerto", { p_funcionario: funcionarioId });
  if (error) {
    logger.error("equipe:listarDiferencasDeAcerto", { code: (error as { code?: string }).code });
    return [];
  }
  return (data ?? []) as DiferencaDeAcerto[];
}

export async function obterHistorico(
  funcionarioId: string,
  limite = 100,
): Promise<HistoricoDoFuncionario> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("historico_do_funcionario", {
    p_funcionario: funcionarioId,
    p_limite: limite,
  });

  if (error) {
    logger.error("equipe:obterHistorico", { code: (error as { code?: string }).code });
    return { funcionario_id: funcionarioId, lancamentos: [], total_confirmado: 0 };
  }
  return data as HistoricoDoFuncionario;
}

/** Consulta isolada; nunca acrescentar estes campos à projeção `equipe()`. */
export async function listarReferenciasSalariais(): Promise<ReferenciaSalarial[] | null> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.from("employee_financial_profiles")
    .select("employee_id, salary_reference, salary_basis");
  if (error) {
    logger.error("equipe:listarReferenciasSalariais", { code: error.code });
    return null;
  }
  return (data ?? []).map((item) => ({
    funcionario_id: item.employee_id as string,
    valor: item.salary_reference === null ? null : Number(item.salary_reference),
    base: item.salary_basis as ReferenciaSalarial["base"],
  }));
}

/** Todos os lançamentos confirmados do mês, sem o limite de 100 do histórico. */
export async function listarLancamentosParaConferencia(
  funcionarioId: string,
  mes: string,
): Promise<LancamentoParaConferencia[] | null> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return null;
  const ano = Number(mes.slice(0, 4));
  const numeroMes = Number(mes.slice(5, 7));
  const inicio = `${mes}-01T00:00:00-03:00`;
  const fimMes = numeroMes === 12
    ? `${ano + 1}-01`
    : `${ano}-${String(numeroMes + 1).padStart(2, "0")}`;
  const fim = `${fimMes}-01T00:00:00-03:00`;
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.from("employee_ledger_entries")
    .select("id, entry_type, amount, occurred_at, reason")
    .eq("employee_id", funcionarioId)
    .eq("status", "confirmed")
    .gte("occurred_at", inicio)
    .lt("occurred_at", fim)
    .order("occurred_at", { ascending: false });
  if (error) {
    logger.error("equipe:listarLancamentosParaConferencia", { code: error.code });
    return null;
  }
  return (data ?? []).map((item) => ({
    id: item.id as string,
    tipo: item.entry_type as LancamentoParaConferencia["tipo"],
    valor: Number(item.amount),
    quando: item.occurred_at as string,
    motivo: item.reason as string,
  }));
}

export type FuncionarioBasico = {
  id: string;
  nome: string;
  e_entregador: boolean;
  ativo: boolean;
};

/**
 * Quem é quem, para atribuir um movimento a alguém.
 *
 * Lê `employees` direto: a policy exige `employees.view`, que o Atendente
 * tem — ele precisa saber a quem lançar o consumo. O que ele NÃO tem é
 * `employees.finance.view`, e por isso nada de dinheiro vem junto: esta
 * função não seleciona salário nem se relaciona com quem o guarda (§15).
 */
export async function listarFuncionarios(): Promise<FuncionarioBasico[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("employees")
    .select("id, full_name, is_driver, employment_status")
    .order("full_name");

  if (error) {
    logger.error("equipe:listarFuncionarios", { code: (error as { code?: string }).code });
    return [];
  }
  return (data ?? []).map((e) => ({
    id: e.id as string,
    nome: e.full_name as string,
    e_entregador: Boolean(e.is_driver),
    ativo: e.employment_status === "active",
  }));
}


/**
 * A equipe inteira, com acesso e papéis quando existirem.
 *
 * SEM SALÁRIO. Nem a coluna, nem um join, nem um campo derivado — a projeção
 * do banco também não o traz. Quem tem `employees.view` (o Atendente tem) lê
 * esta lista; salário exige `employees.finance.view`, que ele não tem (§15).
 */
export async function listarEquipe(): Promise<MembroDaEquipe[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("equipe");

  if (error) {
    logger.error("equipe:listarEquipe", { code: (error as { code?: string }).code });
    return [];
  }
  return (data as MembroDaEquipe[]) ?? [];
}

/** Papéis ativos, já marcando quais este usuário pode conceder (RN-RBAC-005). */
export async function listarPapeis(): Promise<PapelAtribuivel[]> {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.rpc("papeis_atribuiveis");

  if (error) {
    logger.error("equipe:listarPapeis", { code: (error as { code?: string }).code });
    return [];
  }
  return (data as PapelAtribuivel[]) ?? [];
}

/** Catálogo de permissões e papéis ativos com o que cada um concede. */
export async function listarPapeisComPermissoes(): Promise<{
  catalogo: { id: string; codigo: string }[];
  papeis: import("./tipos").PapelComPermissoes[];
}> {
  const supabase = await getSupabaseServerClient();
  const [cat, pap] = await Promise.all([
    supabase.from("permissions").select("id, code").order("code"),
    supabase
      .from("roles")
      .select("id, name, description, is_system, role_permissions(permissions(code))")
      .eq("is_active", true)
      .order("name"),
  ]);

  if (cat.error || pap.error) {
    logger.error("equipe:listarPapeisComPermissoes", {
      code: ((cat.error ?? pap.error) as { code?: string }).code,
    });
    return { catalogo: [], papeis: [] };
  }

  type Linha = {
    id: string;
    name: string;
    description: string | null;
    role_permissions: { permissions: { code: string } | { code: string }[] | null }[] | null;
  };
  return {
    catalogo: (cat.data ?? []).map((p) => ({ id: p.id as string, codigo: p.code as string })),
    papeis: ((pap.data ?? []) as unknown as Linha[]).map((r) => ({
      id: r.id,
      nome: r.name,
      descricao: r.description,
      somenteLeitura: r.name === "Owner/Admin",
      codigos: (r.role_permissions ?? [])
        .flatMap((rp) => (Array.isArray(rp.permissions) ? rp.permissions : rp.permissions ? [rp.permissions] : []))
        .map((p) => p.code)
        .sort(),
    })),
  };
}
