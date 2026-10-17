import { rotuloDeModalidade, rotuloDeOrigem } from "@/domain/pedidos/estados";

/**
 * Canal do pedido com ícone (17/10/2026): de onde veio (Balcão, WhatsApp,
 * Telefone, iFood, Link Shalon, Outro) e como o cliente recebe (Entrega,
 * Retirada). Mesma ideia das bandeiras: miniaturas desenhadas aqui em SVG,
 * sem arquivo nem requisição, para reconhecer de relance. Não são os
 * arquivos oficiais das marcas. O texto continua ao lado (CLAUDE.md §38).
 */

type Icone = () => React.ReactElement;

function Quadro({ fundo, children }: { fundo: string; children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="size-[18px] shrink-0">
      <rect width="20" height="20" rx="5" fill={fundo} />
      {children}
    </svg>
  );
}

const ORIGENS: Record<string, Icone> = {
  whatsapp: () => (
    <Quadro fundo="#25d366">
      {/* Balão com rabicho e o fone dentro. */}
      <path
        d="M10 3.6a6.3 6.3 0 0 0-5.4 9.6L3.8 16.4l3.3-.8A6.3 6.3 0 1 0 10 3.6Z"
        fill="none"
        stroke="#fff"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M7.7 7.2c.2-.4.5-.4.7-.4h.4c.1 0 .3 0 .4.3l.5 1.2c0 .2 0 .3-.1.4l-.4.5c.4.8 1 1.4 1.9 1.8l.5-.5c.1-.1.3-.2.4-.1l1.2.6c.2.1.2.2.2.4 0 .5-.4 1.1-1 1.2-.6.1-1.6-.1-2.9-1.1-1.2-1-1.8-2.1-1.9-2.7-.1-.6.1-1.2.1-1.6Z"
        fill="#fff"
      />
    </Quadro>
  ),
  phone: () => (
    <Quadro fundo="#2f6fb0">
      <path
        d="M6.6 4.5c.3-.3.8-.3 1.1 0l1.4 1.8c.3.3.2.8-.1 1.1l-.9.8c.7 1.5 1.8 2.6 3.3 3.3l.8-.9c.3-.3.8-.4 1.1-.1l1.8 1.4c.3.3.3.8 0 1.1l-1 1c-.6.6-1.5.8-2.3.5C8.9 13.3 6.7 11.1 5.5 8.2c-.3-.8-.1-1.7.5-2.3Z"
        fill="#fff"
      />
    </Quadro>
  ),
  counter: () => (
    <Quadro fundo="#7a5c3e">
      {/* Fachada com toldo: o balcão da loja. */}
      <path d="M4 5.5h12l-1 3H5Z" fill="#fff" />
      <path d="M5 9.5h10V15H5Z" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M8.5 15v-3h3v3" fill="none" stroke="#fff" strokeWidth="1.4" />
    </Quadro>
  ),
  ifood: () => (
    <Quadro fundo="#ea1d2c">
      <text
        x="10"
        y="13.4"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="8.4"
        fontWeight="800"
        fontStyle="italic"
        fill="#fff"
      >
        iF
      </text>
    </Quadro>
  ),
  shalon_link: () => (
    <Quadro fundo="#c8371f">
      {/* Elos de corrente: o link da Shalon. */}
      <path
        d="M8.6 11.4 11.4 8.6M9.4 6.6l1-1a2.8 2.8 0 0 1 4 4l-1 1M10.6 13.4l-1 1a2.8 2.8 0 0 1-4-4l1-1"
        fill="none"
        stroke="#fff"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </Quadro>
  ),
  other: () => (
    <Quadro fundo="#8a7f74">
      <circle cx="6" cy="10" r="1.4" fill="#fff" />
      <circle cx="10" cy="10" r="1.4" fill="#fff" />
      <circle cx="14" cy="10" r="1.4" fill="#fff" />
    </Quadro>
  ),
};

/** Modalidade em traço, na cor do texto: não compete com o ícone da origem. */
const MODALIDADES: Record<string, Icone> = {
  delivery: () => (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="size-[16px] shrink-0">
      {/* Moto. */}
      <circle cx="5" cy="13.5" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="15" cy="13.5" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M5 13.5h4.5l2.5-5h2l1 5M12 8.5h-2.5M13.5 6h1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  pickup: () => (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="size-[16px] shrink-0">
      {/* Sacola. */}
      <path
        d="M4.5 7h11l-.8 9h-9.4ZM7.5 7V5.8a2.5 2.5 0 0 1 5 0V7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  ),
};

export function IconeDeOrigem({ origem }: { origem: string }) {
  const Icone = ORIGENS[origem] ?? ORIGENS["other"]!;
  return <Icone />;
}

export function CanalDoPedido({
  origem,
  modalidade,
  className = "",
}: {
  origem: string;
  modalidade: string;
  className?: string;
}) {
  const Modalidade = MODALIDADES[modalidade];
  return (
    <span className={`inline-flex min-w-0 items-center gap-[6px] ${className}`}>
      <IconeDeOrigem origem={origem} />
      <span className="truncate">{rotuloDeOrigem(origem)}</span>
      <span className="text-muted" aria-hidden="true">
        ·
      </span>
      {Modalidade ? <Modalidade /> : null}
      <span className="truncate">{rotuloDeModalidade(modalidade)}</span>
    </span>
  );
}
