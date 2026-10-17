import type { Coordenada } from "./contrato";

/**
 * Desempate por NOME DA RUA + PROXIMIDADE (D-2026-10-16-144).
 *
 * Endereço sem CEP e com nome comum ("Getúlio Vargas, 6") tem homônimos pela
 * cidade toda, e a nota do serviço de mapas fica baixa. Mas a pizzaria só
 * entrega perto: uma rua homônima a 20 km não é candidata — nem que fosse,
 * estaria fora da área. Então, quando a regra principal recusa, ainda se
 * aceita UM resultado se TODAS as condições valem:
 *
 *   · é o número da casa (não só a rua, nem bairro/cidade);
 *   · o nome da rua confere com o digitado (sem acento, sem "Rua/Av./de/da");
 *   · fica a até 12 km em linha reta da loja (o raio de entrega é 10 km de
 *     rota, e rota nunca é menor que linha reta);
 *   · nota de correspondência ≥ 0,6;
 *   · é o ÚNICO lugar assim: dois candidatos que conferem, a mais de 300 m
 *     um do outro, são ambiguidade de verdade — e aí continua recusado.
 *
 * A confiança é "aproximada". Não se escolhe "o mais perto" entre vários:
 * isso cobraria menos por engano.
 */

export type Candidato = {
  lat: number;
  lng: number;
  /** `casa` = número localizado ou interpolado no trecho. */
  nivel: "casa" | "rua" | "outro";
  rua: string | undefined;
  nota: number;
  label: string | undefined;
};

const RAIO_DE_BUSCA_METROS = 12000;
const MESMO_LUGAR_METROS = 300;
const NOTA_MINIMA_PROXIMIDADE = 0.6;

export function distanciaEmMetros(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = 6371000;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

const TIPOS_DE_VIA = new Set([
  "rua", "r", "avenida", "av", "estrada", "estr", "est", "travessa", "tv", "alameda", "al",
  "praca", "pc", "rodovia", "rod", "viela", "largo", "via", "passagem", "beco",
]);
const LIGACAO = new Set(["de", "da", "do", "das", "dos", "e"]);

function palavras(nome: string): string[] {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((p) => p && !TIPOS_DE_VIA.has(p) && !LIGACAO.has(p));
}

/** Todas as palavras do nome digitado estão no nome do resultado. */
export function ruaConfere(digitada: string, doResultado: string | undefined): boolean {
  if (!doResultado) return false;
  const procuradas = palavras(digitada);
  if (procuradas.length === 0) return false;
  const encontradas = new Set(palavras(doResultado));
  return procuradas.every((p) => encontradas.has(p));
}

export function escolherPorNomeEProximidade(
  candidatos: readonly Candidato[],
  ruaDigitada: string,
  loja: Coordenada,
): Candidato | null {
  const origem = { lat: loja.latitude, lng: loja.longitude };
  const validos = candidatos.filter(
    (c) =>
      c.nivel === "casa" &&
      c.nota >= NOTA_MINIMA_PROXIMIDADE &&
      ruaConfere(ruaDigitada, c.rua) &&
      distanciaEmMetros(origem, c) <= RAIO_DE_BUSCA_METROS,
  );
  const primeiro = validos[0];
  if (!primeiro) return null;
  const outroLugar = validos.some((c) => distanciaEmMetros(primeiro, c) > MESMO_LUGAR_METROS);
  return outroLugar ? null : primeiro;
}
