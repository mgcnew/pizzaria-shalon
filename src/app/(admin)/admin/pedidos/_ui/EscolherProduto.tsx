"use client";

import { useState, useTransition } from "react";
import { formatBRL } from "@/lib/format";
import {
  buscarProdutos,
  carregarConfigurador,
  carregarConfiguradorDaFogazza,
  carregarSaboresDaFogazza,
} from "@/application/publico/acoes";
import type { CardDeFogazza } from "@/application/publico/consultas";
import type { ResultadoBusca } from "@/application/publico/tipos";
import { filtrarSabores } from "@/domain/catalogo/buscaDeSabor";
import type { ItemDoRascunho } from "@/application/pedidos/tipos";
import { NucleoConfigurador } from "@/ui/configurador/NucleoConfigurador";
import type { DadosDoConfigurador } from "@/ui/configurador/tipos";

/**
 * Escolher e configurar um item, no administrativo.
 *
 * Usa o MESMO configurador do cardápio público — `NucleoConfigurador` — e as
 * mesmas projeções de catálogo. O balcão vê os mesmos tamanhos, os mesmos
 * sabores e os mesmos preços que o cliente, porque é literalmente o mesmo
 * código consultando o mesmo banco.
 *
 * Consequência deliberada: **o atendente não contorna disponibilidade nem
 * compatibilidade**. Sabor esgotado aparece esgotado; borda que não existe
 * no tamanho não aparece; produto indisponível não entra. Nenhuma regra
 * normativa prevê override do balcão, e inventá-lo seria criar regra de
 * negócio (CLAUDE.md §1).
 *
 * Serve tanto ao pedido manual quanto à inclusão de item numa alteração: o
 * que muda é só o que o chamador faz com o item devolvido.
 *
 * Card de fogazza (RN-FOG-003) tem um passo a mais, como no cardápio: a
 * lista de sabores do card, e depois o configurador daquele sabor com o
 * tamanho fixo — as mesmas leituras da página pública.
 */
