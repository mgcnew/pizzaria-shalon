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

## 0.1 Premissas de infraestrutura — decididas em 24/09/2026

Estas premissas são decisão do responsável pelo produto e **não voltam a ser
questionadas** a cada gate.

### Supabase: plano Free no go-live inicial

Produção nasce no **Free**. Pro **não será contratado agora**, e não deve ser
reapresentado como requisito para avançar.

O que isso implica, registrado como **limitação conhecida**, não como bloqueio:

| Limitação do Free | Consequência real | Mitigação adotada |
|---|---|---|
| **Sem backup diário incluído** | perda de dados não tem rede de proteção da plataforma | **backup externo próprio** — seção 10 |
| **Pausa após 1 semana de inatividade** | projeto parado sai do ar | operação diária mantém o projeto ativo; entre o bootstrap e o go-live, conferir antes de cada passo e despausar se preciso |
| **Limite de 2 projetos ativos** (pausados não contam) | não cabem DEV + descartável + PROD ao mesmo tempo | sequência de slots da seção 9 |
| **500 MB de banco** | suficiente para a V1; cresce com pedidos e auditoria | acompanhar o tamanho na estabilização |
| **1 GB de Storage** | fotos de produto e comprovantes disputam o mesmo espaço | pipeline do `sharp` já otimiza antes de enviar |
| **5 GB de egress/mês** | o bucket `catalogo` é **público**: cada visitante que carrega foto consome egress | acompanhar; se apertar, é sinal de que o plano precisa ser revisto — decisão futura, não de agora |
| **Sem PITR** | não há retorno a um instante arbitrário | o backup externo define o quanto se pode perder |

### Vercel: permanecer no deployment e no plano atuais

**O sistema já está publicado.** Portanto **não existe a tarefa "criar projeto
Vercel"** neste runbook. O que existe é **inventariar o que está no ar e
preservá-lo** — ver B6.

Pro **não será contratado agora**. A restrição de uso comercial encontrada na
documentação do plano Hobby fica registrada como **pendência de hospedagem e
licenciamento** em `06-PENDENCIAS-VALIDACAO-PRODUCAO.md`, para ser resolvida
por decisão de Marcelo — e **não bloqueia** artificialmente o avanço por uma
contratação que ele decidiu não fazer.

### Domínio: desvinculado de qualquer contratação

Marcelo pode permanecer no endereço atual da Vercel ou registrar um domínio
quando decidir. A decisão **não depende** de plano pago e **não bloqueia** o
go-live.

### Um detalhe de build que muda o procedimento

`next.config.ts` deriva `images.remotePatterns` de `NEXT_PUBLIC_SUPABASE_URL`
**em tempo de build**. Trocar o projeto Supabase apontado pelo deployment
**exige rebuild**: mudar a variável sem reimplantar deixaria as imagens do
catálogo bloqueadas. Isso está incorporado a B6.

---

## 1. Inventário de recursos necessários

| # | Recurso | Para quê | Situação |
|---|---|---|---|
| R1 | Organização Supabase | hospedar o projeto de produção | **existe** |
| R2 | Projeto Supabase de **produção** | banco, Auth, Storage | **falta criar** |
| R3 | Plano da organização Supabase | — | **decidido: Free** (24/09/2026) |
| R4 | Projeto Google Cloud | Geocoding API + Routes API | **falta criar** |
| R5 | Conta de faturamento Google | habilitar as APIs de rota | **falta criar** |
| R6 | Chave server-side do Google Maps | distância real de rota | **falta gerar** |
| R7 | Conta Vercel | build e hospedagem do front | **existe** |
| R8 | Projeto Vercel | deploy | **existe e está no ar** — inventariar, não recriar |
| R9 | Domínio próprio | endereço público da loja | **opcional**, sem vínculo com plano |
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
| Projeto Supabase de produção | Marcelo | **não** | Free, `sa-east-1`, `pizzaria-shalon-prod` |
| Projeto descartável do ensaio | Marcelo | **não** | Free, temporário, removido depois — seção 9 |
| Projeto Google Cloud | Marcelo | **sim** | faturamento é pré-requisito das APIs |
| Contas de Auth da equipe | Marcelo | não | manualmente, no painel — opção A de A-20 |
| Domínio | Marcelo | **sim, se houver** | **opcional**, sem prazo e sem vínculo com plano |

