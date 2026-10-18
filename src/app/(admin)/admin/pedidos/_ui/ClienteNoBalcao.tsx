"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { formatBRL } from "@/lib/format";
import { remontarItens } from "@/application/pedidos/acoes";
import type {
  ClienteNoBalcao,
  ConfiguracaoSalva,
  EnderecoSalvo,
  ItemDoRascunho,
} from "@/application/pedidos/tipos";

/**
 * O que o balcão mostra do cliente reconhecido pelo WhatsApp (RN-MAN-007).
 *
 * Tudo aqui é atalho, não autoridade: o último pedido e os "mais pedidos"
 * voltam para o rascunho REMONTADOS pelo motor de hoje (preço, promoção e
 * disponibilidade atuais), e a criação recalcula tudo outra vez. Bloqueio é
 * avisado aqui e recusado de novo pelo `criar_pedido`.
 */

const DATA = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  timeZone: "America/Sao_Paulo",
});
const MES_ANO = new Intl.DateTimeFormat("pt-BR", {
  month: "short",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
});

export function ResumoDoCliente({ dados }: { dados: ClienteNoBalcao }) {
  const c = dados.cliente;

  if (c.bloqueado) {
    return (
      <div role="alert" className="rounded-12 border border-tdb bg-td px-3 py-2.5 text-tdf">
        <p className="m-0 text-[14px] font-bold">Cliente bloqueado — {c.nome}</p>
        <p className="m-0 mt-0.5 text-[13px]">
          Motivo interno: {c.motivo_bloqueio?.trim() || "não informado"}.
        </p>
        <p className="m-0 mt-1 text-[12.5px]">
          Não é possível lançar pedido para este WhatsApp. O motivo é interno: não
          repasse ao cliente.
        </p>
      </div>
    );
  }

  const partes = [
    `cliente desde ${MES_ANO.format(new Date(c.desde))}`,
    c.pedidos === 1 ? "1 pedido concluído" : `${c.pedidos} pedidos concluídos`,
    c.ultimo_em ? `último em ${DATA.format(new Date(c.ultimo_em))}` : null,
    c.ticket_medio !== null ? `ticket médio ${formatBRL(c.ticket_medio)}` : null,
  ].filter(Boolean);

  const emAberto = dados.em_aberto ?? null;

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-12 border border-tgb bg-tg px-3 py-2.5">
        <p className="m-0 text-[14px] font-bold text-tgf">Cliente reconhecido — {c.nome}</p>
        <p className="m-0 mt-0.5 text-[12.5px] text-ink-2">{partes.join(" · ")}</p>
      </div>
      {/* Fiado em aberto (D-2026-10-17-153): aviso, não bloqueio. */}
      {emAberto !== null && Number(emAberto.valor) > 0 ? (
        <div role="status" className="rounded-12 border border-twb bg-tw px-3 py-2.5 text-twf">
          <p className="m-0 text-[13.5px] font-bold">
            Tem {formatBRL(Number(emAberto.valor))} em aberto no fiado
          </p>
          <p className="m-0 mt-0.5 text-[12.5px]">
            {emAberto.pedidos === 1 ? "1 pedido" : `${emAberto.pedidos} pedidos`} desde{" "}
            {DATA.format(new Date(emAberto.desde))}.{" "}
            <Link href={`/admin/clientes/${c.id}`} className="font-semibold text-twf underline">
              Ver na ficha
            </Link>
          </p>
        </div>
      ) : null}
    </div>
  );
}

