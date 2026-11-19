"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { carregarClienteRealtime } from "@/infrastructure/supabase/realtimeSobDemanda";
import { exigeAtencao, parado } from "@/domain/pedidos/estados";
import type { PedidoNaFila } from "@/application/pedidos/tipos";
import { CampoDeBuscaDePedidos } from "./CampoDeBuscaDePedidos";
import { CartaoPedido } from "./CartaoPedido";
import { filtrarPedidosPorBusca } from "./buscaDePedidos";
import { TabelaPedidos } from "./TabelaPedidos";
import { GavetaDeCobranca } from "./GavetaDeCobranca";
import { ProvedorDeOperacaoEmVoo } from "@/ui/operacaoEmVoo";
import { useRecargaAgrupada } from "@/ui/hooks/useRecargaAgrupada";
import type { FormaParaRecebimento } from "./Recebimento";
import type { PedidoAReceber } from "@/application/pdv/tipos";

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
 * E é por isso que o cliente vem de `carregarClienteRealtime()`, que carrega
 * o `supabase-js` sob demanda e usa `getSupabaseRealtimeClient()`, que espera
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
type ChaveDoGrupo = "decidir" | "parados" | "andamento";

type GrupoDaFila = {
  chave: ChaveDoGrupo;
  titulo: string;
  legenda: string | null;
  rotulo: string;
  lista: PedidoNaFila[];
};

/**
 * Um filtro da fila, no desenho dos chips de Clientes. "Precisam de você"
 * com pedido ganha a contagem em destaque: é o único grupo que é decisão de
 * agora. O destaque é a cor E o número, nunca só a cor (CLAUDE.md §38).
 */
function ChipDoGrupo({
  ativo,
  aoEscolher,
  quantidade,
  urgente = false,
  children,
}: {
  ativo: boolean;
  aoEscolher: () => void;
  quantidade: number;
  urgente?: boolean;
  children: React.ReactNode;
}) {
  const destacar = urgente && quantidade > 0 && !ativo;
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={aoEscolher}
      className={[
        "motion-interactive inline-flex min-h-touch shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-11 px-3 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-orange",
        ativo
          ? "border-[1.5px] border-transparent bg-cta text-cta-fg"
          : "border-[1.5px] border-border-shalon bg-surface text-ink hover:border-brand-orange",
      ].join(" ")}
    >
      {children}
      <span
        className={[
          "min-w-[22px] rounded-pill px-[7px] py-[1px] text-center text-[12px] font-bold tabular-nums",
          ativo ? "bg-cta-fg/20 text-cta-fg" : destacar ? "bg-td text-tdf" : "bg-elev text-ink-2",
        ].join(" ")}
      >
        {quantidade}
      </span>
    </button>
  );
}

/** Janela de agrupamento dos eventos de `orders` (D-2026-09-29-89). */
const AGRUPAR_MS = 1000;

