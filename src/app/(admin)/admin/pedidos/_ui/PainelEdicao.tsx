"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { formatBRL } from "@/lib/format";
import { cotarEntrega } from "@/application/checkout/acoes";
import { buscarEnderecoPorCep } from "@/application/checkout/cep";
import type { CotacaoEntrega } from "@/application/checkout/tipos";
import { contextoDaEdicao, editarPedido, type ResultadoEdicao } from "@/application/pedidos/acoes";
import type { ItemDoRascunho, PedidoAdministrativo } from "@/application/pedidos/tipos";
import { EscolherProduto } from "./EscolherProduto";

/**
 * Editar pedido (D-2026-11-01-182, RN-ALT-009).
 *
 * Um lugar só para mudar itens, retirada/entrega, endereço, dados do cliente e
 * forma esperada. Vale na hora, e a justificativa é obrigatória: é ela que dá o
 * controle de quem mudou o quê e por quê.
 *
 * Nenhum valor daqui é autoridade. O total mostrado é uma prévia: o banco mede,
 * precifica e confere tudo de novo em `editar_pedido`. O item que fica mantém o
 * preço do pedido; só o novo paga o preço atual.
 */
const CANAIS = [
  { valor: "whatsapp", rotulo: "WhatsApp" },
  { valor: "phone", rotulo: "Telefone" },
  { valor: "counter", rotulo: "No balcão" },
] as const;

type Canal = (typeof CANAIS)[number]["valor"];
type Contexto = Awaited<ReturnType<typeof contextoDaEdicao>>;
type Devolucao = Extract<ResultadoEdicao, { ok: false }>["devolucao"];

const CLASSE_CAMPO =
  "min-h-touch w-full rounded-11 border-[1.5px] border-border-shalon bg-surface px-3 text-[14px] text-ink focus:border-brand-orange focus:outline-none";
const CLASSE_ROTULO = "mb-1 block text-[13px] font-semibold text-ink";
const CLASSE_SECUNDARIO =
  "min-h-touch cursor-pointer rounded-11 border-[1.5px] border-border-shalon bg-surface px-4 text-[14px] font-semibold text-ink";

function Opcao({
  nome,
  marcada,
  aoEscolher,
  children,
}: {
  nome: string;
  marcada: boolean;
  aoEscolher: () => void;
  children: React.ReactNode;
}) {
  return (
    <label
      className={[
        "inline-flex min-h-touch cursor-pointer items-center rounded-11 border-[1.5px] bg-surface px-3.5 text-[13.5px] font-semibold",
        marcada ? "border-brand-red text-ink" : "border-border-shalon text-ink-2",
      ].join(" ")}
    >
      <input type="radio" name={nome} checked={marcada} onChange={aoEscolher} className="sr-only" />
      {children}
    </label>
  );
}

export function PainelEdicao({
  pedido,
  abertoDeInicio = false,
}: {
  pedido: PedidoAdministrativo;
  abertoDeInicio?: boolean;
}) {
  const [aberto, setAberto] = useState(abertoDeInicio);
  const [aviso, setAviso] = useState<string | null>(null);

  if (!aberto) {
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => {
            setAberto(true);
            setAviso(null);
          }}
          className="min-h-touch self-start cursor-pointer rounded-11 border-[1.5px] border-border-shalon bg-surface px-4 text-[14px] font-semibold text-ink hover:border-brand-orange"
        >
          Editar pedido
        </button>
        {aviso ? <p role="status" className="m-0 text-[13px] font-semibold text-tgf">{aviso}</p> : null}
      </div>
    );
  }

  return (
    <Editor
      pedido={pedido}
      aoFechar={(mensagem) => {
        setAberto(false);
        setAviso(mensagem);
      }}
    />
  );
}

