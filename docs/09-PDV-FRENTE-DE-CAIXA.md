# 09 — PDV / FRENTE DE CAIXA

## Sistema de Gestão e Pedidos — Pizzaria Shalon

**Versão:** 1.2 — reconciliado em 27/09/2026 (consolidação PDV × Caixa: o que a
aba *Caixa* realmente contém, e o fim da rota `/admin/caixa`)
**Status:** Etapas 1 a 10 implementadas e persistidas no DEV; PDV consolidado
como única interface operacional de PDV + Caixa
**Decisão de origem:** `D-2026-09-25-78`
**Função:** fonte de verdade da implementação do PDV. Arquitetura, fluxos,
telas, atalhos, regras financeiras, código de barras, concorrência,
cancelamento com estorno, permissões e auditoria.

> Este documento **não substitui** as fontes normativas. Regra de negócio mora
> em `04-REGRAS-NEGOCIO.md`; modelo de dados em `02`; RLS e autorização em
> `03`. Aqui está o **desenho do subsistema** e as decisões que o produziram.
> Onde houver conflito, as fontes normativas prevalecem e este documento é
> corrigido.

---

## 0. O princípio que organiza tudo

**O PDV não é um módulo financeiro novo. É uma tela que usa as portas que já
existem.**

`criar_pedido` continua sendo a única porta do pedido. `registrar_pagamento`
continua sendo a única porta do recebimento. `esperado_em_caixa` continua sendo
a única autoridade sobre o dinheiro na gaveta. O PDV muda **onde o operador
clica**, não **quem decide**.

Isso não é economia de esforço: é a razão pela qual o PDV custa **uma** migration
estrutural. O levantamento de 25/09/2026 mostrou que o modelo já suportava quase
tudo — pagamento dividido, troco em duas camadas, status financeiro separado do
operacional, origem `counter` e estorno auditável **já existiam no banco e não
tinham tela**.

### 0.1 O que NÃO muda

| Não muda | Por quê |
|---|---|
| `criar_pedido` | a venda de balcão **é** um pedido normal, não uma venda paralela |
| `registrar_pagamento` | divisão, troco, bandeira, idempotência e trava já estão certos |
| `reverter_pagamento` | será **chamada por dentro** do cancelamento, não reescrita |
| `abrir_caixa`, `fechar_caixa`, `movimentar_caixa`, `reabrir_caixa` | intactas |
| `esperado_em_caixa`, `dinheiro_fora_da_gaveta`, `resumo_do_fechamento` | intactas |
| `orders`, `payments`, `cash_*`, `products`, `product_variants` | **nenhuma coluna alterada** |
| Permissões | **nenhuma nova** |
| Frete | intocado |

### 0.2 Os dois eixos, e por que não se confundem

O sistema tem dois eixos independentes, e o PDV depende dessa separação:

| Eixo | Coluna | Valores |
|---|---|---|
| **Operacional** | `orders.status` | `waiting_pix_confirmation`, `waiting_delivery_approval`, `waiting_store_confirmation`, `change_requested_waiting_customer`, `confirmed`, `in_production`, `ready_for_pickup`, `ready_for_delivery`, `out_for_delivery`, `delivery_failed`, `completed`, `rejected`, `cancelled` |
| **Financeiro** | `orders.payment_status` | `pending`, `confirmed`, `reversed` |

**Pagar não avança a produção. Ficar pronto não paga.** É decisão aprovada
(`D-2026-09-25-78`, item 3) e é o que permite receber um pedido que ainda está
no forno.

### 0.3 Origem e modalidade são coisas diferentes

Registrado em 26/09/2026, na Etapa 5, porque os wireframes deste documento
escrevem "Balcão" e "Retirada" na mesma linha e isso se lê como se fossem dois
valores do mesmo campo. Não são.

| Conceito | Coluna | Valores reais |
|---|---|---|
| **Origem** — por onde o pedido entrou | `orders.source` | `shalon_link`, `whatsapp`, `phone`, `counter`, `ifood`, `other` |
| **Modalidade** — como o cliente recebe | `orders.fulfillment_type` | `delivery`, `pickup` |

Portanto:

- `source = 'counter'` significa **origem Balcão**;
- `fulfillment_type = 'pickup'` significa **Retirada**;
- `fulfillment_type = 'delivery'` significa **Entrega**.

**NÃO existe, e não deve ser criada, a modalidade `balcao`.** Um pedido de balcão
é `source = 'counter'` com `fulfillment_type = 'pickup'` — a pessoa está ali e
leva. A constraint `orders_modalidade` aceita exatamente dois valores, e
acrescentar um terceiro quebraria `orders_entrega_com_snapshot` e
`orders_retirada_sem_entrega`, que existem para garantir que só entrega carrega
endereço e distância.

A linha `#150  Balcão  Retirada` do wireframe em §4.2 é, no modelo,
`source='counter'` + `fulfillment_type='pickup'`: duas colunas, exibidas juntas.

---

## 1. Fluxos

### 1.1 Nova venda de balcão com pagamento imediato

```
Operador           PDV                          Servidor
   │                │                              │
   │ F2             │ limpa a venda, foca a leitura │
   │ bipa/digita ───▶ resolve o código ────────────▶ resolver_codigo_de_barras
   │                │                        ◀───── produto ou variante + preço
   │                │ item simples      → carrinho
   │                │ tem variante ativa → configurador
   │ repete         │ total recalculado no cliente — SÓ EXIBIÇÃO
   │ F8             │ painel de recebimento
   │ formas         │ dinheiro R$ 100 · total R$ 106 · falta R$ 6
   │                │ troco exibido ANTES de confirmar
   │ Ctrl+Enter ────▶ criar_pedido ────────────────▶ origem='counter'
   │                │                        ◀───── pedido #N + total AUTORITATIVO
   │                │ total ≠ exibido? PARA e mostra os dois
   │                ├─ registrar_pagamento ───────▶ linhas[] + idempotency_key
   │                │                        ◀───── troco calculado pelo servidor
   │                └─ emitirDocumento (comanda)
   │ ◀── "Pedido #N pago · troco R$ 6,00" ─────────┘
   │
   │  O pedido segue o fluxo operacional normal.
   │  NÃO é concluído automaticamente.
```

**Três regras deste fluxo:**

1. **O total da tela nunca cobra.** Ele existe para o operador conferir. Quem
   decide é `criar_pedido` (CLAUDE.md §16). Divergência **para** o fluxo e
   mostra os dois valores — nunca escolhe um.

2. **São três RPCs, não uma.** Foi considerada uma função
   `venda_de_balcao` que envolvesse criar + receber numa transação, e **foi
   descartada**: "pedido criado e ainda não pago" é estado legítimo — é o
   fluxo 1.2. Se o recebimento falhar, o pedido aparece em *Pedidos a receber*
   e nada se perde. Uma mega-RPC traria uma segunda função autoritativa sobre
   dinheiro, sem ganho.

3. **O pagamento NÃO conclui o pedido.** Decisão aprovada. Pizza paga no balcão
   continua indo para produção. Chamar `comando_pedido('concluir')` após o
   pagamento seria fazer o eixo financeiro empurrar o operacional — exatamente
   o que a separação dos dois eixos evita.

> **Fora de escopo, registrado:** venda rápida de item que não exige produção
> (uma lata de refrigerante levada na hora) poderia concluir na mesma ação.
> **Não será implementado agora.** Precisa antes de um critério explícito de
> "item sem produção", que o catálogo hoje não tem.

### 1.2 Nova venda sem pagamento imediato

Igual até o carrinho. Em vez de F8, **F7 — "Salvar sem receber"** → apenas
`criar_pedido`.

O pedido nasce com `payment_status = 'pending'` e aparece imediatamente na aba
*Pedidos a receber*. Nada mais é necessário.

Uso real: o cliente pediu no balcão, vai esperar sentado e paga na retirada.

### 1.3 Receber um pedido já existente

```
F4 → aba "Pedidos a receber"
       pedidos_a_receber():
         payment_status in ('pending','reversed')
         and status not in ('cancelled','rejected')
       ordenado por created_at, com idade em minutos
       mostra: #nº · cliente · modalidade · total · status operacional
               forma ESPERADA e troco esperado (order_payment_intents)
   ↑↓ navega · Enter seleciona
       → painel de recebimento pré-preenchido com a forma esperada
   Ctrl+Enter → registrar_pagamento
```

**O status operacional não filtra a lista.** Um pedido `in_production` aparece
e pode ser pago. O banco já permite: `registrar_pagamento` só recusa
`cancelled` e `rejected`.

**Por que `reversed` também entra.** Decisão de 26/09/2026, tomada na Etapa 5
depois de a especificação original dizer apenas `payment_status = 'pending'`.

