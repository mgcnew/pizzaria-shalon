"use server";

import { logger } from "@/lib/logger";

/**
 * Consulta de CEP — conveniência de digitação, e NADA além disso.
 *
 * Aprovado em D-2026-09-24-75 com uma fronteira explícita:
 *
 *   O ViaCEP NUNCA é autoridade sobre coordenada, distância ou taxa.
 *
 * Ele devolve texto — rua, bairro, cidade, UF — para poupar digitação e
 * reduzir erro de grafia. Quem localiza o endereço no mapa e mede a rota
 * continua sendo o provedor de rotas (`selecionarProvedorDeRotas`), e a taxa
 * continua saindo da faixa no banco (CLAUDE.md §16 e §20).
 *
 * POR QUE ISSO IMPORTA. Um CEP no Brasil pode cobrir uma rua inteira, ou
 * várias. Usá-lo para inferir distância produziria taxa errada — exatamente o
 * que RN-ENT-003 proíbe. Por isso esta função não devolve, e não deve passar
 * a devolver, latitude e longitude.
 *
 * FALHA NÃO BLOQUEIA. Se o ViaCEP estiver fora do ar, lento ou devolver algo
 * inesperado, o resultado é `ok: false` e o cliente continua preenchendo o
 * endereço à mão. Nenhum checkout para por causa disto.
 */

const TEMPO_LIMITE_MS = 4000;

export type EnderecoDoCep =
  | {
      ok: true;
      logradouro: string;
      bairro: string;
      cidade: string;
      uf: string;
    }
  | { ok: false; motivo: "formato" | "nao_encontrado" | "indisponivel" };

/** Deixa só os dígitos. "01001-000" e "01001000" são o mesmo CEP. */
function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, "");
}

export async function buscarEnderecoPorCep(cep: unknown): Promise<EnderecoDoCep> {
  if (typeof cep !== "string") return { ok: false, motivo: "formato" };

  const digitos = somenteDigitos(cep);
  // CEP brasileiro tem 8 dígitos. Não vale a pena gastar uma requisição para
  // descobrir que "123" é inválido.
  if (digitos.length !== 8) return { ok: false, motivo: "formato" };

  const controlador = new AbortController();
  const limite = setTimeout(() => controlador.abort(), TEMPO_LIMITE_MS);

  let resposta: Response;
  try {
    resposta = await fetch(`https://viacep.com.br/ws/${digitos}/json/`, {
      signal: controlador.signal,
      cache: "no-store",
    });
  } catch {
    // Timeout, DNS, rede. Não é erro do cliente e não vira alarme.
    return { ok: false, motivo: "indisponivel" };
  } finally {
    clearTimeout(limite);
  }

  if (!resposta.ok) {
    // O ViaCEP responde 400 a CEP mal formado; o resto é indisponibilidade.
    return { ok: false, motivo: resposta.status === 400 ? "formato" : "indisponivel" };
  }

  let dados: {
    erro?: boolean | string;
    logradouro?: string;
    bairro?: string;
    localidade?: string;
    uf?: string;
  };
  try {
    dados = (await resposta.json()) as typeof dados;
  } catch {
    return { ok: false, motivo: "indisponivel" };
  }

  // CEP inexistente vem como `{ "erro": true }` — e em algumas respostas como
  // a string "true". Os dois casos são o mesmo fato.
  if (dados.erro === true || dados.erro === "true") {
    return { ok: false, motivo: "nao_encontrado" };
  }

  const cidade = (dados.localidade ?? "").trim();
  const uf = (dados.uf ?? "").trim().toUpperCase();

  // Sem cidade e UF o preenchimento não ajuda ninguém. Rua e bairro podem
  // vir vazios legitimamente — CEP de logradouro único, por exemplo — e
  // nesse caso o cliente completa o que faltar.
  if (!cidade || uf.length !== 2) {
    logger.warn("cep:resposta_incompleta", {});
    return { ok: false, motivo: "nao_encontrado" };
  }

  return {
    ok: true,
    logradouro: (dados.logradouro ?? "").trim(),
    bairro: (dados.bairro ?? "").trim(),
    cidade,
    uf,
    // `complemento` do ViaCEP NÃO é copiado de propósito: lá ele significa
    // "lado ímpar", "até 500", faixa de numeração. O nosso campo de
    // complemento é o apartamento do cliente (RN-ENT-004).
  };
}
