"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { formatBRL } from "@/lib/format";
import { paraRevalidacao } from "@/domain/carrinho/carrinho";
import { revalidarCarrinho } from "@/application/publico/acoes";
import type { LinhaRevalidada, Revalidacao } from "@/application/publico/tipos";
import { useLoja } from "@/ui/publico/useLoja";

/**
 * Carrinho — a tela do design aprovado: linhas com nome, personalizações,
 * total à direita, seletor de quantidade de 44px, "Editar", "Remover" e o
 * resumo grudado à direita no desktop.
 *
 * O PONTO CENTRAL: o preço que aparece aqui NÃO é autoridade.
 *
 * Ao abrir, e a cada alteração, o carrinho inteiro é revalidado no servidor
 * (02 §19). Se algum preço mudou, a tela mostra anterior → atual e EXIGE
 * aceite antes de deixar seguir (79.9). Se algum item ficou inválido —
 * indisponível, tamanho removido, borda que saiu do cardápio —, não dá para
 * continuar em silêncio.
 *
 * RN-CART-003: loja fechada não apaga nada; só bloqueia o avanço.
 */
export function Carrinho() {
  const { carrinho, itens, subtotal, alterarQuantidade, remover, adicionar, esvaziar } =
    useLoja();

  const [revalidacao, setRevalidacao] = useState<Revalidacao | null>(null);
  const [checando, iniciarChecagem] = useTransition();

  /**
   * Revalida ao abrir e a cada alteração do carrinho.
   *
   * É efeito de propósito: o carrinho vive fora do React (armazenamento
   * local) e o servidor é o sistema externo com que estamos sincronizando —
   * exatamente o caso que um efeito serve para resolver. A chave de
   * dependência é a configuração inteira, então mudar quantidade, remover
   * item ou trocar de aba refaz a checagem.
   */
  const assinatura = JSON.stringify(paraRevalidacao(carrinho));

  useEffect(() => {
    // Carrinho vazio não tem o que revalidar, e a tela nem chega a usar o
    // resultado: o componente sai antes, no estado vazio.
    if (itens.length === 0) return;

    iniciarChecagem(async () => {
      const r = await revalidarCarrinho(JSON.parse(assinatura) as unknown[]);
      setRevalidacao(r);
    });
  }, [assinatura, itens.length]);

  const porLinha = new Map<string, LinhaRevalidada>(
    revalidacao?.ok ? revalidacao.itens.map((i) => [i.linha, i]) : [],
  );

  const precisaAceitar = revalidacao?.ok === true && revalidacao.exige_reconfirmacao;
  const lojaAberta = revalidacao?.ok === true ? revalidacao.loja_aberta : true;

  /**
   * Revalidação que FALHOU não pode virar "siga assim mesmo".
   *
   * Sem conferência, o preço na tela é só o que o navegador guardou — e o
   * navegador nunca é autoridade (CLAUDE.md §16). Então o avanço fica
   * bloqueado até a conferência voltar a funcionar.
   *
   * Esta trava foi acrescentada depois de um defeito real: a revalidação
   * quebrava exatamente quando um preço mudava, e a tela seguia mostrando o
   * valor antigo como se estivesse tudo certo (migration 0034).
   */
  const falhouChecagem = revalidacao !== null && !revalidacao.ok;
  const aindaNaoChecou = revalidacao === null && !checando;

  /**
   * Aceitar os preços atuais: as linhas do carrinho passam a guardar o valor
   * que o servidor acabou de calcular. Itens que ficaram inválidos saem.
   *
   * Não existe reserva de preço: aceitar registra concordância com o valor
   * de agora, e a Fase 5 revalidará de novo antes de criar o pedido.
   */
  function aceitarAtualizacao() {
    if (!revalidacao?.ok) return;
    for (const linha of revalidacao.itens) {
      const item = itens.find((i) => i.linha === linha.linha);
      if (!item) continue;

      if (!linha.ok) {
        remover(item.linha);
        continue;
      }
      if (linha.mudou_preco && linha.preco_unitario !== undefined) {
        // Remover e readicionar mantém a mesma linha (a chave vem da
        // configuração) e troca o preço visto pelo atual.
        remover(item.linha);
        adicionar({
          ...item,
          precoUnitario: linha.preco_unitario,
          rotulos: linha.rotulos ?? item.rotulos,
          limite: linha.limite ?? item.limite,
        });
      }
    }
  }

  if (itens.length === 0) {
    return (
      <section className="px-4 py-4">
        <Link href="/" className="inline-flex min-h-touch items-center text-[15px] text-ink-2">
          ← Continuar comprando
        </Link>
        <h1 className="m-0 mb-4 mt-2 font-display text-[26px] font-extrabold text-ink">
          Seu carrinho
        </h1>
        <div className="rounded-18 border border-dashed border-border-shalon bg-elev px-5 py-[44px] text-center">
          <p className="m-0 font-display text-[20px] font-bold text-ink">
            Seu carrinho está vazio
          </p>
          <p className="mb-[18px] mt-2 text-[14px] text-ink-2">
            Escolha uma pizza no cardápio para começar.
          </p>
          <Link
            href="/"
            className="inline-flex min-h-touch-cta items-center rounded-12 bg-cta px-5 text-[16px] font-semibold text-cta-fg"
          >
            Ver cardápio
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="px-4 py-4">
      <Link href="/" className="inline-flex min-h-touch items-center text-[15px] text-ink-2">
        ← Continuar comprando
      </Link>
      <h1 className="m-0 mb-4 mt-2 font-display text-[26px] font-extrabold text-ink">
        Seu carrinho
      </h1>

      {precisaAceitar ? (
        <div className="mb-4 rounded-14 border border-twb bg-tw p-4">
          <p className="m-0 text-[15px] font-bold text-twf">
            O cardápio mudou desde que você montou este carrinho
          </p>
          <p className="mt-1 text-[14px] text-ink-2">
            Confira as diferenças abaixo. Nada segue adiante sem a sua confirmação — e não
            guardamos preço reservado.
          </p>
          <button
            type="button"
            onClick={aceitarAtualizacao}
            className="mt-3 inline-flex min-h-touch-cta cursor-pointer items-center rounded-12 border-0 bg-cta px-[18px] text-[15px] font-bold text-cta-fg"
          >
            Aceitar os valores atuais
          </button>
        </div>
      ) : null}

      {falhouChecagem ? (
        <div className="mb-4 rounded-14 border border-tdb bg-td p-4" role="alert">
          <p className="m-0 text-[15px] font-bold text-tdf">
            Não conseguimos conferir os preços agora
          </p>
          <p className="mt-1 text-[14px] text-ink-2">
            Seu carrinho continua guardado. Como não dá para confirmar os valores neste momento,
            preferimos não deixar seguir com um preço que pode não ser mais o atual.
          </p>
        </div>
      ) : null}

      {!lojaAberta ? (
        <div className="mb-4 rounded-14 border border-border-shalon bg-elev p-4">
          <p className="m-0 text-[14px] font-semibold text-ink">
            A loja está fechada agora.
          </p>
          <p className="mt-1 text-[13.5px] text-ink-2">
            Seu carrinho fica guardado por 24 horas. Quando reabrirmos, é só voltar aqui.
          </p>
        </div>
      ) : null}

      <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
        <div className="flex flex-col gap-3">
          {itens.map((item) => {
            const check = porLinha.get(item.linha);
            const invalido = check !== undefined && !check.ok;
            const mudou = check?.mudou_preco === true;

            return (
              <article
                key={item.linha}
                className={[
                  "rounded-16 border bg-surface p-[14px]",
                  invalido ? "border-tdb" : "border-border-shalon",
                ].join(" ")}
              >
                <div className="flex justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="m-0 text-[16px] font-semibold text-ink">{item.nome}</h2>
                    {item.rotulos.map((r) => (
                      <p key={r} className="m-0 mt-1 text-[13px] text-ink-2">
                        {r}
                      </p>
                    ))}
                    {item.observacao ? (
                      <p className="m-0 mt-1 text-[13px] italic text-muted">
                        “{item.observacao}”
                      </p>
                    ) : null}
                  </div>

                  <div className="whitespace-nowrap text-right">
                    <span className="text-[16px] font-bold tabular-nums text-ink">
                      {formatBRL(item.precoUnitario * item.quantidade)}
                    </span>
                    {item.quantidade > 1 ? (
                      <span className="block text-[12px] tabular-nums text-muted">
                        {formatBRL(item.precoUnitario)} cada
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* 79.9: anterior → atual, explícito. */}
                {mudou && check?.preco_unitario !== undefined ? (
                  <p className="m-0 mt-2 rounded-10 bg-tw px-3 py-2 text-[13px] font-semibold text-twf">
                    Preço atualizado: {formatBRL(check.preco_visto ?? item.precoUnitario)} →{" "}
                    {formatBRL(check.preco_unitario)}
                  </p>
                ) : null}

                {invalido ? (
                  <p className="m-0 mt-2 rounded-10 bg-td px-3 py-2 text-[13px] font-semibold text-tdf">
                    {check?.erro ?? "Este item não está mais disponível."}
                  </p>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center gap-[10px]">
                  <div className="flex items-center overflow-hidden rounded-11 border-[1.5px] border-border-shalon">
                    <button
                      type="button"
                      onClick={() => alterarQuantidade(item.linha, item.quantidade - 1)}
                      aria-label={`Diminuir quantidade de ${item.nome}`}
                      className="min-h-touch min-w-touch cursor-pointer border-0 bg-transparent text-[19px] text-ink"
                    >
                      −
                    </button>
                    <span className="min-w-[28px] text-center font-semibold text-ink">
                      {item.quantidade}
                    </span>
                    <button
                      type="button"
                      onClick={() => alterarQuantidade(item.linha, item.quantidade + 1)}
                      aria-label={`Aumentar quantidade de ${item.nome}`}
                      disabled={item.limite !== null && item.quantidade >= item.limite}
                      className="min-h-touch min-w-touch cursor-pointer border-0 bg-transparent text-[19px] text-ink disabled:cursor-not-allowed disabled:text-muted"
                    >
                      +
                    </button>
                  </div>

                  <Link
                    href={`/produto/${item.produtoSlug}`}
                    className="inline-flex min-h-touch items-center rounded-11 border-[1.5px] border-border-shalon px-[14px] text-[14px] font-semibold text-ink"
                  >
                    Editar
                  </Link>

                  <button
                    type="button"
                    onClick={() => remover(item.linha)}
                    className="inline-flex min-h-touch cursor-pointer items-center rounded-11 border-0 bg-transparent px-[14px] text-[14px] font-semibold text-danger"
                  >
                    Remover
                  </button>

                  {item.limite !== null ? (
                    <span className="text-[12px] text-muted">
                      limite de {item.limite} por pedido
                    </span>
                  ) : null}
                </div>
              </article>
            );
          })}

          <button
            type="button"
            onClick={esvaziar}
            className="self-start text-[13px] font-semibold text-muted underline"
          >
            Esvaziar carrinho
          </button>
        </div>

        <aside className="sticky top-[90px] rounded-16 border border-border-shalon bg-surface p-4">
          <h2 className="m-0 mb-3 text-[15px] font-bold text-ink">Resumo</h2>

          <div className="flex justify-between py-1 text-[15px] text-ink-2">
            <span>Subtotal</span>
            <span className="tabular-nums">
              {formatBRL(revalidacao?.ok ? revalidacao.subtotal : subtotal)}
            </span>
          </div>
          <div className="flex justify-between py-1 text-[15px] text-ink-2">
            <span>Taxa de entrega</span>
            {/* A taxa depende de endereço e rota, que são da Fase 5. Dizer
                "R$ 0,00" aqui seria anunciar entrega grátis (CLAUDE.md §20). */}
            <span className="text-[13.5px]">calculada no checkout</span>
          </div>

          <div className="my-[10px] h-px bg-border-shalon" />

          <div className="flex items-baseline justify-between">
            <span className="font-semibold text-ink">Total parcial</span>
            <span className="font-display text-[22px] font-extrabold tabular-nums text-ink">
              {formatBRL(revalidacao?.ok ? revalidacao.subtotal : subtotal)}
            </span>
          </div>

          {checando ? (
            <p className="m-0 mt-2 text-[12.5px] text-muted">Conferindo preços e disponibilidade…</p>
          ) : null}

          {lojaAberta && !precisaAceitar && !falhouChecagem && !aindaNaoChecou ? (
            <Link
              href="/checkout"
              className="mt-[14px] flex min-h-[52px] w-full items-center justify-center rounded-13 bg-cta text-[17px] font-semibold text-cta-fg"
            >
              Continuar
            </Link>
          ) : (
            <span
              aria-disabled="true"
              className="mt-[14px] flex min-h-[52px] w-full cursor-not-allowed items-center justify-center rounded-13 bg-tn text-center text-[15px] font-semibold text-muted"
            >
              {!lojaAberta
                ? "Loja fechada no momento"
                : falhouChecagem || aindaNaoChecou
                  ? "Conferindo os valores…"
                  : "Confirme os valores atualizados"}
            </span>
          )}

          <p className="m-0 mt-3 text-[12px] text-muted">
            Os preços são atualizados sempre que você abre o carrinho. Não guardamos preço
            nem promoção reservada.
          </p>
        </aside>
      </div>
    </section>
  );
}
