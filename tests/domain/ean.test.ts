import { describe, expect, it } from "vitest";
import { avisoDeEan, eanValido } from "@/domain/catalogo/ean";

/**
 * 09-PDV-FRENTE-DE-CAIXA.md Etapa 3: "Vitest do validador de dígito
 * verificador — EAN-8 e EAN-13 válidos e inválidos, código não-EAN aceito sem
 * aviso".
 *
 * OS VETORES DESTE ARQUIVO SÃO OS MESMOS DA SUÍTE `pdv_etapa3_fase12.sql`, de
 * propósito. O dígito verificador existe em SQL e em TypeScript — o SQL é o que
 * a RPC devolve, o TypeScript é o que a tela mostra enquanto a pessoa digita —
 * e testar os dois lados com a mesma lista é o que impede um deles de derivar
 * em silêncio.
 */

// EAN-13 com dígito verificador correto.
const EAN13_VALIDOS = [
  "7891234567895",
  "4006381333931",
  "0012345678905", // dois zeros à esquerda, significativos
  "0000000000000", // caso degenerado: soma zero, verificador zero
];

const EAN13_INVALIDOS = ["7891234567890", "4006381333930"];

const EAN8_VALIDOS = ["96385074"];
const EAN8_INVALIDOS = ["96385075"];

// Nada disso é candidato a EAN, e nenhum deles pode gerar aviso.
const NAO_EAN = [
  "ABC123",
  "SHALON-01",
  "12345", // curto
  "123456789012", // 12 dígitos: nem EAN-8 nem EAN-13
  "AB-12",
  "12345678-9012-3", // 13 dígitos SE alguém ignorasse o hífen — e não deve
];

describe("eanValido", () => {
  it.each(EAN13_VALIDOS)("aceita o EAN-13 %s", (codigo) => {
    expect(eanValido(codigo)).toBe(true);
  });

  it.each(EAN13_INVALIDOS)("recusa o EAN-13 %s", (codigo) => {
    expect(eanValido(codigo)).toBe(false);
  });

  it.each(EAN8_VALIDOS)("aceita o EAN-8 %s", (codigo) => {
    expect(eanValido(codigo)).toBe(true);
  });

  it.each(EAN8_INVALIDOS)("recusa o EAN-8 %s", (codigo) => {
    expect(eanValido(codigo)).toBe(false);
  });

  // O `null` é o que separa "errado" de "não se aplica". Sem ele a tela avisaria
  // sobre todo código interno da casa.
  it.each(NAO_EAN)("responde null para %s, que não é EAN", (codigo) => {
    expect(eanValido(codigo)).toBeNull();
  });

  it("ignora espaços e pontuação, como o banco", () => {
    expect(eanValido("789 1234 5678 95")).toBe(true);
    expect(eanValido("  96385074  ")).toBe(true);
    expect(eanValido("789.123.456.789.5")).toBe(true);
  });

  // CONSEQUÊNCIA DIRETA DA ETAPA 2: o hífen é preservado na normalização, então
  // um código com hífen NÃO é só dígito e deixa de ser candidato a EAN — mesmo
  // que os dígitos, sozinhos, formassem um EAN-13 válido.
  //
  // É o comportamento certo: `AB-12` e `AB12` são códigos diferentes, e um
  // código com hífen é interno da casa, não um EAN de fabricante.
  it("hífen desqualifica o código como EAN", () => {
    expect(eanValido("789.123.456.789.5")).toBe(true);
    expect(eanValido("789-123-456-789-5")).toBeNull();
    expect(avisoDeEan("789-123-456-789-5")).toBeNull();
  });

  it("aceita minúsculas sem se confundir", () => {
    // Não há letra em EAN, mas a leitura passa por upper antes do filtro e não
    // pode alterar dígito nenhum.
    expect(eanValido("7891234567895")).toBe(true);
  });

  // Se os zeros à esquerda fossem descartados, este código teria 11 dígitos e a
  // resposta seria `null` em vez de `true`.
  it("preserva zeros à esquerda", () => {
    expect(eanValido("0012345678905")).toBe(true);
    expect(eanValido("12345678905")).toBeNull();
  });

  // Um caractere trocado tem de mudar a resposta: é exatamente o erro de
  // digitação que o dígito verificador existe para pegar.
  it("pega troca de um dígito", () => {
    expect(eanValido("7891234567895")).toBe(true);
    expect(eanValido("7891234567995")).toBe(false);
  });

  // Transposição de dígitos vizinhos com pesos diferentes muda a soma.
  it("pega transposição de dígitos vizinhos", () => {
    expect(eanValido("4006381333931")).toBe(true);
    expect(eanValido("4006381333391")).toBe(false);
  });

  it("não quebra com entrada vazia nem só com pontuação", () => {
    expect(eanValido("")).toBeNull();
    expect(eanValido("...---...")).toBeNull();
  });
});

describe("avisoDeEan", () => {
  it("avisa somente quando é EAN e o dígito não fecha", () => {
    expect(avisoDeEan("7891234567890")).toContain("dígito verificador não fecha");
    expect(avisoDeEan("96385075")).toContain("dígito verificador não fecha");
  });

  it("não avisa sobre EAN correto", () => {
    expect(avisoDeEan("7891234567895")).toBeNull();
    expect(avisoDeEan("96385074")).toBeNull();
  });

  // O ponto da decisão aprovada: o código interno da casa não é EAN e não deve
  // fazer a tela reclamar de nada.
  it.each(NAO_EAN)("não avisa sobre %s, que não é EAN", (codigo) => {
    expect(avisoDeEan(codigo)).toBeNull();
  });

  it("diz quantos dígitos leu, para a conferência ser possível", () => {
    expect(avisoDeEan("7891234567890")).toContain("13 dígitos");
    expect(avisoDeEan("96385075")).toContain("8 dígitos");
  });

  // "Avisar, nunca bloquear": o aviso é texto, e nada aqui devolve um veredito
  // que impeça salvar.
  it("é sempre texto ou null, nunca um bloqueio", () => {
    for (const codigo of [...EAN13_INVALIDOS, ...EAN8_INVALIDOS, ...NAO_EAN]) {
      const aviso = avisoDeEan(codigo);
      expect(aviso === null || typeof aviso === "string").toBe(true);
    }
  });
});
