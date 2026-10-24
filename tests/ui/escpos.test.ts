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

describe("QR code nativo (GS ( k)", () => {
  it("centraliza, guarda o endereço com o tamanho certo, imprime e volta à esquerda", () => {
    const url = "https://pizzariashalon.vercel.app/?origem=cupom";
    const bytes = Array.from(montarEscPos([{ texto: url, estilo: "qrcode" }], "cp860"));
    const inicio = bytes.indexOf(0x1d);
    expect(bytes.slice(inicio - 3, inicio)).toEqual([0x1b, 0x61, 1]);
    // guarda: GS ( k pL pH 49 80 48 dados — pL/pH = dados + 3
    const guarda = bytes.findIndex((b, i) => b === 0x1d && bytes[i + 5] === 0x31 && bytes[i + 6] === 0x50);
    expect(bytes[guarda + 3]).toBe(url.length + 3);
    expect(String.fromCharCode(...bytes.slice(guarda + 8, guarda + 8 + url.length))).toBe(url);
    // imprime: GS ( k 3 0 49 81 48
    expect(bytes.join(",")).toContain([0x1d, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30].join(","));
    expect(bytes.slice(-6, -3)).toEqual([0x1b, 0x61, 0]);
  });
});

describe("espaço no fim do papel", () => {
  const avanco = (mm?: number) => Array.from(montarEscPos([{ texto: "x", estilo: "normal" }], "cp860", mm)).slice(-3);

  it("padrão continua avançando 4 linhas, como antes", () => {
    expect(avanco()).toEqual([0x1b, 0x64, 4]);
    expect(avanco(12)).toEqual([0x1b, 0x64, 4]);
  });

  it("espaço grande avança mais, para a guilhotina não cortar o fim", () => {
    expect(avanco(20)).toEqual([0x1b, 0x64, 6]);
  });
});
