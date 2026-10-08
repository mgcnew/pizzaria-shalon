import { describe, expect, it } from "vitest";
import { codificarCaractere, codificarTexto, montarEscPos } from "@/ui/impressao/escpos";

describe("ESC/POS da 58 mm (D-2026-10-08-116, entrega 2)", () => {
  it("ASCII passa como está", () => {
    expect(codificarTexto("PEDIDO #12", "cp860")).toEqual(Array.from("PEDIDO #12", (c) => c.charCodeAt(0)));
  });

  it("acentos do português saem pela tabela escolhida", () => {
    expect(codificarCaractere("ç", "cp860")).toBe(0x87);
    expect(codificarCaractere("ã", "cp860")).toBe(0x84);
    expect(codificarCaractere("ã", "cp850")).toBe(0xc6);
    expect(codificarCaractere("Ç", "cp850")).toBe(0x80);
  });

  it("sem tabela, tira o acento em vez de mandar lixo", () => {
    expect(String.fromCharCode(...codificarTexto("Açúcar Coração", "sem-acento"))).toBe("Acucar Coracao");
  });

  it("caractere que não existe em tabela nenhuma vira ? e nunca um byte de controle", () => {
    expect(codificarCaractere("🍕", "cp860")).toBe(0x3f);
    expect(codificarCaractere("\u001b", "cp860")).toBe(0x3f);
    expect(codificarCaractere("ñ", "sem-acento")).toBe("n".charCodeAt(0));
  });

  it("documento: inicia, escolhe a tabela, negrito só no destaque e avança o papel", () => {
    const bytes = Array.from(
      montarEscPos(
        [
          { texto: "PIZZARIA", estilo: "titulo" },
          { texto: "Ok", estilo: "normal" },
        ],
        "cp860",
      ),
    );
    expect(bytes.slice(0, 5)).toEqual([0x1b, 0x40, 0x1b, 0x74, 3]);
    // ESC E 1 · "PIZZARIA" · LF · ESC E 0 · "Ok" · LF · ESC d 4
    expect(bytes.slice(5, 8)).toEqual([0x1b, 0x45, 1]);
    expect(bytes.slice(-3)).toEqual([0x1b, 0x64, 4]);
    expect(bytes).not.toContain(0x56); // sem comando de corte (GS V)
  });

  it("sem acento não manda o comando de tabela", () => {
    const bytes = Array.from(montarEscPos([{ texto: "x", estilo: "normal" }], "sem-acento"));
    expect(bytes.slice(0, 3)).toEqual([0x1b, 0x40, "x".charCodeAt(0)]);
  });
});
