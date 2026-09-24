# 08 — BOOTSTRAP DE PRODUÇÃO

## Sistema de Gestão e Pedidos — Pizzaria Shalon

**Versão:** 1.0 — aberto em 24/09/2026, no Gate 11.1 da Fase 11
**Status:** documento operacional vivo
**Função:** descrever, passo a passo, como a produção nasce — e como se volta
atrás se algo der errado.

---

## 0. O que este documento é, e o que não é

**Não é fonte normativa.** Não decide regra, preço, taxa nem segurança. As
fontes de verdade continuam sendo `01` a `05` e `CLAUDE.md`; o que falta
validar contra o mundo real continua em `06`.

Isto aqui é **runbook**: a ordem exata dos atos de implantação, o que cada um
exige de entrada, o que prova que deu certo, e como sair com segurança.

### Três regras que valem para o documento inteiro

1. **Produção começa vazia.** Não se copia cliente, pedido, pagamento, caixa,
   auditoria ou fixture de DEV. O que pode nascer das migrations nasce das
   migrations; dado comercial real é configurado depois, explicitamente.
2. **O projeto descartável `pizzariashalon` não é fonte de produção**, e o
   `pizzaria-shalon-dev` **não deve ser clonado** como banco de produção.
3. **Migration aplicada nunca é editada.** Correção em produção é migration
   nova, como em qualquer outro ambiente.

---

## 1. Inventário de recursos necessários

| # | Recurso | Para quê | Situação |
|---|---|---|---|
| R1 | Organização Supabase | hospedar o projeto de produção | **existe** |
| R2 | Projeto Supabase de **produção** | banco, Auth, Storage | **falta criar** |
| R3 | Plano da organização Supabase | backup, retenção, pausa por inatividade | **a decidir** (Gate 11.2) |
| R4 | Projeto Google Cloud | Geocoding API + Routes API | **falta criar** |
| R5 | Conta de faturamento Google | habilitar as APIs de rota | **falta criar** |
| R6 | Chave server-side do Google Maps | distância real de rota | **falta gerar** |
| R7 | Conta Vercel | build e hospedagem do front | **a confirmar** |
| R8 | Projeto Vercel de produção | deploy | **falta criar** |
| R9 | Domínio próprio | endereço público da loja | **a decidir** |
| R10 | Repositório GitHub | origem do deploy | **existe** (`mgcnew/pizzaria-shalon`) |
| R11 | Contas de Auth da equipe | login de Owner e atendentes | **falta criar** (opção A de A-20) |
| R12 | Impressora térmica 58 mm | comanda de produção | **existe, não identificada** |
| R13 | Aparelho do balcão (Android/Windows) | operar e imprimir | **a identificar** |

### Observação sobre a organização Supabase

A organização está hoje no **plano free** e já contém **dois projetos**
(`pizzaria-shalon-dev` e `pizzariashalon`, ambos em `sa-east-1`). Criar o
terceiro pode esbarrar em limite de projetos ativos do plano. Isso **não é
decisão deste gate**: entra na apresentação de planos do Gate 11.2, junto com
backup, pausa por inatividade, custo e impacto operacional.

---

## 2. Contas e serviços: o que existe × o que falta

### Já existe

- **GitHub** — `https://github.com/mgcnew/pizzaria-shalon`, com `origin/main`.
- **Organização Supabase** — plano free, dois projetos em `sa-east-1`:
  - `pizzaria-shalon-dev` (`gyifopivitrnzldirmdq`) — **DEV**;
  - `pizzariashalon` (`embpaodotujsxuaeptft`) — **descartável de replay**.
    Não é DEV, não é produção, não recebe dado real.

### Falta criar ou confirmar

