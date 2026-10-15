"use client";

import { useState } from "react";
import { Input, SelectMenu } from "@/ui/components";
import { SeletorDeItensDaPromocao, type OpcaoDeItem } from "./SeletorDeItensDaPromocao";

/**
 * "Para onde o banner leva" — e só mostra o que o destino escolhido pede
 * (15/10/2026). Antes havia sempre os dois campos, o de produtos e o de link
 * externo, e a dica dizia para ignorar um deles.
 *
 * Valor enviado em `destino`: `none`, `external`, `products`,
 * `promotion:<id>`, `category:<id>`, `product:<id>`.
 */
export function DestinoDoBanner({
  promocoes,
  categorias,
  produtos,
  produtosParaDestaque,
}: {
  promocoes: { id: string; texto: string }[];
  categorias: { id: string; nome: string }[];
  produtos: { id: string; nome: string }[];
  produtosParaDestaque: OpcaoDeItem[];
}) {
  const [destino, setDestino] = useState("none");

  return (
    <div className="flex flex-col gap-3">
      <SelectMenu
        label="Para onde o banner leva"
        name="destino"
        valor={destino}
        aoMudar={setDestino}
        opcoes={[
          { valor: "none", texto: "Lugar nenhum (só divulga)" },
          { valor: "products", texto: "Vários produtos (página de destaque)", grupo: "Itens" },
          ...promocoes.map((p) => ({
            valor: `promotion:${p.id}`,
            texto: p.texto,
            grupo: "Promoção",
          })),
          ...categorias.map((c) => ({
            valor: `category:${c.id}`,
            texto: c.nome,
            grupo: "Categoria",
          })),
          ...produtos.map((p) => ({
            valor: `product:${p.id}`,
            texto: p.nome,
            grupo: "Um produto",
          })),
          { valor: "external", texto: "Link externo", grupo: "Fora do cardápio" },
        ]}
      />

      {destino === "products" ? (
        <>
          <p className="m-0 text-[12.5px] text-muted">
            O cliente toca no banner e vê uma página com todos os produtos marcados. O banner some
            quando nenhum deles está disponível.
          </p>
          <SeletorDeItensDaPromocao
            opcoes={produtosParaDestaque}
            nomeDoCampo="produto"
            titulo="Quais produtos aparecem?"
            ajuda="Marque quantos quiser. Os preços mostrados na página já consideram promoções vigentes."
          />
        </>
      ) : null}

      {destino === "external" ? (
        <Input
          label="Endereço do link"
          name="url_externa"
          type="url"
          placeholder="https://..."
          required
        />
      ) : null}

      {destino.startsWith("promotion:") ? (
        <p className="m-0 text-[12.5px] text-muted">
          Promoção com vários itens abre uma página com todos eles. O banner não aparece nos dias em
          que a promoção não vale.
        </p>
      ) : null}
    </div>
  );
}
