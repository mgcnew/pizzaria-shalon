# 06 — PENDÊNCIAS DE VALIDAÇÃO PARA PRODUÇÃO
## Sistema de Gestão e Pedidos — Pizzaria Shalon

**Versão:** 1.6 — aberto em 19/09/2026, Fases 6 e 7 encerradas em 21/09/2026,
Fase 10 encerrada em 24/09/2026, provedor de rotas trocado para HERE em
24/09/2026 (`D-2026-09-24-75`), limites do Limited Plan medidos e registrados
em 25/09/2026, PI-F12-01 aberta em 25/09/2026
**Status:** documento vivo
**Função:** concentrar, em um lugar só, o que **não impede** o desenvolvimento
das próximas fases mas **precisa ser resolvido e testado antes da produção**.

---

## 1. Para que serve este documento

Há dois tipos de pendência neste projeto.

A primeira é a **decisão em aberto**: algo que ninguém decidiu ainda e que
bloqueia implementação. Essas vivem na tabela "Decisões em aberto" de
`00-DECISOES.md`, e a regra continua valendo — não invente, pergunte.

A segunda é a **dívida de validação**: o código está escrito, revisado e
coberto por teste automatizado, mas nunca foi exercitado contra o mundo real —
uma API de terceiro, um equipamento físico, os dados verdadeiros da Shalon.
Isso não impede seguir construindo, e impede sim liberar para produção.

Este documento é a lista oficial da segunda categoria.

**Este documento não é fonte normativa.** Ele não decide regra, preço, taxa
nem segurança: aponta o que falta VERIFICAR. As fontes de verdade continuam
sendo `01` a `05` e `CLAUDE.md`.

### Como ler cada seção

Cada pendência traz, sempre:

- **Situação atual** — o que existe de fato hoje, sem otimismo;
- **O que falta configurar** — passos concretos, não intenções;
- **Validação obrigatória futura** — o que precisa ser exercitado e observado;
- **Classificação** — se bloqueia desenvolvimento ou apenas produção.

---

## A-05 — Provedor de rotas (HERE) e validação E2E da Fase 5

> **OBRIGATÓRIA ANTES DE PRODUÇÃO — NÃO BLOQUEIA DESENVOLVIMENTO DAS
> PRÓXIMAS FASES.**

> **O provedor mudou em 24/09/2026.** `D-2026-09-24-75` substituiu o Google
> Maps pelo **HERE**, porque o Google exige ativação de faturamento com meio
> de pagamento e a proprietária não autoriza cartão. Tudo abaixo passou a se
> referir ao HERE. As partes sobre **restrição de credencial na Vercel** e
> sobre **o que validar com endereço real** valem igual, e por isso foram
> mantidas.

### Situação atual

- A integração com o **HERE Location Services** está implementada, atrás da
  mesma abstração de provedor (`src/infrastructure/rotas/`). Nenhuma regra de
  negócio conhece o HERE: o contrato fala em coordenada, confiança e distância
  de rota — não em `resultType` nem em `sections[0].summary`.
- **Os testes automatizados cobrem o parsing**, o que não era verdade na
  integração anterior: 22 casos do provedor HERE e 14 do ViaCEP, com `fetch`
  em dublê, cobrindo mapeamento de confiança, ambiguidade, credencial
  recusada, timeout, corpo inválido, ausência de rota e arredondamento de km.
  Mais os 13 casos de faixa e os 66 cenários SQL da Fase 5, que exercitam
  faixa, raio, mínimo, troco, idempotência e exposição pública.
- **A integração real com o HERE NÃO foi validada.** Nenhuma chamada saiu
  deste projeto para a Geocoding & Search API ou para a Routing API. O que foi
  verificado é o comportamento contra o *contrato* e contra respostas
  simuladas — não contra o fornecedor.
- **Nada disso autoriza considerar o provedor validado.** Enquanto esta seção
  não estiver marcada como concluída, a integração é código não exercitado
  contra o mundo real.

### O risco específico deste provedor

A qualidade de geocodificação do HERE no Brasil, em endereço residencial de
cidade menor, **pode ser inferior à do Google**. E geocodificação errada
produz distância errada, que produz **taxa errada** — dinheiro.

Duas coisas contêm o risco, e a primeira é a que importa:

1. O provedor **rejeita** qualquer resultado que não seja `houseNumber` com
   tipo conhecido. Centro de rua, bairro ou cidade não passam. Endereço que
   não atinge essa precisão cai no ajuste pelo mapa (RN-ENT-005) ou na
   retirada — nunca em cobrança sobre coordenada fraca.
2. Falha de cálculo deixa a entrega **indisponível**, jamais R$ 0,00.

**O que isso NÃO resolve:** um endereço que o HERE localiza com confiança e
erra. Só teste com endereço real detecta isso — ver abaixo.

### Os limites do plano — HERE Limited Plan

A Shalon usa o **Limited Plan**, que é o nível para quem **não cadastra
informação de pagamento**. Foi exatamente por isso que ele substituiu o Google
(`D-2026-09-24-75`): o Google exigia meio de pagamento, a proprietária não
autoriza, e o HERE opera de verdade sem cartão.

O preço disso é um teto. Números oficiais da HERE:

| Limite | Valor |
|---|---|
| **Requisições por dia** | **1.000** |
| Geocode & Reverse Geocode | 5 RPS |
| Routing (car) | 10 RPS |
| Matrix / Isoline Routing | 1 RPS |

O nível seguinte (**Base Plan**) **exige informação de pagamento** — a mesma
condição que levou ao abandono do Google. Subir de plano, portanto, não é
decisão técnica: é a mesma decisão comercial que já foi tomada em sentido
contrário.

#### O consumo real da Shalon

O checkout de entrega gasta **duas** chamadas (geocodificar + rotear), e
`enviarPedido()` **refaz as duas** ao gravar, porque o servidor não aceita o
cálculo do navegador (CLAUDE.md §16). São **4 requisições por pedido de
entrega concluído**, mais 2 por checkout abandonado ou recalculado.

Decidido em 25/09/2026 **manter as 4**: o volume não justifica mexer no
recálculo autoritativo. A conta sustenta a decisão.

Referência operacional informada pela Shalon:

| Período | Pizzas/dia | Pedidos/dia |
|---|---|---|
| terça a quinta | ~60 | **igual ou menor** |
| sexta a domingo | até 70 | **igual ou menor** |

