"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Input } from "@/ui/components/Input";
import { Select } from "@/ui/components/Select";
import { Textarea } from "@/ui/components/Textarea";
import { formatBRL } from "@/lib/format";
import { criarPedidoManual } from "@/application/pedidos/acoes";
import {
  ORIGENS_MANUAIS,
  type ItemDoRascunho,
  type Modalidade,
  type OrigemManual,
} from "@/application/pedidos/tipos";
import type { FormaDePagamento } from "@/application/checkout/tipos";
import { EscolherProduto } from "./EscolherProduto";

export type EtapaNovoPedido = "cliente" | "itens" | "pagamento";

const ETAPAS: readonly { valor: EtapaNovoPedido; nome: string; numero: number }[] = [
  { valor: "cliente", nome: "Cliente", numero: 1 },
  { valor: "itens", nome: "Itens", numero: 2 },
  { valor: "pagamento", nome: "Pagamento", numero: 3 },
];

/**
 * Novo pedido — lançamento manual pela equipe (RN-MAN-001 a 003).
 *
 * O QUE ESTA TELA NÃO FAZ: decidir dinheiro, disponibilidade ou estado.
 *
 * Cada item é montado pelo mesmo configurador do cardápio e precificado pelo
 * servidor; o pedido inteiro é recalculado de novo na criação. O subtotal
 * abaixo é a soma dos valores que o servidor já devolveu, mostrada para
 * conferência — e a taxa de entrega só aparece depois que o servidor a
 * calcular, porque distância não se estima (CLAUDE.md §20).
 *
 * `source` guarda o canal real, com os valores normativos. iFood aqui
 * significa apenas que o atendente está transcrevendo um pedido recebido
 * lá — não há integração, e nenhum status é sincronizado.
 */
/**
 * O que dizer depois de lançar — e RN-MAN-004 mudou essa frase.
 *
 * O lançamento interno JÁ É o aceite: não existe mais um segundo clique de
 * "aceitar" para um pedido que o próprio atendente acabou de registrar. Mas
 * RN-MAN-005 preserva os bloqueios, e nesses casos a tela precisa dizer a
 * verdade — o pedido ficou parado, e o motivo tem nome.
 */
function explicarLancamento(status: string): string {
  if (status === "waiting_pix_confirmation") {
    return "O pedido ficou aguardando a confirmação do Pix. Ele não vai para a produção, e a comanda não sai, até alguém confirmar o recebimento.";
  }
  if (status === "waiting_delivery_approval") {
    return "O endereço está acima do raio de entrega automática, então o pedido ficou aguardando a aprovação da entrega antes de seguir.";
  }
  if (status === "confirmed") {
    return "Lançar já foi aceitar: o pedido entrou aceito, com seu nome e o horário no histórico, e a comanda pode sair agora.";
  }
  return "O pedido entrou na fila.";
}

