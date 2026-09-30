"use client";

import { useState, useTransition } from "react";
import { Button, SelectMenu, Textarea } from "@/ui/components";
import { Aviso, Cartao, EmptyState } from "@/ui/patterns";
import { formatBRL } from "@/lib/format";
import { prepararContato, registrarResultado } from "@/application/remarketing/acoes";
import type {
  Candidato,
  ContatoNoRelatorio,
  ResultadoDoContato,
  Template,
} from "@/application/remarketing/tipos";

/**
 * Remarketing assistido, do jeito que a V1 permite (CLAUDE.md §31).
 *
 * O FLUXO, E POR QUE ELE TEM DOIS PASSOS:
 *
 *   1. PREPARAR — o sistema registra a tentativa e abre o WhatsApp com o
 *      texto pronto. Nesse instante ele não sabe se alguém falou com o
 *      cliente: sabe apenas que um link foi aberto.
 *   2. INFORMAR O DESFECHO — depois da conversa, quem falou diz o que
 *      aconteceu. É esse passo que produz o histórico confiável.
 *
 * Juntar os dois passos daria um número bonito ("120 contatos enviados") e
 * falso. O painel prefere mostrar "preparados" e "sem desfecho informado"
 * separados, porque é o que de fato se sabe.
 *
 * "Pediu para não receber" retira o consentimento na mesma transação do
 * banco — e o cliente some da lista na próxima busca (RN-RMKT-007).
 */

const RESULTADOS: { valor: ResultadoDoContato; rotulo: string }[] = [
  { valor: "contacted", rotulo: "Falei com o cliente" },
  { valor: "interested", rotulo: "Demonstrou interesse" },
  { valor: "no_response", rotulo: "Não respondeu" },
  { valor: "opted_out", rotulo: "Pediu para não receber" },
  { valor: "other", rotulo: "Outro" },
];

