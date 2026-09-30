"use client";

import { useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { formatBRL } from "@/lib/format";
import { SelectMenu } from "@/ui/components/SelectMenu";
import { montarItem } from "@/application/publico/acoes";
import { finalizarVendaRapida, resolverCodigo, buscarNoCatalogo } from "@/application/pdv/acoes";
import type { ItemCatalogoPdv, VarianteDoPdv } from "@/application/pdv/tipos";
import type { ItemDoRascunho } from "@/application/pedidos/tipos";
import type { FormaParaRecebimento } from "@/app/(admin)/admin/pedidos/_ui/Recebimento";
import type { AreaComTeclado } from "./PdvComTeclado";

/**
 * Nova venda de balcão — Fase 12, Etapa 6.
 *
 * 09-PDV-FRENTE-DE-CAIXA.md §1.1, §1.2, §2.1, §4.1
 *
 * TRÊS COISAS QUE ESTA TELA NÃO FAZ:
 *
 *  1. não calcula preço. Cada item é precificado por `montar_item` dentro do
 *     configurador, e o pedido inteiro é recalculado por `criar_pedido` ao
 *     salvar. O total daqui é SOMA DE CONFERÊNCIA — existe para o operador
 *     olhar, nunca para cobrar (CLAUDE.md §16);
 *  2. não conclui item de produção. A venda rápida é criada, recebida e
 *     encerrada atomicamente; carrinho com preparo pertence a Pedidos;
 *  3. não normaliza código de barras. O que foi lido sobe como veio, com os
 *     zeros à esquerda, e quem normaliza é o banco.
 *
 * A conclusão chama uma transação que reutiliza `criar_pedido`,
 * `registrar_pagamento` e a máquina de estados. Assim não há preço, dinheiro
 * ou transição decididos no navegador.
 */

function paraNumero(texto: string): number | null {
  const limpo = texto.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  if (limpo === "") return null;
  const numero = Number(limpo);
  return Number.isFinite(numero) ? numero : null;
}

type Resolucao =
  | { tipo: "nada" }
  | { tipo: "buscando" }
  | { tipo: "aviso"; texto: string }
  | { tipo: "resultados"; itens: ItemCatalogoPdv[]; termo: string }
  | {
      tipo: "variantes";
      produto: { id: string; nome: string; slug: string; exige_producao: boolean };
      variantes: VarianteDoPdv[];
    };

type OpcaoRapida = {
  chave: string;
  produtoId: string;
  produtoSlug: string;
  nome: string;
  detalhe: string;
  variacaoId: string | null;
  preco: number | null;
  ativo: boolean;
  disponivel: boolean;
  exigeProducao: boolean;
};

type VendaConcluida = {
  id: string;
  numero: number;
  total: number;
  forma: string;
  recebido: number | null;
  troco: number | null;
  itens: ItemDoRascunho[];
};

function opcoesDoProduto(produto: ItemCatalogoPdv): OpcaoRapida[] {
  if (produto.variantes.length > 0) {
    return produto.variantes.map((variante) => ({
      chave: variante.id,
      produtoId: produto.id,
      produtoSlug: produto.slug,
      nome: `${produto.nome} · ${variante.tamanho_nome}`,
      detalhe: produto.categoria_nome,
      variacaoId: variante.id,
      preco: variante.preco,
      ativo: produto.ativo,
      disponivel: produto.disponivel && variante.disponivel,
      exigeProducao: produto.exige_producao,
    }));
  }

  return [{
    chave: produto.id,
    produtoId: produto.id,
    produtoSlug: produto.slug,
    nome: produto.nome,
    detalhe: produto.categoria_nome,
    variacaoId: null,
    preco: produto.preco,
    ativo: produto.ativo,
    disponivel: produto.disponivel,
    exigeProducao: produto.exige_producao,
  }];
}

export function NovaVenda({
  formas,
  autorizado,
  caixaAberto,
  registrar,
  aoMudar,
}: {
  /** Formas efetivamente recebidas pelo caixa. */
  formas: FormaParaRecebimento[];
  autorizado: boolean;
  caixaAberto: boolean;
  /** Entrega ao casco o `estado()` e o `executar()` desta área (Etapa 9). */
  registrar: (area: AreaComTeclado | null) => void;
  /** Avisa o casco que a faixa de atalhos precisa ser recalculada. */
  aoMudar: () => void;
}) {
  const [leitura, setLeitura] = useState("");
  const [estado, setEstado] = useState<Resolucao>({ tipo: "nada" });

  const [itens, setItens] = useState<ItemDoRascunho[]>([]);
  const [formaId, setFormaId] = useState("");
  const [bandeiraId, setBandeiraId] = useState("");
  const [recebido, setRecebido] = useState("");

  const [erro, setErro] = useState<string | null>(null);
  const [concluindo, setConcluindo] = useState(false);
  const [criado, setCriado] = useState<VendaConcluida | null>(null);
  const [ocupado, iniciar] = useTransition();
  const campo = useRef<HTMLInputElement>(null);

  /**
   * NAVEGAÇÃO POR TECLADO — Etapa 9, §3.
   *
   * `−1` é "nenhum em destaque", e é o estado inicial de propósito: a primeira
   * seta ↓ destaca o primeiro resultado em vez de pular para o segundo.
   */
  const [resultadoEmFoco, setResultadoEmFoco] = useState(-1);
  /**
   * A "linha atual" do carrinho, que `+`, `−` e Delete afetam.
   *
   * O índice é DERIVADO na leitura (`linhaAtual`) em vez de corrigido por
   * efeito quando o carrinho encolhe: corrigir depois deixaria um render com o
   * destaque numa linha que não existe mais, e o lint reprova com razão.
   */
  const [linhaEmFoco, setLinhaEmFoco] = useState(0);
  /** O índice válido agora, sempre dentro do carrinho. */
  const linhaAtual = itens.length === 0 ? 0 : Math.min(linhaEmFoco, itens.length - 1);

  // Soma de conferência. O total que vale é o que o servidor devolver.
  const subtotal = itens.reduce((s, i) => s + i.total, 0);
  const forma = formas.find((f) => f.id === formaId) ?? null;
  const recebidoNumero = paraNumero(recebido);
  const pagamentoEmDinheiro = forma?.familia === "cash";
  const trocoPrevisto = pagamentoEmDinheiro && recebidoNumero !== null
    ? Math.max(0, recebidoNumero - subtotal)
    : 0;
  const quantidadeTotal = itens.reduce((soma, item) => soma + item.quantidade, 0);
  const opcoesEncontradas: OpcaoRapida[] =
    estado.tipo === "resultados"
      ? estado.itens.flatMap(opcoesDoProduto)
      : estado.tipo === "variantes"
        ? estado.variantes.map((variante) => ({
            chave: variante.id,
            produtoId: estado.produto.id,
            produtoSlug: estado.produto.slug,
            nome: `${estado.produto.nome} · ${variante.tamanho_nome}`,
            detalhe: "Escolha o tamanho",
            variacaoId: variante.id,
            preco: variante.preco,
            ativo: true,
            disponivel: variante.disponivel,
            exigeProducao: estado.produto.exige_producao,
          }))
        : [];

  const podeSalvar =
    !ocupado &&
    autorizado &&
    caixaAberto &&
    itens.length > 0 &&
    forma !== null &&
    (!forma.exige_bandeira || bandeiraId !== "") &&
    (!pagamentoEmDinheiro || (recebidoNumero !== null && recebidoNumero >= subtotal));

  /**
   * Chave da tentativa: nasce no primeiro envio e sobrevive a clique repetido
   * e a retry de rede. O balcão é justamente onde se clica duas vezes
   * (CLAUDE.md §34). Só é descartada quando o pedido entra de fato.
   */
  const tentativa = useRef<string | null>(null);

  function limparBusca() {
    setLeitura("");
    setEstado({ tipo: "nada" });
    setResultadoEmFoco(-1);
    campo.current?.focus();
  }

  /** F2 do documento: a venda começa do zero, com o foco na leitura. */
  function novaVenda() {
    setItens([]);
    setErro(null);
    setCriado(null);
    setConcluindo(false);
    setFormaId("");
    setBandeiraId("");
    setRecebido("");
    tentativa.current = null;
    limparBusca();
  }

  /**
   * A RECUSA DA VENDA RÁPIDA, escrita uma vez só.
   *
   * A Nova Venda é balcão rápido: bebida e produto pronto. Pizza e fogazza
   * entram pela área de Pedidos, que é onde um pedido de produção pertence.
   *
   * Quem informa `exige_producao` é o SERVIDOR — `resolver_codigo_de_barras` e
   * `buscar_catalogo_pdv`, as duas RPCs que só o PDV usa, ambas DEFINER e sob
   * `catalog.view`. A tela não deduz isso de `product_type` nem de lista
   * própria (CLAUDE.md §12).
   *
   * E é orientação de fluxo, não fronteira: quem insistisse por outro caminho
   * criaria um pedido de balcão com pizza — que é um pedido VÁLIDO, e que
   * `requires_production` manda para a produção normalmente. A proteção que
   * importa está na autoridade, não aqui.
   */
  function recusarPorProducao(nome: string) {
    setEstado({
      tipo: "aviso",
      texto: `${nome} exige produção. Crie o pedido pela área de Pedidos.`,
    });
  }

  async function adicionarRapido(opcao: {
    produtoId: string;
    produtoSlug: string;
    nome: string;
    variacaoId: string | null;
  }) {
    const existente = itens.find(
      (item) => item.produtoId === opcao.produtoId && item.variacaoId === opcao.variacaoId,
    );
    const quantidade = Math.min(99, (existente?.quantidade ?? 0) + 1);
    const sabores = opcao.variacaoId ? [opcao.variacaoId] : [];
    const montado = await montarItem({
      produto_id: opcao.produtoId,
      variacao_id: opcao.variacaoId,
      sabores,
      borda_id: null,
      adicionais: [],
      observacao: "",
      quantidade,
    });

    if (!montado.ok) {
      setEstado({ tipo: "aviso", texto: montado.erro });
      return;
    }

    const linha = existente?.linha ?? `${opcao.produtoId}|${opcao.variacaoId ?? "-"}|rapido`;
    const item: ItemDoRascunho = {
      linha,
      produtoId: opcao.produtoId,
      produtoSlug: opcao.produtoSlug,
      nome: montado.nome,
      variacaoId: opcao.variacaoId,
      sabores,
      bordaId: null,
      adicionais: [],
      observacao: "",
      quantidade: montado.quantidade,
      precoUnitario: montado.preco_unitario,
      total: montado.total,
      rotulos: montado.rotulos,
    };

    setItens((lista) =>
      existente
        ? lista.map((atual) => (atual.linha === existente.linha ? item : atual))
        : [...lista, item],
    );
    setCriado(null);
    limparBusca();
  }

  /**
   * Enter no campo: primeiro tenta CÓDIGO, depois cai para a busca (§2.1).
   *
   * A ordem importa. Um código de barras é uma afirmação exata sobre qual item
   * é aquele; um termo de busca é uma aproximação. Tentar a busca primeiro
   * faria um código numérico casar por acaso com outro produto.
   */
  function confirmar() {
    const valor = leitura.trim();
    if (valor === "" || ocupado) return;
    setErro(null);
    setEstado({ tipo: "buscando" });

    iniciar(async () => {
      const r = await resolverCodigo(valor);

      if (r.ok === false) {
        setEstado({ tipo: "aviso", texto: r.erro });
        return;
      }

      if (r.encontrado === true) {
        // Item existe mas não pode ser vendido agora: informa e NÃO adiciona.
        // Quem decide isso é o banco; aqui só se relata.
        if (!r.ativo || !r.disponivel) {
          setEstado({
            tipo: "aviso",
            texto: !r.ativo
              ? `${r.produto_nome} está inativo no cadastro e não pode ser vendido.`
              : `${r.produto_nome} está indisponível hoje.`,
          });
          return;
        }

        // Exige preparo: informa e NÃO adiciona, pelo mesmo caminho de
        // "inativo" e "indisponível" — item que existe mas não se vende aqui.
        if (r.exige_producao) {
          recusarPorProducao(r.produto_nome);
          return;
        }

        // Código genérico com mais de uma variação: mostra opções diretas. O
        // clique seguinte já adiciona; nenhum configurador ou observação entra
        // no fluxo rápido.
        if (r.precisa_escolher_variante) {
          setResultadoEmFoco(-1);
          setEstado({
            tipo: "variantes",
            produto: {
              id: r.produto_id,
              nome: r.produto_nome,
              slug: r.produto_slug,
              exige_producao: r.exige_producao,
            },
            variantes: r.variantes,
          });
          return;
        }

        // Código de variante ou produto simples identifica tudo que a venda
        // rápida precisa. O servidor ainda valida e precifica antes de entrar.
        await adicionarRapido({
          produtoId: r.produto_id,
          produtoSlug: r.produto_slug,
          nome: r.produto_nome,
          variacaoId: r.alvo === "variante" ? r.variante_id : null,
        });
        return;
      }

      // Não é código cadastrado: vira termo de busca (§2.1).
      const achados = await buscarNoCatalogo(valor);
      // O destaque volta para "nenhum" JUNTO com a lista nova, no mesmo
      // update: corrigir isso depois, num efeito, deixaria um render com o
      // índice da busca anterior apontando para outro produto.
      setResultadoEmFoco(-1);
      setEstado({ tipo: "resultados", itens: achados, termo: valor });
    });
  }

  function salvar() {
    if (!podeSalvar || forma === null) return;
    setErro(null);
    tentativa.current ??= crypto.randomUUID();

    iniciar(async () => {
      const itensDaVenda = itens;
      const r = await finalizarVendaRapida({
        idempotency_key: tentativa.current,
        itens: itens.map((i) => ({
          linha: i.linha,
          produto_id: i.produtoId,
          variacao_id: i.variacaoId,
          sabores: i.sabores,
          borda_id: i.bordaId,
          adicionais: i.adicionais,
          observacao: i.observacao,
          quantidade: i.quantidade,
        })),
        pagamento: {
          forma_id: forma.id,
          bandeira_id: forma.exige_bandeira ? bandeiraId : null,
          recebido: pagamentoEmDinheiro ? recebidoNumero : null,
        },
      });

      // O CARRINHO SOBREVIVE À FALHA. Refazer a venda inteira porque a rede
      // caiu seria punir o operador por um problema que não é dele.
      if (!r.ok) {
        setErro(r.erro);
        return;
      }

      // E só some depois da confirmação do servidor — com o número que ELE deu
      // e o total que ELE calculou.
      setCriado({
        id: r.pedido_id,
        numero: r.numero,
        total: r.total,
        forma: r.forma,
        recebido: r.recebido,
        troco: r.troco,
        itens: itensDaVenda,
      });
      setItens([]);
      setFormaId("");
      setBandeiraId("");
      setRecebido("");
      tentativa.current = null;
      limparBusca();
    });
  }

  // ------------------------------------------------------- teclado (Etapa 9)

  /**
   * O que o casco precisa saber. Lido no INSTANTE da tecla, por função — é o
   * que evita empurrar todo este estado para cima só para manter a faixa de
   * atalhos informada.
   */
  const estadoParaOTeclado = () => ({
      leituraPreenchida: leitura.trim() !== "",
      temItens: itens.length > 0,
      podeSalvar,
      temResultados: opcoesEncontradas.length > 0,
      quantidadeItens: quantidadeTotal,
      totalVenda: subtotal,
  });

  function mudarQuantidade(linha: string, delta: number) {
    setItens((lista) =>
      lista.map((i) =>
        i.linha === linha
          ? {
              ...i,
              quantidade: Math.min(99, Math.max(1, i.quantidade + delta)),
              // O unitário é do servidor; a multiplicação é aritmética de
              // exibição, e o servidor recalcula tudo ao salvar.
              total: i.precoUnitario * Math.min(99, Math.max(1, i.quantidade + delta)),
            }
          : i,
      ),
    );
  }

  /**
   * O EXECUTOR NÃO É MEMOIZADO, e essa é a correção de um defeito real.
   *
   * Na primeira versão ele era um `useCallback` com lista de dependências à
   * mão. `confirmar`, `salvar` e `novaVenda` são funções recriadas a cada
   * render, então o executor guardava as do render em que a lista mudou por
   * último — e `confirmar` lia o campo de leitura do fecho dele. Resultado
   * medido no navegador: bipar e apertar Tab não fazia nada, porque o
   * `confirmar` capturado ainda via o campo vazio.
   *
   * Manter dependências à mão para um executor que toca quase todo o estado da
   * tela é uma lista que vai divergir. Então: função nova a cada render, guardada
   * num ref por efeito, e o que o casco registra é um invólucro estável. Sempre
   * fresco, sem lista para manter.
   */
  const executarAtalho = (acao: string) => {
    {
      switch (acao) {
        case "venda:nova":
          novaVenda();
          return;
        case "venda:focar-leitura":
          campo.current?.focus();
          campo.current?.select();
          return;
        case "venda:resolver":
          confirmar();
          return;
        case "venda:limpar-leitura":
          limparBusca();
          return;

        case "venda:resultado-proximo":
        case "venda:resultado-anterior": {
          const n = opcoesEncontradas.length;
          if (n === 0) return;
          const delta = acao === "venda:resultado-proximo" ? 1 : -1;
          setResultadoEmFoco((i) => {
            // Da última para a primeira: a lista do balcão é curta, e dar a
            // volta é menos atrito do que travar na ponta.
            const proximo = i === -1 ? (delta === 1 ? 0 : n - 1) : (i + delta + n) % n;
            return proximo;
          });
          return;
        }
        case "venda:escolher-resultado": {
          const escolhido = opcoesEncontradas[resultadoEmFoco === -1 ? 0 : resultadoEmFoco];
          // Indisponível não entra pelo teclado, como não entra pelo clique:
          // quem decide disponibilidade é o banco, e a tela só relata.
          if (escolhido === undefined || !escolhido.ativo || !escolhido.disponivel) return;
          // A MESMA recusa do clique: o atalho não abre um segundo caminho
          // para dentro do carrinho.
          if (escolhido.exigeProducao) {
            recusarPorProducao(escolhido.nome);
            return;
          }
          iniciar(async () => {
            await adicionarRapido(escolhido);
          });
          return;
        }

        case "venda:linha-proxima":
        case "venda:linha-anterior": {
          if (itens.length === 0) return;
          const delta = acao === "venda:linha-proxima" ? 1 : -1;
          setLinhaEmFoco((i) => (Math.min(i, itens.length - 1) + delta + itens.length) % itens.length);
          return;
        }
        case "venda:mais":
        case "venda:menos": {
          const linha = itens[linhaAtual];
          if (linha === undefined) return;
          mudarQuantidade(linha.linha, acao === "venda:mais" ? 1 : -1);
          return;
        }
        case "venda:remover": {
          const linha = itens[linhaAtual];
          if (linha === undefined) return;
          setItens((lista) => lista.filter((x) => x.linha !== linha.linha));
          return;
        }

        case "venda:concluir":
          if (itens.length > 0) setConcluindo(true);
          return;
      }
    }
  };

  /** O par vivo, trocado depois de cada render. */
  const vivo = useRef({ estado: estadoParaOTeclado, executar: executarAtalho });
  useEffect(() => {
    vivo.current = { estado: estadoParaOTeclado, executar: executarAtalho };
  });

  /** O que o casco registra: estável, e sempre delegando para o par vivo. */
  const area = useRef<AreaComTeclado>({
    estado: () => vivo.current.estado(),
    executar: (acao) => vivo.current.executar(acao),
  });

  useEffect(() => {
    registrar(area.current);
    return () => registrar(null);
  }, [registrar]);

  /** A faixa de atalhos do casco precisa saber que algo mudou por aqui. */
  useEffect(() => {
    aoMudar();
  }, [aoMudar, itens.length, quantidadeTotal, subtotal, estado.tipo, criado, podeSalvar, leitura]);

  const fecharConclusao = useCallback(() => setConcluindo(false), []);

  return (
    <div>
      {/* ------------------------------------------------ busca e leitor */}
      <section className="rounded-16 border border-border-shalon bg-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="m-0 text-[15px] font-bold text-ink">Buscar ou bipar</h2>
          <button
            type="button"
            onClick={novaVenda}
            className="min-h-touch cursor-pointer rounded-11 border-[1.5px] border-border-shalon bg-surface px-3 text-[13px] font-semibold text-ink hover:border-brand-orange"
          >
            Nova venda
          </button>
        </div>

        {/* `text`, nunca `number`: campo numérico come zero à esquerda, e em
            EAN-13 o zero à esquerda é significativo. */}
        <div className="motion-interactive group mt-3 flex min-h-[54px] items-center gap-3 rounded-14 border-[1.5px] border-border-shalon bg-bg px-3.5 transition-colors focus-within:border-brand-orange focus-within:bg-surface">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            className="h-5 w-5 shrink-0 text-muted transition-colors group-focus-within:text-brand-orange"
          >
            <path d="M3.5 5v14M7 5v14M10 5v14M14 5v14M16.5 5v14M20.5 5v14" stroke="currentColor" strokeWidth="1.5" />
            <path d="M2.5 8V4.5A1.5 1.5 0 0 1 4 3h3M21.5 8V4.5A1.5 1.5 0 0 0 20 3h-3M2.5 16v3.5A1.5 1.5 0 0 0 4 21h3M21.5 16v3.5A1.5 1.5 0 0 1 20 21h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            ref={campo}
            /*
             * `data-pdv="leitura"` é como o casco reconhece ESTE campo sem
             * precisar de uma ref compartilhada: ele lê `document.activeElement`
             * no instante da tecla, e o atributo diz se o foco está aqui (§2.1).
             */
            data-pdv="leitura"
            type="text"
            inputMode="text"
            autoComplete="off"
            value={leitura}
            onChange={(e) => setLeitura(e.target.value)}
            /*
             * SEM `onKeyDown` AQUI, e isto é a Etapa 9.
             *
             * Enter e Tab passaram a ser decididos por `atalhos.ts`, através do
             * listener único do casco. Manter o handler local faria o Enter
             * resolver DUAS vezes — o local e o global — e duas resoluções do
             * mesmo bipe é como um item entra dobrado no carrinho.
             */
            placeholder="Código ou nome do produto"
            aria-label="Código de barras ou nome do produto"
            className="min-h-[51px] min-w-0 flex-1 border-0 bg-transparent text-[15px] font-medium text-ink outline-none placeholder:text-muted"
          />
          {leitura ? (
            <button
              type="button"
              aria-label="Limpar código ou busca"
              onClick={limparBusca}
              className="motion-interactive flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-9 border-0 bg-tn text-[18px] text-ink-2 transition-colors hover:bg-border-shalon hover:text-ink"
            >
              ×
            </button>
          ) : (
            <span className="hidden shrink-0 items-center gap-1 rounded-8 border border-border-shalon bg-surface px-2 py-1 text-[10.5px] font-semibold text-muted sm:flex">
              Enter <span aria-hidden="true">↵</span>
            </span>
          )}
        </div>
        <p className="m-0 mt-1 text-[12px] text-muted">
          O leitor digita e confirma sozinho. Não encontrando o código, a mesma
          caixa procura pelo nome.
        </p>

        {itens.length > 0 ? (
          <div className="mt-4 overflow-hidden rounded-12 border border-border-shalon">
            <div className="hidden grid-cols-[minmax(0,1fr)_120px_110px_44px] gap-3 bg-elev px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-muted lg:grid">
              <span>Produto</span>
              <span className="text-center">Quantidade</span>
              <span className="text-right">Total</span>
              <span className="sr-only">Ações</span>
            </div>
            <ul className="m-0 list-none p-0">
              {itens.map((item, indice) => (
                <li
                  key={item.linha}
                  className={[
                    "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border-shalon px-3 py-2.5 last:border-b-0 lg:grid-cols-[minmax(0,1fr)_120px_110px_44px]",
                    indice === linhaAtual && itens.length > 1 ? "bg-elev/70" : "bg-surface",
                  ].join(" ")}
                >
                  <div className="min-w-0">
                    <p className="m-0 truncate text-[14px] font-semibold text-ink">{item.nome}</p>
                    {item.rotulos.length > 0 ? (
                      <p className="m-0 truncate text-[12px] text-muted">{item.rotulos.join(" · ")}</p>
                    ) : null}
                    <p className="m-0 text-[12px] text-ink-2 lg:hidden">
                      {formatBRL(item.precoUnitario)} cada
                    </p>
                  </div>

                  <div className="flex items-center justify-end gap-1 lg:justify-center">
                    <button
                      type="button"
                      aria-label={`Diminuir ${item.nome}`}
                      onClick={() => mudarQuantidade(item.linha, -1)}
                      className="flex size-8 cursor-pointer items-center justify-center rounded-9 border border-border-shalon bg-surface text-[15px] font-bold text-ink"
                    >
                      −
                    </button>
                    <span className="min-w-[2ch] text-center text-[13px] font-bold tabular-nums text-ink">
                      {item.quantidade}
                    </span>
                    <button
                      type="button"
                      aria-label={`Aumentar ${item.nome}`}
                      onClick={() => mudarQuantidade(item.linha, 1)}
                      className="flex size-8 cursor-pointer items-center justify-center rounded-9 border border-border-shalon bg-surface text-[15px] font-bold text-ink"
                    >
                      +
                    </button>
                  </div>

                  <strong className="col-start-1 text-[14px] tabular-nums text-ink lg:col-start-auto lg:text-right">
                    {formatBRL(item.total)}
                  </strong>
                  <button
                    type="button"
                    aria-label={`Remover ${item.nome}`}
                    title="Remover"
                    onClick={() => setItens((lista) => lista.filter((atual) => atual.linha !== item.linha))}
                    className="col-start-2 row-start-2 flex size-8 cursor-pointer items-center justify-center justify-self-end rounded-9 border-0 bg-transparent text-[18px] text-danger lg:col-start-auto lg:row-start-auto"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between gap-3 border-t border-border-shalon bg-elev px-3 py-2.5">
              <span className="text-[12.5px] font-semibold text-ink-2">
                {quantidadeTotal} {quantidadeTotal === 1 ? "item" : "itens"}
              </span>
              <strong className="font-display text-[18px] tabular-nums text-ink">{formatBRL(subtotal)}</strong>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-12 border border-dashed border-border-shalon bg-elev/50 px-3 py-4 text-center">
            <p className="m-0 text-[13px] text-muted">Os produtos adicionados aparecerão aqui.</p>
          </div>
        )}

        {estado.tipo === "buscando" ? (
          <p className="m-0 mt-3 text-[13px] text-muted">Procurando…</p>
        ) : null}

        {estado.tipo === "aviso" ? (
          <p
            role="status"
            className="m-0 mt-3 rounded-10 border border-twb bg-tw px-3 py-2 text-[13px] font-semibold text-twf"
          >
            {estado.texto}
          </p>
        ) : null}

        {estado.tipo === "resultados" || estado.tipo === "variantes" ? (
          opcoesEncontradas.length === 0 ? (
            <p className="m-0 mt-3 text-[13px] text-ink-2">
              {estado.tipo === "resultados" ? `Nada encontrado para “${estado.termo}”.` : "Nenhum tamanho disponível."}
            </p>
          ) : (
            <ul className="m-0 mt-3 list-none p-0">
              {opcoesEncontradas.map((opcao, indice) => (
                <li key={opcao.chave}>
                  <button
                    type="button"
                    disabled={ocupado || !opcao.disponivel || !opcao.ativo}
                    /* O destaque do teclado é VISUAL e não é foco do DOM: mover
                       o foco real para cá tiraria o campo de leitura de baixo
                       dos dedos, que é o oposto do que a Etapa 9 quer. */
                    data-emfoco={indice === resultadoEmFoco ? "sim" : undefined}
                    onClick={() => {
                      if (opcao.exigeProducao) {
                        recusarPorProducao(opcao.nome);
                        return;
                      }
                      iniciar(async () => { await adicionarRapido(opcao); });
                    }}
                    className={[
                      "flex w-full min-h-touch items-center justify-between gap-3 rounded-11 border-[1.5px] bg-transparent px-2 py-2 text-left",
                      indice === resultadoEmFoco
                        ? "border-cta bg-elev"
                        : "border-transparent",
                      opcao.disponivel && opcao.ativo
                        ? "cursor-pointer hover:bg-elev"
                        : "cursor-not-allowed opacity-60",
                    ].join(" ")}
                  >
                    <span className="min-w-0">
                      <span className="block text-[14.5px] font-semibold text-ink">
                        {opcao.nome}
                        {!opcao.ativo ? " · inativo" : !opcao.disponivel ? " · indisponível hoje" : ""}
                      </span>
                      <span className="block text-[12.5px] text-ink-2">{opcao.detalhe}</span>
                    </span>
                    <span className="whitespace-nowrap text-[14px] tabular-nums text-ink-2">
                      {opcao.preco !== null ? formatBRL(opcao.preco) : "—"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : null}

      </section>

      {/* A conferência só ocupa a tela quando a venda está pronta para revisão. */}
      {concluindo ? (
        <ModalVendaAtual aoFechar={fecharConclusao}>
      <section>
        <h2 className="m-0 mb-3 text-[15px] font-bold text-ink">Venda atual</h2>

        {criado !== null ? (
          <div className="mb-3 rounded-12 border border-tgb bg-tg p-3">
            <p role="status" className="m-0 text-[14px] font-semibold text-tgf">
              Venda #{criado.numero} concluída · {formatBRL(criado.total)}
            </p>

            <p className="m-0 mt-1 text-[12.5px] text-ink-2">
              Pagamento em {criado.forma} confirmado no PDV.
            </p>
            {criado.recebido !== null ? (
              <div className="mt-2 grid grid-cols-2 gap-2 rounded-10 bg-surface px-3 py-2 text-[13px]">
                <span className="text-muted">Recebido</span>
                <strong className="text-right tabular-nums text-ink">{formatBRL(criado.recebido)}</strong>
                <span className="text-muted">Troco</span>
                <strong className="text-right tabular-nums text-ink">{formatBRL(criado.troco ?? 0)}</strong>
              </div>
            ) : null}
            <div className="mt-3 border-t border-tgb pt-3">
              <CupomVenda58 venda={criado} aoNovaVenda={novaVenda} />
            </div>
          </div>
        ) : (
          <>

        {itens.length === 0 ? (
          <p className="m-0 text-[13.5px] text-ink-2">
            Nenhum item ainda. Bipe o código ou procure pelo nome ao lado.
          </p>
        ) : (
          <ul className="m-0 list-none p-0">
            {itens.map((i, indice) => (
              <li
                key={i.linha}
                /* A "linha atual" precisa ser VISÍVEL, senão `+` e Delete agem
                   num item que o operador não sabe qual é. */
                className={[
                  "border-b border-border-shalon py-2 last:border-0",
                  indice === linhaAtual && itens.length > 1
                    ? "-mx-2 rounded-11 border-b-0 bg-elev px-2"
                    : "",
                ].join(" ")}
              >
                <div className="flex justify-between gap-3">
                  <span className="text-[14.5px] font-semibold text-ink">{i.nome}</span>
                  <span className="whitespace-nowrap tabular-nums text-[14.5px] text-ink">
                    {formatBRL(i.total)}
                  </span>
                </div>
                {i.rotulos.map((r) => (
                  <p key={r} className="m-0 text-[12.5px] text-ink-2">
                    {r}
                  </p>
                ))}
                <div className="mt-1 flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={`Diminuir ${i.nome}`}
                    onClick={() => mudarQuantidade(i.linha, -1)}
                    className="flex size-touch cursor-pointer items-center justify-center rounded-11 border-[1.5px] border-border-shalon bg-surface text-[16px] font-bold text-ink"
                  >
                    −
                  </button>
                  <span className="min-w-[2ch] text-center text-[14px] font-semibold tabular-nums text-ink">
                    {i.quantidade}
                  </span>
                  <button
                    type="button"
                    aria-label={`Aumentar ${i.nome}`}
                    onClick={() => mudarQuantidade(i.linha, 1)}
                    className="flex size-touch cursor-pointer items-center justify-center rounded-11 border-[1.5px] border-border-shalon bg-surface text-[16px] font-bold text-ink"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => setItens((l) => l.filter((x) => x.linha !== i.linha))}
                    className="ml-auto min-h-touch cursor-pointer border-0 bg-transparent p-0 text-[12.5px] font-semibold text-danger"
                  >
                    Remover
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex items-baseline justify-between border-t border-border-shalon pt-3">
          <span className="text-[13.5px] text-ink-2">
            {quantidadeTotal} {quantidadeTotal === 1 ? "item" : "itens"}
          </span>
          <span className="font-display text-[24px] font-extrabold tabular-nums text-ink">
            {formatBRL(subtotal)}
          </span>
        </div>
        <p className="m-0 text-[12px] text-muted">
          Conferência. O valor cobrado é o que o servidor recalcular ao salvar.
        </p>

        <div className="mt-3 flex flex-col gap-2">
          <SelectMenu
            label="Forma de pagamento"
            valor={formaId}
            aoMudar={(valor) => {
              setFormaId(valor);
              setBandeiraId("");
              setRecebido("");
            }}
            hint="O recebimento será registrado e a venda será encerrada agora."
            opcoes={[
              { valor: "", texto: "Escolha…" },
              ...formas.map((forma) => ({ valor: forma.id, texto: forma.nome })),
            ]}
          />

          {forma?.exige_bandeira ? (
            forma.bandeiras.length === 0 ? (
              <p
                role="status"
                className="m-0 rounded-10 border border-twb bg-tw px-3 py-2 text-[12.5px] font-semibold text-twf"
              >
                {forma.nome} exige bandeira e nenhuma está cadastrada. Cadastre em
                Configurações, ou escolha outra forma.
              </p>
            ) : (
              <SelectMenu
                label="Bandeira"
                valor={bandeiraId}
                aoMudar={setBandeiraId}
                opcoes={[
                  { valor: "", texto: "Escolha…" },
                  ...forma.bandeiras.map((bandeira) => ({
                    valor: bandeira.id,
                    texto: bandeira.nome,
                  })),
                ]}
              />
            )
          ) : null}

          {pagamentoEmDinheiro ? (
            <div>
              <label htmlFor="valor-recebido-pdv" className="mb-1 block text-[13px] font-semibold text-ink">
                Valor recebido
              </label>
              <input
                id="valor-recebido-pdv"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={recebido}
                onChange={(e) => setRecebido(e.target.value)}
                placeholder={subtotal.toFixed(2).replace(".", ",")}
                className="min-h-touch-cta w-full rounded-11 border-[1.5px] border-border-shalon bg-surface px-3 text-[15px] text-ink focus:border-brand-orange focus:outline-none"
              />
              {recebidoNumero !== null && recebidoNumero >= subtotal ? (
                <div className="mt-2 flex items-center justify-between rounded-10 bg-tg px-3 py-2 text-[13px] text-tgf">
                  <span>Troco</span>
                  <strong className="tabular-nums">{formatBRL(trocoPrevisto)}</strong>
                </div>
              ) : recebido !== "" ? (
                <p className="m-0 mt-1 text-[12px] font-semibold text-danger">
                  O valor recebido precisa cobrir o total da venda.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {erro !== null ? (
          <p
            role="alert"
            className="m-0 mt-3 rounded-10 border border-tdb bg-td px-3 py-2 text-[13px] font-semibold text-tdf"
          >
            {erro}
          </p>
        ) : null}

        <button
          type="button"
          disabled={!podeSalvar}
          onClick={() => salvar()}
          className="motion-interactive mt-3 flex min-h-[52px] w-full cursor-pointer items-center justify-center rounded-13 border-0 bg-cta text-[16px] font-semibold text-cta-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-tn disabled:text-muted disabled:opacity-100"
        >
          {ocupado ? "Concluindo…" : `Receber e concluir · ${formatBRL(subtotal)}`}
        </button>

        <p className="m-0 mt-2 text-[12px] text-muted">
          Esta venda não exige produção e será encerrada no PDV. Ela permanece
          registrada apenas no histórico e no fechamento financeiro.
        </p>

        {!caixaAberto ? (
          <p role="status" className="m-0 mt-2 rounded-10 border border-twb bg-tw px-3 py-2 text-[12.5px] font-semibold text-twf">
            Abra o caixa para receber e concluir a venda.
          </p>
        ) : null}

        {!autorizado ? (
          <p
            role="status"
            className="m-0 mt-2 rounded-10 border border-tdb bg-td px-3 py-2 text-[12.5px] font-semibold text-tdf"
          >
            Seu acesso não inclui criar, receber e concluir vendas no PDV.
          </p>
        ) : null}
          </>
        )}
      </section>
        </ModalVendaAtual>
      ) : null}
    </div>
  );
}

function CupomVenda58({
  venda,
  aoNovaVenda,
}: {
  venda: VendaConcluida;
  aoNovaVenda: () => void;
}) {
  const [emitir, setEmitir] = useState<boolean | null>(null);
  const quantidade = venda.itens.reduce((soma, item) => soma + item.quantidade, 0);

  if (emitir === null) {
    return (
      <div>
        <p className="m-0 text-[13.5px] font-semibold text-ink">Deseja emitir o cupom 58 mm?</p>
        <p className="m-0 mt-1 text-[12px] text-muted">
          Comprovante da venda, sem valor fiscal. NFC-e/SAT exige integração fiscal própria.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setEmitir(true)}
            className="min-h-touch cursor-pointer rounded-11 border-0 bg-cta px-4 text-[13.5px] font-semibold text-cta-fg"
          >
            Sim, preparar cupom
          </button>
          <button
            type="button"
            onClick={() => setEmitir(false)}
            className="min-h-touch cursor-pointer rounded-11 border border-border-shalon bg-surface px-4 text-[13.5px] font-semibold text-ink"
          >
            Não emitir
          </button>
        </div>
      </div>
    );
  }

  if (!emitir) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-[12.5px] text-muted">Cupom não solicitado.</p>
        <button
          type="button"
          onClick={aoNovaVenda}
          className="min-h-touch cursor-pointer rounded-11 border-0 bg-cta px-4 text-[13.5px] font-semibold text-cta-fg"
        >
          Nova venda
        </button>
      </div>
    );
  }

  return (
    <div>
      <p className="m-0 mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-2">
        Prévia do cupom 58 mm
      </p>
      <div id="cupom-venda-pdv" className="mx-auto w-full max-w-[58mm] bg-white p-[3mm] font-mono text-[10px] leading-[1.35] text-black">
        <p className="m-0 text-center text-[12px] font-bold">PIZZARIA SHALON</p>
        <p className="m-0 text-center">COMPROVANTE NAO FISCAL</p>
        <p className="my-2 border-y border-dashed border-black py-1">VENDA #{venda.numero}</p>
        {venda.itens.map((item) => (
          <div key={item.linha} className="mb-1 grid grid-cols-[1fr_auto] gap-2">
            <span>{item.quantidade}x {item.nome}</span>
            <span>{formatBRL(item.total)}</span>
          </div>
        ))}
        <div className="mt-2 border-t border-dashed border-black pt-1">
          <p className="m-0 flex justify-between"><span>{quantidade} item(ns)</span><strong>{formatBRL(venda.total)}</strong></p>
          <p className="m-0 flex justify-between"><span>Pagamento</span><span>{venda.forma}</span></p>
          {venda.recebido !== null ? <p className="m-0 flex justify-between"><span>Recebido</span><span>{formatBRL(venda.recebido)}</span></p> : null}
          {venda.troco !== null ? <p className="m-0 flex justify-between"><span>Troco</span><span>{formatBRL(venda.troco)}</span></p> : null}
        </div>
        <p className="mb-0 mt-3 text-center">Obrigado pela preferencia!</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="min-h-touch cursor-pointer rounded-11 border-0 bg-cta px-4 text-[13.5px] font-semibold text-cta-fg"
        >
          Imprimir em 58 mm
        </button>
        <button
          type="button"
          onClick={aoNovaVenda}
          className="min-h-touch cursor-pointer rounded-11 border border-border-shalon bg-surface px-4 text-[13.5px] font-semibold text-ink"
        >
          Nova venda
        </button>
      </div>
      <style>{`
        @media print {
          @page { size: 58mm auto; margin: 0; }
          body * { visibility: hidden !important; }
          #cupom-venda-pdv, #cupom-venda-pdv * { visibility: visible !important; }
          #cupom-venda-pdv {
            position: absolute !important;
            inset: 0 auto auto 0 !important;
            width: 58mm !important;
            max-width: 58mm !important;
            margin: 0 !important;
          }
        }
      `}</style>
    </div>
  );
}

function ModalVendaAtual({ aoFechar, children }: { aoFechar: () => void; children: ReactNode }) {
  const painel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    painel.current?.focus();

    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === "Escape") aoFechar();
    }

    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflow;
      anterior?.focus();
    };
  }, [aoFechar]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
      onMouseDown={(evento) => {
        if (evento.target === evento.currentTarget) aoFechar();
      }}
    >
      <div
        ref={painel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-venda-atual"
        tabIndex={-1}
        className="max-h-[94dvh] w-full overflow-y-auto rounded-t-20 border border-border-shalon bg-surface p-5 shadow-2xl outline-none sm:max-w-[680px] sm:rounded-20"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="titulo-venda-atual" className="m-0 font-display text-[19px] font-bold text-ink">
            Concluir venda
          </h2>
          <button
            type="button"
            aria-label="Fechar conferência da venda"
            onClick={aoFechar}
            className="flex size-10 cursor-pointer items-center justify-center rounded-full border border-border-shalon bg-elev text-[20px] text-ink"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
