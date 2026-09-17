import Image from "next/image";
import Link from "next/link";
import { StatusBadge } from "@/ui/components";

/**
 * Shell público — cabeçalho fixo do design aprovado.
 *
 * Preserva do protótipo: logo à esquerda, badge de situação da loja e
 * horário alinhados à direita, fundo --surface, borda inferior, contêiner de
 * 1120px e ausência de navegação inferior permanente.
 *
 * FASE 1: o estado "Aberto agora" é PLACEHOLDER ESTÁTICO. A situação real
 * depende de horários configuráveis e fechamento temporário (RN-LOJA-001 e
 * RN-LOJA-002), que são escopo da Fase 3. Nenhuma regra é decidida aqui.
 */
export default function LayoutPublico({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-h-screen w-full max-w-shalon bg-bg">
      <header className="sticky top-0 z-30 flex items-center gap-[14px] border-b border-border-shalon bg-surface px-4 py-3">
        <Link href="/" aria-label="Pizzaria Shalon — início" className="flex shrink-0 items-center">
          <Image
            src="/marca/logo-shalon.png"
            alt="Pizzaria Shalon — Tradição desde 1995"
            width={1774}
            height={887}
            priority
            className="h-[46px] w-auto"
          />
        </Link>

        <div className="flex min-w-0 flex-1 flex-col items-end gap-[3px]">
          {/* Placeholder — ver nota da Fase 1 acima. */}
          <StatusBadge tom="sucesso">Aberto agora</StatusBadge>
          <span className="text-[12px] text-muted">Pedidos até 23:30</span>
        </div>
      </header>

      <main className="pb-[110px]">{children}</main>
    </div>
  );
}
