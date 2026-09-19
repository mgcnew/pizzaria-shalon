import type { Metadata } from "next";
import Link from "next/link";
import { Abas, type Aba } from "@/ui/patterns";
import { obterSessaoInterna } from "@/application/auth/sessao";
import { obterLojaPublica } from "@/application/publico/consultas";
import { listarFila } from "@/application/pedidos/consultas";
import { CentralDePedidos } from "./_ui/CentralDePedidos";
import { CartaoPedido } from "./_ui/CartaoPedido";

export const metadata: Metadata = { title: "Pedidos" };

const ABAS: readonly Aba[] = [
  { nome: "Em aberto", valor: "abertos" },
  { nome: "Encerrados", valor: "encerrados" },
];

/**
 * Central operacional de pedidos.
 *
 * Duas listas, e não uma com filtro escondido: o que está em aberto é a
 * operação de agora; o que encerrou é consulta. Misturar as duas faria o
 * balcão rolar a tela para achar o pedido que acabou de chegar.
 *
 * A aba viaja na URL, e não em estado de cliente — recarregar a página não
 * perde o lugar, e o link pode ser passado adiante.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string }>;
}) {
  const { aba } = await searchParams;
  const encerrados = aba === "encerrados";

  const sessao = await obterSessaoInterna();
  const [pedidos, loja] = await Promise.all([listarFila(encerrados), obterLojaPublica()]);

  // O horário é formatado AQUI, no fuso configurado da loja. Deixar para o
  // navegador faria o balcão e a cozinha verem horas diferentes se algum
  // aparelho estivesse com o fuso trocado.
  const fuso = loja?.fuso ?? "America/Sao_Paulo";
  const formatador = new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    hour: "2-digit",
    minute: "2-digit",
  });
  const hora = Object.fromEntries(
    pedidos.map((p) => [p.id, formatador.format(new Date(p.criado_em))]),
  );

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="m-0 font-display text-[24px] font-extrabold text-ink">Pedidos</h1>
          <p className="m-0 text-[13.5px] text-ink-2">
            {sessao === null
              ? "Sessão não identificada."
              : `Operando como ${sessao.papeis.join(", ") || "usuário interno"}.`}
          </p>
        </div>
        <Link
          href="/admin/pedidos?aba=abertos"
          className="min-h-touch inline-flex items-center rounded-11 border-[1.5px] border-border-shalon px-[14px] text-[13.5px] font-semibold text-ink no-underline"
        >
          Atualizar
        </Link>
      </header>

      <Abas abas={ABAS} atual={encerrados ? "encerrados" : "abertos"} parametro="aba" base="/admin/pedidos" />

      {encerrados ? (
        pedidos.length === 0 ? (
          <div className="rounded-18 border border-dashed border-border-shalon bg-elev px-5 py-[44px] text-center">
            <p className="m-0 font-display text-[19px] font-bold text-ink">
              Nenhum pedido encerrado ainda
            </p>
          </div>
        ) : (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))]">
            {pedidos.map((p) => (
              <CartaoPedido key={p.id} pedido={p} hora={hora[p.id] ?? ""} />
            ))}
          </div>
        )
      ) : (
        <CentralDePedidos pedidos={pedidos} hora={hora} />
      )}
    </div>
  );
}
