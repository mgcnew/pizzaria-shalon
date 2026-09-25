import { afterEach, describe, expect, it } from "vitest";
import { consultaDeEndereco } from "@/infrastructure/rotas/contrato";
import { provedorIndisponivel } from "@/infrastructure/rotas/indisponivel";
import { provedorFalso } from "@/infrastructure/rotas/falso";

const ENDERECO = {
  logradouro: "Rua das Flores",
  numero: "123",
  bairro: "Centro",
  cidade: "São Paulo",
  uf: "SP",
  cep: "01000-000",
};

describe("consulta de geocodificação", () => {
  it("monta a consulta com rua, número, bairro, cidade, UF e CEP", () => {
    expect(consultaDeEndereco(ENDERECO)).toBe(
      "Rua das Flores, 123, Centro, São Paulo - SP, 01000-000, Brasil",
    );
  });

  it("funciona sem CEP", () => {
    expect(consultaDeEndereco({ ...ENDERECO, cep: undefined })).toBe(
      "Rua das Flores, 123, Centro, São Paulo - SP, Brasil",
    );
  });

  it("RN-ENT-004: complemento e referência não têm como entrar na consulta", () => {
    // O tipo do contrato nem possui esses campos; se alguém os passar, eles
    // são ignorados — a consulta continua idêntica.
    const comLixo = { ...ENDERECO, complemento: "Ap 42", referencia: "perto da padaria" };
    expect(consultaDeEndereco(comLixo)).toBe(consultaDeEndereco(ENDERECO));
    expect(consultaDeEndereco(comLixo)).not.toContain("Ap 42");
    expect(consultaDeEndereco(comLixo)).not.toContain("padaria");
  });
});

describe("provedor indisponível", () => {
  it("recusa geocodificação e rota com motivo de configuração", async () => {
    const p = provedorIndisponivel();
    const geo = await p.geocodificar(ENDERECO);
    const rota = await p.rota({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 1 });

    expect(geo.ok).toBe(false);
    expect(rota.ok).toBe(false);
    // CLAUDE.md §20: falta de configuração nunca vira distância ou taxa.
    if (!geo.ok) expect(geo.motivo).toBe("configuracao");
    if (!rota.ok) expect(rota.motivo).toBe("configuracao");
  });
});

describe("dublê determinístico", () => {
  it("devolve a mesma coordenada para o mesmo endereço", async () => {
    const p = provedorFalso();
    const a = await p.geocodificar(ENDERECO);
    const b = await provedorFalso().geocodificar(ENDERECO);
    expect(a).toEqual(b);
  });

  it("entrega as distâncias do roteiro, na ordem", async () => {
    const p = provedorFalso({ distanciasKm: [1.5, 7.25] });
    const origem = { latitude: 0, longitude: 0 };
    const primeira = await p.rota(origem, { latitude: 1, longitude: 1 });
    const segunda = await p.rota(origem, { latitude: 2, longitude: 2 });

    expect(primeira.ok && primeira.distanciaKm).toBe(1.5);
    expect(segunda.ok && segunda.distanciaKm).toBe(7.25);
  });

  it("não inventa rota fora do roteiro", async () => {
    const p = provedorFalso();
    const r = await p.rota({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 1 });
    expect(r.ok).toBe(false);
  });
});

/**
 * Seleção do provedor — D-2026-09-24-75.
 *
 * A decisão foi "HERE ou indisponível", SEM fallback automático para o
 * Google. Estes casos existem para que um fallback não volte por descuido:
 * ele pareceria rede de proteção e responderia erro de credencial, porque o
 * faturamento do Google não foi ativado.
 */
describe("seleção do provedor de rotas", () => {
  const original = { here: process.env.HERE_API_KEY, google: process.env.GOOGLE_MAPS_SERVER_KEY };

  afterEach(() => {
    if (original.here === undefined) delete process.env.HERE_API_KEY;
    else process.env.HERE_API_KEY = original.here;
    if (original.google === undefined) delete process.env.GOOGLE_MAPS_SERVER_KEY;
    else process.env.GOOGLE_MAPS_SERVER_KEY = original.google;
  });

  it("com HERE_API_KEY, o provedor é o HERE", async () => {
    process.env.HERE_API_KEY = "chave-de-teste";
    const { selecionarProvedorDeRotas, rotasConfiguradas } = await import(
      "@/infrastructure/rotas"
    );
    expect(selecionarProvedorDeRotas().nome).toBe("here");
    expect(rotasConfiguradas()).toBe(true);
  });

  it("sem HERE_API_KEY, o provedor é o indisponível", async () => {
    delete process.env.HERE_API_KEY;
    const { selecionarProvedorDeRotas, rotasConfiguradas } = await import(
      "@/infrastructure/rotas"
    );
    expect(selecionarProvedorDeRotas().nome).toBe("indisponivel");
    expect(rotasConfiguradas()).toBe(false);
  });

  it("chave só de espaços não conta como configurada", async () => {
    process.env.HERE_API_KEY = "   ";
    const { selecionarProvedorDeRotas } = await import("@/infrastructure/rotas");
    expect(selecionarProvedorDeRotas().nome).toBe("indisponivel");
  });

  it("SEM FALLBACK: chave do Google presente NÃO reativa o Google", async () => {
    delete process.env.HERE_API_KEY;
    process.env.GOOGLE_MAPS_SERVER_KEY = "chave-antiga-do-google";
    const { selecionarProvedorDeRotas, rotasConfiguradas } = await import(
      "@/infrastructure/rotas"
    );
    expect(selecionarProvedorDeRotas().nome).toBe("indisponivel");
    expect(rotasConfiguradas()).toBe(false);
  });
});
