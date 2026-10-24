"use client";

import { useState, useTransition } from "react";
import { Button } from "@/ui/components";
import { Aviso, Cartao } from "@/ui/patterns";
import { definirPermissoesDoPapel } from "@/application/equipe/acoes";
import type { PapelComPermissoes } from "@/application/equipe/tipos";

/**
 * O que cada papel pode ver e fazer (D-2026-10-15-122).
 *
 * Esconder na tela não é segurança: o que vale é o banco, que já lê estas
 * mesmas permissões. Aqui só se marca e se salva; a RPC recusa o que a dona
 * não possui e o papel dela, que é sempre completo.
 */

const GRUPOS: { titulo: string; itens: [string, string][] }[] = [
  {
    titulo: "Pedidos",
    itens: [
      ["orders.view", "Ver pedidos"],
      ["orders.create_manual", "Registrar pedido no balcão"],
      ["orders.accept", "Aceitar pedido e imprimir comanda"],
      ["orders.request_change", "Alterar pedido já enviado"],
      ["orders.reprint", "Reimprimir comanda"],
      ["orders.cancel", "Cancelar ou rejeitar pedido"],
      ["orders.confirm_pix", "Confirmar Pix recebido"],
      ["orders.override_delivery_fee", "Mudar a taxa de entrega à mão"],
    ],
  },
  {
    titulo: "Caixa e pagamentos",
    itens: [
      ["cash.view", "Ver o caixa"],
      ["cash.open", "Abrir o caixa"],
      ["cash.close", "Fechar o caixa"],
      ["cash.adjust", "Sangria e reforço"],
      ["cash.reopen", "Reabrir ou corrigir caixa fechado"],
      ["cash.bypass_session", "Receber sem caixa aberto"],
      ["payments.register", "Registrar pagamento recebido"],
      ["orders.defer_payment", "Deixar o pagamento para depois (fiado)"],
    ],
  },
  {
    titulo: "Entregas",
    itens: [
      ["deliveries.view", "Ver entregas"],
      ["deliveries.manage", "Montar saídas e receber acerto do motoboy"],
      ["deliveries.settle", "Conciliar a diferença do acerto"],
    ],
  },
  {
    titulo: "Cardápio",
    itens: [
      ["catalog.view", "Ver produtos"],
      ["catalog.manage", "Criar e editar produtos, preços e disponibilidade"],
    ],
  },
  {
    titulo: "Clientes e remarketing",
    itens: [
      ["customers.view", "Ver clientes"],
      ["customers.block", "Bloquear e desbloquear cliente"],
      ["remarketing.view", "Ver remarketing"],
      ["remarketing.contact", "Registrar contato de remarketing"],
    ],
  },
  {
    titulo: "Financeiro e relatórios",
    itens: [
      ["finance.view", "Ver o financeiro"],
      ["finance.create", "Registrar movimentação financeira"],
      ["finance.reverse", "Estornar movimentação"],
      ["reports.view", "Ver relatórios"],
      ["reports.export", "Exportar relatórios"],
    ],
  },
  {
    titulo: "Equipe",
    itens: [
      ["employees.view", "Ver a equipe"],
      ["employees.manage", "Cadastrar funcionários e dar acesso"],
      ["employees.attendance", "Marcar presença e falta dos funcionários"],
      ["employees.finance.view", "Ver salário e histórico financeiro"],
      ["employees.finance.manage", "Lançar adiantamento e consumo no livro"],
      ["internal.view", "Ver cortesia, consumo e perda"],
      ["internal.register", "Registrar cortesia, consumo e perda"],
    ],
  },
  {
    titulo: "Sistema",
    itens: [
      ["settings.view", "Ver configurações"],
      ["settings.manage", "Alterar configurações"],
      ["roles.manage", "Definir permissões e papéis"],
      ["audit.view", "Ver o registro de auditoria"],
    ],
  },
];

const CONHECIDOS = new Set(GRUPOS.flatMap((g) => g.itens.map(([c]) => c)));

