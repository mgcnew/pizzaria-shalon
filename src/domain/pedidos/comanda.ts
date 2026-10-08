/**
 * Comanda de produção — papel de 58 mm ou de 80 mm.
 *
 * 04-REGRAS-NEGOCIO.md RN-PRINT-001 a RN-PRINT-006 · CLAUDE.md §32
 * 05-PLANO-IMPLEMENTACAO.md §10.5
 *
 * ESTE MÓDULO NÃO IMPRIME. Ele decide o que a comanda DIZ e como ela se
 * organiza em 32 ou 48 colunas — nada mais. Nenhum byte de ESC/POS, nenhum
 * Bluetooth, nenhuma chamada de rede.
 *
 * A separação é deliberada: o transporte físico ainda não foi escolhido
 * (A-08, e o roteiro da POC está em `06-PENDENCIAS-VALIDACAO-PRODUCAO.md`).
 * Escolher aqui um formato de bytes amarraria a comanda a um equipamento
 * que ninguém ainda mediu.
 *
 * Determinístico: as mesmas entradas produzem sempre as mesmas linhas. É o
 * que permite testar sem hardware e o que dá sentido ao hash guardado em
 * `order_prints.content_hash`.
 *
 * PRIORIDADE É A COZINHA, não o financeiro (RN-PRINT-003). Por isso não há
 * subtotal, nem taxa, nem total: quem produz precisa saber o que fazer, e
 * quem fecha a conta tem as telas do financeiro. A única informação de
 * dinheiro que aparece é o TROCO, e só na entrega, porque quem sai com a
 * moto precisa levar o troco certo.
 */

/** Largura do papel configurada no aparelho que imprime (D-2026-10-08-116). */
export type Papel = "58" | "80";

/**
 * Colunas úteis em fonte A: 58 mm dá 32, 80 mm dá 48. Confirmar no
 * equipamento é o teste 4 da POC.
 */
export const COLUNAS: Record<Papel, number> = { "58": 32, "80": 48 };

/** Largura padrão: a comanda de 58 mm, que é o que existia antes do 80 mm. */
export const LARGURA = COLUNAS["58"];

export type EstiloLinha =
  /** Texto comum. */
  | "normal"
  /** Cabeçalho, destacado pelo transporte quando ele souber. */
  | "titulo"
  /** Informação que não pode passar batida: modalidade, ALTERAÇÃO, troco. */
  | "destaque"
  /** Régua divisória. */
  | "separador"
  /** Espaço em branco. */
  | "vazio";

export type LinhaComanda = { texto: string; estilo: EstiloLinha };

export type ItemDaComanda = {
  quantidade: number;
  nome: string;
  tamanho?: string | null;
  borda?: string | null;
  sabores?: string[] | null;
  adicionais?: string[] | null;
  combo?: { nome: string; tamanho?: string | null; quantidade: number }[] | null;
  observacao?: string | null;
};

export type PedidoDaComanda = {
  numero: number;
  modalidade: "delivery" | "pickup";
  /** Já formatado por quem chama: o domínio não decide fuso horário. */
  horario: string;
  cliente: string;
  itens: ItemDaComanda[];
  observacao?: string | null;
  endereco?: {
    logradouro: string;
    numero: string;
    complemento?: string | null | undefined;
    bairro: string;
    referencia?: string | null | undefined;
  } | null;
  /** Troco a levar. Só aparece em entrega, e só quando existe. */
  trocoPara?: number | null;
  trocoEsperado?: number | null;
  formaPagamento?: string | null;
  /**
   * Já tem pagamento confirmado (cliente pagou na loja). Na entrega, a comanda
   * diz PAGO e não manda cobrar nem levar troco (D-2026-10-01-110).
   */
  pago?: boolean;
};

// ----------------------------------------------------------------- texto

/**
 * Quebra respeitando palavras; só parte uma palavra quando ela sozinha não
 * cabe na linha (nome de sabor comprido, por exemplo).
 */
export function quebrar(texto: string, largura = LARGURA): string[] {
  const limpo = texto.trim().replace(/\s+/g, " ");
  if (limpo === "") return [];

  const linhas: string[] = [];
  let atual = "";

  for (const palavra of limpo.split(" ")) {
    if (palavra.length > largura) {
      if (atual !== "") {
        linhas.push(atual);
        atual = "";
      }
      for (let i = 0; i < palavra.length; i += largura) {
        const pedaco = palavra.slice(i, i + largura);
        if (pedaco.length === largura) linhas.push(pedaco);
        else atual = pedaco;
      }
      continue;
    }
    if (atual === "") atual = palavra;
    else if (atual.length + 1 + palavra.length <= largura) atual += ` ${palavra}`;
    else {
      linhas.push(atual);
      atual = palavra;
    }
  }
  if (atual !== "") linhas.push(atual);
  return linhas;
}