Pior caso plausível — **70 pedidos, todos de entrega**, mais metade disso em
checkout abandonado:

```text
70 pedidos  × 4 chamadas = 280
35 abandonos × 2 chamadas =  70
                            ---
                            350 requisições/dia
```

**350 de 1.000.** Folga de aproximadamente **2,9×**. Retirada não consome nada.

Em RPS o consumo é irrelevante: 70 pedidos distribuídos numa noite ficam
abaixo de 1 RPS mesmo concentrados.

#### Medição real, 25/09/2026

Rajadas simultâneas contra a API verdadeira, com orçamento fechado de **24
requisições (2,4% da cota)**:

| Rajada | Taxa efetiva | Resultado |
|---|---|---|
| 3 simultâneas | ~5,1 RPS | 3 OK, **zero 429** |
| 5 simultâneas | ~9,5 RPS | 5 OK, **zero 429** |
| 8 simultâneas | ~16,0 RPS | 8 OK, **zero 429** |
| 8 simultâneas (repetição) | ~13,1 RPS | 8 OK, **zero 429** |

**O teto de 5 RPS documentado não se manifestou** nem a 16 RPS. Ou a HERE é
mais tolerante que o contrato, ou o limite é aplicado por janela mais longa.
Não é prudente depender dessa folga: o número contratual continua sendo 5.

#### Uma anomalia honesta, ainda sem explicação

No diagnóstico de **24/09/2026**, com a chave recém-criada, apareceu HTTP 429
repetido — `"Rate limit for this service has been reached"` — com requisições
**sequenciais a ~0,5 RPS**, dez vezes abaixo do limite, e menos de 30
requisições no dia. Foi preciso espaçar 8 a 10 segundos para completar o teste.

Em 25/09 **não reproduziu**, nem sob rajada. A hipótese mais provável é
provisionamento da conta nova, mas **isso não foi confirmado** e fica
registrado como comportamento observado, não explicado.

**Consequência prática:** 429 deve ser tratado como possível a qualquer
momento, independentemente da conta estar dentro da cota.

#### O que acontece quando o limite é atingido

Verificado em 25/09/2026, em três camadas independentes:

1. **Provedor** (`here.ts`): 429, 500 e 503 viram `indisponivel`; só 401 e 403
   viram `configuracao`. Nenhum resultado de falha carrega `distanciaKm` ou
   `duracaoMinutos` — a falha não tem como transportar número.
2. **Server Action** (`enviarPedido`): falha em `localizarEMedir` retorna
   `ok: false` e **o pedido não é criado**.
3. **Banco** (`criar_pedido`, migration `20260919140400`): mesmo que as duas
   camadas acima fossem contornadas, `distancia_km` nula ou negativa levanta
   `rota_indisponivel`. Cenário exercitado em `pedidos_fase5.sql` — "entrega
   sem distancia nao inventa taxa".

A retirada continua funcionando em todos os casos.

**Nunca taxa R$ 0,00.** A entrega fica indisponível e o cliente é orientado à
retirada.

#### Restrições de licença

O Limited Plan **exclui** três usos. Um deles encosta no projeto:

- **Asset Management** — localizar, rastrear e exibir ativos em mapa, com
  rotas e alertas;
- Usage Based Insurance / telemática;
- Optimization — ordenar destinos para múltiplos veículos.

Calcular taxa de entrega por distância **não está excluído**: o uso da Shalon
é permitido. Mas **"GPS do motoboy" e "app do motoboy", já proibidos na V1**
(CLAUDE.md §46), passam a ter também impedimento contratual. Se algum dia
virarem escopo, a licença do HERE precisa entrar na conversa.

Há ainda a regra de **um App ID por aplicação, sem compartilhamento** —
relevante quando DEV e produção coexistirem: a rigor, credenciais separadas.

---

### O que falta configurar

| # | Item | Observação |
|---|---|---|
| 1 | Conta/projeto no **HERE platform** | identificável como o da Shalon |
| 2 | Plano **freemium** confirmado, sem pré-pagamento | é a razão da troca (`D-2026-09-24-75`); se a HERE passar a exigir cartão ou caução, isso volta a ser decisão da Shalon, não técnica |
| 3 | **Geocoding & Search v1** habilitada | endereço → coordenada, com o tipo do resultado |
| 4 | **Routing v8** habilitada | distância **rodoviária** (`transportMode=car`); linha reta é proibida (CLAUDE.md §20) |
| 5 | Criação da **credencial server-side** | uma chave, usada só pelo servidor |
| 6 | **Restrições** adequadas da credencial | ver a ressalva sobre a Vercel, logo abaixo |
| 7 | `HERE_API_KEY` no ambiente | **nunca no Git**, **nunca em `NEXT_PUBLIC_*`**, nunca em log (CLAUDE.md §13 e §45) |
| 8 | `SHALON_CHECKOUT_ORIGIN_SECRET` no ambiente | obtido uma vez com `select public.ler_segredo_do_servidor('checkout_origem');`, que exige `settings.manage` |
| 9 | **Configurações reais da Shalon** necessárias ao E2E | endereço e coordenadas da loja, horários, faixas de distância, raio automático, distância máxima, formas de pagamento, chave Pix quando houver, e catálogo com preço (liga-se a A-07) |

#### Ressalva sobre restrição de chave na Vercel

A recomendação usual — restringir a chave por **endereço IP de saída** — parte
de um servidor com IP estável. **Não assuma IP fixo na Vercel.** Funções
serverless saem por endereços que podem mudar, e uma restrição por IP mal
dimensionada quebra a entrega em produção de forma intermitente, que é o pior
modo de falhar.

Antes de aplicar a restrição, **verificar qual estratégia o ambiente de deploy
realmente suporta** naquele momento, entre as alternativas possíveis:

- restrição por IP, **somente** se houver egresso estático contratado e os
  endereços forem conhecidos e estáveis;
- restrição **por serviço** no painel do HERE, quando disponível, limitando a chave a Geocoding e Routing, que é
  independente de IP e deve ser aplicada em qualquer cenário;
- quotas e alertas de consumo, para que uso anômalo apareça cedo;
- rotação da chave documentada e possível sem downtime.

Restrição **por HTTP referrer não se aplica**: esta chave nunca é usada pelo
navegador. Se algum recurso visual de mapa vier a exigir chave pública no
futuro, ela será **outra credencial**, com outras restrições — jamais a mesma.

### Validação obrigatória futura

Antes da liberação para produção, executar o fluxo real, **em celular**:

