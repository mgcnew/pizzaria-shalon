import Image from "next/image";
import Link from "next/link";
import { StatusBadge } from "@/ui/components";
import { rotuloDeHorario, type JanelaDia } from "@/domain/loja/horarios";
import {
  listarHorariosPublicos,
  obterLojaPublica,
} from "@/application/publico/consultas";
import { IconeCarrinho } from "./IconeCarrinho";
import { MenuPublico } from "./MenuPublico";

/**
 * Cabeçalho público — o do design aprovado: logo à esquerda, pílula de
 * situação e microcopy de horário à direita, fundo --surface e borda
 * inferior, dentro do contêiner de 1120px.
 *
 * O estado "Aberto agora" deixou de ser placeholder: vem de `loja_aberta()`,
 * que considera horário semanal E fechamento temporário (RN-LOJA-001/002).
 *
 * O botão de menu é acréscimo exigido por 79.8 — ver MenuPublico. O ícone do
 * carrinho entrou em 28/09/2026 no lugar da barra fixa do rodapé
 * (D-2026-09-28-85) — ver IconeCarrinho.
 */

/** Momento atual no fuso DA LOJA, não no de quem acessa. */
function momentoNaLoja(fuso: string) {
  const agora = new Date();
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: fuso,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(agora);

  const hora = Number(partes.find((p) => p.type === "hour")?.value ?? "0");
  const minuto = Number(partes.find((p) => p.type === "minute")?.value ?? "0");

  // O dia da semana vem de uma conversão explícita para o fuso da loja.
  const diaLocal = new Date(agora.toLocaleString("en-US", { timeZone: fuso })).getDay();

  return { diaSemana: diaLocal, minutos: hora * 60 + minuto };
}

export async function CabecalhoPublico() {
  const [loja, horarios] = await Promise.all([
    obterLojaPublica(),
    listarHorariosPublicos(),
  ]);

  const janelas: JanelaDia[] = horarios.map((h) => ({
    diaSemana: h.dia_semana,
    fechado: h.fechado,
    abre: h.abre,
    fecha: h.fecha,
  }));

  const aberta = loja?.aberta ?? false;
  const rotulo = loja
    ? rotuloDeHorario(janelas, momentoNaLoja(loja.fuso), aberta)
    : "Loja em configuração";

  return (
    <header className="sticky top-0 z-30 flex items-center gap-[10px] sm:gap-[14px] border-b border-border-shalon bg-surface px-4 py-3">
      <Link href="/" aria-label="Pizzaria Shalon — início" className="flex shrink-0 items-center">
        <Image
          src="/marca/logo-shalon.webp"
          alt="Pizzaria Shalon — Tradição desde 1995"
          width={512}
          height={256}
          priority
          className="h-[46px] w-auto"
        />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col items-end gap-[3px]">
        <StatusBadge tom={aberta ? "sucesso" : "neutro"}>
          {aberta ? "Aberto agora" : "Fechado"}
        </StatusBadge>
        <span className="whitespace-nowrap text-[12px] text-muted">{rotulo}</span>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <IconeCarrinho />
        <MenuPublico />
      </div>
    </header>
  );
}
