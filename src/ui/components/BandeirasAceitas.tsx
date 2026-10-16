/**
 * Bandeiras aceitas, como LEGENDA (15/10/2026).
 *
 * A pessoa escolhe a FORMA (débito, crédito, voucher, Pix) e vê aqui quais
 * bandeiras a maquininha passa — para saber se o cartão dela serve, sem ter
 * que escolher nem informar nada. A bandeira não é registrada na venda.
 *
 * MINIATURAS: cada bandeira conhecida aparece com uma marca simplificada,
 * desenhada aqui em SVG (sem arquivo para baixar, sem requisição extra). São
 * representações para reconhecimento rápido, não os arquivos oficiais das
 * marcas. Bandeira que não está no mapa aparece como texto. O nome sempre
 * está disponível para leitor de tela e como dica.
 */

type Marca = (props: { className?: string }) => React.ReactElement;

const QUADRO = "0 0 48 30";

function Moldura({ children, fundo = "#fff" }: { children: React.ReactNode; fundo?: string }) {
  return (
    <svg viewBox={QUADRO} aria-hidden="true" className="h-[30px] w-[48px]">
      <rect x="0.5" y="0.5" width="47" height="29" rx="5" fill={fundo} stroke="rgb(0 0 0 / 0.14)" />
      {children}
    </svg>
  );
}

const FONTE = "Arial, Helvetica, sans-serif";

const MARCAS: Record<string, Marca> = {
  visa: () => (
    <Moldura>
      <text x="24" y="20" textAnchor="middle" fontFamily={FONTE} fontSize="14" fontWeight="800" fontStyle="italic" fill="#1a1f71">
        VISA
      </text>
    </Moldura>
  ),
  mastercard: () => (
    <Moldura>
      <defs>
        <clipPath id="mc-esquerda">
          <circle cx="19" cy="15" r="8" />
        </clipPath>
      </defs>
      <circle cx="19" cy="15" r="8" fill="#eb001b" />
      <circle cx="29" cy="15" r="8" fill="#f79e1b" />
      <circle cx="29" cy="15" r="8" fill="#ff5f00" clipPath="url(#mc-esquerda)" />
    </Moldura>
  ),
  elo: () => (
    <Moldura>
      <text x="24" y="18" textAnchor="middle" fontFamily={FONTE} fontSize="15" fontWeight="800" fill="#111">
        elo
      </text>
      <circle cx="19" cy="23.5" r="1.7" fill="#ffcb05" />
      <circle cx="24" cy="23.5" r="1.7" fill="#00a4e0" />
      <circle cx="29" cy="23.5" r="1.7" fill="#ef4123" />
    </Moldura>
  ),
  americanexpress: () => (
    <Moldura fundo="#2e77bc">
      <text x="24" y="19" textAnchor="middle" fontFamily={FONTE} fontSize="9.5" fontWeight="800" fill="#fff">
        AMEX
      </text>
    </Moldura>
  ),
  dinersclub: () => (
    <Moldura>
      <circle cx="24" cy="15" r="10" fill="#0079be" />
      <circle cx="24" cy="15" r="7" fill="#fff" />
      <path d="M24 8v14" stroke="#0079be" strokeWidth="1.6" />
      <path d="M21.5 10.2a5.3 5.3 0 0 0 0 9.6M26.5 10.2a5.3 5.3 0 0 1 0 9.6" stroke="#0079be" strokeWidth="1.6" fill="none" />
    </Moldura>
  ),
  hipercard: () => (
    <Moldura fundo="#b3131b">
      <text x="24" y="18.5" textAnchor="middle" fontFamily={FONTE} fontSize="8" fontWeight="800" fill="#fff">
        Hipercard
      </text>
    </Moldura>
  ),
  vr: () => (
    <Moldura>
      <text x="24" y="21" textAnchor="middle" fontFamily={FONTE} fontSize="16" fontWeight="800" fill="#00a859">
        VR
      </text>
    </Moldura>
  ),
  alelo: () => (
    <Moldura>
      <text x="24" y="19.5" textAnchor="middle" fontFamily={FONTE} fontSize="12" fontWeight="800" fill="#00875a">
        alelo
      </text>
    </Moldura>
  ),
  sodexo: () => (
    <Moldura>
      <text x="24" y="19" textAnchor="middle" fontFamily={FONTE} fontSize="10" fontWeight="800" fill="#2a3b8f">
        sodexo
      </text>
    </Moldura>
  ),
  pluxee: () => (
    <Moldura>
      <text x="24" y="19" textAnchor="middle" fontFamily={FONTE} fontSize="10" fontWeight="800" fill="#0a2d5c">
        pluxee
      </text>
    </Moldura>
  ),
};

// Nomes cadastrados à mão variam ("Master", "Hiper card", "Diners club").
const SINONIMOS: Record<string, string> = {
  master: "mastercard",
  hipercard: "hipercard",
  hipercard2: "hipercard",
  amex: "americanexpress",
  diners: "dinersclub",
};

function chaveDaMarca(nome: string): string {
  const base = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return SINONIMOS[base] ?? base;
}

export function BandeirasAceitas({
  bandeiras,
  className = "",
}: {
  bandeiras: readonly { id: string; nome: string }[];
  className?: string;
}) {
  if (bandeiras.length === 0) return null;

  // "Hiper card" e "Hipercard" cadastradas as duas viram uma só na legenda.
  const vistas = new Set<string>();
  const itens = bandeiras.filter((b) => {
    const chave = chaveDaMarca(b.nome);
    if (vistas.has(chave)) return false;
    vistas.add(chave);
    return true;
  });

  return (
    <div className={className}>
      <p className="m-0 mb-1.5 text-[12.5px] text-muted">Bandeiras aceitas</p>
      <ul className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0">
        {itens.map((b) => {
          const Marca = MARCAS[chaveDaMarca(b.nome)];
          return (
            <li key={b.id} title={b.nome} className="flex">
              {Marca ? (
                <>
                  <Marca />
                  <span className="sr-only">{b.nome}</span>
                </>
              ) : (
                <span className="rounded-pill border border-border-shalon bg-elev px-2.5 py-1 text-[12.5px] font-semibold text-ink-2">
                  {b.nome}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
