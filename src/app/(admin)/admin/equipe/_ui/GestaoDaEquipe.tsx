"use client";

import { useState, useTransition } from "react";
import { Badge, Button, CampoDataHora, Input, SelectMenu, Textarea } from "@/ui/components";
import { Aviso, Cartao, EmptyState, LinhaLista } from "@/ui/patterns";
import {
  definirAcesso,
  definirPapeis,
  desligarFuncionario,
  reativarFuncionario,
  salvarFuncionario,
  vincularAcesso,
} from "@/application/equipe/acoes";
import { convidarFuncionario } from "@/application/equipe/convite";
import type { MembroDaEquipe, PapelAtribuivel, ReferenciaSalarial } from "@/application/equipe/tipos";

/**
 * Cadastro de funcionários, acesso ao sistema e papéis.
 *
 * A TELA CARREGA A SEPARAÇÃO DE TRÊS CONCEITOS (CLAUDE.md §10.1, §14):
 *
 *   funcionário — a pessoa. O motoboy é um, e normalmente não tem mais nada.
 *   acesso      — a conta que entra no sistema. Opcional.
 *   papéis      — o que aquela conta pode fazer. Um segundo ato, deliberado.
 *
 * A referência salarial chega por consulta separada, somente com permissão
 * financeira. Ela não integra `equipe()`, que também serve ao atendente.
 *
 * O QUE ELA NÃO FAZ: criar conta de login. Isso exigiria `service_role` e uma
 * política de senha que ainda não está normatizada (A-20). A tela vincula uma
 * conta que já existe e diz isso com todas as letras quando ela não existe.
 */

const TIPOS: { valor: MembroDaEquipe["tipo"]; texto: string }[] = [
  { valor: "counter", texto: "Balcão / atendimento" },
  { valor: "driver", texto: "Entregador" },
  { valor: "owner", texto: "Proprietária / sócio" },
  { valor: "other", texto: "Outro" },
];

const ROTULO_TIPO: Record<MembroDaEquipe["tipo"], string> = {
  counter: "Balcão",
  driver: "Entregador",
  owner: "Proprietária",
  other: "Outro",
};

type Rascunho = {
  id: string | null;
  nome: string;
  telefone: string;
  tipo: MembroDaEquipe["tipo"];
  entregador: boolean;
  admitido_em: string;
  observacao: string;
  salario: string;
  baseSalarial: ReferenciaSalarial["base"];
  temReferencia: boolean;
};

const VAZIO: Rascunho = {
  id: null,
  nome: "",
  telefone: "",
  tipo: "counter",
  entregador: false,
  admitido_em: "",
  observacao: "",
  salario: "",
  baseSalarial: "monthly",
  temReferencia: false,
};

function salarioEmNumero(texto: string): number | null {
  const valor = texto.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(valor)) return null;
  const numero = Number(valor);
  return Number.isFinite(numero) && numero <= 9999999999.99 ? numero : null;
}