| Item | Quem cria | Exige cartão | Observação |
|---|---|---|---|
| Projeto Supabase de produção | Marcelo | depende do plano | nome sugerido: `pizzaria-shalon-prod` |
| Projeto Google Cloud | Marcelo | **sim** | faturamento é pré-requisito das APIs |
| Conta/projeto Vercel | Marcelo | depende do plano | Hobby cobre tecnicamente; uso comercial é decisão |
| Domínio | Marcelo | **sim, se houver** | custo anual de registro |
| Contas de Auth da equipe | Marcelo | não | manualmente, no painel — opção A de A-20 |

---

## 3. Checklist de Marcelo (o que só ele pode fazer)

Nada aqui está autorizado no Gate 11.1; a lista existe para o gate seguinte.

- [ ] Decidir o plano Supabase, depois da comparação do Gate 11.2.
- [ ] Criar o projeto de produção, em `sa-east-1`, com senha de banco forte e
      guardada em gerenciador — **nunca** no repositório.
- [ ] Habilitar no Auth de produção a **proteção contra senha vazada**.
- [ ] Criar projeto no Google Cloud, habilitar faturamento e as duas APIs.
- [ ] Gerar a chave do Google e **restringi-la às duas APIs** (restrição por
      IP não se aplica: a Vercel não tem egresso estático).
- [ ] Configurar **alerta de orçamento** no Google Cloud antes do primeiro uso.
- [ ] Criar o projeto na Vercel e cadastrar as variáveis da seção 6.
- [ ] Decidir domínio próprio × subdomínio da Vercel.
- [ ] Criar as contas de Auth da equipe (poucas, manuais).
- [ ] Executar o bootstrap da seção 7, um passo por vez.
- [ ] Levar à Shalon o checklist da seção 4 e a ficha da seção 5.

---

## 4. Checklist da Shalon (o que Marcelo leva à proprietária)

Só o que **ainda não temos**. Nada aqui está no repositório hoje.

### 4.1 Obrigatório ANTES de montar o ambiente de produção

Sem estes itens o ambiente não pode ser configurado de forma correta.

1. **Endereço completo e exato da pizzaria** — logradouro, número,
   complemento, bairro, cidade, UF e CEP. É a origem de toda rota; endereço
   aproximado produz taxa errada.
2. **WhatsApp oficial** que aparece para o cliente.
3. **Horário de funcionamento real, dia a dia** — inclusive os dias fechados,
   e os dias em que a loja atravessa a meia-noite (ex.: 18h–02h).
4. **Regra de entrega**, que é dinheiro e portanto não se inventa:
   - até que distância entrega **sem precisar aprovar**;
   - até que distância entrega **com aprovação**;
   - a partir de onde **não entrega**;
   - o valor da taxa em cada faixa de distância.
5. **Tempo de preparo** informado ao cliente: mínimo e máximo, para entrega e
   para retirada.
6. **Formas de pagamento aceitas** e, para cartão/vale, **quais bandeiras**.
7. **Pix antecipado por chave**: existe? Se sim, tipo da chave, a chave e o
   nome do recebedor. Se não existe, também precisa ser dito — o sistema
   simplesmente não oferece.

### 4.2 Pode ser preenchido antes do go-live

Necessário para abrir, mas não bloqueia a criação do ambiente.

8. **Cardápio real completo**: categorias, sabores, tamanhos (fatias e quantos
   sabores cada tamanho aceita), preço de cada sabor em cada tamanho.
9. **Bordas** e o preço de cada uma por tamanho; e quais pizzas **não** aceitam
   determinada borda.
10. **Adicionais** e preço por tamanho; e se a pizzaria quer adicionais
    ligados ou desligados de forma geral.
11. **Combos**: o que entra em cada um e o preço próprio do combo.
12. **Fotos** dos produtos e dos banners de destaque.
13. **Promoções** que estarão valendo na abertura, com data de início e fim.
14. **Equipe**: nome de cada funcionário, se é entregador, e quem terá login.
15. **Caixa**: qual o fundo inicial habitual da gaveta.

### 4.3 O que NÃO precisamos pedir

Já está definido e não deve ser perguntado de novo: identidade visual, fluxo
de pedido, máquina de estados, regras de meio a meio, política de estorno,
separação entre venda registrada e dinheiro recebido, e o que é cortesia,
consumo interno ou perda.

