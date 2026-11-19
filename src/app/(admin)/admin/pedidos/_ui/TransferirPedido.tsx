"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { formatBRL } from "@/lib/format";
import { buscarClienteParaBalcao, transferirPedido } from "@/application/pedidos/acoes";
import type { PedidoAdministrativo } from "@/application/pedidos/tipos";

/** Motivos de um toque, para o caso do dia a dia. O campo continua livre. */
const MOTIVOS = ["Cliente não veio buscar", "Cliente desistiu do pedido"];

const CAMPO =
  "min-h-touch w-full rounded-11 border-[1.5px] border-border-shalon bg-surface px-3 text-[14px] text-ink focus:border-brand-orange focus:outline-none";

/**
 * Transferir pedido pronto para outro cliente (D-2026-11-19-190).
 *
 * A tela só diz quem leva e por quê. Quem confere se está pronto, se ninguém
 * pagou, qual o cadastro de quem leva e o total novo é `transferir_pedido`.
 * O "novo total" mostrado aqui é só aviso; o que vale é o do banco.
 */
export function TransferirPedido({
  pedido,
  fecharEm,
}: {
  pedido: PedidoAdministrativo;
  fecharEm: string;
}) {
  const router = useRouter();
  const [whatsapp, setWhatsapp] = useState("");
  const [nome, setNome] = useState("");
  const [motivo, setMotivo] = useState("");
  // Guardado com o número consultado: se o número mudar, o aviso some sozinho.
  const [achado, setAchado] = useState<{ digitos: string; nome: string } | null>(null);
  const digitos = whatsapp.replace(/\D/g, "");
  const reconhecido = achado?.digitos === digitos ? achado.nome : null;
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  // Reconhece quem leva pelo WhatsApp completo, como no Novo pedido, para não
  // redigitar o nome. É só atalho: sem permissão de ver clientes, não acha.
  useEffect(() => {
    if (digitos.length < 10) return;
    let vivo = true;
    const id = window.setTimeout(async () => {
      const r = await buscarClienteParaBalcao(digitos);
      if (!vivo || !r.ok || !r.encontrado) return;
      setAchado({ digitos, nome: r.cliente.nome });
      setNome((atual) => (atual.trim() === "" ? r.cliente.nome : atual));
    }, 350);
    return () => {
      vivo = false;
      window.clearTimeout(id);
    };
  }, [digitos]);

  const eraEntrega = pedido.modalidade === "delivery";
  const novoTotal = eraEntrega ? pedido.total - pedido.taxa_entrega : pedido.total;
  const pronto = nome.trim().length > 0 && motivo.trim().length >= 3 && !enviando;

  function enviar() {
    setErro(null);
    iniciar(async () => {
      const r = await transferirPedido({
        pedido_id: pedido.id,
        nome: nome.trim(),
        whatsapp,
        motivo: motivo.trim(),
      });
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      router.replace(fecharEm);
    });
  }

  return (
    <form
      onSubmit={(evento) => {
        evento.preventDefault();
        if (pronto) enviar();
      }}
      className="flex flex-col gap-4"
    >
      <div className="rounded-12 border border-border-shalon bg-elev px-3 py-2.5 text-[13.5px] text-ink-2">
        <p className="m-0">
          Hoje está com <strong className="text-ink">{pedido.cliente.nome}</strong>
          {pedido.cliente.whatsapp ? ` · ${pedido.cliente.whatsapp}` : ""}.
        </p>
        <p className="m-0 mt-1">
          Passa para quem vai levar agora, <strong className="text-ink">como retirada no balcão</strong>.
          {eraEntrega
            ? ` A taxa de entrega de ${formatBRL(pedido.taxa_entrega)} sai, e o total fica ${formatBRL(novoTotal)}.`
            : ` O total continua ${formatBRL(novoTotal)}.`}
        </p>
        <p className="m-0 mt-1">
          O link de acompanhamento de {pedido.cliente.nome} deixa de abrir este pedido.
        </p>
      </div>

      <div>
        <label htmlFor="transferir-whatsapp" className="mb-[6px] block text-[13.5px] font-semibold text-ink">
          WhatsApp de quem vai levar <span className="font-normal text-muted">(opcional)</span>
        </label>
        <input
          id="transferir-whatsapp"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          placeholder="(11) 90000-0000"
          maxLength={20}
          className={CAMPO}
        />
        {reconhecido ? (
          <p className="m-0 mt-1 text-[12.5px] font-semibold text-tgf">Cliente reconhecido: {reconhecido}</p>
        ) : (
          <p className="m-0 mt-1 text-[12px] text-muted">
            Com o WhatsApp, a compra entra no cadastro de quem levou.
          </p>
        )}
      </div>

      <div>
        <label htmlFor="transferir-nome" className="mb-[6px] block text-[13.5px] font-semibold text-ink">
          Nome de quem vai levar
        </label>
        <input
          id="transferir-nome"
          type="text"
          autoComplete="off"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          maxLength={120}
          className={CAMPO}
        />
      </div>

      <div>
        <label htmlFor="transferir-motivo" className="mb-[6px] block text-[13.5px] font-semibold text-ink">
          Motivo
        </label>
        <div className="mb-2 flex flex-wrap gap-2">
          {MOTIVOS.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={motivo === m}
              onClick={() => setMotivo(m)}
              className={[
                "min-h-touch cursor-pointer rounded-11 px-3 text-[13px] font-semibold transition-colors",
                motivo === m
                  ? "border-[1.5px] border-transparent bg-cta text-cta-fg"
                  : "border-[1.5px] border-border-shalon bg-surface text-ink hover:border-brand-orange",
              ].join(" ")}
            >
              {m}
            </button>
          ))}
        </div>
        <textarea
          id="transferir-motivo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={2}
          maxLength={400}
          className="w-full resize-y rounded-11 border-[1.5px] border-border-shalon bg-surface px-3 py-2 text-[14px] text-ink focus:border-brand-orange focus:outline-none"
        />
        <p className="m-0 mt-1 text-[12px] text-muted">
          Fica registrado no histórico do pedido e na auditoria, com quem era o cliente.
        </p>
      </div>

      {erro !== null ? (
        <p role="alert" className="m-0 rounded-10 bg-td px-3 py-2 text-[13px] font-semibold text-tdf">
          {erro}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={!pronto}
          className="min-h-touch cursor-pointer rounded-11 border-0 bg-cta px-4 text-[14px] font-semibold text-cta-fg disabled:cursor-not-allowed disabled:bg-tn disabled:text-muted"
        >
          {enviando ? "Transferindo…" : "Transferir pedido"}
        </button>
        <button
          type="button"
          onClick={() => router.replace(fecharEm)}
          disabled={enviando}
          className="min-h-touch cursor-pointer rounded-11 border-[1.5px] border-border-shalon bg-surface px-4 text-[14px] font-semibold text-ink disabled:opacity-60"
        >
          Voltar
        </button>
      </div>
    </form>
  );
}