/** Texto à esquerda e à direita na mesma linha, com o vão no meio. */
export function ladoALado(esquerda: string, direita: string, largura = LARGURA): string {
  const sobra = largura - esquerda.length - direita.length;
  if (sobra < 1) return `${esquerda} ${direita}`.slice(0, largura);
  return esquerda + " ".repeat(sobra) + direita;
}

function centralizar(texto: string, largura: number): string {
  if (texto.length >= largura) return texto.slice(0, largura);
  const antes = Math.floor((largura - texto.length) / 2);
  return " ".repeat(antes) + texto;
}

const VAZIO: LinhaComanda = { texto: "", estilo: "vazio" };

function separador(largura: number, caractere = "-"): LinhaComanda {
  return { texto: caractere.repeat(largura), estilo: "separador" };
}

function linhas(texto: string, largura: number, estilo: EstiloLinha = "normal"): LinhaComanda[] {
  return quebrar(texto, largura).map((t) => ({ texto: t, estilo }));
}

function reais(valor: number): string {
  return `R$ ${valor.toFixed(2).replace(".", ",")}`;
}

// ---------------------------------------------------------------- itens

function bloqueDoItem(item: ItemDaComanda, largura: number): LinhaComanda[] {
  const saida: LinhaComanda[] = [];
  const txt = (texto: string, estilo?: EstiloLinha) => linhas(texto, largura, estilo);

  // Quantidade colada no nome: é o que a cozinha lê primeiro.
  const titulo = `${item.quantidade}x ${item.sabores?.length ? item.sabores.join(" / ") : item.nome}`;
  saida.push(...txt(titulo, "titulo"));

  if (item.tamanho) saida.push(...txt(`  ${item.tamanho}`));
  if (item.sabores && item.sabores.length > 1) {
    saida.push(...txt("  MEIO A MEIO", "destaque"));
  }
  if (item.borda) saida.push(...txt(`  Borda: ${item.borda}`));
  if (item.adicionais?.length) {
    saida.push(...txt(`  Adicionais: ${item.adicionais.join(", ")}`));
  }
  for (const componente of item.combo ?? []) {
    saida.push(
      ...txt(
        `  - ${componente.quantidade}x ${componente.nome}` +
          (componente.tamanho ? ` (${componente.tamanho})` : ""),
      ),
    );
  }
  // Observação do item em destaque: é a instrução que costuma ser esquecida.
  if (item.observacao) saida.push(...txt(`  >> ${item.observacao}`, "destaque"));

  return saida;
}

// -------------------------------------------------------------- comanda

/**
 * Comanda de produção.
 *
 * Quem chama é responsável por só pedir isto depois do aceite: a regra vive
 * no banco (`registrar_impressao` recusa pedido não aceito), e não numa
 * condição de interface.
 */