---

## 5. Ficha de identificação da impressora

Preencher **antes** de decidir qualquer estratégia técnica. O documento `06`
descreve quatro caminhos possíveis (E1 a E4), e a escolha entre eles depende
inteiramente das respostas abaixo.

**Não decidir BLE × Bluetooth Clássico sem o equipamento real em mãos.**

| # | Campo | Resposta |
|---|---|---|
| 1 | Marca | |
| 2 | Modelo | |
| 3 | **Foto da etiqueta** traseira ou inferior | anexar |
| 4 | Tipos de conexão disponíveis | USB · Bluetooth · Wi-Fi · Serial |
| 5 | Existe **USB**? | sim / não |
| 6 | Existe **Bluetooth**? | sim / não — e o que a etiqueta ou o manual dizem |
| 7 | Largura do papel | 58 mm · outro |
| 8 | Aparelho usado no balcão | Android · Windows · os dois |
| 9 | Modelo e versão do aparelho do balcão | |
| 10 | **Como imprimem hoje?** | app do celular · programa no PC · não imprimem |
| 11 | Nome do app/programa usado hoje | |
| 12 | A impressora tem guilhotina ou é serrilha manual? | |
| 13 | Há uma segunda impressora? | |

A resposta de 5, 6, 8 e 10 é o que define o caminho: um aparelho Android que
já imprime por um app de terceiros é forte indício de **Bluetooth Clássico**,
que nenhum navegador alcança — e nesse caso a estratégia muda, com trabalho
ainda não estimado.

---

## 6. Mapa de secrets e variáveis

Contrato já existente em `.env.example`. **Nenhum valor real é preenchido
neste gate.**

| Variável | Visibilidade | Origem do valor | Quando existe |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | pública | projeto de produção | passo B1 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | pública | projeto de produção | passo B1 |
| `SHALON_CHECKOUT_ORIGIN_SECRET` | **servidor** | **gerado pela migration 0040 durante o replay** | passo B4 |
| `GOOGLE_MAPS_SERVER_KEY` | **servidor** | Google Cloud | passo B8 |

### Três avisos que não são formalidade

1. **O segredo de origem de produção será diferente do de DEV.** Ele é gerado
   aleatoriamente pela própria migration, nunca esteve no Git, e é lido com
   `select public.ler_segredo_do_servidor('checkout_origem')` por quem estiver
   autenticado no SQL Editor. Copiar o de DEV seria erro.
2. **`SUPABASE_SERVICE_ROLE_KEY` não entra em lugar nenhum** — nem na Vercel,
   nem em `.env`, nem no código (CLAUDE.md §13).
3. **Nada de segredo em variável `NEXT_PUBLIC_*`.** As duas públicas acima são
   públicas por natureza e protegidas por RLS; as outras duas não.

---

## 7. Sequência de bootstrap

Um passo por vez, cada um com seu gate. **Nenhum passo começa antes de o
anterior ter apresentado sua evidência.**

A ordem abaixo ajusta a sugerida no plano por três dependências reais:

- o **segredo de origem só existe depois do replay**, então as variáveis da
  Vercel só ficam completas depois dele;
- a **configuração da loja é feita pelas telas do `/admin`**, então o deploy
  precisa existir antes dela;
- **não existe Owner semeado** — nenhuma migration cria funcionário, usuário
  ou vínculo (os `insert` dessas tabelas vivem dentro das funções de domínio).
  O primeiro acesso é criado por SQL direto, deliberadamente.

---

### B0 — Contas e credenciais

- **Entrada:** decisão de plano (Gate 11.2); cartão para os serviços pagos.
- **Ação:** criar/confirmar as contas da seção 2.
- **Resultado:** acesso administrativo a Supabase, Google Cloud e Vercel.
- **Evidência:** login funcionando nos três painéis.
- **Rollback:** nenhuma criação de infraestrutura ainda; basta não prosseguir.

