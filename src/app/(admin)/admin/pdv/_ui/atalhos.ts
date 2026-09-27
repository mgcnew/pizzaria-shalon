/**
 * A TABELA DE DECISÃO DOS ATALHOS DO PDV — Fase 12, Etapa 9.
 *
 * 09-PDV-FRENTE-DE-CAIXA.md §3 · CLAUDE.md §38, §48
 *
 * POR QUE ISTO É UM MÓDULO PURO, e não `onKeyDown` espalhado pelos componentes.
 *
 * Atalho de balcão erra de um jeito específico: ele age onde não devia. O
 * operador digita "1/2 calabresa" numa observação e o `/` adiciona uma forma de
 * pagamento; aperta `−` para corrigir um valor e o carrinho perde uma unidade.
 * Esse defeito não aparece clicando na tela — aparece em cima de dinheiro, no
 * movimento da noite.
 *
 * Uma função pura de `(tecla, contexto) → ação | null` pode ser interrogada
 * exaustivamente: para cada tecla, **em que contexto ela NÃO deve agir**. É essa
 * a pergunta que a suíte faz, e ela não é respondível por um handler que só
 * existe dentro de um componente montado.
 *
 * Os adaptadores nos componentes ficam burros de propósito: leem o contexto,
 * chamam esta função, executam a ação. Nenhuma decisão mora lá.
 *
 * NADA AQUI AUTORIZA NADA. `podeSalvar` é a mesma condição que já desabilita o
 * botão, e existe para o atalho não oferecer um caminho que o clique não
 * ofereceria. Quem recusa de verdade é o servidor (CLAUDE.md §12).
 */

/**
 * Teclas que o navegador reserva e que NÃO entram na tabela.
 *
 * F11 (tela cheia) e F12 (devtools) não são nem interceptáveis. F1, F5, F6 e
 * F10 são interceptáveis, mas sequestrá-las tiraria do operador a ajuda, o
 * recarregar, a barra de endereço e o menu — e recarregar é justamente o que
 * ele vai querer quando algo travar no balcão.
 *
 * F3 e F7 SÃO reclamadas pelo navegador — F3 abre o "localizar", F7 alterna
 * navegação por cursor no Firefox — e por isso quem as usa precisa chamar
 * `preventDefault`. Medido em 27/09/2026: as duas chegam com `cancelable: true`
 * e o `preventDefault` pega. Elas estão na tabela; a documentação do §3, que as
 * listava como simplesmente livres, foi corrigida.
 */
export const TECLAS_RESERVADAS = ["F1", "F5", "F6", "F10", "F11", "F12"] as const;

/** O que o PDV sabe fazer por tecla. Nomes com prefixo de quem executa. */
export type AcaoDoPdv =
  // --------------------------------------------------------------- venda
  | "venda:nova"
  | "venda:focar-leitura"
  | "venda:resolver"
  | "venda:limpar-leitura"
  | "venda:resultado-anterior"
  | "venda:resultado-proximo"
  | "venda:escolher-resultado"
  | "venda:mais"
  | "venda:menos"
  | "venda:remover"
  | "venda:linha-anterior"
  | "venda:linha-proxima"
  | "venda:salvar"
  | "venda:fechar-configurador"
  // --------------------------------------------------------------- caixa
  | "caixa:reforco"
  | "caixa:sangria";

/** Só o que da tecla interessa. Desacopla a decisão do `KeyboardEvent`. */
export type TeclaPressionada = {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
};

/**
 * O estado da tela no instante da tecla.
 *
 * Tudo é booleano e nada é opcional: um contexto com campo faltando seria um
 * atalho decidindo no escuro.
 */
export type ContextoDoPdv = {
  /**
   * Há campo de texto com foco — `input`, `textarea`, `select` ou
   * `contentEditable`. É a guarda mais importante do arquivo: `+`, `−`, `/`,
   * `*` e `Delete` são CARACTERES, e num campo eles pertencem a quem digita.
   */
  focoEmCampo: boolean;
  /** O campo de leitura especificamente — nele as setas navegam resultados. */
  focoNaLeitura: boolean;
  /** O campo de leitura tem conteúdo. É o que habilita Tab como Enter. */
  leituraPreenchida: boolean;
  /**
   * Menu, modal ou drawer aberto. O PDV CEDE A VEZ inteira: eles têm o próprio
   * `Escape`, e dois `Escape` na mesma tecla fechariam duas coisas de uma vez.
   */
  cedendoAVez: boolean;

  temItens: boolean;
  /** A MESMA condição que desabilita o botão de salvar. */
  podeSalvar: boolean;
  temResultados: boolean;
  configuradorAberto: boolean;
  /** Caixa aberto e sessão autorizada a fazer reforço/sangria. */
  podeMovimentarCaixa: boolean;
};

