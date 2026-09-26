"use client";

import { useState } from "react";
import { Input } from "@/ui/components";
import { avisoDeEan } from "@/domain/catalogo/ean";

/**
 * Campo de código de barras com aviso de EAN enquanto se digita.
 *
 * 09-PDV-FRENTE-DE-CAIXA.md §2.3 · Decisão D-2026-09-25-78, item 1
 *
 * DUAS DECISÕES QUE PARECEM DETALHE E NÃO SÃO:
 *
 * 1. `type="text"`, NUNCA `type="number"`. Um campo numérico normaliza o valor
 *    e come zeros à esquerda — `0012345678905` chegaria como `12345678905`, que
 *    é outro código. Em EAN-13 o zero à esquerda é significativo, então o campo
 *    trata código como TEXTO do começo ao fim.
 *
 * 2. O aviso é `role="status"`, não `role="alert"`, e usa os tokens de atenção
 *    em vez dos de erro. Ele não impede salvar — dizer isso visualmente é parte
 *    da decisão "avisar, nunca bloquear". Um `alert` vermelho ensinaria a pessoa
 *    a achar que o código foi recusado.
 *
 * O aviso daqui é só para feedback imediato. Depois de salvar, o que vale é o
 * `aviso_ean` que a RPC devolveu: o banco é a referência, este campo é a
 * conveniência.
 */
export function CampoCodigoDeBarras({
  name = "codigo",
  defaultValue = "",
  label = "Código de barras",
  id,
}: {
  name?: string;
  defaultValue?: string;
  label?: string;
  id?: string;
}) {
  const [valor, setValor] = useState(defaultValue);
  const aviso = avisoDeEan(valor);

  return (
    <div className="flex w-full flex-col gap-[6px]">
      <Input
        label={label}
        name={name}
        {...(id ? { id } : {})}
        type="text"
        autoComplete="off"
        spellCheck={false}
        defaultValue={defaultValue}
        onChange={(evento) => setValor(evento.target.value)}
        hint="Bipe com o leitor ou digite. Código interno da casa também vale."
        className="font-mono tracking-wide"
      />
      {aviso ? (
        <p
          role="status"
          className="m-0 rounded-12 border border-twb bg-tw px-3 py-[10px] text-[13px] font-semibold text-twf"
        >
          {aviso}
        </p>
      ) : null}
    </div>
  );
}
