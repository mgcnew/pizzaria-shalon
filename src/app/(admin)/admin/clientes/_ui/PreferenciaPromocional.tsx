"use client";

import { useState, useTransition } from "react";
import { Button, Textarea } from "@/ui/components";
import { Aviso } from "@/ui/patterns";
import { registrarConsentimento } from "@/application/clientes/acoes";

/**
 * A preferência promocional do cliente.
 *
 * NÃO É UM INTERRUPTOR SILENCIOSO. Cada mudança grava quem registrou, quando
 * e por qual canal — o histórico aparece logo abaixo, na própria ficha. É o
 * que permite responder "quando ele pediu para não receber?" meses depois
 * (RN-RMKT-006/007).
 */
export function PreferenciaPromocional({
  clienteId,
  aceita,
}: {
  clienteId: string;
  aceita: boolean;
}) {
  const [observacao, setObservacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  const alternar = () => {
    setErro(null);
    setOk(null);
    iniciar(async () => {
      const r = await registrarConsentimento({
        cliente_id: clienteId,
        aceita: !aceita,
        ...(observacao.trim() ? { observacao: observacao.trim() } : {}),
      });
      if (r.ok) {
        setObservacao("");
        setOk(
          !aceita
            ? "Registrado: o cliente aceita contato promocional."
            : "Registrado: o cliente não quer contato promocional.",
        );
      } else {
        setErro(r.erro);
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-[13.5px] text-ink">
        {aceita
          ? "Aceita receber contato promocional."
          : "Pediu para não receber contato promocional."}
      </p>
      {/* RN-RMKT-008: falar sobre um pedido em andamento é outra coisa. */}
      <p className="m-0 text-[12px] text-muted">
        Isto vale para promoção. Falar com o cliente sobre um pedido em andamento não depende
        desta preferência.
      </p>

      <Textarea
        label="Observação (opcional)"
        rows={2}
        value={observacao}
        onChange={(e) => setObservacao(e.target.value)}
        placeholder="Ex.: pediu por WhatsApp para parar de receber."
      />

      <Aviso {...(erro ? { erro } : {})} {...(ok ? { ok } : {})} />

      <Button
        variante={aceita ? "secundario" : "primario"}
        tamanho="md"
        disabled={enviando}
        onClick={alternar}
      >
        {aceita ? "Registrar que não quer receber" : "Registrar que aceita receber"}
      </Button>
    </div>
  );
}
