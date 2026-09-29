import { rotuloInterno } from "@/domain/pedidos/estados";

/**
 * Tradução dos registros de auditoria para a Owner ler (D-2026-09-29-94).
 *
 * O banco grava códigos técnicos (`pedido_cancelar`, `update_store_settings`,
 * `reimprimir_comanda`) e o nome da tabela afetada. A tela mostrava os dois
 * crus, e "pedido_cancelar · orders" não diz qual pedido, quem cancelou nem
 * do quê para o quê. Aqui o código vira uma frase, o pedido ganha número, e
 * a mudança de status aparece com os mesmos rótulos da fila.
 *
 * Só apresentação: nada aqui muda o que foi gravado nem decide acesso. Código
 * que não está no mapa aparece legível, nunca some.
 */

export type RegistroParaDescrever = {
  action: string;
  entity_type: string;
  actor_type: string;
  reason: string | null;
  status_antes: string | null;
  status_depois: string | null;
  ator: string | null;
  numero_pedido: number | null;
};

export type DescricaoDaAuditoria = {
  titulo: string;
  /** "Por Rafaela · Aceito → Cancelado · Motivo: teste" */
  detalhe: string;
};

/** "#123", ou vazio quando o número não está disponível. */
type Frase = (pedido: string) => string;

const doPedido = (pedido: string) => (pedido ? `do pedido ${pedido}` : "do pedido");
const pedido = (n: string) => (n ? `Pedido ${n}` : "Pedido");

/** Comandos da máquina de estados, gravados como `pedido_<comando>`. */
const COMANDOS_DO_PEDIDO: Record<string, Frase> = {
  confirmar_pix: (n) => `Pix ${doPedido(n)} confirmado`,
  aprovar_entrega: (n) => `Entrega ${doPedido(n)} aprovada`,
  rejeitar_entrega: (n) => `Entrega ${doPedido(n)} recusada`,
  aceitar: (n) => `${pedido(n)} aceito`,
  iniciar_producao: (n) => `Produção ${doPedido(n)} iniciada`,
  marcar_pronto: (n) => `${pedido(n)} marcado como pronto`,
  despachar: (n) => `${pedido(n)} saiu para entrega`,
  concluir: (n) => `${pedido(n)} concluído`,
  registrar_falha_entrega: (n) => `Falha na entrega ${doPedido(n)} registrada`,
  rejeitar: (n) => `${pedido(n)} rejeitado`,
  cancelar: (n) => `${pedido(n)} cancelado`,
  cancelar_com_estorno: (n) => `${pedido(n)} cancelado com estorno do pagamento`,
  propor_alteracao: (n) => `Alteração ${doPedido(n)} proposta ao cliente`,
  retirar_alteracao: (n) => `Proposta de alteração ${doPedido(n)} retirada`,
};

const ACOES: Record<string, Frase> = {
  criar_pedido_manual: (n) => `${pedido(n)} lançado pelo painel`,
  pagamento_registrar: (n) => `Pagamento ${doPedido(n)} registrado`,
  pagamento_estornar: (n) => `Pagamento ${doPedido(n)} estornado`,
  pix_confirmar_pdv: (n) => `Pix ${doPedido(n)} confirmado no PDV`,
  caixa_excecao_sem_sessao: (n) => `Pagamento ${doPedido(n)} recebido sem caixa aberto`,
  imprimir_comanda: (n) => `Comanda ${doPedido(n)} impressa`,
  reimprimir_comanda: (n) => `Comanda ${doPedido(n)} reimpressa`,
  imprimir_alteracao: (n) => `Alteração ${doPedido(n)} impressa`,
  reimprimir_alteracao: (n) => `Alteração ${doPedido(n)} reimpressa`,
  entrega_atribuir: (n) => `Motoboy definido para o pedido${n ? ` ${n}` : ""}`,
  entrega_trocar_motoboy: (n) => `Motoboy ${doPedido(n)} trocado`,
  entrega_transferir: (n) => `Entrega ${doPedido(n)} transferida`,
  entrega_saida: () => "Saída de entrega registrada",
  entrega_conciliar: () => "Acerto do motoboy registrado",
  caixa_abrir: () => "Caixa aberto",
  caixa_fechar: () => "Caixa fechado",
  caixa_reabrir: () => "Caixa reaberto",
  caixa_estornar_movimento: () => "Movimento de caixa estornado",
  financeiro_despesa: () => "Despesa lançada",
  financeiro_entrada: () => "Entrada lançada",
  financeiro_estornar: () => "Lançamento financeiro estornado",
  financeiro_categoria_criar: () => "Categoria financeira criada",
  financeiro_categoria_editar: () => "Categoria financeira alterada",
  financeiro_comprovante_anexar: () => "Comprovante anexado a um lançamento",
  financeiro_comprovante_remover: () => "Comprovante removido de um lançamento",
  interno_estornar: () => "Movimento interno estornado",
  funcionario_criar: () => "Funcionário cadastrado",
  funcionario_editar: () => "Cadastro de funcionário alterado",
  funcionario_desligar: () => "Funcionário desligado",
  funcionario_reativar: () => "Funcionário reativado",
  acesso_vincular: () => "Acesso ao painel vinculado a um funcionário",
  acesso_definir_papeis: () => "Papéis de acesso de um usuário alterados",
  papel_definir_permissoes: () => "Permissões de um papel alteradas",
  codigo_de_barras_cadastrar: () => "Código de barras cadastrado",
  codigo_de_barras_alterar: () => "Código de barras alterado",
  codigo_de_barras_remover: () => "Código de barras removido",
  codigo_de_barras_primario: () => "Código de barras definido como principal",
  remarketing_preparar_contato: () => "Contato de remarketing preparado",
  bloquear_cliente: () => "Cliente bloqueado",
  desbloquear_cliente: () => "Cliente desbloqueado",
  update_customers: () => "Cadastro de cliente alterado",
};

