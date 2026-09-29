import type { Metadata } from "next";
import { obterSessaoInterna, podeNaUI } from "@/application/auth/sessao";
import {
  listarEquipe,
  listarFuncionarios,
  listarMovimentos,
  listarPapeis,
  obterHistorico,
} from "@/application/equipe/consultas";
import { obterCaixa } from "@/application/caixa/consultas";
import { PainelDaEquipe } from "./_ui/PainelDaEquipe";

export const metadata: Metadata = { title: "Funcionários / Equipe" };

/**
 * /admin/equipe
 *
 * Três abas, três assuntos: movimentações internas, cadastro da equipe, e —
 * para quem tem a permissão financeira — o histórico do funcionário.
 *
 * O QUE ESTA PÁGINA NÃO TEM: salário. Ele não é lido aqui, não é passado ao
 * painel e não viaja no HTML — nem para quem poderia vê-lo noutra tela. A
 * separação de §15 é de dados, não de botão escondido.
 *
 * O que continua fora é a CRIAÇÃO da conta de login: exigiria `service_role`
 * (CLAUDE.md §13) e uma política de senha ainda não normatizada. A tela
 * vincula conta existente e diz isso quando ela não existe (A-20).
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; funcionario?: string }>;
}) {
  const { aba, funcionario } = await searchParams;

  const sessao = await obterSessaoInterna();
  const podeVerFinanceiro = podeNaUI(sessao, "employees.finance.view");

  const podeGerirEquipe = podeNaUI(sessao, "employees.manage");

  /*
   * CADA ABA BUSCA SÓ O QUE MOSTRA (D-2026-09-29-90).
   *
   * Eram seis consultas em toda visita, qualquer que fosse a aba, e trocar de
   * aba repetia as seis. O painel monta as três seções e exibe só a da aba;
   * as outras recebem listas vazias, e nenhum estado dele nasce dessas listas.
   * A aba efetiva segue a mesma regra do painel: "livro" sem a permissão
   * financeira cai em movimentações.
   */
  const abaEfetiva =
    aba === "equipe" ? "equipe" : aba === "livro" && podeVerFinanceiro ? "livro" : "movimentos";
  const nenhum = <T,>(valor: T) => Promise.resolve(valor);

  const [funcionarios, equipe, papeis, movimentos, historico, caixa] = await Promise.all([
    abaEfetiva === "equipe" ? nenhum([]) : listarFuncionarios(),
    abaEfetiva === "equipe" ? listarEquipe() : nenhum([]),
    // A lista já vem marcando o que ESTE usuário pode conceder (RN-RBAC-005).
    abaEfetiva === "equipe" && podeGerirEquipe ? listarPapeis() : nenhum([]),
    abaEfetiva === "movimentos" ? listarMovimentos({ limite: 100 }) : nenhum([]),
    // Só busca o livro se houver permissão E alguém escolhido. Sem permissão
    // a projeção já voltaria vazia, mas não se pede o que não se pode ver.
    abaEfetiva === "livro" && funcionario ? obterHistorico(funcionario) : nenhum(null),
    // O caixa só decide o "pela gaveta" do adiantamento, no livro.
    abaEfetiva === "livro" ? obterCaixa() : nenhum({ aberto: false as const }),
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
        aba={aba === "livro" || aba === "equipe" ? aba : "movimentos"}
        funcionarios={funcionarios}
        equipe={equipe}
        papeis={papeis}
        movimentos={movimentos}
        historico={historico}
        funcionarioSelecionado={funcionario ?? null}
        meuAppUserId={sessao?.appUserId ?? null}
        podeVerFinanceiro={podeVerFinanceiro}
        podeLancar={podeNaUI(sessao, "employees.finance.manage")}
        podeGerirEquipe={podeGerirEquipe}
        // Dar acesso é transformar alguém em usuário: exige as duas permissões.
        podeGerirAcesso={podeGerirEquipe && podeNaUI(sessao, "roles.manage")}
        caixaAberto={caixa.aberto}
      />
    </div>
  );
}
