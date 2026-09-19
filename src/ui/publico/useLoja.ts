"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  adicionarItem,
  alterarQuantidade as alterarQuantidadeNoCarrinho,
  limpar,
  removerItem,
  subtotalVisto,
  totalDeItens,
  type ItemCarrinho,
} from "@/domain/carrinho/carrinho";
import { alternarFavorito, ehFavorito } from "@/domain/carrinho/favoritos";
import {
  definirCarrinho,
  definirFavoritos,
  estadoNoServidor,
  inscrever,
  lerEstado,
  reconhecerExpiracao,
} from "./armazenamentoLocal";

/**
 * Acesso do React ao carrinho e aos favoritos locais.
 *
 * O nome começa com `use` por exigência mecânica das regras de Hooks do
 * React — é prefixo de framework, como `useState`, não tradução.
 *
 * As regras — agrupar configuração idêntica, TTL, limite — ficam no domínio
 * (`src/domain/carrinho`). Este hook só liga o React ao store e reexporta o
 * que a tela precisa.
 */
export function useLoja() {
  const estado = useSyncExternalStore(inscrever, lerEstado, estadoNoServidor);
  const agora = () => Date.now();

  const adicionar = useCallback((item: Omit<ItemCarrinho, "linha">) => {
    definirCarrinho(adicionarItem(lerEstado().carrinho, item, Date.now()));
  }, []);

  const alterarQuantidade = useCallback((linha: string, quantidade: number) => {
    definirCarrinho(
      alterarQuantidadeNoCarrinho(lerEstado().carrinho, linha, quantidade, Date.now()),
    );
  }, []);

  const remover = useCallback((linha: string) => {
    definirCarrinho(removerItem(lerEstado().carrinho, linha, Date.now()));
  }, []);

  const esvaziar = useCallback(() => {
    definirCarrinho(limpar(Date.now()));
  }, []);

  const alternar = useCallback((produtoId: string) => {
    definirFavoritos(alternarFavorito(lerEstado().favoritos, produtoId));
  }, []);

  return {
    hidratado: estado.hidratado,
    carrinho: estado.carrinho,
    favoritos: estado.favoritos,
    expirou: estado.expirou,
    itens: estado.carrinho.itens,
    quantidadeTotal: totalDeItens(estado.carrinho),
    subtotal: subtotalVisto(estado.carrinho),
    ehFavorito: (produtoId: string) => ehFavorito(estado.favoritos, produtoId),
    adicionar,
    alterarQuantidade,
    remover,
    esvaziar,
    alternarFavorito: alternar,
    reconhecerExpiracao,
    agora,
  };
}