/**
 * Tabelas com o gatilho genérico de auditoria, que grava `insert_`,
 * `update_` ou `delete_` + o nome da tabela. O particípio concorda com o
 * nome: [nome, criado, alterado, removido].
 */
const TABELAS: Record<string, [string, string, string, string]> = {
  store_settings: ["Configurações da loja", "criadas", "alteradas", "removidas"],
  store_hours: ["Horário de funcionamento", "criado", "alterado", "removido"],
  delivery_fee_bands: ["Faixa de taxa de entrega", "criada", "alterada", "removida"],
  payment_methods: ["Forma de pagamento", "criada", "alterada", "removida"],
  payment_brands: ["Bandeira de cartão", "criada", "alterada", "removida"],
  pix_key_settings: ["Chave Pix", "cadastrada", "alterada", "removida"],
  promotions: ["Promoção", "criada", "alterada", "removida"],
  alert_thresholds: ["Limite de alerta", "criado", "alterado", "removido"],
  employees: ["Cadastro de funcionário", "criado", "alterado", "removido"],
  employee_financial_profiles: ["Dados financeiros de funcionário", "criados", "alterados", "removidos"],
  app_users: ["Acesso ao painel", "criado", "alterado", "removido"],
  roles: ["Papel de acesso", "criado", "alterado", "removido"],
  role_permissions: ["Permissão de papel", "concedida", "alterada", "retirada"],
  user_roles: ["Papel de usuário", "atribuído", "alterado", "retirado"],
  remarketing_templates: ["Modelo de mensagem de remarketing", "criado", "alterado", "removido"],
  marketing_consent_history: ["Consentimento de marketing", "registrado", "alterado", "removido"],
};

const OPERACOES = { insert: 1, update: 2, delete: 3 } as const;

/** Último recurso: o código legível, em vez de sumir da tela. */
function legivel(codigo: string): string {
  const texto = codigo.replace(/_/g, " ").trim();
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : "Ação registrada";
}

function titulo(r: RegistroParaDescrever): string {
  const n = r.numero_pedido !== null ? `#${r.numero_pedido}` : "";

  if (r.action.startsWith("pedido_")) {
    const frase = COMANDOS_DO_PEDIDO[r.action.slice("pedido_".length)];
    if (frase) return frase(n);
  }

  const acao = ACOES[r.action];
  if (acao) return acao(n);

  const generico = /^(insert|update|delete)_(.+)$/.exec(r.action);
  if (generico) {
    const tabela = TABELAS[generico[2] ?? ""];
    const indice = OPERACOES[generico[1] as keyof typeof OPERACOES];
    if (tabela) return `${tabela[0]} ${tabela[indice]}`;
  }

  return legivel(r.action);
}

function ator(r: RegistroParaDescrever): string {
  if (r.actor_type === "system") return "Registrado automaticamente pelo sistema";
  if (r.actor_type === "customer") return "Pelo cliente";
  return r.ator ? `Por ${r.ator}` : "Por um usuário do painel";
}

/** Lançamento financeiro guarda a descrição no campo de motivo. */
const MOTIVO_E_DESCRICAO = new Set(["financeiro_despesa", "financeiro_entrada"]);

export function descreverAuditoria(r: RegistroParaDescrever): DescricaoDaAuditoria {
  const partes = [ator(r)];

  if (r.status_antes && r.status_depois && r.status_antes !== r.status_depois) {
    partes.push(`${rotuloInterno(r.status_antes).rotulo} → ${rotuloInterno(r.status_depois).rotulo}`);
  }

  const motivo = r.reason?.trim();
  if (motivo) {
    partes.push(`${MOTIVO_E_DESCRICAO.has(r.action) ? "Descrição" : "Motivo"}: ${motivo}`);
  }

  return { titulo: titulo(r), detalhe: partes.join(" · ") };
}
