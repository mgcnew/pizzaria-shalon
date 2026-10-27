"use client";

import { useState, useTransition } from "react";
import { Button } from "@/ui/components";
import { Aviso, Cartao } from "@/ui/patterns";
import { definirPermissoesDoPapel } from "@/application/equipe/acoes";
import type { PapelComPermissoes } from "@/application/equipe/tipos";
import {
  ATALHOS_DE_PERMISSOES,
  GRUPOS_DE_PERMISSOES,
  dependenciasFaltando,
  marcarComDependencias,
  permissao,
  type GrupoDePermissoes,
} from "@/domain/equipe/permissoes";

/**
 * O que cada papel pode ver e fazer (D-2026-10-15-122, D-2026-10-27-168).
 *
 * Esconder na tela não é segurança: o que vale é o banco, que já lê estas
 * mesmas permissões. Aqui só se marca e se salva; a RPC recusa o que a dona
 * não possui e o papel dela, que é sempre completo.
 *
 * Cada item diz o que libera e de quais outros precisa (src/domain/equipe/
 * permissoes.ts). Marcar traz junto as dependências; desmarcar uma de que
 * outro item precisa deixa o aviso nele, para a dona ver o que vai parar.
 */

const CONHECIDOS = new Set(GRUPOS_DE_PERMISSOES.flatMap((g) => g.itens.map((p) => p.codigo)));

function rotulos(codigos: readonly string[]): string {
  return codigos.map((c) => permissao(c)?.rotulo ?? c).join(", ");
}

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
  const [nota, setNota] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();

  if (!papel) return null;
  const atuais = marcados[papel.id] ?? [];
  const idDe = new Map(catalogo.map((p) => [p.codigo, p.id]));
  const extras = catalogo.map((p) => p.codigo).filter((c) => !CONHECIDOS.has(c));
  const grupos: readonly GrupoDePermissoes[] = extras.length
    ? [...GRUPOS_DE_PERMISSOES, {
        titulo: "Outras",
        itens: extras.map((c) => ({ codigo: c, rotulo: c, explica: "Permissão sem descrição nesta versão." })),
      }]
    : GRUPOS_DE_PERMISSOES;
  const comAviso = atuais.filter((c) => dependenciasFaltando(c, atuais).length > 0);

  function definir(lista: string[]) {
    setMsg(null);
    setMarcados((m) => ({ ...m, [papel!.id]: lista }));
  }

  function alternar(codigo: string) {
    if (atuais.includes(codigo)) {
      definir(atuais.filter((c) => c !== codigo));
      setNota(null);
      return;
    }
    const r = marcarComDependencias(codigo, atuais);
    definir(r.marcados);
    setNota(r.junto.length ? `Marcado junto, porque "${permissao(codigo)?.rotulo}" precisa: ${rotulos(r.junto)}.` : null);
  }

  function aplicarAtalho(codigos: readonly string[], titulo: string) {
    let lista = atuais;
    for (const c of codigos) lista = marcarComDependencias(c, lista).marcados;
    const novos = lista.filter((c) => !atuais.includes(c));
    definir(lista);
    setNota(novos.length ? `"${titulo}": marcado ${rotulos(novos)}. Falta salvar.` : `"${titulo}" já estava completo.`);
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
              Marque o que o papel pode ver e fazer. A proprietária sempre tem tudo. Embaixo de cada
              item está o que ele libera; ao marcar, o que ele precisa para funcionar vem junto.
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
                  setNota(null);
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

          <section aria-labelledby="atalhos-permissoes" className="flex flex-col gap-2">
            <h3 id="atalhos-permissoes" className="m-0 text-[13px] font-bold text-ink">Marcar por tarefa</h3>
            <p className="m-0 text-[12.5px] text-muted">
              Cada atalho marca tudo o que a tarefa precisa. Ele só acrescenta; nada é desmarcado.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {ATALHOS_DE_PERMISSOES.map((a) => {
                const completo = a.codigos.every((c) => atuais.includes(c));
                return (
                  <button
                    key={a.titulo}
                    type="button"
                    onClick={() => aplicarAtalho(a.codigos, a.titulo)}
                    className="flex min-h-[44px] flex-col items-start gap-0.5 rounded-12 border border-border-shalon bg-surface px-3 py-2 text-left"
                  >
                    <span className="text-[13.5px] font-semibold text-ink">
                      {completo ? "✓ " : "+ "}
                      {a.titulo}
                    </span>
                    <span className="text-[12px] text-muted">{completo ? "Já está tudo marcado." : a.explica}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {nota ? (
            <p role="status" className="m-0 rounded-12 border border-border-shalon bg-surface px-3 py-2 text-[13px] text-ink">
              {nota}
            </p>
          ) : null}

          {comAviso.length > 0 ? (
            <p className="m-0 rounded-12 border-[1.5px] border-twb bg-tw px-3 py-2 text-[13px] font-semibold text-twf">
              {comAviso.length === 1
                ? "1 permissão marcada não vai funcionar sem outra. Veja o aviso no item."
                : `${comAviso.length} permissões marcadas não vão funcionar sem outras. Veja o aviso em cada item.`}
            </p>
          ) : null}

          {grupos.map((grupo) => (
            <fieldset key={grupo.titulo} className="m-0 min-w-0 border-0 p-0">
              <legend className="mb-1 p-0 text-[13px] font-bold text-ink">{grupo.titulo}</legend>
              <div className="flex flex-col">
                {grupo.itens.map((p) => {
                  const marcado = atuais.includes(p.codigo);
                  const faltando = marcado ? dependenciasFaltando(p.codigo, atuais) : [];
                  const idExplica = `explica-${p.codigo}`;
                  return (
                    <div key={p.codigo} className="border-t border-border-shalon py-1.5 first:border-t-0">
                      <label className="flex min-h-[44px] cursor-pointer items-start gap-3 text-[14px] text-ink">
                        <input
                          type="checkbox"
                          className="mt-[3px] h-5 w-5 shrink-0 accent-[var(--shalon-red,#b91c1c)]"
                          checked={marcado}
                          onChange={() => alternar(p.codigo)}
                          aria-describedby={idExplica}
                        />
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span>
                            {p.rotulo}
                            {p.sensivel ? (
                              <span className="ml-2 rounded-pill border border-border-shalon px-2 py-[1px] align-middle text-[11px] font-semibold text-muted">
                                sensível
                              </span>
                            ) : null}
                          </span>
                          <span id={idExplica} className="text-[12.5px] leading-snug text-muted">{p.explica}</span>
                        </span>
                      </label>
                      {faltando.length > 0 ? (
                        <div className="ml-8 mt-1 flex flex-wrap items-center gap-2 text-[12.5px] font-semibold text-twf">
                          <span>Não funciona sem: {rotulos(faltando)}.</span>
                          <button
                            type="button"
                            onClick={() => definir(marcarComDependencias(p.codigo, atuais.filter((c) => c !== p.codigo)).marcados)}
                            className="min-h-[32px] rounded-pill border border-twb bg-tw px-3 text-[12.5px] font-semibold text-twf"
                          >
                            Marcar o que falta
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
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
