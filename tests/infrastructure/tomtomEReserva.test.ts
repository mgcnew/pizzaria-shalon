import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { avaliarResultadosDaTomTom } = await import("@/infrastructure/rotas/tomtom");
const { provedorComReserva } = await import("@/infrastructure/rotas/comReserva");
import type { ProvedorDeRotas, ResultadoGeocodificacao } from "@/infrastructure/rotas/contrato";

const item = (type: string, nota = 0.95, cep = "04474-150", lat = -23.69, lon = -46.64) => ({
  type,
  position: { lat, lon },
  address: { freeformAddress: "x", postalCode: cep },
  matchConfidence: { score: nota },
});

describe("avaliarResultadosDaTomTom", () => {
  it("Point Address é exata; Address Range é aproximada", () => {
    expect(avaliarResultadosDaTomTom([item("Point Address")], null)).toMatchObject({ ok: true, confianca: "exata" });
    expect(avaliarResultadosDaTomTom([item("Address Range")], null)).toMatchObject({ ok: true, confianca: "aproximada" });
  });
  it("rua só com CEP conferido", () => {
    expect(avaliarResultadosDaTomTom([item("Street")], "04474150")).toMatchObject({ ok: true, confianca: "aproximada" });
    expect(avaliarResultadosDaTomTom([item("Street")], null)).toEqual({ ok: false, motivo: "ambiguo" });
  });
  it("nota baixa é não encontrado; bairro/cidade é recusado", () => {
    expect(avaliarResultadosDaTomTom([item("Point Address", 0.5)], null)).toEqual({ ok: false, motivo: "nao_encontrado" });
    expect(avaliarResultadosDaTomTom([item("Geography")], "04474150")).toEqual({ ok: false, motivo: "ambiguo" });
  });
  it("nota menor vale quando o CEP completo do resultado é o digitado", () => {
    const retiro = {
      type: "Address Range",
      position: { lat: -23.6934, lon: -46.6376 },
      address: { freeformAddress: "Rua do Retiro, 100", postalCode: "04474", extendedPostalCode: "04474-150" },
      matchConfidence: { score: 0.69 },
    };
    expect(avaliarResultadosDaTomTom([retiro], "04474-150")).toMatchObject({ ok: true, confianca: "aproximada" });
    expect(avaliarResultadosDaTomTom([retiro], null)).toEqual({ ok: false, motivo: "nao_encontrado" });
    expect(avaliarResultadosDaTomTom([{ ...retiro, matchConfidence: { score: 0.55 } }], "04474150")).toEqual({
      ok: false,
      motivo: "nao_encontrado",
    });
  });

  it("segundo resultado concorrente longe é ambíguo", () => {
    expect(
      avaliarResultadosDaTomTom([item("Point Address"), item("Point Address", 0.94, "x", -23.5, -46.5)], null),
    ).toEqual({ ok: false, motivo: "ambiguo" });
  });
});

function falso(nome: string, geo: ResultadoGeocodificacao): ProvedorDeRotas {
  return {
    nome,
    geocodificar: vi.fn(async () => geo),
    rota: vi.fn(async () => ({ ok: true as const, distanciaKm: 2, duracaoMinutos: 5, provedor: nome })),
  };
}

const ENDERECO = { logradouro: "Estrada do Retiro", numero: "100", bairro: "Pedreira", cidade: "São Paulo", uf: "SP", cep: "04474150" };
const OK = (p: string): ResultadoGeocodificacao => ({
  ok: true, coordenada: { latitude: -23.69, longitude: -46.64 }, confianca: "exata", enderecoFormatado: "x", provedor: p,
});
const FALHA = (p: string, motivo: "nao_encontrado" | "configuracao"): ResultadoGeocodificacao => ({
  ok: false, motivo, mensagem: "m", provedor: p,
});

describe("provedorComReserva", () => {
  it("usa a reserva quando o principal não localiza", async () => {
    const r = await provedorComReserva(falso("here", FALHA("here", "nao_encontrado")), falso("tomtom", OK("tomtom"))).geocodificar(ENDERECO);
    expect(r).toMatchObject({ ok: true, provedor: "tomtom" });
  });
  it("não consulta a reserva quando o principal acha", async () => {
    const reserva = falso("tomtom", OK("tomtom"));
    const r = await provedorComReserva(falso("here", OK("here")), reserva).geocodificar(ENDERECO);
    expect(r).toMatchObject({ provedor: "here" });
    expect(reserva.geocodificar).not.toHaveBeenCalled();
  });
  it("credencial errada no principal não é escondida pela reserva", async () => {
    const r = await provedorComReserva(falso("here", FALHA("here", "configuracao")), falso("tomtom", OK("tomtom"))).geocodificar(ENDERECO);
    expect(r).toMatchObject({ ok: false, motivo: "configuracao" });
  });
  it("se a reserva também não achar, vale a mensagem do principal", async () => {
    const r = await provedorComReserva(falso("here", FALHA("here", "nao_encontrado")), falso("tomtom", FALHA("tomtom", "nao_encontrado"))).geocodificar(ENDERECO);
    expect(r).toMatchObject({ ok: false, provedor: "here" });
  });
});

describe("consultaDeEndereco", () => {
  it("manda o CEP sempre com hífen", async () => {
    const { consultaDeEndereco } = await import("@/infrastructure/rotas/contrato");
    const q = consultaDeEndereco({ logradouro: "Estrada do Retiro", numero: "100", bairro: "B", cidade: "São Paulo", uf: "SP", cep: "04474150" });
    expect(q).toContain("04474-150");
  });
});
