/**
 * Opções de tamanho como o cliente as vê (D-2026-11-06-184).
 *
 * Um tamanho do cadastro pode virar DUAS opções: a inteira, de 1 sabor, e a
 * "Meio a meio", de 2 sabores obrigatórios, com o mesmo preço. Assim quem
 * escolhe a Tradicional não acha que já escolheu a meio a meio.
 *
 * Só apresentação: quem decide preço e quantos sabores cabem é o servidor.
 */

export type TamanhoParaOpcao = {
  variacao_id: string;
  max_sabores: number;
  min_sabores?: number | undefined;
  meio_a_meio_separado?: boolean | undefined;
};

export type OpcaoDeTamanho<T extends TamanhoParaOpcao> = {
  /** Única entre as opções: a variação, mais `:meio` na opção meio a meio. */
  chave: string;
  tamanho: T;
  /** É a opção "Meio a meio" de um tamanho separado. */
  meio: boolean;
  /** Sabores obrigatórios, contando o da página. */
  minimo: number;
  /** Sabores que cabem, contando o da página. */
  maximo: number;
};

export function opcoesDeTamanho<T extends TamanhoParaOpcao>(tamanhos: readonly T[]): OpcaoDeTamanho<T>[] {
  return tamanhos.flatMap((t) => {
    const minimo = Math.max(1, Math.min(t.min_sabores ?? 1, t.max_sabores));
    if (t.meio_a_meio_separado && t.max_sabores >= 2) {
      return [
        { chave: t.variacao_id, tamanho: t, meio: false, minimo: 1, maximo: 1 },
        { chave: `${t.variacao_id}:meio`, tamanho: t, meio: true, minimo: 2, maximo: 2 },
      ];
    }
    return [{ chave: t.variacao_id, tamanho: t, meio: false, minimo, maximo: t.max_sabores }];
  });
}

/** Quantos sabores ainda faltam escolher para a opção valer. */
export function saboresQueFaltam(opcao: { minimo: number } | null, escolhidos: number): number {
  return opcao === null ? 0 : Math.max(0, opcao.minimo - escolhidos);
}