export function PainelDeRemarketing({
  candidatos,
  templates,
  aguardandoDesfecho,
  podeContatar,
  segmento,
}: {
  candidatos: Candidato[];
  templates: Template[];
  aguardandoDesfecho: ContatoNoRelatorio[];
  /** `remarketing.contact`. Sem ela a tela é só leitura (RN-RBAC-004). */
  podeContatar: boolean;
  segmento: string;
}) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const [informando, setInformando] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoDoContato>("contacted");
  const [observacao, setObservacao] = useState("");

  const preparar = (cliente: Candidato) => {
    setErro(null);
    setOk(null);
    iniciar(async () => {
      const r = await prepararContato({
        cliente_id: cliente.cliente_id,
        ...(texto.trim() ? { mensagem: texto.trim() } : { template_id: templateId }),
        segmento,
      });
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      // Abrir o WhatsApp é um link comum. Não é envio, e a mensagem abaixo
      // diz isso com todas as letras.
      window.open(r.link, "_blank", "noopener,noreferrer");
      setOk(r.contato.aviso);
    });
  };

  const informar = (contatoId: string) => {
    setErro(null);
    setOk(null);
    iniciar(async () => {
      const r = await registrarResultado({
        contato_id: contatoId,
        resultado,
        ...(observacao.trim() ? { observacao: observacao.trim() } : {}),
      });
      if (r.ok) {
        setInformando(null);
        setObservacao("");
        setOk("Desfecho registrado.");
      } else {
        setErro(r.erro);
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <Aviso {...(erro ? { erro } : {})} {...(ok ? { ok } : {})} />

      {podeContatar ? (
        <Cartao
          titulo="Mensagem"
          descricao="Escolha um template ou escreva. Você pode editar antes de abrir a conversa."
          largura="cheio"
        >
          {templates.length === 0 ? (
            <EmptyState
              titulo="Nenhum template cadastrado"
              descricao="Escreva a mensagem abaixo, ou cadastre modelos para reaproveitar."
            />
          ) : (
            <SelectMenu
              label="Template"
              valor={templateId}
              aoMudar={setTemplateId}
              opcoes={templates.map((t) => ({ valor: t.id, texto: t.name }))}
            />
          )}

          <div className="mt-3">
            <Textarea
              label="Mensagem personalizada (opcional)"
              rows={3}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Deixe vazio para usar o template escolhido."
              hint="Variáveis do template: {{nome}}, {{dias_sem_comprar}}, {{ultima_compra}}."
            />
          </div>
        </Cartao>
      ) : null}

      <Cartao
        titulo="Quem vale a pena chamar"
        descricao="Só clientes que aceitam contato promocional. Bloqueados nunca aparecem."
        largura="cheio"
      >
        {candidatos.length === 0 ? (
          <EmptyState
            titulo="Ninguém neste filtro"
            descricao="Ajuste o tempo de ausência ou a cadência."
          />
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {candidatos.map((c) => (
              <li
                key={c.cliente_id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-12 border border-border-shalon bg-elev px-[14px] py-3"
              >
                <span className="flex flex-col gap-[2px]">
                  <span className="text-[14px] font-semibold text-ink">{c.nome}</span>
                  <span className="text-[12.5px] text-muted">
                    {c.pedidos} {c.pedidos === 1 ? "pedido" : "pedidos"} ·{" "}
                    {c.ticket_medio === null ? "—" : formatBRL(c.ticket_medio)} de ticket ·{" "}
                    {c.dias_sem_comprar === null
                      ? "sem compra registrada"
                      : `há ${c.dias_sem_comprar} dias sem comprar`}
                    {c.intervalo_tipico !== null && c.pedidos >= 3
                      ? ` · costuma comprar a cada ~${c.intervalo_tipico} dias`
                      : ""}
                  </span>
                  {c.ultimo_contato ? (
                    <span className="text-[12px] text-muted">
                      Último contato em {new Date(c.ultimo_contato).toLocaleDateString("pt-BR")}
                    </span>
                  ) : null}
                </span>
                {podeContatar ? (
                  /* `md` = 44px: é a ação principal da linha, e no telefone
                     ela precisa do alvo de toque cheio (CLAUDE.md §38). */
                  <Button tamanho="md" disabled={enviando} onClick={() => preparar(c)}>
                    Abrir conversa
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <Cartao
        titulo="Aguardando o desfecho"
        descricao="Conversa aberta não é conversa tida. Diga o que aconteceu."
        largura="cheio"
      >
        {aguardandoDesfecho.length === 0 ? (
          <EmptyState titulo="Nenhum contato pendente de desfecho" />
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {aguardandoDesfecho.map((c) => (
              <li
                key={c.contato_id}
                className="rounded-12 border border-border-shalon bg-elev px-[14px] py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="flex flex-col gap-[2px]">
                    <span className="text-[14px] font-semibold text-ink">{c.cliente}</span>
                    <span className="text-[12.5px] text-muted">
                      Preparado em {new Date(c.em).toLocaleString("pt-BR")}
                      {c.segmento ? ` · ${c.segmento}` : ""}
                    </span>
                    {c.comprou_depois ? (
                      <span className="text-[12px] text-muted">
                        Houve compra posterior a este contato.
                      </span>
                    ) : null}
                  </span>
                  {podeContatar ? (
                    <Button
                      variante="secundario"
                      tamanho="md"
                      onClick={() =>
                        setInformando(informando === c.contato_id ? null : c.contato_id)
                      }
                    >
                      {informando === c.contato_id ? "Cancelar" : "Informar desfecho"}
                    </Button>
                  ) : null}
                </div>

                {informando === c.contato_id ? (
                  <div className="mt-3 flex flex-col gap-3">
                    <SelectMenu
                      label="O que aconteceu"
                      valor={resultado}
                      aoMudar={(valor) => setResultado(valor as ResultadoDoContato)}
                      opcoes={RESULTADOS.map((r) => ({ valor: r.valor, texto: r.rotulo }))}
                    />
                    {resultado === "opted_out" ? (
                      <p className="m-0 text-[12.5px] text-muted">
                        Isto também retira o consentimento promocional do cliente.
                      </p>
                    ) : null}
                    <Textarea
                      label="Observação (opcional)"
                      rows={2}
                      value={observacao}
                      onChange={(e) => setObservacao(e.target.value)}
                    />
                    <Button
                      tamanho="md"
                      disabled={enviando}
                      onClick={() => informar(c.contato_id)}
                    >
                      Registrar desfecho
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Cartao>
    </div>
  );
}
