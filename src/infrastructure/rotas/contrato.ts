/**
 * Contrato do provedor de rotas.
 *
 * 05-PLANO-IMPLEMENTACAO.md §9.3 · CLAUDE.md §20 · 01-DOCUMENTO-MESTRE.md §79.2
 *
 * "Google pode ser o primeiro provedor, mas regra de domínio não deve
 * depender de nomes/campos específicos dele."
 *
 * Por isso nada aqui menciona `place_id`, `formatted_address`, `routes[0]`
 * ou qualquer outro vocabulário do Google. Trocar de provedor é escrever
 * outra implementação deste contrato — nenhuma regra de negócio muda.
 */

export type Coordenada = { latitude: number; longitude: number };

/**
 * Quanto se pode confiar na localização encontrada.
 *
 * `ambigua` NÃO é sucesso: RN-ENT-003 exige confiança suficiente antes de
 * avançar, e RN-ENT-005 prevê ajuste no mapa nesse caso.
 */
export type Confianca = "exata" | "aproximada" | "ambigua";

/**
 * O que vai para a geocodificação.
 *
 * RN-ENT-004: complemento e ponto de referência NÃO participam do cálculo
 * geográfico — e por isso nem aparecem neste tipo. "Ap 42, fundos, perto da
 * padaria" só atrapalharia a busca do endereço.
 */
export type EnderecoParaGeocodificar = {
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep?: string | undefined;
};

export type MotivoFalha =
  /** Endereço não existe ou não foi encontrado. */
  | "nao_encontrado"
  /** Encontrado, mas sem precisão suficiente para cobrar por distância. */
  | "ambiguo"
  /** Origem e destino sem rota viária entre si. */
  | "sem_rota"
  /** O provedor não respondeu, recusou ou estourou o tempo. */
  | "indisponivel"
  /** Falta credencial ou configuração — problema nosso, não do cliente. */
  | "configuracao";

export type ResultadoGeocodificacao =
  | {
      ok: true;
      coordenada: Coordenada;
      confianca: Exclude<Confianca, "ambigua">;
      enderecoFormatado: string;
      provedor: string;
    }
  | { ok: false; motivo: MotivoFalha; mensagem: string; provedor: string };

export type ResultadoRota =
  | {
      ok: true;
      /** Distância RODOVIÁRIA, em km. Nunca linha reta (RN-ENT-006). */
      distanciaKm: number;
      duracaoMinutos: number | null;
      provedor: string;
    }
  | { ok: false; motivo: MotivoFalha; mensagem: string; provedor: string };

export interface ProvedorDeRotas {
  readonly nome: string;
  geocodificar(endereco: EnderecoParaGeocodificar): Promise<ResultadoGeocodificacao>;
  /** Rota de carro entre dois pontos. A origem é a loja (RN-ENT-007). */
  rota(origem: Coordenada, destino: Coordenada): Promise<ResultadoRota>;
}

/**
 * Monta a consulta de endereço.
 *
 * Centralizado para que nenhuma implementação inclua complemento ou
 * referência por descuido (RN-ENT-004).
 */
export function consultaDeEndereco(e: EnderecoParaGeocodificar): string {
  return [
    `${e.logradouro}, ${e.numero}`,
    e.bairro,
    `${e.cidade} - ${e.uf}`,
    e.cep,
    "Brasil",
  ]
    .filter((p): p is string => Boolean(p && p.trim()))
    .join(", ");
}
