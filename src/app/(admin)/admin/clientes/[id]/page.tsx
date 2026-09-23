import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { obterFicha } from "@/application/clientes/consultas";
import { Cartao, EmptyState, ParDeDados } from "@/ui/patterns";
import { Badge, StatusBadge } from "@/ui/components";
import { rotuloInterno } from "@/domain/pedidos/estados";
import { formatBRL } from "@/lib/format";
import { Cadencia } from "../_ui/Cadencia";
import { PreferenciaPromocional } from "../_ui/PreferenciaPromocional";

export const metadata: Metadata = { title: "Cliente" };

const ORIGEM: Record<string, string> = {
  checkout: "o próprio cliente, no checkout",
  remarketing: "durante um contato de remarketing",
  admin: "registro da Shalon",
  import: "importação",
  other: "outro canal",
};

const RESULTADO: Record<string, string> = {
  contacted: "Falou com o cliente",
  no_response: "Sem resposta",
  interested: "Demonstrou interesse",
  opted_out: "Pediu para não receber",
  other: "Outro",
};

function data(valor: string | null): string {
  return valor ? new Date(valor).toLocaleDateString("pt-BR") : "—";
}

/**
 * Ficha do cliente.
 *
 * O QUE ELA AFIRMA e o que ela se recusa a afirmar estão no mesmo lugar: a
 * cadência vem com o número que a sustenta, e quando o histórico não dá para
 * classificar, a tela diz isso em vez de arredondar para o rótulo mais
 * próximo (RN-CRM-004).
 *
 * "Comprou depois do contato" é fato temporal. Não há, e não deve haver,
 * nenhuma frase aqui dizendo que o contato trouxe a compra (RN-RMKT-005).
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ficha = await obterFicha(id);
  if (!ficha) notFound();

  const p = ficha.padrao;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/admin/clientes" className="text-[13px] font-semibold text-muted">
            ← Clientes
          </Link>
          <h1 className="m-0 mt-1 font-display text-[24px] font-bold text-ink">{ficha.nome}</h1>
          <p className="m-0 mt-1 flex flex-wrap items-center gap-2 text-[13.5px] text-muted">
            {ficha.whatsapp ?? "sem WhatsApp"}
            <Cadencia valor={p.classificacao} />
            {ficha.bloqueado ? <Badge tom="promocao">Bloqueado</Badge> : null}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Cartao titulo="Padrão de compra" largura="cheio">
          <ParDeDados chave="Pedidos concluídos" valor={p.pedidos} />
          <ParDeDados chave="Total comprado" valor={formatBRL(p.faturamento)} />
          <ParDeDados
            chave="Ticket médio"
            valor={p.ticket_medio === null ? "—" : formatBRL(p.ticket_medio)}
          />
          <ParDeDados chave="Primeira compra" valor={data(p.primeira_compra)} />
          <ParDeDados chave="Última compra" valor={data(p.ultima_compra)} />
          <ParDeDados
            chave={p.pedidos === 2 ? "Intervalo observado" : "Intervalo típico"}
            valor={p.intervalo_tipico === null ? "—" : `${p.intervalo_tipico} dias`}
          />
          <ParDeDados
            chave="Sem comprar há"
            valor={p.dias_sem_comprar === null ? "—" : `${p.dias_sem_comprar} dias`}
          />

          {/* A recusa explicada, no lugar do veredicto que não cabe. */}
          {p.classificacao === "base_fraca" ? (
            <p className="mt-3 rounded-12 border border-border-shalon bg-elev px-[14px] py-[10px] text-[12.5px] text-ink-2">
              Duas compras mostram um intervalo, não um hábito. Os números acima são fatos; a
              Shalon decide o que fazer com eles — o sistema não chama este cliente de afastado.
            </p>
          ) : null}
          {p.classificacao === "dados_insuficientes" ? (
            <p className="mt-3 rounded-12 border border-border-shalon bg-elev px-[14px] py-[10px] text-[12.5px] text-ink-2">
              {p.pedidos === 0
                ? "Ainda não concluiu nenhum pedido."
                : "Uma compra só: ainda não há intervalo para comparar."}
            </p>
          ) : null}
        </Cartao>

        <Cartao titulo="Contato promocional" largura="cheio">
          <PreferenciaPromocional clienteId={ficha.cliente_id} aceita={ficha.aceita_promocao} />

          {ficha.consentimento_historico.length > 0 ? (
            <div className="mt-4">
              <p className="m-0 mb-2 text-[12.5px] font-semibold text-ink">Histórico</p>
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {ficha.consentimento_historico.map((h) => (
                  <li key={h.em} className="text-[12.5px] text-muted">
                    {new Date(h.em).toLocaleString("pt-BR")} —{" "}
                    {h.aceita ? "passou a aceitar" : "pediu para não receber"} ·{" "}
                    {ORIGEM[h.origem] ?? h.origem}
                    {h.observacao ? ` · ${h.observacao}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Cartao>
      </div>

      <Cartao titulo="Endereços" largura="cheio">
        {ficha.enderecos.length === 0 ? (
          <EmptyState titulo="Nenhum endereço cadastrado" />
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {ficha.enderecos.map((e) => (
              <li key={e.id} className="text-[13.5px] text-ink">
                {e.preferido ? <Badge tom="destaque">Preferido</Badge> : null}{" "}
                {e.logradouro}
                {e.numero ? `, ${e.numero}` : ""}
                {e.complemento ? ` — ${e.complemento}` : ""}
                {e.bairro ? ` · ${e.bairro}` : ""}
                {e.referencia ? (
                  <span className="block text-[12px] text-muted">Referência: {e.referencia}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Cartao>

      <Cartao titulo="Últimos pedidos" largura="cheio">
        {ficha.pedidos.length === 0 ? (
          <EmptyState titulo="Nenhum pedido registrado" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[13px]">
              <thead>
                <tr className="text-left text-muted">
                  <th className="border-b border-border-shalon py-2 font-semibold">Pedido</th>
                  <th className="border-b border-border-shalon py-2 font-semibold">Quando</th>
                  <th className="border-b border-border-shalon py-2 font-semibold">Situação</th>
                  <th className="border-b border-border-shalon py-2 font-semibold">Itens</th>
                  <th className="border-b border-border-shalon py-2 text-right font-semibold">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {ficha.pedidos.map((pedido) => (
                  <tr key={pedido.pedido_id}>
                    <td className="border-b border-border-shalon py-2">
                      <Link
                        href={`/admin/pedidos/${pedido.pedido_id}`}
                        className="font-semibold text-ink"
                      >
                        #{pedido.numero}
                      </Link>
                    </td>
                    <td className="border-b border-border-shalon py-2 text-muted">
                      {new Date(pedido.criado_em).toLocaleString("pt-BR")}
                    </td>
                    <td className="border-b border-border-shalon py-2">
                      {/* Rótulo do domínio, não o valor cru do banco: quem lê a
                          ficha é a Shalon, não o esquema. */}
                      <StatusBadge tom={rotuloInterno(pedido.status).tom}>
                        {rotuloInterno(pedido.status).rotulo}
                      </StatusBadge>
                    </td>
                    <td className="border-b border-border-shalon py-2 text-muted">
                      {pedido.itens ?? "—"}
                    </td>
                    <td className="border-b border-border-shalon py-2 text-right text-ink">
                      {formatBRL(pedido.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>

      {ficha.contatos_de_remarketing ? (
        <Cartao
          titulo="Contatos de remarketing"
          descricao="Compra posterior é um fato temporal. O sistema não afirma que o contato a causou."
          largura="cheio"
        >
          {ficha.contatos_de_remarketing.length === 0 ? (
            <EmptyState titulo="Nenhum contato registrado" />
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {ficha.contatos_de_remarketing.map((c) => (
                <li key={c.contato_id} className="text-[13px] text-ink">
                  {new Date(c.em).toLocaleString("pt-BR")}
                  {c.segmento ? ` · ${c.segmento}` : ""}
                  <span className="block text-[12px] text-muted">
                    {c.resultado
                      ? (RESULTADO[c.resultado] ?? c.resultado)
                      : "Preparado, sem desfecho informado"}
                    {c.comprou_depois ? " · houve compra posterior" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      ) : null}
    </div>
  );
}
