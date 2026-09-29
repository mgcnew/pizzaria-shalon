import type { ReactNode } from "react";
import { Skeleton } from "@/ui/patterns";

/**
 * Peças dos skeletons de rota do administrativo (`loading.tsx`).
 *
 * Cada tela monta o seu com estas peças, no formato real dela: mesmo
 * cabeçalho, mesma grade, mesmas molduras. Assim a troca do skeleton pela
 * página não empurra nada de lugar. O título é texto de verdade, porque é o
 * único conteúdo conhecido antes do servidor responder, e confirma ao operador
 * que o clique levou ao lugar certo.
 *
 * Só usa o `Skeleton` do design (fundo --shalon-tn, animação shalonPulse) e o
 * fade curto de troca de aba (07 §3). Nada aqui busca dado: o arquivo precisa
 * sair do servidor na hora, é o que o Next pré-carrega para cada link do menu.
 */

/** Atraso escalonado do pulso, como na vitrine do design, com teto baixo. */
const passo = (indice: number) => Math.min(indice, 8) * 0.04;

/** Larguras que variam sem sortear: o skeleton é igual em toda renderização. */
const LARGURAS = ["w-[72%]", "w-[58%]", "w-[84%]", "w-[46%]", "w-[66%]", "w-[78%]", "w-[52%]"];
const largura = (indice: number) => LARGURAS[indice % LARGURAS.length];

export function TelaCarregando({
  nome,
  className = "flex flex-col gap-5",
  children,
}: {
  /** Completa "Carregando …" para leitor de tela. */
  nome: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role="status" aria-live="polite" className={`motion-tab-in ${className}`}>
      <span className="sr-only">Carregando {nome}</span>
      {children}
    </div>
  );
}

export function CabecalhoCarregando({
  titulo,
  como = "h1",
  classeTitulo = "text-[24px] font-bold",
  subtitulo = 1,
  acoes,
  reserva = "min-w-[min(100%,260px)]",
  className = "flex flex-wrap items-end justify-between gap-3",
}: {
  /** Omitido quando o título depende do dado (ex.: "Pedido #123"). */
  titulo?: string;
  como?: "h1" | "h2";
  classeTitulo?: string;
  /** Quantas linhas de subtítulo reservar. */
  subtitulo?: 0 | 1 | 2;
  acoes?: ReactNode;
  /**
   * Largura mínima do bloco de título e subtítulo, a do texto real. Sem ela,
   * as barras vazias não ocupam nada, e as ações ficariam ao lado do título
   * no celular. Na página, elas descem para a linha de baixo, e o conteúdo
   * pularia de lugar ao chegar.
   */
  reserva?: string;
  className?: string;
}) {
  const Titulo = como;
  return (
    <header className={className}>
      <div className={`flex-1 ${reserva}`}>
        {titulo ? (
          <Titulo className={`m-0 font-display text-ink ${classeTitulo}`}>{titulo}</Titulo>
        ) : (
          <Skeleton className="my-1 h-7 w-[min(240px,70%)]" />
        )}
        {subtitulo >= 1 ? <Skeleton className="mt-[7px] h-[14px] w-[min(440px,88%)]" delay={0.04} /> : null}
        {subtitulo >= 2 ? <Skeleton className="mt-[7px] h-[14px] w-[min(300px,62%)]" delay={0.08} /> : null}
      </div>
      {acoes}
    </header>
  );
}

/** Botão do cabeçalho (novo pedido, novo produto, mais). */
export function BotaoCarregando({ className = "w-[124px]" }: { className?: string }) {
  return <Skeleton className={`h-11 shrink-0 rounded-11 ${className}`} delay={0.06} />;
}

const LARGURAS_DE_PILULA = ["w-[88px]", "w-[112px]", "w-[96px]", "w-[104px]", "w-[80px]", "w-[118px]"];

/**
 * Fileira de pílulas: `aba` (Abas do design, 42px, raio total) ou `chip`
 * (período e filtros, 44px, raio 11).
 */
export function PilulasCarregando({
  quantidade,
  forma = "aba",
  className = "flex gap-2 overflow-hidden pb-1",
}: {
  quantidade: number;
  forma?: "aba" | "chip";
  className?: string;
}) {
  const moldura = forma === "aba" ? "h-[42px] rounded-pill" : "h-11 rounded-11";
  return (
    <div className={className}>
      {Array.from({ length: quantidade }, (_, i) => (
        <Skeleton
          key={i}
          className={`${moldura} shrink-0 ${LARGURAS_DE_PILULA[i % LARGURAS_DE_PILULA.length]}`}
          delay={passo(i)}
        />
      ))}
    </div>
  );
}

