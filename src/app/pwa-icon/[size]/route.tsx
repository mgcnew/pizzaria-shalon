import { ImageResponse } from "next/og";

const TAMANHOS = [180, 192, 512] as const;

export const dynamic = "force-static";

export function generateStaticParams() {
  return TAMANHOS.map((size) => ({ size: String(size) }));
}

/** Ícone vetorial renderizado em PNG, com área segura para recorte maskable. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ size: string }> },
) {
  const { size: texto } = await params;
  const size = Number(texto);
  if (!TAMANHOS.some((permitido) => permitido === size)) {
    return new Response("Ícone não encontrado.", { status: 404 });
  }

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#c4291c",
        borderRadius: size * 0.22,
      }}
    >
      <div
        style={{
          width: size * 0.63,
          height: size * 0.63,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: size * 0.18,
          backgroundColor: "#ffb61e",
          color: "#1e1814",
          fontSize: size * 0.46,
          fontWeight: 900,
          lineHeight: 1,
        }}
      >
        S
      </div>
    </div>,
    { width: size, height: size },
  );
}
