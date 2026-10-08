import type { Metadata } from "next";
import { Abas, type Aba } from "@/ui/patterns";
import { obterSessaoInterna, podeNaUI } from "@/application/auth/sessao";
import { SecaoPizzaria } from "./_ui/SecaoPizzaria";
import { SecaoHorarios } from "./_ui/SecaoHorarios";
import { SecaoEntrega } from "./_ui/SecaoEntrega";
import { SecaoPagamentos } from "./_ui/SecaoPagamentos";
import { SecaoOperacao } from "./_ui/SecaoOperacao";
import { SecaoAuditoria } from "./_ui/SecaoAuditoria";
import { SecaoImpressora } from "./_ui/SecaoImpressora";

export const metadata: Metadata = { title: "Configurações" };

/**
 * Configurações — a tela do design aprovado, com as mesmas seções em pílula.
 *
 * O design tinha: Pizzaria · Horários · Entrega · Pagamentos · Operação ·
 * Impressora · Aparência · Auditoria.
 *
 * "Impressora" entrou com a impressora de 80 mm do balcão (D-2026-10-08-116).
 * Ao contrário das outras seções, é configuração DO APARELHO, guardada no
 * navegador: a impressora está ligada nele, e não na loja.
 *
 * "Aparência" deixou de ser uma seção: claro/escuro é preferência do
 * navegador e fica disponível globalmente na topbar administrativa.
 */

const SECOES: readonly Aba[] = [
  { nome: "Pizzaria", valor: "pizzaria" },
  { nome: "Horários", valor: "horarios" },
  { nome: "Entrega", valor: "entrega" },
  { nome: "Pagamentos", valor: "pagamentos" },
  { nome: "Operação", valor: "operacao" },
  { nome: "Impressora", valor: "impressora" },
  { nome: "Auditoria", valor: "auditoria" },
];

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const bruto = typeof params["secao"] === "string" ? params["secao"] : "";
  const secao = SECOES.some((s) => s.valor === bruto) ? bruto : "pizzaria";

  const sessao = await obterSessaoInterna();
  const podeGerenciar = podeNaUI(sessao, "settings.manage");
  const podeVerAuditoria = podeNaUI(sessao, "audit.view");

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-4">
      <Abas abas={SECOES} atual={secao} parametro="secao" base="/admin/configuracoes" />

      {!podeGerenciar ? (
        <p className="m-0 rounded-12 border border-tib bg-ti px-3 py-[10px] text-[13.5px] font-semibold text-tif">
          Você pode consultar as configurações, mas não alterá-las. Alterações de configuração
          crítica exigem permissão própria e ficam registradas na auditoria.
        </p>
      ) : null}

      {secao === "pizzaria" ? <SecaoPizzaria podeGerenciar={podeGerenciar} /> : null}
      {secao === "horarios" ? <SecaoHorarios podeGerenciar={podeGerenciar} /> : null}
      {secao === "entrega" ? <SecaoEntrega podeGerenciar={podeGerenciar} /> : null}
      {secao === "pagamentos" ? <SecaoPagamentos podeGerenciar={podeGerenciar} /> : null}
      {secao === "operacao" ? <SecaoOperacao podeGerenciar={podeGerenciar} /> : null}
      {secao === "impressora" ? <SecaoImpressora /> : null}

      {secao === "auditoria" ? <SecaoAuditoria podeVer={podeVerAuditoria} /> : null}
    </div>
  );
}