/** A moldura do `Cartao` do design: superfície, borda de 1px, raio 16, p-4. */
export function CartaoCarregando({
  titulo = true,
  descricao = false,
  className = "",
  children,
}: {
  titulo?: boolean;
  descricao?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <section className={`rounded-16 border border-border-shalon bg-surface p-4 ${className}`}>
      {titulo ? (
        <div className="mb-4">
          <Skeleton className="h-4 w-[min(220px,60%)]" />
          {descricao ? <Skeleton className="mt-2 h-3 w-[min(340px,80%)]" delay={0.04} /> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Linhas rótulo/valor com separador, como `LinhaLista` e `ParDeDados`. */
export function LinhasCarregando({
  quantidade,
  valor = true,
}: {
  quantidade: number;
  valor?: boolean;
}) {
  return (
    <div className="flex flex-col">
      {Array.from({ length: quantidade }, (_, i) => (
        <div
          key={i}
          className="flex items-center justify-between gap-3 border-b border-border-shalon py-[11px] last:border-b-0"
        >
          <Skeleton className={`h-[13px] ${largura(i)} max-w-[320px]`} delay={passo(i)} />
          {valor ? <Skeleton className="h-[13px] w-16 shrink-0" delay={passo(i) + 0.02} /> : null}
        </div>
      ))}
    </div>
  );
}

/** Itens em bloco, como as filas da Central de Atenção e as corridas. */
export function BlocosCarregando({
  quantidade,
  className = "h-[62px] rounded-12",
}: {
  quantidade: number;
  className?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: quantidade }, (_, i) => (
        <Skeleton key={i} className={`w-full ${className}`} delay={passo(i)} />
      ))}
    </div>
  );
}

/** Tabela: cabeçalho discreto e linhas com a primeira coluna mais larga. */
export function TabelaCarregando({
  linhas,
  colunas,
  moldura = true,
  className = "",
}: {
  linhas: number;
  colunas: number;
  /** `false` dentro de um `CartaoCarregando`, que já é a moldura. */
  moldura?: boolean;
  className?: string;
}) {
  const grade = { gridTemplateColumns: `minmax(0,2fr) repeat(${colunas - 1}, minmax(0,1fr))` };
  const recuo = moldura ? "px-4" : "";
  return (
    <div
      className={[
        "overflow-hidden",
        moldura ? "rounded-16 border border-border-shalon bg-surface" : "",
        className,
      ].join(" ")}
    >
      <div
        className={`grid gap-4 border-b border-border-shalon py-3 ${moldura ? "bg-elev" : ""} ${recuo}`}
        style={grade}
      >
        {Array.from({ length: colunas }, (_, c) => (
          <Skeleton key={c} className="h-3 w-[60%]" delay={passo(c)} />
        ))}
      </div>
      {Array.from({ length: linhas }, (_, l) => (
        <div
          key={l}
          className={`grid items-center gap-4 border-b border-border-shalon py-[15px] last:border-b-0 ${recuo}`}
          style={grade}
        >
          {Array.from({ length: colunas }, (_, c) => (
            <Skeleton
              key={c}
              className={`h-[13px] ${c === 0 ? largura(l) : "w-[70%]"}`}
              delay={passo(l + c)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Blocos de número: rótulo curto em caixa alta e o valor grande. */
export function IndicadoresCarregando({
  quantidade,
  className,
  compacto = false,
}: {
  quantidade: number;
  /** Classes da grade, as mesmas da página. */
  className: string;
  /** `p-3` (Clientes, Remarketing) em vez do `p-4` do Indicador do painel. */
  compacto?: boolean;
}) {
  return (
    <section className={className}>
      {Array.from({ length: quantidade }, (_, i) => (
        <div
          key={i}
          className={`rounded-16 border border-border-shalon bg-surface ${compacto ? "p-3" : "p-4"}`}
        >
          <Skeleton className="h-3 w-[64%]" delay={passo(i)} />
          <Skeleton className="mt-3 h-6 w-[46%]" delay={passo(i) + 0.04} />
        </div>
      ))}
    </section>
  );
}

/** Campo de formulário: rótulo e caixa de 48px. */
export function CamposCarregando({ quantidade }: { quantidade: number }) {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: quantidade }, (_, i) => (
        <div key={i}>
          <Skeleton className="h-3 w-28" delay={passo(i)} />
          <Skeleton className="mt-2 h-12 w-full rounded-12" delay={passo(i) + 0.02} />
        </div>
      ))}
    </div>
  );
}
