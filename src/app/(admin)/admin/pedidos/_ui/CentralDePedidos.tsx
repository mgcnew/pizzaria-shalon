"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseRealtimeClient } from "@/infrastructure/supabase/client";
import { exigeAtencao } from "@/domain/pedidos/estados";
import type { PedidoNaFila } from "@/application/pedidos/tipos";
import { CartaoPedido } from "./CartaoPedido";
import { TabelaPedidos } from "./TabelaPedidos";
import { GavetaDeCobranca } from "./GavetaDeCobranca";
import { ProvedorDeOperacaoEmVoo } from "@/ui/operacaoEmVoo";
import type { FormaParaRecebimento } from "./Recebimento";
import type { PedidoAReceber } from "@/application/pdv/tipos";
import { ativarSom, somAtivo, tocarAlerta } from "./AlertaSonoro";

/**
 * Central de pedidos.
 *
 * ATUALIZAÇÃO. Assina as mudanças de `orders` por Realtime — o caso que
 * CLAUDE.md §40 cita como o de valor operacional claro. Não é polling: a
 * cozinha não pode depender de alguém lembrar de atualizar a página.
 *
 * A assinatura NÃO é uma porta lateral: o Realtime respeita o RLS, e a
 * policy de `orders` exige `orders.view`. Quem não pode ver, não recebe.
 *
 * E é por isso que o cliente vem de `getSupabaseRealtimeClient()`, que espera
 * a sessão antes de entrar no canal. Até a Etapa 10 esta tela entrava com a
 * chave `anon`, registrava a assinatura como `anon` — que não tem policy de
 * leitura em `orders` — e **nunca recebeu um evento**, anunciando "Atualizando
 * em tempo real" o tempo todo. Correção compartilhada em `client.ts`; aqui não
 * há mecanismo próprio nenhum.
 *
 * A mensagem do Realtime serve só como GATILHO: ela diz "mudou", e a página
 * recarrega os dados pelo caminho normal, com as mesmas projeções e o mesmo
 * RLS. Nada da carga útil do evento é exibido direto, porque ela traz a
 * linha crua — incluindo o telefone completo do cliente.
 */