export function GestaoDaEquipe({
  equipe,
  papeis,
  referencias,
  podeGerir,
  podeGerirSalario,
  podeGerirAcesso,
}: {
  equipe: MembroDaEquipe[];
  papeis: PapelAtribuivel[];
  referencias: ReferenciaSalarial[] | null;
  /** `employees.manage`. */
  podeGerir: boolean;
  /** `employees.manage` e permissões financeiras de leitura e escrita. */
  podeGerirSalario: boolean;
  /** `employees.manage` E `roles.manage`: dar acesso exige as duas. */
  podeGerirAcesso: boolean;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [desligando, setDesligando] = useState<string | null>(null);
  const [motivoDesligamento, setMotivoDesligamento] = useState("");
  const [vinculando, setVinculando] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [editandoPapeis, setEditandoPapeis] = useState<string | null>(null);
  const [selecionados, setSelecionados] = useState<string[]>([]);

  function executar(acao: () => Promise<{ ok: boolean; erro?: string }>) {
    setErro(null);
    iniciar(async () => {
      const r = await acao();
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível concluir esta ação.");
        return;
      }
      setRascunho(null);
      setDesligando(null);
      setMotivoDesligamento("");
      setVinculando(null);
      setEmail("");
      setEditandoPapeis(null);
      setSelecionados([]);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Aviso {...(erro ? { erro } : {})} />

      {podeGerir ? (
        <Cartao
          titulo={rascunho?.id ? "Editar funcionário" : "Novo funcionário"}
          descricao="Funcionário e acesso ao sistema são coisas diferentes: o entregador costuma ter só o primeiro."
          largura="cheio"
          acao={
            rascunho ? null : (
              <Button variante="primario" onClick={() => setRascunho(VAZIO)}>
                Cadastrar
              </Button>
            )
          }
        >
          {rascunho ? (
            <div className="flex flex-col gap-3">
              <Input
                label="Nome completo"
                value={rascunho.nome}
                onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
              />
              <Input
                label="Telefone"
                hint="Opcional."
                value={rascunho.telefone}
                onChange={(e) => setRascunho({ ...rascunho, telefone: e.target.value })}
              />
              <SelectMenu
                label="Função"
                valor={rascunho.tipo}
                aoMudar={(valor) =>
                  setRascunho({
                    ...rascunho,
                    tipo: valor as MembroDaEquipe["tipo"],
                    // Marcar "Entregador" já liga a caixa: é o caso comum.
                    entregador: valor === "driver" ? true : rascunho.entregador,
                  })
                }
                opcoes={TIPOS.map((t) => ({ valor: t.valor, texto: t.texto }))}
              />

              <label className="flex items-center gap-2 text-[13.5px] text-ink">
                <input
                  type="checkbox"
                  checked={rascunho.entregador}
                  onChange={(e) => setRascunho({ ...rascunho, entregador: e.target.checked })}
                />
                Faz entregas
              </label>

              <CampoDataHora
                label="Admitido em"
                modo="data"
                hint="Opcional."
                valor={rascunho.admitido_em}
                aoMudar={(valor) => setRascunho({ ...rascunho, admitido_em: valor })}
              />
              {podeGerirSalario && referencias === null ? (
                <p role="alert" className="m-0 rounded-11 border border-tdb bg-td p-3 text-[13px] text-tdf">
                  Não foi possível carregar o salário. Reabra a página antes de alterar a referência.
                </p>
              ) : null}
              {podeGerirSalario && referencias !== null ? (
                <div className="grid gap-3 rounded-12 border border-border-shalon bg-elev p-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <p className="m-0 text-[14px] font-bold text-ink">Salário combinado</p>
                    <p className="m-0 mt-1 text-[12px] text-muted">
                      Referência para conferência. Vales e descontos só entram se forem escolhidos no histórico financeiro.
                    </p>
                  </div>
                  <SelectMenu
                    label="Forma do combinado"
                    valor={rascunho.baseSalarial}
                    aoMudar={(valor) => setRascunho({ ...rascunho, baseSalarial: valor as ReferenciaSalarial["base"] })}
                    opcoes={[{ valor: "monthly", texto: "Por mês" }, { valor: "daily", texto: "Por diária" }]}
                  />
                  <Input
                    label={rascunho.baseSalarial === "daily" ? "Valor da diária (R$)" : "Valor mensal (R$)"}
                    inputMode="decimal"
                    placeholder="0,00"
                    value={rascunho.salario}
                    onChange={(e) => setRascunho({ ...rascunho, salario: e.target.value })}
                    hint="Deixe em branco se ainda não houver combinado."
                  />
                </div>
              ) : null}
              <Textarea
                label="Observação"
                value={rascunho.observacao}
                onChange={(e) => setRascunho({ ...rascunho, observacao: e.target.value })}
                rows={2}
              />

              <div className="flex gap-2">
                <Button
                  variante="primario"
                  disabled={enviando || rascunho.nome.trim().length < 2 ||
                    (podeGerirSalario && referencias === null) ||
                    (podeGerirSalario && rascunho.salario.trim() !== "" && salarioEmNumero(rascunho.salario) === null)}
                  onClick={() =>
                    executar(() =>
                      salvarFuncionario({
                        id: rascunho.id,
                        nome: rascunho.nome.trim(),
                        telefone: rascunho.telefone.trim() || undefined,
                        tipo: rascunho.tipo,
                        entregador: rascunho.entregador,
                        admitido_em: rascunho.admitido_em || undefined,
                        observacao: rascunho.observacao.trim() || undefined,
                        ...(podeGerirSalario && (rascunho.salario.trim() !== "" || rascunho.temReferencia)
                          ? { salario_valor: rascunho.salario.trim() === "" ? null : salarioEmNumero(rascunho.salario),
                              salario_base: rascunho.baseSalarial }
                          : {}),
                      }),
                    )
                  }
                >
                  Salvar
                </Button>
                <Button variante="secundario" onClick={() => setRascunho(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : null}
        </Cartao>
      ) : null}

      <Cartao titulo="Equipe" largura="cheio">
        {equipe.length === 0 ? (
          <EmptyState titulo="Ninguém cadastrado" descricao="Nenhum funcionário até agora." />
        ) : (
          equipe.map((m) => (
            <LinhaLista key={m.funcionario_id}>
              <div className="min-w-[200px] flex-1">
                <p className="m-0 text-[14px] font-semibold text-ink">{m.nome}</p>
                <p className="m-0 text-[12.5px] text-muted">
                  {ROTULO_TIPO[m.tipo]}
                  {m.entregador ? " · faz entregas" : ""}
                  {m.telefone ? ` · ${m.telefone}` : ""}
                </p>
                <p className="m-0 text-[12.5px] text-muted">
                  {/* RN-MOTO-001: "sem acesso" é resposta normal, não pendência. */}
                  {m.acesso === null
                    ? "Sem acesso ao sistema"
                    : `Acesso ${m.acesso.ativo ? "ativo" : "desativado"} · ${
                        m.acesso.papeis.length === 0
                          ? "sem papel"
                          : m.acesso.papeis.map((p) => p.nome).join(", ")
                      }`}
                </p>
                {m.desligado_em ? (
                  <p className="m-0 text-[12.5px] text-muted">
                    Desligado em {new Date(`${m.desligado_em}T12:00:00`).toLocaleDateString("pt-BR")}
                  </p>
                ) : null}
              </div>

              {m.ativo ? null : <Badge tom="indisponivel">Desligado</Badge>}

              {podeGerir ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variante="secundario"
                    onClick={() => {
                      const referencia = referencias?.find((item) => item.funcionario_id === m.funcionario_id);
                      setRascunho({
                        id: m.funcionario_id,
                        nome: m.nome,
                        telefone: m.telefone ?? "",
                        tipo: m.tipo,
                        entregador: m.entregador,
                        admitido_em: m.admitido_em ?? "",
                        observacao: m.observacao ?? "",
                        salario: referencia?.valor == null ? "" : String(referencia.valor).replace(".", ","),
                        baseSalarial: referencia?.base ?? "monthly",
                        temReferencia: referencia !== undefined,
                      });
                    }}
                  >
                    Editar
                  </Button>

                  {m.ativo ? (
                    <Button variante="secundario" onClick={() => setDesligando(m.funcionario_id)}>
                      Desligar
                    </Button>
                  ) : (
                    <Button
                      variante="secundario"
                      disabled={enviando}
                      onClick={() => executar(() => reativarFuncionario({ id: m.funcionario_id }))}
                    >
                      Reativar
                    </Button>
                  )}

                  {podeGerirAcesso && m.ativo ? (
                    m.acesso === null ? (
                      <Button variante="secundario" onClick={() => setVinculando(m.funcionario_id)}>
                        Dar acesso
                      </Button>
                    ) : (
                      <>
                        <Button
                          variante="secundario"
                          onClick={() => {
                            setEditandoPapeis(m.acesso!.app_user_id);
                            setSelecionados(m.acesso!.papeis.map((p) => p.id));
                          }}
                        >
                          Papéis
                        </Button>
                        <Button
                          variante="secundario"
                          disabled={enviando}
                          onClick={() =>
                            executar(() =>
                              definirAcesso({
                                app_user_id: m.acesso!.app_user_id,
                                ativo: !m.acesso!.ativo,
                              }),
                            )
                          }
                        >
                          {m.acesso.ativo ? "Desativar acesso" : "Reativar acesso"}
                        </Button>
                      </>
                    )
                  ) : null}
                </div>
              ) : null}
            </LinhaLista>
          ))
        )}

        {/* RN-FUNC-001: desligar é data e revoga acesso. Nada é apagado. */}
        {desligando ? (
          <div className="mt-3 flex flex-col gap-2 border-t border-border-shalon pt-3">
            <p className="m-0 text-[13px] text-muted">
              O funcionário continua no histórico — entregas, acertos e lançamentos permanecem. O
              acesso ao sistema, se houver, é desativado junto.
            </p>
            <Textarea
              label="Motivo do desligamento"
              value={motivoDesligamento}
              onChange={(e) => setMotivoDesligamento(e.target.value)}
              rows={2}
            />
            <div className="flex gap-2">
              <Button
                variante="primario"
                disabled={enviando}
                onClick={() =>
                  executar(() =>
                    desligarFuncionario({
                      id: desligando,
                      motivo: motivoDesligamento.trim() || undefined,
                    }),
                  )
                }
              >
                Confirmar desligamento
              </Button>
              <Button variante="secundario" onClick={() => setDesligando(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : null}

        {vinculando ? (
          <div className="mt-3 flex flex-col gap-2 border-t border-border-shalon pt-3">
            <p className="m-0 text-[13px] text-muted">
              Envie um convite: a pessoa recebe um e-mail, define a própria senha e entra. Se ela
              já tem uma conta no sistema, use “Vincular conta existente”.
            </p>
            <Input
              label="E-mail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                variante="primario"
                disabled={enviando || !email.includes("@")}
                onClick={() =>
                  executar(() =>
                    convidarFuncionario({ funcionario_id: vinculando, email: email.trim() }),
                  )
                }
              >
                Enviar convite
              </Button>
              <Button
                variante="secundario"
                disabled={enviando || !email.includes("@")}
                onClick={() =>
                  executar(() =>
                    vincularAcesso({ funcionario_id: vinculando, email: email.trim() }),
                  )
                }
              >
                Vincular conta existente
              </Button>
              <Button variante="secundario" onClick={() => setVinculando(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : null}

        {/* RN-RBAC-005: a lista já esconde o que este usuário não pode conceder. */}
        {editandoPapeis ? (
          <div className="mt-3 flex flex-col gap-2 border-t border-border-shalon pt-3">
            <p className="m-0 text-[13px] text-muted">
              Você só pode conceder papéis cujas permissões você mesmo possui.
            </p>
            {papeis.map((p) => (
              <label
                key={p.id}
                className={`flex items-center gap-2 text-[13.5px] ${
                  p.pode_conceder ? "text-ink" : "text-muted"
                }`}
              >
                <input
                  type="checkbox"
                  disabled={!p.pode_conceder}
                  checked={selecionados.includes(p.id)}
                  onChange={(e) =>
                    setSelecionados((atual) =>
                      e.target.checked ? [...atual, p.id] : atual.filter((x) => x !== p.id),
                    )
                  }
                />
                {p.nome}
                {p.pode_conceder ? "" : " — além do que você administra"}
              </label>
            ))}
            <div className="flex gap-2">
              <Button
                variante="primario"
                disabled={enviando}
                onClick={() =>
                  executar(() =>
                    definirPapeis({ app_user_id: editandoPapeis, papeis: selecionados }),
                  )
                }
              >
                Salvar papéis
              </Button>
              <Button variante="secundario" onClick={() => setEditandoPapeis(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : null}
      </Cartao>
    </div>
  );
}
