import Image from "next/image";
import Link from "next/link";
import { listarBanners, urlDaImagem } from "@/application/publico/consultas";
import { formatBRL } from "@/lib/format";
import type { BannerPublico, ProdutoPublico } from "@/application/publico/tipos";
import { PopupDeAbertura } from "./PopupDeAbertura";
import { CarrosselBanners } from "./CarrosselBanners";

/**
 * Carrossel de banners do cardápio.
 *
 * RN-BANNER-003/004: a visibilidade já vem decidida do banco — banner de
 * promoção fora da validade e banner de produto indisponível simplesmente
 * não chegam aqui. A interface não refaz esse julgamento.
 *
 * RN-BANNER-002: destino interno é uma ENTIDADE, então o link é montado a
 * partir do slug que o banco devolveu, nunca de uma URL digitada.
 *
 * OS COMBOS ENTRAM AQUI, e não em seção própria (D-2026-09-21-56, revisada).
 * Combo é oferta, e oferta pertence ao topo — junto do banner, onde a pessoa
 * olha primeiro. Eles continuam no cardápio, dentro da categoria deles: a
 * faixa é atalho, não é o único caminho.
 */

/**
 * Faixa de combos colada ao banner. Só aparece quando há combo.
 *
 * MUDOU EM 28/09/2026 (D-2026-09-28-86): fundo vermelho da marca no lugar do
 * marrom escuro. O subtítulo usa o creme a 90% porque o `dark-ink-2` sobre o
 * vermelho ficaria abaixo de 4,5:1.
 */
function FaixaCombos({ combos }: { combos: ProdutoPublico[] }) {
  if (combos.length === 0) return null;

  const precos = combos.map((c) => c.preco).filter((p) => p !== null);
  const menor = precos.length > 0 ? Math.min(...precos) : null;
  // O destino é a categoria do próprio combo — entidade, nunca URL digitada.
  const slug = combos[0]?.categoria_slug ?? null;

  return (
    <section className="mx-4 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-16 bg-brand-red px-4 py-[14px]">
      <div className="min-w-0">
        <p className="m-0 font-display text-[17px] font-bold text-dark-ink">
          Combos para compartilhar
        </p>
        <p className="m-0 text-[13px] text-dark-ink/90">
          {combos.length} {combos.length === 1 ? "opção" : "opções"}
          {menor !== null ? ` · a partir de ${formatBRL(menor)}` : ""}
        </p>
      </div>

      {slug ? (
        <Link
          href={`/categoria/${slug}`}
          className="inline-flex min-h-touch items-center rounded-12 bg-cta px-[18px] text-[15px] font-semibold text-cta-fg no-underline"
        >
          Ver combos
        </Link>
      ) : null}
    </section>
  );
}

/**
 * Banner de abertura: o que a home mostra quando não há destaque nem promoção
 * no ar. Mudou em 23/10/2026: antes era só o selo e o texto sobre o marrom
 * escuro; o marrom saiu a pedido da dona e o banner passou a usar as cores do
 * logo — amarelo, laranja e vermelho —, como a faixa de combos logo abaixo.
 *
 * Mantém o selo "Tradição desde 1995", o nome da loja e a frase, e acrescenta
 * o que o design aprovado previa e a tela não tinha: a pizza em destaque
 * ("Foto da pizza em destaque"). Ela sai do canto, cortada pela borda do
 * cartão, sobre um clarão laranja de forno.
 *
 * É superfície de MARCA, não de tema: o amarelo é o mesmo no claro e no
 * escuro, então a tinta do texto é fixa (#1e1814, a tinta do design) em vez de
 * `text-ink`, que viraria clara no escuro e sumiria sobre o amarelo. O botão é
 * vermelho porque o CTA padrão é amarelo e não apareceria aqui.
 *
 * O atalho "Ver o cardápio" existe porque, no celular, o cardápio só começa
 * depois do banner e da faixa de combos. A pizza é decorativa (alt vazio): o
 * nome e a frase já dizem tudo para quem lê pela voz.
 */