function Editor({
  pedido,
  aoFechar,
}: {
  pedido: PedidoAdministrativo;
  aoFechar: (mensagem: string | null) => void;
}) {
  const e = pedido.endereco;
  const [contexto, setContexto] = useState<Contexto | null>(null);
  const [quantidades, setQuantidades] = useState<Record<number, number>>(() =>
    Object.fromEntries(pedido.itens.map((i) => [i.linha, i.quantidade])),
  );
  const [novos, setNovos] = useState<ItemDoRascunho[]>([]);
  const [modalidade, setModalidade] = useState(pedido.modalidade);
  const [cep, setCep] = useState(e?.["cep"] ?? "");
  const [logradouro, setLogradouro] = useState(e?.["logradouro"] ?? "");
  const [numero, setNumero] = useState(e?.["numero"] ?? "");
  const [complemento, setComplemento] = useState(e?.["complemento"] ?? "");
  const [bairro, setBairro] = useState(e?.["bairro"] ?? "");
  const [cidade, setCidade] = useState(e?.["cidade"] ?? "");
  const [uf, setUf] = useState(e?.["uf"] ?? "");
  const [referencia, setReferencia] = useState(e?.["referencia"] ?? "");
  const [trocarTaxa, setTrocarTaxa] = useState(false);
  const [taxaDigitada, setTaxaDigitada] = useState("");
  const [motivoTaxa, setMotivoTaxa] = useState("");
  const [nome, setNome] = useState(pedido.cliente.nome);
  const [whatsapp, setWhatsapp] = useState(pedido.cliente.whatsapp);
  const [observacao, setObservacao] = useState(pedido.observacao ?? "");
  const [formaId, setFormaId] = useState(pedido.pagamento?.forma_id ?? "");
  const [bandeiraId, setBandeiraId] = useState(pedido.pagamento?.bandeira_id ?? "");
  const [trocoPara, setTrocoPara] = useState(
    pedido.pagamento?.troco_para != null ? String(pedido.pagamento.troco_para) : "",
  );
  const [tipo, setTipo] = useState<"customer" | "mistake" | null>(null);
  const [canal, setCanal] = useState<Canal>(
    pedido.origem === "phone" ? "phone" : pedido.origem === "counter" ? "counter" : "whatsapp",
  );
  const [motivo, setMotivo] = useState("");
  const [devolucao, setDevolucao] = useState<Devolucao>(undefined);
  const [devolverDe, setDevolverDe] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  useEffect(() => {
    let vivo = true;
    void contextoDaEdicao().then((c) => {
      if (!vivo) return;
      setContexto(c);
      setCidade((v) => v || c.cidade);
      setUf((v) => v || c.uf);
    });
    return () => {
      vivo = false;
    };
  }, []);

  const entrega = modalidade === "delivery";
  const enderecoMudou =
    entrega &&
    (pedido.modalidade !== "delivery" ||
      logradouro !== (e?.["logradouro"] ?? "") ||
      numero !== (e?.["numero"] ?? "") ||
      complemento !== (e?.["complemento"] ?? "") ||
      bairro !== (e?.["bairro"] ?? "") ||
      cidade !== (e?.["cidade"] ?? "") ||
      uf !== (e?.["uf"] ?? "") ||
      cep !== (e?.["cep"] ?? "") ||
      referencia !== (e?.["referencia"] ?? ""));
  const remedir = enderecoMudou || (entrega && trocarTaxa);

  // Prévia da taxa: como no balcão, o servidor mede de novo ao salvar.
  const paraCotar =
    remedir &&
    logradouro.trim().length > 1 &&
    numero.trim().length > 0 &&
    bairro.trim().length > 1 &&
    cidade.trim().length > 1 &&
    /^[A-Za-z]{2}$/.test(uf)
      ? JSON.stringify({
          logradouro: logradouro.trim(),
          numero: numero.trim(),
          bairro: bairro.trim(),
          cidade: cidade.trim(),
          uf: uf.trim().toUpperCase(),
          cep: cep.trim() || null,
        })
      : null;
  const [resultadoCotacao, setResultadoCotacao] = useState<{ chave: string; r: CotacaoEntrega } | null>(null);
  const cotacao = paraCotar !== null && resultadoCotacao?.chave === paraCotar ? resultadoCotacao.r : null;
  const maisRecente = useRef<string | null>(null);
  useEffect(() => {
    maisRecente.current = paraCotar;
  });
  useEffect(() => {
    if (paraCotar === null) return;
    const chave = paraCotar;
    const espera = setTimeout(async () => {
      const r = await cotarEntrega(JSON.parse(chave));
      if (chave === maisRecente.current) setResultadoCotacao({ chave, r });
    }, 700);
    return () => clearTimeout(espera);
  }, [paraCotar]);

  const rotaFalhou = cotacao !== null && !cotacao.ok && cotacao.motivo !== "fora_de_area";
  const foraDeArea = cotacao !== null && !cotacao.ok && cotacao.motivo === "fora_de_area";
  const podeTaxaMao = contexto?.podeInformarTaxa ?? false;
  const taxaNumero = taxaDigitada.trim() === "" ? null : Number(taxaDigitada.replace(",", "."));
  const taxaValida = taxaNumero !== null && Number.isFinite(taxaNumero) && taxaNumero >= 0 && taxaNumero <= 500;
  const usaTaxaMao = entrega && (trocarTaxa || rotaFalhou) && taxaValida;

  const taxaPrevia = !entrega
    ? 0
    : usaTaxaMao
      ? (taxaNumero as number)
      : remedir
        ? cotacao?.ok
          ? cotacao.taxa
          : null
        : pedido.taxa_entrega;

  const restantes = pedido.itens.filter((i) => (quantidades[i.linha] ?? 0) > 0);
  const subtotalPrevio =
    restantes.reduce((s, i) => s + i.preco_unitario * (quantidades[i.linha] ?? 0), 0) +
    novos.reduce((s, i) => s + i.total, 0);
  const desconto = Number(pedido.desconto?.valor ?? 0);
  const totalPrevio =
    taxaPrevia === null ? null : subtotalPrevio + taxaPrevia - Math.min(desconto, subtotalPrevio + taxaPrevia);

  const formaAtual = contexto?.formas.find((f) => f.id === formaId);
  const formaEditavel =
    pedido.status_pagamento !== "confirmed" && !pedido.pagamento?.pix_status && pedido.pagamento !== null;
  const formaMudou = formaId !== (pedido.pagamento?.forma_id ?? "") || bandeiraId !== (pedido.pagamento?.bandeira_id ?? "");
  const trocoAtual = pedido.pagamento?.troco_para != null ? String(pedido.pagamento.troco_para) : "";
  const trocoNumero = trocoPara.trim() === "" ? null : Number(trocoPara.replace(",", "."));
  const pagamentoMudou = formaEditavel && (formaMudou || trocoPara !== trocoAtual);

  const semItens = restantes.length + novos.length === 0;
  const motivoOk = motivo.trim().length >= 3 && tipo !== null;
  const entregaOk =
    !entrega ||
    !remedir ||
    usaTaxaMao ||
    (cotacao?.ok === true && !(trocarTaxa && !taxaValida));
  // Troca de taxa só depois de medir: sem isso a rota se perderia na gravação.
  const motivoTaxaOk =
    !(entrega && trocarTaxa && !rotaFalhou) || (cotacao?.ok === true && motivoTaxa.trim().length >= 3);

  async function preencherPeloCep(valor: string) {
    const digitos = valor.replace(/\D/g, "");
    if (digitos.length !== 8) return;
    const r = await buscarEnderecoPorCep(digitos);
    if (!r.ok) return;
    if (r.logradouro) setLogradouro(r.logradouro);
    if (r.bairro) setBairro(r.bairro);
    setCidade(r.cidade);
    setUf(r.uf);
  }

  function salvar(pagamentoParaDevolver: string | null) {
    if (tipo === null) return;
    setErro(null);
    iniciar(async () => {
      const r = await editarPedido({
        pedido_id: pedido.id,
        versao: pedido.versao,
        motivo_tipo: tipo,
        canal: tipo === "customer" ? canal : null,
        motivo: motivo.trim(),
        itens: [
          ...restantes.map((i) => ({ linha: i.linha, quantidade: quantidades[i.linha] ?? i.quantidade })),
          ...novos.map((i) => ({
            produto_id: i.produtoId,
            variacao_id: i.variacaoId,
            sabores: i.sabores,
            borda_id: i.bordaId,
            adicionais: i.adicionais,
            observacao: i.observacao,
            quantidade: i.quantidade,
          })),
        ],
        modalidade,
        endereco: remedir
          ? { logradouro, numero, complemento, bairro, cidade, uf, cep, referencia }
          : null,
        taxa_manual: usaTaxaMao ? taxaNumero : null,
        // Com a rota medida, é troca de taxa e pede motivo; sem rota, é taxa à mão.
        motivo_taxa_manual: usaTaxaMao && cotacao?.ok ? motivoTaxa.trim() : null,
        nome: nome.trim(),
        whatsapp: whatsapp.replace(/\D/g, ""),
        observacao,
        pagamento: pagamentoMudou
          ? { forma_id: formaId, bandeira_id: bandeiraId || null, troco_para: formaAtual?.familia === "cash" ? trocoNumero : null }
          : null,
        devolver_de: pagamentoParaDevolver,
      });
      if (!r.ok) {
        if (r.devolucao) {
          setDevolucao(r.devolucao);
          setDevolverDe(r.devolucao.pagamentos[0]?.id ?? null);
          return;
        }
        setErro(r.erro);
        return;
      }
      const partes = [`Pedido editado. Total ${formatBRL(r.total)}.`];
      if (r.a_receber > 0) partes.push(`Falta receber ${formatBRL(r.a_receber)}.`);
      if (r.devolvido > 0) partes.push(`Devolvido ao cliente: ${formatBRL(r.devolvido)}.`);
      if (r.afeta_comanda && pedido.impressoes.length > 0) partes.push("Emita o documento de ALTERAÇÃO para a cozinha.");
      aoFechar(partes.join(" "));
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-12 border border-border-shalon bg-elev p-3">
      <p className="m-0 text-[15px] font-bold text-ink">Editar pedido</p>

      <section>
        <h4 className="m-0 mb-1 text-[13.5px] font-bold text-ink">Itens</h4>
        <ul className="m-0 list-none p-0">
          {pedido.itens.map((item) => {
            const qtd = quantidades[item.linha] ?? item.quantidade;
            const nomeItem = item.sabores?.map((s) => s.nome).join(" / ") ?? item.nome;
            return (
              <li key={item.linha} className="flex flex-wrap items-center justify-between gap-2 border-b border-border-shalon py-2 last:border-0">
                <span className={qtd === 0 ? "min-w-0 text-[14px] text-muted line-through" : "min-w-0 text-[14px] text-ink"}>
                  {nomeItem}
                  {item.tamanho !== null ? ` · ${item.tamanho}` : ""}
                  <span className="block text-[12px] text-ink-2 tabular-nums">{formatBRL(item.preco_unitario)} cada</span>
                </span>
                <span className="flex items-center overflow-hidden rounded-11 border-[1.5px] border-border-shalon bg-surface">
                  <button
                    type="button"
                    aria-label={`Diminuir ${nomeItem}`}
                    onClick={() => setQuantidades((q) => ({ ...q, [item.linha]: Math.max(0, qtd - 1) }))}
                    className="min-h-touch min-w-touch cursor-pointer border-0 bg-transparent text-[18px] text-ink"
                  >
                    −
                  </button>
                  <span className="min-w-[26px] text-center font-semibold tabular-nums text-ink">{qtd}</span>
                  <button
                    type="button"
                    aria-label={`Aumentar ${nomeItem}`}
                    onClick={() => setQuantidades((q) => ({ ...q, [item.linha]: Math.min(99, qtd + 1) }))}
                    className="min-h-touch min-w-touch cursor-pointer border-0 bg-transparent text-[18px] text-ink"
                  >
                    +
                  </button>
                </span>
              </li>
            );
          })}
        </ul>

        {novos.length > 0 ? (
          <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
            {novos.map((i) => (
              <li key={i.linha} className="flex flex-wrap items-center justify-between gap-2 rounded-10 bg-tg px-3 py-1">
                <span className="min-w-0 text-[14px] text-tgf">
                  + {i.quantidade}× {i.nome} · {formatBRL(i.total)}
                  {i.rotulos.length > 0 ? <span className="block text-[12px] text-ink-2">{i.rotulos.join(" · ")}</span> : null}
                </span>
                <button
                  type="button"
                  onClick={() => setNovos((lista) => lista.filter((x) => x.linha !== i.linha))}
                  className="min-h-touch cursor-pointer border-0 bg-transparent text-[12.5px] font-semibold text-danger"
                >
                  Remover
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-3">
          <EscolherProduto aoAdicionar={(item) => setNovos((lista) => [...lista, item])} rotuloAcao="Acrescentar ao pedido" />
        </div>
        {semItens ? (
          <p className="m-0 mt-2 text-[12.5px] text-twf">
            Um pedido não pode ficar sem itens. Para não atender, use rejeitar ou cancelar.
          </p>
        ) : null}
      </section>

      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-1.5 text-[13.5px] font-bold text-ink">Como o cliente recebe</legend>
        <div className="flex flex-wrap gap-2">
          <Opcao nome={`modalidade-${pedido.id}`} marcada={modalidade === "pickup"} aoEscolher={() => setModalidade("pickup")}>
            Retirada no balcão
          </Opcao>
          <Opcao nome={`modalidade-${pedido.id}`} marcada={modalidade === "delivery"} aoEscolher={() => setModalidade("delivery")}>
            Entrega
          </Opcao>
        </div>

        {entrega ? (
          <div className="mt-3 grid grid-cols-6 gap-2">
            <div className="col-span-6 sm:col-span-2">
              <label className={CLASSE_ROTULO} htmlFor={`cep-${pedido.id}`}>CEP (opcional)</label>
              <input id={`cep-${pedido.id}`} className={CLASSE_CAMPO} inputMode="numeric" value={cep} onChange={(ev) => { setCep(ev.target.value); void preencherPeloCep(ev.target.value); }} />
            </div>
            <div className="col-span-6 sm:col-span-4">
              <label className={CLASSE_ROTULO} htmlFor={`rua-${pedido.id}`}>Rua</label>
              <input id={`rua-${pedido.id}`} className={CLASSE_CAMPO} value={logradouro} onChange={(ev) => setLogradouro(ev.target.value)} />
            </div>
            <div className="col-span-2">
              <label className={CLASSE_ROTULO} htmlFor={`num-${pedido.id}`}>Número</label>
              <input id={`num-${pedido.id}`} className={CLASSE_CAMPO} value={numero} onChange={(ev) => setNumero(ev.target.value)} />
            </div>
            <div className="col-span-4">
              <label className={CLASSE_ROTULO} htmlFor={`comp-${pedido.id}`}>Complemento</label>
              <input id={`comp-${pedido.id}`} className={CLASSE_CAMPO} value={complemento} onChange={(ev) => setComplemento(ev.target.value)} />
            </div>
            <div className="col-span-6 sm:col-span-3">
              <label className={CLASSE_ROTULO} htmlFor={`bairro-${pedido.id}`}>Bairro</label>
              <input id={`bairro-${pedido.id}`} className={CLASSE_CAMPO} value={bairro} onChange={(ev) => setBairro(ev.target.value)} />
            </div>
            <div className="col-span-4 sm:col-span-2">
              <label className={CLASSE_ROTULO} htmlFor={`cidade-${pedido.id}`}>Cidade</label>
              <input id={`cidade-${pedido.id}`} className={CLASSE_CAMPO} value={cidade} onChange={(ev) => setCidade(ev.target.value)} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={CLASSE_ROTULO} htmlFor={`uf-${pedido.id}`}>UF</label>
              <input id={`uf-${pedido.id}`} className={CLASSE_CAMPO} maxLength={2} value={uf} onChange={(ev) => setUf(ev.target.value)} />
            </div>
            <div className="col-span-6">
              <label className={CLASSE_ROTULO} htmlFor={`ref-${pedido.id}`}>Referência</label>
              <input id={`ref-${pedido.id}`} className={CLASSE_CAMPO} value={referencia} onChange={(ev) => setReferencia(ev.target.value)} />
            </div>

            <div className="col-span-6 text-[13px]">
              {!remedir ? (
                <p className="m-0 text-ink-2">Taxa atual: {formatBRL(pedido.taxa_entrega)}</p>
              ) : paraCotar === null ? (
                <p className="m-0 text-muted">Complete o endereço para calcular a taxa.</p>
              ) : cotacao === null ? (
                <p className="m-0 text-muted">Calculando a taxa…</p>
              ) : cotacao.ok ? (
                <p className="m-0 font-semibold text-ink">
                  Taxa {formatBRL(cotacao.taxa)} · {cotacao.distancia_km} km de rota
                  {cotacao.exige_aprovacao ? " · acima do raio automático: salvar aprova a entrega" : ""}
                </p>
              ) : (
                <p role="alert" className="m-0 font-semibold text-tdf">{cotacao.erro}</p>
              )}

              {podeTaxaMao && (rotaFalhou || (entrega && !foraDeArea)) ? (
                rotaFalhou || trocarTaxa ? (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div>
                      <label className={CLASSE_ROTULO} htmlFor={`taxa-${pedido.id}`}>
                        {rotaFalhou ? "Taxa informada à mão (R$)" : "Nova taxa (R$)"}
                      </label>
                      <input id={`taxa-${pedido.id}`} className={CLASSE_CAMPO} inputMode="decimal" value={taxaDigitada} onChange={(ev) => setTaxaDigitada(ev.target.value)} />
                    </div>
                    {cotacao?.ok ? (
                      <div>
                        <label className={CLASSE_ROTULO} htmlFor={`mtaxa-${pedido.id}`}>Motivo da troca da taxa</label>
                        <input id={`mtaxa-${pedido.id}`} className={CLASSE_CAMPO} maxLength={200} value={motivoTaxa} onChange={(ev) => setMotivoTaxa(ev.target.value)} />
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <button type="button" onClick={() => setTrocarTaxa(true)} className="mt-1 min-h-touch cursor-pointer border-0 bg-transparent p-0 text-[13px] font-semibold text-brand-red">
                    Trocar a taxa
                  </button>
                )
              ) : null}
            </div>
          </div>
        ) : null}
      </fieldset>

      <section className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className={CLASSE_ROTULO} htmlFor={`nome-${pedido.id}`}>Nome do cliente</label>
          <input id={`nome-${pedido.id}`} className={CLASSE_CAMPO} maxLength={120} value={nome} onChange={(ev) => setNome(ev.target.value)} />
        </div>
        <div>
          <label className={CLASSE_ROTULO} htmlFor={`tel-${pedido.id}`}>Telefone</label>
          <input id={`tel-${pedido.id}`} className={CLASSE_CAMPO} inputMode="tel" value={whatsapp} onChange={(ev) => setWhatsapp(ev.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className={CLASSE_ROTULO} htmlFor={`obs-${pedido.id}`}>Observação do pedido</label>
          <textarea id={`obs-${pedido.id}`} rows={2} maxLength={500} value={observacao} onChange={(ev) => setObservacao(ev.target.value)} className="w-full resize-y rounded-11 border-[1.5px] border-border-shalon bg-surface px-3 py-2 text-[14px] text-ink focus:border-brand-orange focus:outline-none" />
        </div>
      </section>

      {formaEditavel && contexto ? (
        <section className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className={CLASSE_ROTULO} htmlFor={`forma-${pedido.id}`}>Como pretende pagar</label>
            <select
              id={`forma-${pedido.id}`}
              className={CLASSE_CAMPO}
              value={formaId}
              onChange={(ev) => {
                setFormaId(ev.target.value);
                setBandeiraId("");
              }}
            >
              {contexto.formas.map((f) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </select>
          </div>
          {formaAtual?.exige_bandeira && formaAtual.bandeiras.length > 0 ? (
            <div>
              <label className={CLASSE_ROTULO} htmlFor={`bandeira-${pedido.id}`}>Bandeira</label>
              <select id={`bandeira-${pedido.id}`} className={CLASSE_CAMPO} value={bandeiraId} onChange={(ev) => setBandeiraId(ev.target.value)}>
                <option value="">Não informada</option>
                {formaAtual.bandeiras.map((b) => (
                  <option key={b.id} value={b.id}>{b.nome}</option>
                ))}
              </select>
            </div>
          ) : null}
          {formaAtual?.familia === "cash" ? (
            <div>
              <label className={CLASSE_ROTULO} htmlFor={`troco-${pedido.id}`}>Troco para (R$)</label>
              <input id={`troco-${pedido.id}`} className={CLASSE_CAMPO} inputMode="decimal" value={trocoPara} onChange={(ev) => setTrocoPara(ev.target.value)} />
            </div>
          ) : null}
        </section>
      ) : null}

      <fieldset className="m-0 rounded-12 border-[1.5px] border-border-shalon bg-surface p-3">
        <legend className="px-1 text-[13.5px] font-bold text-ink">Justificativa (obrigatória)</legend>
        <div className="flex flex-wrap gap-2">
          <Opcao nome={`tipo-${pedido.id}`} marcada={tipo === "customer"} aoEscolher={() => setTipo("customer")}>Cliente pediu</Opcao>
          <Opcao nome={`tipo-${pedido.id}`} marcada={tipo === "mistake"} aoEscolher={() => setTipo("mistake")}>Lançado errado</Opcao>
        </div>
        {tipo === "customer" ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-[13px] text-ink-2">Pediu por:</span>
            {CANAIS.map((c) => (
              <Opcao key={c.valor} nome={`canal-${pedido.id}`} marcada={canal === c.valor} aoEscolher={() => setCanal(c.valor)}>
                {c.rotulo}
              </Opcao>
            ))}
          </div>
        ) : null}
        <label className="mb-1 mt-3 block text-[13px] font-semibold text-ink" htmlFor={`motivo-${pedido.id}`}>O que aconteceu</label>
        <textarea
          id={`motivo-${pedido.id}`}
          rows={2}
          maxLength={400}
          value={motivo}
          onChange={(ev) => setMotivo(ev.target.value)}
          placeholder="O cliente mudou de ideia e pediu para entregar…"
          className="w-full resize-y rounded-11 border-[1.5px] border-border-shalon bg-surface px-3 py-2 text-[14px] text-ink focus:border-brand-orange focus:outline-none"
        />
      </fieldset>

      <div className="flex items-baseline justify-between gap-3 border-t border-border-shalon pt-2">
        <span className="text-[13.5px] text-ink-2">
          Total: {formatBRL(pedido.total)} →
        </span>
        <span className="font-display text-[20px] font-extrabold tabular-nums text-ink">
          {totalPrevio === null ? "—" : formatBRL(totalPrevio)}
        </span>
      </div>

      {devolucao ? (
        <div role="alert" className="rounded-12 border border-twb bg-tw p-3">
          <p className="m-0 text-[14px] font-bold text-twf">
            Devolver {formatBRL(devolucao.valor)} ao cliente
          </p>
          <p className="m-0 mt-1 text-[13px] text-ink-2">
            O novo total ({formatBRL(devolucao.total)}) é menor que o recebido. Escolha de qual
            recebimento sai. Em dinheiro, o valor sai da gaveta.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {devolucao.pagamentos.map((p) => (
              <Opcao key={p.id} nome={`devolver-${pedido.id}`} marcada={devolverDe === p.id} aoEscolher={() => setDevolverDe(p.id)}>
                {p.forma} · {formatBRL(p.valor)}
              </Opcao>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={enviando || devolverDe === null}
              onClick={() => salvar(devolverDe)}
              className="min-h-touch cursor-pointer rounded-11 border-0 bg-cta px-4 text-[14px] font-semibold text-cta-fg disabled:cursor-not-allowed disabled:bg-tn disabled:text-muted"
            >
              {enviando ? "Salvando…" : "Registrar devolução e salvar"}
            </button>
            <button type="button" disabled={enviando} onClick={() => setDevolucao(undefined)} className={CLASSE_SECUNDARIO}>
              Voltar
            </button>
          </div>
        </div>
      ) : null}

      {erro ? (
        <p role="alert" className="m-0 rounded-10 bg-td px-3 py-2 text-[13px] font-semibold text-tdf">{erro}</p>
      ) : null}

      {!devolucao ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={enviando || semItens || !motivoOk || !entregaOk || !motivoTaxaOk || nome.trim() === ""}
            onClick={() => salvar(null)}
            className="min-h-touch cursor-pointer rounded-11 border-0 bg-cta px-4 text-[14px] font-semibold text-cta-fg disabled:cursor-not-allowed disabled:bg-tn disabled:text-muted"
          >
            {enviando ? "Salvando…" : "Salvar edição"}
          </button>
          <button type="button" disabled={enviando} onClick={() => aoFechar(null)} className={CLASSE_SECUNDARIO}>
            Cancelar
          </button>
        </div>
      ) : null}
      {!motivoOk ? <p className="m-0 text-[12.5px] text-muted">Preencha a justificativa para salvar.</p> : null}
    </div>
  );
}