/** `+` vem como "+" com shift e como "Add" em teclado numérico; `=` é a mesma tecla. */
const AUMENTA = ["+", "=", "Add"];
const DIMINUI = ["-", "_", "Subtract"];

/**
 * A decisão. `null` significa **não faça nada e deixe a tecla seguir** — o que
 * é a resposta certa na maioria dos contextos, e é o que a suíte mais verifica.
 */
export function decidirAtalho(
  tecla: TeclaPressionada,
  ctx: ContextoDoPdv,
): AcaoDoPdv | null {
  const { key, ctrlKey, metaKey, altKey, shiftKey } = tecla;

  /**
   * "ALGUÉM ESTÁ DIGITANDO" — a guarda real, e ela não é `focoEmCampo`.
   *
   * O campo de leitura é o foco PADRÃO da tela (§2.1). Se `+`, `−`, `Delete` e
   * as setas exigissem foco fora de qualquer campo, eles nunca agiriam no estado
   * normal do balcão: o operador teria de sair do campo de leitura para mexer no
   * carrinho e voltar para bipar o próximo item. Um atalho que só funciona depois
   * de um Tab não é atalho.
   *
   * Campo de leitura VAZIO não é alguém digitando — não há texto para roubar. É
   * a única exceção, e ela é estreita de propósito: qualquer outro campo, e o
   * próprio campo de leitura com conteúdo, continuam intocáveis.
   *
   * O preço: um código de barras que comece por `-` perde o primeiro caractere
   * ao ser bipado num campo vazio. É aceito conscientemente — o código não
   * resolve, o operador vê e bipa de novo. O erro é visível e sem consequência,
   * ao contrário de mexer no carrinho de quem estava escrevendo uma observação.
   */
  const digitando =
    ctx.focoEmCampo && !(ctx.focoNaLeitura && !ctx.leituraPreenchida);

  // 1. ALT E META SAEM ANTES DE QUALQUER COISA.
  //
  //    `Alt+F4` fecha a janela e `Cmd+…` é atalho de sistema. Interceptar
  //    qualquer um deles é pior do que não ter atalho nenhum.
  if (altKey || metaKey) return null;

  // 2. Tecla reservada nunca vira ação, mesmo se alguém a acrescentar à tabela
  //    por distração. A lista é a autoridade.
  if ((TECLAS_RESERVADAS as readonly string[]).includes(key)) return null;

  // 3. Menu, modal ou drawer aberto: o PDV não age. Nem o `Escape` — ele é
  //    deles, e é quem fecha o que está por cima.
  if (ctx.cedendoAVez) return null;

  // 4. Atalhos com Ctrl continuam pertencendo ao navegador.
  if (ctrlKey) return null;

  // 5. `Escape` — fecha o mais interno primeiro, um por vez.
  if (key === "Escape") {
    if (ctx.configuradorAberto) return "venda:fechar-configurador";
    if (ctx.leituraPreenchida) return "venda:limpar-leitura";
    return null;
  }

  // 7. As de função. Globais, e por isso as únicas que funcionam com foco em
  //    campo — são teclas que ninguém digita dentro de um texto.
  switch (key) {
    case "F2":
      return "venda:nova";
    case "F3":
      return "venda:focar-leitura";
    case "F4":
      return ctx.podeMovimentarCaixa ? "caixa:reforco" : null;
    case "F9":
      return ctx.podeMovimentarCaixa ? "caixa:sangria" : null;
    case "F7":
      // Mesma condição do botão. Sem itens ou sem forma escolhida, o atalho
      // não inventa um caminho que o clique não tem.
      return ctx.podeSalvar ? "venda:salvar" : null;
  }

  // 8. `Enter` e `Tab` no campo de leitura.
  //
  //    COM O CONFIGURADOR ABERTO, NENHUM DOS DOIS RESOLVE. O campo ainda tem o
  //    código que abriu a escolha de tamanho, e resolver de novo reabriria a
  //    mesma escolha em cima dela. Aqui o Tab volta a ser navegação — que é
  //    justamente como o operador alcança os tamanhos e o "Adicionar à venda"
  //    sem tocar no mouse. Para bipar outro item, `Esc` fecha e limpa.
  if (ctx.focoNaLeitura && !shiftKey && !ctx.configuradorAberto) {
    if (key === "Enter") return ctx.leituraPreenchida ? "venda:resolver" : null;

    // TAB SÓ EQUIVALE A ENTER COM CONTEÚDO. Vazio, ele navega como sempre —
    // senão o campo prenderia o foco e tiraria do teclado a única saída dele
    // (CLAUDE.md §38). Leitor de código sempre manda o conteúdo antes do Tab,
    // então o caso que importa está coberto.
    if (key === "Tab") return ctx.leituraPreenchida ? "venda:resolver" : null;
  }

  // 9. Setas. No campo de leitura navegam os resultados; fora dele, o carrinho.
  if (key === "ArrowUp" || key === "ArrowDown") {
    const desce = key === "ArrowDown";

    // No campo de leitura COM resultados, as setas percorrem os resultados —
    // mesmo com conteúdo digitado, porque é exatamente o momento de escolher.
    if (ctx.focoNaLeitura && ctx.temResultados) {
      return desce ? "venda:resultado-proximo" : "venda:resultado-anterior";
    }

    // Em qualquer outro campo — e no de leitura com conteúdo e sem resultados —
    // a seta é do cursor, não nossa.
    if (digitando) return null;

    if (ctx.temResultados) {
      return desce ? "venda:resultado-proximo" : "venda:resultado-anterior";
    }
    if (ctx.temItens) {
      return desce ? "venda:linha-proxima" : "venda:linha-anterior";
    }
    return null;
  }

  // 10. `Enter` fora do campo escolhe o resultado em destaque.
  if (key === "Enter" && !digitando && ctx.temResultados) {
    return "venda:escolher-resultado";
  }

  // 11. DAQUI PARA BAIXO SÃO CARACTERES DIGITÁVEIS. Com alguém digitando, eles
  //     pertencem a quem digita, e é isto que impede "1/2 calabresa" numa
  //     observação de mexer no pagamento.
  if (digitando) return null;

  if (ctx.temItens) {
    if (AUMENTA.includes(key)) return "venda:mais";
    if (DIMINUI.includes(key)) return "venda:menos";
    if (key === "Delete") return "venda:remover";
  }

  return null;
}

