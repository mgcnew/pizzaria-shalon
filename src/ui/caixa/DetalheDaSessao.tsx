"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Button } from "@/ui/components";
import { Aviso } from "@/ui/patterns";
import { obterResumoDaSessao } from "@/application/caixa/acoes";
import type { ResumoDeFechamento } from "@/application/caixa/tipos";
import { ResumoVisualDoFechamento } from "./ResumoVisualDoFechamento";

/**
 * O fechamento completo de uma sessão dentro do relatório de caixa: dinheiro
 * da gaveta, recebido por TODAS as formas de pagamento, o que foi vendido e o
 * movimento da gaveta. É o mesmo resumo da tela de fechar (`ResumoVisualDoFechamento`).
 *
 * Só carrega quando a pessoa abre — um relatório de 30 dias tem dezenas de
 * sessões, e buscar o resumo de todas no carregamento seria trabalho jogado fora.
 */

function Carregado({ resumo }: { resumo: ResumoDeFechamento }) {
  const fechada = resumo.status === "closed";
  return (
    <ResumoVisualDoFechamento
      conferencia={{
        fechado: fechada,
        esperado: resumo.esperado_em_dinheiro,
        contado: resumo.contado ?? 0,
        diferenca: resumo.diferenca ?? 0,
        resumo,
      }}
      aberto
      semConferencia={!fechada}
      idDoDocumento={null}
    />
  );
}

export function DetalheDaSessao({ sessaoId }: { sessaoId: string }) {
  const [estado, setEstado] = useState<
    { tipo: "carregando" } | { tipo: "erro"; mensagem: string } | { tipo: "pronto"; resumo: ResumoDeFechamento }
  >({ tipo: "carregando" });

  const carregar = useCallback(async () => {
    setEstado({ tipo: "carregando" });
    try {
      const r = await obterResumoDaSessao(sessaoId);
      setEstado(r.ok ? { tipo: "pronto", resumo: r.resumo } : { tipo: "erro", mensagem: r.erro });
    } catch {
      setEstado({ tipo: "erro", mensagem: "Sem conexão. Tente de novo." });
    }
  }, [sessaoId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial ao abrir o detalhe
    void carregar();
  }, [carregar]);

  if (estado.tipo === "carregando") {
    return (
      <p role="status" className="m-0 py-3 text-[13px] text-muted">
        Carregando o fechamento…
      </p>
    );
  }
  if (estado.tipo === "erro") {
    return (
      <div className="flex flex-col items-start gap-2 py-2">
        <Aviso erro={estado.mensagem} />
        <Button type="button" variante="secundario" onClick={() => void carregar()}>
          Tentar de novo
        </Button>
      </div>
    );
  }
  return <Carregado resumo={estado.resumo} />;
}

const chevron = (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="shrink-0 transition-transform group-open:rotate-180" style={{ width: 18, height: 18 }}>
    <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Celular: o detalhe abre dentro do próprio cartão da sessão. */
export function DetalheNoCartao({ sessaoId }: { sessaoId: string }) {
  const [abriu, setAbriu] = useState(false);
  return (
    <details
      className="group mt-3"
      onToggle={(e) => {
        if (e.currentTarget.open) setAbriu(true);
      }}
    >
      <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between gap-3 rounded-12 border-[1.5px] border-border-shalon px-3 text-[14px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
        <span>Ver fechamento completo</span>
        {chevron}
      </summary>
      <div className="pt-3">{abriu ? <DetalheDaSessao sessaoId={sessaoId} /> : null}</div>
    </details>
  );
}

/**
 * Telas maiores: a linha da tabela ganha um botão e, aberta, uma linha extra
 * de largura total logo abaixo. `children` são as células da linha, já
 * montadas pelo servidor.
 */
export function LinhaExpansivel({
  sessaoId,
  colunas,
  children,
}: {
  sessaoId: string;
  colunas: number;
  children: ReactNode;
}) {
  const [aberta, setAberta] = useState(false);
  return (
    <>
      <tr>
        {children}
        <td className="border-b border-border-shalon py-2 pl-2 align-top">
          <button
            type="button"
            aria-expanded={aberta}
            onClick={() => setAberta((v) => !v)}
            className="motion-interactive inline-flex min-h-touch items-center gap-1 whitespace-nowrap rounded-11 border-[1.5px] border-border-shalon px-[11px] text-[13px] font-semibold text-ink transition-colors hover:border-brand-orange"
          >
            {aberta ? "Recolher" : "Ver tudo"}
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className={`shrink-0 transition-transform ${aberta ? "rotate-180" : ""}`} style={{ width: 16, height: 16 }}>
              <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </td>
      </tr>
      {aberta ? (
        <tr>
          <td colSpan={colunas + 1} className="border-b border-border-shalon bg-elev p-3">
            <div className="mx-auto max-w-[720px]">
              <DetalheDaSessao sessaoId={sessaoId} />
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
