"use client";

import { NucleoConfigurador } from "@/ui/configurador/NucleoConfigurador";
import type { DadosDoConfigurador } from "@/ui/configurador/tipos";
import { anunciarAdicionado } from "@/ui/publico/avisoAdicionado";
import { useLoja } from "@/ui/publico/useLoja";

export type { DadosPorTamanho } from "@/ui/configurador/tipos";

/**
 * Configurador do cardápio público — o conteúdo do sheet do design aprovado.
 *
 * Desde o complemento da Fase 6 este componente é um INVÓLUCRO: as escolhas,
 * o recálculo e o desenho vivem em `NucleoConfigurador`, compartilhado com o
 * pedido manual do balcão e com a inclusão de item numa alteração. Assim
 * existe uma única lógica de configuração comercial (CLAUDE.md §17).
 *
 * O que sobra aqui é o que é do público, e só isso: adicionar ao carrinho
 * local e avisar quando a loja está fechada. Nenhum preço é calculado nesta
 * camada — o valor vem do servidor, dentro do núcleo.
 *
 * Desde D-2026-09-28-85 a confirmação da adição é o PainelAdicionado do
 * shell, com "Adicionar mais" e "Ver carrinho"; a frase curta do
 * núcleo fica desligada aqui para não dizer a mesma coisa duas vezes.
 */
export function Configurador({
  dados,
  lojaAberta,
}: {
  dados: DadosDoConfigurador;
  lojaAberta: boolean;
}) {
  const { adicionar } = useLoja();

  return (
    <NucleoConfigurador
      dados={dados}
      ancoragem="fixa"
      rotuloAcao="Adicionar"
      mensagemSucesso={null}
      aviso={
        lojaAberta ? null : (
          <p className="m-0 text-[12.5px] text-muted">
            A loja está fechada — você pode montar o carrinho e enviar quando reabrirmos.
          </p>
        )
      }
      aoConfirmar={(item) => {
        adicionar({
          produtoId: item.produtoId,
          produtoSlug: item.produtoSlug,
          nome: item.montado.nome,
          variacaoId: item.escolhas.variacaoId,
          sabores: item.saboresCompletos,
          bordaId: item.escolhas.bordaId,
          adicionais: item.escolhas.adicionais,
          observacao: item.escolhas.observacao,
          quantidade: item.escolhas.quantidade,
          // O preço é o que o SERVIDOR calculou para esta configuração.
          precoUnitario: item.montado.preco_unitario,
          rotulos: item.montado.rotulos,
          limite: item.montado.limite,
        });
        anunciarAdicionado(item.montado.nome, "produto");
      }}
    />
  );
}