**Não entra nesta lista:** conta e projeto Vercel, que já existem; e
contratação de plano, que Marcelo decidiu não fazer agora.

---

## 3. Checklist de Marcelo (o que só ele pode fazer)

A lista existe para os gates seguintes; nada aqui está autorizado antes do
gate que o autorizar explicitamente.

**Antes de criar produção**

- [ ] Preservar as evidências atuais e **remover** o descartável de 51/109.
- [ ] Criar o descartável do ensaio, rodar o **replay das 109** e o **B3**.
- [ ] Registrar a evidência no Git e **remover** o ensaio.

**Produção**

- [ ] Criar `pizzaria-shalon-prod` em `sa-east-1`, **no Free**, com senha de
      banco forte em gerenciador — **nunca** no repositório.
- [ ] Habilitar no Auth de produção a **proteção contra senha vazada**.
- [ ] Rodar o replay e o B3 novamente, agora em produção.
- [ ] Criar as contas de Auth da equipe (poucas, manuais) e fazer o B5.

**Deployment**

- [ ] **Inventariar** o deployment Vercel existente (B6.1) — sem alterar nada.
- [ ] Anotar os valores atuais das variáveis **antes** de sobrescrever.
- [ ] Repontar e **reimplantar** (B6.2).

**Google**

- [ ] Criar projeto no Google Cloud, habilitar faturamento e **apenas**
      Geocoding e Routes.
- [ ] Gerar a chave e **restringi-la às duas APIs** (restrição por IP não se
      aplica: a Vercel não tem egresso estático).
- [ ] Configurar **alerta de orçamento** e **cota defensiva por API** antes do
      primeiro uso.

**Backup e go-live**

- [ ] Montar o backup externo da seção 10 e **executar uma restauração real**.
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

- **Entrada:** nenhuma contratação. Supabase permanece **Free**; Vercel
  permanece no plano e no deployment atuais.
- **Ação:** confirmar acesso administrativo ao Supabase e à Vercel. O Google
  Cloud é o único serviço novo, e só é criado em B8.
- **Resultado:** acesso administrativo confirmado.
- **Evidência:** login funcionando nos painéis.
- **Rollback:** nenhuma infraestrutura foi criada; basta não prosseguir.

### B1 — Projeto Supabase de produção, vazio

**Pré-requisito de slot:** o Free admite **2 projetos ativos**. Antes deste
passo, a sequência da seção 9 precisa ter liberado um slot.

- **Entrada:** B0; um slot livre; ensaio de replay da seção 9 aprovado.
- **Ação:** criar `pizzaria-shalon-prod` em `sa-east-1`, **no plano Free**,
  com senha de banco forte guardada em gerenciador. Habilitar a proteção
  contra senha vazada. **Não** restaurar backup, **não** clonar DEV, **não**
  clonar o descartável.
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

### B5 — Primeiro acesso (Owner), por operação administrativa deliberada

Nenhuma migration cria funcionário, usuário ou vínculo: os `insert` dessas
tabelas vivem dentro das funções de domínio. O primeiro Owner é, portanto, um
**ato administrativo único**, executado uma vez, à mão, com a conta do Auth já
existente.

#### Regras que valem para este passo

1. **Usuário real não entra em migration.** Nunca.
2. **Não se versiona UUID, e-mail, senha nem qualquer identificador pessoal.**
   O que este documento contém é o **procedimento parametrizado**; os valores
   vivem só no momento da execução.
3. Depois deste passo, **SQL direto deixa de ser mecanismo normal de gestão de
   acesso**. Todo acesso seguinte passa por `/admin/equipe`
   (`vincular_acesso`, `definir_papeis`, `definir_acesso`).
4. **Não** implementar `service_role`. **Não** desenvolver provisionamento
   automático sem nova autorização. **A-20 permanece aberta.**

#### Pré-condição

- **Entrada:** B4 concluído; conta de Auth da proprietária **já criada
  manualmente** no painel do projeto de produção (opção A de A-20).

#### Procedimento, na ordem