export function NovoPedido({
  formasPorModalidade,
  emModal = false,
  etapaAtual,
  aoMudarEtapa,
}: {
  formasPorModalidade: Record<Modalidade, FormaDePagamento[]>;
  emModal?: boolean;
  etapaAtual?: EtapaNovoPedido;
  aoMudarEtapa?: (etapa: EtapaNovoPedido) => void;
}) {
  const router = useRouter();
  const [etapaInterna, setEtapaInterna] = useState<EtapaNovoPedido>("cliente");
  const etapa = etapaAtual ?? etapaInterna;
  const mudarEtapa = aoMudarEtapa ?? setEtapaInterna;

  const [origem, setOrigem] = useState<OrigemManual>("whatsapp");
  const [modalidade, setModalidade] = useState<Modalidade>("delivery");
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");

  const [logradouro, setLogradouro] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [cep, setCep] = useState("");
  const [referencia, setReferencia] = useState("");

  const [itens, setItens] = useState<ItemDoRascunho[]>([]);
  const [observacao, setObservacao] = useState("");

  const [formaId, setFormaId] = useState("");
  const [bandeiraId, setBandeiraId] = useState("");
  const [precisaTroco, setPrecisaTroco] = useState(false);
  const [trocoPara, setTrocoPara] = useState("");

  const [erro, setErro] = useState<string | null>(null);
  const [criado, setCriado] = useState<
    { numero: number; token: string | null; status: string } | null
  >(null);
  const [enviando, iniciar] = useTransition();

  /**
   * Chave da tentativa: nasce no primeiro envio e sobrevive a cliques
   * repetidos e a retry de rede. O servidor reconhece a mesma tentativa e
   * devolve o pedido que já criou, em vez de criar outro (CLAUDE.md §34).
   */
  const chaveDaTentativa = useRef<string | null>(null);

  const formas = formasPorModalidade[modalidade];
  const forma = formas.find((f) => f.id === formaId) ?? null;

  // Soma dos valores que o servidor calculou item a item. Conferência, não
  // autoridade: a criação recalcula tudo.
  const subtotal = itens.reduce((s, i) => s + i.total, 0);

  const enderecoCompleto =
    logradouro.trim().length > 1 &&
    numero.trim().length > 0 &&
    bairro.trim().length > 1 &&
    cidade.trim().length > 1 &&
    /^[A-Za-z]{2}$/.test(uf);

  const clienteCompleto =
    nome.trim().length >= 2 &&
    whatsapp.replace(/\D/g, "").length >= 10 &&
    (modalidade === "pickup" || enderecoCompleto);

  const podeLancar =
    !enviando &&
    itens.length > 0 &&
    clienteCompleto &&
    forma !== null &&
    (!forma.exige_bandeira || bandeiraId !== "") &&
    (!precisaTroco || trocoPara.trim() !== "");

  function lancar() {
    if (!podeLancar || forma === null) return;
    setErro(null);
    chaveDaTentativa.current ??= crypto.randomUUID();

    iniciar(async () => {
      const r = await criarPedidoManual({
        idempotency_key: chaveDaTentativa.current,
        origem,
        modalidade,
        cliente: { nome: nome.trim(), whatsapp: whatsapp.trim() },
        endereco:
          modalidade === "delivery"
            ? {
                logradouro: logradouro.trim(),
                numero: numero.trim(),
                complemento: complemento.trim() || null,
                bairro: bairro.trim(),
                cidade: cidade.trim(),
                uf: uf.trim().toUpperCase(),
                cep: cep.trim() || null,
                referencia: referencia.trim() || null,
              }
            : null,
        itens: itens.map((i) => ({
          linha: i.linha,
          produto_id: i.produtoId,
          variacao_id: i.variacaoId,
          sabores: i.sabores,
          borda_id: i.bordaId,
          adicionais: i.adicionais,
          observacao: i.observacao,
          quantidade: i.quantidade,
        })),
        pagamento: {
          forma_id: forma.id,
          bandeira_id: forma.exige_bandeira ? bandeiraId : null,
          precisa_troco: precisaTroco,
          troco_para: precisaTroco ? Number(trocoPara.replace(",", ".")) : null,
        },
        observacao_geral: observacao.trim() || null,
      });

      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setCriado({ numero: r.numero, token: r.token, status: r.status });
      router.refresh();
    });
  }

  if (criado !== null) {
    return (
      <div className="rounded-16 border border-tsb bg-ts p-4">
        <p className="m-0 font-display text-[20px] font-bold text-tsf">
          Pedido #{criado.numero} lançado
        </p>
        <p className="m-0 mt-1 text-[14px] text-ink-2">{explicarLancamento(criado.status)}</p>
        {criado.token !== null ? (
          <p className="m-0 mt-2 break-all text-[13px] text-ink-2">
            Link de acompanhamento para mandar ao cliente:{" "}
            <code className="rounded-8 bg-surface px-2 py-1">/pedido/{criado.token}</code>
          </p>
        ) : null}
        <Link
          href="/admin/pedidos"
          className="mt-3 inline-flex min-h-touch-cta items-center rounded-12 bg-cta px-5 text-[15px] font-semibold text-cta-fg no-underline"
        >
          Voltar para a fila
        </Link>
      </div>
    );
  }

  const indiceDaEtapa = ETAPAS.findIndex((item) => item.valor === etapa);
  const classeDaEtapa = (alvo: EtapaNovoPedido) =>
    emModal && etapa !== alvo ? "hidden" : emModal ? "motion-tab-in" : "";

  return (
    <div
      className={
        emModal
          ? "flex flex-col gap-4"
          : "grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(340px,1fr))]"
      }
    >
      {emModal ? (
        <div
          className="flex items-start px-2 py-1"
          aria-label="Etapas do novo pedido"
        >
          {ETAPAS.map((item, indice) => {
            const ativa = etapa === item.valor;
            const concluida =
              item.valor === "cliente"
                ? clienteCompleto
                : item.valor === "itens"
                  ? itens.length > 0
                  : podeLancar;
            const liberada =
              item.valor === "cliente" ||
              (item.valor === "itens" && clienteCompleto) ||
              (item.valor === "pagamento" && clienteCompleto && itens.length > 0);
            const etapaAnteriorConcluida =
              indice === 1 ? clienteCompleto : indice === 2 ? itens.length > 0 : false;

            return (
              <div key={item.valor} className="contents">
                {indice > 0 ? (
                  <span
                    aria-hidden="true"
                    className={[
                      "mt-[17px] h-px min-w-3 flex-1",
                      etapaAnteriorConcluida ? "bg-brand-orange/55" : "bg-border-shalon",
                    ].join(" ")}
                  />
                ) : null}
                <button
                  type="button"
                  onClick={() => mudarEtapa(item.valor)}
                  disabled={!liberada}
                  aria-current={ativa ? "step" : undefined}
                  className={[
                    "motion-interactive group flex min-w-[76px] cursor-pointer flex-col items-center border-0 bg-transparent px-1 text-center transition-colors disabled:cursor-not-allowed",
                    ativa ? "text-ink" : concluida ? "text-tsf" : "text-muted",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "motion-interactive flex h-[34px] w-[34px] items-center justify-center rounded-pill border-2 text-[11px] font-extrabold transition-colors",
                      ativa
                        ? "border-cta bg-cta text-cta-fg shadow-[0_4px_12px_rgb(30_24_20/0.12)]"
                        : concluida
                          ? "border-tsb bg-ts text-tsf"
                          : "border-border-shalon bg-surface text-muted group-enabled:group-hover:border-brand-orange",
                    ].join(" ")}
                  >
                    {concluida && !ativa ? "✓" : item.numero}
                  </span>
                  <span className="mt-1.5 text-[11.5px] font-bold leading-tight">{item.nome}</span>
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-col gap-4">
        <fieldset className={`m-0 flex flex-col gap-3 rounded-16 border border-border-shalon bg-surface p-4 ${classeDaEtapa("cliente")}`}>
          <legend className="px-1 text-[15px] font-bold text-ink">Canal e modalidade</legend>

          <Select
            label="De onde veio este pedido"
            value={origem}
            onChange={(e) => setOrigem(e.target.value as OrigemManual)}
            hint="Fica registrado no pedido e serve para comparar canais depois."
          >
            {ORIGENS_MANUAIS.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </Select>

          {origem === "ifood" ? (
            <p className="m-0 rounded-10 bg-tw px-3 py-2 text-[12.5px] font-semibold text-twf">
              Transcrição manual. Não há integração com o iFood, e nenhum status é
              sincronizado com eles.
            </p>
          ) : null}

          <div className="flex gap-2">
            {(["delivery", "pickup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setModalidade(m);
                  setFormaId("");
                  setBandeiraId("");
                }}
                aria-pressed={modalidade === m}
                className={[
                  "motion-interactive min-h-touch-cta flex-1 cursor-pointer rounded-12 border-[1.5px] px-3 text-[15px] font-semibold transition-colors",
                  modalidade === m
                    ? "border-brand-red bg-cta text-cta-fg"
                    : "border-border-shalon bg-surface text-ink",
                ].join(" ")}
              >
                {m === "delivery" ? "Entrega" : "Retirada"}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className={`m-0 flex flex-col gap-3 rounded-16 border border-border-shalon bg-surface p-4 ${classeDaEtapa("cliente")}`}>
          <legend className="px-1 text-[15px] font-bold text-ink">Cliente</legend>
          <Input label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} />
          <Input
            label="WhatsApp"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            inputMode="tel"
            maxLength={24}
            placeholder="(00) 00000-0000"
            hint="Identificador operacional do cliente. Cliente já cadastrado é reconhecido por ele."
          />
        </fieldset>

        {modalidade === "delivery" ? (
          <fieldset className={`m-0 flex flex-col gap-3 rounded-16 border border-border-shalon bg-surface p-4 ${classeDaEtapa("cliente")}`}>
            <legend className="px-1 text-[15px] font-bold text-ink">Endereço de entrega</legend>
            <div className="flex gap-3">
              <div className="flex-[3]">
                <Input label="Rua" value={logradouro} onChange={(e) => setLogradouro(e.target.value)} maxLength={160} />
              </div>
              <div className="flex-1">
                <Input label="Número" value={numero} onChange={(e) => setNumero(e.target.value)} maxLength={20} />
              </div>
            </div>
            <Input label="Bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} maxLength={80} />
            <div className="flex gap-3">
              <div className="flex-[3]">
                <Input label="Cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} maxLength={80} />
              </div>
              <div className="w-[88px]">
                <Input
                  label="UF"
                  value={uf}
                  onChange={(e) => setUf(e.target.value.toUpperCase().slice(0, 2))}
                  maxLength={2}
                />
              </div>
            </div>
            <Input label="CEP" value={cep} onChange={(e) => setCep(e.target.value)} inputMode="numeric" maxLength={12} />
            <Input
              label="Complemento"
              value={complemento}
              onChange={(e) => setComplemento(e.target.value)}
              maxLength={80}
              hint="Não entra no cálculo da distância."
            />
            <Input
              label="Ponto de referência"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value)}
              maxLength={160}
              hint="Não entra no cálculo da distância."
            />
            <p className="m-0 text-[12.5px] text-muted">
              A taxa é calculada pelo servidor na hora de lançar, com a distância real de
              rota. Se o cálculo não estiver disponível, o pedido não é lançado com taxa
              inventada — e a retirada continua funcionando.
            </p>
          </fieldset>
        ) : null}

        <fieldset className={`m-0 flex flex-col gap-3 rounded-16 border border-border-shalon bg-surface p-4 ${classeDaEtapa("pagamento")}`}>
          <legend className="px-1 text-[15px] font-bold text-ink">Pagamento esperado</legend>
          {formas.length === 0 ? (
            <p className="m-0 text-[14px] text-ink-2">
              Nenhuma forma de pagamento disponível para esta modalidade.
            </p>
          ) : (
            <>
              <Select
                label="Forma"
                value={formaId}
                onChange={(e) => {
                  setFormaId(e.target.value);
                  setBandeiraId("");
                  setPrecisaTroco(false);
                }}
              >
                <option value="">Escolha…</option>
                {formas.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </Select>

              {forma?.exige_bandeira ? (
                <Select label="Bandeira" value={bandeiraId} onChange={(e) => setBandeiraId(e.target.value)}>
                  <option value="">Escolha…</option>
                  {forma.bandeiras.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nome}
                    </option>
                  ))}
                </Select>
              ) : null}

              {forma?.permite_troco ? (
                <div>
                  <label className="flex min-h-touch cursor-pointer items-center gap-2 text-[14.5px] text-ink">
                    <input
                      type="checkbox"
                      checked={precisaTroco}
                      onChange={(e) => setPrecisaTroco(e.target.checked)}
                      className="size-[18px]"
                    />
                    Precisa de troco
                  </label>
                  {precisaTroco ? (
                    <Input
                      label="Troco para quanto?"
                      value={trocoPara}
                      onChange={(e) => setTrocoPara(e.target.value)}
                      inputMode="decimal"
                    />
                  ) : null}
                </div>
              ) : null}

              <p className="m-0 text-[12px] text-muted">
                Isto é o pagamento ESPERADO. O recebido de fato é registrado no caixa.
              </p>
            </>
          )}
        </fieldset>

        <fieldset className={`m-0 rounded-16 border border-border-shalon bg-surface p-4 ${classeDaEtapa("pagamento")}`}>
          <legend className="px-1 text-[15px] font-bold text-ink">Observação</legend>
          <Textarea
            label="Observação do pedido"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            maxLength={500}
            rows={2}
          />
        </fieldset>
      </div>

      <div className="flex flex-col gap-4">
        <section className={`rounded-16 border border-border-shalon bg-surface p-4 ${classeDaEtapa("itens")}`}>
          <h2 className="m-0 mb-3 text-[15px] font-bold text-ink">Itens</h2>

          {itens.length === 0 ? (
            <p className="m-0 mb-3 text-[13.5px] text-ink-2">
              Nenhum item ainda. Procure o produto abaixo e configure como o cliente pediu.
            </p>
          ) : (
            <ul className="m-0 mb-3 list-none p-0">
              {itens.map((i) => (
                <li
                  key={i.linha}
                  className="border-b border-border-shalon py-2 last:border-0"
                >
                  <div className="flex justify-between gap-3">
                    <span className="text-[14.5px] font-semibold text-ink">
                      {i.quantidade}× {i.nome}
                    </span>
                    <span className="whitespace-nowrap tabular-nums text-[14.5px] text-ink">
                      {formatBRL(i.total)}
                    </span>
                  </div>
                  {i.rotulos.map((r) => (
                    <p key={r} className="m-0 text-[12.5px] text-ink-2">
                      {r}
                    </p>
                  ))}
                  {i.observacao ? (
                    <p className="m-0 text-[12.5px] italic text-twf">“{i.observacao}”</p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setItens((lista) => lista.filter((x) => x.linha !== i.linha))}
                    className="mt-1 min-h-touch cursor-pointer border-0 bg-transparent p-0 text-[12.5px] font-semibold text-danger"
                  >
                    Remover
                  </button>
                </li>
              ))}
            </ul>
          )}

          <EscolherProduto aoAdicionar={(item) => setItens((lista) => [...lista, item])} />
        </section>

        <section className={`rounded-16 border border-border-shalon bg-surface p-4 ${classeDaEtapa("pagamento")}`}>
          <div className="flex justify-between text-[14.5px] text-ink-2">
            <span>Subtotal dos itens</span>
            <span className="tabular-nums">{formatBRL(subtotal)}</span>
          </div>
          <div className="flex justify-between text-[14.5px] text-ink-2">
            <span>Taxa de entrega</span>
            <span className="text-[13px]">
              {modalidade === "pickup" ? "retirada" : "calculada ao lançar"}
            </span>
          </div>

          {erro !== null ? (
            <p
              role="alert"
              className="m-0 mt-3 rounded-10 bg-td px-3 py-2 text-[13px] font-semibold text-tdf"
            >
              {erro}
            </p>
          ) : null}

          <button
            type="button"
            disabled={!podeLancar}
            onClick={lancar}
            className="motion-interactive mt-3 flex min-h-[52px] w-full cursor-pointer items-center justify-center rounded-13 border-0 bg-cta text-[16px] font-semibold text-cta-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-tn disabled:text-muted disabled:opacity-100"
          >
            {enviando ? "Lançando…" : "Lançar pedido"}
          </button>

          <p className="m-0 mt-2 text-[12px] text-muted">
            O pedido entra na fila e ainda precisa ser aceito. Todos os valores são
            recalculados no servidor no momento do lançamento.
          </p>
        </section>
      </div>

      {emModal ? (
        <div className="flex items-center justify-between gap-3 border-t border-border-shalon pt-4">
          {indiceDaEtapa > 0 ? (
            <button
              type="button"
              onClick={() => mudarEtapa(ETAPAS[indiceDaEtapa - 1]!.valor)}
              className="motion-interactive inline-flex min-h-touch cursor-pointer items-center rounded-11 border border-border-shalon bg-surface px-4 text-[13.5px] font-semibold text-ink transition-colors hover:border-brand-orange"
            >
              ← Voltar
            </button>
          ) : (
            <span />
          )}
          {indiceDaEtapa < ETAPAS.length - 1 ? (
            <button
              type="button"
              onClick={() => mudarEtapa(ETAPAS[indiceDaEtapa + 1]!.valor)}
              disabled={etapa === "cliente" ? !clienteCompleto : itens.length === 0}
              className="motion-interactive inline-flex min-h-touch cursor-pointer items-center rounded-11 border-0 bg-cta px-4 text-[13.5px] font-bold text-cta-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-tn disabled:text-muted disabled:opacity-100"
            >
              Continuar →
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
