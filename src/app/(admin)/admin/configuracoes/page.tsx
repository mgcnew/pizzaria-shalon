import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Abas, Cartao, type Aba } from "@/ui/patterns";
import { SeletorDeTema } from "@/ui/components";
import { COOKIE_TEMA, temaDoCookie } from "@/ui/tema";
import { obterSessaoInterna, podeNaUI } from "@/application/auth/sessao";
import { SecaoPizzaria } from "./_ui/SecaoPizzaria";
import { SecaoHorarios } from "./_ui/SecaoHorarios";
import { SecaoEntrega } from "./_ui/SecaoEntrega";
import { SecaoPagamentos } from "./_ui/SecaoPagamentos";
import { SecaoOperacao } from "./_ui/SecaoOperacao";
import { SecaoAuditoria } from "./_ui/SecaoAuditoria";

export const metadata: Metadata = { title: "Configurações" };

/**
 * Configurações — a tela do design aprovado, com as mesmas seções em pílula.
 *
 * O design tinha: Pizzaria · Horários · Entrega · Pagamentos · Operação ·
 * Impressora · Aparência · Auditoria.
 *
 * "Impressora" NÃO foi implementada nesta fase, e isso é deliberado: a
 * impressão 58 mm é escopo da Fase 6 (05-PLANO §7.1 não a inclui na Fase 3) e
 * depende de prova de conceito com o equipamento real (pendência A-08). Uma
 * aba com botão "Teste de impressão" que não imprime seria pior que a
 * ausência dela.
 *
 * As demais seções estão todas aqui, e agora editáveis: no protótipo a maior
 * parte era lista somente leitura.
 */

const SECOES: readonly Aba[] = [
  { nome: "Pizzaria", valor: "pizzaria" },
  { nome: "Horários", valor: "horarios" },
  { nome: "Entrega", valor: "entrega" },
  { nome: "Pagamentos", valor: "pagamentos" },
  { nome: "Operação", valor: "operacao" },
  { nome: "Aparência", valor: "aparencia" },
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

  const temaAtual = temaDoCookie((await cookies()).get(COOKIE_TEMA)?.value);

  const sessao = await obterSessaoInterna();
  const podeGerenciar = podeNaUI(sessao, "settings.manage");
  const podeVerAuditoria = podeNaUI(sessao, "audit.view");

  return (
    <div className="flex flex-col gap-4">
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

      {secao === "aparencia" ? (
        <Cartao
          titulo="Aparência"
          descricao="Preferência deste navegador. Não muda nada para as outras pessoas da equipe."
        >
          <SeletorDeTema atual={temaAtual} />
          <p className="mt-[14px] text-[13px] text-ink-2">
            O tema de acento — amarelo no cardápio público, vermelho no administrativo — é um token
            do design e acompanha a área do sistema, não uma escolha por pessoa.
          </p>
        </Cartao>
      ) : null}

      {secao === "auditoria" ? <SecaoAuditoria podeVer={podeVerAuditoria} /> : null}
    </div>
  );
}