`reverter_pagamento` **não exige** que o pedido esteja cancelado: ela pede
`finance.reverse`, estorna os pagamentos confirmados e faz
`orders.payment_status = 'reversed'` sem tocar em `orders.status`. Existe,
portanto, um estado alcançável de **dinheiro devolvido com pedido vivo** — e
nele o cliente continua devendo, porque não há pagamento confirmado.

Comprovado em transação com `rollback`: pedido pago, avançado para
`in_production`, estornado sem cancelamento, e então `registrar_pagamento`
devolveu `ok: true`. Ou seja, **o banco aceita receber esse pedido**.

Se a fila usasse o critério literal `= 'pending'`, ela mostraria um conjunto
MENOR do que `registrar_pagamento` aceita, e passaria a ser uma segunda
autoridade sobre dinheiro — mais restritiva, e por omissão. Um pedido com a
pizza no forno e o cliente devendo simplesmente não apareceria para cobrança, e
a casa descobriria no fechamento.

O risco das duas opções é assimétrico: incluindo `reversed`, o pedido aparece e
o operador decide; excluindo, ele desaparece em silêncio.

**`reversed` NÃO é apresentado como `pending`.** A interface mostra o
`payment_status` real — "Pendente" e "Estornado" são rótulos diferentes — para
o operador saber que aquele pedido já teve dinheiro devolvido por decisão da
casa, e não é um pedido que nunca foi pago.

A forma esperada vem de `order_payment_intents`, que já guarda `needs_change`
e `change_for_amount`. Se o cliente avisou "levo R$ 100", o painel abre com
isso preenchido e o operador só confirma.

### 1.4 Pedido já pago

Selecionar um pedido com `payment_status = 'confirmed'` **não oferece
recebimento**. O painel mostra, de `pagamento_do_pedido`: o que foi pago, por
qual forma e bandeira, quando, por quem, e o troco se houve.

As ações passam a ser **estornar** e **reimprimir**.

É também o que o segundo operador vê quando perde a corrida pelo mesmo pedido
— com a mensagem do servidor: *"Este pedido já tem pagamento registrado."*

### 1.5 Cancelamento com estorno

**O problema que isto corrige.** Hoje `comando_pedido('cancelar')` só exige
motivo. Cancela um pedido pago **sem estornar**, deixando
`status = 'cancelled'` junto com `payment_status = 'confirmed'` — dinheiro na
gaveta e nenhum registro de devolução.

**Regra aprovada:** pedido com pagamento confirmado **não pode ser cancelado
simplesmente**.

```
comando_pedido('cancelar')  ← ALTERADA: ganha guarda
    se existe payment status='confirmed' →
        RECUSA { bloqueio:'pagamento_confirmado', exige_estorno:true, total_pago:X }

cancelar_pedido_com_estorno(p_order_id, p_motivo)  ← NOVA
    exige orders.cancel  E  finance.reverse
    exige motivo com ao menos 3 caracteres
    UMA transação:
      1. reverter_pagamento(order_id, motivo)
      2. se ok = false  →  RAISE  (desfaz tudo)
      3. aplica o cancelamento
      4. log_audit('pedido_cancelar_com_estorno', reason = o mesmo motivo)
```

**Por que uma transação, e não duas chamadas da tela.** Duas chamadas podem
parar no meio e deixar "estornado mas não cancelado" — pior que o estado atual,
porque o pedido continua na fila com o dinheiro já devolvido.

**Por que `RAISE` e não `return`.** `reverter_pagamento` devolve `ok:false` em
vez de lançar exceção, e algumas de suas saídas de falha acontecem **dentro do
laço**, depois de já ter gravado o estorno de um pagamento anterior. Só o
`raise` garante o desfazimento.

**Efeito herdado, e é desejável:** `reverter_pagamento` recusa quando o
recebimento foi em dinheiro, a sessão original está fechada e **não há caixa
aberto agora**. Então cancelar uma venda em dinheiro com a gaveta fechada é
recusado: *"Abra o caixa para estornar."* Tirar dinheiro exige gaveta aberta.

**Na interface:** o botão Cancelar de um pedido pago abre um diálogo que diz o
valor a estornar, exige o motivo, e **avisa antes de tentar** se o caixa está
fechado.

### 1.6 Dinheiro e troco

Duas camadas que **já existem**; o PDV apenas as expõe.

| Camada | Onde | Quando é preenchida |
|---|---|---|
| **Esperado** | `order_payment_intents.needs_change`, `change_for_amount`, `expected_change_amount` | o cliente avisou no checkout |
| **Realizado** | `payments.tendered_amount`, `change_amount` | o operador digitou o recebido |

Na tela: campo **"Recebido"** ao lado da linha em dinheiro. O troco aparece em
**destaque grande** conforme se digita — cálculo local, só para o operador ver.
O valor gravado é o do servidor, garantido por CHECK:
`change_amount = tendered_amount − amount`, com `tendered ≥ amount`.

Troco existe **só** para a família `cash`; o servidor recusa nas outras
(RN-PGTO-005).

Atalho **`*`** no campo de recebido preenche o valor exato da linha — o caso
"pagou justo".

### 1.7 Pagamento dividido

**Já existe e não muda.** Até **6 linhas**; a soma tem de fechar o total
**exatamente, sem tolerância**; a mesma forma + bandeira não se repete
(*"Some em uma linha só"*).

Na tela: lista de linhas com "+ Adicionar forma". A cada alteração o painel
mostra **"Falta R$ X,XX"** e só libera o Confirmar quando chega a zero.

Atalho **`/`** adiciona uma linha já preenchida com o restante — o gesto mais
comum no balcão ("R$ 30 no cartão e o resto em dinheiro").

**Pagamento parcial não será implementado** (decisão aprovada, item 1). A soma
quita o pedido integralmente naquele recebimento. `registrar_pagamento` já
recusa um segundo recebimento: *"Para corrigir, estorne o anterior."*

### 1.8 PDV com o caixa fechado

O PDV **abre normalmente** com o caixa fechado. Decisão aprovada, item 4.

| Estado | Comportamento |
|---|---|
| Faixa superior | **"CAIXA FECHADO"** em destaque, no lugar do esperado |
| Busca e catálogo | **funcionam** |
| Montar carrinho | **funciona** |
| Salvar sem receber (F7) | **funciona** — só `criar_pedido` |
| Pedidos a receber | **lista normalmente** |
| Receber (F8) | o painel abre, e o **servidor recusa**: `sem_caixa: true` |
| Abrir caixa | botão claro na faixa superior, visível para quem tem `cash.open` |

**A recusa é do servidor, não da tela.** `registrar_pagamento` já devolve
`sem_caixa: true` quando não há sessão aberta — e continua honrando a exceção
de `cash.bypass_session`, que é registrada em auditoria própria
(RN-CAIXA-003). A interface **não reimplementa essa decisão**; ela exibe o que
o servidor respondeu. Se a tela escondesse o botão, ela estaria decidindo
autorização — e a autorização é do banco.

---

## 2. Busca e leitor de código de barras

### 2.1 Um campo, dois comportamentos

O campo de busca é **o foco padrão da tela**.

```
entrada ──▶ parece código?  (≥ 6 caracteres, sem espaço, alfanumérico)
              │
              ├─ SIM → resolver_codigo_de_barras(termo)
              │          ├─ achou, item simples      → ADICIONA ao carrinho
              │          ├─ achou, tem variante ativa → abre o configurador
              │          └─ não achou                → cai na busca por nome
              │
              └─ NÃO → buscar_catalogo_pdv(termo) → lista navegável por ↑↓
```

**Por que um campo só.** O leitor de código de barras **é um teclado**. Com
dois campos, o operador vai bipar no errado. Com um campo que decide sozinho, o
leitor funciona sem configuração e a digitação humana também.

### 2.2 Comportamento esperado do leitor

| Característica do leitor | Tratamento |
|---|---|
| Emula teclado, digita muito rápido | não medimos tempo — o Enter final basta |
| Termina com Enter (padrão) | Enter no campo submete |
| Alguns terminam com **Tab** | Tab no campo de leitura é tratado como Enter |
| Pode ter prefixo/sufixo configurável | normalizamos: `trim`, remove caracteres de controle |
| Zeros à esquerda | a normalização **preserva** — em EAN-13 são significativos |
| Bipe enquanto outro campo tem foco | o campo de leitura reconquista o foco ao ficar ocioso; painéis não roubam foco sem necessidade |

**Deliberadamente NÃO faremos** captura global de teclado com heurística de
tempo entre teclas. É frágil, quebra ao digitar uma observação, e o campo
sempre-focado resolve o mesmo problema sem adivinhação.

### 2.3 Modelagem do código de barras

Suporte a **produto e variante** — produto simples como bebida, e variantes com
código próprio. Decisão aprovada, item 6.

