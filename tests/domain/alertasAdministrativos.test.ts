import { describe, expect, it } from "vitest";
import { definirAlerta, lerAreasSalvas } from "../../src/domain/notificacoes/alertas";

describe("alertas administrativos acionáveis", () => {
  it("direciona cada tarefa para sua área sonora", () => {
    expect(definirAlerta("new_order").area).toBe("atendimento");
    expect(definirAlerta("production_needed").area).toBe("producao");
    expect(definirAlerta("ready_for_pickup").area).toBe("atendimento");
    expect(definirAlerta("ready_for_delivery").area).toBe("entrega");
    expect(definirAlerta("delivery_failed").area).toBe("atendimento");
  });

  it("mantém atendimento como padrão sem seleção salva", () => {
    expect(lerAreasSalvas(null)).toEqual(["atendimento"]);
    expect(lerAreasSalvas("inválido")).toEqual(["atendimento"]);
  });

  it("preserva a seleção explícita e ignora áreas desconhecidas", () => {
    expect(lerAreasSalvas('["entrega","producao","outra"]')).toEqual(["producao", "entrega"]);
    expect(lerAreasSalvas("[]")).toEqual([]);
  });
});
