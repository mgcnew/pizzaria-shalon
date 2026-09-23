/**
 * Relatórios: uma forma só para todos.
 *
 * O banco devolve colunas descritas + linhas + totais + ressalvas. A tela e os
 * três exportadores consomem exatamente essa forma, e é isso que garante que
 * a planilha tenha o mesmo cabeçalho, os mesmos números e as MESMAS RESSALVAS
 * que estavam na tela. Relatório que perde a ressalva ao virar arquivo é como
 * exportar o número sem a unidade.
 */

export type TipoDeColuna =
  | "texto"
  | "numero"
  | "dinheiro"
  | "data"
  | "datahora"
  | "percentual";

export type Coluna = { chave: string; rotulo: string; tipo: TipoDeColuna };

export type Linha = Record<string, string | number | boolean | null>;

export type Relatorio = {
  ok: true;
  tipo: string;
  titulo: string;
  periodo: { rotulo: string; de: string; ate: string; dias: number };
  colunas: Coluna[];
  linhas: Linha[];
  totais: Record<string, number | string | null>;
  /** As ressalvas acompanham o relatório até dentro do arquivo exportado. */
  ressalvas: string[];
  linhas_retornadas: number;
  limite: number;
  /** Bateu no teto: a tela precisa dizer que não é a lista inteira. */
  truncado: boolean;
  exportacao: boolean;
};

export type RelatorioDisponivel = { tipo: string; titulo: string };

export type CatalogoDeRelatorios = {
  ok: boolean;
  relatorios: RelatorioDisponivel[];
  /** `reports.export`: ver e levar embora são permissões diferentes. */
  pode_exportar: boolean;
};

export type Formato = "csv" | "xlsx" | "pdf";

export type Arquivo = {
  nome: string;
  tipoConteudo: string;
  bytes: Uint8Array;
};
