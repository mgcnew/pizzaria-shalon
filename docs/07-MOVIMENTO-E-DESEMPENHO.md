# Movimento e desempenho da interface

**Status:** padrão técnico obrigatório
**Escopo:** cardápio público e painel administrativo

Este documento define como adicionar transições sem tornar a interface lenta,
inconsistente ou desconfortável. Ele é a referência para qualquer alteração
futura em hover, abas, menus, drawers, modais e estados de carregamento.

## 1. Objetivo

O movimento deve explicar uma mudança de estado, orientar a atenção ou suavizar
uma abertura. Não deve decorar toda interação. A interface precisa continuar
parecendo imediata em aparelhos modestos.

## 2. Tokens oficiais

Os valores vivem em `src/ui/tokens/tokens.css`:

| Token | Valor | Uso |
|---|---:|---|
| `--shalon-motion-fast` | 120 ms | hover, foco, cores, troca de aba |
| `--shalon-motion-base` | 180 ms | dropdown, popover e modal |
| `--shalon-motion-slow` | 220 ms | drawer lateral |
| `--shalon-ease-standard` | `cubic-bezier(0.22, 1, 0.36, 1)` | entradas com desaceleração curta |

Não criar uma nova duração dentro de um componente. Se um caso realmente não
couber nesses três tempos, documentar a razão antes de acrescentar outro token.

## 3. Classes reutilizáveis

As classes ficam em `src/app/globals.css`:

- `motion-interactive`: duração e curva para mudanças de cor e borda;
- `motion-backdrop-in`: entrada do véu de modal ou drawer;
- `motion-popover-in`: dropdown e painel flutuante;
- `motion-modal-in`: conteúdo central de modal;
- `motion-tab-in`: conteúdo recém-selecionado de uma aba;
- `motion-drawer-left-in` e `motion-drawer-right-in`: painéis laterais;
- `indicador-navegacao`: marca de navegação pendente. Não usar direto: os
  componentes são `IndicadorDeNavegacao` (dentro de um `<Link>`) e
  `MarcaDeEspera` (espera que não vem de link), em
  `src/ui/components/IndicadorDeNavegacao.tsx`.

Use essas classes em vez de repetir valores arbitrários do Tailwind.

## 4. Propriedades permitidas

Priorizar:

- `opacity`;
- `transform`;
- `color`;
- `background-color`;
- `border-color`.

Evitar em animações:

- `width` e `height`;
- `top`, `right`, `bottom` e `left`;
- sombras grandes;
- `filter` e blur em áreas extensas;
- `transition-all`;
- animação de listas inteiras a cada atualização em tempo real.

`opacity` e `transform` normalmente ficam na etapa de composição do navegador e
não exigem recalcular o layout da página.

## 5. Comportamento por componente

### Botões e links

Usar 120 ms. Alterar cor, fundo e borda. Não deslocar ícone e texto de formas
diferentes. Pequena elevação é reservada a CTA promocional isolado.

### Dropdowns e filtros

Usar `motion-popover-in`. Deslocamento máximo de 4 px e fade simultâneo.

### Modais

O backdrop usa `motion-backdrop-in`. O painel usa `motion-modal-in`, com 6 px de
deslocamento e escala inicial de 0,99. Não animar largura ou altura.

O conteúdo rolável usa `scrollbar-subtle`: barra de 6 px, trilho transparente e
indicador arredondado. A barra não deve ser escondida, pois informa que existe
mais conteúdo. Em contêineres flex, usar também `min-h-0` para que o scroll fique
restrito ao corpo do modal e o cabeçalho permaneça fixo.

As larguras devem usar os presets de `ModalFerramentaCatalogo`: compacto (680 px),
regular (760 px), médio (840 px) e amplo (1040 px). Não criar uma largura avulsa
para uma tela específica sem antes verificar esses presets.

### Drawers

Entram pelo lado em que estão ancorados, em 220 ms. O conteúdo interno não deve
receber uma segunda animação independente.

### Abas

O controle muda apenas cores. O painel usa `motion-tab-in` em 120 ms. Campos de
formulário não podem perder estado ao trocar de aba.

### Navegação entre páginas

Não aplicar fade global. Rotas dinâmicas usam `loading.tsx` e skeletons leves,
pois feedback de carregamento é mais honesto que esconder latência.