export function CentralDePedidos({
  pedidos,
  hora,
  espera,
  cobraveis,
  formasDeRecebimento,
  caixaAberto,
  podeReceber,
}: {
  pedidos: PedidoNaFila[];
  /** Horários já formatados no servidor, no fuso da loja. */
  hora: Record<string, string>;
  /** Espera calculada no servidor, por id. */
  espera: Record<string, string>;
  /** Quem ainda deve, por id — de `pedidos_a_receber()`. */
  cobraveis: Record<string, PedidoAReceber>;
  formasDeRecebimento: FormaParaRecebimento[];
  caixaAberto: boolean;
  podeReceber: boolean;
}) {
  const router = useRouter();
  const [comSom, setComSom] = useState(false);
  const [conectado, setConectado] = useState(false);
  /**
   * O pedido em cobrança e a chave da tentativa, criados JUNTOS no clique.
   *
   * A chave nasce no evento — nunca no render — e é a mesma do começo ao fim
   * da cobrança: é ela que faz clique duplo e retry de rede devolverem o
   * pagamento que já existe. Mesmo padrão do `abrirCobranca()` do PDV.
   */
  const [cobrando, setCobrando] = useState<{
    pedido: PedidoAReceber;
    tentativa: string;
  } | null>(null);

  const abrirCobranca = useCallback((pedido: PedidoAReceber) => {
    setCobrando({ pedido, tentativa: crypto.randomUUID() });
  }, []);

  /**
   * O REFRESH ESPERA O DINHEIRO — mesma guarda da Etapa 10 no PDV.
   *
   * Esta tela recarrega a cada evento de `orders`. Com a gaveta de cobrança
   * aberta, um refresh no meio do envio trocaria as props e desmontaria o
   * painel levando junto as linhas de divisão já digitadas. Enquanto houver
   * operação em voo o refresh fica PENDENTE, e é aplicado assim que terminar.
   *
   * Isto é conforto de interface, nunca autoridade: a garantia contra cobrança
   * dupla continua inteira no banco (`for update` + recusa com `ja_pago`), e
   * continuaria valendo se estas linhas não existissem.
   */
  const emVoo = useRef(0);
  const pendente = useRef(false);

  const atualizar = useCallback(() => {
    if (emVoo.current > 0) {
      pendente.current = true;
      return;
    }
    pendente.current = false;
    router.refresh();
  }, [router]);

  const aoMudarOperacoes = useCallback(
    (quantas: number) => {
      emVoo.current = quantas;
      if (quantas === 0 && pendente.current) atualizar();
    },
    [atualizar],
  );

  // Quais pedidos já estavam aqui: o alerta é para o que CHEGA, não para o
  // que já estava na tela quando ela abriu.
  const conhecidos = useRef<Set<string>>(new Set(pedidos.map((p) => p.id)));

  useEffect(() => {
    let vivo = true;
    let cliente: SupabaseClient | null = null;
    let canal: RealtimeChannel | null = null;

    void getSupabaseRealtimeClient().then((supabase) => {
      if (!vivo) return;
      cliente = supabase;

      canal = supabase
        .channel("central-pedidos")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "orders" },
          (evento) => {
            const linha = evento.new as { id?: string; status?: string } | null;
            const novo =
              evento.eventType === "INSERT" &&
              typeof linha?.id === "string" &&
              !conhecidos.current.has(linha.id);

            if (novo && linha?.id) {
              conhecidos.current.add(linha.id);
              if (
                typeof linha.status === "string" &&
                exigeAtencao(linha.status)
              ) {
                tocarAlerta();
              }
            }
            // Recarrega pelo caminho normal. O evento avisa; quem informa é o
            // servidor — e o guarda decide a HORA, nunca o quê.
            atualizar();
          },
        )
        .subscribe((estado) => {
          if (vivo) setConectado(estado === "SUBSCRIBED");
        });
    });

    return () => {
      vivo = false;
      if (canal !== null) void cliente?.removeChannel(canal);
    };
  }, [atualizar]);

  /*
   * MAIS ANTIGO EM CIMA — e é o contrário do que a RPC devolve.
   *
   * `fila_de_pedidos` ordena `criado_em desc`, que é o certo para a aba
   * *Encerrados* (consulta: quero ver o que acabou de acontecer) e o errado
   * para a operação, por duas razões:
   *
   *  1. o pedido mais antigo é o que está mais perto de atrasar e de o cliente
   *     reclamar. Com o mais novo em cima ele afunda para o fim da lista, que
   *     é onde se para de olhar: o item mais urgente no lugar menos visível;
   *
   *  2. a linha não pode fugir do cursor. Com o mais novo em cima, cada pedido
   *     que chega empurra TODAS as linhas uma para baixo — e quem estiver
   *     clicando numa ação vê o alvo se mexer. Crescente, o pedido novo entra
   *     no fim e nada do que já estava se move.
   *
   * Ordenar aqui, e não na RPC, é deliberado: isto é ordem de APRESENTAÇÃO,
   * não autoridade. `fila_de_pedidos` não tem `limit`, então a lista chega
   * inteira e inverter no cliente é exato — não é a inversão de uma janela.
   * E sem migration: nenhuma regra do banco muda por causa de layout.
   *
   * Cópia antes de ordenar: `sort` muda o array no lugar, e este veio de props.
   */
  const porIdade = (a: PedidoNaFila, b: PedidoNaFila) =>
    new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime();

  const aguardando = pedidos
    .filter((p) => exigeAtencao(p.status))
    .sort(porIdade);
  const andamento = pedidos
    .filter((p) => !exigeAtencao(p.status))
    .sort(porIdade);

  return (
    <ProvedorDeOperacaoEmVoo aoMudar={aoMudarOperacoes}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="m-0 text-[13px] text-muted">
            {conectado
              ? "Atualizando em tempo real."
              : "Reconectando… a lista pode estar alguns segundos atrasada."}
          </p>

          {/* O navegador exige um gesto antes de tocar qualquer som. Enquanto
            ele não vier, a tela diz a verdade: o som está desligado. */}
          <button
            type="button"
            onClick={() => setComSom(ativarSom() && somAtivo())}
            className="min-h-touch cursor-pointer rounded-11 border-[1.5px] border-border-shalon bg-surface px-[14px] text-[13px] font-semibold text-ink"
          >
            {comSom ? "Som ligado" : "Ativar som de pedido novo"}
          </button>
        </div>

        {pedidos.length === 0 ? (
          <div className="rounded-18 border border-dashed border-border-shalon bg-elev px-5 py-[44px] text-center">
            <p className="m-0 font-display text-[19px] font-bold text-ink">
              Nenhum pedido em aberto
            </p>
            <p className="m-0 mt-1 text-[14px] text-ink-2">
              Os pedidos aparecem aqui assim que chegam.
            </p>
          </div>
        ) : null}

        {aguardando.length > 0 ? (
          <section>
            <h2 className="m-0 mb-2 text-[14px] font-bold uppercase tracking-wide text-ink-2">
              Precisam de você ({aguardando.length})
            </h2>
            <TabelaPedidos
              pedidos={aguardando}
              hora={hora}
              espera={espera}
              modo="aberto"
              rotulo="Pedidos que precisam de decisão, do que espera há mais tempo para o mais recente"
              cobraveis={cobraveis}
              podeReceber={podeReceber}
              aoCobrar={abrirCobranca}
            />
            {/* Abaixo de `lg` o cartão volta: nove colunas num celular seria
              trocar o §38 por conveniência de desktop. */}
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))] lg:hidden">
              {aguardando.map((p) => (
                <CartaoPedido
                  key={p.id}
                  pedido={p}
                  hora={hora[p.id] ?? ""}
                  espera={espera[p.id] ?? ""}
                  cobravel={podeReceber ? (cobraveis[p.id] ?? null) : null}
                  aoCobrar={abrirCobranca}
                />
              ))}
            </div>
          </section>
        ) : null}

        {andamento.length > 0 ? (
          <section>
            <h2 className="m-0 mb-2 text-[14px] font-bold uppercase tracking-wide text-ink-2">
              Em andamento ({andamento.length})
            </h2>
            <TabelaPedidos
              pedidos={andamento}
              hora={hora}
              espera={espera}
              modo="aberto"
              rotulo="Pedidos em andamento, do que espera há mais tempo para o mais recente"
              cobraveis={cobraveis}
              podeReceber={podeReceber}
              aoCobrar={abrirCobranca}
            />
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))] lg:hidden">
              {andamento.map((p) => (
                <CartaoPedido
                  key={p.id}
                  pedido={p}
                  hora={hora[p.id] ?? ""}
                  espera={espera[p.id] ?? ""}
                  cobravel={podeReceber ? (cobraveis[p.id] ?? null) : null}
                  aoCobrar={abrirCobranca}
                />
              ))}
            </div>
          </section>
        ) : null}

        {/*
         * A GAVETA VIVE FORA DAS LINHAS, e isso é deliberado: montada dentro da
         * `<tr>`, ela desmontaria junto com o pedido que saísse da fila — que é
         * exatamente o instante em que o operador mais precisa ler o que
         * aconteceu.
         *
         * Por isso recebe o pedido do ESTADO, e não da lista: a cobrança segue
         * aberta mesmo quando `cobraveis` deixa de trazê-lo, e a própria gaveta
         * mostra "Pago em outro terminal" em vez de sumir.
         */}
        <GavetaDeCobranca
          key={cobrando?.pedido.id ?? "fechada"}
          pedido={cobrando?.pedido ?? null}
          tentativa={cobrando?.tentativa ?? null}
          formas={formasDeRecebimento}
          caixaAberto={caixaAberto}
          aoFechar={() => setCobrando(null)}
          aoConcluir={() => {
            setCobrando(null);
            // A fila é dado de servidor: quem a atualiza é o servidor.
            atualizar();
          }}
        />
      </div>
    </ProvedorDeOperacaoEmVoo>
  );
}
