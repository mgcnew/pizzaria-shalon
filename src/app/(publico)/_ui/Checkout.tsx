"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Input } from "@/ui/components/Input";
import { SelectMenu } from "@/ui/components/SelectMenu";
import { Textarea } from "@/ui/components/Textarea";
import { formatBRL } from "@/lib/format";
import { paraRevalidacao } from "@/domain/carrinho/carrinho";
import { revalidarCarrinho } from "@/application/publico/acoes";
import type { Revalidacao } from "@/application/publico/tipos";
import {
  cotarEntrega,
  enviarPedido,
  esquecerNoNavegador,
  reconhecerNoNavegador,
} from "@/application/checkout/acoes";
import { buscarEnderecoPorCep } from "@/application/checkout/cep";
import type {
  ClienteDoDispositivo,
  CotacaoEntrega,
  EnderecoDoCliente,
  FormaDePagamento,
  Modalidade,
} from "@/application/checkout/tipos";
import type { LojaPublica } from "@/application/publico/tipos";
import { useLoja } from "@/ui/publico/useLoja";
import {
  esquecerDispositivo,
  garantirDispositivo,
  registrarPedido,
} from "@/ui/publico/armazenamentoLocal";

/**
 * Checkout — a sequência do design aprovado: modalidade, identificação,
 * endereço, entrega, pagamento, observação e revisão.
 *
 * O QUE ESTA TELA **NÃO** FAZ: decidir dinheiro.
 *
 * O subtotal vem da revalidação do servidor; a taxa vem da cotação do
 * servidor, que usa a mesma faixa que a criação do pedido usará. A tela
 * soma os dois para MOSTRAR, e o servidor recalcula tudo de novo no envio —
 * inclusive endereço e rota. Se divergir, o pedido não nasce (CLAUDE.md §16).
 */

type Props = {
  loja: LojaPublica;
  formasPorModalidade: Record<Modalidade, FormaDePagamento[]>;
};

const UF = /^[A-Za-z]{2}$/;

