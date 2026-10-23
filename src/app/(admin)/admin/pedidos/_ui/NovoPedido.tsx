"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { BandeirasAceitas } from "@/ui/components/BandeirasAceitas";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Input } from "@/ui/components/Input";
import { SelectMenu } from "@/ui/components/SelectMenu";
import { Textarea } from "@/ui/components/Textarea";
import { formatBRL } from "@/lib/format";
import { buscarClienteParaBalcao, contextoDoBalcao, criarPedidoManual } from "@/application/pedidos/acoes";
import { buscarEnderecoPorCep } from "@/application/checkout/cep";
import { cotarEntrega } from "@/application/checkout/acoes";
import type { CotacaoEntrega } from "@/application/checkout/tipos";
import {
  ORIGENS_MANUAIS,
  type ClienteNoBalcao,
  type EnderecoSalvo,
  type ItemDoRascunho,
  type Modalidade,
  type OrigemManual,
} from "@/application/pedidos/tipos";
import type { FormaDePagamento } from "@/application/checkout/tipos";
import { EscolherProduto } from "./EscolherProduto";
import { ResumoDoPedido } from "./ResumoDoPedido";
import { AtalhosDoCliente, EnderecosSalvos, ResumoDoCliente } from "./ClienteNoBalcao";

export type EtapaNovoPedido = "cliente" | "itens" | "pagamento";

/**
 * Motivos para TROCAR uma taxa calculada (D-2026-10-16-143). Ficam
 * registrados no pedido e na auditoria. "Outro" pede o texto.
 */
