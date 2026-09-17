import Link from "next/link";

export default function NaoEncontrado() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="max-w-[420px] text-center">
        <p className="m-0 font-display text-[28px] font-extrabold text-ink">
          Página não encontrada
        </p>
        <p className="mt-2 text-[15px] text-ink-2">
          O endereço que você abriu não existe ou foi movido.
        </p>
        <Link
          href="/"
          className="mt-[18px] inline-flex min-h-touch-cta items-center justify-center rounded-12 bg-cta px-5 text-[16px] font-semibold text-cta-fg"
        >
          Ver cardápio
        </Link>
      </div>
    </main>
  );
}
