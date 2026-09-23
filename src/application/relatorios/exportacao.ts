import { gerarXlsx } from "./planilha";
import { gerarPdf } from "./documento";
import { formatarCelula, nomeDoArquivo } from "./formato";
import type { Arquivo, Formato, Relatorio } from "./tipos";

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
        .map((c) => escapar(formatarCelula(linha[c.chave], c.tipo)))
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