export function EscolherProduto({
  aoAdicionar,
  rotuloAcao = "Adicionar ao pedido",
}: {
  aoAdicionar: (item: ItemDoRascunho) => void;
  rotuloAcao?: string;
}) {
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<ResultadoBusca[]>([]);
  const [dados, setDados] = useState<DadosDoConfigurador | null>(null);
  const [titulo, setTitulo] = useState("");
  const [fogazza, setFogazza] = useState<CardDeFogazza | null>(null);
  const [filtroSabor, setFiltroSabor] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();

  function procurar(valor: string) {
    setTermo(valor);
    setErro(null);
    if (valor.trim().length < 2) {
      setResultados([]);
      return;
    }
    iniciar(async () => {
      setResultados(await buscarProdutos(valor));
    });
  }

  function abrir(p: ResultadoBusca) {
    setErro(null);
    iniciar(async () => {
      if (p.tipo === "fogazza") {
        const card = await carregarSaboresDaFogazza(p.slug);
        if (card !== null) {
          setFiltroSabor("");
          setFogazza(card);
          return;
        }
      }
      const d = await carregarConfigurador(p.slug);
      if (d === null) {
        setErro("Não foi possível abrir este produto.");
        return;
      }
      setTitulo(d.produto.nome);
      setDados(d);
    });
  }

  function abrirSabor(card: CardDeFogazza["card"], saborSlug: string) {
    setErro(null);
    iniciar(async () => {
      const d = await carregarConfiguradorDaFogazza(card.slug, saborSlug);
      if (d === null) {
        setErro("Não foi possível abrir este sabor.");
        return;
      }
      setTitulo(`${card.nome} · ${d.produto.nome}`);
      setDados(d);
    });
  }

  function recomecar() {
    setDados(null);
    setFogazza(null);
  }

  if (dados !== null) {
    return (
      <div className="rounded-12 border border-border-shalon bg-elev p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="m-0 text-[15px] font-bold text-ink">{titulo}</h3>
          <button
            type="button"
            onClick={recomecar}
            className="min-h-touch cursor-pointer rounded-11 border-[1.5px] border-border-shalon bg-surface px-3 text-[13px] font-semibold text-ink"
          >
            Trocar produto
          </button>
        </div>

        <NucleoConfigurador
          dados={dados}
          ancoragem="embutida"
          rotuloAcao={rotuloAcao}
          mensagemSucesso="Item adicionado."
          aoConfirmar={(item) => {
            aoAdicionar({
              // A linha identifica a configuração dentro do rascunho.
              linha: `${item.produtoId}|${item.escolhas.variacaoId ?? "-"}|${[...item.saboresCompletos].sort().join("+")}|${item.escolhas.bordaId ?? "-"}|${[...item.escolhas.adicionais].sort().join("+")}|${item.escolhas.observacao.trim().toLowerCase()}|${Date.now()}`,
              produtoId: item.produtoId,
              produtoSlug: item.produtoSlug,
              nome: item.montado.nome,
              variacaoId: item.escolhas.variacaoId,
              sabores: item.saboresCompletos,
              bordaId: item.escolhas.bordaId,
              adicionais: item.escolhas.adicionais,
              observacao: item.escolhas.observacao,
              quantidade: item.escolhas.quantidade,
              precoUnitario: item.montado.preco_unitario,
              total: item.montado.total,
              rotulos: item.montado.rotulos,
            });
            recomecar();
            setTermo("");
            setResultados([]);
          }}
        />
      </div>
    );
  }

  if (fogazza !== null) {
    const visiveis = filtrarSabores(fogazza.sabores, filtroSabor);
    return (
      <div className="rounded-12 border border-border-shalon bg-elev p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="m-0 text-[15px] font-bold text-ink">{fogazza.card.nome}</h3>
          <button
            type="button"
            onClick={recomecar}
            className="min-h-touch cursor-pointer rounded-11 border-[1.5px] border-border-shalon bg-surface px-3 text-[13px] font-semibold text-ink"
          >
            Trocar produto
          </button>
        </div>

        <label htmlFor="busca-sabor-fogazza" className="mb-[6px] mt-2 block text-[13.5px] font-semibold text-ink">
          Escolha o sabor
        </label>
        <input
          id="busca-sabor-fogazza"
          value={filtroSabor}
          onChange={(e) => setFiltroSabor(e.target.value)}
          placeholder="Filtrar sabores…"
          className="min-h-touch w-full rounded-11 border-[1.5px] border-border-shalon bg-surface px-3 text-[15px] text-ink focus:border-brand-orange focus:outline-none"
        />

        {ocupado ? <p className="m-0 mt-2 text-[12.5px] text-muted">Abrindo…</p> : null}
        {erro !== null ? (
          <p role="alert" className="m-0 mt-2 text-[13px] font-semibold text-tdf">
            {erro}
          </p>
        ) : null}

        {visiveis.length > 0 ? (
          <ul className="m-0 mt-2 list-none p-0">
            {visiveis.map((s) => (
              <li key={s.variacao_id}>
                <button
                  type="button"
                  disabled={!s.disponivel}
                  onClick={() => abrirSabor(fogazza.card, s.slug)}
                  className={[
                    "flex w-full min-h-touch items-center justify-between gap-3 rounded-11 border-0 bg-transparent px-2 py-2 text-left",
                    s.disponivel ? "cursor-pointer hover:bg-surface" : "cursor-not-allowed opacity-60",
                  ].join(" ")}
                >
                  <span className="block min-w-0 text-[14.5px] font-semibold text-ink">
                    {s.nome}
                    {s.disponivel ? "" : " · indisponível hoje"}
                  </span>
                  <span className="whitespace-nowrap text-[14px] tabular-nums text-ink-2">
                    {formatBRL(s.preco)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 mt-2 text-[13px] text-ink-2">Nenhum sabor com “{filtroSabor}”.</p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-12 border border-border-shalon bg-elev p-3">
      <label htmlFor="busca-produto" className="mb-[6px] block text-[13.5px] font-semibold text-ink">
        Procurar produto
      </label>
      <input
        id="busca-produto"
        value={termo}
        onChange={(e) => procurar(e.target.value)}
        placeholder="Calabresa, combo, refrigerante…"
        className="min-h-touch w-full rounded-11 border-[1.5px] border-border-shalon bg-surface px-3 text-[15px] text-ink focus:border-brand-orange focus:outline-none"
      />

      {ocupado ? <p className="m-0 mt-2 text-[12.5px] text-muted">Procurando…</p> : null}

      {erro !== null ? (
        <p role="alert" className="m-0 mt-2 text-[13px] font-semibold text-tdf">
          {erro}
        </p>
      ) : null}

      {resultados.length > 0 ? (
        <ul className="m-0 mt-2 list-none p-0">
          {resultados.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                disabled={!p.disponivel}
                onClick={() => abrir(p)}
                className={[
                  "flex w-full min-h-touch items-center justify-between gap-3 rounded-11 border-0 bg-transparent px-2 py-2 text-left",
                  p.disponivel ? "cursor-pointer hover:bg-surface" : "cursor-not-allowed opacity-60",
                ].join(" ")}
              >
                <span className="min-w-0">
                  <span className="block text-[14.5px] font-semibold text-ink">
                    {p.nome}
                    {p.disponivel ? "" : " · indisponível hoje"}
                  </span>
                  <span className="block text-[12.5px] text-ink-2">{p.categoria_nome}</span>
                </span>
                <span className="whitespace-nowrap text-[14px] tabular-nums text-ink-2">
                  {p.preco !== null ? formatBRL(p.preco) : "—"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : termo.trim().length >= 2 && !ocupado ? (
        <p className="m-0 mt-2 text-[13px] text-ink-2">Nada encontrado para “{termo}”.</p>
      ) : null}
    </div>
  );
}