1. **Conta Auth real criada manualmente** no painel — não por código.
2. **Obter o UUID dessa conta** pelo painel/administração autorizada. Ele é
   parâmetro de execução; não é anotado neste documento nem em nenhum arquivo
   do repositório.
3. **Criar o `employee` e vincular o `app_user`** respeitando as invariantes
   já existentes das tabelas (funcionário ativo, usuário ativo, vínculo único).
4. **Atribuir exclusivamente o papel Owner/Admin de sistema** — nenhum outro
   papel, nenhum papel customizado.
5. **Confirmar 39/39 permissões efetivas** para esse usuário.
6. **Confirmar login** pela aplicação, depois de B6.
7. **Confirmar acesso administrativo** — o `/admin` abre e responde.
8. **Confirmar que nenhuma outra conta recebeu papel**: exatamente 1 linha em
   `user_roles` no banco inteiro.
9. **Registrar operacionalmente que foi bootstrap inicial** — ver abaixo.

#### Forma parametrizada

Executada no SQL Editor do projeto de produção, com os valores fornecidos no
momento. Os nomes entre `:` são **parâmetros**, não conteúdo:

```
:auth_uuid        -- UUID da conta criada no passo 1
:nome_completo    -- nome da proprietária, como ela quer ser identificada
```

O ato consiste em: inserir o `employee` correspondente a `:nome_completo` como
`owner` ativo; inserir o `app_user` ligando `:auth_uuid` a esse employee, ativo;
e inserir uma única linha em `user_roles` apontando para o papel de sistema
`Owner/Admin` — tudo na mesma transação, de modo que ou os três existem ou
nenhum existe.

#### Auditoria: registrada de verdade, sem ator inventado

`public.log_audit` já cobre este caso. Quando `current_app_user_id()` é nulo —
que é exatamente a situação do SQL Editor, onde não há sessão de usuário da
aplicação — ela grava `actor_type = 'system'` com `actor_user_id` e
`actor_employee_id` **nulos**. O esquema aceita isso: o `check` de `actor_type`
admite `user`, `system` e `customer`, e as colunas de ator são nuláveis.

Portanto o bootstrap **é auditável honestamente**, e deve ser auditado: uma
chamada a `log_audit` na mesma transação, com ação própria de bootstrap,
entidade `app_users`, o id criado, e no motivo a frase que identifica o ato
como provisionamento inicial do primeiro Owner.

**Não há exceção de bootstrap a documentar, e nenhum ator é falsificado:** o
ator é o sistema, porque foi mesmo o sistema — não havia usuário da aplicação
para ser ator, e é essa a verdade registrada.

#### Evidência de sucesso

- 1 `employee` ativo, 1 `app_user` ativo, **exatamente 1** linha em
  `user_roles`, apontando para Owner/Admin;
- 39 de 39 permissões efetivas para esse usuário;
- nenhuma outra conta com papel;
- login e `/admin` funcionando (conferido depois de B6);
- 1 registro em `audit_logs` com `actor_type = 'system'` marcando o bootstrap.

#### Rollback

Remover, na ordem inversa e em transação, a linha de `user_roles`, o
`app_user` e o `employee`; e apagar a conta no painel do Auth. O registro de
auditoria do bootstrap **permanece** — auditoria não se apaga (CLAUDE.md §33),
e um bootstrap desfeito é fato tão relevante quanto um bem-sucedido.

### B6 — Deployment Vercel: inventariar e repontar

**Não se cria projeto aqui. Ele já existe e está no ar.** O ato é trocar para
onde ele aponta, preservando o que funciona.

#### B6.1 — Inventário, antes de mudar qualquer coisa

Levantar e **registrar** (sem copiar valores de segredo):

1. **qual projeto Vercel** hospeda a aplicação — nome e conta/time;
2. **repositório e branch** conectados — confirmar que é `mgcnew/pizzaria-shalon`, branch `main`;
3. **quais ambientes existem** — Production e Preview, e o que dispara cada um;
4. **inventário das variáveis por ambiente** — **apenas os nomes**, nunca os
   valores: quais existem, em que ambiente, e quais faltam da seção 6;