```sql
create table public.product_barcodes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  code_normalized text generated always as
    (public.normalizar_codigo_de_barras(code)) stored,
  product_id uuid references public.products(id) on delete cascade,
  variant_id uuid references public.product_variants(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references public.app_users(id),

  -- Exatamente UM alvo: produto ou variante. Nunca os dois, nunca nenhum.
  constraint product_barcodes_alvo_unico
    check ((product_id is null) <> (variant_id is null)),
  constraint product_barcodes_codigo_valido
    check (length(public.normalizar_codigo_de_barras(code)) between 4 and 48)
);

-- A UNICIDADE QUE IMPORTA: global, sobre o código normalizado.
create unique index product_barcodes_codigo
  on public.product_barcodes (code_normalized);

-- No máximo um código primário por alvo.
create unique index product_barcodes_primario_produto
  on public.product_barcodes (product_id) where is_primary and product_id is not null;
create unique index product_barcodes_primario_variante
  on public.product_barcodes (variant_id) where is_primary and variant_id is not null;
```

**Por que tabela própria, e não `products.barcode` + `product_variants.barcode`.**
Com duas colunas e dois índices únicos separados, **nada impede o mesmo código
existir num produto e numa variante**. Um bipe passaria a resolver duas coisas
e o PDV escolheria arbitrariamente — em cima de dinheiro. Com uma tabela e
**um** índice único sobre o código normalizado, a ambiguidade é impossível por
construção, não por disciplina.

Três benefícios que vêm de graça:

- **vários códigos por item** — o fornecedor troca a embalagem e o código antigo
  ainda está no estoque da casa; EAN do fabricante mais código interno da Shalon;
- `is_primary` diz qual mostrar no cadastro;
- remover o código o **libera para reuso**, sem soft-delete furando a unicidade.

**A normalização segue o precedente da Fase A do cache** (`D-2026-09-25-76`):
função `IMMUTABLE`, coluna gerada, **uma definição só, no SQL**. Nunca em
TypeScript — duas definições divergem, e divergência aqui casa o bipe com o
produto errado.

```
normalizar_codigo_de_barras(t):
  trim → remove controle e espaços → upper → mantém [A-Z0-9-] → preserva zeros
```

**Resolução quando o produto tem variantes.** Um código no **produto** resolve
direto **só se o produto não tiver variante ativa**. Tendo variante, o resolver
devolve `precisa_escolher_variante: true` e o PDV abre o configurador. Bebida
bipa e entra; pizza por tamanho tem código **por variante**, ou nenhum.

**EAN: avisar, nunca bloquear.** Decisão aprovada, item 1. Códigos de 8 ou 13
dígitos têm o dígito verificador conferido e, se não fechar, a tela **avisa** e
permite salvar. Código interno impresso pela casa não segue EAN, e bloquear
impediria um uso legítimo.

**`product_variants.sku` fica intocado.** Decisão aprovada, item 2. É `text`,
sem índice, e **nunca foi usado em nenhum lugar do código**. É cadastro de
fornecedor, não identificador de venda. Misturar os dois conceitos num campo é
como o projeto perderia a unicidade do código de barras.

---

## 3. Atalhos de teclado

Escolhidos evitando o que o navegador sequestra. **Corrigido em 27/09/2026,
por medição:** a lista original dizia que só F1, F5, F11, F12 e Ctrl+N/T/W
estavam fora, e isso estava incompleto.

Fora da tabela: **F1** (ajuda), **F5** (recarregar), **F6** (barra de endereço),
**F10** (menu), **F11** (tela cheia), **F12** (devtools) e todo **Ctrl+…** que
não seja `Ctrl+Enter`. F11 e F12 não são sequer interceptáveis; as outras são,
mas tirá-las do operador seria pior — recarregar é justamente o que ele vai
querer quando algo travar no balcão.

**F3 e F7 SÃO reclamadas pelo navegador** — F3 abre o "localizar" e F7 alterna
navegação por cursor no Firefox — e continuam na tabela porque são
neutralizáveis. Medido no navegador em 27/09/2026: as seis teclas usadas (F2,
F3, F4, F7, F8, F9) chegam com `cancelable: true` e o `preventDefault` pega. O
PDV só chama `preventDefault` quando a tecla vira ação dele; o que não vira ação
segue intacto para o navegador.