export function PermissoesDosPapeis({
  papeis,
  catalogo,
}: {
  papeis: PapelComPermissoes[];
  catalogo: { id: string; codigo: string }[];
}) {
  const editavel = papeis.filter((p) => !p.somenteLeitura);
  const [papelId, setPapelId] = useState(
    editavel.find((p) => p.nome === "Atendente")?.id ?? editavel[0]?.id ?? "",
  );
  const papel = papeis.find((p) => p.id === papelId);
  const [marcados, setMarcados] = useState<Record<string, string[]>>(
    () => Object.fromEntries(papeis.map((p) => [p.id, p.codigos])),
  );
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [salvando, iniciar] = useTransition();

  if (!papel) return null;
  const atuais = marcados[papel.id] ?? [];
  const idDe = new Map(catalogo.map((p) => [p.codigo, p.id]));
  const extras = catalogo.map((p) => p.codigo).filter((c) => !CONHECIDOS.has(c));
  const grupos = extras.length
    ? [...GRUPOS, { titulo: "Outras", itens: extras.map((c) => [c, c] as [string, string]) }]
    : GRUPOS;

  function alternar(codigo: string) {
    setMsg(null);
    setMarcados((m) => {
      const lista = m[papel!.id] ?? [];
      return {
        ...m,
        [papel!.id]: lista.includes(codigo) ? lista.filter((c) => c !== codigo) : [...lista, codigo],
      };
    });
  }

  function salvar() {
    const ids = atuais.map((c) => idDe.get(c)).filter((i): i is string => Boolean(i));
    iniciar(async () => {
      const r = await definirPermissoesDoPapel({ papel_id: papel!.id, permissoes: ids });
      setMsg(
        r.ok
          ? { tipo: "ok", texto: "Salvo. Vale na próxima vez que a pessoa abrir ou atualizar a tela." }
          : { tipo: "erro", texto: r.erro },
      );
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Aviso {...(msg?.tipo === "erro" ? { erro: msg.texto } : {})} />
      <Cartao>
        <div className="flex flex-col gap-4 p-4">
          <div>
            <h2 className="m-0 font-display text-[17px] font-bold text-ink">O que cada papel pode fazer</h2>
            <p className="m-0 mt-1 text-[13px] text-muted">
              Marque o que o papel pode ver e fazer. A proprietária sempre tem tudo. Quem perde uma
              permissão deixa de ver a tela ou o botão correspondente.
            </p>
          </div>

          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Papel">
            {editavel.map((p) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={p.id === papelId}
                onClick={() => {
                  setPapelId(p.id);
                  setMsg(null);
                }}
                className={[
                  "min-h-[44px] rounded-full border px-4 text-[13.5px] font-semibold",
                  p.id === papelId
                    ? "border-ink bg-ink text-surface"
                    : "border-border-shalon bg-surface text-ink",
                ].join(" ")}
              >
                {p.nome}
              </button>
            ))}
          </div>

          {grupos.map((grupo) => (
            <fieldset key={grupo.titulo} className="m-0 min-w-0 border-0 p-0">
              <legend className="mb-1 p-0 text-[13px] font-bold text-ink">{grupo.titulo}</legend>
              <div className="flex flex-col">
                {grupo.itens.map(([codigo, rotulo]) => (
                  <label
                    key={codigo}
                    className="flex min-h-[44px] cursor-pointer items-center gap-3 border-t border-border-shalon py-1.5 text-[14px] text-ink first:border-t-0"
                  >
                    <input
                      type="checkbox"
                      className="h-5 w-5 shrink-0 accent-[var(--shalon-red,#b91c1c)]"
                      checked={atuais.includes(codigo)}
                      onChange={() => alternar(codigo)}
                    />
                    {rotulo}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}

          <div className="flex items-center gap-3">
            <Button onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando…" : `Salvar permissões de ${papel.nome}`}
            </Button>
            {msg?.tipo === "ok" ? (
              <span role="status" className="text-[13px] text-muted">{msg.texto}</span>
            ) : null}
          </div>
        </div>
      </Cartao>
    </div>
  );
}