5. **qual endereço está em uso hoje** — domínio da Vercel ou domínio próprio;
6. **qual deployment está em Production agora** — data e commit;
7. **confirmar que o rollback instantâneo está disponível** e qual é o
   deployment anterior conhecido-bom.

**Evidência:** o inventário escrito, com os sete itens respondidos.

#### B6.2 — Repontar para produção

- **Entrada:** B6.1; B4 concluído (variáveis de PROD em mãos); B5 feito.
- **Ação:** **anotar os valores atuais das variáveis antes de sobrescrever**
  (são o rollback); atualizar `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SHALON_CHECKOUT_ORIGIN_SECRET` no
  ambiente de Production; **reimplantar**.
- **Por que o rebuild é obrigatório:** `next.config.ts` deriva
  `images.remotePatterns` de `NEXT_PUBLIC_SUPABASE_URL` **em tempo de build**.
  Trocar a variável sem reimplantar deixa as imagens do catálogo bloqueadas.
- **Resultado:** o mesmo endereço, agora servindo o banco de produção.
- **Evidência:** build verde; `/` responde; **imagens do catálogo carregam**;
  `/admin` redireciona para login; o Owner de B5 entra; nenhuma tabela interna
  legível sem sessão.
- **Rollback:** restaurar os valores anotados das variáveis **e** acionar o
  *instant rollback* para o deployment anterior conhecido-bom. As duas coisas,
  na ordem — variável sem redeploy não volta o build.

> **Consequência de preservar o deployment:** enquanto as variáveis apontarem
> para DEV, o que está publicado serve DEV. O momento em que isso muda é
> **aqui**, e é o ponto mais próximo de um cutover técnico no runbook.

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

## 9. Ensaio do replay e uso dos dois slots do Free

### Por que existe este ensaio

O projeto descartável atual, `pizzariashalon` (`embpaodotujsxuaeptft`), parou
em **51 das 109 migrations** — última versão `20260922202055`, 58 tabelas. Ele
**não comprova** que o esquema atual aplica limpo em banco vazio. Sem o
ensaio, a primeira execução real das 109 seria **direto em produção**, o que
contraria o princípio do bootstrap.

O descartável **não será usado como produção** e continua sendo recurso
temporário, nunca infraestrutura permanente.

### Zerar o atual ou criar outro?

**Criar outro é tecnicamente mais seguro**, e a razão é o que se quer provar.

Zerar à mão significa derrubar objetos do esquema, limpar
`supabase_migrations.schema_migrations`, remover buckets e objetos de Storage
e reverter o que o Auth tiver criado. Sempre sobra algo: extensões já
instaladas, tipos, papéis, estado do schema `auth`, resíduo em `storage`. Um
replay sobre essa base prova a propriedade errada — "aplica sobre um banco
parcialmente montado" — e é justamente a propriedade que **não** nos
interessa.

O que precisamos provar é **"aplica em banco virgem"**, e só um projeto recém-
criado é virgem. Some-se que apagar e recriar custa minutos e nenhum dado —
ele tem 0 pedidos, 0 clientes, 0 pagamentos, 0 funcionários e 0 usuários.

> **Nota lateral:** aplicar as 58 migrations que faltam ao descartável atual
> provaria **aplicação incremental de 51 → 109**, que é outra propriedade,
> útil mas não substituta. Não está no caminho crítico.

### Sequência com dois slots

Em nenhum momento há três projetos ativos.

| # | Ato | Slots ativos depois |
|---|---|---|
| 1 | Estado inicial | DEV + descartável **(2/2)** |
| 2 | **Preservar evidências** do que existe hoje | 2/2 |
| 3 | **Remover** o descartável atual (51/109, sem dado) | DEV **(1/2)** |
| 4 | **Criar** descartável novo, Free, `sa-east-1` | DEV + ensaio **(2/2)** |
| 5 | **Replay das 109** no ensaio | 2/2 |
| 6 | **B3 completo** no ensaio | 2/2 |
| 7 | **Registrar a evidência** no Git | 2/2 |
| 8 | **Remover** o ensaio | DEV **(1/2)** |
| 9 | **Criar `pizzaria-shalon-prod`** | DEV + PROD **(2/2)** |
| 10 | **Replay das mesmas 109** em PROD | 2/2 |
| 11 | **B3 completo** em PROD | 2/2 |

