import { describe, it, expect } from "vitest";
import {
  descreverAuditoria,
  type RegistroParaDescrever,
} from "@/application/configuracoes/descricaoDaAuditoria";

/** A auditoria em frases (D-2026-09-29-94). Os casos vêm da tela real. */

const base: RegistroParaDescrever = {
  action: "pedido_cancelar",
  entity_type: "orders",
  actor_type: "user",
  reason: null,
  status_antes: null,
  status_depois: null,
  ator: "Rafaela",
  numero_pedido: 1042,
};
const r = (p: Partial<RegistroParaDescrever>) => descreverAuditoria({ ...base, ...p });

describe("descreverAuditoria", () => {
  it("cancelamento: número do pedido, quem, de-para e motivo", () => {
    expect(
      r({ reason: "teste", status_antes: "accepted", status_depois: "cancelled" }),
    ).toEqual({
      titulo: "Pedido #1042 cancelado",
      detalhe: expect.stringMatching(/^Por Rafaela · .+ → .+ · Motivo: teste$/),
    });
  });

  it("sem motivo não inventa texto", () => {
    expect(r({ action: "pedido_concluir" })).toEqual({
      titulo: "Pedido #1042 concluído",
      detalhe: "Por Rafaela",
    });
  });

  it("frases dos casos da tela", () => {
    expect(r({ action: "reimprimir_comanda" }).titulo).toBe("Comanda do pedido #1042 reimpressa");
    expect(r({ action: "criar_pedido_manual" }).titulo).toBe("Pedido #1042 lançado pelo painel");
    expect(r({ action: "pagamento_registrar" }).titulo).toBe("Pagamento do pedido #1042 registrado");
    expect(r({ action: "pedido_marcar_pronto" }).titulo).toBe("Pedido #1042 marcado como pronto");
    expect(r({ action: "caixa_abrir", entity_type: "cash_sessions", numero_pedido: null }).titulo).toBe(
      "Caixa aberto",
    );
    expect(r({ action: "pedido_cancelar_com_estorno" }).titulo).toBe(
      "Pedido #1042 cancelado com estorno do pagamento",
    );
  });

  it("sem número do pedido, a frase continua correta", () => {
    expect(r({ numero_pedido: null }).titulo).toBe("Pedido cancelado");
    expect(r({ action: "reimprimir_comanda", numero_pedido: null }).titulo).toBe(
      "Comanda do pedido reimpressa",
    );
  });

  it("gatilho genérico de configuração concorda o particípio", () => {
    expect(r({ action: "update_store_settings", numero_pedido: null }).titulo).toBe(
      "Configurações da loja alteradas",
    );
    expect(r({ action: "insert_promotions", numero_pedido: null }).titulo).toBe("Promoção criada");
    expect(r({ action: "delete_role_permissions", numero_pedido: null }).titulo).toBe(
      "Permissão de papel retirada",
    );
  });

  it("quem agiu: sistema, cliente, ou usuário sem nome visível", () => {
    expect(r({ actor_type: "system", ator: null }).detalhe).toBe(
      "Registrado automaticamente pelo sistema",
    );
    expect(r({ actor_type: "customer", ator: null }).detalhe).toBe("Pelo cliente");
    expect(r({ ator: null }).detalhe).toBe("Por um usuário do painel");
  });

  it("lançamento financeiro chama o texto de descrição, não de motivo", () => {
    expect(r({ action: "financeiro_despesa", reason: "Gás", numero_pedido: null }).detalhe).toBe(
      "Por Rafaela · Descrição: Gás",
    );
  });

  it("status igual antes e depois não vira seta", () => {
    expect(r({ status_antes: "accepted", status_depois: "accepted" }).detalhe).toBe("Por Rafaela");
  });

  it("código desconhecido aparece legível, não some", () => {
    expect(r({ action: "algo_novo_qualquer", numero_pedido: null }).titulo).toBe("Algo novo qualquer");
  });
});
