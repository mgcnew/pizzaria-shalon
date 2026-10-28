/**
 * O catálogo de permissões como a dona lê (D-2026-10-27-168).
 *
 * Cada permissão diz o que libera e de quais outras precisa para funcionar.
 * A tela de permissões só desenha isto; quem decide o que vale continua sendo
 * o banco (RLS/RPC). As dependências aqui espelham as checagens das RPCs: se
 * uma RPC passar a exigir outra permissão, a lista tem de acompanhar.
 */

export type Permissao = {
  codigo: string;
  rotulo: string;
  /** O que a permissão libera, em uma frase. */
  explica: string;
  /** Sem estas, a permissão não funciona direito. */
  precisa?: readonly string[];
  /** Dado sensível (dinheiro, salário): a tela destaca. */
  sensivel?: boolean;
};

export type GrupoDePermissoes = { titulo: string; itens: readonly Permissao[] };

export const GRUPOS_DE_PERMISSOES: readonly GrupoDePermissoes[] = [
  {
    titulo: "Pedidos",
    itens: [
      { codigo: "orders.view", rotulo: "Ver pedidos",
        explica: "Abre a tela Pedidos e a fila do que chega pelo link, WhatsApp, telefone e balcão." },
      { codigo: "orders.create_manual", rotulo: "Registrar pedido no balcão",
        explica: "Lançar pedido de telefone, WhatsApp ou balcão e montar venda no PDV.",
        precisa: ["orders.view", "catalog.view"] },
      { codigo: "orders.accept", rotulo: "Aceitar pedido e imprimir comanda",
        explica: "Aceitar o pedido recebido (a comanda sai na impressora) e concluir a venda no PDV.",
        precisa: ["orders.view"] },
      { codigo: "orders.request_change", rotulo: "Alterar pedido já enviado",
        explica: "Propor mudança de itens num pedido enviado; o cliente precisa aceitar.",
        precisa: ["orders.view"] },
      { codigo: "orders.reprint", rotulo: "Reimprimir comanda",
        explica: "Imprimir de novo a comanda ou o cupom. Toda reimpressão fica registrada.",
        precisa: ["orders.view"] },
      { codigo: "orders.cancel", rotulo: "Cancelar ou rejeitar pedido",
        explica: "Cancelar um pedido ou recusar um pedido recebido, sempre com motivo.",
        precisa: ["orders.view"] },
      { codigo: "orders.confirm_pix", rotulo: "Confirmar Pix recebido",
        explica: "Marcar que o Pix antecipado caiu na conta. Só depois disso o pedido vai para a produção.",
        precisa: ["orders.view"] },
      { codigo: "orders.override_delivery_fee", rotulo: "Mudar a taxa de entrega à mão",
        explica: "Trocar a taxa calculada pelo sistema por outro valor.",
        precisa: ["orders.view"] },
    ],
  },
  {
    titulo: "Caixa e pagamentos",
    itens: [
      { codigo: "cash.view", rotulo: "Ver o caixa",
        explica: "Ver se o caixa está aberto, o Histórico de vendas do PDV e os fechamentos." },
      { codigo: "cash.open", rotulo: "Abrir o caixa",
        explica: "Abrir o caixa no começo do expediente, com o fundo de troco.",
        precisa: ["cash.view"] },
      { codigo: "cash.close", rotulo: "Fechar o caixa",
        explica: "Contar a gaveta e fechar o caixa no fim do expediente.",
        precisa: ["cash.view"] },
      { codigo: "cash.adjust", rotulo: "Sangria e reforço",
        explica: "Tirar dinheiro da gaveta (sangria) ou colocar troco (reforço).",
        precisa: ["cash.view"] },
      { codigo: "cash.reopen", rotulo: "Reabrir ou corrigir caixa fechado",
        explica: "Reabrir um caixa já fechado para corrigir a contagem.",
        precisa: ["cash.view"] },
      { codigo: "cash.bypass_session", rotulo: "Receber sem caixa aberto",
        explica: "Registrar pagamento mesmo com o caixa fechado. O valor não entra em nenhum fechamento.",
        precisa: ["payments.register"] },
      { codigo: "payments.register", rotulo: "Registrar pagamento recebido",
        explica: "Escolher a forma de pagamento e dar a venda como paga: no PDV, na fila de pedidos e no acerto do motoboy. Sem isto não se fecha venda.",
        precisa: ["orders.view"] },
      { codigo: "orders.discount", rotulo: "Dar desconto acima de R$ 5,00",
        explica: "Quem recebe pagamento já dá até R$ 5,00 de desconto, com motivo. Isto libera qualquer valor.",
        precisa: ["payments.register"], sensivel: true },
      { codigo: "orders.defer_payment", rotulo: "Deixar o pagamento para depois (fiado)",
        explica: "Liberar o pedido para o cliente pagar depois e receber o fiado.",
        precisa: ["payments.register", "customers.view"] },
    ],
  },
  {
    titulo: "Entregas",
    itens: [
      { codigo: "deliveries.view", rotulo: "Ver entregas",
        explica: "Abre a tela Entregas: o que está pronto, na rua e com qual motoboy." },
      { codigo: "deliveries.manage", rotulo: "Montar saídas e receber acerto do motoboy",
        explica: "Despachar a entrega com o motoboy (\"Saiu com…\"), concluir quando ele volta e fazer o acerto. Sem isto, entrega não sai.",
        precisa: ["deliveries.view", "payments.register"] },
      { codigo: "deliveries.settle", rotulo: "Conciliar a diferença do acerto",
        explica: "Concluir o acerto quando o motoboy trouxe mais ou menos do que devia. Acerto sem diferença não precisa disto.",
        precisa: ["deliveries.manage"] },
    ],
  },
  {
    titulo: "Cardápio",
    itens: [
      { codigo: "catalog.view", rotulo: "Ver produtos",
        explica: "Abre Produtos e permite buscar itens no PDV e no pedido de balcão." },
      { codigo: "catalog.manage", rotulo: "Criar e editar produtos, preços e disponibilidade",
        explica: "Criar e editar produtos, preços e promoções, e marcar o que acabou.",
        precisa: ["catalog.view"] },
    ],
  },
  {
    titulo: "Clientes e remarketing",
    itens: [
      { codigo: "customers.view", rotulo: "Ver clientes",
        explica: "Abre Clientes e reconhece o cliente pelo WhatsApp na hora do pedido de balcão." },
      { codigo: "customers.block", rotulo: "Bloquear e desbloquear cliente",
        explica: "Impedir que um cliente faça pedido pelo link.",
        precisa: ["customers.view"] },
      { codigo: "remarketing.view", rotulo: "Ver remarketing",
        explica: "Abre Remarketing: clientes que sumiram e podem ser chamados de volta." },
      { codigo: "remarketing.contact", rotulo: "Registrar contato de remarketing",
        explica: "Abrir o WhatsApp com a mensagem pronta e anotar o resultado do contato.",
        precisa: ["remarketing.view"] },
    ],
  },
  {
    titulo: "Financeiro e relatórios",
    itens: [
      { codigo: "finance.view", rotulo: "Ver o financeiro",
        explica: "Abre Financeiro: despesas, entradas e saldo operacional. Não é preciso para vender.",
        sensivel: true },
      { codigo: "finance.create", rotulo: "Registrar movimentação financeira",
        explica: "Lançar despesa ou entrada no Financeiro.",
        precisa: ["finance.view"], sensivel: true },
      { codigo: "finance.reverse", rotulo: "Estornar movimentação",
        explica: "Estornar um pagamento ou movimento, com motivo. Junto com Registrar pagamento, permite trocar a forma de uma venda.",
        sensivel: true },
      { codigo: "reports.view", rotulo: "Ver relatórios",
        explica: "Abre Relatórios: vendas, caixa e produtos por período.", sensivel: true },
      { codigo: "reports.export", rotulo: "Exportar relatórios",
        explica: "Baixar os relatórios em planilha.",
        precisa: ["reports.view"], sensivel: true },
    ],
  },
  {
    titulo: "Equipe",
    itens: [
      { codigo: "employees.view", rotulo: "Ver a equipe",
        explica: "Abre Equipe: nomes e funções, sem salário." },
      { codigo: "employees.manage", rotulo: "Cadastrar funcionários e dar acesso",
        explica: "Cadastrar funcionário, criar login e escolher o papel de cada um.",
        precisa: ["employees.view"] },
      { codigo: "employees.attendance", rotulo: "Marcar presença e falta dos funcionários",
        explica: "Marcar quem veio trabalhar no dia, inclusive os motoboys.",
        precisa: ["employees.view"] },
      { codigo: "employees.finance.view", rotulo: "Ver salário e histórico financeiro",
        explica: "Ver salário, adiantamentos e saldo de cada funcionário.",
        precisa: ["employees.view"], sensivel: true },
      { codigo: "employees.finance.manage", rotulo: "Lançar adiantamento e consumo no livro",
        explica: "Lançar adiantamento, desconto e pagamento no livro do funcionário.",
        precisa: ["employees.finance.view"], sensivel: true },
      { codigo: "internal.view", rotulo: "Ver cortesia, consumo e perda",
        explica: "Ver o que saiu sem ser venda: cortesia, consumo da equipe e perda." },
      { codigo: "internal.register", rotulo: "Registrar cortesia, consumo e perda",
        explica: "Lançar cortesia, consumo ou perda. Não conta como venda nem mexe no salário.",
        precisa: ["internal.view"] },
    ],
  },
  {
    titulo: "Sistema",
    itens: [
      { codigo: "settings.view", rotulo: "Ver configurações",
        explica: "Abre Configurações: loja, horários, taxas de entrega e chave Pix. Não é preciso para vender." },
      { codigo: "settings.manage", rotulo: "Alterar configurações",
        explica: "Mudar horários, taxas, formas de pagamento e a chave Pix.",
        precisa: ["settings.view"] },
      { codigo: "roles.manage", rotulo: "Definir permissões e papéis",
        explica: "Mudar o que cada papel pode fazer (esta tela).",
        precisa: ["employees.view"] },
      { codigo: "audit.view", rotulo: "Ver o registro de auditoria",
        explica: "Ver quem fez o quê e quando: cancelamentos, estornos, reimpressões." },
    ],
  },
];