```text
celular → cardápio → produto/pizza → carrinho → checkout → endereço real
→ Geocoding & Search → Routing v8 → distância rodoviária → faixa → taxa
→ pagamento esperado → criação do pedido → tracking
→ Meus pedidos/Histórico
```

E validar também, caso a caso:

| # | Cenário | O que precisa ser observado |
|---|---|---|
| 1 | **Retirada** | nenhuma chamada ao HERE acontece; sem taxa, sem distância |
| 2 | **Entrega dentro do raio automático** | fluxo normal, sem aprovação pendente |
| 3 | **Entrega acima do raio e dentro da área máxima** | taxa calculada, envio permitido, pedido **aguardando aprovação** da Shalon |
| 4 | **Endereço além da área máxima** | entrega bloqueada, retirada oferecida |
| 5 | **Endereço inválido ou ambíguo** | nenhuma coordenada inventada, nenhuma taxa |
| 6 | **Fronteiras `(min, max]`** | conferir nos limites reais das faixas cadastradas, inclusive a faixa iniciada em 0 |
| 7 | **Ausência de faixa** | nunca R$ 0,00; a resposta é "fora de área" ou "entrega não configurada" |
| 8 | **Snapshot** | distância e taxa gravadas no pedido conferem com o que foi cobrado |
| 9 | **Idempotência** | clique duplo e reenvio produzem **um** pedido e o **mesmo** link de acompanhamento |
| 10 | **Segurança do tracking** | token não adivinhável; token errado e pedido inexistente respondem igual; sem telefone completo, coordenada ou dado interno na tela |
| 11 | **Chave HERE ausente do cliente** | varrer bundle do navegador, HTML servido, requisições de rede e logs da aplicação — o HERE autentica por parâmetro de consulta, então a URL nunca pode aparecer |
| 12 | **Falha das APIs HERE** | indisponibilidade, timeout, 401/403 e franquia estourada: o checkout recusa com mensagem segura e **não** cria pedido com taxa arbitrária |

Concluída a validação, registrar aqui a data, quem executou e o que foi
observado — e só então marcar a pendência como resolvida, com a entrada
correspondente em `00-DECISOES.md`.

### O que NÃO deve ser feito enquanto a credencial não existe

O comportamento atual é **fail-closed**, e continua assim por decisão
(`D-2026-09-19-35`). Sem provedor disponível:

- **não** inventar distância;
- **não** calcular em linha reta, por CEP ou por bairro;
- **não** assumir taxa, nem "provisória";
- **nunca** transformar ausência de integração em entrega R$ 0,00;
- a **retirada** continua funcionando normalmente, porque não depende de
  provedor de rotas.

Não alterar a implementação do provedor apenas por falta da chave.

---

## POC da impressora térmica 58 mm

> **OBRIGATÓRIA ANTES DE PRODUÇÃO — BLOQUEIA APENAS O TRANSPORTE FÍSICO DA
> IMPRESSÃO, NÃO O RESTO DA FASE 6.**

### Situação atual

- O equipamento **não foi acessado por este ambiente** e nenhuma impressão
  física foi realizada. Fabricante, modelo, interfaces, perfil Bluetooth
  (Clássico ou BLE) e suporte a ESC/POS **não estão determinados** —
  e não serão inventados.
- Não existia nenhuma implementação de impressão no código antes desta fase;
  a investigação partiu do zero.
- O que a Fase 6 entregou é a **representação determinística da comanda**, em
  domínio puro, sem escolher transporte: mesmas entradas produzem sempre as
  mesmas linhas, com largura útil de 32 colunas. Isso é testável sem
  hardware e não compromete nenhuma estratégia futura. Comanda normal e
  documento **ALTERAÇÃO** estão prontos e cobertos por teste; o registro de
  emissão e reimpressão também (`order_prints`).
- **A impressão NÃO está validada.** Nada no sistema deve afirmar que uma
  comanda foi impressa: o domínio distingue *solicitada*, *enviada*,
  *confirmada* e *erro*, e sem confirmação física do equipamento o estado
  nunca chega a "confirmada".

### O fato técnico que decide a arquitetura

**A Web Bluetooth API só fala BLE/GATT. Ela não fala Bluetooth Clássico
(SPP/RFCOMM).**

Boa parte das impressoras térmicas 58 mm de baixo custo é Bluetooth Clássico
com perfil serial. Se a impressora da Shalon for Clássica, **nenhum navegador,
em nenhum sistema, conseguirá falar com ela diretamente** — e a questão deixa
de ser "qual navegador" e passa a ser "qual ponte".

Por isso a primeira informação a obter não é uma preferência de
implementação: é **o perfil Bluetooth do equipamento**.

### Informações que precisamos obter do equipamento

| # | Informação | Como costuma ser obtida |
|---|---|---|
| 1 | Fabricante e modelo | etiqueta na base do aparelho ou embalagem |
| 2 | Nome anunciado no Bluetooth | tela de pareamento do celular (ex.: `PT-210`, `MTP-2`, `Printer001`) |
| 3 | **Clássico ou BLE** | se aparece no pareamento comum do Android → Clássico; se só é achado por apps BLE → BLE; alguns são dual-mode |
| 4 | Suporte a **ESC/POS** | manual, ou teste com app genérico de ESC/POS |
| 5 | Interfaces além do Bluetooth | USB, serial, rede |
| 6 | Onde já imprime hoje | qual app/celular/sistema a Shalon usa atualmente e que funciona |
| 7 | Largura útil real | 32 ou 42 colunas, conforme fonte; papel de 58 mm costuma dar 32 em fonte A |
| 8 | Guilhotina/corte | muitas 58 mm não têm; é serrilha manual |

O item 6 é o mais valioso: **se já existe um caminho que imprime hoje**, ele
é a prova de conceito mais barata disponível.

### Estratégias tecnicamente possíveis

Ordenadas por risco, da menor para a maior mudança arquitetural. Nenhuma
delas foi escolhida — a escolha depende do perfil Bluetooth.

#### E1 — Web Bluetooth direto (BLE apenas)

O navegador abre GATT e escreve os bytes numa característica.

- **Funciona se:** a impressora for BLE (ou dual-mode) e expuser
  característica gravável.
- **Chrome/Edge no Android e no desktop:** suportado.
- **Safari (iOS e macOS): não suportado.** A Apple não implementou Web
  Bluetooth. Isso elimina iPhone e iPad de qualquer variante desta
  estratégia — sem "talvez": é impossível hoje.