export function Checkout({ loja, formasPorModalidade }: Props) {
  const router = useRouter();
  const { carrinho, itens, esvaziar, dispositivo } = useLoja();

  const [modalidade, setModalidade] = useState<Modalidade>("delivery");
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [consentimento, setConsentimento] = useState(false);
  const [observacao, setObservacao] = useState("");

  const [logradouro, setLogradouro] = useState("");
  const [numero, setNumero] = useState("");
  const [complemento, setComplemento] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState(loja.endereco_cidade);
  const [uf, setUf] = useState(loja.endereco_uf);
  const [cep, setCep] = useState("");
  const [referencia, setReferencia] = useState("");

  const [cotacao, setCotacao] = useState<CotacaoEntrega | null>(null);
  const [cotando, iniciarCotacao] = useTransition();

  /**
   * RN-CLI-004: o mesmo navegador reconhece o cliente pela credencial que
   * guardou na primeira compra — nunca pelo WhatsApp digitado (03 §12.1).
   * Preenche só o que está vazio; o cliente confere e muda o que quiser.
   */
  const [reconhecido, setReconhecido] = useState<
    Extract<ClienteDoDispositivo, { encontrado: true }> | null
  >(null);
  // Endereço salvo escolhido. Qualquer edição nos campos o desfaz: o que
  // vale é o que está escrito, e o servidor só aceita o id se for do cliente.
  const [enderecoSalvoId, setEnderecoSalvoId] = useState<string | null>(null);

  function cotarEndereco(e: {
    logradouro: string;
    numero: string;
    complemento: string | null;
    bairro: string;
    cidade: string;
    uf: string;
    cep: string | null;
    referencia: string | null;
  }) {
    iniciarCotacao(async () => {
      setCotacao(await cotarEntrega(e));
    });
  }

  function aplicarEnderecoSalvo(e: EnderecoDoCliente | null) {
    setEnderecoSalvoId(e?.id ?? null);
    setLogradouro(e?.logradouro ?? "");
    setNumero(e?.numero ?? "");
    setComplemento(e?.complemento ?? "");
    setBairro(e?.bairro ?? "");
    setCidade(e?.cidade ?? loja.endereco_cidade);
    setUf(e?.uf ?? loja.endereco_uf);
    setCep(e?.cep ?? "");
    setReferencia(e?.referencia ?? "");
    setCotacao(null);
    // Endereço já conhecido: a distância costuma estar guardada, e o cliente
    // não precisa apertar "calcular" para ver a taxa.
    if (e) {
      cotarEndereco({
        logradouro: e.logradouro,
        numero: e.numero,
        complemento: e.complemento,
        bairro: e.bairro,
        cidade: e.cidade,
        uf: e.uf,
        cep: e.cep,
        referencia: e.referencia,
      });
    }
  }

  /** Editar à mão desfaz a escolha do endereço salvo. */
  function editarEndereco(definir: (valor: string) => void) {
    return (valor: string) => {
      setEnderecoSalvoId(null);
      definir(valor);
    };
  }


  // O endereço preferido entra quando o cliente está em entrega e ainda não
  // digitou nada — ao ser reconhecido, ou ao trocar de retirada para entrega.
  const atual = useRef({ modalidade, logradouro, numero });
  useEffect(() => {
    atual.current = { modalidade, logradouro, numero };
  });
  function sugerirPreferido(
    preferido: EnderecoDoCliente | undefined,
    m: Modalidade = atual.current.modalidade,
  ) {
    const vazio = atual.current.logradouro.trim() === "" && atual.current.numero.trim() === "";
    if (m === "delivery" && preferido && vazio) aplicarEnderecoSalvo(preferido);
  }
  // O reconhecimento responde depois; chama sempre a versão atual.
  const sugerir = useRef(sugerirPreferido);
  useEffect(() => {
    sugerir.current = sugerirPreferido;
  });

  useEffect(() => {
    if (!dispositivo) return;
    let cancelado = false;
    void reconhecerNoNavegador(dispositivo).then((r) => {
      if (cancelado || !r.encontrado) return;
      setReconhecido(r);
      setNome((valor) => valor.trim() || r.nome);
      setWhatsapp((valor) => valor.trim() || r.whatsapp);
      sugerir.current(r.enderecos[0]);
    });
    return () => {
      cancelado = true;
    };
  }, [dispositivo]);

  function naoSouEu() {
    const token = dispositivo;
    esquecerDispositivo();
    if (token) void esquecerNoNavegador(token);
    setReconhecido(null);
    setNome("");
    setWhatsapp("");
    aplicarEnderecoSalvo(null);
  }

  // Preenchimento por CEP: conveniência de digitação. O ViaCEP não decide
  // coordenada, distância nem taxa — quem faz isso é o provedor de rotas e a
  // faixa no banco (D-2026-09-24-75).
  const [buscandoCep, iniciarBuscaCep] = useTransition();
  const [avisoCep, setAvisoCep] = useState<string | null>(null);

  function preencherPeloCep(valor: string) {
    const digitos = valor.replace(/\D/g, "");
    setAvisoCep(null);
    // Só tenta com CEP completo. Digitar não dispara requisição a cada tecla.
    if (digitos.length !== 8) return;

    iniciarBuscaCep(async () => {
      const r = await buscarEnderecoPorCep(digitos);
      if (!r.ok) {
        // Falha NUNCA bloqueia: o cliente continua preenchendo à mão.
        setAvisoCep(
          r.motivo === "nao_encontrado"
            ? "Não achamos esse CEP. Você pode preencher o endereço à mão."
            : "Não conseguimos consultar o CEP agora. Preencha o endereço à mão.",
        );
        return;
      }
      // Não sobrescreve o que o cliente já digitou: o CEP completa, não manda.
      if (r.logradouro) setLogradouro((atual) => atual.trim() || r.logradouro);
      if (r.bairro) setBairro((atual) => atual.trim() || r.bairro);
      setCidade(r.cidade);
      setUf(r.uf);
    });
  }

  const [formaId, setFormaId] = useState("");
  const [bandeiraId, setBandeiraId] = useState("");
  const [precisaTroco, setPrecisaTroco] = useState(false);
  const [trocoPara, setTrocoPara] = useState("");

  const [revalidacao, setRevalidacao] = useState<Revalidacao | null>(null);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [divergencias, setDivergencias] = useState<unknown[] | null>(null);
  const [enviando, iniciarEnvio] = useTransition();

  /**
   * Chave de idempotência da TENTATIVA.
   *
   * Nasce no primeiro envio e sobrevive a cliques repetidos, retry de rede e
   * botão de voltar: o servidor reconhece a mesma tentativa e devolve o
   * pedido que já criou, em vez de criar outro.
   *
   * Em ref, e não em estado, porque ela não deve provocar renderização — e
   * porque gerá-la durante a renderização divergiria entre servidor e
   * navegador.
   */
  const chaveDaTentativa = useRef<string | null>(null);

  // Confere preços e disponibilidade ao abrir. O carrinho vive fora do
  // React; o servidor é o sistema externo com que estamos sincronizando.
  const assinatura = JSON.stringify(paraRevalidacao(carrinho));
  useEffect(() => {
    if (itens.length === 0) return;
    let cancelado = false;
    void revalidarCarrinho(JSON.parse(assinatura) as unknown[]).then((r) => {
      if (!cancelado) setRevalidacao(r);
    });
    return () => {
      cancelado = true;
    };
  }, [assinatura, itens.length]);

  const formas = formasPorModalidade[modalidade];
  const forma = formas.find((f) => f.id === formaId) ?? null;

  const subtotal = revalidacao?.ok ? revalidacao.subtotal : null;
  const taxa = modalidade === "pickup" ? 0 : cotacao?.ok ? cotacao.taxa : null;
  // Soma só para exibir. A autoridade é o recálculo no envio.
  const total = subtotal !== null && taxa !== null ? subtotal + taxa : null;

  const enderecoCompleto =
    logradouro.trim().length > 1 &&
    numero.trim().length > 0 &&
    bairro.trim().length > 1 &&
    cidade.trim().length > 1 &&
    UF.test(uf);

  function pedirCotacao() {
    if (!enderecoCompleto) return;
    cotarEndereco({
      logradouro: logradouro.trim(),
      numero: numero.trim(),
      complemento: complemento.trim() || null,
      bairro: bairro.trim(),
      cidade: cidade.trim(),
      uf: uf.trim().toUpperCase(),
      cep: cep.trim() || null,
      referencia: referencia.trim() || null,
    });
  }

  const abaixoDoMinimo =
    modalidade === "delivery" &&
    subtotal !== null &&
    loja.pedido_minimo_ativo &&
    loja.pedido_minimo_valor !== null &&
    subtotal < loja.pedido_minimo_valor;

  const precisaReconfirmar = revalidacao?.ok === true && revalidacao.exige_reconfirmacao;
  const checagemFalhou = revalidacao !== null && !revalidacao.ok;

  // A loja fechada também é conferida no servidor (RN-LOJA-002); aqui o
  // botão fica desligado para não convidar a tentar.
  const lojaAberta = revalidacao?.ok === true ? revalidacao.loja_aberta : loja.aberta;

  const podeEnviar =
    !enviando &&
    lojaAberta &&
    itens.length > 0 &&
    revalidacao?.ok === true &&
    !precisaReconfirmar &&
    !abaixoDoMinimo &&
    nome.trim().length >= 2 &&
    whatsapp.replace(/\D/g, "").length >= 10 &&
    forma !== null &&
    (!forma.exige_bandeira || bandeiraId !== "") &&
    (!precisaTroco || trocoPara.trim() !== "") &&
    (modalidade === "pickup" || cotacao?.ok === true);

  function enviar() {
    if (!podeEnviar || forma === null) return;
    setErroEnvio(null);
    setDivergencias(null);

    chaveDaTentativa.current ??= crypto.randomUUID();

    iniciarEnvio(async () => {
      const resultado = await enviarPedido({
        idempotency_key: chaveDaTentativa.current,
        modalidade,
        cliente: {
          nome: nome.trim(),
          whatsapp: whatsapp.trim(),
          consentimento_marketing: consentimento,
        },
        endereco:
          modalidade === "delivery"
            ? {
                id: enderecoSalvoId,
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
          // O que o cliente viu, para detectar mudança. Nunca é autoridade.
          preco_unitario_visto: i.precoUnitario,
        })),
        pagamento: {
          forma_id: forma.id,
          bandeira_id: forma.exige_bandeira ? bandeiraId : null,
          precisa_troco: precisaTroco,
          troco_para: precisaTroco ? Number(trocoPara.replace(",", ".")) : null,
        },
        observacao_geral: observacao.trim() || null,
        dispositivo_token: garantirDispositivo(),
      });

      if (!resultado.ok) {
        setErroEnvio(resultado.erro);
        setDivergencias(resultado.divergencias ?? null);
        // Divergência comercial encerra ESTA tentativa: o cliente vai
        // conferir e decidir de novo, e a próxima é uma tentativa nova.
        if (resultado.reconfirmar) chaveDaTentativa.current = null;
        return;
      }

      registrarPedido({
        token: resultado.token,
        numero: resultado.numero,
        criadoEm: Date.now(),
      });
      esvaziar();
      router.push(`/pedido/${resultado.token}?novo=1`);
    });
  }

  if (itens.length === 0) {
    return (
      <section className="px-4 py-4">
        <h1 className="m-0 mb-3 font-display text-[26px] font-extrabold text-ink">
          Finalizar pedido
        </h1>
        <div className="rounded-18 border border-dashed border-border-shalon bg-elev px-5 py-[44px] text-center">
          <p className="m-0 font-display text-[20px] font-bold text-ink">
            Não há nada para finalizar
          </p>
          <p className="mb-[18px] mt-2 text-[14px] text-ink-2">
            Seu carrinho está vazio.
          </p>
          <Link
            href="/"
            className="inline-flex min-h-touch-cta items-center rounded-12 bg-cta px-5 text-[16px] font-semibold text-cta-fg"
          >
            Ver cardápio
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="px-4 py-4 pb-[120px]">
      <Link href="/carrinho" className="inline-flex min-h-touch items-center text-[15px] text-ink-2">
        ← Voltar ao carrinho
      </Link>
      <h1 className="m-0 mb-4 mt-2 font-display text-[26px] font-extrabold text-ink">
        Finalizar pedido
      </h1>

      {!lojaAberta ? (
        <div className="mb-4 rounded-14 border border-tdb bg-td p-4" role="status">
          <p className="m-0 text-[15px] font-bold text-tdf">A loja está fechada agora</p>
          <p className="mt-1 text-[14px] text-ink-2">
            {loja.motivo_fechamento ??
              "Seu carrinho fica guardado por 24 horas. Quando reabrirmos, é só voltar aqui."}
          </p>
        </div>
      ) : null}

      <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
        <div className="flex flex-col gap-4">
          {/* 1. Modalidade */}
          <fieldset className="m-0 rounded-16 border border-border-shalon bg-surface p-4">
            <legend className="px-1 text-[15px] font-bold text-ink">Como você quer receber</legend>
            <div className="mt-2 flex gap-2">
              {(["delivery", "pickup"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setModalidade(m);
                    setFormaId("");
                    setBandeiraId("");
                    sugerirPreferido(reconhecido?.enderecos[0], m);
                  }}
                  aria-pressed={modalidade === m}
                  className={[
                    "min-h-touch-cta flex-1 cursor-pointer rounded-12 border-[1.5px] px-3 text-[15px] font-semibold",
                    modalidade === m
                      ? "border-brand-orange bg-cta text-cta-fg"
                      : "border-border-shalon bg-surface text-ink",
                  ].join(" ")}
                >
                  {m === "delivery" ? "Entrega" : "Retirada"}
                </button>
              ))}
            </div>
            <p className="m-0 mt-2 text-[13px] text-ink-2">
              {modalidade === "delivery"
                ? `Entrega em cerca de ${loja.entrega_eta_min}–${loja.entrega_eta_max} min.`
                : `Retirada em cerca de ${loja.retirada_eta_min}–${loja.retirada_eta_max} min, em ${loja.endereco_logradouro}, ${loja.endereco_numero}.`}
            </p>
          </fieldset>

          {/* 2. Identificação */}
          <fieldset className="m-0 flex flex-col gap-3 rounded-16 border border-border-shalon bg-surface p-4">
            <legend className="px-1 text-[15px] font-bold text-ink">Seus dados</legend>
            {reconhecido !== null ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-12 bg-elev px-3 py-2.5">
                <p className="m-0 text-[14px] text-ink">
                  <span className="font-semibold">
                    Olá, {reconhecido.nome.trim().split(/\s+/)[0]}!
                  </span>{" "}
                  <span className="text-ink-2">Preenchemos com os dados deste aparelho.</span>
                </p>
                <button
                  type="button"
                  onClick={naoSouEu}
                  className="min-h-touch cursor-pointer border-0 bg-transparent px-1 text-[13.5px] font-semibold text-ink-2 underline"
                >
                  Não sou eu
                </button>
              </div>
            ) : null}
            <Input
              label="Nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              autoComplete="name"
              maxLength={120}
              required
            />
            <Input
              label="WhatsApp"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              inputMode="tel"
              autoComplete="tel"
              maxLength={24}
              placeholder="(00) 00000-0000"
              hint="É por aqui que a pizzaria fala com você sobre este pedido."
              required
            />
          </fieldset>

          {/* 3. Endereço */}
          {modalidade === "delivery" ? (
            <fieldset className="m-0 flex flex-col gap-3 rounded-16 border border-border-shalon bg-surface p-4">
              <legend className="px-1 text-[15px] font-bold text-ink">Endereço de entrega</legend>
              {reconhecido !== null && reconhecido.enderecos.length > 0 ? (
                <EnderecosDoCliente
                  enderecos={reconhecido.enderecos}
                  selecionado={enderecoSalvoId}
                  aoEscolher={aplicarEnderecoSalvo}
                />
              ) : null}

              <div className="flex gap-3">
                <div className="flex-[3]">
                  <Input
                    label="Rua"
                    value={logradouro}
                    onChange={(e) => editarEndereco(setLogradouro)(e.target.value)}
                    autoComplete="address-line1"
                    maxLength={160}
                  />
                </div>
                <div className="flex-1">
                  <Input
                    label="Número"
                    value={numero}
                    onChange={(e) => editarEndereco(setNumero)(e.target.value)}
                    maxLength={20}
                  />
                </div>
              </div>

              <Input
                label="Bairro"
                value={bairro}
                onChange={(e) => editarEndereco(setBairro)(e.target.value)}
                maxLength={80}
              />

              <div className="flex gap-3">
                <div className="flex-[3]">
                  <Input
                    label="Cidade"
                    value={cidade}
                    onChange={(e) => editarEndereco(setCidade)(e.target.value)}
                    maxLength={80}
                  />
                </div>
                <div className="w-[88px]">
                  <Input
                    label="UF"
                    value={uf}
                    onChange={(e) => editarEndereco(setUf)(e.target.value.toUpperCase().slice(0, 2))}
                    maxLength={2}
                  />
                </div>
              </div>

              <Input
                label="CEP"
                value={cep}
                onChange={(e) => {
                  editarEndereco(setCep)(e.target.value);
                  preencherPeloCep(e.target.value);
                }}
                inputMode="numeric"
                maxLength={12}
                hint={
                  buscandoCep
                    ? "Buscando o endereço…"
                    : (avisoCep ??
                      "Opcional. Preenchendo o CEP, a gente completa rua, bairro e cidade.")
                }
              />

              {/* RN-ENT-004: estes dois vão para o entregador, não para o
                  cálculo. Não entram na busca do endereço. */}
              <Input
                label="Complemento"
                value={complemento}
                onChange={(e) => editarEndereco(setComplemento)(e.target.value)}
                maxLength={80}
                hint="Apartamento, bloco, fundos. Não entra no cálculo da distância."
              />
              <Input
                label="Ponto de referência"
                value={referencia}
                onChange={(e) => editarEndereco(setReferencia)(e.target.value)}
                maxLength={160}
                hint="Ajuda o entregador a chegar. Não entra no cálculo da distância."
              />

              <button
                type="button"
                onClick={pedirCotacao}
                disabled={!enderecoCompleto || cotando}
                className="min-h-touch-cta cursor-pointer rounded-12 border-[1.5px] border-border-shalon bg-surface px-4 text-[15px] font-semibold text-ink disabled:cursor-not-allowed disabled:text-muted"
              >
                {cotando ? "Calculando a entrega…" : "Calcular taxa de entrega"}
              </button>

              {cotacao?.ok === true ? (
                <div className="rounded-12 bg-elev p-3">
                  <p className="m-0 text-[14px] font-semibold text-ink">
                    Taxa de entrega: {formatBRL(cotacao.taxa)}
                  </p>
                  <p className="m-0 mt-1 text-[13px] text-ink-2">
                    {cotacao.endereco_formatado} · {cotacao.distancia_km.toFixed(1)} km de rota
                  </p>
                  {cotacao.exige_aprovacao ? (
                    /* RN-ENT-011: segue, mas com aprovação da Shalon. */
                    <p className="m-0 mt-2 rounded-10 bg-tw px-3 py-2 text-[13px] font-semibold text-twf">
                      Você está um pouco além da nossa área automática. Dá para pedir, mas a
                      pizzaria precisa aprovar a entrega antes de começar a preparar.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {cotacao?.ok === false ? (
                <p className="m-0 rounded-10 bg-td px-3 py-2 text-[13.5px] font-semibold text-tdf" role="alert">
                  {cotacao.erro}
                </p>
              ) : null}
            </fieldset>
          ) : null}

          {/* 4. Pagamento */}
          <fieldset className="m-0 flex flex-col gap-3 rounded-16 border border-border-shalon bg-surface p-4">
            <legend className="px-1 text-[15px] font-bold text-ink">Pagamento</legend>

            {formas.length === 0 ? (
              <p className="m-0 text-[14px] text-ink-2">
                Nenhuma forma de pagamento está disponível para esta modalidade agora.
              </p>
            ) : (
              <>
                <SelectMenu
                  label="Forma de pagamento"
                  valor={formaId}
                  aoMudar={(valor) => {
                    setFormaId(valor);
                    setBandeiraId("");
                    setPrecisaTroco(false);
                  }}
                  opcoes={[
                    { valor: "", texto: "Escolha…" },
                    ...formas.map((f) => ({ valor: f.id, texto: f.nome })),
                  ]}
                />

                {forma?.exige_bandeira ? (
                  <SelectMenu
                    label="Bandeira"
                    valor={bandeiraId}
                    aoMudar={setBandeiraId}
                    opcoes={[
                      { valor: "", texto: "Escolha…" },
                      ...forma.bandeiras.map((b) => ({ valor: b.id, texto: b.nome })),
                    ]}
                  />
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
                      Preciso de troco
                    </label>
                    {precisaTroco ? (
                      <Input
                        label="Troco para quanto?"
                        value={trocoPara}
                        onChange={(e) => setTrocoPara(e.target.value)}
                        inputMode="decimal"
                        hint="O valor precisa ser igual ou maior que o total do pedido."
                      />
                    ) : null}
                  </div>
                ) : null}

                {forma?.familia === "pix_key" ? (
                  <p className="m-0 rounded-10 bg-tw px-3 py-2 text-[13px] font-semibold text-twf">
                    A chave Pix aparece na tela de acompanhamento depois do envio. O preparo
                    começa quando a pizzaria confirmar o recebimento.
                  </p>
                ) : null}
              </>
            )}
          </fieldset>

          {/* 5. Observação e consentimento */}
          <fieldset className="m-0 flex flex-col gap-3 rounded-16 border border-border-shalon bg-surface p-4">
            <legend className="px-1 text-[15px] font-bold text-ink">Mais alguma coisa?</legend>
            <Textarea
              label="Observação do pedido"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Ex.: interfone quebrado, entregar na portaria."
            />
            <label className="flex min-h-touch cursor-pointer items-start gap-2 text-[13.5px] text-ink-2">
              <input
                type="checkbox"
                checked={consentimento}
                onChange={(e) => setConsentimento(e.target.checked)}
                className="mt-[3px] size-[18px]"
              />
              Quero receber novidades e promoções da Shalon pelo WhatsApp.
            </label>
          </fieldset>
        </div>

        {/* 6. Revisão */}
        <aside className="sticky top-[90px] rounded-16 border border-border-shalon bg-surface p-4">
          <h2 className="m-0 mb-3 text-[15px] font-bold text-ink">Revisão</h2>

          <ul className="m-0 mb-3 list-none p-0">
            {itens.map((i) => (
              <li key={i.linha} className="flex justify-between gap-3 py-1 text-[14px]">
                <span className="min-w-0 text-ink-2">
                  {i.quantidade}× {i.nome}
                </span>
                <span className="whitespace-nowrap tabular-nums text-ink">
                  {formatBRL(i.precoUnitario * i.quantidade)}
                </span>
              </li>
            ))}
          </ul>

          <div className="flex justify-between py-1 text-[15px] text-ink-2">
            <span>Subtotal</span>
            <span className="tabular-nums">
              {subtotal === null ? "conferindo…" : formatBRL(subtotal)}
            </span>
          </div>
          <div className="flex justify-between py-1 text-[15px] text-ink-2">
            <span>Taxa de entrega</span>
            <span className="tabular-nums">
              {modalidade === "pickup"
                ? "retirada"
                : taxa === null
                  ? "informe o endereço"
                  : formatBRL(taxa)}
            </span>
          </div>

          <div className="my-[10px] h-px bg-border-shalon" />

          <div className="flex items-baseline justify-between">
            <span className="font-semibold text-ink">Total</span>
            <span className="font-display text-[22px] font-extrabold tabular-nums text-ink">
              {total === null ? "—" : formatBRL(total)}
            </span>
          </div>

          {abaixoDoMinimo && loja.pedido_minimo_valor !== null ? (
            <p className="m-0 mt-3 rounded-10 bg-tw px-3 py-2 text-[13px] font-semibold text-twf">
              O pedido mínimo para entrega é {formatBRL(loja.pedido_minimo_valor)}.
            </p>
          ) : null}

          {precisaReconfirmar ? (
            <p className="m-0 mt-3 rounded-10 bg-tw px-3 py-2 text-[13px] font-semibold text-twf">
              Os preços mudaram desde que você montou o carrinho.{" "}
              <Link href="/carrinho" className="underline">
                Confira no carrinho
              </Link>{" "}
              antes de enviar.
            </p>
          ) : null}

          {checagemFalhou ? (
            <p className="m-0 mt-3 rounded-10 bg-td px-3 py-2 text-[13px] font-semibold text-tdf" role="alert">
              Não conseguimos conferir os valores agora. Preferimos não enviar um pedido com um
              preço que pode não ser mais o atual.
            </p>
          ) : null}

          {erroEnvio !== null ? (
            <div className="mt-3 rounded-10 bg-td px-3 py-2" role="alert">
              <p className="m-0 text-[13.5px] font-semibold text-tdf">{erroEnvio}</p>
              {divergencias !== null && divergencias.length > 0 ? (
                <Link href="/carrinho" className="mt-1 inline-block text-[13px] underline">
                  Ver o que mudou no carrinho
                </Link>
              ) : null}
            </div>
          ) : null}

          <button
            type="button"
            onClick={enviar}
            disabled={!podeEnviar}
            className="mt-[14px] flex min-h-[52px] w-full cursor-pointer items-center justify-center rounded-13 border-0 bg-cta text-[17px] font-semibold text-cta-fg disabled:cursor-not-allowed disabled:bg-tn disabled:text-muted"
          >
            {enviando ? "Enviando…" : "Enviar pedido"}
          </button>

          <p className="m-0 mt-3 text-[12px] text-muted">
            Enviar não confirma o pedido: a pizzaria confere e aceita. Todos os valores são
            recalculados no servidor no momento do envio.
          </p>
        </aside>
      </div>
    </section>
  );
}

/**
 * Endereços salvos do cliente reconhecido (RN-CLI-006): o preferido primeiro,
 * e sempre a saída "Outro endereço" para digitar um novo.
 */
function EnderecosDoCliente({
  enderecos,
  selecionado,
  aoEscolher,
}: {
  enderecos: EnderecoDoCliente[];
  selecionado: string | null;
  aoEscolher: (endereco: EnderecoDoCliente | null) => void;
}) {
  const opcao = (ativo: boolean) =>
    [
      "flex min-h-touch w-full cursor-pointer items-start gap-3 rounded-12 border-[1.5px] px-3 py-2.5 text-left",
      ativo ? "border-brand-orange bg-elev" : "border-border-shalon bg-surface",
    ].join(" ");
  const marca = (ativo: boolean) =>
    [
      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
      ativo ? "border-brand-red" : "border-border-shalon",
    ].join(" ");

  return (
    <div role="radiogroup" aria-label="Seus endereços salvos" className="flex flex-col gap-2">
      {enderecos.map((e) => {
        const ativo = selecionado === e.id;
        return (
          <button
            key={e.id}
            type="button"
            role="radio"
            aria-checked={ativo}
            onClick={() => aoEscolher(e)}
            className={opcao(ativo)}
          >
            <span aria-hidden="true" className={marca(ativo)}>
              {ativo ? <span className="h-2.5 w-2.5 rounded-full bg-brand-red" /> : null}
            </span>
            <span className="min-w-0">
              <span className="block text-[14.5px] font-semibold text-ink">
                {e.rotulo?.trim() || `${e.logradouro}, ${e.numero}`}
              </span>
              <span className="block text-[13px] text-ink-2">
                {[e.rotulo?.trim() ? `${e.logradouro}, ${e.numero}` : null, e.complemento, e.bairro]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
          </button>
        );
      })}
      <button
        type="button"
        role="radio"
        aria-checked={selecionado === null}
        onClick={() => aoEscolher(null)}
        className={opcao(selecionado === null)}
      >
        <span aria-hidden="true" className={marca(selecionado === null)}>
          {selecionado === null ? <span className="h-2.5 w-2.5 rounded-full bg-brand-red" /> : null}
        </span>
        <span className="block text-[14.5px] font-semibold text-ink">Outro endereço</span>
      </button>
    </div>
  );
}
