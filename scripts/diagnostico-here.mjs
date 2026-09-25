#!/usr/bin/env node
/**
 * Diagnóstico do provedor HERE contra a API REAL.
 *
 * POR QUE ESTE SCRIPT EXISTE
 *
 * Os 22 testes de `tests/infrastructure/here.test.ts` provam que o código
 * interpreta corretamente uma resposta do HERE. Eles usam dublê: nenhum
 * toca a rede. Existe uma pergunta que dublê nenhum responde — se o HERE
 * ACERTA os endereços reais da cidade da Shalon. É a pendência A-05, e é o
 * risco concreto da troca de provedor (D-2026-09-24-75): a cobertura de
 * endereçamento no Brasil pode ser inferior à do Google em cidade pequena.
 *
 * Este script responde essa pergunta, e só ela.
 *
 * SOBRE A CHAVE
 *
 * Vem EXCLUSIVAMENTE de `process.env.HERE_API_KEY`. O script não abre nenhum
 * arquivo: quem carrega o `.env.local` é o próprio Node, pelo `--env-file`.
 *
 * A chave nunca é impressa, a URL da requisição nunca é registrada (a chave
 * viaja na query string, como a API exige) e toda a saída passa por um filtro
 * que a substitui por `<CHAVE OCULTA>` — inclusive em mensagem de erro vinda
 * da própria HERE.
 *
 * USO
 *
 *   node --env-file=.env.local scripts/diagnostico-here.mjs \\
 *     "<loja: endereço ou lat,lng>" "<destino 1>" "<destino 2>" ...
 *
 * Espaçamento entre requisições: HERE_ESPERA_MS (padrão 8000).
 *
 * O primeiro endereço é a ORIGEM (a loja). Os seguintes são destinos: cada um
 * é geocodificado e, se a origem também tiver sido localizada, roteado.
 *
 * Um endereço é uma linha única, como o cliente digitaria:
 *   "Rua das Flores, 123, Centro, Cidade, SP, 01000-000"
 */

const CHAVE = (process.env.HERE_API_KEY || "").trim();

if (!CHAVE) {
  console.error(
    [
      "HERE_API_KEY não está definida no ambiente.",
      "",
      "Execute deixando o Node carregar o arquivo de ambiente:",
      "",
      "  node --env-file=.env.local scripts/diagnostico-here.mjs \\",
      '    "<loja ou lat,lng>" "<destino 1>" "<destino 2>"',
      "",
      "A chave fica na linha `HERE_API_KEY=` do `.env.local`, que está no",
      ".gitignore. Este script NUNCA lê o arquivo por conta própria e nunca",
      "imprime o valor da chave.",
      "",
      "Não passe a chave como argumento nem como `HERE_API_KEY=... node ...`:",
      "nos dois casos ela fica no histórico do shell.",
    ].join("\n"),
  );
  process.exit(2);
}

/** Cinto de segurança: nada sai daqui contendo a credencial. */
function seguro(texto) {
  return String(texto).split(CHAVE).join("<CHAVE OCULTA>");
}
function imprimir(...partes) {
  // Ferramenta de linha de comando: a saída no stdout É o produto dela, ao
  // contrário do código de aplicação, onde a regra `no-console` vale.
  // eslint-disable-next-line no-console
  console.log(partes.map(seguro).join(" "));
}

// ----------------------------------------------------------------- mapeamento

/**
 * Espelha `confiancaDoHere()` de `src/infrastructure/rotas/here.ts`.
 * A fonte de verdade é aquele arquivo, coberto pelos testes; aqui a regra é
 * repetida apenas para que o diagnóstico mostre a decisão ao lado do dado
 * bruto que a produziu.
 */
function confianca(resultType, houseNumberType) {
  if (resultType !== "houseNumber") return null;
  if (houseNumberType === "PA") return "exata";
  if (houseNumberType === "interpolated") return "aproximada";
  return null;
}

// ---------------------------------------------------------------- requisições

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Espaçamento entre requisições, em ms. Ajustável: HERE_ESPERA_MS=12000 */
const ESPERA = Number(process.env.HERE_ESPERA_MS || 8000);