- **Firefox:** não suportado.
- Exige **HTTPS** e **gesto do usuário** para abrir o seletor de dispositivo.
- O pareamento **não é necessariamente persistente**: reconectar a cada
  sessão prejudica "reimprimir rápido no balcão", que é o caso de uso real.
- Sem mudança arquitetural na aplicação.

#### E2 — App-ponte no Android que já domina o Bluetooth Clássico

A aplicação entrega os bytes ESC/POS a um app de impressão instalado no
aparelho (via esquema de URL/intent), e o app fala com a impressora.

- **Funciona com impressora Clássica**, que é o caso mais provável.
- Continua sendo **nossa aplicação web**: não vira Capacitor, não vira app
  nativo, não muda arquitetura. O que muda é que o aparelho do balcão
  precisa ter o app instalado.
- Só Android.
- Confirmação de impressão costuma ser limitada — o que reforça a
  necessidade dos estados *enviada* ≠ *confirmada*.

#### E3 — Ponte local no balcão (máquina fixa)

Um pequeno serviço na máquina do balcão mantém a conexão (Bluetooth ou USB)
e expõe um endpoint em `localhost`; o navegador envia os bytes para ele.

- Funciona com Clássico e com USB; é a opção com **melhor confirmação real**
  de sucesso ou erro.
- Exige uma máquina sempre ligada no balcão.
- **Risco a verificar:** página em HTTPS chamando `http://localhost` envolve
  regras de conteúdo misto e de acesso a rede privada, que variam por
  navegador e versão. Precisa ser testado no navegador que a Shalon usará,
  não presumido.
- Introduz um componente novo a instalar e manter.

#### E4 — Diálogo de impressão do sistema

Usar o driver do sistema operacional e `window.print()`.

- Não produz ESC/POS: produz raster, com margens e escala do driver.
- Em 58 mm costuma dar problema de largura e desperdiçar papel.
- No Android, a maioria dessas impressoras **não expõe serviço de impressão
  do sistema** sem um app dedicado — o que recai em E2.
- Serve, no máximo, como alternativa de contingência.

### Riscos por plataforma

| Plataforma | E1 Web Bluetooth | E2 App-ponte | E3 Ponte local | Observação |
|---|---|---|---|---|
| Android + Chrome | possível, só se BLE | possível | possível | plataforma mais provável do balcão |
| iPhone/iPad (Safari) | **impossível** | não se aplica | possível via rede | se a operação precisar de iOS, E1 está descartada |
| Windows/macOS + Chrome/Edge | possível, só se BLE | não se aplica | possível | |
| Qualquer + Firefox | **impossível** | — | possível | |
| Qualquer navegador | — | — | — | **HTTPS é obrigatório** para Web Bluetooth |

### Testes físicos obrigatórios

Quando o equipamento estiver disponível, executar a menor POC possível —
`aplicação → comando de teste → impressora → papel` — cujo objetivo **não é
comanda bonita**, e sim provar que bytes saem da aplicação e chegam ao papel
de forma repetível:

| # | Teste | O que precisa ser observado |
|---|---|---|
| 1 | Texto simples | sai legível, sem caracteres perdidos |
| 2 | **Acentos e cedilha** | "Calabresa com Açúcar, Coração, Ão" saem corretos; identificar a tabela de código aceita (CP860, CP850, Latin-1) |
| 3 | Quebra de linha | linha longa quebra onde o domínio decidiu, não onde a impressora achou |
| 4 | **Largura útil** | confirmar 32 ou 42 colunas imprimindo uma régua de caracteres |
| 5 | Corte | **somente se suportado**; se for serrilha manual, registrar isso e não emitir comando de corte |
| 6 | Reconexão e reimpressão | imprimir, sair da tela, voltar e reimprimir sem reparear tudo de novo |
| 7 | **Impressora desligada/desconectada** | a aplicação precisa falhar com mensagem clara e **não** marcar como impresso |
| 8 | Papel acabando/acabado | o que o equipamento reporta, se reporta algo |
| 9 | Duas impressões seguidas | não embaralhar conteúdo nem truncar a segunda |
| 10 | Comanda real completa | pedido com meio a meio, borda, adicionais e observação longa |
| 11 | Documento **ALTERAÇÃO** | sai visualmente distinto da comanda normal |

### Critério para considerar a POC aprovada

Todos os itens abaixo, sem exceção:

1. perfil Bluetooth e suporte a ESC/POS **determinados**, não presumidos;
2. uma estratégia entre E1–E3 **escolhida e registrada** em `00-DECISOES.md`,
   com o motivo;
3. testes 1, 2, 3, 4, 6, 7 e 10 da tabela acima **executados no equipamento
   real**, com resultado registrado aqui;
4. impressão repetível: três comandas seguidas, em momentos diferentes, sem
   intervenção manual além do esperado;
5. falha tratada: com a impressora desligada, a aplicação não afirma sucesso;
6. o aparelho e o navegador usados no teste **são os que a Shalon usará**;
7. se a estratégia exigir app-ponte ou serviço local, isso vira decisão
   registrada, com instruções de instalação — não um detalhe de bastidor.

Enquanto qualquer item estiver aberto, a impressão permanece **implementada,
não validada**.

---

## Validação E2E real de pedido → pagamento → caixa

> **OBRIGATÓRIA ANTES DE PRODUÇÃO — NÃO BLOQUEIA O DESENVOLVIMENTO DA
> FASE 8.**

### Situação atual

- O caixa, o pagamento realizado e o financeiro estão implementados e
  cobertos por **172 cenários** contra o banco, que exercitam divisão,
  troco, estorno, fechamento com diferença, reabertura, permissões e RLS.
- O que **não** foi exercitado é o ciclo inteiro com configuração real: o
  banco de desenvolvimento ainda não tem `store_settings` da Shalon, e sem
  ele não se cria pedido. Os cenários de pagamento rodam sobre pedidos
  criados em transação de teste, não sobre um pedido que nasceu do cardápio.
- **Nada disso é defeito da Fase 7.** É ambiente incompleto.

### Configuração necessária antes de exercitar

- **dados da pizzaria** em `store_settings` — endereço, WhatsApp, fuso,
  janelas de horário e faixas de entrega;
- **bandeiras aceitas**, cadastradas pela Shalon em Configurações. Débito,
  crédito e voucher exigem bandeira ativa (RN-PGTO-006), e **nenhuma vem
  semeada**: Visa, Mastercard e afins são cadastro, não regra de domínio, e
  semeá-las por suposição seria inventar quais a Shalon aceita.

