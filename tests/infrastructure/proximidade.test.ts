import { describe, expect, it } from "vitest";
import { escolherPorNomeEProximidade, ruaConfere, type Candidato } from "@/infrastructure/rotas/proximidade";

const loja = { latitude: -23.6959, longitude: -46.6426 };
const c = (over: Partial<Candidato>): Candidato => ({
  lat: -23.6972, lng: -46.6410, nivel: "casa", rua: "Rua Getúlio Vargas", nota: 0.63, label: "x", ...over,
});

describe("ruaConfere", () => {
  it("ignora tipo de via, acento e 'de/da'", () => {
    expect(ruaConfere("Eugênio Barros", "Rua Eugênio de Barros")).toBe(true);
    expect(ruaConfere("getulio vargas", "Rua Getúlio Vargas")).toBe(true);
    expect(ruaConfere("Av. Paulista", "Avenida Paulista")).toBe(true);
  });
  it("nome diferente não confere", () => {
    expect(ruaConfere("Getúlio Vargas", "Rua Getúlio Brandão")).toBe(false);
    expect(ruaConfere("Retiro", undefined)).toBe(false);
  });
});

describe("escolherPorNomeEProximidade", () => {
  it("aceita o único candidato com o nome, número da casa e perto da loja", () => {
    expect(escolherPorNomeEProximidade([c({})], "Getúlio Vargas", loja)).not.toBeNull();
  });
  it("descarta homônimo fora do raio (20 km) e fica com o perto", () => {
    const longe = c({ lat: -23.52, lng: -46.62 });
    expect(escolherPorNomeEProximidade([longe, c({})], "Getúlio Vargas", loja)?.lat).toBe(-23.6972);
  });
  it("dois homônimos dentro da área, em lugares diferentes, é ambiguidade", () => {
    const outro = c({ lat: -23.72, lng: -46.66 }); // ~3 km
    expect(escolherPorNomeEProximidade([c({}), outro], "Getúlio Vargas", loja)).toBeNull();
  });
  it("só a rua (sem número) ou nota baixa não servem", () => {
    expect(escolherPorNomeEProximidade([c({ nivel: "rua" })], "Getúlio Vargas", loja)).toBeNull();
    expect(escolherPorNomeEProximidade([c({ nota: 0.5 })], "Getúlio Vargas", loja)).toBeNull();
  });
});
