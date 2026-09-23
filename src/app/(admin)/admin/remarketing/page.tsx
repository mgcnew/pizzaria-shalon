import type { Metadata } from "next";
import Link from "next/link";
import { obterSessaoInterna, podeNaUI } from "@/application/auth/sessao";
import {
  listarCandidatos,
  listarTemplates,
  obterRelatorio,
} from "@/application/remarketing/consultas";
import { Cartao } from "@/ui/patterns";
import { PainelDeRemarketing } from "./_ui/PainelDeRemarketing";

export const metadata: Metadata = { title: "Remarketing" };

const AUSENCIAS = [15, 30, 60, 90];

/**
 * /admin/remarketing
 *
 * O QUE ESTA TELA É: uma lista de quem sumiu, com a mensagem pronta e o botão
 * que abre o WhatsApp da pessoa que vai falar.
 *
 * O QUE ELA NÃO É, e não vai virar sem nova decisão: disparo automático,
 * campanha em massa, integração com a API do WhatsApp Business ou qualquer
 * afirmação de que a campanha gerou a venda (CLAUDE.md §31, §46).
 *
 * O consentimento é levado a sério no banco, não na interface: a lista já
 * chega filtrada, e a RPC recusa preparar contato promocional com quem pediu
 * para não receber, mesmo que alguém chame direto (RN-RMKT-006).
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ ausencia?: string }>;
}) {
  const { ausencia } = await searchParams;
  const dias = AUSENCIAS.includes(Number(ausencia)) ? Number(ausencia) : 30;

  const [sessao, candidatos, templates, relatorio] = await Promise.all([
    obterSessaoInterna(),
    listarCandidatos({ ausencia_minima: dias, limite: 50 }),
    listarTemplates(),
    obterRelatorio("30d"),
  ]);

  const aguardando = (relatorio?.contatos ?? []).filter((c) => c.resultado === null);
  const resumo = relatorio?.resumo;

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="m-0 font-display text-[24px] font-bold text-ink">Remarketing</h1>
        <p className="m-0 mt-1 text-[13.5px] text-muted">
          Quem sumiu, a mensagem pronta e o registro do que aconteceu. Quem fala é você.
        </p>
      </header>

      <Cartao largura="cheio">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] font-semibold text-muted">Sem comprar há</span>
          {AUSENCIAS.map((d) => (
            <Link
              key={d}
              href={`/admin/remarketing?ausencia=${d}`}
              aria-current={d === dias ? "true" : undefined}
              className={[
                "motion-interactive inline-flex min-h-touch items-center rounded-11 px-[13px] text-[13px] font-semibold transition-colors",
                d === dias
                  ? "bg-cta text-cta-fg"
                  : "border-[1.5px] border-border-shalon text-ink hover:border-brand-orange",
              ].join(" ")}
            >
              {d}+ dias
            </Link>
          ))}
        </div>
      </Cartao>

      {resumo ? (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-16 border border-border-shalon bg-surface p-3">
            <p className="m-0 text-[12px] font-semibold uppercase tracking-[0.04em] text-muted">
              Contatos preparados
            </p>
            <p className="m-0 mt-1 font-display text-[20px] font-bold text-ink">
              {resumo.contatos_preparados}
            </p>
            <p className="m-0 mt-1 text-[11.5px] text-muted">Nos últimos 30 dias</p>
          </div>
          <div className="rounded-16 border border-border-shalon bg-surface p-3">
            <p className="m-0 text-[12px] font-semibold uppercase tracking-[0.04em] text-muted">
              Sem desfecho informado
            </p>
            <p className="m-0 mt-1 font-display text-[20px] font-bold text-ink">
              {resumo.sem_resultado_informado}
            </p>
            <p className="m-0 mt-1 text-[11.5px] text-muted">Não é &ldquo;sem resposta&rdquo;</p>
          </div>
          <div className="rounded-16 border border-border-shalon bg-surface p-3">
            <p className="m-0 text-[12px] font-semibold uppercase tracking-[0.04em] text-muted">
              Compraram depois
            </p>
            <p className="m-0 mt-1 font-display text-[20px] font-bold text-ink">
              {resumo.com_compra_posterior}
            </p>
            <p className="m-0 mt-1 text-[11.5px] text-muted">Fato temporal, não causa</p>
          </div>
          <div className="rounded-16 border border-border-shalon bg-surface p-3">
            <p className="m-0 text-[12px] font-semibold uppercase tracking-[0.04em] text-muted">
              Pediram para não receber
            </p>
            <p className="m-0 mt-1 font-display text-[20px] font-bold text-ink">
              {resumo.pediram_para_nao_receber}
            </p>
          </div>
        </section>
      ) : null}

      <PainelDeRemarketing
        candidatos={candidatos.candidatos}
        templates={templates}
        aguardandoDesfecho={aguardando}
        podeContatar={podeNaUI(sessao, "remarketing.contact")}
        segmento={`ausentes_${dias}`}
      />

      {relatorio ? (
        <p className="text-[12px] text-muted">{relatorio.ressalva}</p>
      ) : null}
    </div>
  );
}