### O ciclo a exercitar

```text
pedido → pagamento esperado → pagamento realizado → eventual divisão
      → movimento físico quando for dinheiro → conclusão adequada
      → resumo e fechamento de caixa
```

### O que precisa ser validado com dado real

| Caso | O que observar |
|---|---|
| Dinheiro | entra na gaveta e sobe o esperado |
| Troco | a venda é o valor do pedido, não o que veio na mão |
| Pix | recebimento sem virar dinheiro físico |
| Débito | bandeira real cadastrada, sem movimento de caixa |
| Crédito | idem |
| Voucher | **se a Shalon usar**; caso não use, registrar que não se aplica |
| Esperado ≠ realizado | a intenção do checkout permanece, e a divergência é auditada |
| Divisão interna | soma fecha com o total, e só a parte em dinheiro entra na gaveta |
| Estorno | o original permanece e o compensatório sai do caixa |
| Reflexo no fechamento | esperado, contado, diferença e o que ficou fora da gaveta |

### Quando executar

Junto da configuração real da Shalon, **na mesma sessão** da validação do
provedor de rotas (HERE) e do E2E já pendentes da Fase 5 — os dois precisam do
mesmo ambiente configurado.

### O que NÃO deve ser feito para "adiantar"

- preencher `store_settings` com dados inventados só para o fluxo rodar;
- semear bandeiras por suposição;
- considerar o pagamento validado porque os cenários de banco passam. Eles
  provam a regra, não a operação.

---

## Estado da Fase 5

**Implementada e aprovada para continuidade do desenvolvimento**, com
validação real do provedor de rotas e E2E **pendentes antes da produção**,
conforme a seção acima.

A integração **HERE** — provedor ativo desde `D-2026-09-24-75` — **não está
validada** contra a API real. O parsing das respostas tem cobertura
automatizada; a API verdadeira nunca respondeu a este código.

---

## Estado da Fase 6

**Encerrada e aprovada em 21/09/2026.** Operação interna de pedidos,
máquina de estados, alteração com aprovação do cliente, central em tempo
real, pedidos manuais e configurador compartilhado estão implementados,
testados e com as regras reconciliadas.

As duas lacunas normativas que a fase havia registrado em vez de inventar
regra foram resolvidas pela Shalon e promovidas a regra em
`04-REGRAS-NEGOCIO.md` §24 — RN-MAN-004, RN-MAN-005 e RN-MAN-006, decisão
`D-2026-09-21-53`. **Nenhuma decisão normativa da Fase 6 continua em
aberto.**

**A única pendência da fase é física**, e é a seção acima: a POC da
impressora 58 mm. A comanda é gerada de forma determinística e o registro de
emissão e reimpressão existe; o **transporte físico não foi exercitado**.
Isso não bloqueia a Fase 7 — bloqueia a produção.

A impressão **não está validada**.

---

## Estado da Fase 7

**Encerrada e aprovada em 21/09/2026.** Sessão de caixa, movimentos físicos,
fechamento com diferença justificada, reabertura excepcional, pagamento
realizado com divisão e troco, estorno vinculado, entradas, despesas,
categorias e comprovante financeiro estão implementados e testados.

**Nenhuma decisão normativa da Fase 7 continua em aberto.** A separação entre
pedido entregue e valor recebido virou RN-PGTO-014, e é a regra que a Fase 8
usará na prestação de contas do entregador.

**A pendência da fase é a seção acima**: o ciclo completo nunca foi
exercitado com configuração real da Shalon. Isso não bloqueia a Fase 8 —
bloqueia a produção.

O fluxo de pagamento **não está validado contra operação real**.

---

## Estado da Fase 8

**Implementada em 22/09/2026.** Atribuição, saída, retorno, acerto do
motoboy, movimentações internas (cortesia, consumo de funcionário, consumo do
proprietário, perda) e livro financeiro do funcionário estão implementados e
testados: 112 cenários em `supabase/tests/entregas_fase8.sql`, e a Fase 7
re-executada sem regressão (172 de 172).

### O que continua sem validação real

1. **O ciclo de entrega nunca foi exercitado com operação real.** A mesma
   dívida da Fase 7 se estende aqui: `store_settings` está vazio no ambiente
   de desenvolvimento, e a identidade da Shalon não foi inventada. Sem ela
   não há pedido público, e portanto não há entrega real do começo ao fim —
   apenas o caminho coberto por teste dentro de transação. **Bloqueia a
   produção.**

2. **Nenhum acerto foi feito com dinheiro de verdade na mão.** O cenário que
   mais importa é humano: o motoboy volta, a pessoa conta o dinheiro, e o
   número da tela precisa bater com o da mão. Isso só se valida operando.

3. **Anexo de comprovante do acerto não foi exercitado pelo navegador.** A
   coluna `attachment_asset_id` existe em `driver_run_settlements` e o bucket
   privado aceita o arquivo, mas a interface da Fase 8 ainda não oferece o
   envio — e o navegador interno usado na validação visual não anexa
   arquivos. Igual à dívida equivalente da Fase 7.

4. **Cadastro de funcionários foi entregue no complemento da fase.**
   Atualizado em 22/09/2026. `/admin/equipe` **cadastra, edita, desliga e
   reativa** funcionário, vincula acesso a uma conta que já exista no Auth e
   atribui papéis. Funcionário continua separado de usuário do Auth, e o
   motoboy segue existindo sem login (`01`/`04` e `03` §19.7). A pendência
   **A-14** foi resolvida por `D-2026-09-22-58`.

   O que continua em aberto, e é decisão e não dívida de validação:
   **A-20** — provisionamento da conta de login (o sistema vincula, não cria)
   — e **A-21** — hardening da edição de `role_permissions`. As duas vivem em
   `00-DECISOES.md`.

### Duas lacunas normativas registradas, não inventadas

**A-18 — troca de motoboy com o pedido já na rua.** Caso real (a moto
quebrou, outro vai buscar) que nenhum documento define. A implementação
recusa a troca depois de `out_for_delivery` e a registra como lacuna, em vez
de decidir o que "saiu para entrega" passa a significar.

**A-19 — adiantamento pago pela gaveta.** O lançamento no livro do
funcionário não move o caixa; quem paga em dinheiro registra a sangria à
parte. A separação dos dois livros é deliberada; o vínculo entre os dois
registros é que não está decidido.

