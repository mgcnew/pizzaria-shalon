/**
 * Clientes: o que a Shalon sabe sobre quem compra, e o que ela NÃO afirma.
 *
 * A régua de cadência (RN-CRM-004/005) é a parte delicada. Ela tem cinco
 * respostas, e duas delas são recusas honestas:
 *
 *   `dados_insuficientes` — 0 ou 1 compra. Não há intervalo para comparar.
 *   `base_fraca`          — 2 compras. Há UM intervalo, e um intervalo não é
 *                           um hábito. Os fatos aparecem; o veredicto, não.
 *   `recorrente`          — 3+ compras, dentro da própria cadência.
 *   `atencao`             — 3+ compras, passou de 1× a cadência dele.
 *   `afastado`            — 3+ compras, passou de 2× a cadência dele.
 *
 * O que NÃO existe aqui: score, pontuação, "cliente ouro", probabilidade de
 * retorno. Tudo o que a tela diz é explicável em uma frase com os números que
 * estão na mesma linha (§14 da autorização da Fase 9).
 */

export type Cadencia =
  | "dados_insuficientes"
  | "base_fraca"
  | "recorrente"
  | "atencao"
  | "afastado";

export type ClienteNaLista = {
  cliente_id: string;
  nome: string;
  whatsapp: string | null;
  /** Fiado em aberto (D-2026-10-17-153). 0 quando não deve nada. */
  em_aberto?: number;
  aceita_promocao: boolean;
  bloqueado: boolean;
  pedidos: number;
  primeira_compra: string | null;
  ultima_compra: string | null;
  faturamento: number;
  ticket_medio: number | null;
  /**
   * Mediana entre compras concluídas. Com 2 compras é o intervalo OBSERVADO,
   * não uma cadência — quem diz como ler é `classificacao`.
   */
  intervalo_tipico: number | null;
  dias_sem_comprar: number | null;
  classificacao: Cadencia;
  base_fraca: boolean;
  /** A explicação em uma frase, com os mesmos números da linha. */
  porque: string;
};

export type FiltrosDeClientes = {
  classificacao?: Cadencia;
  /**
   * Filtro OBJETIVO de ausência (15/30/60/90). Independente da cadência: quem
   * tem 1 ou 2 compras entra aqui normalmente se atender ao critério
   * (RN-CRM-004).
   */
  ausencia_minima?: number;
  consentimento?: "sim" | "nao";
  pedidos_minimos?: number;
  busca?: string;
  /** Só quem tem fiado em aberto (0167). */
  fiado?: boolean;
  ordem?: "ausencia" | "faturamento" | "pedidos" | "recente";
  limite?: number;
  /** Quantos pular, para paginar (0166). */
  deslocamento?: number;
};

export type ListaDeClientes = {
  ok: true;
  clientes: ClienteNaLista[];
  total_filtrado: number;
  limite: number;
  resumo: {
    recorrentes: number;
    atencao: number;
    afastados: number;
    base_fraca: number;
    dados_insuficientes: number;
    sem_consentimento: number;
    com_fiado?: number;
    fiado_total?: number;
  };
};

export type FichaDeCliente = {
  ok: true;
  /** Pedidos em fiado ainda em aberto (D-2026-10-17-153). */
  fiado?: { pedido_id: string; numero: number; total: number; em_aberto: number; desde: string; observacao: string | null }[];
  cliente_id: string;
  nome: string;
  whatsapp: string | null;
  aceita_promocao: boolean;
  consentimento_em: string | null;
  bloqueado: boolean;
  /** Anotação interna (RN-CLI-008). Nunca vai para o cliente. */
  motivo_do_bloqueio: string | null;
  bloqueado_em: string | null;
  cadastrado_em: string;
  padrao: {
    pedidos: number;
    primeira_compra: string | null;
    ultima_compra: string | null;
    faturamento: number;
    ticket_medio: number | null;
    intervalo_tipico: number | null;
    dias_sem_comprar: number | null;
    classificacao: Cadencia;
    base_fraca: boolean;
  };
  enderecos: {
    id: string;
    rotulo: string | null;
    logradouro: string;
    numero: string | null;
    complemento: string | null;
    bairro: string | null;
    cidade: string | null;
    uf: string | null;
    referencia: string | null;
    preferido: boolean;
  }[];
  pedidos: {
    pedido_id: string;
    numero: number;
    status: string;
    modalidade: string;
    origem: string;
    total: number;
    criado_em: string;
    concluido_em: string | null;
    itens: string | null;
  }[];
  consentimento_historico: {
    em: string;
    aceita: boolean;
    origem: string;
    ator: string;
    observacao: string | null;
  }[];
  /** Nulo quando a pessoa não tem `remarketing.view`. */
  contatos_de_remarketing:
    | {
        contato_id: string;
        em: string;
        canal: string;
        segmento: string | null;
        resultado: string | null;
        /** Fato temporal. Não afirma que o contato causou a compra. */
        comprou_depois: boolean;
      }[]
    | null;
};

export type Resultado = { ok: true } | { ok: false; erro: string };