function descreverEndereco(e: EnderecoSalvo): string {
  return [
    `${e.logradouro}, ${e.numero}`,
    e.complemento,
    e.bairro,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function EnderecosSalvos({
  enderecos,
  selecionado,
  aoEscolher,
}: {
  enderecos: EnderecoSalvo[];
  selecionado: string | null;
  aoEscolher: (endereco: EnderecoSalvo | null) => void;
}) {
  const opcao = (ativo: boolean) =>
    [
      "motion-interactive flex min-h-touch w-full cursor-pointer flex-col items-start rounded-12 border-[1.5px] px-3 py-2 text-left transition-colors",
      ativo ? "border-brand-red bg-bg" : "border-border-shalon bg-surface hover:border-brand-orange",
    ].join(" ");

  return (
    <div className="flex flex-col gap-2" role="radiogroup" aria-label="Endereços salvos do cliente">
      {enderecos.map((e) => (
        <button
          key={e.id}
          type="button"
          role="radio"
          aria-checked={selecionado === e.id}
          onClick={() => aoEscolher(e)}
          className={opcao(selecionado === e.id)}
        >
          <span className="text-[14px] font-semibold text-ink">
            {e.rotulo?.trim() || descreverEndereco(e)}
            {e.preferido ? <span className="ml-1.5 text-[12px] font-bold text-tgf">preferido</span> : null}
          </span>
          <span className="text-[12.5px] text-ink-2">
            {e.rotulo?.trim() ? `${descreverEndereco(e)} · ` : ""}
            {e.cidade}/{e.uf}
          </span>
        </button>
      ))}
      <button
        type="button"
        role="radio"
        aria-checked={selecionado === null}
        onClick={() => aoEscolher(null)}
        className={opcao(selecionado === null)}
      >
        <span className="text-[14px] font-semibold text-ink">Outro endereço</span>
        <span className="text-[12.5px] text-ink-2">Digitar um endereço novo</span>
      </button>
    </div>
  );
}

let sequencia = 0;

function paraRascunho(
  config: ConfiguracaoSalva,
  montado: { nome: string; preco_unitario: number; total: number; rotulos: string[]; quantidade: number },
): ItemDoRascunho {
  sequencia += 1;
  return {
    linha: `${config.produto_id}|${config.variacao_id ?? "-"}|${[...config.sabores].sort().join("+")}|${config.borda_id ?? "-"}|${[...config.adicionais].sort().join("+")}|${config.observacao.trim().toLowerCase()}|${Date.now()}-${sequencia}`,
    produtoId: config.produto_id,
    produtoSlug: "",
    nome: montado.nome,
    variacaoId: config.variacao_id,
    sabores: config.sabores,
    bordaId: config.borda_id,
    adicionais: config.adicionais,
    observacao: config.observacao,
    quantidade: montado.quantidade,
    precoUnitario: montado.preco_unitario,
    total: montado.total,
    rotulos: montado.rotulos,
  };
}

export function AtalhosDoCliente({
  dados,
  aoAdicionar,
}: {
  dados: ClienteNoBalcao;
  aoAdicionar: (itens: ItemDoRascunho[]) => void;
}) {
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ tipo: "ok" | "falha"; linhas: string[] } | null>(null);

  const ultimo = dados.ultimo_pedido;
  if (dados.cliente.bloqueado || (ultimo === null && dados.mais_pedidos.length === 0)) return null;

  function adicionar(entradas: { nome: string; configuracao: ConfiguracaoSalva }[]) {
    setAviso(null);
    iniciar(async () => {
      const montados = await remontarItens(entradas.map((e) => e.configuracao));
      const novos: ItemDoRascunho[] = [];
      const falhas: string[] = [];
      montados.forEach((m, i) => {
        const entrada = entradas[i];
        if (!entrada) return;
        if (m.ok) novos.push(paraRascunho(entrada.configuracao, m));
        else falhas.push(`${m.nome ?? entrada.nome}: ${m.erro}`);
      });
      if (novos.length > 0) aoAdicionar(novos);
      setAviso(
        falhas.length > 0
          ? { tipo: "falha", linhas: falhas }
          : {
              tipo: "ok",
              linhas: [
                novos.length === 1
                  ? "Item adicionado com o preço de hoje."
                  : `${novos.length} itens adicionados com o preço de hoje.`,
              ],
            },
      );
    });
  }

  return (
    <div className="mb-3 flex flex-col gap-2 rounded-12 border border-border-shalon bg-bg p-3">
      {ultimo !== null && ultimo.itens.length > 0 ? (
        <div>
          <button
            type="button"
            disabled={pendente}
            onClick={() => adicionar(ultimo.itens)}
            className="motion-interactive inline-flex min-h-touch cursor-pointer items-center rounded-11 border-[1.5px] border-brand-orange bg-surface px-3 text-[13.5px] font-bold text-ink transition-colors hover:bg-bg disabled:cursor-wait disabled:opacity-60"
          >
            {pendente ? "Montando…" : `Repetir último pedido (#${ultimo.numero}, ${DATA.format(new Date(ultimo.em))})`}
          </button>
          <p className="m-0 mt-1 text-[12px] text-ink-2">
            {ultimo.itens.map((i) => `${i.configuracao.quantidade}× ${i.nome}`).join(" · ")}
          </p>
        </div>
      ) : null}

      {dados.mais_pedidos.length > 0 ? (
        <div>
          <p className="m-0 mb-1 text-[12.5px] font-bold text-ink-2">Mais pedidos por este cliente</p>
          <div className="flex flex-wrap gap-2">
            {dados.mais_pedidos.map((m) => (
              <button
                key={`${m.configuracao.produto_id}|${m.configuracao.variacao_id ?? "-"}`}
                type="button"
                disabled={pendente}
                onClick={() => adicionar([m])}
                className="motion-interactive inline-flex min-h-touch cursor-pointer items-center gap-1.5 rounded-pill border border-border-shalon bg-surface px-3 text-[13px] font-semibold text-ink transition-colors hover:border-brand-orange disabled:cursor-wait disabled:opacity-60"
              >
                + {m.nome}
                <span className="text-[11.5px] font-normal text-muted">{m.vezes}×</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {aviso !== null ? (
        <div
          role={aviso.tipo === "falha" ? "alert" : "status"}
          className={[
            "rounded-10 px-3 py-2 text-[12.5px] font-semibold",
            aviso.tipo === "falha" ? "bg-tw text-twf" : "bg-tg text-tgf",
          ].join(" ")}
        >
          {aviso.tipo === "falha" ? <p className="m-0">Não entrou no pedido:</p> : null}
          {aviso.linhas.map((l) => (
            <p key={l} className="m-0">
              {l}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
