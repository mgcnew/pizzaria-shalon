import { NextResponse } from "next/server";
import { obterRelatorio } from "@/application/relatorios/consultas";
import { exportar } from "@/application/relatorios/exportacao";
import type { Formato } from "@/application/relatorios/tipos";
import type { ChaveDePeriodo } from "@/application/analitico/tipos";

/**
 * Download do relatório.
 *
 * A AUTORIZAÇÃO NÃO ESTÁ AQUI. Esta rota chama `relatorio_tabular` com
 * `p_exportar = true`, e é o banco que exige `reports.export` ALÉM da
 * permissão do domínio. Quem não pode exportar recebe 403 mesmo colando a
 * URL direto, porque a recusa vem de dentro (03 §20, CLAUDE.md §12).
 *
 * A resposta é sempre `attachment`: relatório não abre no navegador como
 * página, ele baixa como arquivo.
 */

const FORMATOS: Formato[] = ["csv", "xlsx", "pdf"];

export async function GET(requisicao: Request) {
  const url = new URL(requisicao.url);
  const tipo = url.searchParams.get("tipo") ?? "";
  const formato = (url.searchParams.get("formato") ?? "csv") as Formato;
  const chave = (url.searchParams.get("periodo") ?? "30d") as ChaveDePeriodo;
  const de = url.searchParams.get("de");
  const ate = url.searchParams.get("ate");

  if (!tipo || !FORMATOS.includes(formato)) {
    return NextResponse.json({ erro: "Relatório ou formato inválido." }, { status: 400 });
  }

  const relatorio = await obterRelatorio(tipo, chave, de, ate, true);
  if (!relatorio) {
    // Sem permissão, sem dados ou tipo desconhecido caem no mesmo 403: a
    // resposta não diferencia "não pode" de "não existe" (03 §33.6).
    return NextResponse.json(
      { erro: "Não foi possível exportar este relatório." },
      { status: 403 },
    );
  }

  const arquivo = exportar(relatorio, formato);

  return new NextResponse(new Uint8Array(arquivo.bytes), {
    headers: {
      "Content-Type": arquivo.tipoConteudo,
      "Content-Disposition": `attachment; filename="${arquivo.nome}"`,
      "Cache-Control": "no-store",
    },
  });
}
