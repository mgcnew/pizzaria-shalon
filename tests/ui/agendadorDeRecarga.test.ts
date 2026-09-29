import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { criarAgendadorDeRecarga } from "@/ui/agendadorDeRecarga";

/**
 * Quando um evento de Realtime vira recarga da tela (D-2026-09-29-89).
 * Usado pelo PDV (janela de 500 ms) e pela Central de Pedidos (1 s).
 */
describe("criarAgendadorDeRecarga", () => {
  let visivel: boolean;
  let recarregar: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    vi.useFakeTimers();
    visivel = true;
    recarregar = vi.fn<() => void>();
  });
  afterEach(() => vi.useRealTimers());

  const criar = (janelaMs = 1000) =>
    criarAgendadorDeRecarga({ janelaMs, recarregar, abaVisivel: () => visivel });

  it("agrupa a rajada numa recarga só", () => {
    const a = criar();
    a.agendar();
    vi.advanceTimersByTime(300);
    a.agendar();
    vi.advanceTimersByTime(300);
    a.agendar();
    expect(recarregar).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(recarregar).toHaveBeenCalledTimes(1);
  });

  it("conta a janela do primeiro evento: eventos contínuos não adiam para sempre", () => {
    const a = criar();
    // Um evento a cada 400 ms durante 3 s: uma janela que reiniciasse a cada
    // evento nunca recarregaria.
    for (let t = 0; t < 3000; t += 400) {
      a.agendar();
      vi.advanceTimersByTime(400);
    }
    expect(recarregar.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("evento depois da recarga abre outra janela", () => {
    const a = criar();
    a.agendar();
    vi.advanceTimersByTime(1000);
    a.agendar();
    vi.advanceTimersByTime(1000);
    expect(recarregar).toHaveBeenCalledTimes(2);
  });

  it("com operação financeira em voo, segura e aplica quando termina", () => {
    const a = criar();
    a.aoMudarOperacoes(1);
    a.agendar();
    vi.advanceTimersByTime(5000);
    expect(recarregar).not.toHaveBeenCalled();
    a.aoMudarOperacoes(0);
    expect(recarregar).toHaveBeenCalledTimes(1);
  });

  it("só libera quando a ÚLTIMA operação termina", () => {
    const a = criar();
    a.aoMudarOperacoes(2);
    a.agendar();
    vi.advanceTimersByTime(1000);
    a.aoMudarOperacoes(1);
    expect(recarregar).not.toHaveBeenCalled();
    a.aoMudarOperacoes(0);
    expect(recarregar).toHaveBeenCalledTimes(1);
  });

  it("operação que termina sem evento pendente não recarrega", () => {
    const a = criar();
    a.aoMudarOperacoes(1);
    a.aoMudarOperacoes(0);
    expect(recarregar).not.toHaveBeenCalled();
  });

  it("aba oculta represa; ao voltar, recarrega uma vez", () => {
    const a = criar();
    visivel = false;
    a.agendar();
    a.agendar();
    vi.advanceTimersByTime(5000);
    expect(recarregar).not.toHaveBeenCalled();
    visivel = true;
    a.aoVoltarAba();
    a.aoVoltarAba();
    expect(recarregar).toHaveBeenCalledTimes(1);
  });

  it("voltar à aba sem evento pendente não recarrega", () => {
    const a = criar();
    a.aoVoltarAba();
    expect(recarregar).not.toHaveBeenCalled();
  });

  it("descartar cancela a janela aberta", () => {
    const a = criar();
    a.agendar();
    a.descartar();
    vi.advanceTimersByTime(5000);
    expect(recarregar).not.toHaveBeenCalled();
  });
});