/**
 * As teclas ATIVAS agora, para a faixa inferior.
 *
 * Derivada da mesma função: a faixa não pode anunciar uma tecla que a tabela
 * recusaria, e manter duas listas garantiria que um dia elas divergissem. Se
 * `decidirAtalho` diz `null`, a tecla não aparece.
 */
export function teclasAtivas(ctx: ContextoDoPdv): { tecla: string; rotulo: string }[] {
  const seco: TeclaPressionada = {
    key: "",
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
  };
  const age = (key: string, ctrlKey = false) =>
    decidirAtalho({ ...seco, key, ctrlKey }, ctx) !== null;

  const faixa: { tecla: string; rotulo: string }[] = [];

  if (age("F2")) faixa.push({ tecla: "F2", rotulo: "nova venda" });
  if (age("F3")) faixa.push({ tecla: "F3", rotulo: "busca" });
  if (age("F4")) faixa.push({ tecla: "F4", rotulo: "reforço" });
  if (age("F7")) faixa.push({ tecla: "F7", rotulo: "salvar" });
  if (age("F9")) faixa.push({ tecla: "F9", rotulo: "sangria" });
  if (age("+")) faixa.push({ tecla: "+ −", rotulo: "quantidade" });
  if (age("Delete")) faixa.push({ tecla: "Del", rotulo: "remover" });
  if (age("ArrowDown")) faixa.push({ tecla: "↑ ↓", rotulo: "navegar" });
  if (age("Escape")) faixa.push({ tecla: "Esc", rotulo: "voltar" });

  return faixa;
}