export function montarComanda(
  pedido: PedidoDaComanda,
  largura: number = LARGURA,
): LinhaComanda[] {
  const saida: LinhaComanda[] = [];
  const txt = (texto: string, estilo?: EstiloLinha) => linhas(texto, largura, estilo);
  const SEPARADOR = separador(largura);

  saida.push({ texto: centralizar("PIZZARIA SHALON", largura), estilo: "titulo" });
  saida.push({
    texto: centralizar("*** NAO E DOCUMENTO FISCAL ***", largura),
    estilo: "normal",
  });
  saida.push(SEPARADOR);

  saida.push({ texto: `PEDIDO #${pedido.numero}`, estilo: "titulo" });
  saida.push({ texto: pedido.horario, estilo: "normal" });

  // RN-PRINT-003: entrega ou retirada em destaque. Confundir os dois custa
  // uma pizza esfriando no balcão ou um entregador sem endereço.
  saida.push(VAZIO);
  saida.push({
    texto: pedido.modalidade === "delivery" ? ">>> ENTREGA <<<" : ">>> RETIRADA <<<",
    estilo: "destaque",
  });
  saida.push(VAZIO);

  saida.push(...txt(`Cliente: ${pedido.cliente}`));

  if (pedido.modalidade === "delivery" && pedido.endereco) {
    saida.push(SEPARADOR);
    saida.push(...txt(`${pedido.endereco.logradouro}, ${pedido.endereco.numero}`));
    if (pedido.endereco.complemento) saida.push(...txt(pedido.endereco.complemento));
    saida.push(...txt(pedido.endereco.bairro));
    if (pedido.endereco.referencia) {
      saida.push(...txt(`Ref.: ${pedido.endereco.referencia}`));
    }
  }

  saida.push(SEPARADOR);
  for (const item of pedido.itens) {
    saida.push(...bloqueDoItem(item, largura));
    saida.push(VAZIO);
  }

  if (pedido.observacao) {
    saida.push(SEPARADOR);
    saida.push(...txt("OBSERVACAO DO PEDIDO", "titulo"));
    saida.push(...txt(pedido.observacao, "destaque"));
  }

  // A única informação financeira, e só quando serve à operação de entrega
  // (RN-PRINT-003: nada de transformar a comanda de cozinha em fechamento).
  if (pedido.modalidade === "delivery" && pedido.pago === true) {
    saida.push(SEPARADOR);
    saida.push({ texto: "PAGO - NAO COBRAR", estilo: "destaque" });
  } else if (
    pedido.modalidade === "delivery" &&
    pedido.trocoEsperado != null &&
    pedido.trocoPara != null
  ) {
    saida.push(SEPARADOR);
    saida.push({
      texto: `TROCO PARA ${reais(pedido.trocoPara)}`,
      estilo: "destaque",
    });
    saida.push({ texto: `Levar ${reais(pedido.trocoEsperado)}`, estilo: "destaque" });
  } else if (pedido.modalidade === "delivery" && pedido.formaPagamento) {
    saida.push(SEPARADOR);
    saida.push(...txt(`Pagamento: ${pedido.formaPagamento}`));
  }

  saida.push(SEPARADOR);
  return saida;
}

// ------------------------------------------------------------ alteração

export type AlteracaoDaComanda = {
  numero: number;
  horario: string;
  motivo: string;
  itensAntes: { quantidade: number; nome: string }[];
  itensDepois: ItemDaComanda[];
};

/**
 * Documento de ALTERAÇÃO (RN-PRINT-005).
 *
 * Nasce visualmente distinto e NÃO substitui a comanda anterior: quem está
 * produzindo já tem um papel na mão, e a pior saída possível seria um
 * segundo papel parecido com o primeiro. Por isso ele começa gritando o que
 * é, mostra o que sai e o que entra, e só então repete o pedido inteiro.
 */
export function montarAlteracao(
  dados: AlteracaoDaComanda,
  largura: number = LARGURA,
): LinhaComanda[] {
  const saida: LinhaComanda[] = [];
  const txt = (texto: string, estilo?: EstiloLinha) => linhas(texto, largura, estilo);
  const SEPARADOR = separador(largura);

  saida.push(separador(largura, "*"));
  saida.push({ texto: centralizar("*** ALTERACAO ***", largura), estilo: "destaque" });
  saida.push({ texto: centralizar(`PEDIDO #${dados.numero}`, largura), estilo: "destaque" });
  saida.push(separador(largura, "*"));
  saida.push({ texto: dados.horario, estilo: "normal" });
  saida.push(VAZIO);
  saida.push(...txt("A comanda anterior deste pedido NAO vale mais.", "destaque"));
  saida.push(VAZIO);
  saida.push(...txt(`Motivo: ${dados.motivo}`));

  saida.push(SEPARADOR);
  saida.push(...txt("ERA", "titulo"));
  for (const item of dados.itensAntes) {
    saida.push(...txt(`  - ${item.quantidade}x ${item.nome}`));
  }

  saida.push(SEPARADOR);
  saida.push(...txt("PASSA A SER", "titulo"));
  for (const item of dados.itensDepois) {
    saida.push(...bloqueDoItem(item, largura));
    saida.push(VAZIO);
  }

  saida.push(separador(largura, "*"));
  return saida;
}

/**
 * Converte para texto puro.
 *
 * É o que vai para a pré-visualização na tela, para o hash do registro de
 * impressão e — quando o transporte for escolhido — para o corpo do que for
 * enviado ao equipamento.
 */
export function renderizarTexto(linhasDaComanda: LinhaComanda[]): string {
  return linhasDaComanda.map((l) => l.texto).join("\n");
}