### B1 — Projeto Supabase de produção, vazio

- **Entrada:** B0.
- **Ação:** criar o projeto em `sa-east-1`, senha forte guardada em
  gerenciador. Habilitar a proteção contra senha vazada. **Não** restaurar
  backup, **não** clonar DEV.
- **Resultado:** projeto novo, banco sem esquema da aplicação.
- **Evidência:** `select count(*) from supabase_migrations.schema_migrations`
  devolve **0**; `public` sem as tabelas da aplicação.
- **Rollback:** apagar o projeto. Nada depende dele ainda.

### B2 — Replay das 109 migrations

- **Entrada:** B1 com evidência de banco vazio.
- **Ação:** aplicar as 109 migrations **na ordem do repositório**, sem pular,
  sem editar, sem reordenar.
- **Resultado:** esquema completo, papéis e permissões semeados, buckets
  criados, segredo de origem gerado.
- **Evidência:** a validação estrutural do passo B3.
- **Rollback:** apagar o projeto e recriar. É mais barato e mais confiável que
  desfazer migrations pela metade — e só é possível **porque não há dado real
  ainda**. Depois de B7 esta saída deixa de existir.

### B3 — Validação estrutural (gate rígido)

- **Entrada:** B2 concluído.
- **Ação:** conferir o banco novo contra a linha de base medida em DEV em
  24/09/2026. **Nenhum dado real entra antes de tudo isto bater.**

| Verificação | Esperado |
|---|---|
| Migrations aplicadas | 109 |
| Tabelas em `public` | 61 |
| Tabelas com RLS ativo | 61 |
| Tabelas com `force row level security` | 60 |
| Única sem `force` | `server_secrets` — **esperado**, a função definer a lê como dono; não "corrigir" |
| Policies em `public` | 141 |
| Policies em `storage.objects` | 9 |
| Funções em `public` | 151 |
| Permissões cadastradas | 39 |
| Papéis de sistema | 2 (Owner/Admin, Atendente) |
| Permissões do Owner/Admin | 39 |
| Permissões do Atendente | 18 |
| Formas de pagamento | 6 |
| Transições de estado | 30 |
| Buckets | 2 — `catalogo` público, `comprovantes` privado |
| `server_secrets` | 1 linha, valor **nunca impresso** |
| Pedidos, clientes, pagamentos, caixa, funcionários, usuários | **0 em todos** |
| `audit_logs` | 0 |
| `get_advisors` | sem alerta crítico |

- **Evidência:** a tabela acima conferida, e o smoke anônimo: nenhuma tabela
  interna legível sem sessão, RPCs públicas respondendo.
- **Rollback:** qualquer divergência **para o bootstrap**. Investigar antes de
  seguir; recriar o projeto se necessário.

### B4 — Segredo de origem e variáveis

