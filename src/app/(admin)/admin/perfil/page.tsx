import type { Metadata } from "next";
import { obterSessaoInterna, podeNaUI } from "@/application/auth/sessao";
import { Input } from "@/ui/components";
import { Cartao } from "@/ui/patterns";
import { FormularioAcao } from "../produtos/_ui/FormularioAcao";
import { atualizarPerfil } from "./actions";

export const metadata: Metadata = { title: "Meu perfil" };

export default async function Page() {
  const sessao = await obterSessaoInterna();
  const podeAlterar = podeNaUI(sessao, "employees.manage");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="m-0 font-display text-[22px] font-extrabold text-ink">Meu perfil</h2>
        <p className="mb-0 mt-1 text-[13.5px] text-muted">
          Dados usados para identificar suas ações no painel administrativo.
        </p>
      </div>

      <Cartao titulo="Dados pessoais" descricao="O nome aparece na topbar e nos registros internos.">
        {podeAlterar ? (
          <FormularioAcao acao={atualizarPerfil} rotulo="Salvar perfil">
            <Input label="Nome exibido" name="nome" defaultValue={sessao?.nome ?? ""} required />
          </FormularioAcao>
        ) : (
          <>
            <p className="m-0 text-[15px] font-semibold text-ink">{sessao?.nome}</p>
            <p className="mb-0 mt-2 text-[13px] text-muted">
              A alteração do nome exige permissão de gestão de funcionários.
            </p>
          </>
        )}
      </Cartao>

      <Cartao
        titulo="Papéis de acesso"
        descricao="Os papéis definem permissões e só podem ser alterados pela gestão da equipe."
      >
        <div className="flex flex-wrap gap-2">
          {(sessao?.papeis.length ? sessao.papeis : ["Sem papel atribuído"]).map((papel) => (
            <span
              key={papel}
              className="inline-flex min-h-[34px] items-center rounded-pill border border-border-shalon bg-tn px-3 text-[12.5px] font-semibold text-ink-2"
            >
              {papel}
            </span>
          ))}
        </div>
      </Cartao>
    </div>
  );
}