A operação de entrega **não está validada contra operação real**.

### Complemento da Fase 8 — o que segue sem validação real

Acrescentado em 22/09/2026, com `D-2026-09-22-58`. As lacunas normativas
A-18 e A-19 **saíram daqui**: viraram regra em `04-REGRAS-NEGOCIO.md` e a
decisão está em `00-DECISOES.md`. O que permanece nesta seção é só o que
depende do mundo real.

1. **Nenhuma transferência em rota foi feita com uma moto quebrada de
   verdade.** O cenário é coberto por teste, inclusive o caso em que o
   dinheiro fica com quem saiu; o que não foi exercitado é a conversa de
   balcão que o acompanha — quem liga para quem, e em quanto tempo a tela
   acompanha a rua.

2. **Nenhum adiantamento foi pago com dinheiro de verdade.** Os dois
   registros nascem juntos no teste; o que falta é a gaveta física conferindo
   com o número da tela depois de um adiantamento no meio do turno.

3. **A criação da conta de login continua fora do sistema** (**A-20**). Hoje
   a conta nasce no painel do Supabase e só então é vinculada. Isso não é
   dívida de validação, é decisão pendente — está registrada em
   `00-DECISOES.md`, e consta aqui apenas porque afeta o roteiro de colocar
   um funcionário novo para trabalhar.

Nada disso bloqueia as próximas fases. Bloqueia a produção, junto com as
pendências anteriores.

---

## Disciplina de validação: superfície pública se exercita sem sessão

Acrescentado em 22/09/2026, depois do defeito corrigido em
`D-2026-09-22-59`: o cardápio publicado ficou sem foto e sem banner para o
cliente, e ninguém viu, porque toda validação visual foi feita no navegador
de quem desenvolve — que carrega o cookie da sessão administrativa.

Isto não é regra nova de produto nem arquitetura nova. É como validar:

- funcionalidade **pública** se confere em contexto realmente anônimo — aba
  anônima do navegador, ou teste rodando como `anon`;
- conferir logado continua valendo para o **administrativo**, que é o que ele
  mede;
- quando o resultado depende de quem olha, os dois casos são exercitados,
  porque a diferença entre eles é exatamente o que a RLS decide.

Os testes que já garantem isso, e que devem continuar existindo:

- `supabase/tests/midia_publica_fase4b.sql` — 19 cenários, os relevantes como
  `anon`, incluindo os negativos (comprovante financeiro, produto inativo,
  `media_assets` fechada);
- `supabase/tests/publico_fase4.sql` — 96 cenários, todos como `anon`.

As fronteiras continuam sendo normativas em `03-RLS-RBAC-SEGURANCA.md`
§8.1 e §23.1.

---

## Estado da Fase 9

Acrescentado em 23/09/2026, ao fim da implementação da inteligência, CRM,
remarketing, dashboard e relatórios.

**Coberto por teste automatizado.** A verdade analítica (venda registrada ×
faturamento recebido × movimento interno), a régua de cadência RN-CRM-004/005,
a central de atenção, o ranking com elegibilidade, o remarketing assistido e
os dez relatórios com exportação. `supabase/tests/inteligencia_fase9.sql`
monta massa controlada e confere 98 cenários, incluindo os negativos de
permissão para `anon`, para atendente e para um papel que vê relatório e
**não** exporta.

**Coberto por validação visual com massa povoada.** As quatro telas foram
exercitadas no desktop e em 375 px com dados reais de operação, criados pelas
mesmas RPCs que a interface usa (`supabase/seeds/massa_fase9.sql`): cadências
das cinco classificações, filtros objetivos de ausência, busca, consentimento
e opt-out, candidato e contato de remarketing com compra posterior,
cancelamento, rejeição, entrega com acerto de motoboy e entrega com falha,
duas formas de pagamento e três origens de pedido. A massa foi removida ao
final, e o ambiente voltou ao estado anterior.

**O que continua sem validação, e por quê.**

1. **Os arquivos exportados não foram abertos em aplicativo real.** CSV,
   Excel e PDF baixam com 200, tipo de conteúdo correto e `attachment`, e a
   rota recusa com 403 sem sessão — isso foi conferido pelo navegador, com
   massa. O que **não** foi feito é abrir os três no Excel, no LibreOffice e
   num leitor de PDF, em máquina da Shalon. O escritor de `.xlsx` e o de PDF
   são próprios, sem biblioteca, e é isso que precisa de conferência humana
   antes da produção.

2. **Desempenho medido em volume pequeno.** Com a massa carregada — 26
   pedidos, 22 concluídos, 21 pagamentos, 13 clientes, 20 produtos — as doze
   consultas analíticas principais responderam com pior tempo de **36 ms**
   (`central_de_atencao`, primeira execução) e todas as demais abaixo de
   21 ms. Isso mostra que não há N+1 nem varredura acidental. **Não** mostra
   comportamento sob volume de produção: a medição precisa ser repetida com
   meses de operação real antes de se declarar desempenho validado.

3. **A hora do dia da massa é artificial.** Os pedidos tiveram a DATA
   reescrita para o passado, mas todos guardam a mesma hora de criação — por
   isso "horários de pico" mostrou um único horário. O recorte por hora está
   correto no SQL e foi conferido lá; no navegador ele não pôde ser lido como
   informação de negócio.

4. **O ambiente de desenvolvimento continua sem configuração de loja.** Ele
   não tem `store_settings`, horário nem faixa de entrega próprios — a massa
   criou os três temporariamente e os removeu. Enquanto for assim, qualquer
   validação futura precisará repetir esse passo, e o checkout público do
   ambiente permanece indisponível.

---

## Hospedagem e licenciamento — uso comercial no plano Hobby da Vercel

**Aberta.** Não bloqueia desenvolvimento nem go-live. É pendência de
**licenciamento**, não técnica.

**O fato, da documentação oficial.** A página do plano Hobby afirma, citando
as diretrizes de uso justo, que o Hobby **restringe os usuários a uso
não-comercial e pessoal**. A Pizzaria Shalon é operação comercial.

**Situação atual.** A aplicação **já está publicada** e o plano atual é o que
está em uso. Marcelo decidiu, em 24/09/2026, **não contratar o Pro agora**.
Essa decisão é dele e está registrada; este documento não a reabre e não
transforma a pendência em bloqueio artificial.

**O que falta decidir**, quando Marcelo quiser tratar:

