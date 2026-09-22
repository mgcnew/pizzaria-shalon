import type { Metadata } from "next";
import { obterSessaoInterna, podeNaUI } from "@/application/auth/sessao";
import {
  listarFuncionarios,
  listarMovimentos,
  obterHistorico,
} from "@/application/equipe/consultas";
import { PainelDaEquipe } from "./_ui/PainelDaEquipe";

export const metadata: Metadata = { title: "Funcionários / Equipe" };

/**
 * /admin/equipe
 *
 * Movimentações internas e, para quem tem a permissão financeira, o histórico
 * do funcionário.
 *
 * O QUE ESTA PÁGINA NÃO TEM: salário. Ele não é lido aqui, não é passado ao
 * painel e não viaja no HTML — nem para quem poderia vê-lo noutra tela. A
 * separação de §15 é de dados, não de botão escondido.
 *
 * O cadastro de funcionários (admissão, desligamento, dados pessoais) não faz
 * parte do escopo autorizado desta fase e continua pendente.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; funcionario?: string }>;
}) {
  const { aba, funcionario } = await searchParams;

  const sessao = await obterSessaoInterna();
  const podeVerFinanceiro = podeNaUI(sessao, "employees.finance.view");

  const [funcionarios, movimentos, historico] = await Promise.all([
    listarFuncionarios(),
    listarMovimentos({ limite: 100 }),
    // Só busca o livro se houver permissão E alguém escolhido. Sem permissão
    // a projeção já voltaria vazia, mas não se pede o que não se pode ver.
    podeVerFinanceiro && funcionario
      ? obterHistorico(funcionario)
      : Promise.resolve(null),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="m-0 font-display text-[24px] font-bold text-ink">Funcionários / Equipe</h1>
        <p className="m-0 mt-1 text-[13.5px] text-muted">
          Cortesia, consumo e perda saem do estoque — nunca do faturamento.
        </p>
      </header>

      <PainelDaEquipe
        aba={aba === "livro" ? "livro" : "movimentos"}
        funcionarios={funcionarios}
        movimentos={movimentos}
        historico={historico}
        funcionarioSelecionado={funcionario ?? null}
        meuAppUserId={sessao?.appUserId ?? null}
        podeVerFinanceiro={podeVerFinanceiro}
        podeLancar={podeNaUI(sessao, "employees.finance.manage")}
      />
    </div>
  );
}