**Estado estável final: DEV + PROD.** É o regime permanente, e ele consome os
dois slots.

### Consequência a aceitar desde já

Depois do go-live **não sobra slot para ensaio**. Todo ensaio futuro de
migration exigirá pausar DEV temporariamente (projeto pausado não conta no
limite) ou remover um projeto. Isso é limitação do Free, está aceito, e fica
registrado para não virar surpresa no meio de uma correção urgente.

### Pausar em vez de remover?

Pausar também libera slot. Para o **descartável atual** isso não traz ganho:
ele não guarda evidência. Para **DEV**, pausar é a saída preferível se um dia
for preciso abrir espaço — ele guarda histórico de trabalho e pode ser
despausado.

---

## 10. Backup externo, no plano Free

O Free **não inclui backup diário nem PITR**. Como produção nasce nele, a rede
de proteção é nossa. Esta seção é **proposta**; nada foi implementado.

### Premissa

**Nenhuma senha, string de conexão ou URL de banco entra no Git.** Elas vivem
em gerenciador de senhas e, quando houver automação, em variável de ambiente
da máquina que executa — nunca em arquivo versionado.

### O que precisa ser salvo

Duas coisas, e **as duas importam**:

1. **O banco** — pedidos, pagamentos, caixa, financeiro, clientes, auditoria.
   Dump lógico completo.
2. **O Storage** — o bucket `comprovantes` guarda **evidência financeira**, e
   `catalogo` guarda as fotos. **Dump de banco não leva arquivo junto.**
   Esquecer isto é o erro clássico.

### Proposta para a V1, deliberadamente simples

| Item | Proposta |
|---|---|
| **Ferramenta** | `pg_dump` (ou `supabase db dump`) para o banco; download dos objetos para o Storage |
| **Frequência** | **diária**, ao fim do expediente, depois do fechamento do caixa |
| **Retenção** | **7 diários + 4 semanais**. Um mês de janela, volume pequeno |
| **Onde fica** | **fora do Supabase**: máquina de Marcelo **mais** uma segunda cópia — disco externo ou nuvem pessoal. Uma cópia só não é backup |
| **Proteção** | arquivo **cifrado** antes de sair da máquina; pasta não pública; nunca em repositório |
| **Verificação** | conferir que o arquivo não está vazio e que o tamanho é plausível — backup que ninguém olha costuma estar quebrado |

### Procedimento de restauração

1. Criar um projeto Supabase **temporário** (ou um Postgres local).
2. Restaurar o dump nele.
3. Conferir contagens contra o dia do backup: pedidos, pagamentos, caixa,
   `audit_logs`.
4. Restaurar os arquivos do Storage e abrir **um comprovante** para conferir
   que o conteúdo veio íntegro.
5. Só então considerar o backup válido.

> Restaurar em produção é o **último** recurso, e é decisão de Marcelo no
> momento do incidente — não procedimento automático.

### Teste real obrigatório antes do go-live

**Pelo menos uma restauração completa precisa ser executada de verdade**,
com o roteiro acima, antes de B13. Backup nunca testado é suposição, não
proteção — é a mesma regra que valeu para o resto da Fase 10.

⚠️ Este teste consome um slot temporariamente. Encaixá-lo **antes** de criar
PROD, ou pausar DEV enquanto dura.

### O que esta proposta não é

Não é backup contínuo, não é PITR e não elimina perda. Com dump diário, o pior
caso é **perder o movimento de um dia**. Isso é aceitável para a V1 por
decisão de plano; se deixar de ser, a conversa é sobre o plano, não sobre o
procedimento.

---

## 11. Decisões ainda pendentes

| # | Decisão | De quem | Quando |
|---|---|---|---|
| ~~D1~~ | ~~Plano Supabase~~ | — | ✅ **decidido 24/09/2026: Free.** Não reapresentar Pro |
| ~~D2~~ | ~~Plano da Vercel~~ | — | ✅ **decidido 24/09/2026: manter o atual.** Uso comercial do Hobby virou pendência em `06` |
| D3 | Domínio próprio × endereço atual da Vercel | Marcelo | **sem prazo** — não bloqueia o go-live |
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