1. permanecer como está, ciente do termo;
2. migrar para um plano que permita uso comercial;
3. hospedar em outro provedor.

**O que NÃO deve ser feito.** Não travar o go-live por causa disto, e não
reapresentar a contratação como requisito técnico — ela não é. O risco aqui é
contratual, não de funcionamento: a aplicação roda igual.

**Nota de custo relacionada.** O plano pago da Vercel oferece o primeiro ano
de domínio próprio grátis em TLD elegível. Isso é **informação**, não motivo:
a decisão de domínio ficou explicitamente desvinculada de contratação.

---

## Estado da Fase 10

**Fase 10 concluída em 24/09/2026.** O hardening executou 11 de 11 suítes SQL
versionadas, 1.032 de 1.032 cenários, 139 de 139 testes Vitest, typecheck e
lint limpos, com 109 migrations reconciliadas, zero fixture residual, 278
`audit_logs` preservados e árvore Git limpa. O registro completo do gate está
em `05-PLANO-IMPLEMENTACAO.md` §14.8.

Esta seção guarda apenas o que **continua sem validação real** depois dela.
Nada abaixo foi convertido em "testado".

### O que segue sem validação real

1. **A-05 — provedor de rotas real (HERE).** Seção "A-05 — Provedor de rotas
   (HERE) e validação E2E da Fase 5" neste documento. O provedor de rota tem
   abstração interna, provedor falso nos testes e cobertura do parsing do HERE;
   a API verdadeira nunca respondeu a este código.

2. **A-20 — criação de conta Auth de funcionário.** O sistema **vincula** uma
   conta que já existe no Auth; não a cria. Criar exigiria `service_role`
   (CLAUDE.md §13) e uma política de senha inicial/recuperação que não está
   normatizada. A decisão do mecanismo continua em aberto em `00-DECISOES.md`.

3. **PI-F10-01 — `DELETE` pela API de Storage com identidade real.** Seção
   própria, logo abaixo. O comportamento está comprovado no banco, não na API.

4. **POC física da impressora térmica 58 mm.** Seção "POC da impressora
   térmica 58 mm" neste documento. Nenhum papel saiu de nenhuma impressora.

5. **Concorrência multi-sessão real.** O que a Fase 10 exercitou foi
   idempotência por chave, constraints únicas, comportamento dos locks e
   atomicidade transacional — tudo em **sessão única**, porque o conector
   disponível oferece uma sessão por vez. Os cenários de §14.4 do plano que
   exigem dois atores simultâneos (dois atendentes aceitando o mesmo pedido,
   dois fechamentos do mesmo caixa, dois acertos da mesma saída, dupla
   confirmação/reversão) **não** foram exercitados por corrida real.

   **Como validar.** Duas sessões autenticadas de verdade, disparando a mesma
   operação com sobreposição temporal deliberada, observando qual ganha e o
   que a perdedora recebe. Duas chamadas sequenciais não são teste de
   concorrência.

6. **TOCTOU de A-21 não exercitado por corrida real.** A correção de
   D-2026-09-23-69 faz `definir_permissoes_do_papel` travar a linha do papel
   com `for update` e `definir_papeis` travar as mesmas linhas com
   `for share`. A leitura do código e o comportamento dos comandos foram
   verificados; **a janela entre validar e atribuir não foi atacada por duas
   transações concorrentes de verdade**. Leitura de lock não é corrida.

   **Como validar.** Transação A abre, valida o conjunto e segura; transação B
   tenta engordar o mesmo papel; observar que B espera A e que o resultado
   final não concede permissão que o ator não possuía.

7. **Ausência de prova com volume real de produção.** A medição de desempenho
   da Fase 10 usou massa descartável de 8.000 pedidos, criada e removida no
   próprio exercício. Ela demonstrou o gargalo e a correção
   (`fila_de_pedidos(true)`: 38.689 ms → 592 ms), mas **não** é o dado da
   Shalon. Repetir as medições com o volume verdadeiro depois do go-live,
   incluindo as telas analíticas da Fase 9.

8. **Proteção contra senha vazada do Supabase.** O Auth do projeto pode
   recusar senhas conhecidamente vazadas (verificação contra HaveIBeenPwned),
   e a opção **não está habilitada**. Não é defeito do código: é configuração
   de plataforma.

   **O que falta configurar.** Habilitar a proteção contra senha vazada no
   Auth do projeto de **produção**, e conferir que o fluxo de definição de
   senha da equipe interna a respeita.

   **Validação obrigatória futura.** Tentar definir uma senha sabidamente
   vazada e observar a recusa, com mensagem que não vaza detalhe interno
   (CLAUDE.md §37).

### Duas notas que não são dívida de validação

**Paginação da fila.** Não entrou na Fase 10 por decisão: o gargalo
demonstrado foi resolvido sem ela, e quantos pedidos encerrados a tela deve
mostrar é decisão de produto. Não está aqui porque não é algo a "validar" —
é algo a **decidir**, e por isso pertence a `00-DECISOES.md` quando for a
hora.

**O projeto Supabase descartável de replay não é DEV nem produção.** Ele
existe para exercitar o replay das migrations em banco vazio e nada mais.
Não deve ser confundido com nenhum dos dois em documento, script, variável de
ambiente ou procedimento, e não deve receber dado real da Shalon.

---

## PI-F12-01 — estorno pode deixar o esperado em caixa negativo

**Aberta.** Débito **preexistente**, anterior à Fase 12 e **não introduzido**
por ela. Encontrado em 25/09/2026 ao escrever a suíte da Etapa 1 do PDV.

**O que é.** `movimentar_caixa` recusa uma sangria maior que o dinheiro
esperado em caixa — saldo negativo é impossibilidade física, não saldo:

```
if v_sentido = 'out' and v_valor > public.esperado_em_caixa(...) then
  return ... 'O valor é maior que o dinheiro esperado em caixa.'
```

`reverter_pagamento` **não tem essa guarda**. Ela insere o movimento de
`refund`/`out` diretamente, sem comparar com o esperado. Então um estorno de
recebimento em dinheiro pode levar `esperado_em_caixa` a valor negativo — por
exemplo, estornar R$ 40 numa sessão recém-aberta com fundo R$ 0.

**Por que importa.** Encadeia num segundo efeito: `cash_sessions` tem
`check (counted_cash_amount >= 0)`. Com o esperado negativo, a pessoa não
consegue informar um contado que feche sem diferença, porque o contado real
seria negativo — e valor negativo é recusado pela constraint. O fechamento fica
obrigado a registrar diferença e justificativa por uma razão que não é erro de
contagem.