/**
 * O plano freemium da HERE limita requisições por segundo. Em produção isso é
 * tratado como indisponibilidade momentânea (`here.ts` mapeia 429 para
 * `indisponivel`, nunca para taxa R$ 0,00). Aqui, num diagnóstico manual, faz
 * sentido espaçar e insistir: o objetivo é conhecer a cobertura de endereço,
 * não medir a cota.
 */
async function chamar(url, tentativas = 5) {
  for (let i = 0; i < tentativas; i++) {
    if (i > 0) await dormir(ESPERA * (i + 1));
    const resposta = await fetch(url, { headers: { accept: "application/json" } });
    let corpo = null;
    try {
      corpo = await resposta.json();
    } catch {
      /* corpo não-JSON: tratado como indisponibilidade, igual ao provedor */
    }
    if (resposta.status !== 429 || i === tentativas - 1) {
      return { status: resposta.status, ok: resposta.ok, corpo, tentativas: i + 1 };
    }
  }
}

async function geocodificar(endereco) {
  const url =
    "https://geocode.search.hereapi.com/v1/geocode" +
    `?q=${encodeURIComponent(endereco)}` +
    "&in=countryCode%3ABRA&lang=pt-BR&limit=2" +
    `&apiKey=${encodeURIComponent(CHAVE)}`;
  return chamar(url);
}

async function rotear(origem, destino) {
  const url =
    "https://router.hereapi.com/v8/routes" +
    `?origin=${origem.lat},${origem.lng}` +
    `&destination=${destino.lat},${destino.lng}` +
    "&transportMode=car&return=summary" +
    `&apiKey=${encodeURIComponent(CHAVE)}`;
  return chamar(url);
}

// ---------------------------------------------------------------- coordenada

/**
 * Reconhece "lat,lng" como origem literal.
 *
 * Isto reproduz a produção: a coordenada da loja vem de `store_settings` pela
 * RPC `origem_da_loja`, conferida no mapa por quem configura — NÃO da
 * geocodificação. Geocodificar a origem, como este script fazia, mede a base
 * de endereços da HERE; usar a coordenada real mede a distância que o cliente
 * vai efetivamente pagar.
 */