**Toda rota do administrativo tem o seu `loading.tsx`**, com o skeleton no
formato real da tela, montado com as peças de
`src/app/(admin)/admin/_ui/Esqueletos.tsx`. O título é texto de verdade; o
resto são blocos do `Skeleton` do design. O arquivo faz duas coisas: mostra a
tela nova no clique e faz o Next pré-carregar a rota dinâmica até o skeleton.
Sem ele, o clique espera a página inteira sem retorno. Um `loading.tsx` só
cobre as rotas abaixo da pasta dele, e quem não tem o seu herda o da pasta de
cima. Por isso rota nova, inclusive de detalhe, nasce com o seu. O de
`admin/loading.tsx` é o do Dashboard (D-2026-09-29-87).

**Navegação que muda só a query não mostra `loading.tsx`.** É o caso de aba,
filtro, período e modal aberto por query (detalhes e comanda do pedido,
ferramentas do cardápio). O Next mantém a tela anterior até o servidor
responder. O link clicado leva `IndicadorDeNavegacao`: ponto, traço ou
moldura laranja, sempre renderizado e só com opacidade variando, que aparece
se a espera passar de 120 ms e pulsa no ritmo do skeleton.

**Painel que se fecha ao escolher um link fecha quando a URL muda**, não no
clique. Vale para a gaveta do celular, o popover de filtro e o menu de ações
(`useFecharAoNavegar`). Fechando no clique, o indicador sumia junto, e a tela
antiga ficava parada sem sinal nenhum.

O shell administrativo permanece montado entre páginas. Fluxos de novo pedido,
novo produto e edição de produto usam rotas canônicas com interceptação e slot
paralelo: em navegação SPA, somente o modal é carregado; em acesso direto, a
rota continua sendo uma página completa. Cada slot modal possui `loading.tsx`
próprio e não substitui a página que está ao fundo.

## 6. Acessibilidade

O bloco global `prefers-reduced-motion: reduce` deve continuar ativo. Nenhum
componente pode contorná-lo com estilo inline ou temporizador próprio.

Movimento nunca substitui texto, foco, `aria-expanded`, `aria-current` ou outro
indicador semântico.

## 7. Regras de desempenho

- Não instalar biblioteca de animação para os movimentos previstos aqui.
- Não adicionar JavaScript para uma transição que CSS resolve.
- Não usar `requestAnimationFrame` para efeitos visuais comuns.
- Carrosséis podem usar temporizador, devem pausar durante interação e respeitar
  movimento reduzido.
- Imagens visíveis usam `next/image`, dimensões ou `fill` e `sizes` adequado.
- Leituras independentes devem começar juntas com `Promise.all`; não criar
  cascatas apenas por conveniência de escrita.
- O layout compartilhado só espera o que decide o acesso (a sessão). Dado
  secundário, como a lista do sino de notificações, entra em `<Suspense>` com
  espaço reservado do mesmo tamanho. Assim, cabeçalho e menu não esperam por
  ele (D-2026-09-29-88).
- Tela que recarrega por evento de Realtime usa `useRecargaAgrupada`: uma
  recarga por janela de eventos, adiada durante operação financeira e com a
  aba oculta. Não chamar `router.refresh()` direto no evento (D-2026-09-29-89).
- `React.cache` pode deduplicar sessão e consultas idênticas somente dentro da
  renderização corrente. Não usar cache persistente para pedidos, caixa,
  disponibilidade ou permissões.
- Links para rotas modais apontam para a rota canônica. Não duplicar caminhos
  de desktop/mobile nem abrir modal por estado local desconectado da URL.
- Imagens-fonte grandes que não são referenciadas não afetam a rota, mas aumentam
  deploy e armazenamento; removê-las somente após confirmar que não são arquivo
  mestre necessário.

## 8. Checklist para mudanças futuras

1. O movimento explica uma mudança de estado?
2. Usa um dos três tokens oficiais?
3. Anima somente propriedades permitidas?
4. Ícone, texto e contêiner respondem como uma unidade?
5. Continua utilizável com `prefers-reduced-motion`?
6. Não desmonta formulário nem perde dados ao trocar de aba?
7. `npm run check` e `npm run build` continuam aprovados?
8. Consultas independentes estão paralelas e consultas idênticas da mesma
   renderização estão deduplicadas?
9. A rota modal funciona por acesso direto, voltar/avançar e navegação mobile?
10. Rota nova do administrativo tem `loading.tsx` próprio? Link que muda só a
    query tem `IndicadorDeNavegacao`?

Se alguma resposta for “não”, a alteração precisa ser revista antes do commit.