**Por que não foi corrigido junto.** Decisão de 25/09/2026: não misturar
correção de débito preexistente com a Etapa 1, cujo escopo é o cancelamento com
estorno. A Etapa 1 **não agravou** o problema — ela apenas chama
`reverter_pagamento`, que já se comportava assim.

**Onde está registrado no código.** Comentário no bloco F de
`supabase/tests/pdv_etapa1_fase12.sql`, que abre o segundo caixa com fundo
suficiente justamente para não medir esta constraint em vez do estorno.

**O que precisa ser decidido antes de corrigir.** Não é óbvio qual é o certo, e
por isso é decisão de produto, não técnica:

- **recusar o estorno** quando não houver dinheiro na gaveta? Impediria devolver
  ao cliente que está no balcão — e o dinheiro pode estar fisicamente lá, vindo
  de outra fonte;
- **exigir reforço antes**? Correto contabilmente, um passo a mais no balcão;
- **permitir negativo e destacá-lo** no fechamento, como já se faz com o
  dinheiro fora da gaveta? Preserva a operação e mostra o fato.

Minha leitura é que a terceira opção conversa melhor com o que o projeto já
faz em RN-CAIXA-013/014, mas isso é decisão da proprietária sobre como a loja
devolve dinheiro.

**Não bloqueia** a Fase 12 nem a produção. Bloqueia dizer que o fechamento de
caixa está completo em todos os caminhos.

---

## PI-F12-02 — o DEV não tem acesso de Atendente

**Aberta.** Observado em 27/09/2026, na validação operacional da Etapa 8 do PDV.

**O que é.** `app_users` tem duas linhas, ambas com o papel **Owner/Admin** —
`Marcelo` (ativa) e `Ana Shalon` (inativa). Não existe nenhum acesso com o papel
**Atendente**, que é justamente o operador para quem o PDV foi desenhado.

**Por que importa.** Tudo o que é específico do Atendente só pode ser provado na
autoridade — chamando as RPCs com um papel que copia as permissões dele —, nunca
*logado como* ele pela interface. Foi o que aconteceu na Etapa 8: as operações de
caixa foram exercidas como Owner/Admin, e a recusa da reabertura foi medida com
um papel espelho em transação revertida. A medição é válida, porque o espelho é
uma cópia viva do RBAC persistido e não um papel inventado, mas ela não exercita
a interface sob as permissões reais do balcão.

**O que ainda não foi verificado com os olhos.** Como o `/admin/pdv` se comporta
para quem **não** tem `cash.reopen`, `cash.bypass_session` nem `finance.view`:
o aviso condicional da aba Caixa, o histórico "Recebido de fato" vazio pela
assimetria `payments.register` × `finance.view`, e quais itens do menu lateral
aparecem. Nada disso é regra de negócio — a autoridade já está provada —, mas é
experiência de uso de quem vai passar o dia na tela.

**Por que não foi resolvido junto.** Criar acesso é operação de produto: envolve
e-mail real, senha e a decisão de qual pessoa da Shalon recebe qual papel.
Sessões anteriores foram explícitas em não criar usuário para fazer teste passar.

**O que precisa acontecer.** A proprietária criar o acesso do balcão pela tela
de Equipe, com o papel Atendente, e a validação da experiência ser refeita
logada como ele. Vale fazer junto da validação de produção.

**Não bloqueia** a Fase 12. Bloqueia dizer que a experiência do Atendente no PDV
foi vista funcionando.

---

## PI-F10-01 — remoção no Storage com identidade real dos papéis

**Aberta.** Status: implementado e testado por SQL; **não** exercitado pela
API de Storage com sessão autenticada.

**O que é.** A correção do bucket `comprovantes` (D-2026-09-23-68) concede
`DELETE` apenas no namespace `financeiro/`, e apenas a quem tem
`finance.create`. A policy foi verificada por leitura e o comportamento foi
testado por SQL com papéis customizados, em transação com `rollback`.

**O que não foi exercitado, e por quê.** A remoção ponta a ponta pela API de
Storage. Dois impedimentos somados, nenhum deles do projeto:

1. a Supabase mantém o trigger `protect_objects_delete` em `storage.objects`,
   que bloqueia `DELETE` direto por SQL — remoção real passa obrigatoriamente
   pela API;
2. não existe sessão autenticada dos papéis customizados de teste no
   ambiente de desenvolvimento: as contas do Auth do projeto são as duas
   Owner/Admin, e criar conta de funcionário é a pendência **A-20**.

**Como validar quando houver ambiente para isso.** Com um funcionário real
vinculado a um papel que tenha `internal.view`/`internal.register` e **não**
tenha `finance.*`, autenticar de verdade e tentar, pela API de Storage:
listar `financeiro/`, baixar um comprovante conhecendo o caminho, e removê-lo.
Os três devem falhar. Repetir o simétrico com um papel financeiro contra
`interno/`.

**Não é leitura de policy transformada em teste executado.** Enquanto esta
pendência estiver aberta, o que está comprovado é o comportamento no banco,
não o da API.

## A-22 — limitação observada na validação do ranking

**A decisão normativa não está aqui.** Ela é `D-2026-09-23-67` em
`00-DECISOES.md`: a V1 **não** registra histórico de disponibilidade, e o
comportamento conservador do indicador é o que fica valendo. Este documento
guarda apenas o que foi **observado ao validar**.

**O que a validação mostrou.** Com a massa povoada, o ranking separou
corretamente três situações no mesmo período:

- **comparável e vendendo** — produto no catálogo desde antes do período e
  disponível agora;
- **comparável e sem venda** — mesmo critério, zero unidades: é o único tipo
  de produto que a tela chama de baixa venda;
- **não comparável** — os produtos que entraram no catálogo durante o
  período apareceram com o motivo escrito ("entrou no catálogo durante o
  período") e ficaram fora do recorte de baixa venda.

A ressalva de disponibilidade apareceu na tela em todos os períodos
exercitados.

**O que continua sem resposta, e por decisão.** "Este produto ficou
indisponível metade do mês?" não tem resposta no sistema, porque o histórico
não existe. Isso **não** é dívida de validação: é escopo recusado em
`D-2026-09-23-67`. Está registrado aqui só para que quem ler um ranking saiba
o que ele não mede.
