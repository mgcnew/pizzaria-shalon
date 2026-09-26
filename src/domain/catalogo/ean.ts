/**
 * Dígito verificador de EAN-8 e EAN-13.
 *
 * 09-PDV-FRENTE-DE-CAIXA.md §2.3 · Decisão D-2026-09-25-78, item 1
 *
 * AVISAR, NUNCA BLOQUEAR. Código interno impresso pela casa não segue EAN, e
 * recusá-lo impediria um uso legítimo. Nada neste arquivo decide se um código
 * pode ser salvo.
 *
 * TRÊS RESPOSTAS, NÃO DUAS — e o `null` é a mais importante:
 *
 *   `true`  → é um EAN e o dígito fecha;
 *   `false` → é um EAN e o dígito NÃO fecha, o único caso que gera aviso;
 *   `null`  → não é um EAN, então a pergunta não se aplica.
 *
 * Um booleano forçaria "não é EAN" a virar `false`, e a tela avisaria sobre todo
 * código interno da casa.
 *
 * POR QUE ISTO EXISTE EM TYPESCRIPT, SE JÁ EXISTE NO SQL
 *
 * A Etapa 2 fixou que a NORMALIZAÇÃO vive só no banco, porque duas definições
 * divergiriam e a divergência casaria o bipe com o produto errado. Esta função
 * é o caso em que a duplicação se justifica, e vale registrar a diferença:
 *
 *   · a normalização decide IDENTIDADE — que código é este, e a qual item ele
 *     corresponde. Divergir ali corrompe dado e erra venda;
 *   · o dígito verificador decide se a tela MOSTRA UM AVISO. Divergir aqui, no
 *     pior caso, mostra ou esconde uma frase. Não grava nada, não compara nada,
 *     não resolve nada.
 *
 * O aviso que vale é sempre o que a RPC devolve em `aviso_ean`. Este daqui
 * existe só para o aviso aparecer enquanto a pessoa digita, antes de salvar.
 * A garantia de que os dois concordam é operacional: `tests/domain/ean.test.ts`
 * e a suíte `pdv_etapa3_fase12.sql` exercitam OS MESMOS VETORES, então qualquer
 * divergência derruba um dos dois lados.
 *
 * Domínio puro: sem I/O, sem Supabase, sem React.
 */

/**
 * Espelha o filtro de `public.normalizar_codigo_de_barras`: sobra letra, dígito
 * e hífen; espaço e pontuação desaparecem sem virar separador.
 *
 * Existe para responder "isto é candidato a EAN?" com o mesmo texto que o banco
 * julgaria — e NÃO para ser a normalização do projeto. Não use este resultado
 * para comparar, buscar ou gravar código: quem faz isso é a coluna gerada
 * `code_normalized`.
 */
function leituraParaEan(codigo: string): string {
  return codigo.toUpperCase().replace(/[^A-Z0-9-]/g, "");
}

/**
 * Confere o dígito verificador. `null` quando o código não é candidato a EAN.
 *
 * Candidato é o que, depois do filtro, é só dígito e tem exatamente 8 ou 13
 * deles. Zeros à esquerda contam como dígito: `0012345678905` é um EAN-13, e
 * não um número de onze dígitos.
 */
export function eanValido(codigo: string): boolean | null {
  const v = leituraParaEan(codigo);

  if (!/^[0-9]+$/.test(v) || (v.length !== 8 && v.length !== 13)) return null;

  // Peso 3 no dígito imediatamente à esquerda do verificador, alternando para a
  // esquerda. Isso dá peso 3 nas posições pares do EAN-13 e nas ímpares do
  // EAN-8, sem precisar de dois ramos — a mesma conta da função SQL.
  const n = v.length - 1;
  let soma = 0;
  for (let i = 1; i <= n; i += 1) {
    soma += Number(v[i - 1]) * ((n - i) % 2 === 0 ? 3 : 1);
  }

  return ((10 - (soma % 10)) % 10) === Number(v[v.length - 1]);
}

/**
 * A frase que a tela mostra, ou `null` quando não há o que avisar.
 *
 * Mesmo texto da função SQL `aviso_de_codigo_de_barras`, para que o aviso não
 * mude de redação quando o servidor responde.
 */
export function avisoDeEan(codigo: string): string | null {
  if (eanValido(codigo) !== false) return null;

  const digitos = leituraParaEan(codigo).length;
  return (
    `Este código tem ${digitos} dígitos e parece um EAN, mas o dígito ` +
    "verificador não fecha. Confira a digitação — você pode salvar assim mesmo."
  );
}