/** Conjuntos que funcionam juntos: marcar um atalho ACRESCENTA, nunca tira. */
export const ATALHOS_DE_PERMISSOES: readonly { titulo: string; explica: string; codigos: readonly string[] }[] = [
  {
    titulo: "Vender no balcão",
    explica: "PDV completo: montar a venda, escolher a forma de pagamento e concluir.",
    codigos: ["orders.view", "orders.create_manual", "orders.accept", "payments.register",
              "catalog.view", "cash.view"],
  },
  {
    titulo: "Atender pedidos do link",
    explica: "Aceitar, imprimir a comanda, alterar e receber os pedidos que chegam.",
    codigos: ["orders.view", "orders.accept", "orders.reprint", "orders.request_change",
              "payments.register", "catalog.view"],
  },
  {
    titulo: "Abrir e fechar o caixa",
    explica: "Abrir com o fundo, fazer sangria e reforço e fechar contando a gaveta.",
    codigos: ["cash.view", "cash.open", "cash.close", "cash.adjust"],
  },
  {
    titulo: "Cuidar das entregas",
    explica: "Montar a saída do motoboy e receber o acerto na volta.",
    codigos: ["orders.view", "deliveries.view", "deliveries.manage", "payments.register"],
  },
];

const POR_CODIGO = new Map(GRUPOS_DE_PERMISSOES.flatMap((g) => g.itens.map((p) => [p.codigo, p] as const)));

