"use client";

import Image from "next/image";
import { useState } from "react";

/**
 * Escolha de imagem COM PRÉVIA (15/10/2026).
 *
 * Antes era uma lista de nomes de arquivo — "banner-3.webp (1600×800)" —, e a
 * pessoa só descobria qual era depois de criar o banner. Aqui cada imagem é
 * uma miniatura clicável, e a escolhida aparece grande, na proporção em que
 * vai ser usada (2:1 no carrossel, 1:2 no popup).
 *
 * É um grupo de `radio`: o valor segue em `name`, como o seletor anterior,
 * e vazio quer dizer "nenhuma" (só para campos opcionais, como o popup).
 */
export type OpcaoDeImagem = { id: string; url: string; nome: string; dimensoes: string };

export function SeletorDeImagem({
  name,
  label,
  opcoes,
  proporcao,
  opcional = false,
  rotuloNenhuma = "Sem imagem",
  vazio,
  obrigatorio = false,
}: {
  name: string;
  label: string;
  opcoes: OpcaoDeImagem[];
  /** Largura/altura da prévia: o formato em que a imagem será usada. */
  proporcao: "2 / 1" | "1 / 2";
  opcional?: boolean;
  rotuloNenhuma?: string;
  /** Texto quando não há nenhuma imagem desse formato. */
  vazio: string;
  obrigatorio?: boolean;
}) {
  const [escolhida, setEscolhida] = useState<string>("");
  const atual = opcoes.find((o) => o.id === escolhida) ?? null;
  const retrato = proporcao === "1 / 2";

  if (opcoes.length === 0) {
    return (
      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className="mb-1 p-0 text-[14px] font-semibold text-ink">{label}</legend>
        <p className="m-0 rounded-12 border border-dashed border-border-shalon bg-elev px-3 py-3 text-[13px] text-muted">
          {vazio}
        </p>
      </fieldset>
    );
  }

  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className="mb-1 p-0 text-[14px] font-semibold text-ink">{label}</legend>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        {/* Prévia: do tamanho em que a imagem aparece na loja. */}
        <div
          className={[
            "relative shrink-0 overflow-hidden rounded-12 border border-border-shalon bg-elev",
            retrato ? "h-[200px] w-[100px]" : "h-[100px] w-full sm:w-[200px]",
          ].join(" ")}
          style={{ aspectRatio: proporcao }}
        >
          {atual ? (
            <Image
              src={atual.url}
              alt={`Prévia: ${atual.nome}`}
              fill
              sizes="200px"
              className="object-cover"
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center px-2 text-center text-[12px] text-muted">
              {obrigatorio ? "Escolha uma imagem" : rotuloNenhuma}
            </span>
          )}
        </div>

        <div
          role="radiogroup"
          aria-label={label}
          className="flex min-w-0 flex-1 flex-wrap gap-2"
        >
          {opcional ? (
            <Miniatura
              name={name}
              valor=""
              marcada={escolhida === ""}
              aoMarcar={() => setEscolhida("")}
              titulo={rotuloNenhuma}
              retrato={retrato}
            >
              <span className="flex h-full w-full items-center justify-center px-1 text-center text-[11.5px] font-semibold text-ink-2">
                {rotuloNenhuma}
              </span>
            </Miniatura>
          ) : null}

          {opcoes.map((o) => (
            <Miniatura
              key={o.id}
              name={name}
              valor={o.id}
              marcada={escolhida === o.id}
              aoMarcar={() => setEscolhida(o.id)}
              titulo={`${o.nome} (${o.dimensoes})`}
              retrato={retrato}
              exigida={obrigatorio}
            >
              <Image src={o.url} alt="" fill sizes="96px" className="object-cover" />
            </Miniatura>
          ))}
        </div>
      </div>

      {atual ? (
        <p className="m-0 mt-1.5 truncate text-[12px] text-muted">
          {atual.nome} · {atual.dimensoes}
        </p>
      ) : null}
    </fieldset>
  );
}

function Miniatura({
  name,
  valor,
  marcada,
  aoMarcar,
  titulo,
  retrato,
  exigida = false,
  children,
}: {
  name: string;
  valor: string;
  marcada: boolean;
  aoMarcar: () => void;
  titulo: string;
  retrato: boolean;
  exigida?: boolean;
  children: React.ReactNode;
}) {
  return (
    // `relative`: o rádio escondido (sr-only) é `absolute`; sem um pai
    // posicionado ele ancora no modal e, ao focar, rola o modal inteiro.
    <label
      title={titulo}
      className={[
        "relative block shrink-0 cursor-pointer overflow-hidden rounded-10 border-2 bg-elev",
        retrato ? "aspect-[1/2] w-[52px]" : "aspect-[2/1] w-[92px]",
        marcada ? "border-brand-red" : "border-border-shalon hover:border-brand-orange",
      ].join(" ")}
    >
      <input
        type="radio"
        name={name}
        value={valor}
        checked={marcada}
        onChange={aoMarcar}
        required={exigida}
        className="sr-only"
      />
      <span className="absolute inset-0">{children}</span>
      {marcada ? (
        <span
          aria-hidden="true"
          className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-pill bg-brand-red text-[12px] font-bold text-white"
        >
          ✓
        </span>
      ) : null}
    </label>
  );
}