export function CentralDePedidos({
  pedidos,
  hora,
  espera,
  cobraveis,
  formasDeRecebimento,
  caixaAberto,
  podeReceber,
  podeFiado = false,
  filtro = null,
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
  podeFiado?: boolean;
  /**
   * Veio de um link do dashboard (`?status=…`): `pedidos` já chega recortado e
   * isto só conta isso à pessoa, com a saída para a fila inteira.
   */
  filtro?: { rotulo: string } | null;
}) {
  const router = useRouter();
  const [conectado, setConectado] = useState(false);
  /**
   * Filtro e busca são estado de TELA, e não de URL (D-2026-11-19-188): a
   * fila recarrega por Realtime várias vezes por minuto, e `router.refresh()`
   * preserva este estado; ir parar na URL faria cada tecla virar navegação.
   */
  const [grupoAtivo, setGrupoAtivo] = useState<ChaveDoGrupo | "todos">("todos");
  const [busca, setBusca] = useState("");
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
   * QUANDO RECARREGAR — o mesmo núcleo do PDV (`useRecargaAgrupada`).
   *
   * Cada refresh desta tela reexecuta a página inteira. Antes, cada evento de
   * `orders` disparava um na hora: um pedido que muda de status três vezes em
   * poucos segundos pagava três vezes, e a aba escondida recarregava para
   * ninguém ver. Agora os eventos de uma janela de 1 s viram um refresh só, a
   * aba oculta represa o refresh até voltar, e a gaveta de cobrança aberta
   * continua segurando o refresh até o dinheiro terminar de ser registrado.
   *
   * Isto é conforto de interface, nunca autoridade: a garantia contra cobrança
   * dupla continua inteira no banco (`for update` + recusa com `ja_pago`).
   */
  const { agendar, aoMudarOperacoes } = useRecargaAgrupada(AGRUPAR_MS);

  useEffect(() => {
    let vivo = true;
    let cliente: SupabaseClient | null = null;
    let canal: RealtimeChannel | null = null;
    /** Já esteve ligado uma vez: um novo SUBSCRIBED é reconexão. */
    let jaLigou = false;

    void carregarClienteRealtime().then((supabase) => {
      if (!vivo) return;
      cliente = supabase;

      canal = supabase
        .channel("central-pedidos")
        // O evento avisa; quem informa é o servidor.
        .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, agendar)
        .subscribe((estado) => {
          if (!vivo) return;
          const ligado = estado === "SUBSCRIBED";
          setConectado(ligado);
          // O Realtime não reenvia o que aconteceu enquanto a conexão estava
          // caída, o que é comum no celular com a tela apagada. Ao religar,
          // relê a fila para não seguir mostrando a de antes da queda.
          if (ligado && jaLigou) agendar();
          if (ligado) jaLigou = true;
        });
    });

    return () => {
      vivo = false;
      if (canal !== null) void cliente?.removeChannel(canal);
    };
  }, [agendar]);

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

  /*
   * TRÊS GRUPOS, e não dois. O dashboard chama de "atenção" seis filas; a fila
   * só destacava três, e o resto (pronto esperando, entrega que falhou,
   * alteração aguardando o cliente) sumia no meio do que está em produção.
   *
   *  - Precisam de você: alguém da equipe tem que decidir agora;
   *  - Parados: o pedido espera alguém de fora ou deu errado — não é decisão
   *    imediata, mas é o que o balcão não pode esquecer;
   *  - Em andamento: o que segue o fluxo normal.
   *
   * Cada pedido cai em exatamente um (testado em estadosDoPedido.test.ts).
   */
  const encontrados = filtrarPedidosPorBusca(pedidos, busca);
  const todosOsGrupos: GrupoDaFila[] = [
    {
      chave: "decidir",
      titulo: "Precisam de você",
      legenda: null,
      rotulo: "Pedidos que precisam de decisão, do que espera há mais tempo para o mais recente",
      lista: encontrados.filter((p) => exigeAtencao(p.status)).sort(porIdade),
    },
    {
      chave: "parados",
      titulo: "Parados",
      legenda:
        "Prontos esperando o cliente ou o motoboy, entregas que falharam e alterações aguardando resposta do cliente.",
      rotulo: "Pedidos parados, do que espera há mais tempo para o mais recente",
      lista: encontrados.filter((p) => parado(p.status)).sort(porIdade),
    },
    {
      chave: "andamento",
      titulo: "Em andamento",
      legenda: null,
      rotulo: "Pedidos em andamento, do que espera há mais tempo para o mais recente",
      lista: encontrados.filter((p) => !exigeAtencao(p.status) && !parado(p.status)).sort(porIdade),
    },
  ];
  // "Todos" mostra os grupos com pedido; um filtro mostra só o escolhido.
  const grupos =
    grupoAtivo === "todos"
      ? todosOsGrupos.filter((g) => g.lista.length > 0)
      : todosOsGrupos.filter((g) => g.chave === grupoAtivo);
  const grupoEscolhido = todosOsGrupos.find((g) => g.chave === grupoAtivo) ?? null;
  const termo = busca.trim();

  return (
    <ProvedorDeOperacaoEmVoo aoMudar={aoMudarOperacoes}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="m-0 text-[13px] text-muted">
            {conectado
              ? "Atualizando em tempo real."
              : "Reconectando… a lista pode estar alguns segundos atrasada."}
          </p>

        </div>

        {filtro ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-12 border border-twb bg-tw px-3 py-2 text-[13.5px] text-twf">
            <span>
              Mostrando só: <strong>{filtro.rotulo}</strong>
            </span>
            <Link href="/admin/pedidos?aba=abertos" className="min-h-touch inline-flex items-center font-semibold text-twf underline">
              Ver todos os pedidos em aberto
            </Link>
          </div>
        ) : null}

        {pedidos.length === 0 ? (
          <div className="rounded-18 border border-dashed border-border-shalon bg-elev px-5 py-[44px] text-center">
            <p className="m-0 font-display text-[19px] font-bold text-ink">
              {filtro ? "Nenhum pedido nesse estado agora" : "Nenhum pedido em aberto"}
            </p>
            <p className="m-0 mt-1 text-[14px] text-ink-2">
              {filtro
                ? "Quando algum chegar a esse estado, ele aparece aqui."
                : "Os pedidos aparecem aqui assim que chegam."}
            </p>
          </div>
        ) : null}

        {pedidos.length > 0 ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* FILTROS COM CONTAGEM (D-2026-11-19-188). No celular os grupos
                ficam um embaixo do outro, e achar "Parados" era rolar a fila
                inteira. A contagem já responde "tem algo para mim?" sem
                abrir nada. Rolam de lado em vez de quebrar linha, para a
                fila começar sempre na mesma altura. */}
            <div
              role="group"
              aria-label="Mostrar pedidos"
              className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]"
            >
              <ChipDoGrupo
                ativo={grupoAtivo === "todos"}
                aoEscolher={() => setGrupoAtivo("todos")}
                quantidade={encontrados.length}
              >
                Todos
              </ChipDoGrupo>
              {todosOsGrupos.map((g) => (
                <ChipDoGrupo
                  key={g.chave}
                  ativo={grupoAtivo === g.chave}
                  aoEscolher={() => setGrupoAtivo(g.chave)}
                  quantidade={g.lista.length}
                  urgente={g.chave === "decidir"}
                >
                  {g.titulo}
                </ChipDoGrupo>
              ))}
            </div>
            <CampoDeBuscaDePedidos id="busca-fila" valor={busca} aoMudar={setBusca} />
          </div>
        ) : null}

        {pedidos.length > 0 && grupos.every((g) => g.lista.length === 0) ? (
          <div className="rounded-18 border border-dashed border-border-shalon bg-elev px-5 py-[44px] text-center">
            <p className="m-0 font-display text-[19px] font-bold text-ink">
              {termo
                ? `Nenhum pedido com “${termo}”`
                : `Nenhum pedido em “${grupoEscolhido?.titulo ?? ""}” agora`}
            </p>
            <p className="m-0 mt-1 text-[14px] text-ink-2">
              {termo
                ? "Confira o número ou tente parte do nome do cliente."
                : "Quando algum chegar aqui, ele aparece na hora."}
            </p>
            <button
              type="button"
              onClick={() => (termo ? setBusca("") : setGrupoAtivo("todos"))}
              className="mt-3 inline-flex min-h-touch cursor-pointer items-center rounded-11 border-[1.5px] border-border-shalon bg-surface px-[14px] text-[13.5px] font-semibold text-ink hover:border-brand-orange"
            >
              {termo ? "Limpar busca" : "Ver todos"}
            </button>
          </div>
        ) : null}

        {grupos.filter((g) => g.lista.length > 0).map((g) => (
          <section key={g.chave} aria-labelledby={`grupo-${g.chave}`}>
            <h2
              id={`grupo-${g.chave}`}
              className="m-0 mb-2 text-[14px] font-bold uppercase tracking-wide text-ink-2"
            >
              {g.titulo} ({g.lista.length})
            </h2>
            {g.legenda ? <p className="m-0 mb-2 text-[13px] text-muted">{g.legenda}</p> : null}
            <TabelaPedidos
              pedidos={g.lista}
              hora={hora}
              espera={espera}
              modo="aberto"
              rotulo={g.rotulo}
              cobraveis={cobraveis}
              podeReceber={podeReceber}
              aoCobrar={abrirCobranca}
            />
            {/* Abaixo de `lg` o cartão volta: nove colunas num celular seria
              trocar o §38 por conveniência de desktop. */}
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(320px,1fr))] lg:hidden">
              {g.lista.map((p) => (
                <CartaoPedido
                  key={p.id}
                  pedido={p}
                  hora={hora[p.id] ?? ""}
                  espera={espera[p.id] ?? ""}
                  // Na rua, o pagamento é lançado na volta do motoboy.
                  cobravel={podeReceber && !p.motoboy ? (cobraveis[p.id] ?? null) : null}
                  aoCobrar={abrirCobranca}
                />
              ))}
            </div>
          </section>
        ))}

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
          podeFiado={podeFiado}
          aoFechar={() => setCobrando(null)}
          aoConcluir={() => {
            setCobrando(null);
            // A fila é dado de servidor: quem a atualiza é o servidor. Na hora,
            // sem a janela de agrupamento: é a resposta à ação do próprio
            // operador, que está olhando para a linha que acabou de receber.
            router.refresh();
          }}
        />
      </div>
    </ProvedorDeOperacaoEmVoo>
  );
}
