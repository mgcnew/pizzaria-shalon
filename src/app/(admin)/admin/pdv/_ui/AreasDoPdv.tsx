"use client";

import { PainelDoCaixa } from "@/ui/caixa/PainelDoCaixa";
import { SessoesAnteriores } from "@/ui/caixa/SessoesAnteriores";
import { PainelPedidosAReceber } from "./PainelPedidosAReceber";
import type { FormaParaRecebimento } from "@/app/(admin)/admin/pedidos/_ui/Recebimento";
import type {
  EstadoDoCaixa,
  ResumoDeFechamento,
  SessaoHistorica,
} from "@/application/caixa/tipos";
import type { PedidoAReceber } from "@/application/pdv/tipos";
import type { AreaComTeclado } from "./PdvComTeclado";

/**
 * As áreas de trabalho do balcão — Fase 12, Etapa 8.
 *
 * 09-PDV-FRENTE-DE-CAIXA.md §4.1, §4.3
 *
 * POR QUE ABAS DE CLIENTE, E NÃO PARÂMETRO NA URL: a venda em andamento vive
 * no componente ao lado, em estado de cliente. Trocar a URL remontaria a
 * árvore e o carrinho poderia ir junto — e perder carrinho montado no balcão
 * é pior do que qualquer ganho de "aba compartilhável".
 *
 * O CAIXA AQUI É O `PainelDoCaixa`, e agora é o ÚNICO lugar onde ele aparece.
 *
 * Na Etapa 8 esta aba mostrava o mesmo componente de `/admin/caixa`, e as duas
 * telas conviviam. A consolidação encerrou a convivência: o painel mudou para
 * `@/ui/caixa/`, o histórico de sessões — a única coisa que existia só na rota
 * antiga — veio para cá, e `/admin/caixa` virou redirect. Continua não havendo
 * um segundo sistema de caixa; agora também não há uma segunda tela (§4.3).
 */

type Aba = "receber" | "caixa";

export function AreasDoPdv({
  pedidos,
  falhouAFila,
  formas,
  caixa,
  resumo,
  tentativa,
  podeMovimentar,
  sessoesAnteriores,
  aba,
  aoTrocarAba,
  registrar,
  aoMudar,
}: {
  pedidos: PedidoAReceber[];
  falhouAFila: boolean;
  formas: FormaParaRecebimento[];
  caixa: EstadoDoCaixa;
  resumo: ResumoDeFechamento | null;
  tentativa: string;
  /**
   * `cash.adjust` — reforço e sangria. Só muda o AVISO: os botões continuam
   * onde sempre estiveram, e quem recusa é o servidor. Esconder botão nunca
   * foi segurança (CLAUDE.md §12); o que a tela pode fazer é não deixar o
   * operador descobrir a recusa só depois de contar o dinheiro.
   */
  podeMovimentar: boolean;
  /**
   * Sessões já fechadas, mais recentes primeiro. Vazio esconde o cartão —
   * quem filtra e ordena é o servidor.
   */
  sessoesAnteriores: SessaoHistorica[];
  /**
   * A ABA VEM DE FORA desde a Etapa 9.
   *
   * F4 e F9 trocam de aba, e quem ouve o teclado é o casco — se o estado
   * continuasse aqui, o casco precisaria de um caminho para mexer nele, o que é
   * a mesma coisa com um passo a mais. A aba é do PDV, não desta seção.
   */
  aba: Aba;
  aoTrocarAba: (aba: Aba) => void;
  registrar: (area: AreaComTeclado | null) => void;
  aoMudar: () => void;
}) {

  const abas: { valor: Aba; rotulo: string }[] = [
    { valor: "receber", rotulo: `Pedidos a receber (${pedidos.length})` },
    { valor: "caixa", rotulo: caixa.aberto ? "Caixa" : "Caixa · fechado" },
  ];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Áreas do PDV">
        {abas.map((a) => {
          const ativa = a.valor === aba;
          return (
            <button
              key={a.valor}
              type="button"
              role="tab"
              aria-selected={ativa}
              onClick={() => aoTrocarAba(a.valor)}
              className={[
                "inline-flex min-h-touch-cta shrink-0 cursor-pointer items-center rounded-pill border-[1.5px] px-4",
                "text-[13.5px] font-semibold transition-colors motion-reduce:transition-none",
                ativa
                  ? "border-cta bg-cta text-cta-fg"
                  : "border-border-shalon bg-surface text-ink-2 hover:border-brand-orange",
              ].join(" ")}
            >
              {a.rotulo}
            </button>
          );
        })}
      </div>

      {/* As duas áreas ficam MONTADAS: trocar de aba não pode perder o estado
          de um recebimento pela metade nem uma contagem de fechamento já
          digitada. `hidden` esconde sem desmontar. */}
      <div hidden={aba !== "receber"}>
        <PainelPedidosAReceber
          pedidos={pedidos}
          falhou={falhouAFila}
          formas={formas}
          caixaAberto={caixa.aberto}
          registrar={registrar}
          aoMudar={aoMudar}
        />
      </div>

      <div hidden={aba !== "caixa"} className="flex flex-col gap-3">
        {caixa.aberto && !podeMovimentar ? (
          <p
            role="status"
            className="m-0 rounded-12 border border-twb bg-tw px-3 py-2 text-[13px] font-semibold text-twf"
          >
            Seu acesso não inclui reforço e sangria — o servidor vai recusar essas
            duas. Abrir e fechar o caixa continuam disponíveis.
          </p>
        ) : null}

        <PainelDoCaixa estado={caixa} resumo={resumo} tentativa={tentativa} />

        {/* O histórico fica DEPOIS do painel de propósito: o que o balcão
            precisa primeiro é a sessão de agora. */}
        <SessoesAnteriores sessoes={sessoesAnteriores} />

        <p className="m-0 text-[12.5px] text-muted">
          Entradas, despesas e categorias financeiras ficam em{" "}
          <span className="font-semibold text-ink">Entradas / Despesas</span>.
        </p>
      </div>
    </section>
  );
}