const MOTIVOS_DE_TROCA_DA_TAXA = [
  "Mapa calculou rota mais longa que a real",
  "CEP ou número levaram a ponto errado no mapa",
  "Cliente frequente / acordo com a casa",
  "Taxa combinada salva para este endereço",
  "Frete promocional",
  "Cortesia da casa",
  "Outro",
] as const;

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

  /**
   * Cliente reconhecido pelo WhatsApp exato (RN-MAN-007). Só sugere: nada
   * aqui decide preço, disponibilidade ou bloqueio — o servidor decide de
   * novo ao lançar.
   */
  const [reconhecido, setReconhecido] = useState<ClienteNoBalcao | null>(null);
  const [consultando, setConsultando] = useState(false);
  const [enderecoSalvoId, setEnderecoSalvoId] = useState<string | null>(null);
  const whatsappDigitos = whatsapp.replace(/\D/g, "");

  const [itens, setItens] = useState<ItemDoRascunho[]>([]);
  const [observacao, setObservacao] = useState("");

  const [formaId, setFormaId] = useState("");
  const [precisaTroco, setPrecisaTroco] = useState(false);
  const [trocoPara, setTrocoPara] = useState("");

  const [erro, setErro] = useState<string | null>(null);

  /**
   * CEP é opcional no balcão (D-2026-10-16-138). Quando digitado, completa
   * rua, bairro e cidade — e SEMPRE diz o que aconteceu: encontrado, não
   * encontrado ou consulta fora do ar. Antes o campo não fazia nada.
   */
  const [buscandoCep, setBuscandoCep] = useState(false);
  /**
   * O que foi preenchido AUTOMATICAMENTE (pelo CEP, pelo endereço salvo ou
   * pela cidade da loja). Um CEP novo troca esses valores sem pedir para
   * fechar a tela; o que a atendente digitou à mão nunca é apagado.
   */
  const automatico = useRef<Partial<Record<"logradouro" | "numero" | "complemento" | "bairro" | "cidade" | "uf" | "referencia", string>>>({});
  const [avisoCep, setAvisoCep] = useState<string | null>(null);

  /**
   * Taxa à mão: só aparece depois que a rota FALHOU (endereço não localizado
   * ou serviço de rotas fora do ar), e só para quem tem a permissão.
   */
  const [contexto, setContexto] = useState<{
    podeInformarTaxa: boolean;
    cidade: string;
    uf: string;
  } | null>(null);
  const [rotaFalhou, setRotaFalhou] = useState(false);
  const [taxaManual, setTaxaManual] = useState("");
  // Troca da taxa CALCULADA: com motivo obrigatório.
  const [trocandoTaxa, setTrocandoTaxa] = useState(false);
  const [taxaTrocada, setTaxaTrocada] = useState("");
  const [motivoDaTroca, setMotivoDaTroca] = useState("");
  const [motivoOutro, setMotivoOutro] = useState("");
  // Taxa combinada do endereço salvo escolhido (D-2026-10-16-145).
  const [taxaCombinada, setTaxaCombinada] = useState<{ valor: number; motivo: string | null } | null>(null);

  useEffect(() => {
    let vivo = true;
    void contextoDoBalcao().then((c) => {
      if (!vivo) return;
      setContexto(c);
      // A maioria das entregas é na cidade da loja: já vem preenchida.
      setCidade((atual) => atual || c.cidade);
      setUf((atual) => atual || c.uf);
      automatico.current = { ...automatico.current, cidade: c.cidade, uf: c.uf };
    });
    return () => {
      vivo = false;
    };
  }, []);

  /**
   * Prévia da taxa (D-2026-10-16-139): assim que o endereço está completo, a
   * taxa aparece logo abaixo dele — a atendente já fala o valor ao cliente.
   * É só prévia: o lançamento mede de novo no servidor e é ele que vale.
   * Se a rota falhar aqui, a opção da taxa à mão já aparece.
   */
  const enderecoParaCotar =
    modalidade === "delivery" &&
    logradouro.trim().length > 1 &&
    numero.trim().length > 0 &&
    bairro.trim().length > 1 &&
    cidade.trim().length > 1 &&
    /^[A-Za-z]{2}$/.test(uf)
      ? {
          logradouro: logradouro.trim(),
          numero: numero.trim(),
          bairro: bairro.trim(),
          cidade: cidade.trim(),
          uf: uf.trim().toUpperCase(),
          cep: cep.trim() || null,
        }
      : null;
  const chaveDaCotacao = enderecoParaCotar ? JSON.stringify(enderecoParaCotar) : null;
  // O resultado guarda para qual endereço foi: mudou o endereço, ele não vale.
  const [resultadoDaCotacao, setResultadoDaCotacao] = useState<{
    chave: string;
    r: CotacaoEntrega;
  } | null>(null);
  const cotacao =
    chaveDaCotacao !== null && resultadoDaCotacao?.chave === chaveDaCotacao
      ? resultadoDaCotacao.r
      : null;
  const cotando = chaveDaCotacao !== null && cotacao === null;

  // Resposta atrasada de um endereço antigo não sobrescreve a do atual.
  const chaveMaisRecente = useRef<string | null>(null);
  useEffect(() => {
    chaveMaisRecente.current = chaveDaCotacao;
  });

  useEffect(() => {
    if (chaveDaCotacao === null) return;
    const chave = chaveDaCotacao;
    const espera = setTimeout(async () => {
      const r = await cotarEntrega(JSON.parse(chave));
      if (chave !== chaveMaisRecente.current) return;
      setResultadoDaCotacao({ chave, r });
      if (!r.ok && r.motivo !== "fora_de_area") setRotaFalhou(true);
      if (r.ok) setRotaFalhou(false);
    }, 700);
    return () => clearTimeout(espera);
  }, [chaveDaCotacao]);

  async function preencherPeloCep(valor: string) {
    const digitos = valor.replace(/\D/g, "");
    setAvisoCep(null);
    if (digitos.length !== 8) return;
    setBuscandoCep(true);
    const r = await buscarEnderecoPorCep(digitos);
    setBuscandoCep(false);
    if (!r.ok) {
      setAvisoCep(
        r.motivo === "nao_encontrado"
          ? "CEP não encontrado. Sem problema: preencha a rua, o número e o bairro à mão."
          : r.motivo === "indisponivel"
            ? "A consulta de CEP está fora do ar agora. Preencha o endereço à mão."
            : "CEP com formato inválido. Confira os 8 números ou deixe em branco.",
      );
      return;
    }
    // Troca o que está vazio OU o que veio automático (CEP anterior, endereço
    // salvo, cidade da loja): o cliente disse outro endereço e a tela acompanha
    // sem precisar fechar. O que foi digitado à mão fica como está.
    const auto = automatico.current;
    const trocavel = (atual: string, chave: keyof typeof auto) =>
      atual.trim() === "" || atual === (auto[chave] ?? "\u0000");
    const outroEndereco = Boolean(auto.logradouro) && auto.logradouro !== r.logradouro;

    if (trocavel(logradouro, "logradouro")) setLogradouro(r.logradouro);
    if (trocavel(bairro, "bairro")) setBairro(r.bairro);
    if (trocavel(cidade, "cidade")) setCidade(r.cidade);
    if (trocavel(uf, "uf")) setUf(r.uf);
    // Número, complemento e referência eram do endereço anterior: se vieram
    // automáticos e o endereço mudou, saem para não ficar pela metade.
    if (outroEndereco) {
      if (numero !== "" && numero === auto.numero) setNumero("");
      if (complemento !== "" && complemento === auto.complemento) setComplemento("");
      if (referencia !== "" && referencia === auto.referencia) setReferencia("");
      setEnderecoSalvoId(null);
      if (taxaCombinada) {
        setTaxaCombinada(null);
        setTrocandoTaxa(false);
        setTaxaTrocada("");
        setMotivoDaTroca("");
        setTaxaManual("");
      }
    }
    automatico.current = { logradouro: r.logradouro, bairro: r.bairro, cidade: r.cidade, uf: r.uf };
    setAvisoCep(
      r.logradouro
        ? `Encontrado: ${[r.logradouro, r.bairro, `${r.cidade}/${r.uf}`].filter(Boolean).join(", ")}.`
        : `CEP de ${r.cidade}/${r.uf}. Complete a rua e o bairro.`,
    );
  }
  // Ao entrar no passo dos itens, com mouse e teclado, o cursor já vai para a
  // busca: o formulário nasce com os três passos montados (e dois escondidos),
  // então o foco do próprio campo, que roda ao montar, cai num campo invisível.
  useEffect(() => {
    if (!emModal || etapa !== "itens") return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    document.getElementById("busca-produto")?.focus();
  }, [emModal, etapa]);

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

  // Estado atual lido pela consulta sem reexecutá-la a cada tecla nos
  // campos que ela pode preencher.
  const atual = useRef({ nome, modalidade, logradouro, formaId, formas });
  useEffect(() => {
    atual.current = { nome, modalidade, logradouro, formaId, formas };
  });

  function aplicarEndereco(e: EnderecoSalvo | null) {
    automatico.current = e
      ? {
          logradouro: e.logradouro ?? "",
          numero: e.numero ?? "",
          complemento: e.complemento ?? "",
          bairro: e.bairro ?? "",
          cidade: e.cidade ?? "",
          uf: e.uf ?? "",
          referencia: e.referencia ?? "",
        }
      : {};
    setEnderecoSalvoId(e?.id ?? null);
    const combinada =
      e?.taxa_combinada !== null && e?.taxa_combinada !== undefined ? Number(e.taxa_combinada) : null;
    if (combinada !== null && Number.isFinite(combinada)) {
      const texto = combinada.toFixed(2).replace(".", ",");
      setTaxaCombinada({ valor: combinada, motivo: e?.motivo_taxa_combinada ?? null });
      // Vale para os dois casos: se o mapa não localizar, é a taxa à mão; se
      // localizar com outro valor, entra como troca, já com o motivo.
      setTaxaManual(texto);
      setTaxaTrocada(texto);
      setMotivoDaTroca("Taxa combinada salva para este endereço");
      setTrocandoTaxa(true);
    } else {
      setTaxaCombinada(null);
    }
    setLogradouro(e?.logradouro ?? "");
    setNumero(e?.numero ?? "");
    setComplemento(e?.complemento ?? "");
    setBairro(e?.bairro ?? "");
    setCidade(e?.cidade ?? "");
    setUf(e?.uf ?? "");
    setCep(e?.cep ?? "");
    setReferencia(e?.referencia ?? "");
  }

  const esperaDaConsulta = useRef<ReturnType<typeof setTimeout> | null>(null);
  const consultaAtual = useRef(0);
  useEffect(() => () => {
    if (esperaDaConsulta.current) clearTimeout(esperaDaConsulta.current);
  }, []);

  function mudarWhatsapp(valor: string) {
    setWhatsapp(valor);
    const digitos = valor.replace(/\D/g, "");
    if (esperaDaConsulta.current) clearTimeout(esperaDaConsulta.current);
    const minha = ++consultaAtual.current;

    if (digitos.length < 10) {
      setReconhecido(null);
      setConsultando(false);
      return;
    }
    setConsultando(true);
    esperaDaConsulta.current = setTimeout(async () => {
      const r = await buscarClienteParaBalcao(digitos);
      // Só a última digitação vale: resposta atrasada não troca o cliente.
      if (minha !== consultaAtual.current) return;
      setConsultando(false);
      if (!r.ok || !r.encontrado) {
        setReconhecido(null);
        return;
      }
      const { ok: _ok, encontrado: _encontrado, ...dados } = r;
      setReconhecido(dados);
      if (dados.cliente.bloqueado) return;

      // Preenche só o que ainda está vazio: nunca sobrescreve o que o
      // atendente já digitou.
      const agora = atual.current;
      if (agora.nome.trim() === "") setNome(dados.cliente.nome);
      const preferido = dados.enderecos[0];
      if (agora.modalidade === "delivery" && agora.logradouro.trim() === "" && preferido) {
        aplicarEndereco(preferido);
      }
      const habitual = dados.pagamento_habitual;
      if (agora.formaId === "" && habitual && agora.formas.some((f) => f.id === habitual.forma_id)) {
        setFormaId(habitual.forma_id);
      }
    }, 350);
  }

  const bloqueado = reconhecido?.cliente.bloqueado === true;
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

  // O WhatsApp é opcional nos canais Balcão e Telefone, em retirada e em
  // entrega (D-2026-10-22-156 e D-2026-10-23-157). Digitado pela metade
  // continua barrando — número errado não vira pedido sem cliente.
  const telefoneOpcional = origem === "counter" || origem === "phone";
  const whatsappOk = telefoneOpcional
    ? whatsappDigitos.length === 0 || whatsappDigitos.length >= 10
    : whatsappDigitos.length >= 10;

  const clienteCompleto =
    nome.trim().length >= 2 &&
    whatsappOk &&
    !bloqueado &&
    (modalidade === "pickup" || enderecoCompleto);

  const taxaManualValor = (() => {
    const n = Number(taxaManual.replace(/\s/g, "").replace(",", "."));
    return taxaManual.trim() !== "" && Number.isFinite(n) && n >= 0 && n <= 500
      ? Math.round(n * 100) / 100
      : null;
  })();
  const usarTaxaManual =
    modalidade === "delivery" && rotaFalhou && contexto?.podeInformarTaxa === true && taxaManualValor !== null;

  const taxaTrocadaValor = (() => {
    const n = Number(taxaTrocada.replace(/\s/g, "").replace(",", "."));
    return taxaTrocada.trim() !== "" && Number.isFinite(n) && n >= 0 && n <= 500
      ? Math.round(n * 100) / 100
      : null;
  })();
  const motivoDaTrocaTexto =
    motivoDaTroca === "Outro" ? motivoOutro.trim() : motivoDaTroca;
  // Só vale com a taxa calculada na tela, valor e motivo preenchidos.
  const usarTrocaDaTaxa =
    modalidade === "delivery" &&
    !usarTaxaManual &&
    trocandoTaxa &&
    contexto?.podeInformarTaxa === true &&
    cotacao?.ok === true &&
    taxaTrocadaValor !== null &&
    taxaTrocadaValor !== cotacao.taxa &&
    motivoDaTrocaTexto.length >= 3;
  const taxaInformada = usarTaxaManual ? taxaManualValor : usarTrocaDaTaxa ? taxaTrocadaValor : null;

  // O que falta para lançar, dito com todas as letras: o botão desabilitado
  // sozinho não explica nada (era o caso do CEP sem cidade).
  const pendencias = [
    itens.length === 0 ? "itens" : null,
    nome.trim().length < 2 ? "nome do cliente" : null,
    !whatsappOk ? "WhatsApp" : null,
    modalidade === "delivery" && logradouro.trim().length <= 1 ? "rua" : null,
    modalidade === "delivery" && numero.trim().length === 0 ? "número" : null,
    modalidade === "delivery" && bairro.trim().length <= 1 ? "bairro" : null,
    modalidade === "delivery" && cidade.trim().length <= 1 ? "cidade" : null,
    modalidade === "delivery" && !/^[A-Za-z]{2}$/.test(uf) ? "UF" : null,
    forma === null ? "forma de pagamento" : null,
    precisaTroco && trocoPara.trim() === "" ? "troco para quanto" : null,
    trocandoTaxa && cotacao?.ok && taxaTrocadaValor === null ? "nova taxa" : null,
    trocandoTaxa && cotacao?.ok && taxaTrocadaValor !== cotacao.taxa && motivoDaTrocaTexto.length < 3
      ? "motivo da troca da taxa"
      : null,
  ].filter((x): x is string => x !== null);

  const trocaIncompleta =
    trocandoTaxa && cotacao?.ok === true && !usarTrocaDaTaxa && taxaTrocadaValor !== cotacao.taxa;
  const podeLancar =
    !trocaIncompleta &&
    !enviando &&
    itens.length > 0 &&
    clienteCompleto &&
    forma !== null &&
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
        cliente: { nome: nome.trim(), whatsapp: whatsappDigitos.length === 0 ? "" : whatsapp.trim() },
        endereco:
          modalidade === "delivery"
            ? {
                // O servidor só aproveita o endereço salvo se ele for deste
                // cliente e estiver igual ao digitado.
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
        })),
        pagamento: {
          forma_id: forma.id,
          bandeira_id: null,
          precisa_troco: precisaTroco,
          troco_para: precisaTroco ? Number(trocoPara.replace(",", ".")) : null,
        },
        observacao_geral: observacao.trim() || null,
        taxa_manual: taxaInformada,
        motivo_taxa_manual: usarTrocaDaTaxa ? motivoDaTrocaTexto : null,
      });

      if (!r.ok) {
        setErro(r.erro);
        // Falha de ROTA (não de área): abre a opção da taxa à mão.
        if (modalidade === "delivery" && (r.rota_indisponivel || r.endereco_ambiguo)) {
          setRotaFalhou(true);
        }
        return;
      }
      setCriado({ numero: r.numero, token: r.token, status: r.status });
      router.refresh();
    });
  }

  if (criado !== null) {
    return (
      <div className="rounded-16 border border-tgb bg-tg p-4">
        <p className="m-0 font-display text-[20px] font-bold text-tgf">
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

  // A taxa que vale na tela, em texto e em número: a informada à mão, a trocada
  // com motivo, a cotada, ou nada ainda. Usada no bloco do pagamento e no
  // resumo, para os dois dizerem sempre a mesma coisa.
  const taxaDaTela: number | null =
    modalidade === "pickup"
      ? 0
      : usarTaxaManual && taxaManualValor !== null
        ? taxaManualValor
        : usarTrocaDaTaxa && taxaTrocadaValor !== null
          ? taxaTrocadaValor
          : cotacao?.ok
            ? cotacao.taxa
            : null;
  const textoDaTaxa =
    modalidade === "pickup"
      ? "retirada"
      : usarTaxaManual && taxaManualValor !== null
        ? `${formatBRL(taxaManualValor)} (informada)`
        : usarTrocaDaTaxa && taxaTrocadaValor !== null
          ? `${formatBRL(taxaTrocadaValor)} (trocada)`
          : cotacao?.ok
            ? formatBRL(cotacao.taxa)
            : cotando
              ? "calculando…"
              : "calculada ao lançar";
  const enderecoDoResumo =
    logradouro.trim() !== ""
      ? [
          `${logradouro.trim()}${numero.trim() !== "" ? `, ${numero.trim()}` : ""}`,
          bairro.trim(),
        ]
          .filter(Boolean)
          .join(" — ")
      : null;

  const indiceDaEtapa = ETAPAS.findIndex((item) => item.valor === etapa);
  const classeDaEtapa = (alvo: EtapaNovoPedido) =>
    emModal && etapa !== alvo ? "hidden" : emModal ? "motion-tab-in" : "";

  return (
    // No modal do desktop o formulário ganha, à direita, o resumo do pedido
    // sempre à vista; fora do modal (página e celular) nada muda.
    <div className={emModal ? "lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-x-5" : undefined}>
    <div
      className={
        emModal
          ? "flex min-w-0 flex-col gap-4"
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
                    ativa ? "text-ink" : concluida ? "text-tgf" : "text-muted",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "motion-interactive flex h-[34px] w-[34px] items-center justify-center rounded-pill border-2 text-[11px] font-extrabold transition-colors",
                      ativa
                        ? "border-cta bg-cta text-cta-fg shadow-[0_4px_12px_rgb(30_24_20/0.12)]"
                        : concluida
                          ? "border-tgb bg-tg text-tgf"
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

          <SelectMenu
            label="De onde veio este pedido"
            valor={origem}
            aoMudar={(valor) => setOrigem(valor as OrigemManual)}
            hint="Fica registrado no pedido e serve para comparar canais depois."
            opcoes={ORIGENS_MANUAIS.map((o) => ({ valor: o.valor, texto: o.rotulo }))}
          />

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
          {/* WhatsApp primeiro: o cliente já cadastrado é reconhecido por ele e
              traz nome, endereço e pagamento habitual — o nome só é digitado
              quando o cliente é novo. */}
          <Input
            label={telefoneOpcional ? "WhatsApp (opcional)" : "WhatsApp"}
            value={whatsapp}
            onChange={(e) => mudarWhatsapp(e.target.value)}
            inputMode="tel"
            maxLength={24}
            placeholder="(00) 00000-0000"
            hint={
              telefoneOpcional && whatsappDigitos.length === 0
                ? modalidade === "delivery"
                  ? "Dá para lançar a entrega sem o WhatsApp. Sem ele, o pedido não entra no histórico do cliente, não pode ir para o fiado, o endereço não fica salvo e a equipe não consegue chamar o cliente pelo sistema."
                  : "Dá para lançar só com o nome. Sem o WhatsApp, o pedido não entra no histórico do cliente e não pode ir para o fiado."
                : "Identificador operacional do cliente. Cliente já cadastrado é reconhecido por ele."
            }
          />
          {consultando ? (
            <p className="m-0 text-[12.5px] text-muted" role="status">
              Procurando cliente…
            </p>
          ) : reconhecido !== null ? (
            <ResumoDoCliente dados={reconhecido} />
          ) : null}
          <Input label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} />
        </fieldset>

        {modalidade === "delivery" ? (
          <fieldset className={`m-0 flex flex-col gap-3 rounded-16 border border-border-shalon bg-surface p-4 ${classeDaEtapa("cliente")}`}>
            <legend className="px-1 text-[15px] font-bold text-ink">Endereço de entrega</legend>
            {reconhecido !== null && !bloqueado && reconhecido.enderecos.length > 0 ? (
              <EnderecosSalvos
                enderecos={reconhecido.enderecos}
                selecionado={enderecoSalvoId}
                aoEscolher={aplicarEndereco}
              />
            ) : null}
            <Input
              label="CEP (opcional)"
              value={cep}
              onChange={(e) => {
                setCep(e.target.value);
                void preencherPeloCep(e.target.value);
              }}
              inputMode="numeric"
              maxLength={12}
              hint={
                buscandoCep
                  ? "Buscando o endereço…"
                  : (avisoCep ?? "Se souber, comece por aqui: a gente completa rua, bairro e cidade.")
              }
            />
            {taxaCombinada ? (
              <p className="m-0 rounded-12 border border-tib bg-ti px-3 py-2 text-[13px] text-tif">
                <span className="font-semibold">
                  Taxa combinada para este endereço: {formatBRL(taxaCombinada.valor)}
                </span>
                {taxaCombinada.motivo ? ` · ${taxaCombinada.motivo}` : ""}. Já vem aplicada; dá para
                trocar abaixo.
              </p>
            ) : null}
            {/* Rota não localizada: a taxa à mão fica aqui, entre o CEP e o
                endereço — onde a atendente está olhando (D-2026-10-16-141). */}
            {rotaFalhou && contexto?.podeInformarTaxa ? (
              <div className="rounded-12 border border-twb bg-tw p-3">
                <p className="m-0 text-[13.5px] font-semibold text-twf">
                  Não localizamos esse endereço no mapa.
                </p>
                <p className="m-0 mt-1 text-[12.5px] text-twf">
                  Confira os dados abaixo ou informe a taxa combinada com o cliente. Ela fica
                  registrada como taxa informada à mão.
                </p>
                <div className="mt-2 max-w-[220px]">
                  <Input
                    label="Taxa de entrega (R$)"
                    value={taxaManual}
                    onChange={(e) => setTaxaManual(e.target.value)}
                    inputMode="decimal"
                    placeholder="Ex.: 8,00"
                    maxLength={8}
                  />
                </div>
              </div>
            ) : null}
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
            {/* Prévia da taxa, logo abaixo do endereço. */}
            {cotando ? (
              <p role="status" className="m-0 rounded-12 bg-elev px-3 py-2.5 text-[13.5px] text-ink-2">
                Calculando a taxa de entrega…
              </p>
            ) : cotacao?.ok ? (
              <div role="status" className="rounded-12 border border-tgb bg-tg px-3 py-2.5">
                <p className="m-0 flex items-baseline justify-between gap-3 text-[14.5px] font-bold text-tgf">
                  <span>Taxa de entrega</span>
                  <span className="tabular-nums">{formatBRL(cotacao.taxa)}</span>
                </p>
                <p className="m-0 mt-0.5 text-[12.5px] text-tgf">
                  {cotacao.distancia_km.toFixed(1).replace(".", ",")} km de rota
                  {cotacao.exige_aprovacao ? " · acima do raio automático: vai pedir aprovação da entrega" : ""}
                </p>
                {contexto?.podeInformarTaxa ? (
                  trocandoTaxa ? (
                    <div className="mt-2.5 flex flex-col gap-2 border-t border-tgb pt-2.5">
                      <div className="grid gap-2 sm:grid-cols-[160px_1fr]">
                        <Input
                          label="Nova taxa (R$)"
                          value={taxaTrocada}
                          onChange={(e) => setTaxaTrocada(e.target.value)}
                          inputMode="decimal"
                          placeholder="Ex.: 4,00"
                          maxLength={8}
                        />
                        <SelectMenu
                          label="Motivo da troca"
                          valor={motivoDaTroca}
                          aoMudar={setMotivoDaTroca}
                          placeholder="Escolha o motivo"
                          opcoes={MOTIVOS_DE_TROCA_DA_TAXA.map((m) => ({ valor: m, texto: m }))}
                        />
                      </div>
                      {motivoDaTroca === "Outro" ? (
                        <Input
                          label="Descreva o motivo"
                          value={motivoOutro}
                          onChange={(e) => setMotivoOutro(e.target.value)}
                          maxLength={160}
                        />
                      ) : null}
                      <p className="m-0 text-[12px] text-tgf">
                        Fica registrado no pedido, com a taxa calculada ({formatBRL(cotacao.taxa)}) e o motivo.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setTrocandoTaxa(false);
                          setTaxaTrocada("");
                          setMotivoDaTroca("");
                          setMotivoOutro("");
                        }}
                        className="min-h-touch cursor-pointer self-start border-0 bg-transparent p-0 text-[13px] font-semibold text-tgf underline underline-offset-2"
                      >
                        Manter a taxa calculada
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setTrocandoTaxa(true)}
                      className="mt-1.5 min-h-touch cursor-pointer border-0 bg-transparent p-0 text-[13px] font-semibold text-tgf underline underline-offset-2"
                    >
                      Trocar a taxa
                    </button>
                  )
                ) : null}
              </div>
            ) : cotacao && !cotacao.ok ? (
              <p role="alert" className="m-0 rounded-12 bg-td px-3 py-2.5 text-[13px] font-semibold text-tdf">
                {cotacao.erro}
                {cotacao.motivo === "fora_de_area" && typeof cotacao.distancia_km === "number"
                  ? ` Distância calculada: ${cotacao.distancia_km.toFixed(1).replace(".", ",")} km${
                      typeof cotacao.distancia_maxima_km === "number"
                        ? ` (atendemos até ${cotacao.distancia_maxima_km.toString().replace(".", ",")} km)`
                        : ""
                    }.`
                  : ""}
                {cotacao.motivo !== "fora_de_area" && contexto?.podeInformarTaxa
                  ? taxaCombinada
                    ? " Usando a taxa combinada deste endereço."
                    : " Informe a taxa no campo logo abaixo do CEP."
                  : ""}
              </p>
            ) : (
              <p className="m-0 text-[12.5px] text-muted">
                Com rua, número, bairro e cidade preenchidos, a taxa aparece aqui.
              </p>
            )}
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
              <SelectMenu
                label="Forma"
                valor={formaId}
                aoMudar={(valor) => {
                  setFormaId(valor);
                  setPrecisaTroco(false);
                }}
                opcoes={[
                  { valor: "", texto: "Escolha…" },
                  ...formas.map((f) => ({ valor: f.id, texto: f.nome })),
                ]}
              />

              {forma?.exige_bandeira ? <BandeirasAceitas bandeiras={forma.bandeiras} /> : null}

              {reconhecido?.pagamento_habitual && !bloqueado ? (
                <p className="m-0 text-[12.5px] text-ink-2">
                  Costuma pagar com {reconhecido.pagamento_habitual.forma}
                  {reconhecido.pagamento_habitual.pede_troco ? ", e costuma pedir troco" : ""}.
                  Confirme com o cliente.
                </p>
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

          {reconhecido !== null ? (
            <AtalhosDoCliente
              key={reconhecido.cliente.id}
              dados={reconhecido}
              aoAdicionar={(novos) => setItens((lista) => [...lista, ...novos])}
            />
          ) : null}

          <EscolherProduto aoAdicionar={(item) => setItens((lista) => [...lista, item])} />
        </section>

        <section className={`rounded-16 border border-border-shalon bg-surface p-4 ${classeDaEtapa("pagamento")}`}>
          <div className="flex justify-between text-[14.5px] text-ink-2">
            <span>Subtotal dos itens</span>
            <span className="tabular-nums">{formatBRL(subtotal)}</span>
          </div>
          <div className="flex justify-between text-[14.5px] text-ink-2">
            <span>Taxa de entrega</span>
            <span className="text-[13px]">{textoDaTaxa}</span>
          </div>

          {erro !== null ? (
            <p
              role="alert"
              className="m-0 mt-3 rounded-10 bg-td px-3 py-2 text-[13px] font-semibold text-tdf"
            >
              {erro}
            </p>
          ) : null}

          {modalidade === "delivery" && rotaFalhou && !contexto?.podeInformarTaxa ? (
            <p className="m-0 mt-3 rounded-10 bg-tw px-3 py-2 text-[12.5px] font-semibold text-twf">
              Não deu para calcular a entrega até esse endereço. Confira o endereço, ou peça a
              quem tem permissão de alterar a taxa para lançar este pedido.
            </p>
          ) : null}

          {!enviando && pendencias.length > 0 ? (
            <p className="m-0 mt-3 text-[12.5px] text-ink-2" role="status">
              Falta preencher: {pendencias.join(", ")}.
            </p>
          ) : null}

          <button
            type="button"
            disabled={!podeLancar}
            onClick={lancar}
            className="motion-interactive mt-3 flex min-h-[52px] w-full cursor-pointer items-center justify-center rounded-13 border-0 bg-cta text-[16px] font-semibold text-cta-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-tn disabled:text-muted disabled:opacity-100"
          >
            {enviando
              ? "Lançando…"
              : taxaInformada !== null
                ? `Lançar com taxa de ${formatBRL(taxaInformada)}`
                : "Lançar pedido"}
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

    {emModal ? (
      <ResumoDoPedido
        canal={ORIGENS_MANUAIS.find((o) => o.valor === origem)?.rotulo ?? "Outro"}
        modalidade={modalidade}
        nome={nome}
        whatsapp={whatsapp}
        clienteCadastrado={reconhecido !== null}
        endereco={enderecoDoResumo}
        itens={itens}
        subtotal={subtotal}
        taxa={{ texto: textoDaTaxa, valor: taxaDaTela }}
        forma={forma?.nome ?? null}
        trocoPara={precisaTroco && trocoPara.trim() !== "" ? `R$ ${trocoPara.trim()}` : null}
        pendencias={pendencias}
      />
    ) : null}
    </div>
  );
}
