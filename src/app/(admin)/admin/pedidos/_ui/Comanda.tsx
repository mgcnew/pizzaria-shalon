"use client";

import { useState, useTransition } from "react";
import { confirmarImpressao, emitirDocumento } from "@/application/pedidos/acoes";
import type { ImpressaoDoPedido } from "@/application/pedidos/tipos";
import type { LinhaComanda } from "@/domain/pedidos/comanda";

/**
 * Comanda 58 mm — emissão, conferência e registro do desfecho.
 *
 * O QUE ESTA TELA NÃO AFIRMA: que imprimiu.
 *
 * O transporte físico ainda não foi escolhido (A-08; o roteiro da POC está
 * em `06-PENDENCIAS-VALIDACAO-PRODUCAO.md`), e mesmo depois dele vários
 * caminhos não devolvem confirmação do equipamento. Por isso a emissão
 * registra `solicitada`, e quem diz se saiu no papel é a pessoa que olhou
 * para a impressora.
 *
 * O documento em si é gerado pelo domínio (`montarComanda`), em 32 colunas,
 * de forma determinística. O que aparece aqui em fonte monoespaçada é
 * exatamente o que seria enviado.
 */

const ROTULO_STATUS: Record<ImpressaoDoPedido["status"], string> = {
  requested: "Solicitada",
  sent: "Enviada",
  confirmed: "Confirmada",
  error: "Falhou",
};

