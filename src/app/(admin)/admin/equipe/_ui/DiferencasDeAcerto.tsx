"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Textarea } from "@/ui/components";
import { Aviso, LinhaLista } from "@/ui/patterns";
import { formatBRL } from "@/lib/format";
import { dispensarDiferencaDoAcerto, lancarNoFuncionario } from "@/application/equipe/acoes";
import type { DiferencaDeAcerto } from "@/application/equipe/tipos";

/**
 * Diferenças de acerto do motoboy: a decisão da dona (RN-RUN-006, 0144).
 *
 * Nada aqui é automático (RN-RUN-005). Cada diferença fica pendente até
 * alguém com `employees.finance.manage` decidir, uma vez só:
 *   - "Lançar no funcionário": vira débito no livro dele (tipo diferença),
 *     ligado à corrida — só faz sentido para FALTA;
 *   - "Não lançar": fica arquivada, com o motivo.
 * Descontar ou não do salário continua sendo a conferência do mês.
 */

const DATA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

export function DiferencasDeAcerto({
  diferencas,
  funcionarioId,
  podeDecidir,
}: {
  diferencas: DiferencaDeAcerto[];
  funcionarioId: string;
  podeDecidir: boolean;
}) {
  const router = useRouter();
  const [enviando, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [decidindo, setDecidindo] = useState<{ acerto: string; acao: "lancar" | "dispensar" } | null>(null);
  const [motivo, setMotivo] = useState("");
  const tentativa = useRef(crypto.randomUUID());

  const pendentes = diferencas.filter((d) => d.situacao === "pendente").length;

  function executar(acao: () => Promise<{ ok: boolean; erro?: string }>) {
    setErro(null);
    iniciar(async () => {
      const r = await acao();
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível registrar a decisão.");
        return;
      }
      tentativa.current = crypto.randomUUID();
      setDecidindo(null);
      setMotivo("");
      router.refresh();
    });
  }

  return (
    <section className="mt-3 rounded-14 border border-border-shalon p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 text-[14.5px] font-bold text-ink">Diferenças de acerto</h3>
        {pendentes > 0 ? (
          <Badge tom="atencao">
            {pendentes} {pendentes === 1 ? "pendente" : "pendentes"}
          </Badge>
        ) : null}
      </div>
      <p className="m-0 mt-1 text-[12.5px] text-muted">
        Falta ou sobra registrada no acerto do motoboy. Nada é descontado sozinho: decida
        se cada uma vai para o livro dele.
      </p>

      {erro ? (
        <div className="mt-2">
          <Aviso erro={erro} />
        </div>
      ) : null}

      <div className="mt-2">
        {diferencas.map((d) => {
          const falta = d.diferenca < 0;
          const aberta = decidindo?.acerto === d.acerto_id;
          return (
            <LinhaLista key={d.acerto_id}>
              <div className="min-w-[200px] flex-1">
                <p className="m-0 text-[14px] font-semibold text-ink">
                  {falta ? "Falta" : "Sobra"} de {formatBRL(Math.abs(d.diferenca))}
                </p>
                <p className="m-0 text-[12.5px] text-muted">
                  Acerto de {DATA.format(new Date(d.acertado_em))} · deveria trazer{" "}
                  {formatBRL(d.esperado)}, trouxe {formatBRL(d.devolvido)}
                </p>
                {d.motivo ? <p className="m-0 text-[12.5px] text-ink-2">Motivo: {d.motivo}</p> : null}
                {d.situacao === "dispensada" && d.motivo_da_dispensa ? (
                  <p className="m-0 text-[12.5px] text-muted">Não lançada: {d.motivo_da_dispensa}</p>
                ) : null}

                {aberta ? (
                  <div className="mt-2 flex flex-col gap-2">
                    <Textarea
                      label={
                        decidindo?.acao === "lancar"
                          ? "Motivo do lançamento no funcionário"
                          : "Por que não lançar"
                      }
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      rows={2}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variante="primario"
                        disabled={enviando || motivo.trim().length < 3}
                        onClick={() =>
                          executar(() =>
                            decidindo?.acao === "lancar"
                              ? lancarNoFuncionario({
                                  funcionario_id: funcionarioId,
                                  tipo: "discrepancy",
                                  valor: Math.abs(d.diferenca),
                                  motivo: motivo.trim(),
                                  corrida_id: d.corrida_id,
                                  tentativa: tentativa.current,
                                })
                              : dispensarDiferencaDoAcerto({
                                  acerto_id: d.acerto_id,
                                  motivo: motivo.trim(),
                                }),
                          )
                        }
                      >
                        {decidindo?.acao === "lancar"
                          ? `Lançar ${formatBRL(Math.abs(d.diferenca))} no funcionário`
                          : "Confirmar: não lançar"}
                      </Button>
                      <Button variante="secundario" onClick={() => setDecidindo(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>

              {d.situacao === "lancada" ? (
                <Badge tom="destaque">Lançada no funcionário</Badge>
              ) : d.situacao === "dispensada" ? (
                <Badge tom="indisponivel">Não lançada</Badge>
              ) : podeDecidir && !aberta ? (
                <div className="flex flex-wrap items-center gap-2">
                  {falta ? (
                    <Button
                      variante="secundario"
                      onClick={() => {
                        setMotivo(d.motivo ? `Falta no acerto: ${d.motivo}` : "Falta no acerto");
                        setDecidindo({ acerto: d.acerto_id, acao: "lancar" });
                      }}
                    >
                      Lançar no funcionário
                    </Button>
                  ) : null}
                  <Button
                    variante="secundario"
                    onClick={() => {
                      setMotivo("");
                      setDecidindo({ acerto: d.acerto_id, acao: "dispensar" });
                    }}
                  >
                    Não lançar
                  </Button>
                </div>
              ) : !aberta ? (
                <Badge tom="atencao">Pendente</Badge>
              ) : null}
            </LinhaLista>
          );
        })}
      </div>
    </section>
  );
}