function BannerDeAbertura({ nomeLoja }: { nomeLoja: string }) {
  return (
    <section className="relative mx-4 mt-4 overflow-hidden rounded-20 bg-brand-yellow text-[#1e1814]">
      {/* Luz no canto do texto e clarão de forno atrás da pizza. Só cor: não
          carregam informação. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 0% 0%, rgb(255 255 255 / 0.38), transparent 55%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-28 -right-28 h-[340px] w-[340px] rounded-full sm:-bottom-40 sm:-right-20 sm:h-[500px] sm:w-[500px]"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in srgb, var(--shalon-brand-orange) 85%, transparent), transparent)",
        }}
      />

      {/* A pizza, sangrando pela quina do cartão. */}
      <Image
        src="/marca/pizza-destaque.webp"
        alt=""
        width={640}
        height={640}
        priority
        sizes="(max-width: 640px) 220px, 380px"
        className="pointer-events-none absolute -bottom-[84px] -right-[84px] h-[220px] w-[220px] rotate-[-14deg] select-none drop-shadow-[0_16px_18px_rgb(110_40_0/0.45)] sm:-bottom-12 sm:-right-10 sm:h-[380px] sm:w-[380px]"
      />

      <div className="relative flex min-h-[212px] flex-col items-start justify-between gap-5 p-5 sm:min-h-[280px] sm:p-8">
        <div>
          <span className="inline-block rounded-pill bg-brand-red px-[10px] py-1 text-[12px] font-bold uppercase tracking-[0.04em] text-white">
            Tradição desde 1995
          </span>
          <h1 className="mb-[6px] mt-[10px] text-balance font-display text-[32px] font-extrabold leading-[1.05] sm:text-[44px]">
            {nomeLoja}
          </h1>
          <p className="m-0 max-w-[23ch] text-[15px] font-medium leading-[1.45] text-[#3a2a1c] sm:max-w-[34ch] sm:text-[17px]">
            Massa fresca todos os dias, assada na hora e entregue quentinha na sua casa.
          </p>
        </div>

        <a
          href="#cardapio"
          className="motion-interactive inline-flex min-h-touch items-center gap-2 rounded-12 bg-brand-red px-[18px] text-[15px] font-bold text-white no-underline shadow-[0_6px_16px_rgb(110_20_10/0.3)] transition-transform hover:-translate-y-0.5"
        >
          Ver o cardápio
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-4 w-4">
            <path d="M12 5v14m0 0-6-6m6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </div>
    </section>
  );
}

function destino(b: BannerPublico): string | null {
  switch (b.destino_tipo) {
    case "product":
      return b.destino_slug ? `/produto/${b.destino_slug}` : null;
    case "category":
      return b.destino_slug ? `/categoria/${b.destino_slug}` : null;
    // Destaque com vários produtos: `destaque/<id do banner>`.
    case "products":
      return b.destino_slug ? `/${b.destino_slug}` : null;
    // Promoção de um item: o banco devolve o slug do produto. Promoção com
    // vários itens: devolve `promocao/<id>`, a página com todos eles.
    case "promotion":
      if (!b.destino_slug) return null;
      return b.destino_slug.startsWith("promocao/")
        ? `/${b.destino_slug}`
        : `/produto/${b.destino_slug}`;
    case "external":
      return b.url_externa;
    default:
      return null;
  }
}

export async function Banners({
  nomeLoja,
  combos,
}: {
  nomeLoja: string;
  combos: ProdutoPublico[];
}) {
  const banners = await listarBanners();
  if (banners.length === 0) {
    return (
      <>
      <BannerDeAbertura nomeLoja={nomeLoja} />
      <FaixaCombos combos={combos} />
      </>
    );
  }

  const cartoes = await Promise.all(
    banners.map(async (b) => ({ ...b, url: await urlDaImagem(b.imagem_path), href: destino(b) })),
  );

  // Popup de abertura: só existe se o banner tem imagem de popup — sem arte
  // não há aviso (D-2026-10-15-127). O primeiro da ordem do carrossel.
  const comPopup = cartoes.find((b) => b.popup_imagem_path);
  const popupUrl = comPopup?.popup_imagem_path
    ? await urlDaImagem(comPopup.popup_imagem_path)
    : null;

  return (
    <>
      {comPopup && popupUrl ? (
        <PopupDeAbertura
          bannerId={comPopup.id}
          imagemUrl={popupUrl}
          titulo={comPopup.titulo}
          href={comPopup.href}
          externo={comPopup.destino_tipo === "external"}
        />
      ) : null}
      <CarrosselBanners banners={cartoes} />
      <FaixaCombos combos={combos} />
    </>
  );
}
