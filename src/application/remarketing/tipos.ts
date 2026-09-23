/**
 * Remarketing assistido (CLAUDE.md §31).
 *
 * TRÊS DISTINÇÕES QUE OS NOMES AQUI PRECISAM PRESERVAR:
 *
 *  1. PREPARAR ≠ ENVIAR. O sistema abre o WhatsApp com o texto pronto. Quem
 *     manda é a pessoa. Por isso o contato nasce com `resultado: null`, e
 *     `null` significa "preparado, sem desfecho informado" — não "sem
 *     resposta".
 *
 *  2. COMPRA POSTERIOR ≠ CAMPANHA FUNCIONOU. `comprou_depois` é temporal.
 *     Não existe neste módulo nenhum campo chamado conversão, atribuição ou
 *     retorno de investimento, e isso é deliberado (RN-RMKT-005).
 *
 *  3. CONSENTIMENTO ≠ CADASTRO. Ter o WhatsApp não autoriza mandar promoção.
 *     Quem não consentiu não entra na lista, e a trava está no banco.
 */

export type ResultadoDoContato =
  | "contacted"
  | "no_response"
  | "interested"
  | "opted_out"
  | "other";

export type Candidato = {
  cliente_id: string;
  nome: string;
  whatsapp: string | null;
  aceita_promocao: boolean;
  pedidos: number;
  ultima_compra: string | null;
  dias_sem_comprar: number | null;
  intervalo_tipico: number | null;
  ticket_medio: number | null;
  faturamento: number;
  classificacao: string;
  /** Quando já houve contato antes — para não reabordar sem perceber. */
  ultimo_contato: string | null;
};

export type FiltrosDeCandidatos = {
  ausencia_minima?: number;
  classificacao?: string;
  pedidos_minimos?: number;
  ticket_minimo?: number;
  categoria_id?: string;
  produto_id?: string;
  /** Padrão `true`. Só o proprietário decide ver quem não consente. */
  somente_com_consentimento?: boolean;
  dias_desde_ultimo_contato?: number;
  limite?: number;
};

export type ListaDeCandidatos = {
  ok: true;
  candidatos: Candidato[];
  total_filtrado: number;
  limite: number;
  somente_com_consentimento: boolean;
};

export type Template = {
  id: string;
  name: string;
  message: string;
  is_active: boolean;
  sort_order: number;
};

/**
 * O que o banco devolve quando um contato é preparado. `estado` é sempre
 * `preparado`: não existe estado "enviado" que o sistema possa afirmar
 * sozinho.
 */
export type ContatoPreparado = {
  ok: true;
  contato_id: string;
  whatsapp: string | null;
  whatsapp_exibicao: string | null;
  mensagem: string;
  estado: "preparado";
  aviso: string;
};

export type ContatoNoRelatorio = {
  contato_id: string;
  cliente_id: string;
  cliente: string;
  em: string;
  canal: string;
  segmento: string | null;
  template: string | null;
  resultado: ResultadoDoContato | null;
  resultado_em: string | null;
  observacao: string | null;
  /** Temporal: houve compra depois. Nunca "por causa". */
  comprou_depois: boolean;
  pedido_posterior: number | null;
  compra_em: string | null;
  dias_ate_a_compra: number | null;
};

export type RelatorioDeRemarketing = {
  ok: true;
  periodo: { rotulo: string; de: string; ate: string };
  ressalva: string;
  contatos: ContatoNoRelatorio[];
  resumo: {
    contatos_preparados: number;
    sem_resultado_informado: number;
    contatados: number;
    sem_resposta: number;
    interessados: number;
    pediram_para_nao_receber: number;
    com_compra_posterior: number;
  };
};

export type Resultado =
  | { ok: true }
  | {
      ok: false;
      erro: string;
      semConsentimento?: boolean;
      bloqueado?: boolean;
      jaInformado?: boolean;
    };

export type ResultadoDoPreparo =
  | { ok: true; contato: ContatoPreparado; link: string }
  | { ok: false; erro: string; semConsentimento?: boolean; bloqueado?: boolean };