export function permissao(codigo: string): Permissao | undefined {
  return POR_CODIGO.get(codigo);
}

/** O que falta, entre as dependências diretas, para `codigo` funcionar com `marcados`. */
export function dependenciasFaltando(codigo: string, marcados: readonly string[]): string[] {
  return (POR_CODIGO.get(codigo)?.precisa ?? []).filter((c) => !marcados.includes(c));
}

/** Marcar `codigo` também marca, em cadeia, tudo de que ele precisa. Devolve o que entrou junto. */
export function marcarComDependencias(codigo: string, marcados: readonly string[]): { marcados: string[]; junto: string[] } {
  const resultado = new Set(marcados);
  const junto: string[] = [];
  const pendentes = [codigo];
  while (pendentes.length > 0) {
    const atual = pendentes.pop()!;
    if (resultado.has(atual)) continue;
    resultado.add(atual);
    if (atual !== codigo) junto.push(atual);
    pendentes.push(...(POR_CODIGO.get(atual)?.precisa ?? []));
  }
  return { marcados: [...resultado], junto };
}

/** Quem, entre os marcados, deixa de funcionar se `codigo` for desmarcado. */
export function quemDependeDe(codigo: string, marcados: readonly string[]): string[] {
  return marcados.filter((c) => c !== codigo && (POR_CODIGO.get(c)?.precisa ?? []).includes(codigo));
}