| Tecla | Ação | Contexto |
|---|---|---|
| **F2** | Nova venda — limpa e foca a leitura | global |
| **F3** | Foco na busca/leitura | global |
| **F4** | Aba *Pedidos a receber* | global |
| **F7** | Salvar venda sem receber | venda com itens |
| **F8** | Abrir recebimento | venda com itens, ou pedido selecionado |
| **F9** | Aba *Caixa* — operações da sessão | global |
| **Enter** | resolver código / adicionar item selecionado | busca |
| **Tab** | equivalente a Enter, **só com conteúdo** | campo de leitura |
| **↑ ↓** | navegar resultados ou pendentes | listas |
| **+ / −** | quantidade da linha atual | carrinho |
| **Delete** | remover linha | carrinho |
| **/** | nova forma de pagamento com o restante | recebimento |
| **\*** | preencher "recebido" com o valor exato | linha em dinheiro |
| **Ctrl+Enter** | **Confirmar recebimento** | recebimento |
| **Esc** | fechar painel / cancelar ação | qualquer |

**Duas regras de segurança.** `Ctrl+Enter` é deliberadamente de **dois dedos**:
confirmar dinheiro não pode ser um Enter distraído. E nenhum atalho dispara
ação irreversível sem o painel aberto e o valor visível na tela.

**Tab só equivale a Enter com conteúdo no campo.** Vazio, ele navega como
sempre — senão o campo de leitura prenderia o foco e tiraria do teclado a única
saída dele (CLAUDE.md §38). Leitor de código sempre manda o conteúdo antes do
Tab, então o caso que importa está coberto. Com o configurador aberto nem Enter
nem Tab resolvem: o campo ainda tem o código que abriu a escolha de tamanho, e
resolver de novo reabriria a mesma escolha em cima dela.

**A guarda de campo, e a exceção que ela precisa ter.** `+`, `−`, `/`, `*` e
`Delete` são CARACTERES: com um campo em foco eles pertencem a quem digita, e é
isso que impede "1/2 calabresa" numa observação de adicionar uma forma de
pagamento. A exceção é o **campo de leitura vazio** — não há texto para roubar,
e sem ela esses atalhos nunca agiriam, já que aquele campo é o foco padrão da
tela. Preço aceito conscientemente: um código que comece por `-` perde o
primeiro caractere ao ser bipado num campo vazio; não resolve, o operador vê e
bipa de novo.

**Menu, modal ou drawer aberto: o PDV cede a vez inteira**, `Escape` incluído.
Eles têm o próprio `Escape`, e dois na mesma tecla fechariam duas coisas de uma
vez.

**Sangria, reforço e fechamento ficam dentro de F9** nesta versão, sem atalho
próprio. Atalhos contextuais para elas poderão ser adicionados depois, com uso
real observado.

**Acessibilidade** (CLAUDE.md §38): todo atalho tem equivalente clicável, o foco
é sempre visível, e a faixa inferior lista as teclas ativas **no contexto** —
quem está aprendendo não precisa decorar.

---

## 4. Organização da tela

Três áreas em abas no painel direito, com a venda sempre presente no centro. O
estado do caixa fica **permanentemente visível** no topo, porque quase toda
operação depende dele.

### 4.1 Wireframe — desktop (balcão)

> **Reconciliado em 27/09/2026, na Etapa 9.** O esboço abaixo foi desenhado
> antes da implementação e duas coisas dele mudaram por decisão:
>
> 1. **São DUAS abas, não três.** O recebimento não virou aba: ele aparece
>    embutido, ao lado do que o gerou — embaixo da venda recém-criada e dentro
>    do pedido selecionado na fila. Uma aba esconderia justamente o contexto que
>    o operador precisa olhar enquanto cobra. O **F8** abre o painel embutido.
> 2. **Os chips de categoria** (`Tudo · Pizzas · Bebidas · Combos`) **não foram
>    implementados** e ficam registrados como melhoria posterior. Não pertencem
>    a nenhuma etapa do plano; a busca por nome e o código de barras cobrem o
>    caso de uso do balcão.
>
> O resto do esboço vale como está.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ PDV · Pizzaria Shalon    CAIXA ABERTO · 25/09 · esperado R$ 412,50   [Operações] │
├───────────────────────────────┬──────────────────────────────────────────────────┤
│ ┌───────────────────────────┐ │  VENDA ATUAL                          [F2 nova] │
│ │ 🔍 Buscar ou bipar    F3  │ │ ┌──────────────────────────────────────────────┐ │
│ └───────────────────────────┘ │ │ 1× Pizza Calabresa G          R$ 46,00   [×] │ │
│                               │ │    borda catupiry             R$  8,00       │ │
│ Tudo  Pizzas  Bebidas  Combos │ │ 2× Coca-Cola 2L               R$ 24,00   [×] │ │
│                               │ │ 1× Fogazza frango             R$ 28,00   [×] │ │
│ ┌───────────────────────────┐ │ │                                              │ │
│ │ Calabresa        R$ 46,00 │ │ │                                              │ │
│ │ Calabresa esp.   R$ 52,00 │ │ │                                              │ │
│ │ Coca-Cola 2L     R$ 12,00 │ │ ├──────────────────────────────────────────────┤ │
│ │ Coca-Cola lata   R$  6,00 │ │ │ 4 itens                      TOTAL R$ 106,00 │ │
│ │ Fogazza frango   R$ 28,00 │ │ └──────────────────────────────────────────────┘ │
│ │ ...                       │ │                                                  │
│ └───────────────────────────┘ │  [F7 Salvar sem receber]   [F8 RECEBER  ▶]      │
│                               ├──────────────────────────────────────────────────┤
│                               │  PEDIDOS A RECEBER (3) │ CAIXA                   │
│                               │ ┌──────────────────────────────────────────────┐ │
│                               │ │ Total do pedido              R$ 106,00       │ │
│                               │ │ ────────────────────────────────────────────  │ │
│                               │ │ Dinheiro            R$  60,00   recebido:    │ │
│                               │ │                                 [R$ 100,00]  │ │
│                               │ │                      TROCO      R$  40,00    │ │
│                               │ │ Cartão de débito    R$  46,00   Visa      ▾  │ │
│                               │ │ [+ Adicionar forma  /]                       │ │
│                               │ │ ────────────────────────────────────────────  │ │
│                               │ │ Somado R$ 106,00        FALTA  R$ 0,00  ✓    │ │
│                               │ │                                              │ │
│                               │ │        [Ctrl+Enter  CONFIRMAR RECEBIMENTO]   │ │
│                               │ └──────────────────────────────────────────────┘ │
├───────────────────────────────┴──────────────────────────────────────────────────┤
│ F2 nova · F3 busca · F4 pendentes · F7 salvar · F8 receber · F9 caixa · Esc sai  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Aba *Pedidos a receber*

```
│  RECEBIMENTO │ PEDIDOS A RECEBER (3) │ CAIXA                                     │
│ ┌──────────────────────────────────────────────────────────────────────────────┐ │
│ │ #148  Maria S.      Retirada   R$  54,00   pronto        12 min   esperado:  │ │
│ │                                                                   Dinheiro   │ │
│ │                                                                   troco p/100│ │
│ │ #149  João P.       Entrega    R$  82,00   em produção    5 min   Pix maq.   │ │
│ │ #150  Balcão        Retirada   R$  31,00   aceito         1 min   —          │ │
│ └──────────────────────────────────────────────────────────────────────────────┘ │
│   ↑↓ navegar · Enter receber                                                     │
```

`pronto`, `em produção` e `aceito` convivem na mesma lista: **o status
operacional não gateia o recebimento**.

### 4.3 Aba *Caixa*

Recebe o `PainelDoCaixa.tsx` **como está**, sem uma linha de diferença:
abertura e fundo inicial, esperado na gaveta, reforço, sangria, fechamento com
conferência linha a linha, diferença e justificativa obrigatória, recebimentos
por forma, extrato de movimentos da sessão e estorno de movimento. Mais o
**histórico de sessões anteriores**, que entrou na consolidação.

**Reconciliação de 27/09/2026 — este parágrafo prometia mais do que existia.**
A redação original listava também *reabertura, lançamentos financeiros e
categorias*, e afirmava que nada seria descartado. Nada foi descartado, mas
essas três nunca estiveram no `PainelDoCaixa`:

| Prometido em §4.3 | Onde realmente está |
|---|---|
| Reabertura de caixa | **em nenhuma tela.** `reabrir_caixa` e a action `reabrirCaixa` existem, `cash.reopen` é do Owner, e não há botão em lugar nenhum. Pendência anterior à consolidação, deliberadamente **não** resolvida por ela |
| Lançamentos financeiros | `/admin/financeiro` — *Entradas / Despesas* |
| Categorias financeiras | `/admin/financeiro` |
| Histórico de sessões | aba *Caixa* do PDV desde a consolidação (antes, só em `/admin/caixa`) |

**A consolidação PDV × Caixa (27/09/2026).** `/admin/caixa` renderizava o mesmo
`PainelDoCaixa` que a aba, com uma única coisa a mais: a tabela de sessões
anteriores. Levantamento contra o código e o DEV confirmou que não havia
funcionalidade, autoridade nem permissão exclusiva ali — mesmas RPCs, mesmas
policies, mesmo `cash.view`, e a rota não era consultada por nenhuma regra. O
histórico veio para a aba como `@/ui/caixa/SessoesAnteriores.tsx`, o painel
mudou para `@/ui/caixa/PainelDoCaixa.tsx` (casa neutra, já que a rota que o
hospedava saiu), a entrada *Caixa* saiu do menu e `/admin/caixa` virou
**redirect 307** para `/admin/pdv` — compatibilidade temporária para favoritos
e abas esquecidas, não uma segunda interface. 307 e não 308 de propósito: um
permanente fica gravado no navegador e sobreviveria à remoção da entrada.

Ganho colateral: o histórico passou a **atualizar em tempo real**. Ele pega
carona na assinatura de `cash_sessions` da Etapa 10, sem assinatura própria — um
fechamento em outro terminal aparece sozinho. A antiga `/admin/caixa` não tinha
Realtime nenhum e só se atualizava recarregando.

### 4.4 Caixa fechado

```
│ PDV · Pizzaria Shalon    ⚠ CAIXA FECHADO          [ABRIR CAIXA]   [Operações]   │
```

Busca, carrinho, F7 e a lista de pendentes funcionam. O F8 abre o painel e o
servidor recusa. O botão **ABRIR CAIXA** aparece para quem tem `cash.open`.

### 4.5 Touch e telas menores

Abaixo de 1024 px as três áreas empilham, o total vai para barra fixa inferior,
e os alvos de toque sobem para ≥ 44 px (CLAUDE.md §38). O PDV é de balcão, mas
um tablet no salão precisa funcionar.

**Implementado na Etapa 9.** A barra fixa traz o total e o *Salvar* de volta ao
alcance quando as áreas empilham e os dois saem da tela; ela só aparece com
carrinho montado, porque barra fixa vazia é altura roubada, e respeita
`safe-area-inset-bottom` para não ficar sob a barra de gestos do iOS. A **faixa
de atalhos some** onde não há teclado (`pointer: coarse` ou abaixo de `lg`):
anunciar F7 para quem não tem F7 é ocupar a tela sem informar nada. Quem decide
o corte é o CSS, nunca uma medição de largura em JavaScript.

---

## 5. Reaproveitamento

| Existente | Como entra no PDV |
|---|---|
| `criar_pedido` + `origem='counter'` | **inalterada** — a venda de balcão já é pedido normal |
| `registrar_pagamento` | **inalterada** |
| `reverter_pagamento` | **inalterada** — chamada por dentro do cancelamento |
| RPCs de caixa | **inalteradas** |
| `pagamento_do_pedido` | alimenta a visão de pedido já pago |
| `PainelDoCaixa.tsx` (501 linhas) | vira a aba *Caixa* |
| `Recebimento.tsx` | **a lógica** vira componente compartilhado; a apresentação é nova |
| `EscolherProduto.tsx` e o configurador | produto com variante, sabores, borda e adicionais |
| `criarPedidoManual` (`pedidos/acoes.ts`) | reaproveitada, com `origem='counter'` |
| `comprovante.ts` (247 linhas) | impressão do recebimento |
| `sem_acento`, `preco_efetivo_*`, `produto_disponivel` | reusados pela busca do PDV |
| Realtime de `orders` | já publicado — a lista de pendentes atualiza sozinha |

**`/admin/pedidos/novo` não será embutido visualmente no Caixa.** O que se
compartilha é a camada de aplicação e o configurador. A experiência é própria:
campo de leitura sempre focado, carrinho permanente, recebimento ao lado,
teclado em primeiro lugar.

---

## 6. RPCs e consultas

### 6.1 Novas

| RPC | Para que | Permissão |
|---|---|---|
| `pedidos_a_receber()` | `payment_status in ('pending','reversed')` fora de cancelado/rejeitado (ver §1.3); devolve nº, origem, cliente, modalidade, total, status operacional, status financeiro, idade, forma esperada e troco esperado | `payments.register` |
| `resolver_codigo_de_barras(p_codigo)` | código → produto **ou** variante, com preço efetivo, disponibilidade e `precisa_escolher_variante` | `catalog.view` |
| `buscar_catalogo_pdv(p_termo)` | como `buscar_catalogo`, mas devolve **variantes com id e preço** e casa código exato | `catalog.view` |
| `cancelar_pedido_com_estorno(p_order_id, p_motivo)` | estorno + cancelamento numa transação | `orders.cancel` **e** `finance.reverse` |
| CRUD de código de barras | criar, remover, marcar primário — com `log_audit` explícito | `catalog.manage` |

### 6.2 Alteradas

| RPC | Alteração |
|---|---|
| `comando_pedido` | o comando `cancelar` recusa pedido com pagamento confirmado e devolve `exige_estorno: true` |

### 6.3 Opcional

`estado_do_pdv()` — devolve numa chamada o estado do caixa e a contagem de
pendentes, para a tela abrir sem três idas ao servidor.

### 6.4 Por que `buscar_catalogo` não é alterada

Ela serve a **vitrine pública** e é executável por `anon`. Alterá-la para
atender o PDV arriscaria o cardápio do cliente e ampliaria a superfície
pública. Uma função separada custa pouco e isola o risco.

---

## 7. Migrations necessárias

| # | Conteúdo | Estrutural? |
|---|---|---|
| 1 | `normalizar_codigo_de_barras()` — `IMMUTABLE` | não (função) |
| 2 | `product_barcodes` + coluna gerada + 3 índices + RLS e policies | **sim** |
| 3 | RPCs de cadastro do código, com auditoria explícita | não |
| 4 | `resolver_codigo_de_barras`, `buscar_catalogo_pdv`, `pedidos_a_receber` | não |
| 5 | `comando_pedido` com a guarda de pagamento confirmado | não |
| 6 | `cancelar_pedido_com_estorno` | não |

**Uma única migration estrutural**, e ela cria tabela nova sem tocar em nada
existente. As demais são funções — `create or replace`, reversíveis.

**Nenhuma alteração em `orders`, `payments`, `cash_*`, `products` ou
`product_variants`.**

**RLS de `product_barcodes`** (03 §33, deny by default): leitura para
`authenticated` com `catalog.view`; escrita com `catalog.manage`; **nada para
`anon`** — código de barras é dado interno e não pertence à vitrine.

---

## 8. Permissões, auditoria, fechamento e relatórios

### 8.1 Permissões: nenhuma nova

Verificado no banco em 25/09/2026. Já existem e bastam:

`payments.register` · `orders.cancel` · `orders.create_manual` ·
`finance.reverse` · `catalog.view` · `catalog.manage` · `cash.open` ·
`cash.close` · `cash.adjust` · `cash.reopen` · `cash.view` ·
`cash.bypass_session`

O PDV é uma **composição de permissões que a Shalon já concede**. O nome do
cargo continua não autorizando nada (RN-RBAC-004).

### 8.2 Auditoria

`registrar_pagamento`, `reverter_pagamento` e as operações de caixa já
registram por `log_audit`. Acrescentam-se:

- **`pedido_cancelar_com_estorno`** — com o **mesmo motivo** nas duas entradas
  (estorno e cancelamento), para que fiquem amarradas na leitura;
- **CRUD de código de barras** — chamada explícita a `log_audit` na RPC, que é
  o padrão do projeto para catálogo, não trigger.

### 8.3 Fechamento de caixa: impacto zero

Venda de balcão em dinheiro entra por `sale_receipt`/`in` e **aumenta o
esperado**. Cartão, Pix e voucher gravam `payments` com `cash_session_id` mas
**sem** `cash_movements`, aparecendo em `recebimentos_por_metodo` sem inflar o
dinheiro físico.

`resumo_do_fechamento` já separa os dois. **Não muda uma linha.**

O caso de dinheiro recebido fora da gaveta (`na_gaveta: false`, o motoboy)
continua somado por `dinheiro_fora_da_gaveta()` e destacado no fechamento.

### 8.4 Relatórios

`orders.source` já admite `'counter'`. "Vendas de balcão" passa a ser um corte
legítimo **sem coluna nova**. Resta verificar se as telas de relatório já
permitem filtrar por origem; se não, é filtro de interface, não de modelo.

---

## 9. Pagamento duplicado e dois operadores

O banco **já protege**, e é importante que a proteção esteja lá e não na tela.

| Mecanismo | Onde | O que impede |
|---|---|---|
| `select … for update` no pedido | `registrar_pagamento` | dois recebimentos simultâneos entram em fila |
| recusa se há `payment` confirmado | `registrar_pagamento` | o segundo da fila recebe `ja_pago: true` |
| `payments.idempotency_key` | tabela | clique duplo e retry de rede geram um pagamento só |
| `orders.idempotency_key` | tabela | clique duplo no Confirmar não cria dois pedidos |
| índice parcial único | `cash_sessions` | duas aberturas simultâneas de caixa |

O que o **PDV** precisa fazer para não desperdiçar isso:

1. **Gerar a chave de idempotência ao abrir o painel de recebimento**, não a
   cada clique. `novaTentativa()` em `caixa/acoes.ts` já faz isso — reaproveitar.
2. **Desabilitar o Confirmar durante o envio**, reabilitando só com a resposta.
3. **Nunca assumir sucesso.** Total e troco exibidos após a confirmação vêm da
   **resposta do servidor**, não do cálculo local.
4. **Tratar `ja_pago` como caminho normal**, não como erro: o painel troca para
   a visão de pedido pago e informa quem recebeu.
5. **Realtime em `orders`** remove o pedido da lista de pendentes na tela do
   colega no instante em que alguém recebe.

**Decisão deliberada: não haverá tabela de "pedido em atendimento".** Um lock
de interface parece resolver e traz lock órfão — o operador fecha o navegador e
o pedido fica travado para todos. A garantia do banco é suficiente e não falha
desse jeito. Se a operação real mostrar colisão frequente, revisita-se com dado
em mão.

---

## 10. Decisões aprovadas

Aprovadas em 25/09/2026, registradas em `D-2026-09-25-78`.

| # | Decisão |
|---|---|
| 1 | **Pagamento parcial não será implementado.** A divisão existente continua: até 6 formas, quitando integralmente o pedido naquele recebimento |
| 2 | **Pedido com pagamento confirmado não pode ser simplesmente cancelado.** Fluxo transacional de estorno + cancelamento, com motivo e permissões |
| 3 | **Código de barras para produto e para variante**, em tabela própria com unicidade global do código normalizado |
| 4 | **EAN é validado como aviso, nunca como bloqueio.** Código interno continua permitido |
| 5 | **`product_variants.sku` fica intocado** e separado do conceito de código de barras |
| 6 | **O pagamento não conclui o pedido automaticamente.** O eixo financeiro não empurra o operacional |
| 7 | **O PDV abre com o caixa fechado**, indicando o estado, permitindo o que as permissões permitirem, e oferecendo a abertura a quem puder |
| 8 | **Atalhos** conforme §3, sem teclas reservadas pelo navegador. Sangria, reforço e fechamento ficam dentro de F9 nesta versão |
| 9 | **A sessão de caixa atual não é descartada** — vira a aba *Caixa* |

---

## 11. Fora de escopo desta versão

Registrado para não voltar como surpresa:

- **pagamento parcial** — decisão 1;
- **venda rápida que conclui o pedido na hora** — exige critério de "item sem
  produção" que o catálogo não tem;
- **atalhos próprios para sangria, reforço e fechamento** — depois, com uso real;
- **lock de "pedido em atendimento"** — §9, decisão deliberada;
- **balança, gaveta automática e TEF** — nada disso está no escopo da V1
  (CLAUDE.md §46);
- **estoque de bebidas** — código de barras aqui serve à **venda**, não a
  controle de estoque, que segue proibido na V1.

---

## 12. Resumo do custo

| | |
|---|---|
| Migrations estruturais | **1** |
| Funções novas | 4 a 6 |
| Funções alteradas | **1** (`comando_pedido`) |
| Funções autoritativas sobre dinheiro alteradas | **0** |
| Colunas alteradas em tabelas existentes | **0** |
| Permissões novas | **0** |
| Impacto no fechamento de caixa | **0** |
| Impacto no frete | **0** |

---

## 13. Plano de implementação — etapas pequenas e testáveis

Cada etapa é aprovada separadamente. Nenhuma começa sem autorização explícita.
A ordem não é arbitrária: as três primeiras não têm tela, e a primeira fecha um
furo que existe **hoje**.

### Etapa 1 — Cancelamento com estorno

Primeira de propósito: **corrige um defeito presente**, é independente do PDV e
melhora o sistema atual no mesmo dia.

- `comando_pedido` ganha a guarda de pagamento confirmado;
- `cancelar_pedido_com_estorno` nova, transacional, com `RAISE` no insucesso;
- a tela do pedido passa a oferecer o fluxo correto.

**Como se testa:** suíte SQL — cancelar pedido pago é recusado com
`exige_estorno`; cancelar com estorno funciona e deixa `payment_status =
'reversed'`; recebimento em dinheiro com sessão fechada e sem caixa aberto é
recusado; falha no meio **desfaz tudo** (nenhum estorno gravado, pedido não
cancelado); pedido sem pagamento continua cancelando como antes.

**Não entra:** nada de PDV, nada de código de barras.

### Etapa 2 — Código de barras no banco

- `normalizar_codigo_de_barras()`, `IMMUTABLE`;
- `product_barcodes` com coluna gerada, os dois CHECK e os três índices;
- RLS e policies.

**Como se testa:** suíte SQL — normalização (espaço, caixa, controle, zeros à
esquerda preservados); **unicidade global** recusando o mesmo código em produto
e em variante; alvo único recusando os dois e nenhum; `anon` sem SELECT;
`catalog.view` lendo; `catalog.manage` escrevendo; um primário por alvo.

**Não entra:** nenhuma tela, nenhuma RPC de leitura.

### Etapa 3 — Cadastro do código de barras

- RPCs de criar, remover e marcar primário, com `log_audit` explícito;
- campo na tela de produto e de variante, com **aviso** de EAN inválido.

**Como se testa:** Vitest do validador de dígito verificador — EAN-8 e EAN-13
válidos e inválidos, código não-EAN aceito sem aviso; SQL das RPCs, inclusive
código duplicado recusado com mensagem útil.

### Etapa 4 — Resolução e busca do PDV

- `resolver_codigo_de_barras`;
- `buscar_catalogo_pdv`.

**Como se testa:** SQL — código de produto simples resolve direto; código de
variante resolve a variante; código de produto **com** variante ativa devolve
`precisa_escolher_variante`; código inexistente devolve vazio; busca por nome
sem acento; `buscar_catalogo` **pública permanece idêntica** (teste de
regressão explícito).

### Etapa 5 — Pedidos a receber — CONCLUÍDA em 26/09/2026

Primeira etapa com tela.

- `pedidos_a_receber()`;
- rota `/admin/pdv` com a aba de pendentes e o recebimento reaproveitado de
  `Recebimento.tsx`.

**Como se testa:** SQL do filtro — pendente aparece, pago não, cancelado não,
`in_production` **aparece**; Vitest da camada de aplicação; e a prova do caso de
uso 3: receber um pedido que está em produção.

**Entregue:**

- `pedidos_a_receber()` (migration `20260926150000`, DEV no ledger 119),
  `stable security definer set search_path = ''`, sem `EXECUTE` para `anon` nem
  `PUBLIC`, exigindo `payments.register` no corpo;
- rota `/admin/pdv` com a área **Pedidos a receber** e o item próprio no menu,
  entre *Pedidos* e *Caixa*;
- porta `listarPedidosAReceber()` em `src/application/pdv/consultas.ts`.

**Provado:** `pdv_etapa5_fase12.sql`, 69/69 — inclusive o percurso completo do
pedido estornado e vivo (pago → `in_production` → estornado sem cancelamento →
volta à fila como `reversed` → `registrar_pagamento` aceita de novo), os dois
eixos independentes, as permissões, e o bloco F fechando o caixa no meio da
suíte para mostrar que a consulta não depende de gaveta aberta nem escreve nada.
Regressão das Etapas 3 (153/153) e 4 (118/118) contra o estado persistido.

**Recorte desta etapa:** a tela LISTA e mostra o pedido selecionado. Não recebe
pagamento — isso é a Etapa 7, e a autoridade continua sendo
`registrar_pagamento`. O `Recebimento.tsx` citado acima entra lá.

### Etapa 6 — Nova venda — CONCLUÍDA em 26/09/2026

- área central: carrinho, quantidade, remoção, total de exibição;
- configurador reaproveitado para variante, sabores, borda e adicionais;
- `criar_pedido` com `origem='counter'`; F2, F3 e F7.

**Como se testa:** Vitest do carrinho e do total; e o teste que importa —
**divergência entre o total da tela e o do servidor para o fluxo** em vez de
cobrar o da tela.

**Entregue:**

- área **Nova venda** em `/admin/pdv`: campo único de busca/leitura, resultados
  do catálogo, carrinho com quantidade e remoção, total em destaque, forma de
  pagamento esperada e *Salvar venda sem receber*;
- o mesmo campo resolve código de barras e, não encontrando, cai para a busca
  do catálogo (§2.1). Código de VARIANTE abre o configurador **naquele
  tamanho**; produto com tamanhos ativos abre a escolha **sem escolher por
  ela**; item inativo ou indisponível é informado e **não** entra no carrinho;
- migration `20260926170000` (ledger 120) — venda de balcão sem cliente
  identificado, `D-2026-09-26-81`.

**O que NÃO foi criado, e é o essencial:** nenhuma segunda autoridade. O
configurador é o `NucleoConfigurador` do cardápio público, cada item é
precificado por `montar_item`, e salvar chama `criarPedidoManual` → a mesma
`criar_pedido` de `/admin/pedidos/novo` e do checkout. O total da tela é
rotulado "Conferência" e nunca cobra.

**Divergência encontrada e resolvida.** `criar_pedido` exigia nome + WhatsApp
sem alternativa, e o WhatsApp é índice único — a identidade do cliente.
Inventar telefone colapsaria todas as vendas de balcão num cliente só. A saída
foi ajustar a autoridade existente, sob quatro condições cumulativas
(`D-2026-09-26-81`). Segunda descoberta: a forma de pagamento **é obrigatória
na criação** mesmo no F7; o PDV pergunta a forma ESPERADA (§24), que é o que a
fila da Etapa 5 já exibe.

**Provado:** `pdv_etapa6_fase12.sql`, 49/49 contra o DEV persistido — bloco A
(a venda anônima nasce certa e `customers` não cresce), bloco B (cada uma das
quatro condições testada pela negação), bloco C (o caminho com cliente
intacto), bloco D (preço e disponibilidade do servidor, idempotência), bloco E
(caixa fechado não impede). Regressão das Etapas 3 (153/153), 4 (118/118) e 5
(69/69). Vitest 350/350.

**Validação manual no DEV (26/09/2026).** Busca textual, código inexistente com
fallback, e o código operacional `1254` resolvendo para "Refrigerante Coca cola
2 litros" a R$ 16,00. Venda de teste salva: **pedido #33730** — `source` =
`counter`, `fulfillment_type` = `pickup`, `customer_id` NULO, snapshot
"Balcão", `payment_status` = `pending`, **zero** registros em `payments`,
status operacional `confirmed` pelo próprio lançamento interno (RN-MAN-004, não
por avanço do PDV), e presença imediata em *Pedidos a receber*. O carrinho só
foi limpo após a confirmação do servidor, que devolveu o número e o total.

> **Pendência operacional registrada:** o DEV não tem **nenhuma bandeira de
> cartão cadastrada**, e `criar_pedido` recusa débito, crédito e voucher sem
> bandeira. Hoje só Dinheiro e Pix na maquininha funcionam de ponta a ponta,
> em qualquer canal. É dado de configuração, não código.

**Fora desta etapa:** receber (Etapa 7), aba Caixa (8), atalhos completos (9).

### Etapa 7 — Recebimento no PDV — CONCLUÍDA em 26/09/2026

> **Correção do registro, 27/09/2026.** A lista abaixo é a de PLANEJAMENTO, e
> ficou intacta quando a etapa foi marcada como concluída — passando a afirmar
> mais do que a etapa entregou. O que a Etapa 7 realmente fez foi integrar
> `registrar_pagamento` ao PDV: divisão, troco e idempotência, tudo funcionando.
>
> **Não foram feitos ali:** os atalhos `/` e `*`, o `Ctrl+Enter` e o rótulo
> "FALTA R$" — o rodapé mostrava "R$ X de R$ Y". Verificado lendo
> `Recebimento.tsx` inteiro: não havia `onKeyDown` nem `ctrlKey` no arquivo.
>
> Os quatro foram implementados na **Etapa 9**, onde pertencem por natureza:
> §3 os classifica como atalhos de recebimento. A etapa 7 permanece concluída;
> o que muda é o que ela declara ter feito.

- painel com divisão, troco, "falta R$", atalhos `/` e `*`;
- `Ctrl+Enter`; idempotência gerada **na abertura do painel**.

**Como se testa:** Vitest — soma exata libera o confirmar e soma diferente não;
troco só em dinheiro; seis formas no máximo; forma repetida recusada;
`ja_pago` tratado como caminho normal e não como erro.

**SEM MIGRATION, e isso é o resultado.** `registrar_pagamento` já fazia tudo o
que esta etapa pede: recusa `cancelled`/`rejected`, devolve `ja_pago`, exige a
soma exata, calcula o troco, separa gaveta de não-gaveta, exige bandeira quando
a forma pede, devolve `sem_caixa`, confere a chave de idempotência **antes** de
qualquer escrita e trava o pedido com `for update`. A Etapa 7 integrou a
autoridade existente; não criou uma segunda.

**Reutilizado:** o componente `Recebimento` inteiro — o mesmo da tela de pedido
—, as portas `registrarPagamento`/`estornarPagamento`, `pagamento_do_pedido`, e
a projeção de formas e bandeiras. Três acréscimos pequenos: prop `aoConcluir`
(sem ela a fila do PDV ficaria velha depois de pagar), `revalidatePath` do PDV
na própria autoridade, e `formaInicialId`, que faz o painel abrir na forma
ESPERADA conforme §1.3 — antes ele abria sempre na primeira da lista.

**Dois caminhos, sempre em duas chamadas.** Pedido existente: fila → selecionar
→ `Recebimento`. Nova venda: carrinho → `criar_pedido` → *Receber agora* ou
*Deixar para receber depois*. Se o pagamento falhar, o pedido **permanece**,
pendente e legítimo, na fila — nada é apagado nem revertido.

**Provado:** `pdv_etapa7_fase12.sql`, 84/84 — dinheiro com troco, Pix, divisão,
soma que não fecha, duplo clique, dois terminais, pedido cancelado com a tela
aberta, estornado que volta a ser recebível, caixa fechado, e o bloco G
mostrando que a função não escreve em `orders.status`. Regressão das Etapas 3
(153/153), 4 (118/118), 5 (69/69) e 6 (49/49). Vitest 364/364.

#### Validações operacionais no DEV (26/09/2026)

**1 — Recebimento de pedido existente, em dinheiro com troco.** Pedido
**#33730** (R$ 16,00, intenção Dinheiro), recebido pelo `/admin/pdv` com
R$ 20,00 entregues:

| | antes | depois |
|---|---|---|
| `payment_status` | `pending` | **`confirmed`** |
| status operacional | `confirmed` | **`confirmed` — inalterado** |
| pagamentos do pedido | 0 | **1** (devido 16,00 · entregue 20,00 · **troco 4,00**) |
| movimento de gaveta | 0 | **1** — `sale_receipt in 16,00`, o DEVIDO, não o entregue |
| esperado em caixa | R$ 30,00 | **R$ 46,00** (+16,00 exatos) |
| clientes | 1 | **1 — nenhum artificial** |

**2 — Nova venda com recebimento em Pix.** Venda montada pelo código `1254`,
intenção **Pix na maquininha**, salva como **#33766** e recebida em seguida:

- o pedido existiu **primeiro**: `pending`, zero pagamentos, intenção Pix;
- o painel abriu **já em Pix** (§1.3) e os campos de dinheiro e gaveta
  desapareceram, porque a família não é `cash`;
- depois: `confirmed`, **um** pagamento Pix;
- **nenhum** movimento físico, e o esperado em caixa permaneceu em **R$ 46,00**;
- status operacional não avançou; o pedido saiu da fila; o carrinho já estava
  limpo desde a criação e assim permaneceu;
- nenhum cliente criado, nenhuma bandeira cadastrada.

> **Pendência registrada, não corrigida nesta etapa:** `payments_select` exige
> `finance.view` e `pagamento_do_pedido` é `SECURITY INVOKER`. Um operador pode
> ter **`payments.register` sem `finance.view`** — ou seja, pode registrar
> pagamento sem enxergar o histórico financeiro realizado pela leitura atual, e
> para ele o bloco "Recebido de fato" apareceria vazio. Nada foi afrouxado: o
> servidor continua recusando o que tem de recusar e a fila do PDV é `DEFINER`
> com checagem própria. **Não ampliar permissão financeira silenciosamente** —
> a correção, se houver, é decisão de produto.

> **Isolamento das suítes corrigido.** Com pagamentos reais no DEV, o
> `delete from cash_sessions` dos fixtures das Etapas 5, 6 e 7 passou a violar
> `payments_cash_session_id_fkey`. As três suítes deixaram de apagar caixa:
> reutilizam a sessão que encontrarem e medem DELTA. Apagar ali não seria só
> impossível — seria destruir evidência financeira para um teste passar.

**Fora desta etapa:** comprovante e reimpressão (Etapa 8), operações completas
de caixa (8), atalhos globais (9).

### Etapa 8 — Aba Caixa e caixa fechado — CONCLUÍDA em 27/09/2026

- `PainelDoCaixa.tsx` vira a aba *Caixa* — **o mesmo componente** de
  `/admin/caixa`, sem uma linha de diferença. Não existe um segundo sistema de
  caixa: existe a mesma tela em dois lugares, e `/admin/caixa` continua sendo a
  visão administrativa, com as sessões anteriores;
  > **Corrigido em 27/09/2026.** Esta linha dizia "com as sessões anteriores **e
  > os lançamentos**". Lançamentos e categorias sempre estiveram em
  > `/admin/financeiro`, nunca em `/admin/caixa` — a única exclusividade da rota
  > era o histórico de sessões. A convivência das duas telas terminou na
  > consolidação PDV × Caixa; ver §4.3;
- faixa superior com o estado e o botão de abertura;
- as duas abas do PDV ficam **montadas** (`hidden`, não desmontadas), para que
  um recebimento pela metade ou uma contagem de fechamento já digitada não se
  perca ao trocar de aba;
- as nove ações de caixa passaram a invalidar também `/admin/pdv`: sem isso, o
  operador faria uma sangria e o topo do PDV continuaria mostrando o valor
  velho.

**Como se testa:** com caixa fechado — busca, carrinho e F7 funcionam; F8 abre
o painel e **o servidor** recusa com `sem_caixa`; o botão de abrir aparece só
com `cash.open`. Regressão de todas as operações de caixa da Fase 7.

**RBAC.** O Atendente abria e fechava o caixa mas não fazia suprimento nem
sangria: `cash.adjust` estava fora do papel. Como ele é o operador normal do
PDV, a permissão foi concedida a ele (`D-2026-09-26-82`, migration
`20260926180000`). `cash.reopen` continua **fora** — reabrir o próprio
fechamento é correção de histórico, não plantão. Nenhuma outra permissão mudou,
e a assimetria `payments.register` × `finance.view` **permanece registrada como
pendência, sem correção nesta etapa**.

**Impressão.** O PDV reutiliza o `Comanda` já existente, exibido depois que a
venda é criada, nos dois caminhos (receber agora e receber depois). O documento
é renderizado na tela; o transporte físico continua sendo a pendência da POC, e
nenhum protocolo de impressora foi introduzido. Primeira via exige
`orders.accept`, da segunda em diante é reimpressão com `orders.reprint` — o
Atendente tem as duas.

> **Comprovante de pagamento NÃO entra na Etapa 8.** O banco aceita exatamente
> dois tipos de documento — `comanda` e `alteracao` — e isso é uma constraint
> (`order_prints_documento`), não uma omissão de tela. Um comprovante de
> pagamento seria um TERCEIRO tipo, portanto migration, portanto nova decisão.
> Nada foi criado, e o cenário G5 da suíte trava os dois tipos para que um
> terceiro não apareça por descuido.

**PI-F12-01 não é corrigida aqui.** Foi medida e continua latente:
`movimentar_caixa` tem a guarda de saldo, `reverter_pagamento` não tem, e o
`CHECK` do contado não-negativo existe. A Etapa 8 não a agravou — o PDV apenas
expõe as mesmas autoridades, e o caminho que produz esperado negativo continua
sendo o estorno de recebimento em dinheiro.

**Validação operacional real no DEV, 27/09/2026.** Tudo pela interface do
`/admin/pdv`, na sessão real `2740657f` que estava aberta desde 21/09 com
esperado R$ 46,00:

| Passo | Resultado medido |
|---|---|
| Suprimento R$ 10,00 | movimento `supply`/`in`, esperado 46,00 → **56,00**, auditoria `caixa_supply` com o motivo |
| Sangria R$ 5,00 | movimento `withdrawal`/`out`, esperado 56,00 → **51,00**, auditoria `caixa_withdrawal`; o motivo é **obrigatório** na sangria e opcional no reforço |
| Sangria R$ 500,00 | **recusada pelo servidor** — "O valor é maior que o dinheiro esperado em caixa."; zero movimento gravado, esperado e auditoria intactos |
| Fechamento | esperado autoritativo R$ 51,00 lido antes; contado R$ 51,00; **diferença 0,00**; justificativa não exigida; sessão `closed` |
| Caixa fechado | o PDV passou imediatamente a "Caixa fechado · abra na aba Caixa para poder receber"; busca e carrinho seguem disponíveis; o painel de recebimento exibe "Não há caixa aberto. Venda normal exige caixa aberto" |
| Reabertura pelo Atendente | **recusada** — "Você não tem permissão para reabrir o caixa."; a sessão permaneceu `closed` com o contado intacto |
| Nova abertura | sessão `7d08d092`, `opening_amount` **R$ 20,00**, esperado inicial R$ 20,00, **zero movimentos** — o fundo é coluna da sessão, confirmado fora do teste |
| Comanda | pedido #33765, via 1, `requested`, transporte `tela`; o botão passou a "Reimprimir comanda (via 2)" **na hora** |

O topo do PDV acompanhou cada operação sem recarregar — é o
`revalidatePath("/admin/pdv")` das nove ações de caixa.

A comanda ficou em `requested` de propósito: nada foi impresso fisicamente, e
marcar "saiu no papel" seria afirmar o que não aconteceu.

> **O DEV não tem usuário Atendente.** Existem dois `app_users`, ambos
> Owner/Admin (um inativo). Por isso os passos de reabertura e de abertura não
> puderam ser feitos *logado como* Atendente pela interface: as operações foram
> executadas como Owner/Admin, e o que é específico do Atendente foi provado na
> autoridade, com um papel que **copia as permissões reais e persistidas** do
> papel do sistema, em transação revertida. Nenhum usuário foi criado e nenhuma
> permissão foi concedida para o teste passar. Criar um acesso de Atendente no
> DEV está registrado como **PI-F12-02** em
> `06-PENDENCIAS-VALIDACAO-PRODUCAO.md`.

Auditoria de 318 para **323**: exatamente as cinco operações (suprimento,
sangria, fechamento, abertura, impressão). Os dois pagamentos reais das etapas
anteriores atravessaram com fingerprint idêntico (`8f7bf19a…`), e os seis
pedidos continuam os mesmos.

### Etapa 9 — Atalhos, foco e leitor — CONCLUÍDA em 27/09/2026

- campo de leitura como foco padrão, Tab tratado como Enter **com conteúdo**,
  reconquista de foco ao ficar ocioso;
- faixa inferior contextual; equivalente clicável para todo atalho;
- os quatro itens que a Etapa 7 declarava e não entregou: `/`, `*`,
  `Ctrl+Enter` e "FALTA R$";
- barra fixa inferior no mobile (§4.5).

**SEM MIGRATION, SEM RPC, SEM RBAC.** A etapa inteira é frontend sobre as
autoridades que já existiam. Nenhuma permissão nova (§8.1 continua valendo) e
nenhum atalho executa o que o clique equivalente não executaria — `F7` usa a
mesma condição que desabilita o botão, e a recusa real continua sendo do
servidor (CLAUDE.md §12).

**A decisão mora num módulo puro.** `_ui/atalhos.ts` é uma função
`(tecla, contexto) → ação | null`, e os componentes são adaptadores burros: leem
o contexto, chamam a função, executam. A razão é testabilidade — a pergunta que
importa não é "a tecla funciona?", é **em que contexto ela NÃO deve agir**, e
isso só se pergunta exaustivamente a uma função pura. O Vitest do projeto roda
em `environment: node`, sem DOM: o módulo puro cabe nele sem dependência nova.

**Um listener só, no nível da tela.** F8 decide entre a venda e o pedido
selecionado, que vivem em componentes irmãos; dois listeners precisariam
combinar quem age, e é assim que duas teclas passam a disparar juntas.

**Desvio deliberado do diagrama §1.1.** No esboço, o F8 abre o painel ANTES de o
pedido existir e o `Ctrl+Enter` faz `criar_pedido` + `registrar_pagamento`. Aqui
o F8 **salva primeiro** e só então abre o painel — que assim sempre fala de um
pedido com número. A justificativa é a regra 2 do próprio §1.1: "pedido criado e
ainda não pago" é estado legítimo, e se o recebimento falhar nada se perde. O
caminho do esboço exigiria orquestrar duas chamadas sobre dinheiro dentro de um
componente, sequência que hoje não existe em lugar nenhum do projeto.

**Como se testa:** `tests/ui/atalhosDoPdv.test.ts` — cada atalho no contexto
dele, cada atalho **fora** do contexto devolvendo `null`, a guarda de campo para
todo caractere digitável, e a faixa nunca anunciando tecla que a tabela
recusaria. Mais a medição no navegador, que é a única que prova que o navegador
não sequestrou a tecla.

**Validado no DEV, sem mouse:** `F2` → bipa `1254` → **Tab** resolveu e abriu o
configurador → item no carrinho → `+` duas vezes com o campo de leitura focado e
vazio (1 → 3, R$ 48,00) → forma → `F8` salvou o **#33845** e abriu o
recebimento → `*` preencheu o recebido → `Ctrl+Enter` confirmou, esperado em
caixa R$ 20,00 → **R$ 36,00**. `F9`/`F4` trocaram de aba, `↑↓` percorreram a
fila, `F8` abriu a cobrança do pedido selecionado e dois `Esc` fecharam painel e
seleção, um nível por vez. Digitar `1/2*` no campo "recebido" **não** adicionou
forma nenhuma. Com o menu do usuário aberto, `F9` não agiu e a faixa ficou vazia.

### Etapa 10 — Concorrência, realtime e reconciliação — CONCLUÍDA em 27/09/2026

**A INVARIANTE DA ETAPA:** Realtime pode atualizar, avisar, bloquear
visualmente e recarregar estado. **Nunca autoriza nem decide uma operação
financeira.**

#### O defeito que a etapa encontrou, e que é anterior a ela

O Realtime deste projeto **nunca entregou um evento**. O socket assinava como
`anon`: o `supabase-js` só aplica o token da sessão ao ouvir `INITIAL_SESSION`,
e isso acontece **depois** que um `subscribe()` de `useEffect` já entrou no
canal. Quem entra primeiro registra a assinatura com o token daquele instante.

Medido em `realtime.subscription`:

```
entity=orders  claims_role=anon            sub=null        ← antes
entity=orders  claims_role=authenticated   sub=28e96e91-…  ← depois
```

`anon` não tem policy de leitura em `orders` — deny by default — então toda
linha era filtrada. E o canal reportava `SUBSCRIBED` o tempo todo. A Central de
Pedidos anunciava "Atualizando em tempo real" desde a Fase 5 sem nunca receber
nada: a cozinha via lista velha achando que via lista viva.

**A falha era fechada.** `anon` não enxergava nada; faltou entrega, não sobrou
acesso. Nenhum dado vazou.

**Correção em `infrastructure/supabase/client.ts`**, compartilhada: a Central e
o PDV usam a mesma. Nenhum cliente novo, nenhuma autenticação própria, nenhuma
mudança de RLS, policy, grant ou permissão.

#### O segundo defeito, introduzido e corrigido dentro da etapa

Ligar `postgres_changes` a uma tabela **fora da publicação** faz o Realtime
descartar a assinatura **inteira** do canal — silenciosamente, ainda reportando
`SUBSCRIBED`. Com as três tabelas num canal só e duas ainda não publicadas,
`realtime.subscription` ficou vazia e nem `orders` chegava. Corrigido com **um
canal por tabela**: a falha deixa de ser total.

#### O que foi feito

- publicação: `cash_sessions` e `cash_movements` acrescentadas (`payments` fora
  — todo pagamento e estorno normais já escrevem `orders`);
- `ja_pago` propagado até a tela: `resposta()` em `caixa/acoes.ts` descartava a
  bandeira, e a tarja vermelha de erro era a mesma de um erro de verdade;
- pedido resolvido em outro terminal **não some**: o contexto fica, o painel é
  substituído por "Pago em outro terminal" e nada é submetível;
- agrupamento de ~500 ms, refresh adiado enquanto há dinheiro em voo e enquanto
  a aba está escondida;
- chaves de idempotência estabilizadas nos chamadores.

**Provado no DEV com dois terminais:** assinatura `authenticated` com o `sub`
correto; B cria pedido e A atualiza sem recarregar; Central restaurada pela
mesma correção; suprimento (R$ 68 → 73), sangria (73 → 70), venda em dinheiro
(70 → 86), fechamento e abertura, tudo refletindo em A; estorno devolvendo o
pedido à fila como **"Aceito | Estornado"** — os dois eixos separados;
cancelamento tirando da fila; renovação de token sem duplicar canal nem
assinatura; sair da página removendo a assinatura (2 → 1).

**Provado sem depender do Realtime:** `pdv_etapa10_fase12.sql`, bloco C — B
recebe, A tenta sem saber, e a autoridade recusa com `ja_pago`: **um**
pagamento, **um** movimento, R$ 30,00 uma vez só.

**Como se testa:** `pdv_etapa10_fase12.sql` — 48 cenários; blocos A/B são a
matriz de publicação, C/D são a autoridade com o evento ausente.

### O que fica fora de todas as etapas

Pagamento parcial; conclusão automática após o pagamento; atalhos próprios para
sangria, reforço e fechamento; lock de "pedido em atendimento"; balança, gaveta
automática e TEF; controle de estoque.
