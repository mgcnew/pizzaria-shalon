import { gerarXlsx } from "./planilha";
import { gerarPdf } from "./documento";
import { formatarCelula, nomeDoArquivo } from "./formato";
import type { Arquivo, Formato, Relatorio, TipoDeColuna } from "./tipos";

/**
 * Exportação dos relatórios em CSV, Excel e PDF.
 *
 * TRÊS DECISÕES QUE VALEM PARA OS TRÊS FORMATOS:
 *
 *  1. O ARQUIVO CARREGA AS RESSALVAS. Cabeçalho com título, período e cada
 *     ressalva do relatório. Uma planilha de "vendas por dia" que não diz que
 *     venda registrada ≠ faturamento recebido é uma planilha que vai ser
 *     somada errado por alguém, meses depois, sem ninguém por perto para
 *     explicar.
 *
 *  2. NENHUMA CONTA NOVA. O exportador não soma, não calcula percentual e
 *     não deriva nada: o que vai no arquivo é o que o banco devolveu. Totais
 *     saem de `totais`, que o SQL calculou.
 *
 *  3. NENHUMA COLUNA A MAIS. Sem salário, sem lucro, sem margem, sem telefone
 *     e sem endereço. Exportar não é uma porta lateral para dados que a tela
 *     não mostra (CLAUDE.md §15, §28).
 *
 * Sem dependência nova: CSV é texto, o XLSX é montado com o `zlib` do Node e
 * o PDF é escrito diretamente. Três formatos não justificam três bibliotecas
 * (CLAUDE.md §44).
 */

/**
 * Caracteres com que a planilha começa a interpretar a célula como FÓRMULA:
 * `=`, `+`, `-`, `@` e os controles que o Excel trata como início de
 * expressão. Aspas não protegem — o Excel as consome ao importar e avalia o
 * que sobra.
 */
const ABRE_FORMULA = /^[=+\-@\t\r]/;

/**
 * Neutraliza conteúdo controlado pelo usuário antes de virar célula.
 *
 * O nome que o cliente digita no checkout chega aqui inteiro, e `=HYPERLINK(…)`
 * é um nome válido para o `zod` e para o banco. Sem isto, abrir o CSV de
 * pedidos no Excel executaria o que um anônimo escreveu (CLAUDE.md §36, §37).
 *
 * A aspa simples à frente é a marcação que Excel, LibreOffice e Sheets
 * entendem como "isto é texto literal". Ela só é aplicada a coluna de TEXTO:
 * dinheiro, número, percentual e data são produzidos pelo nosso próprio
 * formatador, nunca contêm entrada de usuário, e um `-1.234,50` prefixado
 * deixaria de ser somável — que é justamente o ponto da exportação.
 */
function neutralizarFormula(valor: string, tipo: TipoDeColuna): string {
  if (tipo !== "texto") return valor;
  return ABRE_FORMULA.test(valor) ? `'${valor}` : valor;
}

/**
 * CSV para o Excel brasileiro: BOM UTF-8, separador `;` e decimal com
 * vírgula. Sem o BOM, acento vira caractere quebrado; com vírgula decimal e
 * separador `;`, a planilha abre com as colunas no lugar.
 */
export function gerarCsv(relatorio: Relatorio): Arquivo {
  const escapar = (valor: string) => `"${valor.replace(/"/g, '""')}"`;
  const linhas: string[] = [];

  linhas.push(escapar(relatorio.titulo));
  linhas.push(escapar(`Período: ${relatorio.periodo.rotulo}`));
  for (const ressalva of relatorio.ressalvas) linhas.push(escapar(ressalva));
  if (relatorio.truncado) {
    linhas.push(escapar(`Atenção: lista limitada às primeiras ${relatorio.limite} linhas.`));
  }
  linhas.push("");

  linhas.push(relatorio.colunas.map((c) => escapar(c.rotulo)).join(";"));
  for (const linha of relatorio.linhas) {
    linhas.push(
      relatorio.colunas
        .map((c) => escapar(neutralizarFormula(formatarCelula(linha[c.chave], c.tipo), c.tipo)))
        .join(";"),
    );
  }

  const bytes = new TextEncoder().encode("\uFEFF" + linhas.join("\r\n") + "\r\n");
  return {
    nome: nomeDoArquivo(relatorio.tipo, relatorio.periodo.de, relatorio.periodo.ate, "csv"),
    tipoConteudo: "text/csv; charset=utf-8",
    bytes,
  };
}

export function exportar(relatorio: Relatorio, formato: Formato): Arquivo {
  switch (formato) {
    case "xlsx":
      return gerarXlsx(relatorio);
    case "pdf":
      return gerarPdf(relatorio);
    default:
      return gerarCsv(relatorio);
  }
}