function comoCoordenada(texto) {
  const m = String(texto)
    .trim()
    .match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

// ------------------------------------------------------------------ relatório

function explicarStatus(status) {
  if (status === 401 || status === 403) {
    return "CONFIGURAÇÃO — a chave foi recusada, ou o serviço não está habilitado nela.";
  }
  if (status === 429) return "COTA — limite do plano atingido.";
  return `INDISPONIBILIDADE — HTTP ${status}.`;
}

/** @returns {{lat:number,lng:number}|null} coordenada aceitável para rota */
function relatarGeocodificacao(rotulo, endereco, r) {
  imprimir(`\n── ${rotulo}`);
  imprimir(`   endereço enviado: ${endereco}`);
  imprimir(
    `   HTTP ${r.status}` +
      (r.tentativas > 1 ? ` (após ${r.tentativas} tentativas — cota por segundo)` : ""),
  );

  if (!r.ok) {
    imprimir(`   → ${explicarStatus(r.status)}`);
    if (r.corpo && typeof r.corpo === "object") {
      const detalhe = r.corpo.error_description || r.corpo.title || r.corpo.error;
      if (detalhe) imprimir(`   detalhe da API: ${detalhe}`);
    }
    return null;
  }

  const itens = Array.isArray(r.corpo?.items) ? r.corpo.items : [];
  imprimir(`   resultados devolvidos: ${itens.length}`);

  itens.forEach((it, i) => {
    imprimir(
      `   [${i + 1}] resultType=${it.resultType ?? "—"}` +
        ` houseNumberType=${it.houseNumberType ?? "—"}`,
    );
    if (it.address?.label) imprimir(`       ${it.address.label}`);
    if (it.position) {
      imprimir(`       coordenada: ${it.position.lat}, ${it.position.lng}`);
    }
  });

  if (itens.length === 0) {
    imprimir("   → RECUSADO: endereço não encontrado. Entrega indisponível.");
    return null;
  }
  if (itens.length > 1) {
    imprimir("   → RECUSADO: ambíguo (mais de um resultado). Entrega indisponível.");
    return null;
  }

  const [item] = itens;
  const nivel = confianca(item.resultType, item.houseNumberType);
  if (!nivel) {
    imprimir(
      `   → RECUSADO: ambíguo. \`${item.resultType ?? "sem tipo"}\` não identifica` +
        " um número de casa; cobrar frete sobre isso seria cobrar por outro ponto.",
    );
    return null;
  }
  if (!item.position || typeof item.position.lat !== "number") {
    imprimir("   → RECUSADO: resultado sem coordenada.");
    return null;
  }

  imprimir(`   → ACEITO com confiança ${nivel.toUpperCase()}. Frete é calculado.`);
  return { lat: item.position.lat, lng: item.position.lng };
}

function relatarRota(r) {
  if (!r.ok) {
    imprimir(`   rota: HTTP ${r.status} — ${explicarStatus(r.status)}`);
    return;
  }
  const secoes = r.corpo?.routes?.[0]?.sections;
  if (!Array.isArray(secoes) || secoes.length === 0) {
    imprimir("   rota: SEM ROTA. Entrega indisponível — e NÃO taxa R$ 0,00.");
    return;
  }
  let metros = 0;
  let segundos = 0;
  let faltouComprimento = false;
  for (const s of secoes) {
    const c = s?.summary?.length;
    if (typeof c !== "number") faltouComprimento = true;
    else metros += c;
    const d = s?.summary?.duration;
    if (typeof d === "number") segundos += d;
  }
  if (faltouComprimento) {
    imprimir("   rota: seção sem comprimento. SEM ROTA — e NÃO taxa R$ 0,00.");
    return;
  }
  const km = Math.round((metros / 1000) * 1000) / 1000;
  const min = segundos > 0 ? Math.round(segundos / 60) : null;
  imprimir(
    `   rota rodoviária: ${km} km` +
      (min === null ? " (duração não informada)" : ` · ~${min} min`) +
      ` · ${secoes.length} seção(ões)`,
  );
}

// ----------------------------------------------------------------------- main

const enderecos = process.argv.slice(2);

if (enderecos.length < 1) {
  console.error(
    [
      "Informe pelo menos o endereço da loja.",
      "",
      'Uso: node scripts/diagnostico-here.mjs "<loja>" "<destino>" ...',
      "",
      "A loja pode ser um endereço OU uma coordenada \"lat,lng\" — prefira a",
      "coordenada conferida no mapa, que é o que a produção usa.",
      "",
      "Exemplo:",
      '  node scripts/diagnostico-here.mjs \\',
      '    "Rua X, 100, Centro, Cidade, SP" \\',
      '    "Rua Y, 250, Bairro, Cidade, SP"',
    ].join("\n"),
  );
  process.exit(2);
}

imprimir("DIAGNÓSTICO DO PROVEDOR HERE — API real");
imprimir("credencial: presente no ambiente (nada sobre ela é exibido)");
imprimir("serviços: Geocoding & Search v1 · Routing v8 (transportMode=car)");

const [enderecoLoja, ...destinos] = enderecos;

const coordenadaDada = comoCoordenada(enderecoLoja);
let origem;

if (coordenadaDada) {
  imprimir("\n── ORIGEM (loja) — coordenada informada, sem geocodificar");
  imprimir(`   coordenada: ${coordenadaDada.lat}, ${coordenadaDada.lng}`);
  imprimir("   → é assim que a produção obtém a origem (`origem_da_loja`).");
  origem = coordenadaDada;
} else {
  origem = relatarGeocodificacao(
    "ORIGEM (loja)",
    enderecoLoja,
    await geocodificar(enderecoLoja),
  );
}

for (const [i, destino] of destinos.entries()) {
  await dormir(ESPERA);
  const coord = relatarGeocodificacao(
    `DESTINO ${i + 1}`,
    destino,
    await geocodificar(destino),
  );
  if (!coord) continue;
  await dormir(ESPERA);
  if (!origem) {
    imprimir("   rota: não calculada — a origem não foi localizada.");
    continue;
  }
  relatarRota(await rotear(origem, coord));
}

imprimir("\n── fim do diagnóstico");
if (!origem) {
  imprimir(
    "A ORIGEM não foi localizada. Enquanto isso não for resolvido, nenhuma\n" +
      "entrega pode ser calculada — o cálculo parte da coordenada da loja.",
  );
}