export function Comanda({
  pedidoId,
  impressoes,
  podeEmitirAlteracao,
}: {
  pedidoId: string;
  impressoes: ImpressaoDoPedido[];
  podeEmitirAlteracao: boolean;
}) {
  const [documento, setDocumento] = useState<{
    id: string;
    via: number;
    linhas: LinhaComanda[];
  } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [motivoFalha, setMotivoFalha] = useState("");
  const [pedindoFalha, setPedindoFalha] = useState(false);
  const [viaLocalDaComanda, setViaLocalDaComanda] = useState(0);
  const [ocupado, iniciar] = useTransition();

  /**
   * Quantas vias de comanda este pedido já tem.
   *
   * O `max` com a via local existe porque o rótulo do botão precisa mudar
   * assim que a primeira via sai — e quem abre a comanda direto do PDV,
   * logo depois de criar a venda, recebe `impressoes` vazio, porque o
   * pedido não existia quando a página foi renderizada. Sem isto o botão
   * continuaria dizendo "Emitir comanda" depois de emitir uma, convidando
   * a segunda via a ser tratada como se fosse a primeira.
   *
   * A via NÃO é contada aqui: ela vem de `registrar_impressao`, que é a
   * autoridade. Guardamos o número que o servidor devolveu, nada mais.
   */
  const comandasEmitidas = Math.max(
    impressoes.filter((i) => i.tipo === "comanda").length,
    viaLocalDaComanda,
  );

  function emitir(tipo: "comanda" | "alteracao") {
    setErro(null);
    setDocumento(null);
    setPedindoFalha(false);
    iniciar(async () => {
      const r = await emitirDocumento(pedidoId, tipo);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setDocumento({ id: r.impressao_id, via: r.via, linhas: r.linhas });
      if (tipo === "comanda") setViaLocalDaComanda(r.via);
    });
  }

  function registrar(status: "confirmed" | "error", motivo?: string) {
    if (documento === null) return;
    iniciar(async () => {
      const r = await confirmarImpressao(documento.id, status, motivo);
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível registrar o resultado.");
        return;
      }
      setDocumento(null);
      setPedindoFalha(false);
      setMotivoFalha("");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={ocupado}
          onClick={() => emitir("comanda")}
          className="min-h-touch cursor-pointer rounded-11 border-0 bg-cta px-4 text-[14px] font-semibold text-cta-fg disabled:cursor-not-allowed disabled:opacity-60"
        >
          {comandasEmitidas === 0
            ? "Emitir comanda"
            : `Reimprimir comanda (via ${comandasEmitidas + 1})`}
        </button>

        {podeEmitirAlteracao ? (
          <button
            type="button"
            disabled={ocupado}
            onClick={() => emitir("alteracao")}
            className="min-h-touch cursor-pointer rounded-11 border-[1.5px] border-twb bg-tw px-4 text-[14px] font-semibold text-twf disabled:cursor-not-allowed disabled:opacity-60"
          >
            Emitir documento de ALTERAÇÃO
          </button>
        ) : null}
      </div>

      {comandasEmitidas > 0 ? (
        <p className="m-0 text-[12.5px] text-muted">
          A partir da segunda via é reimpressão, e ela fica registrada com autor e horário.
        </p>
      ) : null}

      {erro !== null ? (
        <p
          role="alert"
          className="m-0 rounded-10 bg-td px-3 py-2 text-[13px] font-semibold text-tdf"
        >
          {erro}
        </p>
      ) : null}

      {documento !== null ? (
        <div className="rounded-12 border border-border-shalon bg-elev p-3">
          <p className="m-0 mb-2 text-[13px] font-semibold text-ink">
            Via {documento.via} — confira antes de registrar o resultado
          </p>
          <pre className="m-0 max-h-[360px] overflow-auto whitespace-pre rounded-10 bg-surface p-3 font-mono text-[12px] leading-[1.35] text-ink">
            {documento.linhas.map((l) => l.texto).join("\n")}
          </pre>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={ocupado}
              onClick={() => registrar("confirmed")}
              className="min-h-touch cursor-pointer rounded-11 border-0 bg-cta px-4 text-[14px] font-semibold text-cta-fg disabled:opacity-60"
            >
              Saiu no papel
            </button>
            <button
              type="button"
              disabled={ocupado}
              onClick={() => setPedindoFalha(true)}
              className="min-h-touch cursor-pointer rounded-11 border-[1.5px] border-tdb bg-td px-4 text-[14px] font-semibold text-tdf disabled:opacity-60"
            >
              Não saiu
            </button>
          </div>

          {pedindoFalha ? (
            <div className="mt-2">
              <label
                htmlFor="falha-impressao"
                className="mb-[6px] block text-[13px] font-semibold text-ink"
              >
                O que aconteceu?
              </label>
              <input
                id="falha-impressao"
                value={motivoFalha}
                onChange={(e) => setMotivoFalha(e.target.value)}
                maxLength={200}
                placeholder="Impressora desligada, sem papel, não conectou…"
                className="w-full min-h-touch rounded-11 border-[1.5px] border-border-shalon bg-surface px-3 text-[14px] text-ink focus:border-brand-orange focus:outline-none"
              />
              <button
                type="button"
                disabled={ocupado || motivoFalha.trim().length < 3}
                onClick={() => registrar("error", motivoFalha.trim())}
                className="mt-2 min-h-touch cursor-pointer rounded-11 border-0 bg-cta px-4 text-[14px] font-semibold text-cta-fg disabled:cursor-not-allowed disabled:bg-tn disabled:text-muted"
              >
                Registrar a falha
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {impressoes.length > 0 ? (
        <div>
          <h3 className="m-0 mb-1 text-[13px] font-bold uppercase tracking-wide text-ink-2">
            Impressões
          </h3>
          <ul className="m-0 list-none p-0">
            {impressoes.map((i) => (
              <li
                key={i.id}
                className="flex flex-wrap justify-between gap-2 border-b border-border-shalon py-[6px] text-[13px] last:border-0"
              >
                <span className="text-ink">
                  {i.tipo === "comanda" ? "Comanda" : "ALTERAÇÃO"} · via {i.via}
                </span>
                <span
                  className={
                    i.status === "confirmed"
                      ? "font-semibold text-tgf"
                      : i.status === "error"
                        ? "font-semibold text-tdf"
                        : "text-ink-2"
                  }
                >
                  {ROTULO_STATUS[i.status]}
                  {i.erro !== null ? ` — ${i.erro}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