- **Entrada:** B3 aprovado.
- **Ação:** ler o segredo gerado pelo replay e cadastrar as variáveis na
  Vercel (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SHALON_CHECKOUT_ORIGIN_SECRET`). `GOOGLE_MAPS_SERVER_KEY` fica pendente
  até B8.
- **Resultado:** ambiente de produção configurável.
- **Evidência:** as três variáveis presentes, nenhum `service_role` cadastrado.
- **Rollback:** remover as variáveis; nada foi publicado ainda.

### B5 — Primeiro acesso (Owner)

- **Entrada:** B4.
- **Ação:** criar no painel do Auth a conta da proprietária (opção A de A-20)
  e, por SQL no projeto de produção, criar o `employee` correspondente, o
  `app_user` vinculado e o `user_roles` apontando para Owner/Admin.
  **Não** implementar `service_role`, **não** desenvolver provisionamento
  automático.
- **Resultado:** existe alguém capaz de operar o `/admin`.
- **Evidência:** 1 employee, 1 app_user ativo, 1 papel Owner/Admin; login
  bem-sucedido depois de B6.
- **Rollback:** remover as três linhas e a conta do Auth.
- **Nota:** este é o único momento em que se escreve nessas tabelas por SQL.
  Todo acesso seguinte passa por `/admin/equipe`. **A-20 permanece aberta.**

### B6 — Deploy na Vercel

- **Entrada:** B4 (e B5 para poder entrar).
- **Ação:** criar o projeto na Vercel apontando para `main`, build de produção.
- **Resultado:** aplicação acessível em URL da Vercel.
- **Evidência:** build verde; `/` responde; `/admin` redireciona para login;
  Owner consegue entrar.
- **Rollback:** *instant rollback* da Vercel, ou despublicar o projeto.

### B7 — Configuração da loja e cardápio real

- **Entrada:** B6, mais os itens 1–7 da seção 4.1 e 8–13 da seção 4.2.
- **Ação:** pelas telas do `/admin`, cadastrar loja, horários, faixas de
  entrega, formas de pagamento, Pix, cardápio, bordas, adicionais, combos,
  fotos e promoções. **Sem fixture de demonstração.**
- **Resultado:** catálogo e configuração reais.
- **Evidência:** cardápio público renderiza o cardápio verdadeiro; preços e
  faixas conferidos **com a proprietária**; `loja_publica()` sem coordenada.
- **Rollback:** a partir daqui recriar o projeto deixa de ser barato. Correção
  passa a ser pelas próprias telas, com auditoria. **Fazer backup ao final.**

### B8 — Google Maps

- **Entrada:** B0; endereço exato da loja (item 1).
- **Ação:** habilitar Geocoding e Routes, gerar a chave, restringi-la às duas
  APIs, cadastrar `GOOGLE_MAPS_SERVER_KEY` na Vercel, configurar alerta de
  orçamento.
- **Resultado:** distância real de rota disponível.
- **Evidência:** checkout de entrega devolve distância e taxa coerentes com
  trajetos conhecidos da Shalon; **falha de cálculo não produz R$ 0,00** —
  a entrega fica indisponível e a retirada continua funcionando.
- **Rollback:** remover a variável. A loja opera só com retirada até voltar.
- **Fecha A-05** quando a API real for exercitada e conferida.

### B9 — Storage com identidade real

- **Entrada:** B7; um segundo acesso **sem** `finance.*`, criado pelo
  `/admin/equipe`.
- **Ação:** upload de imagem de catálogo pela Owner; anexar e **remover um
  comprovante pela API de Storage**; com o acesso restrito, tentar listar,
  baixar e remover em `financeiro/`.
- **Resultado:** as três tentativas do acesso restrito **falham**.
- **Evidência:** respostas negadas pela API, não pela interface.
- **Rollback:** remover os arquivos de teste.
- **Fecha PI-F10-01.**

### B10 — E2E de produção

- **Entrada:** B7, B8, B9.
- **Ação:** o roteiro de `05` §15.2 com dado real, mais o que ficou declarado
  como não executado: **concorrência multi-sessão real** (dois navegadores
  autenticados disputando o mesmo aceite, dois fechamentos do mesmo caixa,
  dois acertos da mesma saída) e o **TOCTOU de A-21** (duas sessões disputando
  o mesmo papel).
- **Resultado:** ciclo completo funcionando; disputas resolvidas com um
  vencedor e mensagem clara ao perdedor.
- **Evidência:** pedido concluído, caixa fechado batendo com o dinheiro,
  relatório coerente, histórico do cliente correto, e um pedido de teste
  cancelado/estornado para validar histórico.
- **Rollback:** estornar e cancelar os pedidos de teste **pelos comandos do
  domínio**, nunca por `delete`. Eles ficam no histórico, e isso é correto.

### B11 — Impressora 58 mm

- **Entrada:** ficha da seção 5 preenchida; B10.
- **Ação:** escolher a estratégia (E1–E4 de `06`) conforme o equipamento real
  e executar os testes físicos obrigatórios.
- **Resultado:** comanda sai legível, com acentuação correta e quebra de linha
  onde o domínio decidiu; reimpressão registrada; **com a impressora desligada
  a aplicação não afirma sucesso**.
- **Evidência:** papel impresso, conferido à mão.
- **Rollback:** operar com comanda manuscrita até resolver. Não bloqueia o
  resto do sistema.
- **Maior risco técnico da fase.**

### B12 — Checklist pré-go-live

- **Entrada:** B3 a B11.
- **Ação:** `get_advisors` sem alerta crítico; RLS conferido; proteção contra
  senha vazada testada com uma senha sabidamente vazada; nenhum segredo em
  `NEXT_PUBLIC_*`; nenhum `service_role` no bundle; smoke anônimo repetido;
  **backup verificado**.
- **Resultado:** autorização para virar.
- **Evidência:** checklist assinado por Marcelo.
- **Rollback:** não virar.

### B13 — Go-live

- **Entrada:** B12 aprovado; treinamento da equipe feito (`05` §15.3).
- **Ação:** apontar o domínio, **abrir a loja no sistema**, avisar os clientes.
- **Resultado:** operação real.
- **Evidência:** primeiro pedido de cliente real concluído ponta a ponta.
- **Rollback:** seção 8.

---

## 8. Rollback operacional

Definido **antes** de virar, não durante o incidente.

### Três camadas, independentes

| Camada | Como se volta | Custo |
|---|---|---|
| **Frontend** | *instant rollback* da Vercel para o deploy anterior | segundos |
| **Banco** | **migration de reversão nova** — nunca editar nem desfazer aplicada | minutos a horas |
| **Operação** | fechar a loja no sistema e voltar ao WhatsApp/papel | imediato |

A terceira é a que salva a noite: **fechar a loja no sistema não derruba o
site** e não perde nada — o cardápio continua visível e o pedido para de
entrar. É a primeira alavanca, não a última.

### Gatilhos explícitos de abortar

Qualquer um destes, durante a virada, interrompe o go-live:

1. pedido não é criado, ou é criado sem item/valor;
2. **taxa de entrega sai R$ 0,00** por falha de cálculo;
3. pagamento registrado não bate com o dinheiro;
4. caixa não fecha, ou fecha com diferença inexplicada;
5. comanda não sai e não há alternativa manual combinada;
6. qualquer acesso enxerga o que não deveria.

### Janela e ponto sem retorno

- A virada acontece com a **loja fechada**.
- Até **B6**, recriar o projeto do zero é barato: não há dado real.
- A partir de **B7**, há cardápio e configuração reais: a saída passa a ser
  backup + correção por migration nova.
- A partir de **B13**, há pedido de cliente real: **não se apaga nada**.
  Correção é sempre para a frente, com estorno, motivo e responsável.

---

## 9. Decisões ainda pendentes

| # | Decisão | De quem | Quando |
|---|---|---|---|
| D1 | Plano Supabase, depois da comparação | Marcelo | Gate 11.2 |
| D2 | Domínio próprio × subdomínio da Vercel | Marcelo | antes de B6 |
| D3 | Plano da Vercel | Marcelo | antes de B6 |
| D4 | Faixas de entrega, raios e taxas | **Shalon** | antes de B7 |
| D5 | Pix antecipado: existe ou não | **Shalon** | antes de B7 |
| D6 | Quem da equipe terá login | **Shalon** | antes de B9 |
| D7 | Estratégia da impressora (E1–E4) | Marcelo, **depois** da ficha | antes de B11 |
| D8 | Operação paralela × corte seco | Marcelo + Shalon | antes de B13 |
| D9 | Quando parar de anotar no papel | **Shalon** | depois de B13 |
| D10 | A-20: manter opção A ou evoluir | Marcelo | depois do go-live |

**A-20 permanece aberta.** A opção A — criar manualmente as poucas contas
necessárias e vinculá-las pelo mecanismo existente — é o plano para o go-live
da V1. Não implementar `service_role` nem provisionamento automático sem nova
autorização.
