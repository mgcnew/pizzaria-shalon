# 00 — LOG DE DECISÕES
## Sistema de Gestão e Pedidos — Pizzaria Shalon

**Versão:** 1.0
**Status:** Log cronológico — vivo, atualizado a cada decisão
**Natureza:** registro de rastreabilidade

---

## O que este documento é

Um **índice cronológico** das decisões tomadas durante o projeto: o que foi decidido, quando, por quê, e onde a decisão está formalizada.

## O que este documento NÃO é

- **Não é fonte normativa.** As fontes de verdade continuam sendo `01-DOCUMENTO-MESTRE.md` (funcional), `02-MODELO-DADOS-SUPABASE.md` (dados), `03-RLS-RBAC-SEGURANCA.md` (segurança), `04-REGRAS-NEGOCIO.md` (invariantes), `05-PLANO-IMPLEMENTACAO.md` (execução) e `CLAUDE.md` (governança).
- **Não substitui nem resume** nenhum documento normativo.
- Em caso de divergência entre este log e um documento normativo, **o documento normativo prevalece** e este log deve ser corrigido.

Cada entrada aponta para a seção normativa correspondente. A decisão vale pelo que está escrito lá, não pelo resumo aqui.

---

# Decisões registradas

## 2026-09-17 — Bloco de reconciliação documental

Contexto: conclusão da **Fase 0 — Preparação e Auditoria** (`05-PLANO-IMPLEMENTACAO.md` §4). A auditoria identificou 11 conflitos entre o design aprovado e a documentação (C1–C11) e 8 divergências documentais (D1–D8). As decisões abaixo resolvem os conflitos normativos e autorizam a reconciliação.

---

### D-2026-09-17-01 — Papéis, rótulos e mecanismo de autorização

**Decisão:** `Owner/Admin` e `Atendente` são os **papéis conceituais** do sistema. Os nomes exibidos na interface podem ser amigáveis e tornar-se configuráveis posteriormente — por exemplo "Proprietária" e "Balconista", como no design aprovado. **O nome textual do cargo nunca é mecanismo de autorização**: a decisão de autorizar depende exclusivamente da permissão semântica efetiva do usuário no momento da operação.

**Motivo:** o design aprovado deriva permissão do nome do cargo (`D.perms[state.cargo]`), o que não é seguro nem extensível a papéis customizados.

**Formalizada em:** `CLAUDE.md` §14 · `04-REGRAS-NEGOCIO.md` RN-RBAC-002 e RN-RBAC-004 · `03-RLS-RBAC-SEGURANCA.md` §3.2 e §32

**Impacto no design:** rótulos visíveis preservados; o mecanismo por trás muda. Sem impacto visual.

---

### D-2026-09-17-02 — Entrega por distância de rota (supera entrega por bairro)

**Decisão:** prevalece a regra mais recente — **distância real de rota viária**, faixas configuráveis por km, raio de aprovação automática e distância máxima atendida. A cobrança estrutural por bairro está **superada**.

**Motivo:** conflito C1. O design público usa `<select>` de bairro com taxa fixa e o admin afirma textualmente *"Taxa por região, sem GPS ou cálculo por distância"*, ambos anteriores à consolidação V2.

**Formalizada em:** `01-DOCUMENTO-MESTRE.md` §79.2 (§15 marcada como superada) · `04-REGRAS-NEGOCIO.md` RN-ENT-006 a RN-ENT-014 · `03-RLS-RBAC-SEGURANCA.md` §15 · `CLAUDE.md` §20

**Impacto no design:** a etapa de endereço do checkout e a seção "Bairros e taxas" das Configurações precisarão de adaptação nas Fases 3 e 5, dentro do design system aprovado e com aprovação prévia.

---

### D-2026-09-17-03 — Combos fixos na V1

**Decisão:** prevalece a regra mais recente — **combos fixos, sem substituição de componentes** e sem grupos de escolha.

**Motivo:** conflito C2. O sheet de produto do design oferece "Escolha o refrigerante" dentro do combo.

**Formalizada em:** `01-DOCUMENTO-MESTRE.md` §79.5 · `04-REGRAS-NEGOCIO.md` RN-COMBO-001 a RN-COMBO-008 · `02-MODELO-DADOS-SUPABASE.md` §5.11 · `CLAUDE.md` §18

**Impacto no design:** os grupos de escolha saem do sheet de produto na Fase 4, com aprovação prévia.

---

### D-2026-09-17-04 — Sabor é produto; Tradicional e Brotinho são tamanhos

**Decisão:** **cada sabor comercial de pizza é um produto**. Tradicional e Brotinho são **tamanhos** configuráveis e reutilizáveis, não categorias. Onde a palavra "sabores" aparece em listas de cadastro ou de domínios nos documentos, ela designa área funcional — **não** uma entidade independente do modelo de dados.

**Motivo:** conflito C3. O design mantém `flavors{}` como dicionário separado e trata Brotinhos como categoria.

**Formalizada em:** `01-DOCUMENTO-MESTRE.md` §79.3 (§6, §7, §62 e §67 anotadas) · `04-REGRAS-NEGOCIO.md` RN-PIZZA-001 a RN-PIZZA-006 · `02-MODELO-DADOS-SUPABASE.md` §5.2, §5.3, §5.4

**Impacto no design:** a estrutura de categorias do cardápio público muda na Fase 4, com aprovação prévia.

---

### D-2026-09-17-05 — Precedência das regras documentais sobre o design (C4–C8)

**Decisão:** nos demais conflitos identificados na auditoria, **as regras documentais mais recentes prevalecem**:

| Conflito | Regra vigente |
|---|---|
| C4 — estados do pedido | 14 estados conceituais (design tem 8) — RN-STATE-001 a RN-STATE-010 |
| C5 — Pix | Pix na maquininha ≠ Pix antecipado por chave — RN-PGTO-007 a RN-PGTO-011 |
| C6 — entregas | Saída de entrega agrupando pedidos — RN-RUN-001 a RN-RUN-007 |
| C7 — caixa | Sangria e Reforço como operações distintas de Despesa — RN-CAIXA-008/009/010 |
| C8 — movimentos internos | Cortesia e Perda/Descarte como classificações próprias — RN-CORT-001, RN-PERDA-001 |

**As telas faltantes não serão implementadas agora** e o Claude Design **não será reaberto** neste momento. Quando cada fase chegar, as adaptações necessárias serão propostas utilizando rigorosamente o design system aprovado, e aguardarão aprovação antes da implementação.

**Formalizada em:** `04-REGRAS-NEGOCIO.md` (regras citadas) · `01-DOCUMENTO-MESTRE.md` §79.12, §79.15, §79.17, §79.18, §79.19

---

### D-2026-09-17-06 — Reconciliação documental executada

**Decisão:** autorizada e executada a reconciliação das divergências D1–D8, com três garantias: **nenhuma regra vigente removida, nenhum documento resumido ou reorganizado, todo texto superado preservado como registro histórico** sob marcador de supersessão.

**Ações executadas:**

1. `git init`, `.gitignore` e commit inicial como ponto de restauração — `CLAUDE.md` §42, `05-PLANO-IMPLEMENTACAO.md` §23
2. `docs/01-DOCUMENTO-MESTRE-ATUALIZADO.md` renomeado para `docs/01-DOCUMENTO-MESTRE.md` (corrige 8 referências de uma vez) — **D1**
3. `02-MODELO-DADOS-SUPABASE.md`: 6 correções de cabeçalho e ponteiros — **D2**
4. `03-RLS-RBAC-SEGURANCA.md`: 4 correções de cabeçalho e ponteiros — **D3**
5. `01-DOCUMENTO-MESTRE.md`: 8 marcadores inseridos (§2.4, §6, §7, §11, §15, §62, §67, §74) — **D5, D6**
6. `01-DOCUMENTO-MESTRE.md` §79.28: sequência documental renumerada de 03–06 para 02–05 e marcada como concluída — **D4**
7. `CLAUDE.md`: §14 reescrita, nova §44-A criada, cabeçalho de versão acrescentado — **D8**
8. `05-PLANO-IMPLEMENTACAO.md` §23: checkboxes de Git marcados — **D7**
9. Este arquivo criado

**Observação sobre `02-SEGURANCA-PERMISSOES.md`:** esse arquivo nunca existiu no repositório. O conteúdo que ele prometia está integralmente em `03-RLS-RBAC-SEGURANCA.md`, para onde as citações foram redirecionadas.

---

### D-2026-09-17-07 — Stack arquitetural da V1

**Decisão:** stack oficial aprovada.

| Camada | Decisão |
|---|---|
| Framework | Next.js com App Router |
| Linguagem | TypeScript em modo strict |
| UI | React |
| Backend / Banco / Auth / Storage | Supabase |
| Gestor de pacotes | npm |
| Estilização | Tailwind CSS |
| Deploy previsto | Vercel |

**Sobre versões:** **nenhuma versão foi fixada**. Em particular, **não assumir
Next.js 15** nem qualquer número citado na auditoria da Fase 0 — aquilo foi
proposta, não decisão. Na preparação da Fase 1: verificar as versões estáveis e
mutuamente compatíveis disponíveis no momento da instalação, instalar com `npm`
deixando o `package-lock.json` fixar as versões, e registrar as versões
efetivamente adotadas em `CLAUDE.md` §44-A.1 e aqui.

**Sobre Tailwind:** a escolha **não autoriza redesign**. Tailwind é mecanismo de
implementação. Tokens, cores, tipografia, espaçamentos, raios, temas, estados e
demais decisões visuais do Claude Design continuam sendo a referência. Os tokens
do design são a **fonte** da configuração do Tailwind, e não o contrário.

**Motivo:** destravar a Fase 1 sem antecipar versões nem abrir brecha para
alteração da experiência aprovada.

**Formalizada em:** `CLAUDE.md` §44-A (com §44-A.1 sobre versões e §44-A.2 sobre
a proibição de redesign) · `CLAUDE.md` §7 · `05-PLANO-IMPLEMENTACAO.md` §5

**Impacto no design:** nenhum. A identidade visual permanece integralmente.

---

### D-2026-09-17-08 — `02-SEGURANCA-PERMISSOES.md` não será recuperado

**Decisão:** o arquivo **não será recuperado nem recriado**. O redirecionamento
das suas citações para `03-RLS-RBAC-SEGURANCA.md` é **definitivo**.

**Motivo:** o arquivo nunca existiu no repositório e o conteúdo que ele prometia
— matriz de RBAC, permissões semânticas, fronteiras de acesso — está
integralmente em `03-RLS-RBAC-SEGURANCA.md`.

**Formalizada em:** `02-MODELO-DADOS-SUPABASE.md` linhas 6 e 1461 ·
`03-RLS-RBAC-SEGURANCA.md` linha 5

---

### D-2026-09-17-09 — Checklist pré-implementação

**Decisão:** no checklist de `05-PLANO-IMPLEMENTACAO.md` §23, marcar como
concluídos **somente** os itens objetivamente verificados: presença dos cinco
documentos normativos, presença do `CLAUDE.md`, frontend aprovado disponível,
código versionado em Git e working tree limpo.

Permanecem **desmarcados** por ainda não estarem resolvidos: projeto Supabase
identificado, ambientes dev/prod diferenciados e segredos fora do repositório.

**Motivo:** o checklist é um gate real, não um formulário a preencher.

---

### D-2026-09-17-10 — Identidade Git do repositório

**Decisão:** autoria dos commits do projeto:

- Nome: **Marcelo**
- E-mail: **mgc.info.new@gmail.com**

Configurada **somente neste repositório** (`git config --local`). A configuração
global da máquina permanece intocada.

**Motivo:** a máquina não possuía identidade Git configurada. Os dois primeiros
commits foram criados com um e-mail inferido e tiveram a autoria corrigida com
`git filter-branch` antes de existir qualquer remoto, preservando integralmente
conteúdo (hashes de árvore idênticos), mensagens e datas.

---

### D-2026-09-17-11 — Destino do repositório: GitHub privado

**Decisão:** o projeto será hospedado no **GitHub**, em repositório **privado**.

~~**Neste momento o repositório permanece somente local.** Não criar repositório
remoto e não executar `push` até autorização explícita.~~
**Superado em 18/09/2026 por D-2026-09-18-19:** o `push` foi autorizado e o
remoto privado existe. A exigência de repositório **privado** continua vigente.

**Motivo:** o repositório contém documentação operacional e comercial da Shalon
e, a partir da Fase 2, passará a envolver configuração de ambientes. Repositório
privado é requisito, não preferência.

**Pendências relacionadas:** ver A-10 (criação do remoto e primeiro `push`).

---

### D-2026-09-17-12 — Versões adotadas na Fase 1

**Decisão:** versões instaladas, validadas e fixadas pelo `package-lock.json`.

| Pacote | Versão |
|---|---|
| next | 16.3.5 |
| react · react-dom | 19.3.0 |
| typescript | 6.0.3 |
| tailwindcss · @tailwindcss/postcss | 4.3.3 |
| eslint | 9.39.5 |
| eslint-config-next | 16.3.5 |
| vitest | 5.0.1 |
| @supabase/supabase-js | 2.116.0 |
| zod | 4.6.5 |
| server-only | 0.0.1 |

**Duas exceções ao "mais recente estável", por incompatibilidade comprovada:**

1. **TypeScript 6.0.3 em vez de 7.0.2** — `typescript-eslint` 8.70, embutido no
   `eslint-config-next`, recusa a API do TS 7.0 com erro explícito.
2. **ESLint 9.39.5 em vez de 10.10.0** — `eslint-plugin-react`, embutido no
   `eslint-config-next` 16, usa `context.getFilename()`, removido no ESLint 10.

Nenhuma tecnologia aprovada foi substituída: continua sendo TypeScript e ESLint.
A decisão coube à autorização de "selecionar e instalar versões estáveis
compatíveis" dada para a Fase 1.

**Formalizada em:** `CLAUDE.md` §44-A.1

---

### D-2026-09-17-13 — Breakpoints em CSS, não em JavaScript

**Decisão:** a alternância sidebar × drawer do administrativo é decidida por CSS
(`hidden lg:flex` / `lg:hidden`), não medindo `window.innerWidth`.

**Motivo:** PI-004 proíbe transportar breakpoints calculados por JavaScript. O
resultado visual é idêntico ao do design, sem flash de layout e sem divergência
de hidratação entre servidor e cliente. O JavaScript do drawer controla apenas
aberto/fechado, que é comportamento e não breakpoint.

**Formalizada em:** `05-PLANO-IMPLEMENTACAO.md` PI-004 · `CLAUDE.md` §8

**Impacto no design:** nenhum. Mesmo comportamento responsivo.

---

### D-2026-09-17-14 — Tipografia por next/font

**Decisão:** Bricolage Grotesque e Be Vietnam Pro carregadas por `next/font`,
auto-hospedadas, em vez do `<link>` para o Google Fonts usado no protótipo.

**Motivo:** mesmas famílias e mesmos pesos, sem requisição a terceiro em runtime
e sem deslocamento de layout. É decisão de implementação; a tipografia aprovada
não muda (CLAUDE.md §44-A.2).

**Impacto no design:** nenhum.

---

### D-2026-09-18-15 — Projeto Supabase de desenvolvimento

**Decisão:** criado o projeto **`pizzaria-shalon-dev`** (`gyifopivitrnzldirmdq`,
região `sa-east-1`, Postgres 17, custo US$ 0/mês) na organização da Shalon.

É ambiente de **desenvolvimento**. O projeto de produção será criado na Fase 11,
recebendo as mesmas migrations versionadas.

**Motivo:** a Fase 2 exige testar RLS positiva e negativamente
(`05-PLANO-IMPLEMENTACAO.md` §6.6). Policy não testada contra um Postgres real
está escrita, não verificada.

**Credenciais:** `.env.local`, fora do versionamento, contendo apenas a chave
**publicável** — que nada concede por si, já que todo acesso passa por RLS. A
`service_role` não foi usada em momento algum e não existe no projeto.

---

### D-2026-09-18-16 — Usuário Owner/Admin inicial de desenvolvimento

**Decisão:** criado `dona@pizzariashalon.dev` (funcionário "Ana Shalon", papel
Owner/Admin) apenas no ambiente de desenvolvimento, para validar o fluxo de
autenticação de ponta a ponta.

**Não é seed de produção** (PI-009, `05-PLANO-IMPLEMENTACAO.md` §15.1). A carga
inicial real será consciente e validada na Fase 11, com credencial definida pela
proprietária.

---

### D-2026-09-18-17 — Tela de login criada sem redesenhar

**Decisão:** o design aprovado não possui tela de autenticação — o protótipo do
Claude Design não tem login. A tela foi montada usando **exclusivamente** o
design system aprovado: tokens da marca, Bricolage Grotesque no título, campos
de 50px com foco laranja, cartão sobre `--surface` com raio 18, CTA no par
`--cta-bg`/`--cta-fg` e alerta na família tonal de perigo. Os componentes
`Input` e `Button` já extraídos foram reaproveitados; nenhum estilo novo foi
inventado.

O acento vermelho foi aplicado por a tela pertencer à experiência
administrativa, cujo padrão no design é `acento: vermelho`.

**Formalizada em:** pendência A-06 (adaptações visuais), item resolvido para o
login.

---

### D-2026-09-18-18 — Autorização nunca deriva do nome do cargo

**Decisão:** confirmada na implementação. `has_permission(code)` é a única porta
usada pelas policies; nenhuma policy compara `roles.name` com texto. A função
verifica, no momento da chamada: usuário ativo, funcionário ativo, papel ativo e
permissão concedida.

Consequência verificada em teste: desligar o funcionário ou marcar
`app_users.is_active = false` derruba o acesso imediatamente, mesmo com JWT
ainda válido (`03-RLS-RBAC-SEGURANCA.md` §5.4).

---

### D-2026-09-18-19 — Remoto privado criado e primeiro `push`

**Decisão:** o repositório local passou a ter o remoto `origin` em
`github.com/mgcnew/pizzaria-shalon`, **privado**, e o histórico completo foi
enviado. Autorizado pelo usuário em 18/09/2026, após o checkpoint da Fase 2.

**Conta:** `mgcnew` (GitHub), a mesma já autenticada na máquina. A identidade
dos commits permanece `Marcelo <mgc.info.new@gmail.com>`, configurada apenas
neste repositório (D-2026-09-17-10).

**Visibilidade:** privado, conforme D-2026-09-17-11 — requisito, não
preferência. Tornar o repositório público exigiria nova decisão registrada.

**O que NÃO foi enviado:** `.env.local` e qualquer credencial. Antes do `push`
foi verificado que nenhum arquivo `.env` com valores está versionado, que
`.env.local` é ignorado pelo `.gitignore`, e que não existe `service_role`,
chave publicável ou JWT no conteúdo versionado — as únicas ocorrências do termo
`service_role` são comentários afirmando que ela não é usada.

**Consequência operacional:** a partir daqui, `git push` deixa de ser proibido,
mas continuam valendo `CLAUDE.md` §42 e §43 — **nunca** reescrever histórico já
publicado e **nunca** `force push`.

---

### D-2026-09-18-20 — Provedor de rotas: Google Maps Platform, com a regra agnóstica

> ⚠️ **SUPERADA na escolha do fornecedor por `D-2026-09-24-75`**: o provedor
> de produção passou a ser o **HERE**. O que esta decisão estabeleceu sobre a
> **regra continuar agnóstica ao fornecedor** permanece válido — e foi
> justamente o que tornou a troca barata.

**Decisão:** o provedor de geocodificação e distância de rota da V1 será o
**Google Maps Platform**, conforme definido pelo usuário em 18/09/2026.

**A regra comercial continua agnóstica ao fornecedor.** `CLAUDE.md` §20 e
79.2 exigem abstração interna, e a Fase 3 respeitou isso: a configuração
guarda faixas de km e taxa, `store_settings` guarda coordenadas e
`geocode_provider` como REGISTRO do que geocodificou — não como acoplamento.
Nenhuma chamada ao Google existe no código.

**Não antecipado:** a integração em si (chave de API, cálculo de distância,
aplicação da taxa a um pedido) é da **Fase 5**. Segredo de API jamais vai
para tabela acessível ao cliente (03 §7.2).

**Pendência relacionada:** A-05 deixa de ser "qual provedor" e passa a ser
"contratar, configurar e integrar na Fase 5, com modelo de custo".

---

### D-2026-09-18-21 — Interpretações adotadas na Fase 3 → **aprovadas e normativas**

> **APROVADAS PELO USUÁRIO EM 18/09/2026.** As três deixaram de ser
> interpretações reversíveis e passaram a integrar a fonte de verdade:
>
> | # | Onde vive agora |
> |---|---|
> | 1. Adicional sem regra específica | `04-REGRAS-NEGOCIO.md` **RN-ADD-006** · `02-MODELO-DADOS-SUPABASE.md` §5.10 |
> | 2. Fronteira `(min, max]` | `04-REGRAS-NEGOCIO.md` **RN-ENT-015** · `02-MODELO-DADOS-SUPABASE.md` §3.3 |
> | 3. Produto sem preço aplicável | `04-REGRAS-NEGOCIO.md` **RN-DISP-006** · `02-MODELO-DADOS-SUPABASE.md` §5.2 |
>
> Alterá-las agora exige o mesmo rito de qualquer regra normativa. O texto
> abaixo é preservado como **histórico de como se chegou a elas** — este log
> não é fonte normativa (ver "O que este documento NÃO é").

Três pontos em que os documentos não eram explícitos. Nenhum inventa regra
comercial; todos são a leitura mais conservadora e estavam registrados para
poderem ser revertidos com uma decisão — decisão que veio, aprovando-os.

**1. Adicional sem regra cadastrada é permitido.** RN-BORDA-003 diz
explicitamente que a borda compatível com o tamanho vale por padrão, e a
tabela guarda a exceção. Para adicionais, RN-ADD-002 fala em "regras de
compatibilidade" sem definir o padrão. Adotado o mesmo comportamento das
bordas: sem regra em `product_addon_rules`, o adicional ativo e com preço no
tamanho é permitido. O design reforça essa leitura ("Bordas e adicionais
seguem as listas ativas nas abas correspondentes"). Uma linha com
`is_allowed = false` proíbe.

**2. Fronteira das faixas de entrega: `(min, max]`.** 02 §3.3 pede "regra
clara de fronteira para evitar buracos" e exemplifica `0–2`, `>2–4`. A faixa
cobre acima do mínimo até o máximo inclusive, e a faixa que começa em 0
também cobre a distância 0. A constraint de não sobreposição no banco usa
exatamente esse intervalo.

**3. Produto sem preço algum não está disponível.** RN-DISP-001 separa
cadastro de operação, mas nenhum documento trata do produto recém-criado que
ainda não tem preço. Um produto assim não é vendável: se tem variação, ao
menos uma precisa estar disponível; se não tem, `base_price` precisa existir.
Isto foi encontrado ao verificar a tela, não no papel.

---

### D-2026-09-18-22 — Adaptações entre o design aprovado e as regras V2

`CLAUDE.md` §7 manda preservar o design; §54 manda respeitar a experiência
aprovada. Mas a regra normativa vigente prevalece sobre o comportamento
antigo do protótipo. As cinco adaptações abaixo preservam a linguagem visual
e mudam só o que a regra exige.

| # | Protótipo | Fase 3 | Por quê |
|---|---|---|---|
| 1 | Aba **"Sabores"** em Produtos | removida | D-2026-09-17-04: sabor de pizza É produto. Uma aba de sabores reintroduziria a entidade que o modelo eliminou |
| 2 | Configurações › **"Bairros e taxas"**, "sem GPS ou cálculo por distância" | **faixas de distância** e taxa | D-2026-09-17-02 e 79.2: a cobrança por bairro está superada |
| 3 | Modal do combo: "defina as escolhas permitidas… a composição é dinâmica" | composição **fixa**, item a item | D-2026-09-17-03 e 79.5: combo fixo, sem substituição |
| 4 | Modal de produto | **rota própria** (`/admin/produtos/[id]`) | formulário validado no servidor, endereço compartilhável e botão "voltar" funcionando. Conteúdo e sequência numerada preservados |
| 5 | — (não existia) | aba **"Banners"** | escopo da Fase 3 (§7.2, item 11); o protótipo não tinha a tela administrativa. Montada só com o design system aprovado |

**Adiado, não removido:** a seção **"Impressora"** das Configurações não foi
implementada. Impressão 58 mm é da **Fase 6** e depende de prova de conceito
com o equipamento (A-08). Uma aba com botão "Teste de impressão" que não
imprime seria pior que a ausência dela.

---

### D-2026-09-18-23 — Tema claro/escuro é preferência do dispositivo

**Decisão:** a seção "Aparência" grava a escolha em **cookie do navegador**,
não em `store_settings`.

**Motivo:** gravar no banco faria a preferência de uma pessoa valer para toda
a equipe, o que nenhum documento pede. O §7.1 da Fase 3 fala em "temas e
branding **quando forem configurações persistentes**" — claro/escuro não é.
O acento amarelo/vermelho continua decidido pela ÁREA (amarelo no público,
vermelho no administrativo), como no design; no protótipo ele era trocado
pelo painel de ajustes da própria demonstração, mecanismo que PI-004 manda
não transportar.

**Por que cookie e não `localStorage`:** com cookie o servidor já sabe o tema
e devolve o HTML certo de primeira. Com `localStorage` seria preciso um
script bloqueante corrigindo o `<html>` antes da pintura, o que provoca
divergência de hidratação — erro real, verificado no navegador antes da
troca de abordagem.

---

### D-2026-09-18-24 — Escopo da auditoria na Fase 3

**Decisão:** são auditadas as **configurações críticas** listadas em 03 §7.2
— loja, horários, faixas de entrega, formas de pagamento, bandeiras, limites
de alerta e chave Pix — mais as **promoções**.

**Promoções entram por escolha, não por exigência:** não constam da lista
mínima de §22.2, mas "quem colocou este preço e quando" é exatamente a
pergunta que a auditoria existe para responder. Auditar a mais não viola
regra alguma.

**Catálogo NÃO é auditado** (produto, categoria, tamanho, borda, adicional,
combo, banner). §22.2 não exige, e registrar cada ajuste de ordenação
transformaria a auditoria em ruído, atrapalhando encontrar o que importa.
Reversível: é uma trigger por tabela.

**A chave Pix é auditada com o valor mascarado.** Registra-se que mudou, quem
mudou e quando; o valor não é copiado para dentro do log (03 §31).

---

### D-2026-09-18-25 — Logo otimizado (A-12 resolvida)

**Decisão:** `public/marca/logo-shalon.png` passou de **1.409 kB (1774×887)**
para **62,5 kB (512×256)** — redução de 95,6%.

**Sem alteração de aparência:** o logo é exibido entre 38 px e 56 px de
altura. Mesmo no maior desses tamanhos, a diferença medida em relação ao
original é de **1,27 de 255 por canal** (máxima de 15) — custo do
redimensionamento, não de compressão. Continua PNG; não houve conversão de
formato nem recorte.

**O original aprovado permanece intacto** em
`pizzaria-shalon-design-system/project/uploads/logo pizza.png`, e qualquer
regeneração deve partir de lá. Detalhes em `public/marca/LEIA-ME.md`.

---

### D-2026-09-18-26 — `sharp` como dependência direta

**Decisão:** `sharp` 0.35.4 passa a ser dependência direta do projeto.

**Motivo:** o pipeline de imagem da Fase 3 exige validar o tipo real do
arquivo, redimensionar, comprimir e remover metadados (03 §24). Não existe
alternativa no projeto e o pacote já vinha na árvore como dependência
transitiva do Next — depender dele indiretamente é que seria frágil.

**Uso:** exclusivamente no servidor, dentro de Server Actions. Não entra no
bundle do navegador.

---

### D-2026-09-18-27 — Seed estrutural: só o que a documentação nomeia

**Decisão:** a Fase 3 semeia apenas as **5 categorias iniciais** (79.6) e as
**6 formas de pagamento** (79.12). Nada mais.

**Deliberadamente NÃO semeados**, porque exigiriam inventar valor comercial
que nenhum documento define — e `CLAUDE.md` §54 proíbe:

| O quê | Por que não |
|---|---|
| `store_settings` | endereço, coordenadas e horários reais da Shalon são A-07 |
| `pizza_sizes` | "Tradicional" e "Brotinho" são nomes conhecidos, mas número de fatias e máximo de sabores não constam de documento algum |
| `alert_thresholds` | as chaves são conhecidas; os minutos, não |
| `payment_brands` | quais bandeiras a Shalon aceita é A-07 |

A tela de Configurações trata o estado "loja ainda não configurada" como
situação legítima, e a Owner preenche sem alterar código (§7.5).

---

### D-2026-09-19-28 — A-17 resolvida por medição, e sem índice

**Decisão:** a busca pública normaliza acento e caixa com `unaccent`, e
**nenhum índice foi criado**.

**Medição, com 801 produtos** — mais de dez vezes o cardápio previsto:

| | Antes | Depois |
|---|---|---|
| `buscar_catalogo('medicao 42')` | 78 ms | **26,8 ms** |
| `cardapio_publico()` sozinho | 60 ms | — |

Os 60 ms mostraram onde estava o custo: o cardápio INTEIRO era precificado —
preço efetivo e disponibilidade linha a linha — antes de o filtro descartar
790 linhas. Um índice trigram atacaria justamente a parte barata. O que
resolveu foi inverter a ordem: filtrar nas tabelas-base e só então precificar
o que sobrou (migration 0033).

**Por que nenhum índice:** com dezenas de produtos, a varredura sequencial é
o plano correto, e índice não usado é peso morto (`CLAUDE.md` §39, "meça
antes de grandes otimizações"). Se o cardápio crescer uma ordem de grandeza,
a medição deve ser refeita.

**Formalizada em:** `02-MODELO-DADOS-SUPABASE.md` §22 · migration 0033.

---

### D-2026-09-19-29 — Adaptações entre o design aprovado e a Fase 4

O protótipo público do Claude Design é a referência visual, e foi seguido de
perto. As diferenças abaixo existem porque a REGRA NORMATIVA pede — não por
preferência.

| # | Protótipo | Fase 4 | Por quê |
|---|---|---|---|
| 1 | *(não existia)* | **menu hambúrguer** com Meus pedidos, Histórico e Favoritos | 79.8 exige. Montado com a linguagem do drawer administrativo aprovado |
| 2 | *(não existia)* | **favoritar** no card e na página do produto | 79.8 e RN-FAV-001 preveem favoritos; o protótipo só os cita no menu |
| 3 | Selo **"Popular"** | selo **"Destaque"** | RN-DEST-001 (escolha manual) e RN-POP-001 (ranking de vendas) são coisas diferentes. Chamar destaque de "popular" diria ao cliente algo que não é verdade |
| 4 | Seção **"Mais pedidos"** | **ausente** | RN-POP-001 calcula dos pedidos concluídos dos últimos 30 dias, e pedido é da Fase 5. Sem base, a seção não é renderizada (A-16) |
| 5 | Faixa fixa "Quatro Queijos com 15% off" | seção de **promoções vigentes reais** | anunciar oferta inexistente seria pior que não ter a seção |
| 6 | **Sheet** de produto | **rota** `/produto/[slug]` | RN-LINK-001 exige link compartilhável. O conteúdo e a sequência do sheet foram preservados |
| 7 | Grupos de escolha no combo | composição **fixa**, só leitura | D-2026-09-17-03: combo da V1 não é configurador |

**Preservado integralmente:** cabeçalho com logo e pílula de situação, hero
escuro com selo "Tradição desde 1995", busca, categorias horizontais, cards,
aviso de loja fechada, estados vazios, barra de carrinho que só aparece com
itens (superada em D-2026-09-28-85), ausência de navegação inferior, microcopy do meio a meio e da
observação, tokens, tipografia, raios e animações.

---

### D-2026-09-19-30 — O preço nunca é calculado em React

**Decisão:** `montar_item` (migration 0032) é a **única** via de precificação
da experiência pública. A mesma função serve para:

1. a prévia enquanto o cliente monta a pizza;
2. a linha que entra no carrinho;
3. a revalidação antes de seguir para o checkout.

**Consequência prática:** não existe soma de preço em componente React — nem
do meio a meio, nem de borda, nem de adicionais. O configurador chama a
Server Action a cada escolha e EXIBE o que voltou. Prévia e realidade não
podem divergir porque são o mesmo cálculo (`CLAUDE.md` §16 e §17).

**Revalidação (79.9):** diferença comercial devolve `exige_reconfirmacao`, a
tela mostra **anterior → atual** e o avanço fica bloqueado até o aceite.
Falha na revalidação também bloqueia: sem conferência, o valor em tela é só
o que o navegador guardou.

---

### D-2026-09-19-31 — Defeitos encontrados verificando, não lendo

Quatro defeitos que só apareceram ao exercitar o sistema. Ficam registrados
porque todos são do mesmo tipo: o caminho feliz funcionava.

**1. Revalidação quebrava exatamente quando um preço mudava.**
`v_motivos := v_motivos || 'preco_alterado'` — em `text[] || 'literal'` o
Postgres lê o literal como ARRAY, não como elemento (erro 22P02). Enquanto
nada mudava, tudo passava. Corrigido na migration 0034, e a interface passou
a BLOQUEAR quando a revalidação falha, em vez de seguir com o preço antigo.

**2. Produto simples com adicional derrubava a montagem.** RECORD só
preenchido no ramo das pizzas, lido nos ramos de borda e adicional — e ler
RECORD não atribuído é erro em plpgsql, não NULL. Migration 0036.

**3. Envio de imagem com mais de 1 MB falhava no administrativo.** O limite
de corpo de Server Action do Next é 1 MB por padrão, enquanto o pipeline
aceita 8 MB (03 §24). A mensagem — "Body exceeded 1 MB limit" — não dizia
nada à Owner. Corrigido em `next.config.ts`. **Defeito da Fase 3**,
encontrado no console durante a Fase 4.

**4. Mensagem técnica chegando ao cliente.** O carrinho exibia "Sabor
indisponivel no tamanho escolhido (RN-PIZZA-004)", com código de regra e sem
acentuação. A assertiva de domínio continua assim (é citada nos testes e
útil no log); quem traduz é `montar_item`, na fronteira com a interface
(migration 0035).

---

### D-2026-09-19-32 — O segredo de origem: como aceitar uma distância sem confiar no navegador

**Decisão.** Existe um segredo compartilhado entre o servidor Node e o
Postgres, guardado em `server_secrets` e exigido por `criar_pedido`,
`cotar_entrega` e `origem_da_loja`.

**O problema que ele resolve.** `criar_pedido` precisa ser `SECURITY
DEFINER`, porque 03 §9.1 proíbe dar INSERT em `orders` ao papel `anon`. Isso
a deixa exposta em `/rest/v1/rpc`. E a DISTÂNCIA não pode ser calculada
dentro do banco: ela vem do provedor de rotas, chamado pelo servidor. Sem
prova de origem, qualquer pessoa chamaria a RPC do navegador informando
"0,5 km" e pagaria a menor taxa.

**O que ele NÃO é.** Não é `service_role` e não concede acesso a nada. Não
dispensa RLS, não dispensa a revalidação e não autoriza preço: `criar_pedido`
continua recalculando tudo. Ele responde a uma única pergunta — "esta chamada
partiu do nosso servidor?".

**Consequência operacional.** O valor nasceu aleatório na migration 0040,
nunca esteve no Git, e precisa ser lido UMA vez pela Owner
(`select public.ler_segredo_do_servidor('checkout_origem')`, que exige
`settings.manage`) e colocado em `SHALON_CHECKOUT_ORIGIN_SECRET`. Sem ele, o
checkout não cria pedido algum — e falha dizendo isso, em vez de criar um
pedido com taxa errada.

**Onde está:** migrations 0040, 0042, 0044 e 0045 · `.env.example`.

---

### D-2026-09-19-33 — O token de acompanhamento vem da chave da tentativa

**Decisão.** O token de `/pedido/[token]` é `HMAC-SHA256(segredo,
"tracking:" || idempotency_key)`, e não um valor sorteado. O banco guarda
apenas o SHA-256 dele.

**Motivo.** Clique duplo, retry de rede e botão de voltar reenviam a MESMA
tentativa. Com token sorteado, a segunda tentativa devolveria `ja_existia:
true` e um token NOVO — que não abriria pedido nenhum, porque o hash gravado
é o do primeiro. O cliente perderia o acesso ao pedido que acabou de fazer.
Derivando da chave da tentativa, o reenvio reproduz exatamente o mesmo token.

Continua imprevisível para quem não tem o segredo, que é o que RN-PED-004
exige. E o índice único sobre o hash garante que dois pedidos jamais
compartilhem um token.

**Onde está:** `src/application/checkout/segredo.ts`.

---

### D-2026-09-19-34 — A cotação de entrega é informação, não autoridade

**Decisão.** A taxa mostrada no checkout vem de `cotar_entrega`, que usa
exatamente a mesma `faixa_para_distancia` que `criar_pedido` usará. No envio,
endereço e rota são geocodificados e medidos DE NOVO; a coordenada e a
distância que a tela viu não voltam como verdade.

**Motivo.** É o mesmo princípio do preço do item (CLAUDE.md §16) aplicado à
entrega. Aceitar de volta a distância cotada seria aceitar um número que
passou pelo navegador. O custo é uma segunda chamada ao provedor por pedido —
e vale a pena.

**Consequência.** Quando a cotação e o envio divergem (endereço corrigido,
provedor fora do ar), quem manda é o envio: ou o pedido nasce com a taxa
recalculada, ou não nasce.

---

### D-2026-09-19-35 — Sem credencial do Google, a entrega fica indisponível

**Decisão.** Não existe caminho intermediário. Ou há `GOOGLE_MAPS_SERVER_KEY`
e a distância é de rota viária, ou o provedor `indisponivel` recusa tudo com
`motivo: "configuracao"` e o checkout oferece retirada.

**O que foi recusado:** estimar por linha reta, por CEP ou por bairro como
"aproximação temporária". CLAUDE.md §20 proíbe distância em linha reta para
cobrança, e falha de cálculo nunca pode virar taxa R$ 0,00.

**Estado atual:** a credencial NÃO existe neste ambiente. A integração está
escrita e testada contra o contrato, com dublê determinístico; ela nunca foi
exercitada contra o Google. A-05 permanece aberta, agora com passos exatos
(ver a tabela de decisões em aberto).

---

### D-2026-09-19-36 — "Meus pedidos" é deste aparelho, e a tela diz isso

**Decisão.** A lista de pedidos vem dos TOKENS que este navegador guardou ao
criar cada pedido. Nada de consulta por WhatsApp, por nome ou por número.

**Motivo.** CLAUDE.md §29 e 03 §12.1: WhatsApp é identificador operacional,
não credencial. "Digite seu WhatsApp e veja seus pedidos" transformaria um
dado que qualquer pessoa conhece em chave de acesso ao histórico alheio.

O estado de cada pedido é buscado no servidor a cada abertura — o navegador
guarda o token, nunca o status. E a tela afirma a limitação em vez de deixar
o cliente descobrir que "sumiu": a lista é deste aparelho e não é
sincronizada.

---

### D-2026-09-19-37 — Aprovação de entrega é dimensão própria, não um status

**Decisão.** `requires_delivery_approval` e `delivery_approval_status` são
colunas separadas do `status` do pedido.

**Motivo.** Um pedido pode, ao mesmo tempo, aguardar confirmação de Pix
(RN-PGTO-010, que impede a produção) e aguardar aprovação da entrega
(RN-ENT-011, que é sobre a área atendida). Se as duas condições disputassem o
mesmo campo, uma seria perdida — e seria preciso inventar uma precedência que
nenhum documento decidiu.

A precedência EXISTE, mas só para o `status` inicial, e está escrita na
função: Pix por chave define o status; acima do raio, `waiting_delivery_
approval`; caso contrário, `waiting_store_confirmation`. As duas dimensões
coexistem sem se sobrescrever.

---

### D-2026-09-19-38 — Defeitos da Fase 5, e um que era do arnês de teste

**1. Função de janela dentro de agregado.** `row_number() over (...)` dentro
de `jsonb_agg` derrubava QUALQUER pizza — inteira ou meio a meio — com erro
42P20. Apareceu na primeira criação de pedido ponta a ponta. Corrigido na
migration 0042, calculando a ordem em subconsulta.

**2. `EXECUTE` revogado de quem precisava executar.** A 0044 revogou de
`anon` as funções `origem_da_loja` e `cotar_entrega` — mas o Server Action
fala com o Supabase usando a chave publicável e é, para o Postgres, `anon`.
Toda cotação daria 42501. A postura correta é a mesma de `criar_pedido`:
função exposta, barrada pelo SEGREDO. Corrigido na 0045. Trocar por
`service_role` "para resolver" seria exatamente o atalho proibido por §13.

**3. Arnês de teste reusando o mesmo token.** A suíte da Fase 5 mandava o
mesmo `tracking_token` em todos os pedidos e batia no índice único ao criar o
segundo. Era defeito DO TESTE — e confirmou uma propriedade desejada: dois
pedidos não podem compartilhar token. O arnês passou a derivar o token da
chave da tentativa, como a produção faz.

---

### D-2026-09-19-39 — Fase 5 aprovada condicionalmente, e a dívida de validação ganha documento próprio

**Decisão.** A Fase 5 está **implementada e aprovada para continuidade do
desenvolvimento**. A validação real do Google Maps e o E2E completo
permanecem **pendentes e obrigatórios antes da produção**. A integração
Google **não** está marcada como validada.

**Motivo.** A configuração de billing do Google Cloud será feita depois. Isso
é calendário, não impedimento técnico: o provedor está atrás da abstração, o
comportamento sem credencial é fail-closed (D-2026-09-19-35) e a retirada não
depende do Google. Parar o desenvolvimento por causa disso custaria mais do
que carregar a pendência de forma explícita.

**O que muda na forma de registrar.** Passam a existir duas categorias
distintas de pendência:

- **decisão em aberto** — ninguém decidiu, e isso bloqueia implementação:
  continua na tabela deste documento;
- **dívida de validação** — o código existe e está testado, mas nunca foi
  exercitado contra o mundo real: vai para
  `06-PENDENCIAS-VALIDACAO-PRODUCAO.md`.

O `06` é a fonte consolidada da segunda categoria, para que amanhã ninguém
precise reconstruir de memória o que faltava. Ele **não é normativo**: não
decide regra, preço, taxa nem segurança.

**O que NÃO foi feito:** a implementação do provedor não foi alterada por
falta da chave. Sem provedor, nada de distância em linha reta, nada de taxa
assumida, nunca entrega R$ 0,00.

---

### D-2026-09-19-40 — `orders.confirm_pix`: uma permissão nova, porque a matriz pedia uma

**Decisão.** Criada a permissão semântica `orders.confirm_pix`, concedida ao
Dono/Admin. O Atendente padrão **não** a recebe.

**Motivo.** A matriz de acesso (03 §6) diz, para Pix antecipado: Atendente
padrão "confirmar **se autorizado**", Dono "confirmar". Isso descreve uma
permissão concedível — nem automática para o balcão, nem exclusiva do Dono
para sempre.

Nenhuma permissão existente expressava isso: `orders.accept` é a operação
seguinte, e `finance.create` é lançamento financeiro. Confirmar recebimento
de dinheiro é ação semântica própria (CLAUDE.md §14).

**Consequência prática:** hoje o Atendente não confirma Pix. Quando a Shalon
quiser que o balcão confirme, concede a permissão pela gestão de papéis
(Fase 8). Enquanto isso, quem confirma é a Owner.

**Onde está:** migration 0047 · `03-RLS-RBAC-SEGURANCA.md` §5.

---

### D-2026-09-19-41 — A máquina de estados vive no banco, e a interface pergunta

**Decisão.** `orders` **não tem policy de UPDATE para ninguém**. Toda
transição passa por `comando_pedido`: comando nomeado, permissão própria,
pré-condição verificada, histórico e auditoria. E a interface não decide
quais botões existem — ela pergunta a `acoes_do_pedido`.

**Motivo.** Com uma policy de UPDATE, quem a tivesse gravaria qualquer status
direto em `/rest/v1` — exatamente o "dropdown genérico capaz de gravar
qualquer status" proibido por CLAUDE.md §21. Esconder o botão não seria
segurança.

E se a interface calculasse sozinha quando "aceitar" se aplica, passariam a
existir duas verdades sobre a mesma regra, que divergem no primeiro ajuste.
Por isso o servidor responde "para este pedido, neste estado, com estas
permissões, as ações são estas", e a tela só desenha.

O grafo permitido está em TABELA (`order_status_transitions`), não em
`case`: dá para consultar, dá para testar sem executar comando nenhum, e a
interface pode perguntar em vez de adivinhar.

**Onde está:** migrations 0048, 0054, 0057.

---

### D-2026-09-19-42 — A comanda é representação; o transporte é outra coisa

**Decisão.** `src/domain/pedidos/comanda.ts` produz a comanda como LINHAS de
32 colunas, determinísticas, em domínio puro. Nenhum byte de ESC/POS,
nenhum Bluetooth, nenhuma rede.

**Motivo.** O transporte físico não foi escolhido, e não pode ser: depende do
perfil Bluetooth do equipamento, que ninguém mediu (A-08). Escolher agora um
formato de bytes amarraria a comanda a uma impressora desconhecida. Separar
permite testar tudo que é decidível — conteúdo, largura, quebra, destaque —
sem hardware.

**Decorrência importante:** `order_prints` distingue *solicitada*, *enviada*,
*confirmada* e *erro*, e nenhum caminho pula para "confirmada". "O navegador
disparou" não é "o papel saiu", e vários transportes possíveis simplesmente
não confirmam. Hoje quem confirma é a pessoa que olhou para a impressora.

**O que a comanda NÃO tem:** subtotal, taxa e total. RN-PRINT-003 manda
priorizar a produção, e quem fecha conta tem as telas do financeiro. A única
informação de dinheiro é o TROCO, e só em entrega — porque quem sai com a
moto precisa levar o valor certo.

---

### D-2026-09-19-43 — O alcance do editor de alteração, dito abertamente

**Decisão.** O FLUXO de alteração está completo (RN-ALT-001 a 007): propor
com motivo, guardar antes e depois, aguardar o cliente quando itens ou total
mudam, aplicar criando revisão sem sobrescrever o histórico, e a recusa não
cancelar nada.

O EDITOR da tela administrativa, porém, ajusta quantidades e remove linhas.
**Acrescentar um item novo ao pedido não está na interface.**

**Motivo.** Adicionar item exige o configurador de pizza inteiro — tamanho,
sabores, borda, adicionais — dentro do administrativo. Inventar uma versão
simplificada dele criaria uma segunda forma de montar pizza, que é
exatamente o que CLAUDE.md §17 proíbe.

**O servidor já aceita:** `propor_alteracao` recebe qualquer configuração e
reprecifica com a mesma `montar_item` do cardápio. Quando o configurador for
extraído para uso comum, a tela ganha o botão sem mudar nada do domínio.

**A MESMA dependência atinge os pedidos manuais** (RN-MAN-001 a 003, plano
§10.4), que estão no escopo da Fase 6 e **não foram entregues nesta
execução**. Registrar um pedido de WhatsApp, telefone, balcão ou iFood exige
montar itens — ou seja, o mesmo configurador. A infraestrutura existe e não
precisa mudar: `orders.create_manual` está semeada desde a Fase 2, `source`
existe em `orders`, e `criar_pedido` já é a única porta de criação. Falta a
tela.

Não foi entregue uma versão reduzida do configurador para "resolver" os dois
casos: seriam duas formas diferentes de montar a mesma pizza, e a primeira
divergência apareceria no primeiro ajuste de regra.

Registrado como limitação conhecida e escopo em aberto, não como regra nova.

> **SUPERADO em D-2026-09-19-50.** O configurador foi extraído para uso
> comum; o editor de alteração passou a acrescentar itens e os pedidos
> manuais foram entregues. O texto acima fica como histórico da decisão.

---

### D-2026-09-19-44 — A-16 resolvida: "Mais pedidos" passa a existir

**Decisão.** `mais_pedidos` calcula o ranking no banco (RN-POP-001 a 004):
janela móvel de 30 dias, somente pedidos concluídos, por QUANTIDADE, até 6
produtos, apenas ativos e disponíveis, sem impulso artificial.

**Os dois pontos que exigiam cuidado:**

- **meio a meio** conta a FRAÇÃO de cada sabor. É para isso que
  `order_item_flavors.portion` existe desde a Fase 5 — o ranking não precisa
  interpretar texto;
- **combo conta como combo**, e não como seus componentes: publicamente, o
  que foi vendido é o combo.

Sem pedidos concluídos, a lista volta vazia e a seção **não é renderizada**.
Continua valendo que Destaque manual (`is_featured`, RN-DEST-001) é outra
coisa, e as duas não se misturam.

---

### D-2026-09-19-45 — Um defeito que só o teste de clique duplo encontrou

**O defeito.** `comando_pedido` validava a transição comparando o status
calculado com o atual. Quando davam iguais, o bloco de transição era pulado
— e a função respondia `ok: true` sem fazer nada.

Na prática: aceitar um pedido JÁ aceito respondia "aceito". Concluir um JÁ
concluído respondia "concluído". Nada corrompia, mas a operação recebia
confirmação de um ato que não aconteceu, e a auditoria ganhava registro de
algo que não mudou.

**Por que a correção óbvia não servia.** Proibir status igual quebraria
`aprovar_entrega`, que legitimamente mantém o status quando o Pix ainda
bloqueia (D-2026-09-19-37).

**A correção.** O comando passa a conferir se a ação **se aplica**, usando a
mesma `acoes_do_pedido` que a interface consulta para decidir os botões.
Interface e servidor deixam de poder divergir.

**No mesmo lote:** a segunda proposta de alteração respondia "este pedido não
pode ser alterado" quando o problema real era "já existe uma proposta
aguardando o cliente". A ordem das verificações foi corrigida para dizer o
que está de fato no caminho (migration 0057).

---

### D-2026-09-19-46 — Um configurador só, com invólucros diferentes

**Decisão.** A lógica de configuração comercial de item vive em
`src/ui/configurador/NucleoConfigurador.tsx` e serve os três usos: cardápio
público, pedido manual do balcão e inclusão de item numa alteração.

**O que ficou em cada camada:**

| Camada | Responsabilidade |
|---|---|
| `montar_item` (banco) | valida e precifica — **única autoridade de preço** |
| `montarDadosDoConfigurador` | carrega tamanhos, sabores, bordas, adicionais e o primeiro preço |
| `NucleoConfigurador` | escolhas, recálculo a cada mudança, desenho |
| Invólucro público | adicionar ao carrinho local, aviso de loja fechada |
| Invólucro admin (`EscolherProduto`) | busca de produto e entrega do item ao rascunho |

**O que NÃO foi criado:** `montar_item_admin`, tabela paralela, regra
especial de balcão ou cálculo em React. O administrativo usa as mesmas
projeções públicas de catálogo, que já eram concedidas a `authenticated`.

**Consequência verificada:** o atendente não contorna disponibilidade nem
compatibilidade. Sabor esgotado, borda fora do tamanho e produto pausado são
recusados no balcão exatamente como no cardápio — e isso está coberto por
teste (`pedido_manual_fase6.sql`).

**Regressão do público:** conferida no navegador depois da extração —
tamanho, meio a meio, borda por tamanho, preço vindo do servidor, aviso de
loja fechada. E as 96 asserções da Fase 4 seguem passando.

---

### D-2026-09-19-47 — Pedido manual entra pela MESMA porta

**Decisão.** Não existe `criar_pedido_manual`. `criar_pedido` passou a
aceitar duas provas de legitimidade:

- o **segredo de origem** (0040) — caminho do cliente público;
- uma **sessão interna com `orders.create_manual`** — caminho do balcão.

Todo o resto é o mesmo código: revalidação, recálculo, mínimo de entrega,
faixa de taxa, forma de pagamento, snapshots, estado inicial e
idempotência.

**Motivo.** 03 §9.2 exige que criar pedido seja "uma única operação de
domínio transacional". Uma segunda função duplicaria seis regras de dinheiro
que divergiriam no primeiro ajuste.

**A origem é de quem lança.** O cliente público não escolhe canal: para ele
`source` é sempre `shalon_link`. Só o lançamento interno escolhe entre os
valores normativos `whatsapp`, `phone`, `counter`, `ifood` e `other` (02
§19). Sem isso, bastaria declarar "balcão" para tentar fugir de alguma regra.

**iFood** significa apenas transcrição manual: não há integração, nada é
sincronizado, e a tela diz isso.

**Quem lançou fica registrado** em `orders.created_by_user_id`, com entrada
de auditoria própria (§33).

---

### D-2026-09-19-48 — Estado inicial do pedido manual: LACUNA NORMATIVA

> **RESOLVIDA em D-2026-09-21-53.** A lacuna virou regra: **RN-MAN-004** e
> **RN-MAN-005** em `04-REGRAS-NEGOCIO.md` §24. O registro abaixo é o
> histórico de como a pergunta foi feita, não a regra vigente.

**O que os documentos dizem.** `01 §32` e `§79.1` preveem o lançamento
manual e a preservação da origem. RN-MAN-001 a 003 tratam de canal, origem e
de que o pedido manual "não deve virar atalho para corromper preços, estados
ou histórico". **Nenhum documento define um estado inicial próprio para ele.**

**O que foi implementado.** A mesma regra do pedido público, sem exceção:
Pix por chave → `waiting_pix_confirmation`; acima do raio →
`waiting_delivery_approval`; caso contrário →
`waiting_store_confirmation`. O atendente então aceita com o comando de
sempre.

**Por que essa escolha.** Ela **não cria regra nova** — reusa a que já existe.
A alternativa ("pedido do balcão nasce aceito") seria regra de negócio
inédita, e mudaria quando a comanda pode sair e quando a produção começa.

**A pergunta que fica para a Shalon:** o pedido lançado pelo balcão deve
nascer **já aceito**, já que o atendente está criando e aceitando no mesmo
ato? Hoje ele exige dois gestos: lançar e aceitar. O segundo gesto mantém o
aceite explícito, com autor e horário (§33) — mas é um clique a mais no
balcão cheio.

**Enquanto não houver decisão, vale o que está implementado.** Trocar é uma
linha na função e uma migration.

**Foi uma linha e uma migration.** A Shalon respondeu que sim: ver
D-2026-09-21-53.

---

### D-2026-09-19-49 — Loja fechada bloqueia o CHECKOUT, não o balcão

> **PROMOVIDA em D-2026-09-21-53.** A interpretação virou regra escrita:
> **RN-MAN-006** em `04-REGRAS-NEGOCIO.md` §24, com ponteiro em RN-LOJA-002.

**Interpretação adotada.** `01 §79.1` diz: "Quando fechada, o cardápio
continua visível, mas **o checkout fica bloqueado**". A verificação de loja
aberta foi mantida **somente no caminho público**; o lançamento interno
acontece mesmo com a loja pausada.

**Motivo.** A pausa temporária é o botão que a Shalon usa quando a cozinha
está afogada — ela fecha o link público. Travar o balcão no mesmo instante
impediria de atender quem está fisicamente na frente do atendente, ou ao
telefone.

**É interpretação, não regra escrita.** Se a intenção for que a pausa feche
também o balcão, é uma condição a mais na função — e passa a ser decisão
registrada.

**A Shalon confirmou a interpretação** e pediu que ela fosse promovida a
regra. O código não mudou; a autoridade dele, sim (D-2026-09-21-53).

---

### D-2026-09-19-50 — Alteração com versão: edição obsoleta é recusada

**Decisão.** `propor_alteracao` aceita a `versao` do pedido (o `updated_at`)
e recusa a proposta quando ela mudou.

**Motivo.** CLAUDE.md §34: "não aceite silenciosamente edição baseada em
versão obsoleta". Dois atendentes com o editor aberto, ou um editor aberto
enquanto o pedido avança de estado, produziriam uma proposta construída
sobre um pedido que já não é aquele — e o cliente aprovaria uma diferença
que não existe mais.

O editor agora também **acrescenta itens**, usando o configurador
compartilhado. Todo item — os que ficaram, os que mudaram de quantidade e os
acrescentados — é reprecificado pelo servidor na proposta.

**Supera parcialmente D-2026-09-19-43**, que registrava a limitação do
editor e a ausência dos pedidos manuais. As duas foram resolvidas por esta
extração; o texto anterior fica como histórico.

---

### D-2026-09-19-51 — Recuperação de senha antecipada da Fase 10

**Decisão.** O painel ganhou "Esqueci minha senha": `/admin/esqueci-senha`
pede o link e `/admin/redefinir-senha` define a senha nova.

**Por que antes da hora.** A-15 coloca política de senha, MFA e recuperação
na Fase 10 (hardening). A recuperação foi trazida para cá a pedido da
proprietária, por necessidade concreta: sem ela, perder a senha do painel
significa depender do painel do Supabase para voltar a entrar.

**O que NÃO foi antecipado:** política de senha (só o mínimo de 8
caracteres, acima do mínimo do Supabase), MFA, expiração e bloqueio por
tentativa. **A-15 continua aberta** para esses.

**Duas propriedades que valem registrar:**

- **Não revela se a conta existe.** A resposta é idêntica com e-mail
  cadastrado ou não — senão a tela viraria um verificador de quem trabalha
  na Shalon (§25), o que já é a postura do login.
- **A senha nunca passa por código de cliente.** O token do link só existe
  no navegador (vem no fragmento da URL), então a página é de cliente; mas a
  senha nova vai para uma Server Action, como no login (§31).

Ao final, a sessão criada pelo link é encerrada: entrar de novo com a senha
nova é a prova de que ela funciona.

---

### D-2026-09-19-52 — Segundo usuário Owner: Marcelo

**Decisão.** A conta `mgc.info.new@gmail.com`, que já existia em
`auth.users` sem vínculo interno, recebeu funcionário próprio ("Marcelo") e
papel Owner/Admin.

**Por que funcionário próprio.** Apontar a conta para o registro "Ana
Shalon" misturaria duas pessoas no mesmo funcionário, e a autoria das
operações no histórico e na auditoria deixaria de significar alguma coisa
(§33).

**A conta `dona@pizzariashalon.dev` foi preservada** como estava. Ela
continua sendo usuário de desenvolvimento (D-2026-09-18-16) e não é seed de
produção.

**Continua valendo A-14:** criar usuário interno ainda depende de SQL. A
tela de gestão de equipe é da Fase 8; até lá, cada novo acesso é um
lançamento manual como este.

---

### D-2026-09-21-53 — As duas lacunas da Fase 6, resolvidas

**Decisão da Shalon**, em 21/09/2026, sobre os dois pontos que a Fase 6
deixou registrados em vez de inventar: D-2026-09-19-48 (estado inicial do
pedido manual) e D-2026-09-19-49 (loja pausada).

**1. Pedido manual nasce aceito.** Virou **RN-MAN-004**. O raciocínio da
Shalon é uma distinção semântica, não uma economia de clique: pedido público
é *solicitação* do cliente e por isso aguarda; pedido manual é *registro* de
um pedido que a pizzaria já recebeu e já aceitou pelo balcão, telefone,
WhatsApp ou iFood. Pedir ao atendente que aceite o que ele mesmo acabou de
lançar é cerimônia sem conteúdo.

O aceite não some do histórico: a criação preenche `accepted_by` e
`accepted_at` como o comando de aceite preencheria, o histórico diz "Pedido
lançado e aceito pela equipe no mesmo ato" e a auditoria carrega
`aceito_na_criacao`.

**2. E nascer aceito é o caso SEM bloqueio.** Virou **RN-MAN-005**. A ordem
das condições na função é o que faz a regra valer: os bloqueios são testados
antes. Pix por chave continua aguardando confirmação do recebimento; entrega
acima do raio automático continua aguardando aprovação — inclusive porque
aprovar exige `orders.accept`, que não é a mesma permissão de
`orders.create_manual`. A comanda segue a regra de sempre: sai porque o
pedido está liberado, não porque foi lançado pelo balcão.

**3. Pausa fecha o público, não o balcão.** Virou **RN-MAN-006**, com
ponteiro em RN-LOJA-002. Aqui o código não mudou — a 0058 já se comportava
assim, mas como *interpretação declarada*. O que mudou foi a autoridade: era
leitura de `01 §79.1`, agora é regra escrita. E a regra diz explicitamente o
que a pausa NÃO autoriza: produto indisponível continua recusado no balcão
com a loja pausada, e isso tem teste.

**Onde foi formalizada.** `04-REGRAS-NEGOCIO.md` §24 (RN-MAN-004/005/006) e
§2 (RN-LOJA-002 aponta para RN-MAN-006); `02-MODELO-DADOS-SUPABASE.md`, na
nota de `accepted_by`. Migration `0060`.

**O que NÃO mudou, de propósito.** Continua havendo uma porta de criação
(`criar_pedido`), uma máquina de estados (`comando_pedido`) e uma autoridade
de preço (`montar_item`). A decisão custou uma condição a mais no bloco de
estado inicial e duas colunas preenchidas no INSERT.

---

### D-2026-09-21-54 — As decisões da Fase 7

**Contexto.** A Fase 7 precisou responder onde cada real entra, sai e fica.
As decisões abaixo são as que os documentos não respondiam palavra por
palavra e que tiveram de ser tomadas para o caixa fechar com a verdade.

**1. Registrar o recebimento é um ato próprio — e a retirada depende dele.**
Virou **RN-PGTO-012**. O invariante 13 de `04 §44` manda impedir "conclusão de
retirada apenas por ter ficado pronta", e `01 §79.18` completa: "na retirada,
confirmar pagamento efetivo quando pendente". Então `concluir` passou a exigir
o recebimento registrado — **na retirada**.

**A entrega NÃO foi barrada**, e isso é deliberado. `01 §79.18` põe a
confirmação do pagamento da entrega no retorno do motoboy, que é a prestação
de contas da Fase 8. Barrar aqui inventaria regra. O fechamento continua
honesto por outro caminho: dinheiro que não entrou na gaveta não conta como
caixa físico e aparece destacado. **Se a Shalon quiser a entrega barrada
também, isso é mudança de regra, não ajuste de código.**

**2. Um ato de registro por pedido, com quantas formas precisar.** Virou
**RN-PGTO-013**. "R$ 30 dinheiro + R$ 25 débito" é um registro de duas
linhas, não dois meios-pagamentos. Isso evita a pergunta que nenhum documento
responde — "o que é um pedido parcialmente pago?" — sem tirar nada de quem
opera. A soma fecha com o total, exata, sem tolerância.

**3. Dinheiro fora da gaveta em vez de um booleano de motoboy.** `02 §12.2`
previa `has_pending_driver_runs boolean`. Ele foi trocado por
`pending_external_cash_amount numeric(12,2)`, que diz **quanto** e não apenas
que existe — e não depende de `driver_runs`, que é da Fase 8. Virou
**RN-CAIXA-017**.

**4. Duas permissões novas, nenhuma por comodidade.** `payments.register`
(os dois papéis, porque registrar recebimento é movimento operacional, 03
§16.2) e `cash.bypass_session` (só o Dono, porque RN-CAIXA-003 exige
"permissão específica" e ela não existia). **Não** criei `payments.reverse`:
estornar pagamento é estornar movimentação financeira, que é o que
`finance.reverse` já descreve.

**5. Sessão com dois status, não três.** `02 §12.2` deixava em aberto
(`reopened/corrected` "conforme estratégia final"). Ficou `open` e `closed`:
a sessão reaberta volta a `open`, e o fechamento anterior é fotografado em
`cash_session_corrections.before_snapshot`. Um terceiro status diria menos e
custaria mais.

**6. O fundo inicial não vira movimento.** Ele já está em
`cash_sessions.opening_amount`, com autor e horário. Duplicá-lo como
movimento `opening` daria duas fontes para o mesmo dinheiro — e um fundo de
R$ 0,00 nem poderia existir como linha, já que o valor de um movimento tem
de ser positivo.

**7. Nenhuma categoria financeira veio pronta.** RN-FIN-001 diz que o plano
de contas é configurável pelo usuário autorizado. "Fornecedores" ou "Contas"
seriam nomes inventados por mim. A tela leva a pizzaria a criar a primeira
antes de lançar.

**Dois defeitos encontrados pelos próprios testes**, ambos corrigidos por
migration própria: o índice de idempotência impedia qualquer pagamento
dividido (0069), e a resposta da RPC devolvia "50" onde a coluna gravava
"50.00" (0070).

**Onde foi formalizada.** `04-REGRAS-NEGOCIO.md` (RN-PGTO-012, RN-PGTO-013,
RN-CAIXA-017 e a nota de RN-CAIXA-010); `03-RLS-RBAC-SEGURANCA.md` §16.2 e
§32; `02-MODELO-DADOS-SUPABASE.md` §10.5, §12.2, §12.3 e §13.2. Migrations
`0061` a `0070`.

---

### D-2026-09-21-55 — Complemento da Fase 7: entrega, comprovante e bandeiras

**1. "Pedido entregue ≠ valor recebido" virou regra.** Era interpretação
declarada em D-2026-09-21-54 e passou a **RN-PGTO-014**, com ponteiro em
**RN-MOTO-004**. A Shalon aprovou a interpretação e pediu a promoção — o
código não mudou, a autoridade dele sim.

O que a regra garante: concluir uma entrega registra que o pedido chegou ao
cliente, e só isso. Não cria recebimento, não reconhece receita, não põe
dinheiro em caixa. É essa separação que a Fase 8 vai conciliar no retorno do
entregador, e é por isso que ela precisa existir escrita antes.

**2. Comprovante financeiro.** `05 §11.3` continuava no escopo, e a Fase 3 já
tinha preparado o terreno: `media_assets.asset_type` aceita
`financial_receipt` desde a 0013, e a 0023 dizia que o bucket privado viria
"nas fases 7+". Então não houve infraestrutura nova de mídia — houve o bucket
que faltava.

**Uma correção de segurança apareceu no caminho.** As policies de
`media_assets` da Fase 3 falavam só de catálogo: como estavam, quem tem
`catalog.view` — o Atendente padrão — enxergaria a linha de um comprovante
financeiro em `/rest/v1`, com nome de arquivo, caminho e autor. O binário
seguia protegido pelo bucket, mas metadado de comprovante também é dado
financeiro (03 §17.3). As policies passaram a depender do `asset_type`.

**PDF não é reprocessado**, de propósito: alterar o binário de um comprovante
seria alterar a evidência. Ele é validado pela assinatura `%PDF-` e guardado
como está. Imagem passa pelo pipeline, que além de provar o formato real
**descarta os metadados** — foto de comprovante costuma trazer GPS junto.

**A evidência congela no estorno.** Enquanto o lançamento pode ser alterado, o
comprovante pode ser trocado ou removido, com autor e motivo. Depois do
estorno, não: é justamente a evidência do que foi registrado, e a reversão
não a apaga.

**Não há OCR e não há leitura automática.** O sistema guarda; quem interpreta
é uma pessoa. Anexar arquivo não confirma pagamento.

**3. Bandeiras não foram semeadas.** Visa, Mastercard e afins são cadastro, e
não regra de domínio (RN-PGTO-006). Semeá-las por suposição seria inventar
quais a Shalon aceita. Débito, crédito e voucher dependem de bandeira ativa, e
isso ficou registrado como **configuração necessária antes do uso real**
dentro da nova dívida do `06` — não como defeito nem como dívida técnica.

**4. Validação E2E de pagamento.** O ciclo completo nunca rodou com
configuração real, porque o ambiente ainda não tem `store_settings` da
Shalon. Virou dívida no `06`, obrigatória antes da produção e sem bloquear a
Fase 8, para ser executada junto do E2E já pendente da Fase 5.

**Onde foi formalizada.** `04-REGRAS-NEGOCIO.md` (RN-PGTO-014, RN-MOTO-004 e
a nota de RN-FIN-002); `03-RLS-RBAC-SEGURANCA.md` §23.2;
`02-MODELO-DADOS-SUPABASE.md` §13.2; `06-PENDENCIAS-VALIDACAO-PRODUCAO.md`.
Migration `0071`.

---

### D-2026-09-21-56 — Um card vertical em todo o cardápio, e combos no banner

**Pedido da Shalon**, com referência visual de aplicativo de delivery: cards
com foto grande, no lugar do que ela descreveu como "tabela com linha
horizontal".

**O diagnóstico não era bem esse.** O que existia no público não é tabela: é
o **card horizontal do design aprovado** — foto de 84px à esquerda, nome,
selos, descrição, preço e CTA à direita. E o painel **já era** uma grade de
cards. Então isto não é correção de desvio: é mudança do design aprovado, e
por isso está registrada aqui (CLAUDE.md §7).

**Houve duas rodadas, e a segunda é a que vale.**

Na primeira eu propus um híbrido: card vertical só nas vitrines
(Recomendados, Mais pedidos, Promoções, Combos) e card horizontal no cardápio
completo. O argumento era que card grande vende e linha compacta deixa achar
— na vitrine a pessoa escolhe, na lista ela procura.

A Shalon viu os dois lado a lado e decidiu **card vertical em tudo**, com
**três por linha no celular**, como na referência. Vale a decisão dela: o
argumento da densidade perde força a três colunas, que é quase a mesma
quantidade de itens por tela que a lista horizontal entregava.

**Restou um card só.** Manter dois componentes com o mesmo papel produziria
duas formas de mostrar a mesma pizza, e a primeira diferença entre elas
viraria bug de design. `CardProduto` é vertical e serve vitrines, cardápio,
categoria e busca.

**Três por linha tem consequência, e ela está no código.** O cartão fica com
cerca de 105px no celular. Por isso o texto encolhe em telas estreitas, o
preço se quebra em prefixo ("a partir de") e valor, e o selo "Indisponível
hoje" saiu do topo da foto — não cabia. A informação não se perdeu: o cartão
inteiro perde opacidade e o botão troca de texto, que são dois sinais e
nenhum deles é só cor (§38). **O alvo de toque do CTA não encolheu**, e
continua em 44px.

> **SUPERADO por D-2026-09-22-60.** O CTA textual "Escolher" foi substituído
> pelo "+" compacto por decisão posterior da Shalon. O destino continua sendo
> a configuração do produto, não uma adição direta ao carrinho.

**Combos saíram da home e foram para o banner.** A Shalon não gostou da seção
"Combos para compartilhar" em cards, e pediu para anexá-la ao banner
principal. Virou uma faixa colada ao banner, com a quantidade, o menor preço
e atalho para a categoria. Os combos continuam no cardápio, dentro da
categoria deles — a faixa é atalho, não é o único caminho.

**No painel, miniatura de 56px — e não foto grande.** Administrar é varrer
preço, disponibilidade e ação; foto grande empurraria isso para fora da tela.
O cartão passou a dizer "sem foto" quando é o caso, porque é no painel que
essa falta é acionável.

**O que este ajuste NÃO resolve, e precisa ser dito.** Hoje **1 de 5 produtos
tem foto**. O card horizontal era tolerante à ausência — o buraco tinha 84px.
O vertical é implacável: o vazio passa a ter o tamanho da imagem. O
placeholder ganhou a tinta da marca e o símbolo em escala para ler como
decisão e não como imagem quebrada, mas isso é paliativo. **Sem fotografia, a
vitrine entrega menos do que promete.** Subir as fotos é o passo que falta, e
nenhum ajuste de layout substitui.

**Arquivos.** `CardProduto.tsx` (reescrito como vertical), `Banners.tsx`
(faixa de combos), `page.tsx` e `categoria/[slug]/page.tsx` do público,
`PainelProdutos.tsx` do painel. `01-DOCUMENTO-MESTRE.md` §62 registra o card,
a grade e o lugar dos combos.

---

### D-2026-09-22-57 — As decisões da Fase 8: entrega, acerto e movimento interno

**Decisão.** Implementar entregas, prestação de contas do motoboy e
movimentações internas mantendo **quatro coisas separadas** que a operação
diária confunde: pedido entregue, pagamento recebido, dinheiro sob
responsabilidade do entregador e dinheiro na gaveta.

**O que ficou decidido, ponto a ponto.**

1. **Uma corrida ativa por entregador.** Índice único parcial sobre
   `driver_runs` em `open`/`out`. Atribuir um segundo pedido ao mesmo motoboy
   entra na corrida existente, não abre outra.

2. **Retirada nunca entra em corrida.** `atribuir_entrega` recusa pedido de
   retirada. Não é restrição de tela: é o que separa os dois caminhos de
   conclusão.

3. **Ou todos saem, ou nenhum sai.** `despachar_corrida` confere o estado de
   todos os pedidos antes de mover qualquer um. Meia corrida na rua e meia na
   loja seria pior que não ter saído (CLAUDE.md §34).

4. **A máquina de estados continua sendo uma só.** Despacho e retorno chamam
   `comando_pedido`; nenhuma rotina da Fase 8 grava `orders.status`
   diretamente (CLAUDE.md §21).

5. **Conferir o retorno não move dinheiro.** Marcar "entregue" conclui o
   pedido e mais nada. O dinheiro continua na rua até o acerto — que é a
   aplicação direta de RN-PGTO-014.

6. **O esperado do acerto é derivado, nunca digitado.** É a soma dos
   recebimentos em dinheiro dos pedidos entregues daquela corrida que ainda
   não entraram em gaveta nenhuma, recalculada dentro da transação. Cartão e
   Pix ficam de fora: não há papel para conferir.

7. **`conciliar_corrida` é a única porta.** É a única rotina do sistema que
   transforma recebimento da rua em `cash_movements`. Sem caixa aberto, o
   acerto é recusado — o valor sairia da rua e não chegaria a lugar nenhum.

8. **A gaveta recebe o que foi RECEBIDO, não o que o motoboy trouxe.** Num
   acerto com falta, o movimento de caixa é o valor dos recebimentos; a
   diferença fica registrada à parte. Inventar um recebimento menor para
   "fechar" falsearia a venda.

9. **Diferença não é desconto.** RN-RUN-005 vira código: nada acontece com o
   salário, nem com o perfil salarial. Transformar a diferença em lançamento
   do funcionário é **outro ato**, de quem tem `employees.finance.manage`, e
   cria vínculo rastreável com a corrida (RN-RUN-006).

10. **O preço do movimento interno vem de `montar_item`.** O mesmo
    configurador do cardápio, do balcão e da alteração. Não existe terceiro
    cálculo (CLAUDE.md §17). O valor é **de referência**: dimensiona, não
    cobra e não fatura.

11. **A parede do salário é de permissão, não de tela.** Movimentações
    internas exigem `internal.view`/`internal.register`, que o Atendente tem;
    o livro do funcionário exige `employees.finance.view`, que ele não tem.
    Registrar o consumo de alguém não abre o livro dessa pessoa.

12. **Estorno preserva a evidência.** Movimento interno e lançamento do
    funcionário viram `reversed` com quem, quando e por quê; os itens
    permanecem. E o movimento que já virou lançamento não pode ser estornado
    antes do lançamento — senão a dívida ficaria de pé sem o fato que a
    originou.

**Motivo.** Cada um dos doze pontos é um jeito diferente de o caixa fechar com
um número falso, ou de uma diferença virar desconto sem ninguém decidir.

**Onde foi formalizado.** `02-MODELO-DADOS-SUPABASE.md` §11.1–11.4, §13.3 e
§14.1–14.2; `03-RLS-RBAC-SEGURANCA.md` §19.4, §19.5, §33.9 e §33.12. As
regras de negócio **já existiam** em `04-REGRAS-NEGOCIO.md` — RN-MOTO-001..004,
RN-RUN-001..007, RN-FUNC-003, RN-CONS-001..005, RN-CORT-001/002,
RN-PERDA-001/002, RN-CLASS-001 e RN-EMPFIN-001..003. Nenhuma regra nova foi
criada nesta fase.

**Dois defeitos encontrados pelos próprios testes, e corrigidos por migration
nova (o arquivo aplicado nunca é editado):**

- a 0076 gravava o **tamanho** no lugar da **variação** no item do movimento
  interno; a chave estrangeira recusava, e nenhum consumo de pizza podia ser
  registrado. Corrigido pela 0078;
- `dinheiro_na_rua` só contava pedido já conferido como entregue, então
  mostrava R$ 0,00 **justamente enquanto o motoboy estava na rua**. Corrigido
  pela 0079, junto com a escala de `dinheiro_fora_da_gaveta()`, que devolvia
  `0` sem valor e `40.00` com valor.

**Arquivos.** Migrations `20260922100000` a `20260922100700`;
`supabase/tests/entregas_fase8.sql` (112 cenários);
`src/application/entregas/` e `src/application/equipe/`;
`/admin/entregas` e `/admin/equipe` com seus painéis.

---

### D-2026-09-22-58 — Complemento da Fase 8: A-18, A-19 e gestão de equipe

**Decisão.** Resolver as duas lacunas normativas abertas em `D-2026-09-22-57` e
completar o item de gestão de funcionários do plano (§12.3/§12.4).

**A-18 — transferência excepcional em rota. Virou RN-RUN-008 e RN-RUN-009.**

O que ficou decidido: depois que o pedido sai, **não existe troca de motoboy**;
existe transferência de responsabilidade, que é outra coisa. Por pedido, não
pela corrida. Motivo obrigatório. Quem saiu com o pedido **permanece** no
histórico, com situação `transferred` — a diferença entre "ia levar"
(`reassigned`) e "estava levando" é o que o acerto precisa saber. O pedido
continua em rota: nada o devolve para "pronto".

O ponto financeiro é o que exigiu modelagem a mais, como a autorização previa:
**dinheiro já recebido fica com quem recebeu**, dinheiro ainda não recebido
passa com a entrega. `payments.responsible_driver_run_id` carrega essa resposta,
e `dinheiro_da_corrida` virou a fonte única — o painel e o acerto consultam a
MESMA função, porque duas somas parecidas divergiriam na primeira
transferência e o mesmo dinheiro apareceria em duas corridas.

**A-19 — adiantamento pela gaveta. Virou RN-EMPFIN-004.**

Um fato, dois livros: o lançamento `advance` e a saída física do caixa nascem
na mesma transação, com o mesmo valor e vínculo em ambas as direções. Tipo
próprio `employee_advance`, e não sangria — sangria é a Shalon levando o
próprio dinheiro para outro lugar dela; adiantamento é dinheiro que sai para a
mão de uma pessoa. A reversão devolve os dois; `reverter_movimento_caixa`
**recusa** estornar essa metade pelo extrato. Nada altera salário.

**§12.3/§12.4 — equipe, acesso e papéis.** Cadastro, edição, desligamento por
data e reativação; vínculo de acesso; atribuição de papéis. Três conceitos que
a interface não funde: funcionário ≠ `app_user` ≠ papel. O motoboy é a prova —
trabalha, entrega, presta contas, e `acesso` é nulo.

**RN-RBAC-005, nova.** Ninguém concede o que não tem. Foi preciso **remover as
policies de INSERT e DELETE de `user_roles`**: a checagem não poderia morar só
na RPC se `/rest/v1` aceitasse o INSERT direto — quem tivesse `roles.manage` se
promoveria pela API.

**Três defeitos encontrados pelos próprios testes**, todos corrigidos por
migration nova (o arquivo aplicado nunca é editado):

1. `lancar_no_funcionario` lia um `record` nunca atribuído quando não havia
   forma de pagamento — **nenhum lançamento de consumo ou diferença gravava**.
   É o mesmo tropeço que a Fase 7 teve em `registrar_lancamento`. Corrigido
   pela 0084 com variável escalar;
2. `salvar_funcionario` tinha o mesmo problema com o "antes" da auditoria —
   **criar funcionário falhava sempre**. Corrigido pela 0086;
3. transferir a **última** entrega pendente deixava a corrida de origem presa
   em `out` para sempre, e o dinheiro que o motoboy tivesse na mão nunca
   achava a porta do caixa. Corrigido pela 0085: a corrida esvaziada passa a
   "voltou — a acertar".

**Onde foi formalizado.** `04-REGRAS-NEGOCIO.md` RN-RUN-008, RN-RUN-009,
RN-EMPFIN-004 e RN-RBAC-005; `02-MODELO-DADOS-SUPABASE.md` §11.2, §11.5,
§11.3, §12.3 e §13.3; `03-RLS-RBAC-SEGURANCA.md` §19.6, §19.7 e §33.12;
`05-PLANO-IMPLEMENTACAO.md` §12.3/§12.4.

**Testes.** `supabase/tests/equipe_fase8b.sql`, 120 cenários. Regressões
re-executadas: Fase 2 (48), Fase 7 (172) e Fase 8 (112), todas verdes.

**Arquivos.** Migrations `20260922110000` a `20260922110600`;
`src/application/entregas/` e `src/application/equipe/`;
`GestaoDaEquipe.tsx`, `PainelDeEntregas.tsx` e `PainelDaEquipe.tsx`.

### D-2026-09-22-59 — A foto e o banner nunca chegaram ao cliente anônimo

**O defeito.** No site publicado, o cardápio aparecia sem **nenhuma foto de
produto** e sem **nenhum banner**. Localmente estava tudo certo. Não era deploy,
variável de ambiente nem `next.config.ts`: era permissão.

`cardapio_publico`, `buscar_catalogo` e `banners_publicos` são
`SECURITY INVOKER` de propósito — é a RLS de `products` que exclui produto
inativo do cardápio, e não um `where` dentro da projeção. Mas as três faziam
`join` em `media_assets` para obter o caminho da imagem, e `media_assets` só tem
policy de leitura `to authenticated` com `catalog.view`. Para o `anon` o `join`
não casava, e o produto vinha **sem** `imagem_path`. Medido como `anon`:
`produtos=9, com_foto=0, banners=0`.

**Por que durou tanto.** Toda validação visual foi feita no navegador de
desenvolvimento, que carrega o cookie de sessão da Owner. Logado, o `join`
casa e a foto aparece. O site nunca tinha sido visto como o cliente o vê.

**A correção óbvia foi recusada.** Tornar as três projeções `SECURITY DEFINER`
faria a foto aparecer — e faria o catálogo passar por cima da RLS de
`products`, expondo produto inativo. Trocaria um defeito visual por um
vazamento.

**O que foi feito.** Migration `20260922120000_caminho_publico_da_midia.sql`
cria `public.caminho_publico_da_midia(uuid)`, `stable security definer`, que
devolve o `storage_path` de um asset **somente se o bucket dele for público**
(`storage.buckets.public`). As três projeções passam a chamá-la em vez de
juntar `media_assets`, e continuam `SECURITY INVOKER`: quem decide **quais
produtos** aparecem continua sendo a RLS; a função decide apenas **qual caminho
de arquivo já é público de qualquer forma**. `banners_publicos` mantém a
semântica de "banner precisa de imagem" com
`caminho_publico_da_midia(...) is not null`.

O que a função não faz: não expõe `media_assets`, não lê bucket privado e não
devolve nada de `comprovantes`. O anônimo continua lendo `0` de `media_assets`.

**Onde foi formalizado.** `03-RLS-RBAC-SEGURANCA.md` §8.1 e §23.1.

**Testes.** `supabase/tests/midia_publica_fase4b.sql`, 19 cenários, 19 verdes —
todos os relevantes rodando como `anon`, incluindo os negativos: comprovante
financeiro não devolve caminho, produto inativo com foto não aparece, e
`media_assets` continua fechada. Regressão da Fase 4 re-executada:
`publico_fase4.sql`, 96 cenários, 96 verdes.

Nessa re-execução, nove cenários de busca passaram a contar apenas as próprias
fixtures (`slug like '%-f4'`). O banco de desenvolvimento já tem produtos reais
que casam com termos como "calabresa": era acoplamento de ambiente, não
regressão — a mesma correção já aplicada em `rls_fase2.sql`.

**Sem redeploy.** A correção é inteiramente de banco; nenhum arquivo do
Next.js mudou.

**Lição registrada.** Superfície pública se valida **sem sessão**. Guia
anônima do navegador, ou teste rodando como `anon`. Foi o que este arquivo de
teste passou a garantir.

---

### D-2026-09-22-60 — CTA compacto "+" nos cards do cardápio

**Pedido da Shalon.** O botão textual "Escolher" dos cards do cardápio público
foi substituído por um botão compacto com "+".

**Comportamento preservado.** O controle continua sendo um link para a rota do
produto e abre sua configuração; não adiciona o item diretamente ao carrinho.
Para não depender apenas do símbolo, o link mantém alvo de toque de 44 × 44px
e recebe o rótulo acessível "Escolher [produto]".

**Escopo.** A mudança foi feita no `CardProduto`, portanto vale para vitrines,
cardápio completo, categorias e busca. O estado indisponível continua textual,
pois não oferece ação. A lista de favoritos não usa esse card e conserva sua
ação textual.

**Onde foi formalizada.** `01-DOCUMENTO-MESTRE.md` §62 e
`src/app/(publico)/_ui/CardProduto.tsx`.

---

### D-2026-09-22-61 — Navegação administrativa clara e hierárquica

> **PARCIALMENTE SUPERADO por D-2026-09-22-62.** A direção clara permanece,
> mas o cabeçalho escuro da marca também foi removido após a avaliação visual.

**Pedido da Shalon.** Depois de avaliar o menu implementado conforme o design
original, a Shalon considerou que a grande superfície marrom deixava o sistema
pesado e autorizou a direção visual proposta: menu claro e quente, com a cor da
marca usada como destaque em vez de preencher toda a navegação.

**Direção aprovada.** O cabeçalho compacto continua escuro para sustentar logo
e identidade. A área de navegação usa fundo `#FCFAF7`, borda `#E7E2DC`, texto
`#292524` e ícones neutros. Apenas o item ativo recebe fundo amarelo suave,
barra laranja e ícone de destaque. Itens inativos usam peso médio, reservando o
peso semibold ao ativo. No tema escuro, a navegação usa grafite neutro em vez
de retornar ao marrom dominante.

**Consistência responsiva.** Desktop e drawer móvel usam o mesmo componente de
navegação, incluindo grupos, ícones, estado ativo e fechamento após navegar.

**O que não mudou.** Permanecem a paleta institucional, logo, tipografia,
largura do menu, rotas, agrupamentos, alvos mínimos de toque e tema de acento
vermelho do administrativo. É uma revisão aprovada do shell, não uma troca do
design system inteiro.

**Onde foi formalizada.** `01-DOCUMENTO-MESTRE.md` §61;
`05-PLANO-IMPLEMENTACAO.md` §5; `src/ui/tokens/tokens.css`;
`MenuLateralAdmin.tsx`, `DrawerAdmin.tsx` e o layout administrativo.

---

### D-2026-09-22-62 — Cabeçalho do menu também usa superfície clara

**Avaliação da Shalon.** A navegação clara melhorou o painel, mas o bloco
marrom remanescente no topo ainda manteve parte do peso visual anterior.

**Revisão aprovada.** Logo e identificação do painel passam a usar a mesma
superfície clara e quente do restante do menu, com apenas uma borda sutil para
separar marca e navegação. O texto "Painel administrativo" usa o laranja de
destaque. No drawer móvel, o botão de fechar também passa a ser neutro. No tema
escuro, cabeçalho e navegação acompanham juntos o grafite definido para o menu.

**Onde foi formalizada.** `01-DOCUMENTO-MESTRE.md` §61; layout administrativo
e `DrawerAdmin.tsx`.

---

### D-2026-09-22-63 — Navegação e modais sem cascatas desnecessárias

**Percepção da Shalon.** A troca entre páginas e a abertura de modais tinham
atraso perceptível. A animação oficial (120–220ms) não era a causa: o conteúdo
esperava autenticação e leituras remotas, por vezes em várias ondas, antes de
começar a transição.

**Autenticação.** Proxy e sessão interna passam a validar identidade com
`getClaims()`, recomendação oficial do Supabase para SSR. Em projetos com chave
assimétrica, a assinatura é verificada com JWKS em cache em vez de consultar o
Auth a cada rota. A sessão interna continua verificando no banco usuário ativo,
papéis e permissões; RLS permanece como autoridade.

**Deduplicação segura.** `obterSessaoInterna` e leituras repetidas do catálogo
usam `React.cache`, cujo ciclo é apenas a renderização corrente. Não existe
cache compartilhado entre requisições, usuários ou navegações. Pedidos, caixa,
disponibilidade e permissões não ganharam cache persistente.

**Paralelização.** Leituras independentes começam juntas. Foram removidas
cascatas em Pedidos, criação e edição de produto e painéis de catálogo. Não se
instalou biblioteca nem se moveu a autoridade dos dados para o navegador.

**Modais como rotas.** Novo pedido (`/admin/pedidos/novo`), novo produto
(`/admin/produtos/novo`) e edição (`/admin/produtos/editar/[id]`) são rotas
canônicas. Em navegação SPA, rotas paralelas/interceptadas preservam a tela ao
fundo e carregam somente o slot modal, com skeleton próprio. Em acesso direto,
continuam páginas completas. Voltar/avançar controla abertura e fechamento.
O endereço antigo `/admin/produtos/[id]` permanece funcional para acesso direto.

**Técnicas recusadas.** Sem `staleTimes` experimental; sem cache global de dado
operacional; sem prefetch de todos os produtos; sem temporizador ou spinner
artificial; sem remover as animações curtas que explicam mudança de estado.

**Onde foi formalizada.** `01-DOCUMENTO-MESTRE.md` §61;
`05-PLANO-IMPLEMENTACAO.md` §5; `07-MOVIMENTO-E-DESEMPENHO.md` §§5, 7 e 8;
`middleware.ts`, `application/auth/sessao.ts`, consultas do catálogo e slot
`admin/@modal`.

---

### D-2026-09-22-64 — Anomalia histórica de migration e prova de replay

**O que foi encontrado, no checkpoint anterior à Fase 9.** A migration
aplicada no banco de desenvolvimento com o nome
`montar_item_sem_record_indefinido` (versão `20260919012630`, 7.804
caracteres) **não tem o corpo no Git**. O arquivo correspondente,
`supabase/migrations/20260919100200_montar_item_escalares.sql`, tem 16 linhas
e é só uma nota sobre o defeito — e afirma, incorretamente, que "o corpo
completo foi aplicado nesta migration". O mesmo vale, em menor escala, para
`20260919100100_mensagens_ao_cliente.sql`, que descreve em comentário a
alteração de `montar_item` sem trazer o corpo.

Isso **viola a reprodutibilidade histórica** exigida por `CLAUDE.md` §11: o
replay do repositório não reconstrói aquele estado intermediário, porque ele
existe apenas no banco.

**O que NÃO foi feito.** A migration histórica aplicada não foi editada.
`supabase_migrations.schema_migrations` não foi tocada. Nenhuma migration
vazia foi criada para disfarçar a diferença. O arquivo antigo também não foi
reescrito para "parecer" igual ao banco depois do fato.

**Por que o estado atual continua reproduzível.** `montar_item` foi recriada
integralmente depois, por
`20260919140450_montar_item_sem_window_em_agregado.sql`, que está versionada
e completa. Perdeu-se o passo do meio, não o resultado.

**A prova: replay limpo (22/09/2026).** Banco vazio, apenas os 88 arquivos
versionados, aplicados em ordem em projeto Supabase descartável — o projeto
`pizzariashalon` (`embpaodotujsxuaeptft`), que estava comprovadamente vazio
(0 tabelas, 0 rotinas, 0 usuários, 0 buckets) e foi autorizado para isso. O
banco de desenvolvimento **não foi tocado**.

Resultado: os 88 arquivos executaram sem erro. Comparado ao banco de
desenvolvimento, o schema reconstruído tem md5 idêntico em **colunas**,
**constraints** e **índices**; 58 tabelas, 119 rotinas, 150 policies, 229
índices e 383 constraints dos dois lados. As 119 rotinas coincidem,
`montar_item` inclusive — idêntica byte a byte fora de comentário
(md5 `bb1e312a57f0b664ef59f0517d618abf`).

**Regressões no banco reconstruído:** `publico_fase4.sql` 96/96,
`pedido_manual_fase6.sql` 60/60, `midia_publica_fase4b.sql` 19/19.

**Duas divergências COSMÉTICAS encontradas, e nenhuma semântica.** As duas
estão do lado do banco de desenvolvimento, não dos arquivos:

1. `loja_aberta` no banco de desenvolvimento não tem os comentários que o
   arquivo da 0021 tem. Removidos os comentários e normalizado o espaço, as
   duas definições são idênticas;
2. quatro policies de `storage.objects` chamam-se, no banco de
   desenvolvimento, `catalogo ... com catalog manage` — com espaço no lugar do
   ponto de `catalog.manage`. Mesmos comandos, mesmos papéis, mesmos
   predicados; muda só o nome, que não é referenciado em lugar nenhum.

Ambas são da mesma família do achado principal: o texto aplicado ao banco de
desenvolvimento divergiu cosmeticamente do arquivo. Ficam registradas, e não
justificam editar migration aplicada.

**Regra daqui para frente.** Registrada em `supabase/README.md`: antes de
aplicar, `arquivo no Git → aplicar → conferir` por md5; depois de aplicada a
um banco compartilhado, **o arquivo é imutável**, e correção é migration
nova. É `CLAUDE.md` §11 aplicado ao tempo — não há regra de produto nova.

**Sobra do replay.** O projeto descartável continua existindo com o schema
reconstruído. Ele não tem dado de ninguém e pode ser apagado pelo painel do
Supabase quando a Shalon quiser.

---

### D-2026-09-23-65 — A verdade analítica da Fase 9 e a régua de cadência

**Decisão.** A inteligência da Fase 9 é construída sobre distinções que o
sistema **não pode dissolver em um número só**, e sobre uma régua de
comportamento que se recusa a classificar quem não tem histórico suficiente.

**As distinções, ditas nos nomes e mantidas nas telas.**

| Conceito | O que é | Onde vive |
|---|---|---|
| Venda registrada | pedido `completed`, datado por `completed_at` | `vendas_no_periodo` |
| Faturamento recebido | pagamento `confirmed`, datado por `received_at` | `recebido_no_periodo` |
| Ainda fora da gaveta | recebido em dinheiro sem sessão de caixa | `recebido_no_periodo` |
| Não recebido do período | venda registrada − faturamento recebido | `resumo_analitico` |
| Cortesia, consumo, perda | saiu da cozinha e **não é receita** | `internos_no_periodo` |
| Cancelado / rejeitado | não virou venda, datado pelo histórico de status | `nao_vendas_no_periodo` |

Nenhuma delas é somada às outras em lugar nenhum, e o painel mostra a
diferença entre vender e receber **em voz alta**, em vez de escondê-la
(`CLAUDE.md` §24, §27, §28). Não existe, e não deve existir, campo de lucro,
margem ou CMV: sem custo no sistema, esses números não existem.

**Competência no fuso da loja.** Todo recorte de período é construído por
`periodo_analitico`, que devolve o intervalo meio-aberto `[inicio, fim)` a
partir da data local da loja, e o período anterior de **mesma duração**,
imediatamente antes. Comparação de 30 dias é sempre contra 30 dias.

**Variação sem base não vira percentual.** `variacao_percentual` devolve
`comparavel: false` e percentual nulo quando a base é zero. Sair de R$ 0,00
não é "subir 100%".

**A régua de cadência (RN-CRM-004 e RN-CRM-005).** A cadência de cada cliente
é a **mediana** dos intervalos entre compras concluídas — individual, nunca
uma média da base. Sobre ela:

- **1 compra → `dados_insuficientes`.** Não há intervalo para comparar.
- **2 compras → `base_fraca`.** Há um intervalo, e um intervalo não é um
  hábito. A tela mostra os fatos — intervalo observado, dias desde a última
  compra, última compra, ticket médio — e **não** emite veredicto.
- **3 ou mais compras → classificação comportamental:** `recorrente` até 1×
  a cadência, `atencao` acima de 1× e até 2×, `afastado` acima de 2×.

Os cortes `1×` e `2×` são decisão normativa explícita desta data, porque os
documentos anteriores falavam em "atenção" e "afastado" sem fixar a régua.

**Os filtros objetivos de ausência (15/30/60/90 dias) são independentes** da
cadência e **incluem** clientes de 1 e 2 compras quando atendem ao critério.
Quem nunca comprou não entra: não está ausente, está sem histórico.

**Motivo.** A régua antiga classificava pela razão matemática mesmo com dois
pontos: alguém que pediu duas vezes com quatro dias de intervalo e ficou doze
sem pedir seria declarado "afastado". A conta estava certa e a afirmação
estava errada — havia matemática, não havia comportamento.

**Remarketing é assistido, e continua assistido.** O sistema escolhe com quem
falar, prepara o texto e abre o WhatsApp; quem fala é a pessoa. O contato
nasce com desfecho **nulo**, que significa "preparado", nunca "enviado" nem
"sem resposta" — abrir o link não é falar com ninguém. "Pediu para não
receber" retira o consentimento na mesma transação. Compra posterior é fato
**temporal** e nenhuma coluna, rótulo ou frase afirma causalidade
(`CLAUDE.md` §31, RN-RMKT-005).

**Relatórios têm duas permissões.** `reports.view` para ver, `reports.export`
para levar embora, **mais** a permissão do domínio de cada relatório —
`reports.view` não é porta lateral para o caixa de quem não pode ver caixa. A
exportação carrega as mesmas ressalvas da tela para dentro do CSV, do Excel e
do PDF, porque número exportado sem ressalva vira soma errada meses depois.
Nenhum relatório contém salário, adiantamento ou saldo de funcionário
(`CLAUDE.md` §15).

**Alertas não são inventados.** O carimbo de "atrasado" só existe quando há
limite configurado em `alert_thresholds`, que nasceu vazia de propósito. Sem
limite, a espera aparece com o tempo e sem veredicto (RN-DASH-003).

**Onde foi formalizada.** `04-REGRAS-NEGOCIO.md` RN-CRM-004 e RN-CRM-005;
migrations `20260922130000` a `20260922200000` e `20260923040000` a
`20260923060000`; `supabase/tests/inteligencia_fase9.sql` (98 cenários);
`src/application/{analitico,clientes,remarketing,relatorios}`; telas `/admin`,
`/admin/clientes`, `/admin/remarketing` e `/admin/relatorios`.

---

### D-2026-09-23-66 — Três defeitos encontrados pelos próprios testes da Fase 9

Registrados porque foram corrigidos por **migration nova**, e não por edição
de migration aplicada — a regra de imutabilidade de D-2026-09-22-64 valendo
na prática, inclusive para arquivos criados horas antes.

1. **A central de atenção estourava inteira** (`20260923050000`). O bloco de
   clientes fazia `jsonb_agg(...) ... order by ... limit 5` **depois** de
   agregar; Postgres recusa com 42803. Quem tinha `customers.view` não via
   central nenhuma. Ordenar e cortar passou para dentro da subconsulta.

2. **A página de clientes era cortada antes de ser ordenada**
   (`20260923040000`). O `limit` caía sobre o conjunto filtrado sem ordem, e a
   ordenação escolhida era aplicada só na montagem do JSON: pedir "os 50 mais
   ausentes" devolvia 50 clientes quaisquer, ordenados entre si. O total no
   topo ficava certo e a lista ficava errada.

3. **A busca por nome virava busca por telefone** (`20260923060000`). A busca
   reduzia o texto a dígitos e casava contra o WhatsApp; "Duas F9" virava o
   fragmento `9` e retornava quase toda a base com cara de resultado. Agora o
   ramo de telefone só entra com **4 ou mais dígitos**.

Os três eram silenciosos: devolviam algo plausível em vez de erro. Os dois
últimos só apareceram porque o teste conferiu **quem** estava na lista, e não
apenas quantos.

---

### D-2026-09-23-67 — A-22: sem histórico de disponibilidade na V1

**Decisão.** A V1 **não** passa a registrar histórico temporal de
disponibilidade de produto. Nenhuma tabela e nenhum gatilho de histórico
serão criados agora com o objetivo de melhorar o indicador de baixa venda.
A-22 sai das decisões em aberto e fica **postergada para evolução futura**.

**O comportamento conservador que fica valendo, e que é a razão de a
decisão não bloquear nada:**

- não reconstruir passado que não existe — nenhum histórico retroativo é
  fabricado, nem por estimativa, nem por interpolação;
- não assumir que o estado de hoje valeu o período inteiro;
- não rotular um produto como de baixa venda sem base confiável: só entra no
  recorte quem esteve no catálogo o período **inteiro** e continua disponível
  agora, e quem não entra aparece com o **motivo**;
- informar a limitação onde ela importa — o ranking carrega, em texto, a
  frase "a disponibilidade é a de agora: o sistema não guarda histórico de
  quando um produto foi pausado".

**Motivo.** Responder "ficou indisponível metade do mês?" exigiria registrar
os três níveis que compõem a disponibilidade efetiva — produto, categoria e
variação (RN-DISP-004) — e recompor o intervalo efetivo na leitura. É
modelagem nova, gatilho em três tabelas quentes do catálogo, RLS nova e uma
regra nova de recomposição no tempo: um subsistema pequeno, não uma coluna.
E ele só passaria a valer para o futuro, sem melhorar nada do que já
aconteceu.

Enquanto não houver evidência de que a disponibilidade muda a ponto de
distorcer o ranking, a recusa explícita custa nada e não engana ninguém — que
é exatamente o critério da Fase 9: quando falta base, o sistema diz que falta
base.

**Reabre quando.** A Shalon relatar que pausa produtos com frequência e que
o ranking está distorcido por isso. Aí a decisão volta como regra e modelagem
próprias — nunca como estimativa silenciosa dentro do indicador.

**Onde foi formalizada.** Aqui, e nesta decisão apenas. A avaliação técnica
que levou a ela está em `06-PENDENCIAS-VALIDACAO-PRODUCAO.md`, que é
documento de validação e **não** é fonte normativa.

---

---

# Decisões em aberto

Nenhuma implementação que dependa destes pontos deve começar antes da decisão.

| # | Decisão pendente | Bloqueia | Onde será registrada |
|---|---|---|---|
| ~~A-01~~ | ~~Framework~~ | — | ✅ Resolvida em D-2026-09-17-07: Next.js com App Router |
| ~~A-02~~ | ~~Gestor de pacotes~~ | — | ✅ Resolvida em D-2026-09-17-07: npm |
| ~~A-03~~ | ~~Estratégia de estilização~~ | — | ✅ Resolvida em D-2026-09-17-07: Tailwind CSS, sem redesign |
| ~~A-04~~ | ~~Versões efetivamente adotadas~~ | — | ✅ Resolvida em D-2026-09-17-12; registradas em `CLAUDE.md` §44-A.1 |
| ~~A-12~~ | ~~Otimização do logo~~ | — | ✅ Resolvida em D-2026-09-18-25: 1.409 kB → 62,5 kB, sem mudança de aparência |
| **A-13** | **Revisar TypeScript 7 e ESLint 10** quando `typescript-eslint` e `eslint-plugin-react` passarem a suportá-los | Manutenção | `CLAUDE.md` §44-A.1 |
| **A-05** | **Credencial do Google Maps Platform** — a integração está escrita, coberta por teste e atrás do contrato de provedor (D-2026-09-19-35), mas nunca foi exercitada contra o Google. Deixa de ser decisão em aberto e passa a ser **dívida de validação**: os passos exatos, as restrições de chave e o roteiro de E2E estão em `06-PENDENCIAS-VALIDACAO-PRODUCAO.md`. **Não bloqueia as próximas fases; bloqueia a produção** | Antes da produção | `06-PENDENCIAS-VALIDACAO-PRODUCAO.md` |
| **A-06** | **Adaptações visuais de C1–C8** — telas que o design aprovado não possui. As cinco da Fase 3 estão registradas em D-2026-09-18-22; as demais seguem fase a fase | Fases 4 a 8 | A propor fase a fase, com aprovação prévia |
| **A-07** | **Dados reais da Shalon** — preços, sabores, combos, horários, faixas de distância, chave Pix, endereço definitivo | Fase 11 (seed de produção) | `01-DOCUMENTO-MESTRE.md` §78 |
| **A-08** | **Impressão 58 mm** — a representação da comanda está implementada e testada em domínio puro; o **transporte físico não**. O fato decisivo é que a Web Bluetooth API não fala Bluetooth Clássico/SPP, só BLE — então a primeira informação necessária é o perfil do equipamento, e não uma preferência de implementação. Estratégias possíveis, riscos por plataforma, testes físicos obrigatórios e critério de aprovação da POC estão em `06-PENDENCIAS-VALIDACAO-PRODUCAO.md`. **Não bloqueia o restante da Fase 6** | Antes da produção | `06-PENDENCIAS-VALIDACAO-PRODUCAO.md` |
| ~~A-09~~ | ~~Identidade Git~~ | — | ✅ Resolvida em D-2026-09-17-10: Marcelo <mgc.info.new@gmail.com>, apenas local |
| ~~A-10~~ | ~~Criação do remoto e primeiro `push`~~ | — | ✅ Resolvida em D-2026-09-18-19: `github.com/mgcnew/pizzaria-shalon`, privado |
| **A-11** | **Projeto Supabase de PRODUÇÃO** e separação dev/prod — o de desenvolvimento existe (D-2026-09-18-15); falta o de produção e a gestão de segredos dele | Fase 11 | `05-PLANO-IMPLEMENTACAO.md` §15 |
| ~~A-14~~ | ~~Criação de usuários internos pela interface~~ | — | ✅ Em D-2026-09-22-58: `/admin/equipe` cadastra funcionário, **vincula** acesso e atribui papéis. O que resta — criar a conta em si — virou **A-20** |
| ~~A-16~~ | ~~Ranking "Mais pedidos"~~ | — | ✅ Resolvida em D-2026-09-19-44: `mais_pedidos`, 30 dias móveis, concluídos, por quantidade, meio a meio por fração |
| ~~A-17~~ | ~~Busca pública sem acento e sem caixa~~ | — | ✅ Resolvida em D-2026-09-19-28: `unaccent` + filtrar antes de precificar; sem índice, por medição |
| ~~A-18~~ | ~~Troca de motoboy com o pedido já na rua~~ | — | ✅ Resolvida em D-2026-09-22-58: virou **RN-RUN-008** e **RN-RUN-009** |
| ~~A-19~~ | ~~Adiantamento pago pela gaveta~~ | — | ✅ Resolvida em D-2026-09-22-58: virou **RN-EMPFIN-004** |
| ~~A-20~~ | ~~Criação da conta de login do funcionário~~ | — | ✅ Em D-2026-10-15-121: convite por e-mail em `/admin/equipe`, com `service_role` restrito a uma função `server-only`. Falta validar o envio real |
| ~~A-21~~ | ~~Conteúdo dos papéis (`role_permissions`)~~ | — | ✅ Resolvida em D-2026-09-23-69, na Fase 10. A escalada **era real e foi reproduzida**: ator com `roles.manage` e sem `finance.*` concedeu as duas à vítima por escrita direta, inclusive em papel **já atribuído**. Fechada a escrita direta e criada `definir_permissoes_do_papel`, que valida o **conjunto final** |
| ~~A-22~~ | ~~Histórico de disponibilidade de produto~~ | — | ✅ Resolvida em D-2026-09-23-67: **não** na V1. O comportamento conservador fica: sem passado fabricado, sem presumir que o estado de hoje valeu o período, sem rótulo de baixa venda sem base, e a limitação dita em texto no ranking. Postergada para evolução futura |
| **A-15** | **Política de senha, MFA e bloqueio por tentativa** do Supabase Auth — não configurados; a V1 usa o padrão do projeto. A **recuperação de senha** saiu desta pendência: foi implementada em D-2026-09-19-51, com o mínimo de 8 caracteres. O que resta é política de complexidade, MFA, expiração e bloqueio | Fase 10 (hardening) | `03-RLS-RBAC-SEGURANCA.md` §25 |


### D-2026-09-23-68 — Isolamento do bucket `comprovantes` por namespace de domínio

**Contexto: vulnerabilidade confirmada na Fase 10.** O bucket privado
`comprovantes` é compartilhado por mais de um domínio, e as policies decidiam
por `bucket_id` mais uma permissão ampla — nunca pela entidade dona do
arquivo. Teste adversarial com papéis customizados provou o vazamento nos dois
sentidos: papel com `internal.view` e **sem** `finance.view` listava e lia o
comprovante financeiro, com metadados, e inseria objeto no domínio financeiro;
o simétrico valia para `finance.*` contra o anexo interno. Não era explorável
no seed atual — o Atendente tem as duas permissões e só o financeiro grava no
bucket — mas o sistema suporta papel customizado, e CLAUDE.md §15 exige que
registrar consumo não conceda acesso a histórico financeiro sensível.

**Decisão.** Manter **um único** bucket privado e estabelecer **namespaces de
domínio obrigatórios e não sobrepostos**, verificáveis pelo próprio caminho.
Não criar buckets separados na V1. Não usar consulta genérica a
`media_assets` como mecanismo principal de autorização do Storage.

```text
financeiro/<entidade_id>/<uuid>.<ext>   →  finance.view / finance.create
interno/<entidade_id>/<uuid>.<ext>      →  internal.view / internal.register
```

**Regra fundamental: permissão de um domínio jamais concede acesso ao
namespace de outro.** Escrita não concede leitura. `DELETE` só existe onde há
fluxo que remove — hoje, apenas o financeiro. `UPDATE` não existe em namespace
algum.

**Segunda metade da correção: o caminho do cliente não é autoridade.**
`anexar_comprovante` passa a conferir namespace, forma do caminho,
correspondência entre o UUID da entidade **dentro** do caminho e o lançamento
que está sendo anexado, existência do objeto no bucket, caminho ainda não
registrado, e grava `bucket` e `asset_type` por conta própria. A Server Action
não é fronteira de segurança: a RPC é chamável diretamente por qualquer
autenticado.

**Escopo deliberadamente limitado.** O namespace `interno/` é declarado, mas
nenhum fluxo o alimenta — as colunas `attachment_asset_id` de
`internal_product_movements`, `employee_ledger_entries` e
`driver_run_settlements` existem e estão vazias. Nenhuma funcionalidade nova
foi criada para preenchê-las. Se algum desses domínios vier a ter anexo
próprio, **qual permissão o autoriza é decisão a tomar antes** — não se herda
`internal.*` por ter a coluna.

**Onde foi formalizada.** `03-RLS-RBAC-SEGURANCA.md` §23.2 e §23.3.
Migrations `0103` (policies por namespace) e `0104` (validação do vínculo).

**Sem migração de arquivo.** Comprovado antes da correção: zero objetos no
bucket, zero `media_assets` nele e zero `attachment_asset_id` não nulo nas
quatro tabelas.

**Validação pendente.** A remoção pela **API de Storage** com identidade real
dos papéis não pôde ser exercitada: a Supabase mantém o trigger
`protect_objects_delete`, que bloqueia `DELETE` direto por SQL, e não há
sessão autenticada desses papéis customizados no ambiente de
desenvolvimento. A policy de remoção foi verificada por leitura e por teste
via SQL; o exercício ponta a ponta fica em
`06-PENDENCIAS-VALIDACAO-PRODUCAO.md`.

---

### D-2026-09-23-69 — A-21 resolvida: ninguém concede permissão que não possui

**A lacuna era real, e foi reproduzida antes de corrigir.** Ator: papel
customizado com `roles.manage` + `orders.view`, **sem** `finance.view` e
**sem** `finance.reverse`.

| Ataque | Antes |
|---|---|
| 1 e 3 — `insert` direto em `role_permissions` | **funcionou** |
| 2 — criar papel ponte e armá-lo | **funcionou** |
| 4 — `delete` direto | **funcionou** |
| 5 — atribuir a outra pessoa papel com permissão que o ator não tem | bloqueado por RN-RBAC-005 |
| 6 — atribuir esse papel a si próprio | bloqueado por RN-RBAC-005 |
| **retroativo** — engordar papel **já atribuído** | **funcionou** |

O que decidiu a classificação não foi a linha inserida, foi o **poder
efetivo**: ao final, a vítima tinha `finance.view = true` e
`finance.reverse = true` — duas permissões que o ator nunca possuiu.

`definir_papeis` já cumpria RN-RBAC-005 e matou os ataques 5 e 6. Ela valida
no instante da atribuição; o caminho retroativo não passa por ela.

**Decisão.** `role_permissions` deixa de ser superfície genérica de CRUD. As
policies de `INSERT` e `DELETE` — que exigiam apenas `roles.manage` — foram
removidas. A leitura permanece, porque a sessão precisa dela para montar as
permissões efetivas.

A escrita passa a ter uma porta só: **`definir_permissoes_do_papel`**, que
valida o **conjunto final** do papel, não o delta. Se o papel terminaria com
`{A,B,X}` e o ator não tem `X`, recusa — ainda que a operação estivesse
apenas acrescentando `B`. É o que impede escalada por construção incremental.

**Leitura conservadora registrada:** a função exige que o ator possua também
o que está **removendo**. Isso não é anti-escalada; é a interpretação de
"administrar um papel" que escolhe poder de menos em vez de poder a mais —
quem não pode conceder `finance.reverse` não arranca `finance.reverse` de um
papel que a Owner concedeu. Se a Shalon preferir o contrário, é mudança de
uma condição, não de arquitetura.

**TOCTOU fechado.** As duas portas travam as mesmas linhas de `roles`:
`definir_permissoes_do_papel` com `for update`, `definir_papeis` com
`for share`. "Validar o conjunto → outra transação engorda o papel →
atribuir" deixa de ser possível.

**Owner sem bypass novo.** Nenhum `if owner then`. A Owner administra
qualquer papel porque **possui** todas as permissões cadastradas — fato do
seed, verificável em `role_permissions`, e sujeito à mesma regra que todos.

**Depois da correção:** os seis ataques falham; o papel ponte pode ser criado
mas permanece **vazio**; o poder efetivo da vítima fica `false | false`, sem
resíduo. Controles positivos verdes: administração de subconjunto funciona,
vínculos preservados, a vítima recebe só o que o ator podia conceder, a Owner
continua administrando e papel de sistema continua protegido.

**Onde foi formalizada.** `03-RLS-RBAC-SEGURANCA.md` §19.7. Migrations `0106`
e `0107`.

---

### D-2026-09-24-70 — Fase 10 concluída e aprovada

**A decisão.** O hardening da Fase 10 está suficientemente validado para
avançar. Fase 10 **concluída em 24/09/2026**.

**Gate final, medido, não inferido.**

| Item | Resultado |
|---|---|
| Suítes SQL versionadas | 11 de 11 executadas |
| Cenários SQL | 1.032 de 1.032 passando |
| Vitest | 139 de 139 |
| `tsc --noEmit` / `eslint .` | sem erro |
| Build e smokes anônimos | validados no checkpoint da fase |
| Migrations | 109 no Git × 109 aplicadas |
| Fixtures residuais | zero |
| `audit_logs` | 278, preservados |
| Árvore Git | limpa |
| Migrations históricas reescritas | nenhuma |

**Motivo.** A fase não era de funcionalidade: era de quebrar o que as Fases 1
a 9 construíram e consertar defeito real. Ela encontrou e corrigiu defeitos em
segurança, autorização, integridade, privacidade, regras financeiras,
checkout, máquina de estados, Storage, exportações, entradas hostis,
performance, frontend e acessibilidade — entre eles quatro funções
`SECURITY DEFINER` que furavam o RLS do chamador, a escalada de privilégio de
A-21, o vazamento cruzado do bucket `comprovantes` e um gargalo de 38.689 ms
na fila de encerrados. Todas as correções vieram por migration nova; nenhuma
migration aplicada foi editada.

**O que esta decisão NÃO afirma.** Oito itens continuam sem validação real e
**não** foram convertidos em "testado": A-05 (Google Maps real), A-20 (criação
de conta Auth de funcionário), PI-F10-01 (`DELETE` pela API de Storage com
identidade real), POC física da impressora 58 mm, concorrência multi-sessão
real, TOCTOU de A-21 por corrida real, prova com volume real de produção e a
proteção contra senha vazada do Supabase. A lista vive em
`06-PENDENCIAS-VALIDACAO-PRODUCAO.md`, seção "Estado da Fase 10".

**Duas notas registradas para não virarem mal-entendido.** A paginação da fila
permanece decisão futura de produto — a otimização resolveu o gargalo
demonstrado sem introduzir paginação arbitrária. E o projeto Supabase
descartável de replay não é DEV nem produção, e não deve ser confundido com
nenhum dos dois.

**Onde foi formalizada.** `05-PLANO-IMPLEMENTACAO.md` §14.8 e
`06-PENDENCIAS-VALIDACAO-PRODUCAO.md` "Estado da Fase 10".

**Impacto no design.** Nenhum. A fase não alterou escopo nem experiência
aprovada; as únicas mudanças visuais foram correções de acessibilidade sem
efeito na aparência.

---

### D-2026-09-24-71 — Estado final do projeto descartável de replay, antes de removê-lo

**Por que isto está registrado.** O projeto descartável `pizzariashalon`
(`embpaodotujsxuaeptft`) vai sair. Ele não guarda dado, mas **guarda um fato**:
o replay que se supunha feito ali nunca foi concluído. Esse fato desaparece
junto com o projeto, e ele é a razão de existir o ensaio do Gate 11.3A.

**Estado medido em 24/09/2026, por leitura, sem alterar nada:**

| Item | Valor |
|---|---|
| Migrations aplicadas | **51** — o repositório tem **109** |
| Última migration aplicada | `20260922202055` |
| Tabelas em `public` | **58** — produção terá **61** |
| Pedidos, clientes, pagamentos | **0** em todos |
| Funcionários, usuários de aplicação | **0** em ambos |
| `audit_logs` | **15**, todos de ator `system` |
| Região | `sa-east-1` |

**O que isso significa.** Ele **não comprova** que o esquema atual aplica limpo
em banco vazio: parou a 58 migrations do fim. Tratá-lo como evidência de
replay teria sido erro — e teria levado a primeira execução real das 109 a
acontecer **direto em produção**.

**O que se perde ao removê-lo.** Nada além do próprio registro acima, que é a
razão desta entrada. Sem dado operacional, sem configuração da Shalon, sem
conta de Auth.

**O que fica no lugar.** Um projeto temporário novo, criado exclusivamente
para o ensaio: replay das 109 em banco virgem, validação estrutural completa e
as suítes versionadas. Ele também é temporário — não vira infraestrutura
permanente.

**Onde foi formalizada.** `08-BOOTSTRAP-PRODUCAO.md` §9.

---

### D-2026-09-24-72 — O replay das 109 migrations está provado em banco virgem

**O que foi provado.** As 109 migrations do repositório aplicam limpo em um
banco Supabase recém-criado, e o esquema resultante é funcionalmente
equivalente ao de desenvolvimento. Esta é a **primeira vez** que o replay
completo foi verificado ponta a ponta — o projeto descartável anterior parou
em 51 de 109 (`D-2026-09-24-71`).

**Onde.** Projeto temporário `shalon-replay-ensaio`, Free, `sa-east-1`, criado
vazio e confirmado vazio antes do replay: 0 tabelas, 0 funções, 0 buckets,
0 contas de Auth, schema `supabase_migrations` inexistente.

**Como.** `supabase db push` pela CLI, conforme a decisão D-A do Gate 11.3A.
A escolha da CLI se pagou: **as 109 versões gravadas correspondem exatamente
aos nomes dos arquivos**, zero divergência nos dois sentidos. A anomalia que
existe em desenvolvimento — versões com timestamp próprio nas migrations
aplicadas pelo conector — **não se reproduziu**.

**Validação estrutural, item a item contra a linha de base:**

| Item | Esperado | Obtido |
|---|---|---|
| Migrations | 109 | **109** |
| Tabelas em `public` | 61 | **61** |
| Com RLS ativo | 61 | **61** |
| Com `force row level security` | 60 | **60** |
| Única sem `force` | `server_secrets` | **`server_secrets`** |
| Policies em `public` | 141 | **141** |
| Policies em `storage.objects` | 9 | **9** |
| Funções em `public` | 151 | **151** |
| Permissões | 39 | **39** |
| Papéis de sistema | 2 | **2** |
| Permissões do Owner/Admin | 39 | **39** |
| Permissões do Atendente | 18 | **18** |
| Formas de pagamento | 6 | **6** |
| Transições de estado | 30 | **30** |
| Buckets | `catalogo` público, `comprovantes` privado | **idêntico** |
| `server_secrets` | 1 linha | **1** |

**Superfície de segurança, medida pelo mesmo método nos dois bancos:**
90 `SECURITY DEFINER` · 61 `SECURITY INVOKER` · 14 definer alcançáveis por
`anon` · 72 por `authenticated` · **0 com `EXECUTE` para `public`** · **0
definer sem `search_path`**. Números **idênticos** em desenvolvimento e no
ensaio.

**Regressão funcional: 11 de 11 suítes versionadas, 1.032 de 1.032 cenários,
zero falhas.**

| Suíte | Cenários |
|---|---:|
| `rls_fase2` | 48 |
| `rls_fase3` | 155 |
| `publico_fase4` | 96 |
| `midia_publica_fase4b` | 19 |
| `pedidos_fase5` | 66 |
| `operacao_fase6` | 80 |
| `pedido_manual_fase6` | 60 |
| `caixa_fase7` | 174 |
| `entregas_fase8` | 112 |
| `equipe_fase8b` | 120 |
| `inteligencia_fase9` | 102 |
| **total** | **1.032** |

**Divergências encontradas: nenhuma.** Nem estrutural, nem funcional.

**O que o banco contém, e por quê.** Depois das onze suítes — todas em
transação com `rollback` — o estado é o mesmo do pós-replay: zero pedidos,
clientes, pagamentos, funcionários, usuários, sessões de caixa, produtos,
configuração de loja, contas de Auth e objetos de Storage. As duas contagens
não-zero nasceram das próprias migrations: **5 categorias** (o esqueleto do
catálogo) e **15 registros de auditoria**, todos de ator `system`, gerados
pelos seeds de `role_permissions` e `payment_methods`. Nenhum rollback vazou.

**Nenhuma migration histórica foi alterada** para o replay passar, e nenhuma
foi criada, modificada ou removida durante o ensaio.

**Onde foi formalizada.** `08-BOOTSTRAP-PRODUCAO.md` §9.

---

### D-2026-09-24-73 — `pizzaria-shalon-prod` criado e com o esquema aplicado

**O que existe agora.** O projeto Supabase de **produção**, `pizzaria-shalon-prod`
(`ucekrrjkkyiqmowpodpr`), em `sa-east-1`, no plano **Free**, com as 109
migrations aplicadas e o esquema conferido. Ele está **vazio de dado
comercial** e ainda **não tem Owner**.

**Como o slot foi obtido.** O plano Free admite **2 projetos ativos**, e o
limite segue a conta de usuário, não a organização — criar outra organização
Free **não** contorna. A criação foi recusada duas vezes, com a mensagem
explícita do Supabase, antes e depois de Marcelo remover o descartável antigo
(que já estava pausado e, por isso, nunca ocupava slot). O espaço veio de
**pausar o `shalon-replay-ensaio`**, com autorização.

O ensaio fica **pausado e preservado**, reativável. A comparação não depende
dele estar no ar: os números validados estão em `D-2026-09-24-72`.

**Como as migrations foram aplicadas.** `supabase db push`, o mesmo mecanismo
validado no ensaio, executado por Marcelo na máquina dele — as credenciais do
banco nunca passaram pelo repositório nem por esta conversa.

**Correspondência de versões: exata.** 109 locais × 109 remotas, primeira
`20260918192103`, última `20260923170000`, **zero faltando e zero sobrando**.
A anomalia de versão que existe em desenvolvimento não se reproduziu, como já
não se reproduzira no ensaio.

**B3 estrutural — produção × ensaio, item a item:**

| Item | Ensaio | **Produção** |
|---|---|---|
| Migrations | 109 | **109** |
| Tabelas em `public` | 61 | **61** |
| Com RLS | 61 | **61** |
| Com `force row level security` | 60 | **60** |
| Única sem `force` | `server_secrets` | **`server_secrets`** |
| Policies em `public` | 141 | **141** |
| Policies em `storage.objects` | 9 | **9** |
| Funções em `public` | 151 | **151** |
| Permissões | 39 | **39** |
| Papéis de sistema | 2 | **2** |
| Permissões do Owner/Admin | 39 | **39** |
| Permissões do Atendente | 18 | **18** |
| Formas de pagamento | 6 | **6** |
| Transições de estado | 30 | **30** |
| Buckets | `catalogo` público, `comprovantes` privado | **idêntico** |
| `server_secrets` | 1 | **1** |
| `SECURITY DEFINER` / `INVOKER` | 90 / 61 | **90 / 61** |
| Definer alcançável por `anon` / `authenticated` | 14 / 72 | **14 / 72** |
| Com `EXECUTE` para `public` | 0 | **0** |
| Definer sem `search_path` | 0 | **0** |

**Advisors de segurança:** mesmo perfil — 1 INFO (`server_secrets` com RLS e
sem policy, que é o deny-by-default deliberado) e os WARN esperados de funções
definer expostas, nos mesmos 14 e 72. **Nenhum alerta de nível ERROR.**

**Divergências: nenhuma.**

**Conteúdo do banco.** Zero em pedidos, itens, clientes, pagamentos, intenções
de pagamento, caixas, movimentos, lançamentos, categorias financeiras,
funcionários, usuários, papéis atribuídos, perfis salariais, livro do
funcionário, corridas, movimentos internos, contatos, produtos, variações,
tamanhos, bordas, adicionais, promoções, banners, mídias, configuração de
loja, horários, faixas de entrega, Pix, alertas, contas de Auth e objetos de
Storage. **Zero papéis customizados. Zero resíduo de fixture.**

As duas contagens não-zero nasceram das migrations, e são as mesmas do ensaio:
**5 categorias** (Pizzas Salgadas, Pizzas Doces, Bebidas, Fogazza, Combos) e
**15 auditorias** de ator `system` — 9 `insert_role_permissions` e
6 `insert_payment_methods`.

**Suítes funcionais: não repetidas aqui, por decisão.** O runbook prevê B3 em
produção, não a regressão completa — ela já foi provada no ensaio, sobre o
mesmo esquema e pelo mesmo mecanismo, com 1.032 de 1.032 cenários. Repetir
ampliaria escopo sem acrescentar evidência.

**`pizzaria-shalon-dev` permaneceu intocado:** 109 migrations, 278 auditorias,
última de 23/09 09:16, 2 funcionários, 2 usuários, 18 produtos, 61 tabelas.

**O que NÃO foi feito, e segue pendente de gate:** primeiro Owner, dados reais
da pizzaria, Google Maps, alteração na Vercel, seeds e `db reset`. Nenhum
segredo entrou em arquivo versionado.

**Onde foi formalizada.** `08-BOOTSTRAP-PRODUCAO.md` §9 e §7 (passos B1 a B3).

---

### D-2026-09-24-74 — Como se lê o segredo de origem em ambiente novo

**O problema, encontrado ao preparar B4.** O `.env.example` mandava obter o
segredo de origem assim:

```sql
select public.ler_segredo_do_servidor('checkout_origem');
```

Essa função termina com `and public.has_permission('settings.manage')`, o que
exige um usuário interno autenticado. **Em ambiente recém-criado não existe
nenhum** — o primeiro Owner só nasce em B5. Verificado em
`pizzaria-shalon-prod` em 24/09/2026: `has_permission('settings.manage')`
devolveu `false` e a função devolveu `NULL`.

Seguir a instrução ao pé da letra produziria uma **dependência circular**: B4
precisaria de B5, que só se verifica depois de B6, que precisa de B4.

**A decisão.** O procedimento passa a ter dois momentos declarados:

1. **Bootstrap, antes do primeiro Owner** — leitura administrativa direta no
   SQL Editor, onde a sessão roda como `postgres`, dono da tabela:

   ```sql
   select valor from public.server_secrets where chave = 'checkout_origem';
   ```

2. **Depois do Owner** — a via normal e **preferida**, com `settings.manage`:
   `select public.ler_segredo_do_servidor('checkout_origem')`.

**Por que a leitura direta funciona, e por que isso não é brecha.**
`server_secrets` tem RLS ligada e **sem `force`**, deliberadamente desde a
migration 0040, porque as funções `SECURITY DEFINER` precisam conseguir ler a
tabela. A consequência é que o dono do banco também lê — e quem abre o SQL
Editor do projeto já é o dono. Não há privilégio novo sendo concedido: é o
mesmo acesso administrativo que criou o projeto.

**Nenhuma migration histórica foi alterada.** A 0040 está correta; o que
faltava era a documentação descrever os dois momentos. Corrigir o passado para
acomodar uma instrução incompleta seria o caminho errado.

**Onde foi formalizada.** `.env.example` e `08-BOOTSTRAP-PRODUCAO.md` §6 e B4.

**Impacto no design.** Nenhum. Nada no produto muda; muda o texto que descreve
como configurar um ambiente novo.

---

### D-2026-09-24-75 — HERE substitui o Google como provedor de rotas

**A decisão.** O provedor de geocodificação e distância de rota passa a ser o
**HERE Location Services**. Supera `D-2026-09-18-20` **na escolha do
fornecedor** — e só nisso.

**Motivo.** O Google Maps Platform exige ativação de faturamento com meio de
pagamento. A proprietária da Shalon não autoriza cadastrar cartão, e não é
obrigada a justificar. O HERE oferece plano sem essa exigência.

**Três decisões que acompanham, tomadas em 24/09/2026:**

1. **Mapeamento de confiança conservador.** `street`, `locality` e
   `administrativeArea` são tratados como **ambíguos e rejeitados** para
   cálculo automático de frete. Só `houseNumber` serve: com
   `houseNumberType = PA` vale **exata**, `interpolated` vale **aproximada**.
   Mais de um resultado também é rejeitado.

   **Por que rejeitar.** `street` é o caso que mais tenta: o HERE devolve com
   aparência de sucesso, mas o ponto é o centro da rua — numa rua longa, isso
   põe a coordenada a centenas de metros do imóvel. Cobrar por essa distância
   seria inventar o número (RN-ENT-003). Rejeitar cai no ajuste pelo mapa
   (RN-ENT-005) ou na retirada; **o erro caro é o oposto.**

2. **Sem fallback para o Google.** `HERE_API_KEY` presente → HERE; ausente →
   `provedorIndisponivel`. Nada no meio.

   **Por que não manter fallback.** O faturamento do Google não foi ativado,
   então um fallback automático responderia erro de credencial **fingindo ser
   rede de proteção** — dependência enganosa. O arquivo `google.ts` fica no
   repositório como histórico e referência de rigor, marcado como fora do
   fluxo ativo, e não é importado pelo seletor.

3. **ViaCEP como conveniência, nunca como autoridade.** A consulta por CEP
   preenche **texto** — rua, bairro, cidade, UF — para poupar digitação. Ela
   **não devolve coordenada** e não participa de distância nem de taxa. Um CEP
   brasileiro pode cobrir uma rua inteira ou várias; usá-lo para inferir
   distância produziria taxa errada. Falha do ViaCEP **não bloqueia** o
   checkout: o cliente preenche à mão.

**O que NÃO mudou, e é o ponto central.** A regra que transforma quilômetro em
real continua no banco: `cotar_entrega` → `faixa_para_distancia`, e
`criar_pedido` recalcula na transação. **O HERE não decide quanto cobrar** —
ele fornece coordenada e distância. Nenhuma regra de taxa foi tocada, e as
suítes de faixa passaram sem alteração.

**Zero migrations.** `geocode_provider` e `delivery_route_provider` são `text`
sem `CHECK`, então gravar `"here"` já era aceito; `geocode_confidence` continua
restrito aos mesmos quatro valores do contrato. Nenhuma migration histórica foi
alterada.

**Dívida paga de passagem.** O provedor do Google nunca teve teste — o parsing
que decide dinheiro estava descoberto. O provedor do HERE nasce com **22
casos**, e o ViaCEP com **14**, todos com `fetch` em dublê e sem nenhuma chave
real. Para isso, o Vitest passou a resolver `server-only` para o `empty.js` do
próprio pacote, que é o que a condição `react-server` do Next já fazia no
servidor — a guarda continua valendo no código de produção.

**Variável de ambiente:** `HERE_API_KEY`, server-side. **Nunca
`NEXT_PUBLIC_`**: o HERE autentica por parâmetro de consulta, então a chave
viaja na URL e, exposta ao navegador, seria usada por terceiros contra a
franquia. O provedor nunca registra a URL em log, só o status HTTP.

**Mapbox** poderá ser avaliado como fallback futuro. **Não foi implementado.**

**Onde foi formalizada.** `src/infrastructure/rotas/here.ts`,
`src/application/checkout/cep.ts`, `.env.example`,
`06-PENDENCIAS-VALIDACAO-PRODUCAO.md` (A-05) e
`08-BOOTSTRAP-PRODUCAO.md` §6 e B8.

**Impacto no design.** Nenhum na experiência aprovada. O campo de CEP do
checkout ganhou preenchimento automático e uma dica de texto; nenhum campo foi
acrescentado ou removido.

---
---

---

### D-2026-09-25-76 — Coordenada de endereço conhecido pode ser reutilizada (Fase A do cache)

**A decisão.** Quando um endereço já foi geocodificado com confiança
suficiente, a coordenada guardada é reutilizada e a chamada de geocodificação
ao provedor é dispensada. A rota continua sendo medida de verdade.

**O que motivou.** Nada de urgente: a cota do HERE Limited Plan tem folga de
2,9× no pior caso (`06`, A-05). O ganho real é outro — `customer_addresses`
guardava `latitude`, `longitude`, `geocode_provider` e `geocode_confidence`
desde a Fase 5, gravados por `criar_pedido` a cada pedido de entrega, e
**ninguém nunca leu de volta**. O projeto pagava o armazenamento sem receber
benefício.

**A identidade do endereço é derivada no banco, e só lá.** Função
`chave_de_endereco()`, `IMMUTABLE`, usada tanto pela coluna gerada
`address_key` quanto pela consulta. A normalização NÃO existe em TypeScript, e
isso é decisão, não conveniência: duas definições da mesma regra divergiriam
algum dia, e divergência aqui significa a coordenada de um endereço aplicada a
outro — distância errada, taxa errada.

**Complemento e ponto de referência não participam** (RN-ENT-004). "Ap 42" e
"Ap 71" no mesmo prédio são a mesma coordenada, e devem ser o mesmo acerto.

**Condições do reuso.** Confiança em `exata`, `aproximada` ou
`ajustada_no_mapa`; nunca `ambigua`, nem quando o registro está
contraditoriamente marcado como ajustado no mapa. Mesmo provedor. Menos de 180
dias. Endereço ativo, coordenada presente.

**Ajuste manual no mapa tem precedência absoluta** (RN-ENT-005): não expira por
calendário e não é descartado por troca de provedor — foi uma pessoa que olhou
o mapa, e isso não envelhece como palpite de API.

**O navegador não é autoridade para nada disso.** A busca é por conteúdo, e a
assinatura da função **não tem parâmetro de `id`**: se tivesse, um id forjado
traria a coordenada do endereço de outro cliente. O caminho não existe.

**`geocoded_at` nasceu de um teste que falhou.** A validade estava sendo medida
por `updated_at`, que o trigger da tabela reescreve a cada UPDATE — marcar o
endereço como preferido renovaria o prazo de uma coordenada velha sem que
ninguém tivesse revalidado nada. A coluna nova só se move quando a coordenada
se move, mantida por trigger próprio.

**Não incluído:** deduplicação de `customer_addresses`, que exigiria alterar
`criar_pedido`. Decisão explícita de não misturar os dois gates.

**Evidência:** 58 cenários SQL e 23 em Vitest. Migrations `20260925100000`,
`20260925100100`, `20260925100200`.

---

### D-2026-09-25-77 — Distância rodoviária pode ser reutilizada; a taxa nunca (Fase B do cache)

**A decisão.** Uma distância rodoviária já validada pode ser reutilizada
temporariamente para o mesmo endereço **e a mesma origem da loja**. O valor
monetário do frete **nunca** é guardado.

**Altera `02-MODELO-DADOS-SUPABASE.md` §8.2**, cuja redação era "Taxa/distância
não pertencem ao endereço salvo. Devem ser recalculadas a cada novo pedido."

A metade sobre **taxa** continua valendo integralmente. A metade sobre
**distância** cai. O §8.2 tratava as duas como uma coisa só, e elas não são:

| | Taxa | Distância |
|---|---|---|
| O que é | preço | medida física entre dois pontos |
| Muda quando | a Shalon muda a tabela | a malha viária muda |
| Reutilizável | **nunca** | sim, com condições |

**RN-ENT-008 permanece intacto.** Nenhuma coluna de taxa existe ou existirá em
`customer_addresses`. `cotar_entrega` e `criar_pedido` seguem sendo as únicas
autoridades do preço, recalculando pelas faixas vigentes a cada cotação e a
cada pedido — e nenhuma das duas foi alterada por este gate.

Consequência prática, coberta por teste: a Shalon altera a tabela de faixas e o
**mesmo endereço já em cache** passa a custar diferente no pedido seguinte.

**Condições do reuso**, todas cumulativas: mesma `address_key`; **mesma
origem** (`route_origin_lat/lng` iguais à coordenada atual da loja); mesmo
provedor; menos de **90 dias**; distância **estritamente positiva**.

**A origem gravada junto é o coração do desenho.** Distância só vale se os dois
pontos forem os mesmos. Guardar a origem usada na medição é melhor que um
trigger de invalidação: a comparação é explícita e não depende de alguém ter
lembrado de limpar o cache quando a loja mudar de endereço. Loja em outro lugar
invalida **somente** a distância — a coordenada do cliente continua válida,
porque o cliente não se mexeu.

**Registro é tudo ou nada.** Constraint recusa medição pela metade: distância
sem a origem que a produziu é um número sem sentido, e reutilizá-la seria
cobrar por uma rota que ninguém mediu.

**A origem não é parâmetro da gravação.** `registrar_rota_medida` a lê de
`store_settings`, para que nem o servidor possa declarar uma origem que não é a
da loja.

**Só medição real renova o carimbo.** A primeira versão da função de gravação
só escrevia quando algum campo diferisse, para poupar UPDATE — o que faria uma
remedição confirmatória não renovar a validade, e o registro venceria de novo
no dia seguinte, para sempre. A versão final grava sempre que é chamada, e a
responsabilidade passou para o chamador: distância vinda do cache **não** é
regravada, porque isso renovaria o TTL de 90 dias sozinho e ele nunca venceria.

**Só entrega concluída semeia o cache.** A gravação acontece depois de
`criar_pedido` ter sucesso, porque é ela que cria a linha de endereço. Cotação
abandonada não semeia.

**Fail-closed preservado.** Distância vencida, origem diferente, provedor
diferente, registro inconsistente, zero ou negativo produzem **miss**, e miss
significa medir no HERE. `fora_de_area` e `rota_indisponivel` continuam
funcionando com distância vinda do cache — ela entra na mesma guarda. Em
nenhuma hipótese há frete R$ 0,00.

**Ganho colateral que talvez importe mais que a cota:** com coordenada e
distância em cache, um cliente recorrente consegue fechar pedido de entrega
**com o HERE fora do ar**. Antes da Fase B, um 429 bloqueava a entrega mesmo
para quem já havia pedido dali.

**Limitação conhecida:** o pedido manual do painel interno consome o cache mas
não o semeia — semear exigiria alterar `src/application/pedidos/acoes.ts`, fora
do escopo deste gate. Não há prejuízo: o checkout público semeia.

**Não incluído:** VPS, Nominatim, OSRM e Mapbox. Deduplicação de
`customer_addresses`.

**Evidência:** migration `20260925110000`; suíte SQL e Vitest ampliadas — ver
checkpoint da Fase B.

---

### D-2026-09-25-78 — O Caixa vira PDV / frente de caixa

**A decisão.** O módulo Caixa evolui para uma **frente de caixa operacional**,
com três áreas integradas: *Nova venda* (pedido de balcão com busca, carrinho e
recebimento), *Pedidos a receber* (pendentes financeiramente) e *Caixa*
(abertura, reforço, sangria, movimentos, fechamento, reabertura). A sessão de
caixa atual **não é descartada** — vira uma das abas.

**Especificação completa em `docs/09-PDV-FRENTE-DE-CAIXA.md`**, que é a fonte de
verdade da implementação. Esta entrada registra a decisão; não a repete.

**O que o levantamento de 25/09/2026 mostrou, e mudou o desenho.** O modelo já
suportava quase tudo, sem tela: `orders.payment_status` separado de
`orders.status`; pagamento **dividido** em até 6 formas com soma exata; **troco**
em duas camadas (`order_payment_intents` para o esperado, `payments` para o
realizado); `orders.source` já admitindo `'counter'`; estorno auditável em
`reverter_pagamento`. O recebimento existia — só morava na tela do pedido, não
no caixa.

Por isso o PDV custa **uma** migration estrutural, **zero** coluna alterada em
tabela existente, **zero** permissão nova e **zero** impacto no fechamento.

**Decisões aprovadas:**

1. **Pagamento parcial não será implementado.** A divisão continua quitando o
   pedido integralmente naquele recebimento.
2. **Pedido com pagamento confirmado não pode ser simplesmente cancelado.**
   Cancelar exige estorno na mesma transação, com motivo e com as duas
   permissões. Vira RN-CAIXA-019. Corrige um furo real: hoje o cancelamento
   deixa `status='cancelled'` com `payment_status='confirmed'` e o dinheiro na
   gaveta, sem registro de devolução.
3. **Código de barras para produto E para variante**, em tabela própria
   `product_barcodes`, com unicidade **global** do código normalizado. Colunas
   separadas nas duas tabelas permitiriam o mesmo código apontar para duas
   coisas, e a leitura resolveria qualquer uma — em cima de dinheiro. Modelo em
   `02` §5.4-A, RLS em `03` §33.2-A.
4. **EAN é validado como aviso, nunca como bloqueio.** Código interno impresso
   pela casa não segue EAN.
5. **`product_variants.sku` fica intocado** e separado do código de barras: é
   cadastro de fornecedor, não identificador de venda.
6. **O pagamento não conclui o pedido.** O eixo financeiro não empurra o
   operacional. Vira RN-CAIXA-018. Venda rápida que conclui na hora fica fora
   de escopo: exigiria um critério de "item sem produção" que o catálogo não tem.
7. **O PDV abre com o caixa fechado**, indicando o estado e permitindo o que as
   permissões permitirem. A recusa do recebimento continua sendo **do servidor**
   — a interface não reimplementa autorização.
8. **Atalhos** sem teclas reservadas pelo navegador. Sangria, reforço e
   fechamento ficam dentro de F9 nesta versão.
9. **Sem lock de "pedido em atendimento".** A trava do banco (`for update` mais
   a recusa de segundo pagamento) já resolve a corrida, e um lock de interface
   traria lock órfão.

**Não implementado nesta decisão.** Nenhuma migration criada, nenhum código
escrito. A implementação virá por etapas, aprovadas separadamente.


---



## D-2026-09-26-79 — A fila do PDV inclui pedido estornado e vivo

**Decisão.** `pedidos_a_receber()` considera recebível
`payment_status in ('pending','reversed')`, desde que o pedido não esteja
`cancelled` nem `rejected`. A especificação original de
`09-PDV-FRENTE-DE-CAIXA.md` dizia apenas `payment_status = 'pending'`.

- `pending` → aparece
- `reversed` + pedido operacionalmente vivo → **aparece**
- `confirmed` → não aparece
- `cancelled` → não aparece
- `rejected` → não aparece

**Motivo.** `reverter_pagamento` não exige que o pedido esteja cancelado: pede
`finance.reverse`, estorna os pagamentos e faz
`orders.payment_status = 'reversed'` sem tocar em `orders.status`. Existe então
um estado alcançável de dinheiro devolvido com pedido vivo, e nele o cliente
continua devendo — não há pagamento confirmado.

Comprovado em transação com `rollback` antes da decisão: pedido pago, avançado
para `in_production`, estornado sem cancelamento, e `registrar_pagamento`
devolveu `ok: true`. O banco aceita receber esse pedido.

Com o critério literal, a fila mostraria um conjunto **menor** do que
`registrar_pagamento` aceita e viraria uma segunda autoridade sobre dinheiro —
mais restritiva, e por omissão. Um pedido com a pizza no forno e o cliente
devendo não apareceria para cobrança.

**`reversed` não é apresentado como `pending`.** A interface mostra o
`payment_status` real, com rótulos distintos ("Pendente" e "Estornado"), para o
operador saber que aquele dinheiro já foi devolvido por decisão da casa.

**Onde foi formalizada.** `09-PDV-FRENTE-DE-CAIXA.md` §1.3 e §6.1 (v1.1).

**Impacto no design.** Um cenário da suíte da Etapa 5 percorre o caminho
completo — pago, estornado, vivo, aparece com `payment_status = 'reversed'`, e
segue elegível para `registrar_pagamento`.

## D-2026-09-26-80 — Origem e modalidade não se confundem; não existe modalidade `balcao`

**Decisão.** Registrado explicitamente que `orders.source` é a **origem**
(`shalon_link`, `whatsapp`, `phone`, `counter`, `ifood`, `other`) e
`orders.fulfillment_type` é a **modalidade** (`delivery`, `pickup`). Portanto:
`source = 'counter'` é origem Balcão, `fulfillment_type = 'pickup'` é Retirada,
`fulfillment_type = 'delivery'` é Entrega. **A modalidade `balcao` não existe e
não deve ser criada.**

**Motivo.** Os wireframes do `09` escrevem "Balcão" e "Retirada" na mesma linha,
o que se lê como dois valores do mesmo campo. Um pedido de balcão é
`source='counter'` com `fulfillment_type='pickup'`. Acrescentar um terceiro
valor à modalidade quebraria `orders_entrega_com_snapshot` e
`orders_retirada_sem_entrega`, que existem para garantir que só entrega carrega
endereço e distância.

**Onde foi formalizada.** `09-PDV-FRENTE-DE-CAIXA.md` §0.3 (nova, v1.1).

**Impacto no design.** `pedidos_a_receber()` devolve as duas colunas separadas,
e a tela as exibe juntas sem fundi-las num campo só.


---


## D-2026-09-26-81 — Venda de balcão sem cliente identificado

**Decisão.** `criar_pedido` passa a aceitar venda **sem bloco `cliente`**, sob
**quatro condições cumulativas**: lançamento interno (`orders.create_manual`),
origem `counter`, modalidade `pickup`, e os **dois** campos do cliente vazios.
Nesse caso o pedido nasce com `customer_id = NULL`, `customer_name_snapshot =
'Balcão'` e `customer_whatsapp_snapshot` vazio. Em todos os outros casos, nada
muda: nome e WhatsApp continuam obrigatórios.

**Motivo.** O wireframe aprovado do PDV (§4.1) não tem campo de cliente — quem
está no balcão leva e vai embora. Mas `criar_pedido` exigia nome e um WhatsApp
casando `^[0-9]{10,15}$`, sem alternativa.

As duas saídas erradas foram descartadas com motivo:

1. **Inventar um telefone.** `customers_whatsapp_unico` é índice ÚNICO sobre
   `whatsapp_normalized` — é a identidade do cliente. Um número fixo faria toda
   venda de balcão virar o MESMO cliente, e histórico, `padrao_de_compra` e
   remarketing (CLAUDE.md §31) passariam a descrever um "super cliente"
   inexistente. Números sintéticos por venda encheriam `customers` de lixo, com
   risco de colidir com o número de um cliente real.
2. **Uma RPC `venda_de_balcao` ao lado.** Seria uma segunda autoridade sobre
   preço e criação de pedido — exatamente o que CLAUDE.md §16 proíbe.

`orders.customer_id` **já era nulável**: o modelo sempre admitiu pedido sem
cliente cadastrado. A mudança foi feita na autoridade existente, e só do lado de
dentro.

**Por que as quatro condições.** O checkout público continua exigindo
identificação — sem cliente não há a quem entregar, acompanhar ou avisar.
WhatsApp e telefone têm, por definição, alguém do outro lado. Entrega exige
cliente porque `customer_addresses.customer_id` é NOT NULL. E exigir os DOIS
campos vazios faz um telefone digitado errado falhar alto, em vez de virar
silenciosamente uma venda anônima.

**Onde foi formalizada.** `supabase/migrations/20260926170000_venda_de_balcao_sem_cliente.sql`
(ledger 120) · `09-PDV-FRENTE-DE-CAIXA.md` §13, Etapa 6.

**Impacto no design.** O PDV salva venda de balcão sem pedir dados de quem
comprou. A forma de pagamento ESPERADA continua obrigatória (CLAUDE.md §24), e é
ela que a fila da Etapa 5 exibe. Nenhum pagamento é criado ao salvar: receber é
a Etapa 7.

**Verificado no DEV.** `pdv_etapa6_fase12.sql`, 49/49, com o bloco B testando
cada uma das quatro condições pela sua negação. Venda real de validação:
**pedido #33730**, `counter`/`pickup`, `customer_id` nulo, snapshot "Balcão",
`payment_status='pending'`, zero pagamentos — e a contagem de `customers`
permaneceu em 1.


---

## D-2026-09-26-82 — `cash.adjust` para o Atendente; `cash.reopen` continua fora

**Data:** 26/09/2026 · **Fase 12, Etapa 8**

**Decisão.** O papel de sistema **Atendente** passa a ter `cash.adjust`, isto é,
suprimento e sangria. **`cash.reopen` NÃO é concedida** e permanece exclusiva do
Owner/Admin. Nenhuma outra permissão muda.

**Motivo.** O Atendente é o operador normal do PDV e do caixa: ele abre a
sessão, recebe os pedidos e fecha conferindo o dinheiro. Suprir a gaveta com
troco e mandar sobra para o cofre são atos do plantão, não atos
administrativos. Sem a permissão, o operador precisava chamar a proprietária
para cada troca de dinheiro — e a saída prática de um caixa travado no meio do
plantão é a pior possível: receber sem registrar.

Reabertura de sessão fechada é outra coisa. É correção de histórico, e quem
fecha não deve poder reabrir o próprio fechamento e refazer a contagem. A
separação de funções é exatamente o que dá sentido à diferença.

`03 §32` já previa "Sangria/suprimento | Dono/Admin ✓ | Atendente conforme
permissão" — o seed da Fase 2 resolveu esse "conforme permissão" como *não por
padrão*. Esta decisão troca o default, não a regra. Para `cash.reopen` o mesmo
§32 marca **✗ explícito**, e continua valendo.

**A permissão não afrouxa nenhuma guarda.** `movimentar_caixa` segue recusando
sangria maior que o dinheiro esperado, e a recusa passou a ser de **saldo** em
vez de permissão — medido nos cenários E10 e E11.

**Onde foi formalizada.**
`supabase/migrations/20260926180000_atendente_pode_suprir_e_sangrar.sql` ·
`03-RLS-RBAC-SEGURANCA.md` §6, §16.2, §32 · `09-PDV-FRENTE-DE-CAIXA.md` Etapa 8.

**O que deliberadamente NÃO foi tocado.** `finance.view` — a assimetria
`payments.register` × `finance.view` continua registrada como pendência.
`cash.bypass_session`, `finance.reverse` e `cash.reopen` seguem fora do
Atendente. PI-F12-01 não foi corrigida.

**Impacto no design.** O PDV deixa de ter operação de caixa que o próprio
operador não pode executar. Os botões de reforço e sangria não mudaram de lugar
— esconder botão nunca foi a proteção (CLAUDE.md §12) —, e o aviso condicional
continua no código para qualquer papel personalizado sem `cash.adjust`.

**Verificado no DEV.** Persistida em 27/09/2026, ledger 120 → **121**.
`rbac_etapa8_fase12.sql`, **18/18**, com o diff conjunto-a-conjunto: o Atendente
ganhou exatamente `cash.adjust` e não perdeu nenhuma; Owner/Admin com o conjunto
idêntico ao de antes (`2bda8ccb3e0c1469a697d6c40467143b`, inalterado); a
concessão auditada pelo trigger `role_permissions_audit`, resolvendo para
`Atendente` ← `cash.adjust`. `pdv_etapa8_fase12.sql`, **71/71**; regressões das
Etapas 3 a 7 verdes (153, 118, 69, 50, 83).

A suíte de RBAC reconstrói o estado anterior revogando a permissão dentro da
própria transação, porque depois da persistência o "antes" não existe mais para
ser observado — e isso a torna também regressão: `R0` falha no dia em que alguém
revogar `cash.adjust`, e `R5` falha se alguém conceder `cash.reopen`.

**Exercida de verdade.** Na validação operacional de 27/09/2026 o suprimento e a
sangria foram feitos pela interface do PDV na sessão real, e a tentativa de
sangrar acima do saldo foi recusada **por saldo** — a permissão nova não
afrouxou a guarda. A reabertura pelo Atendente continuou recusada por permissão.
Detalhes em `09-PDV-FRENTE-DE-CAIXA.md`, Etapa 8.

---

## D-2026-09-27-83 — Realtime do caixa, e a autenticação do socket

**Data:** 27/09/2026 · **Fase 12, Etapa 10**

**Decisão.** `cash_sessions` e `cash_movements` entram na publicação
`supabase_realtime`. `payments` **não** entra. E a autenticação do Realtime
passa a usar a sessão do operador, corrigida em infraestrutura compartilhada.

**Por que as duas tabelas de caixa.** Suprimento, sangria, estorno de movimento
e o **acerto de motoboy** (`conciliar_corrida`) mudam o dinheiro real **sem
tocar `orders`**. Sem elas publicadas, um PDV seguiria exibindo um esperado
velho enquanto o outro já mudou a gaveta — dinheiro divergindo entre duas telas
do mesmo balcão.

**Por que `payments` fica fora.** Medido nos corpos: `registrar_pagamento` e
`reverter_pagamento` escrevem em `orders` junto. Publicá-la acrescentaria evento
e refresh sem cobrir lacuna nenhuma; as duas exceções que escrevem `payments`
sem tocar `orders` são cobertas por `cash_movements`.

**O defeito encontrado, anterior à etapa.** O socket do Realtime assinava como
`anon`, porque o `subscribe()` do `useEffect` entrava no canal antes de o
`supabase-js` aplicar o token da sessão. `anon` não tem policy de leitura nas
três tabelas, então **nenhum evento era entregue desde a Fase 5** — com o canal
reportando `SUBSCRIBED` e a tela dizendo "Atualizando em tempo real".

**A falha era fechada:** faltou entrega, não sobrou acesso. Nenhum dado vazou.

**Um achado de biblioteca, registrado.** Em `realtime-js` 2.116.0, sem um
callback `accessToken` configurado, `setAuth(null)` **não limpa**: cai em
`tokenToSend = this.accessTokenValue` e reenvia o token atual. O próprio
`SIGNED_OUT` do `supabase-js` chama `setAuth()` e tem o mesmo destino. Por isso
o handler devolve explicitamente a chave publicável.

**Onde foi formalizada.**
`supabase/migrations/20260927132532_realtime_do_caixa.sql` (duas linhas,
só publicação) · `src/infrastructure/supabase/client.ts` ·
`09-PDV-FRENTE-DE-CAIXA.md`, Etapa 10.

**O que NÃO mudou.** RLS, policies, grants, RPCs, funções financeiras e RBAC
ficaram idênticos — conferido por contagem antes e depois: 145 policies, 172
funções, 58 permissões, 427 grants para `anon`.

**Verificado no DEV.** `pdv_etapa10_fase12.sql` **48/48**. Assinatura
`authenticated` com `sub` do operador; entrega comprovada entre dois terminais;
e o bloco C provando que, com o evento **ausente**, a segunda cobrança continua
impossível: `for update`, `ja_pago`, um pagamento, um movimento.

---



---

## D-2026-09-28-84 — PWA administrativo e notificações de pedidos

**Data:** 28/09/2026 · **Decisão do responsável pelo produto nesta conversa**

**Decisão.** O painel administrativo passa a ter uma instalação PWA própria,
um sino global e alertas persistentes de novos pedidos com som opcional após
interação do operador. O Web Push poderá avisar fora da página após permissão
do navegador; SMS e WhatsApp automáticos continuam fora do escopo.

**Supera:** a proibição de push na V1 em `01-DOCUMENTO-MESTRE.md` §79.23,
atualizada nesta decisão. Instalação do PWA não é requisito para receber
alertas no desktop compatível; no iOS/iPadOS o Web Push exige a instalação
na Tela de Início.

**Limites.** Nenhum dado operacional privado é cacheado pelo service worker;
o modo offline mostra apenas um aviso estático. Realtime informa que houve
evento, mas a lista exibida vem de projeção autenticada com RLS. Áudio nunca
é declarado ativo antes de `AudioContext.resume()` completar.

**Onde foi formalizada:** `public/admin.webmanifest`, `public/sw-admin.js`,
`src/ui/notificacoes/`, `supabase/migrations/20260928120000_notificacoes_administrativas.sql`.

**Estado desta entrega.** PWA instalável, sino persistente e som na aba aberta
estão implementados; o Web Push com o navegador fechado ainda depende de
assinatura, credenciais VAPID e envio no servidor. A migration também precisa
ser aplicada antes de o sino receber pedidos reais.

**Preferência de som.** A escolha do operador fica salva neste navegador por
usuário interno, inclusive depois de sair e entrar de novo. Como o navegador
restringe áudio automático, a primeira interação com o painel após o retorno
retoma o som; não há reprodução antes desse gesto. Pedidos feitos pelo link
público geram o alerta no administrativo, mas clientes não recebem o sino ou
esse som administrativo.

**Toque personalizado.** Em 28/09/2026, o responsável forneceu o arquivo
`notificação.mpeg` para o alerta de pedido novo. O painel usa uma cópia MP3
com volume reduzido em 5 dB; o toque sintetizado continua como reserva se o
arquivo não carregar.

**Alertas por tarefa.** O responsável confirmou que o toque deve ocorrer só
quando uma etapa cria trabalho para outra pessoa/equipe. O sino passa a listar
pedido novo, produção a iniciar, pedido pronto para retirada/despacho e falha
na entrega. Mudanças intermediárias ou encerramento não geram alerta. Como a
V1 não possui papel separado de cozinha, cada operador escolhe neste navegador
quais áreas produzem som (atendimento por padrão; produção e entrega opt-in).
A escolha é salva por usuário; o sino visual continua sujeito às permissões
do banco e não é substituído por preferências locais.

---

## D-2026-09-28-85 — Carrinho no cabeçalho, confirmação de adição e "+" de um toque

**Data:** 28/09/2026 · **Decisão do responsável pelo produto nesta conversa**

**Decisão.**
1. **Card do cardápio:** o "+" sobe para a mesma linha do preço, alinhado pela
   base. No celular o círculo visível tem 28px e o "R$" fica menor que o
   número; o alvo de toque continua com 44px (CLAUDE.md §38). Onde valor e
   botão não couberem (preço de três dígitos em tela estreita), o botão desce
   para a direita.
2. **Carrinho no cabeçalho:** ícone sempre visível entre a situação da loja e o
   menu, com contador que só aparece com itens. Vazio, leva ao estado vazio do
   carrinho.
3. **Sem barra de carrinho no rodapé:** a barra "Ver carrinho • N itens •
   subtotal" foi removida.
4. **Confirmação de adição:** toda adição (página do produto ou card) abre um
   painel inferior com o item, a quantidade de itens e o subtotal visto, e duas
   saídas — "Adicionar mais" (volta ao cardápio na mesma posição, ou fecha o
   painel se já estiver nele) e "Ver carrinho".
5. **Adicionar com um toque:** produto sem escolhas — sem tamanhos, e que não
   é pizza nem combo — entra no carrinho direto pelo "+" do card. A decisão de
   "não tem escolhas" é refeita no servidor com o produto relido do banco; se
   ele passou a ter escolhas, o "+" abre a página do produto.

**Motivo.** O "+" isolado numa linha própria alongava o card; depois de
adicionar, o cliente só via uma frase curta e não tinha próximos passos
claros; a barra fixa ocupava a base da tela o tempo todo.

**Supera:** `01-DOCUMENTO-MESTRE.md` §5 (CTA/barra flutuante de carrinho),
atualizado com marcador de supersessão; a barra de carrinho listada como
"preservada integralmente" na reconciliação do cardápio público.

**Não muda.** O preço continua sendo do servidor: o toque único usa a mesma
`montar_item` do configurador, e o carrinho segue revalidado antes do pedido
(CLAUDE.md §16, RN-CART). Pizza e combo continuam com página própria
(RN-LINK-001). Continua não havendo navegação inferior persistente (79.8).
Limite por pedido: se o item já está no limite, o toque avisa em vez de dizer
"adicionado".

**Onde foi formalizada:** `01-DOCUMENTO-MESTRE.md` §5;
`src/app/(publico)/_ui/CardProduto.tsx`, `LinhaDeCompra.tsx`,
`IconeCarrinho.tsx`, `PainelAdicionado.tsx`; `src/ui/publico/avisoAdicionado.ts`;
`adicionarRapido` em `src/application/publico/acoes.ts`.

---

## D-2026-09-28-86 — Faixa de combos vermelha e favorito compacto sobre a foto

**Data:** 28/09/2026 · **Decisão do responsável pelo produto nesta conversa**

**Decisão.**
1. A faixa "Combos para compartilhar", colada ao banner, troca o fundo marrom
   escuro (`--sidebar`) pelo **vermelho da marca** (`--brand-red`). O título
   continua em `--dark-ink`; o subtítulo passa a `--dark-ink` a 90% (4,6:1),
   porque `--dark-ink-2` sobre o vermelho ficaria em 3,5:1. O botão "Ver
   combos" continua no CTA amarelo, que é fixo no público.
2. O favorito sobre a foto do card fica **compacto**: círculo visível de
   30px, translúcido, com estrela desenhada em SVG (o caractere ☆ variava por
   aparelho). O alvo de toque continua com 44px. Salvo, o círculo fica amarelo
   com a estrela preenchida. A página do produto usa a mesma estrela no botão
   "Salvar".

**Motivo.** O vermelho é da identidade da Shalon e destaca a oferta; o
círculo branco de 44px cobria boa parte da foto num card de ~105px.

**Onde foi formalizada:** `src/app/(publico)/_ui/Banners.tsx`,
`src/app/(publico)/_ui/BotaoFavorito.tsx`.

---

## D-2026-09-29-87 — Desempenho percebido do painel, Etapa 1: skeleton por rota e indicador de navegação

**Data:** 29/09/2026 · **Plano de desempenho aprovado pelo responsável pelo
produto ("sigamos"), etapas 1 a 3, uma por vez. Esta é a Etapa 1.**

**Contexto.** A auditoria de desempenho do painel (28–29/09) encontrou como
causa principal da lentidão percebida o fato de o clique no menu não dar
retorno nenhum até a página nova chegar inteira. O único `loading.tsx` ficava
em `(admin)/`, acima do segmento `admin` que nunca muda entre seções, e o Next
só mostra o fallback de uma fronteira nova. Pior: sem `loading.tsx`, rota
dinâmica nem é pré-carregada.

**Decisão.**
1. **Toda rota do administrativo tem `loading.tsx`**, no formato real da
   tela: 18 arquivos, das seções às páginas de detalhe e de acesso direto. As
   peças comuns ficam em `src/app/(admin)/admin/_ui/Esqueletos.tsx`. O título
   da tela é texto real; o resto usa o `Skeleton` do design.
2. **`admin/loading.tsx` é o skeleton do Dashboard.** Por estar na pasta
   `admin/`, ele também é o limite das seções filhas. Foi verificado que isso
   não gera dois skeletons em sequência nem vaza para o slot `@modal` (ver
   "Como foi verificado").
3. **Indicador de navegação pendente** (`IndicadorDeNavegacao`, com
   `useLinkStatus`) nos links que mudam só a query, onde o Next mantém a tela
   antiga sem skeleton: abas (`Abas`), período (`SeletorDePeriodo`), chips de
   Remarketing, Relatórios e filtros de Clientes, ferramentas do cardápio e,
   na fila de pedidos, "Ver detalhes" e o botão de comanda. Também no menu
   lateral e na gaveta, para rede lenta. Aparece só se a espera passar de
   120 ms e pulsa no ritmo do skeleton. Sobre o CTA vermelho, usa a cor do
   texto.
4. **Painéis que fecham ao escolher um link passam a fechar quando a URL
   muda** (`useFecharAoNavegar`): gaveta do celular, filtros de Clientes,
   menu de ferramentas do cardápio e menu "⋯" do pedido. Antes fechavam no
   clique e levavam o indicador junto.
5. **Filtro de Produtos (`next/form`)**: o `next/form` navega com
   `router.push`, fora do alcance de `useFormStatus`. A espera é estado local
   (`MarcaDeEspera`), encerrado quando a URL muda. Enviar o mesmo endereço
   não liga a espera.

**Como foi verificado.** Num app mínimo com Next 16.3.5 em modo produção,
com a mesma estrutura de rotas (grupo com layout que lê `cookies()`, slot
`@modal` com catch-all e rota interceptada) e páginas atrasadas em 1,5 s:
- troca de seção mostra o skeleton da seção em 20–60 ms, também quando o
  clique vem antes de o pré-carregamento terminar;
- o skeleton de `admin/` não aparece antes do da seção nem dentro do modal;
- o detalhe mostra o seu skeleton, não o da lista;
- troca de query mantém a tela antiga, e `useLinkStatus` fica pendente a
  espera inteira;
- pré-carregar uma seção custa 2 requisições curtas e não reexecuta o layout
  do painel no servidor.

Os projetos Supabase de dev e de produção assinam o JWT com chave
assimétrica (ES256, conferido no JWKS público). O `getClaims` do middleware
valida a sessão localmente, sem ida ao Auth, inclusive nas requisições de
pré-carregamento.

**Não muda.** Nenhum dado é posto em cache. O tempo real, as permissões e as
consultas das páginas continuam iguais. Não há fade global de página.

**Onde foi formalizada:** `07-MOVIMENTO-E-DESEMPENHO.md` §3, §5 ("Navegação
entre páginas") e §8; `src/app/(admin)/admin/**/loading.tsx`;
`src/app/(admin)/admin/_ui/Esqueletos.tsx`;
`src/ui/components/IndicadorDeNavegacao.tsx`;
`src/ui/hooks/useFecharAoNavegar.ts`; classe `indicador-navegacao` em
`src/app/globals.css`.

---

## D-2026-09-29-88 — Desempenho percebido do painel, Etapa 2: cabeçalho sem espera

**Data:** 29/09/2026 · **Etapa 2 do plano aprovado ("sigamos com a etapa 2")**

**Decisão.**
1. **O sino de notificações sai do caminho do cabeçalho.** O layout do
   painel esperava a lista de notificações depois da sessão; agora ela chega
   por streaming dentro de `<Suspense>`, com um skeleton de 44×44 px no lugar
   do botão. Em `router.refresh()` o sino já exibido continua na tela. Se a
   lista falhar, o sino abre vazio em vez de derrubar o painel; a consulta de
   reserva de 60 s e o Realtime o preenchem depois.
2. **Sessão e permissões numa só consulta.** `obterSessaoInterna` fazia
   `app_users` e depois `user_roles` (com papéis e permissões), em fila. Agora
   é uma consulta ao `app_users` com as tabelas embutidas pelo PostgREST. A
   dica `user_roles!user_roles_app_user_id_fkey` é obrigatória, porque
   `user_roles` também referencia `app_users` por `assigned_by`.
   A montagem da sessão virou a função pura `montarSessaoInterna`, com testes.

**Por que sem migration.** O plano previa uma função no banco. O embed do
PostgREST dá o mesmo ganho, uma ida ao banco em vez de duas, sem objeto novo
no banco e sem mudar o RLS: cada tabela embutida continua filtrada pela
própria política, como antes.

**Como foi verificado.** A consulta foi aceita pelo PostgREST do projeto de
dev (sem a dica, ele recusa por ambiguidade, PGRST201). No banco de dev, com
o JWT de cada usuário interno simulado sob `authenticated`, o Owner/Admin
ativo obteve as mesmas 39 permissões pelos dois caminhos. O usuário inativo
não enxerga nem o próprio `app_users` nem vínculos, e a sessão continua nula.

**`getClaims`.** Não faz ida ao Auth: dev e produção usam ES256, e o JWKS
fica em cache global por 10 minutos no `auth-js` (ver D-2026-09-29-87).

**Não muda.** Nenhum cache de permissão entre requisições (`React.cache`
continua restrito à renderização corrente). O sino segue com as mesmas
permissões, Realtime e consulta de reserva.

**Onde foi formalizada:** `07-MOVIMENTO-E-DESEMPENHO.md` §7;
`src/app/(admin)/layout.tsx` (`SinoDoPainel`);
`src/application/auth/sessao.ts`; `montarSessaoInterna` em
`src/application/auth/permissoes.ts`; `tests/application/sessao.test.ts`.

---

## D-2026-09-29-89 — Desempenho percebido do painel, Etapa 3: tempo real da Central sem recarga repetida

**Data:** 29/09/2026 · **Etapa 3 do plano aprovado ("sigamos com a etapa 3")**

**Contexto.** A Central de Pedidos chamava `router.refresh()` a cada evento de
`orders`, na hora. Cada refresh reexecuta a página inteira. Um pedido que muda
de status três vezes em poucos segundos pagava três vezes, e a aba escondida
continuava recarregando. O PDV já resolvia isso desde a Fase 12, Etapa 10.

**Decisão.**
1. O núcleo do PDV foi extraído para `criarAgendadorDeRecarga` (puro, com
   teste), ligado ao React por `useRecargaAgrupada`. PDV e Central usam o
   mesmo agendador; cada um mantém os próprios canais.
2. **Janela contada do primeiro evento.** No PDV ela reiniciava a cada evento.
   Com eventos contínuos, a tela nunca recarregaria. Agora o refresh sai no
   máximo uma janela depois do primeiro evento, e os eventos dentro dela vão
   junto.
3. **Janelas:** PDV continua com 500 ms; Central com 1 s, dentro do previsto
   no plano (1 a 2 s). O sino de notificações, que avisa com som, não passa
   por esta janela.
4. **Central com aba oculta:** o refresh fica represado e sai uma vez quando
   a aba volta. A guarda de cobrança em andamento continua.
5. **Central relê a fila ao reconectar.** O Realtime não reenvia eventos
   perdidos durante uma queda de conexão, comum no celular com a tela
   apagada. Quando o canal volta a `SUBSCRIBED` depois de já ter estado
   ligado, a fila é relida.
6. Depois de concluir uma cobrança na própria Central, o refresh continua
   imediato, sem janela: é a resposta à ação do operador.

**Não muda.** O evento continua sendo só gatilho. A carga útil não é lida, e
quem informa é o servidor, sob RLS. Nenhuma operação financeira depende do
Realtime: a garantia contra cobrança dupla continua no banco.

**Onde foi formalizada:** `07-MOVIMENTO-E-DESEMPENHO.md` §7;
`09-PDV-FRENTE-DE-CAIXA.md` (nota na Etapa 10); `src/ui/agendadorDeRecarga.ts`;
`src/ui/hooks/useRecargaAgrupada.ts`;
`src/app/(admin)/admin/pdv/_ui/useRealtimeDoPdv.ts`;
`src/app/(admin)/admin/pedidos/_ui/CentralDePedidos.tsx`;
`tests/ui/agendadorDeRecarga.test.ts`.

---

## D-2026-09-29-90 — Desempenho percebido do painel, Etapa 4: telas por partes

**Data:** 29/09/2026 · **Etapa 4 do plano ("sigamos com a etapa 4")**

**Decisão.**
1. **Dashboard:** as quatro consultas começam juntas, mas a página só espera
   a Central de Atenção, que é a parte que pede ação (RN-DASH-001). Resumo,
   ranking e movimento do período chegam cada um no seu `<Suspense>`, com o
   mesmo skeleton do `loading.tsx` (`_ui/EsqueletosDoDashboard.tsx`). O
   rótulo do período no cabeçalho também chega à parte.
2. **Troca de período mostra skeleton na hora:** o `key` de cada `<Suspense>`
   inclui o período. Sem ele, o Next manteria os números do período anterior
   até o relatório mais lento chegar.
3. **Relatórios:** com o tipo na URL, o relatório é consultado junto com o
   catálogo, e não depois dele. O catálogo continua decidindo: tipo fora da
   lista do usuário tem a resposta antecipada descartada, e o banco a
   recusaria de qualquer forma. A tabela chega num bloco com skeleton, com
   `key` por tipo e período.
4. **Equipe:** cada aba busca só o que mostra. Movimentações usa 2 consultas,
   Equipe 2 e Histórico financeiro 3, em vez das 6 de toda visita. O painel
   continua recebendo todas as listas, vazias quando a aba não as usa;
   nenhum estado dele nasce delas.

**Como foi verificado.** Numa rota temporária, já removida, que renderizava
as páginas reais sem sessão:
- o HTML transmitido tem as quatro fronteiras do Dashboard, com os skeletons
  primeiro;
- os logs mostram as consultas partindo juntas;
- a aba de movimentações não consulta equipe nem papéis;
- com um atraso temporário no ranking, a troca de período atualizou a tela
  em ~300 ms, com skeleton só no bloco lento até ele chegar.

**Não muda.** Nenhum dado em cache. As consultas, as permissões e o RLS
continuam os mesmos, e a ordem da página também.

**Onde foi formalizada:** `07-MOVIMENTO-E-DESEMPENHO.md` §7;
`src/app/(admin)/admin/page.tsx`, `loading.tsx`,
`_ui/EsqueletosDoDashboard.tsx`; `relatorios/page.tsx`; `equipe/page.tsx`.

---

## D-2026-09-29-91 — Desempenho do painel: Etapa 5 descartada; Etapa 7 refeita pela medição

**Data:** 29/09/2026 · **Decisão do responsável pelo produto nesta conversa
("pula a etapa 5, sigamos com a etapa 7")**

**Etapa 5 (cache de configuração) — descartada.** A análise feita antes de
implementar mostrou:
- **ganho quase nulo:** as leituras de configuração do painel já rodam em
  paralelo com consultas maiores, e a tela espera a mais lenta;
- **risco de dado velho:** `loja_publica` traz "aberta agora", que depende do
  horário, e os prazos atuais, que mudam no expediente. As formas de
  pagamento dependem do Pix por chave ligado. Mudança feita fora da tela de
  Configurações deixaria o balcão com dado antigo;
- **custo técnico:** sem Cache Components só existe `unstable_cache`, já
  substituído no Next 16, e o cache não poderia usar a sessão do usuário.

Nenhum cache de dado foi introduzido no painel.

**Etapa 7 (carregamento sob demanda) — medida antes de mexer.** O plano
previa carregar sob demanda os modais pesados. A medição do build de produção
(JavaScript de entrada de cada tela, via manifesto de referências de cliente)
mostrou outro culpado:
- o exclusivo de cada tela é pequeno: 23 KB gzip em Pedidos, a maior, com os
  modais incluídos;
- o comum a todas as telas pesava 88 KB gzip, e 66 KB disso eram o
  `supabase-js`. Ele entrava estático porque o sino (em todas as telas), a
  Central de Pedidos e o PDV importavam o cliente do Realtime diretamente.

**Decisão.**
1. O cliente do Realtime passa a ser carregado por `import()`
   (`carregarClienteRealtime`, em
   `src/infrastructure/supabase/realtimeSobDemanda.ts`), só quando a tela
   liga o canal, depois de aparecer. O `getSupabaseRealtimeClient`, que lê a
   sessão antes de entrar no canal, continua o mesmo.
2. **Os modais continuam no pacote da tela.** A economia seria de poucos KB,
   que o navegador guarda em cache depois da primeira visita. Em troca, o
   primeiro clique em Cobrar, Comanda ou Detalhes esperaria um download no
   meio do atendimento.

**Resultado medido (JavaScript de entrada, gzip):**

| Tela | Antes | Depois |
|---|---:|---:|
| Pedidos | 108 KB | 42 KB |
| PDV | 101 KB | 35 KB |
| Produtos | 93 KB | 27 KB |
| Dashboard | 86 KB | 20 KB |

Em execução, o chunk do cliente chegou separado, depois da página, e o canal
de teste ficou `SUBSCRIBED` em ~350 ms após a montagem (modo dev).

**Onde foi formalizada:** `07-MOVIMENTO-E-DESEMPENHO.md` §7;
`src/infrastructure/supabase/realtimeSobDemanda.ts`;
`src/ui/notificacoes/SinoNotificacoesAdmin.tsx`;
`src/app/(admin)/admin/pdv/_ui/useRealtimeDoPdv.ts`;
`src/app/(admin)/admin/pedidos/_ui/CentralDePedidos.tsx`.

---

## D-2026-09-29-92 — A fila de pedidos volta a exigir `orders.view` (defeito de segurança)

**Data:** 29/09/2026 · **Encontrado durante a Etapa 6 do plano de
desempenho. Aplicação em dev e produção autorizada pelo responsável nesta
conversa.**

**O defeito.** A migration 0108 (23/09, Fase 10, otimização da aba
Encerrados) recriou `fila_de_pedidos` como `SECURITY DEFINER`. Até ali ela era
INVOKER, sob o RLS, e o próprio comentário dizia "sem orders.view não retorna
nada". Como DEFINER e sem nenhuma checagem no corpo, a função passou a
entregar a fila a qualquer sessão `authenticated`. Medido no DEV, a suíte
nova antes da correção reprovou 4 de 12 cenários:
- usuário interno desativado recebe 16 pedidos encerrados (o RLS dele mostra 0);
- conta de login sem usuário interno recebe os mesmos 16;
- papel ativo sem `orders.view` recebe os mesmos 16;
- a guarda não existe no corpo da função.

Os pedidos saíam com nome do cliente, total e forma de pagamento. `anon`
nunca executou a função. A produção ainda não tem contas nem pedidos, então
**não houve exposição de dado real**.

**Correção (migration 0131).** A função continua DEFINER, porque as policies
de pedido avaliam `has_permission` linha a linha e isso anularia o ganho da
0108. A mesma regra das policies entra no corpo como
`(select public.has_permission('orders.view'))`, avaliada uma vez por
chamada. A regra de acesso fica idêntica à do RLS. Com a correção aplicada
na transação, a suíte passa 12 de 12, e a dona continua vendo exatamente o
que o RLS mostra.

**Varredura.** Todas as funções `SECURITY DEFINER` executáveis por
`authenticated` foram conferidas. As que não têm guarda de permissão no corpo
são auxiliares que só devolvem configuração (`dia_da_loja`, `fuso_da_loja`,
`limite_de_alerta`, `periodo_analitico`, `is_internal_user`) ou projeções
públicas do cardápio. `fila_de_pedidos` era a única que expunha dado
interno.

**Regra nova:** `03-RLS-RBAC-SEGURANCA.md` §4. Função DEFINER que lê dado
interno carrega no corpo a permissão das policies que contorna, e tem teste
negativo.

**Onde foi formalizada:**
`supabase/migrations/20260929120000_fila_de_pedidos_exige_orders_view.sql`;
`supabase/tests/fila_de_pedidos_permissao.sql`; `03-RLS-RBAC-SEGURANCA.md`;
`supabase/README.md`.

---

## D-2026-09-29-93 — Aba Encerrados por janela (Etapa 6 do plano de desempenho)

**Data:** 29/09/2026 · **Decisão do responsável pelo produto nesta conversa**

**Contexto.** A aba Encerrados trazia todo pedido encerrado desde sempre. Com
~40 pedidos por dia, são ~1.200 por mês. A Fase 10 mediu 7.600 em 592 ms no
banco, mas a tela ainda mandava todos ao navegador e desenhava cada um duas
vezes (tabela e cartões). A 0108 e o 05 §14.8 deixaram "quantos mostrar"
como decisão de produto.

**Decisão.**
1. **Com caixa aberto**, a aba mostra os encerrados feitos desde a abertura
   do caixa. É o expediente de verdade, que atravessa a meia-noite
   (CLAUDE.md §25). Com mais de uma registradora aberta, vale a abertura mais
   antiga.
2. **Sem caixa aberto**, mostra os do dia de calendário, no fuso da loja.
3. **"Carregar dias anteriores"** recua a janela 7 dias por vez, até o começo
   de um dia de calendário. A janela nunca encolhe: com um caixa esquecido
   aberto há dez dias, recuar 7 não corta a abertura. A tela mantém a posição
   da rolagem ao carregar.
4. O critério é o `created_at` do pedido, o mesmo da ordenação da lista,
   atendido pelo índice `orders_status_criado`.

**Registrado na conversa.** A primeira descrição dessa opção dizia "dia
operacional, inclui a madrugada", regra que o sistema não tem. Antes de
implementar, a pergunta foi refeita, e a escolha foi a abertura do caixa.

**Implementação.** Migration 0132 com `pedidos_encerrados(p_dias_anteriores)`.
É DEFINER com a mesma guarda de `orders.view` da 0131 e devolve a janela
(`desde`, `origem`, `ha_mais`) junto com os pedidos. A função lê só o
instante de abertura do caixa, sem nenhum valor, por cima do RLS de
`cash_sessions`. A aplicação chama a função nova; `fila_de_pedidos(true)`
continua existindo e protegida.

Três ajustes de apresentação, necessários à janela:
- uma frase acima da lista diz qual janela está na tela;
- pedido de outro dia mostra data e hora, em vez de só a hora;
- abrir e fechar um pedido preserva os dias carregados.

Falha na consulta mostra "Não foi possível carregar", com "Tentar de novo",
em vez de "nenhum pedido".

**Como foi verificado.** Suíte `pedidos_encerrados_janela.sql` no DEV, em
transação: 18 de 18, mais os dois cenários de exclusão e `ha_mais`
verdadeiro. Com a janela de hoje, 0 pedidos na lista e 16 anteriores, com
`ha_mais` verdadeiro. Mais 9 testes unitários de URL e apresentação. Sem
login não foi possível ver a aba com dados; o estado de falha foi conferido
na tela.

**Onde foi formalizada:**
`supabase/migrations/20260929130000_pedidos_encerrados_por_janela.sql`;
`supabase/tests/pedidos_encerrados_janela.sql`;
`src/application/pedidos/janelaDeEncerrados.ts`,
`src/application/pedidos/consultas.ts` (`listarEncerrados`);
`src/app/(admin)/admin/pedidos/page.tsx`; `05-PLANO-IMPLEMENTACAO.md` §14.8.

---

## D-2026-09-29-94 — Auditoria escrita em frases

**Data:** 29/09/2026 · **Pedido do responsável pelo produto ("ajuste a
linguagem da auditoria, não fica claro")**

**Problema.** A seção Auditoria mostrava o código técnico e a tabela
("pedido_cancelar · orders"), e embaixo o motivo ou um genérico "Ação de
usuário". Não dizia qual pedido, quem agiu nem o que mudou. A hora saía de
`toLocaleString` sem fuso, e no servidor da Vercel (UTC) apareceria 3 h
adiantada.

**Decisão.**
1. **Título em frase**, com o número do pedido quando o registro é de
   pedido: "Pedido #1042 cancelado", "Comanda do pedido #1042 reimpressa",
   "Configurações da loja alteradas", "Caixa aberto".
2. **Linha de detalhe:** quem agiu ("Por Rafaela", ou "Registrado
   automaticamente pelo sistema"), a mudança de status com os rótulos da fila
   ("Em produção → Cancelado") e o motivo ("Motivo: teste"). Lançamento
   financeiro usa "Descrição", que é o que o campo guarda ali. Sem motivo,
   nada é inventado no lugar.
3. **Hora no fuso da loja.**
4. **Cobertura:** os códigos gravados pelas migrations (comandos do pedido,
   impressão, pagamento, caixa, financeiro, entregas, equipe, acessos,
   códigos de barras, clientes e o gatilho genérico de configuração, com o
   particípio concordando com o nome). Código fora do mapa aparece legível,
   nunca some.

**Dados.** A consulta passa a trazer o nome de quem agiu (embed do
funcionário, sob RLS) e só o `status` de antes e depois. O restante de
`before_data`/`after_data` não é lido. O número do pedido vem de uma segunda
leitura em `orders`, sob o RLS dela. Nada muda no que é gravado, nem na
regra de acesso (`audit.view`).

**Onde foi formalizada:**
`src/application/configuracoes/descricaoDaAuditoria.ts` (com teste);
`listarAuditoria` em `src/application/configuracoes/consultas.ts`;
`src/app/(admin)/admin/configuracoes/_ui/SecaoAuditoria.tsx`.

---

## D-2026-09-29-95 — Menu do cliente com as cores do menu do painel

**Data:** 29/09/2026 · **Pedido do responsável pelo produto ("esse menu
precisa seguir a cor do menu do painel; essa cor marrom pesa")**

**Decisão.** A gaveta "Seu cardápio" (Meus pedidos, Histórico, Favoritos)
troca o degradê marrom escuro pelos tokens do menu do painel
(`admin-nav-*`):
- superfície clara e borda suave;
- título em cor de tinta e rótulo "Seu cardápio" no laranja do item ativo;
- ícones laranja sobre fundo claro;
- item da página atual no amarelo-claro com borda laranja.

No tema escuro, o menu acompanha o painel escuro (grafite neutro). Estrutura,
textos, alvos de toque e comportamento de dialog não mudam.

**Onde foi formalizada:** `src/app/(publico)/_ui/MenuPublico.tsx`.

---

## D-2026-09-29-96 — Desempenho do cardápio público: skeleton por página, fotos no tamanho certo, sem consulta em fila

**Data:** 29/09/2026 · **Aprovado pelo responsável pelo produto ("sigamos
com os itens 1, 2 e 3")**

**Análise que veio antes** (build de produção, catálogo do DEV). A página
inicial tem 64 cards, transfere 26 KB gzip de HTML, tem 23 KB gzip de JS e
44 imagens, 42 delas lazy. Nesse volume, **lista virtual e carregamento sob
demanda não compensam**. Eles quebrariam a busca do navegador (Ctrl+F), a
indexação, os leitores de tela e a navegação por categoria, por um ganho de
poucos KB. Os gargalos reais eram outros três.

**Decisão.**
1. **Skeleton por página.** Havia um único `loading.tsx` no grupo, que não
   aparece ao navegar entre páginas, e as rotas dinâmicas não eram
   pré-carregadas. Tocar numa pizza mantinha o cardápio parado até a página
   chegar inteira. Agora início, categoria, produto, carrinho, checkout, meus
   pedidos, histórico, favoritos e acompanhamento têm cada um o seu, no
   formato real. O do início passou de lista para a grade de cards.
2. **Foto do card no tamanho do card.** O `sizes` pedia 50vw no celular para
   um card de 1/3 da tela. Agora descreve as colunas reais: 34vw, 25vw, 20vw
   e 224 px.
3. **"Mais pedidos" junto com as outras consultas**, em vez de depois delas.
   Na busca, nem é pedido.

**Medido** (build de produção, 375 px):
- tocar num produto mostra o skeleton do produto em 37 ms (a página chega em
  ~730 ms); categoria, início e carrinho mostram o próprio skeleton em 20 a
  40 ms;
- em tela 2x, a foto do card caiu de 384 px para 256 px, cerca de 55% menos
  pixels;
- a página inicial completa caiu de ~0,20 s para ~0,15 s.

**Não muda.** Nenhum cache do cardápio: preço, promoção e disponibilidade
continuam lidos a cada acesso, pelo mesmo motivo da Etapa 5 descartada
(D-2026-09-29-91).

**Onde foi formalizada:** `07-MOVIMENTO-E-DESEMPENHO.md` §5 e §7;
`src/app/(publico)/**/loading.tsx`; `src/app/(publico)/_ui/Esqueletos.tsx`;
`src/app/(publico)/_ui/CardProduto.tsx`; `src/app/(publico)/page.tsx`.

---

## D-2026-09-29-97 — Sabores de pizza com o nome do sabor, e busca por palavras

**Data:** 29/09/2026 · **Aprovado pelo responsável pelo produto (lista
"antes → depois" e itens 1 a 5)**

**Contexto.** Para a fogazza reaproveitar os sabores de pizza (discussão em
aberto, ver "Fogazza" abaixo), os sabores precisam se chamar pelo sabor, e
não "Pizza de …". Renomear também limpa a comanda: a meio a meio deixa de
sair como "1x Pizza mussarela / Pizza calabresa".

**Decisão (dados do DEV).**
1. Os 61 sabores que começavam com "Pizza " passam a se chamar só pelo sabor
   ("Pizza calabresa" → "Calabresa"). "À Moda" e "À Moda da casa" não mudam.
2. Com crase: "À sua escolha", "À moda do pizzaiolo".
3. Grafia de marca: "Shalon" (era "Shallon"), "Chocolate branco c/
   Chocoball" (era "chocoboll"), "Sonho de Valsa" e "Bis" com maiúscula.
4. Dois endereços trocados corrigidos: a Brócolis sai de `/produto/pizza-bauru`
   e vai para `/produto/pizza-brocolis`, que era da Caipira; a Caipira vai
   para `/produto/pizza-caipira`. Os demais endereços não mudam.
5. Nomes com número ("Caipira 3", "Dois queijos 2", "Lombo 2", "Milho verde
   2") ficam como estão até a Shalon dizer o que diferencia cada um.

Produção ainda não tem catálogo: lá o cadastro nasce com estes nomes.

**Consequência encontrada e corrigida: a busca.** `buscar_catalogo`
procurava o termo inteiro como um trecho só. Com a renomeação, "pizza
calabresa" passou a devolver 0. A migration 0133 faz a busca casar
**palavras**: cada palavra do termo precisa aparecer no nome, na descrição,
na categoria ou num tamanho oferecido, e palavras de ligação (de, com, c/…)
não contam. A palavra inteira no nome vem primeiro na ordem. Medido no DEV:

| Termo | Antes | Depois |
|---|---|---|
| pizza calabresa | 0 | 8 (Calabresa primeiro) |
| pizza de calabresa | 0 | 8 |
| chocolate morango | 0 | 1 |
| chocolate c/ morango | 0 | 1 |

A seção 8 da `publico_fase4.sql` passa inteira, com 3 cenários novos. A
função continua INVOKER, sob o RLS de `products`; o termo é escapado antes
de virar regex.

**Fogazza, ainda em aberto.** Direção discutida: dois produtos de entrada
("Fogazza salgada", "Fogazza doce"), cada um com uma foto. O cliente escolhe
1 sabor dentre os sabores de pizza marcados para fogazza, sem meio a meio e
sem borda, com adicionais cobrados à parte, e os relatórios contam fogazza
separada da pizza. Isso muda a RN-FOG-001 ("fogazza não herda regras de
pizza"). Faltam quatro respostas da Shalon: preço (único, faixa ou por
sabor), quais sabores entram, adicionais iguais aos da pizza ou não, e se a
falta de ingrediente é compartilhada.

**Onde foi formalizada:**
`supabase/migrations/20260929140000_busca_por_palavras.sql`;
`supabase/tests/publico_fase4.sql` (8.13 a 8.15); dados do catálogo no DEV.

---

## D-2026-09-29-98 — Fogazza vendida a partir do sabor de pizza (entrega 1: regra, modelo e painel)

**Data:** 29/09/2026 · **Decisão do responsável pelo produto nesta conversa**

**Respostas da Shalon.**
- Preço individual por sabor, a partir de R$ 17,00.
- Todos os sabores de pizza existem como fogazza.
- Mesmos adicionais, pelo preço da Tradicional.
- Sabor esgotado esgota pizza e fogazza.

**Decisão.** Fogazza é o sabor de pizza vendido num tamanho marcado como
fogazza (RN-FOG-002 a 006). O cliente chega por cards de entrada ("Fogazza
salgada", "Fogazza doce"), escolhe um sabor, sem meio a meio e sem borda,
com adicionais cobrados à parte. O motor que já calcula a pizza calcula a
fogazza: preço, promoção, disponibilidade, limite por pedido e comanda. A
RN-FOG-001 continua valendo só para a fogazza comum, de preço próprio.

**Entrega 1 (migration 0134):**
- `pizza_sizes.sold_as` (`pizza`/`fogazza`); o tamanho de fogazza tem 1
  sabor, não recebe borda e só serve a sabor de pizza;
- `products.flavor_category_id` e `flavor_size_id` no card de entrada;
- `copiar_precos_adicionais(de, para)`, DEFINER com a guarda de
  `catalog.manage` e auditoria;
- **blindagem**: `cardapio_publico`, `tamanhos_publicos` e `buscar_catalogo`
  passam a considerar só tamanho vendido como pizza e escondem o card de
  entrada. O cliente não vê nada de fogazza nova até a entrega 2, e a pizza
  não passa a mostrar "a partir de R$ 17";
- **painel**: "Vendido como" na criação de tamanho; "Copiar preços da
  Tradicional" em Adicionais; borda sem o tamanho de fogazza; aba "Sabores"
  no produto do tipo fogazza; o tamanho de fogazza só é oferecido a sabor de
  pizza.

**Fica para depois.**
- **Entrega 2 (cardápio):** vitrine dos cards, lista de sabores com busca e
  configurador com o tamanho fixo. A disponibilidade do card da pizza
  (`produto_disponivel`) também precisa deixar de contar a variação de
  fogazza: hoje, pizza com os tamanhos de pizza pausados e a fogazza ativa
  apareceria disponível.
- **Entrega 3 (relatórios):** ranking e relatórios separando fogazza de
  pizza pelo tamanho; busca do "Novo pedido" no painel. Enquanto isso, o
  "Novo pedido" também não oferece a fogazza nova, porque usa as mesmas
  leituras blindadas.

**Onde foi formalizada:** `04-REGRAS-NEGOCIO.md` RN-FOG-001 (marcada) a
RN-FOG-006; `02-MODELO-DADOS-SUPABASE.md` §5.2, §5.3, §5.4;
`supabase/migrations/20260929150000_fogazza_por_sabor.sql`;
`supabase/tests/fogazza_entrega1.sql`; painel em `produtos/_ui`.

---

## D-2026-09-29-99 — Fogazza por sabor, entrega 2: a vitrine

**Data:** 29/09/2026 · **Entrega aprovada pelo responsável pelo produto nesta conversa**

**Decisão.** Os cards de entrada saem da blindagem da entrega 1 e viram a
vitrine da fogazza (RN-FOG-003):
- o card aparece no cardápio, na categoria, no link direto e na busca, com
  "a partir de" o menor preço de fogazza dos sabores; a busca também o acha
  pelo nome do sabor;
- a página do card lista os sabores, com busca, preço e "indisponível hoje";
  o sabor abre `/produto/<card>/<sabor>`: o configurador de sempre, com o
  tamanho fixo, só adicionais e observação; é para lá que o "Editar" do
  carrinho volta;
- o "Novo pedido" do balcão segue o mesmo caminho (card → sabor →
  configurador), com as mesmas leituras. Estava previsto para a entrega 3;
  entrou aqui porque, com o card visível, o balcão abriria um card sem preço.

**Disponibilidade (RN-FOG-006 e RN-FOG-007, novas redações).**
- A fogazza só se vende enquanto houver card disponível para aquele tamanho
  e aquela categoria: pausar o card, ou a categoria dele, pausa as fogazzas.
  A regra está em `variante_disponivel`, que o motor de preço já consulta —
  vale no cardápio, no carrinho, no checkout e no balcão.
- A pendência da D-98 foi resolvida sem mexer em `produto_disponivel`, que
  continua dizendo se o sabor é vendável em algum tamanho (é o que o motor de
  preço precisa). O que o cardápio mostra passou para
  `produto_disponivel_no_cardapio`: a pizza depende só dos tamanhos de pizza,
  e o card depende dele, da categoria e de haver sabor à venda.
- A lista de produtos do painel mostra o mesmo: o card com a faixa de preço
  dos sabores, e a pizza sem o preço de fogazza na faixa.

**Na tela.** O item entra no carrinho com o nome do sabor e, abaixo, o nome
do tamanho de fogazza, como o tamanho da pizza ("Calabresa · Fogazza"). A
página do sabor não tem favorito: o favorito guarda o produto, que ali é o
sabor de pizza; o card de entrada é que pode ser favoritado.

**Fica para a entrega 3.** Relatórios e "Mais pedidos" separando fogazza de
pizza pelo tamanho (hoje a fogazza vendida conta para o sabor). O PDV não
muda: a venda rápida não aceita item que exige preparo, e pizza e fogazza
exigem.

**Onde foi formalizada:** `04-REGRAS-NEGOCIO.md` RN-FOG-003, RN-FOG-006 e
RN-FOG-007; `02-MODELO-DADOS-SUPABASE.md` §5.2 e §5.3;
`supabase/migrations/20260929160000_fogazza_vitrine.sql`;
`supabase/tests/fogazza_entrega2.sql` (e D4–D7 de
`fogazza_entrega1.sql` atualizados); telas em `(publico)/produto/[slug]`,
`(publico)/produto/[slug]/[sabor]`, `_ui/EscolherSabor.tsx` e
`admin/pedidos/_ui/EscolherProduto.tsx`.

---

## D-2026-09-29-100 — Fogazza em sabor de preço único

**Data:** 29/09/2026 · **Decisão do responsável pelo produto nesta conversa**
("Adaptar o motor")

**O achado.** A validação da entrega 2 no dev mostrou que o desenho da
fogazza supôs que todo sabor tem tamanhos de pizza. No cadastro real, 61 dos
63 sabores vendem por um preço único (`base_price`, sem variação). Ao ganhar
o preço de fogazza — uma variação —, a pizza desses sabores deixava de ser
vendável: o motor pedia um tamanho que não existe. A entrega 1 já estava em
produção com esse defeito, mas sem produto cadastrado lá, sem dano.

**Decisão.** O preço de fogazza não é tamanho de pizza. Em todo lugar em que
"ter variação" significava "ter tamanho", passa a valer "ter tamanho de
pizza": o preço único continua sendo o preço da pizza, e o de fogazza fica à
parte (RN-DISP-006 e RN-PROMO-003, novas redações). Nenhuma regra de preço
muda: o preço efetivo do produto e o da variação já eram calculados
separados, cada um com a sua promoção.

**O que mudou (migration 0136):** `produto_disponivel`, `montar_item` (só
tamanho de pizza pede "Escolha um tamanho."), `produto_disponivel_no_cardapio`
e o gatilho de promoção por produto. No painel, a promoção oferece a pizza de
preço único pelo produto e a fogazza dela pela variação; o texto de ajuda do
preço próprio explica que o preço de fogazza não conta como tamanho.

**Onde foi formalizada:** `04-REGRAS-NEGOCIO.md` RN-DISP-006 e RN-PROMO-003;
`02-MODELO-DADOS-SUPABASE.md` §5.2;
`supabase/migrations/20260929170000_fogazza_em_preco_unico.sql`;
`supabase/tests/fogazza_preco_unico.sql`.

---

## D-2026-09-30-101 — Fogazza por sabor, entrega 3: relatórios e "Mais pedidos"

**Data:** 30/09/2026 · **Decisão do responsável pelo produto nesta conversa**

**Decisão.**
- **Relatórios e ranking do painel:** uma linha por sabor ("Calabresa ·
  Fogazza"), separada da pizza, na categoria do card de entrada; vendas por
  categoria separam fogazza de pizza (RN-FOG-008).
- **"Mais pedidos" do cardápio:** a fogazza soma no card de entrada; a pizza
  do sabor conta só pizzas (RN-POP-005).

**Como (migration 0137).** `vendas_por_produto` ganha `tamanho_id` (o
tamanho de fogazza da linha, nulo nas demais) — troca de assinatura, com as
concessões restauradas só para `service_role`. `ranking_de_produtos`
devolve `chave` única por linha, a fogazza como item próprio (com a
disponibilidade da fogazza e "entrou no catálogo" pela data do preço de
fogazza) e deixa o card de entrada de fora; a disponibilidade da pizza passa
a ser a do cardápio. `mais_pedidos` soma a fogazza no card e filtra pela
disponibilidade do cardápio. No painel, as listas do ranking usam `chave`.

**Limite conhecido.** O pedido não guarda a qual card pertencia: o card e o
"vendido como fogazza" são lidos do cadastro atual.

**Onde foi formalizada:** `04-REGRAS-NEGOCIO.md` RN-FOG-008 e RN-POP-005;
`supabase/migrations/20260930100000_fogazza_nos_relatorios.sql`;
`supabase/tests/fogazza_entrega3.sql`; `domain/analitico/ranking.ts`.

---

## D-2026-09-30-102 — A fogazza se monta no card

**Data:** 30/09/2026 · **Decisão do responsável pelo produto nesta conversa**

**O achado (uso real no dev).** Montar a fogazza exigia três passos em três
telas (criar o tamanho de fogazza, ligar o card à categoria, dar o preço em
cada sabor). No caminho, a tela deixou o card "Fogazza doce" receber o
tamanho Tradicional, de pizza — e ele virou pizza: 8 fatias, meio a meio,
borda.

**Decisão.**
1. Fogazza não tem tamanho (RN-FOG-009): o banco recusa tamanho em produto
   do tipo fogazza e recusa virar fogazza um produto com tamanhos; a aba
   Tamanhos some para a fogazza.
2. A aba Sabores do card monta tudo (RN-FOG-003): categoria de pizza, lista
   de todos os sabores dela com "entra" e preço, salvos numa operação só
   (`montar_fogazza`, atômica, com `catalog.manage` e auditada). Cria o
   tamanho "Fogazza" se não houver. O preço continua no sabor; quem sai tem
   o preço desativado, não apagado.
3. O card do dev que tinha recebido tamanho de pizza foi corrigido (a
   variação já tinha sido removida pela tela).

**Onde foi formalizada:** `04-REGRAS-NEGOCIO.md` RN-FOG-003 e RN-FOG-009;
`supabase/migrations/20260930120000_fogazza_montada_no_card.sql`;
`supabase/tests/fogazza_montagem.sql`; `produtos/_ui/EdicaoProduto.tsx` e
`ListaSaboresDaFogazza.tsx`.

---

## D-2026-09-30-103 — Inativo não aparece no cardápio, nem para quem está logado

**Data:** 30/09/2026 · **Decisão do responsável pelo produto nesta conversa**

**O achado.** A "Fogazza mussarela", inativada, aparecia no cardápio público
como "indisponível" para quem estava logado no painel. As leituras do
cardápio confiavam no RLS para esconder inativos; o RLS da equipe mostra
inativos, porque o painel precisa deles.

**Decisão.** Inativo não é cardápio para ninguém: o filtro de ativo passa a
estar escrito nas leituras públicas (cardápio, link direto, busca, tamanhos,
sabores do meio a meio e categorias). Equipe logada e visitante veem o mesmo
cardápio. Temporariamente indisponível continua aparecendo marcado; só o
inativo sai. Inativar continua sendo a forma de "retirar" um produto:
some do cardápio e preserva o histórico de vendas.

**Onde foi formalizada:** `supabase/migrations/20260930140000_inativo_fora_do_cardapio.sql`;
`supabase/tests/inativo_fora_do_cardapio.sql`.

---

## D-2026-09-30-104 — O balcão reconhece o cliente pelo WhatsApp

**Data:** 30/09/2026 · **Decisão do responsável pelo produto nesta conversa**

**Pedido.** No "Novo pedido", ao digitar o telefone de um cliente da base,
trazer os dados dele em vez de redigitar tudo.

**Decisão.** Escopo escolhido: reconhecer + endereços salvos; repetir o
último pedido; "mais pedidos" + pagamento habitual. Cliente bloqueado: avisa
com o motivo interno e impede o lançamento. Ficaram de fora os alertas de
pedido em aberto e de nome divergente. Favoritos não entram: são locais ao
aparelho do cliente (§30), e "mais pedidos" cumpre esse papel no balcão.
Tudo é sugestão: itens remontados pelo motor de hoje, pedido recalculado na
criação, bloqueio recusado de novo pelo banco.

**Achado no caminho.** `criar_pedido` usa o `endereco.id` recebido sem
conferir de quem é. No balcão, o id só segue depois de conferido no servidor
contra os endereços do próprio cliente. O mesmo ponto no checkout público foi
corrigido no banco em D-2026-09-30-105.

**Onde foi formalizada:** 04 RN-MAN-007; 03 §12.2;
`supabase/migrations/20260930160000_cliente_no_balcao.sql`;
`supabase/tests/cliente_no_balcao.sql`.

---

## D-2026-09-30-105 — O endereço salvo usado no pedido tem de ser do próprio cliente

**Data:** 30/09/2026 · **Decisão do responsável pelo produto nesta conversa**

**O achado.** `criar_pedido` aproveitava o `endereco.id` recebido sem
conferir de quem era, e o checkout público repassa o id vindo do navegador.
Um id de outro cliente ficava gravado no snapshot do pedido, e um id
inventado fazia o endereço real do cliente nunca ser salvo. Não havia
vazamento: o snapshot usa os campos digitados, e o `endereco_id` não é
devolvido ao público.

**Decisão.** O id só vale se for de um endereço **ativo do cliente do
pedido**. Qualquer outro caso é tratado como endereço novo, pelo fluxo
normal; o pedido não é recusado. A regra fica no banco e vale para o público
e para o balcão.

**Onde foi formalizada:** 03 §12.1;
`supabase/migrations/20260930180000_endereco_salvo_do_proprio_cliente.sql`
(patch por âncora, no padrão da `exige_producao`);
`supabase/tests/endereco_salvo_do_proprio_cliente.sql`.

---

## D-2026-09-30-106 — No balcão, o meio a meio escolhe o sabor por busca

**Data:** 30/09/2026 · **Decisão do responsável pelo produto nesta conversa**

**Decisão.** No configurador do administrativo (Novo pedido, PDV, alteração
de pedido), a lista de sabores do meio a meio deixa de aparecer inteira: o
atendente digita e aparecem só os sabores que batem (mesma regra da busca do
cardápio: sem acento, por palavra). Os sabores já escolhidos ficam sempre à
vista; ao escolher um, a busca limpa; atingido o limite de sabores do tamanho,
a busca some e a tela diz para desmarcar um para trocar.

**O que não muda.** O cardápio público segue com a lista completa do design
aprovado. Preço, disponibilidade e limite de sabores continuam decididos pelo
motor (`montar_item`); a busca só esconde linhas.

**Onde foi formalizada:** `src/ui/configurador/NucleoConfigurador.tsx`
(modo `embutida`), reaproveitando `src/domain/catalogo/buscaDeSabor.ts`.

---

## D-2026-10-01-107 — O mesmo navegador reconhece o cliente no checkout

**Data:** 01/10/2026 · **Decisão do responsável pelo produto nesta conversa**

**O achado.** RN-CLI-004 e o Documento Mestre preveem saudação e dados
pré-preenchidos para o cliente que volta no mesmo navegador. A credencial do
navegador já era criada e ligada ao cliente desde a Fase 5, mas nada a lia de
volta: o cliente recorrente redigitava tudo.

**Decisão.** Implementar pelo navegador, como os documentos preveem: saudação,
nome/WhatsApp/endereço preenchidos só onde está vazio, escolha entre endereços
salvos, "Não sou eu" que revoga a credencial. **Pelo WhatsApp digitado, não**:
continua proibido no público (03 §12.1), porque devolveria nome e endereço de
quem tiver o número digitado.

**Onde foi formalizada:** 04 RN-CLI-004; 03 §11;
`supabase/migrations/20261001100000_cliente_do_dispositivo.sql`;
`supabase/tests/cliente_do_dispositivo.sql`.

---

## D-2026-10-01-108 — O acompanhamento do cliente se atualiza sozinho e avisa

**Data:** 01/10/2026 · **Decisão do responsável pelo produto nesta conversa**

**O achado.** A página de acompanhamento (`/pedido/[token]`) lia o pedido uma
vez; o cliente só via a mudança de estado recarregando a página.

**Decisão.** Com a página aberta e visível, ela confere o pedido a cada 15 s
(e na hora em que o cliente volta para a aba), e para nos estados finais
(concluído, rejeitado, cancelado). Ao mudar algo visível — estado, Pix,
total, aprovação de entrega — a página é atualizada pelo servidor e o
cliente é avisado: destaque na tela, título da aba com o novo estado e
vibração no celular. Som só se o cliente ligar "Avisar com som" (o navegador
não toca som sem um toque antes); a preferência fica no aparelho.

**O que não muda.** A conferência usa o token do pedido, pela mesma consulta
do acompanhamento: nada de tempo real do banco aberto ao público (03 §10).
Push com a página fechada continua fora: seria escopo novo (consentimento,
service worker público), e o push aprovado é só o do painel (01 §1918).

**Onde foi formalizada:** `src/app/(publico)/_ui/AcompanharAoVivo.tsx`,
`src/domain/pedidos/acompanhamento.ts` (+ testes),
`conferirPedido` em `src/application/checkout/acoes.ts`.

---

## D-2026-10-01-109 — No checkout, o endereço começa pelo CEP

**Data:** 01/10/2026 · **Decisão do responsável pelo produto nesta conversa**

**Decisão.** O CEP passa a ser o primeiro campo do endereço de entrega (logo
abaixo dos endereços salvos, quando houver). Encontrado o CEP, rua, bairro,
cidade e UF são completados e o cursor vai para o Número. Antes ele vinha no
fim, depois de o cliente já ter digitado tudo à mão. O CEP continua opcional e
continua sem decidir coordenada, distância ou taxa (D-2026-09-24-75).

**Onde foi formalizada:** `src/app/(publico)/_ui/Checkout.tsx`.

---

## D-2026-10-01-110 — Entrega: receber na entrega por padrão, pagar na loja a um toque

**Data:** 01/10/2026 · **Decisão do responsável pelo produto nesta conversa**

**O achado.** O "Receber" de um pedido de entrega abria direto o formulário,
antes de o pedido sair. Registrar ali, e a entrega não acontecer, obrigaria a
estornar um pagamento que nunca existiu. E o padrão "dinheiro entrou na
gaveta" valia também para o dinheiro que estava com o motoboy.

**Decisão.** Entrega que ainda não saiu abre em **"Receber na entrega"** (não
registra nada; o motoboy cobra). **"Cliente já pagou na loja"** fica a um
toque — caso real do cliente que paga no balcão e pede para entregar — e
registra na hora; a comanda então sai **PAGO - NAO COBRAR**, sem troco nem
forma de pagamento. Depois da saída, o registro é o que o motoboy trouxe, com
o dinheiro "com o motoboy" até o acerto. Nenhum bloqueio novo no banco.

**Onde foi formalizada:** 04 RN-PGTO-012 (nota); 09 §4.2 (reconciliação);
`src/domain/pedidos/recebimentoNaEntrega.ts` (+ testes);
`Recebimento.tsx`; `comanda.ts` (+ testes).

---

## D-2026-10-01-111 — O acerto do motoboy é onde a entrega é recebida

**Data:** 01/10/2026 · **Decisão do responsável pelo produto nesta conversa**

**O achado.** O acerto só recolhia o dinheiro de recebimentos já
registrados, um por pedido, em outra tela. Entrega sem recebimento era só
avisada: dava para concluir digitando "quanto ele trouxe", o valor virava
"sobra" sem entrar no caixa, e o pedido ficava "a receber" para sempre.

**Decisão.** Cada entrega concluída sem pagamento ganha "Receber" dentro do
acerto — a mesma gaveta e a mesma `registrar_pagamento` da fila de pedidos,
com a forma esperada marcada e o dinheiro "com o motoboy". O acerto só
conclui com todas as entregas recebidas (o banco recusa antes). Concluir
recolhe o dinheiro registrado para a gaveta e confere com o que ele trouxe.

**Onde foi formalizada:** 04 RN-RUN-003 (nota);
`supabase/migrations/20261001120000_acerto_exige_recebimento.sql` (patch por
âncora em `conciliar_corrida`); `supabase/tests/acerto_exige_recebimento.sql`;
`equipe_fase8b.sql` ajustada para receber antes de acertar.

---

## D-2026-10-01-112 — Diferença do motoboy: o caixa registra o que entrou, a dona decide o resto

**Data:** 01/10/2026 · **Decisão do responsável pelo produto nesta conversa**

**O caso.** O cliente pagou R$ 54, o motoboy trouxe R$ 50. "Receber" registra
o que o cliente pagou (54); a falta de 4 é do motoboy. Lançar 54 e chamar de
vale não é correto.

**Dois achados.** (1) O acerto punha os 54 inteiros no esperado da gaveta, e
o fechamento acusaria −4 de novo, pedindo outra justificativa. (2) A
diferença ficava só na corrida: não havia onde a dona decidir.

**Decisão.** O acerto lança no caixa um movimento próprio de falta/sobra,
ligado a ele — a gaveta espera o que entrou. A diferença aparece no livro do
motoboy como pendente, e a dona decide uma vez: lançar no funcionário (só
falta, só no motoboy da corrida) ou não lançar, com motivo. Nada é
descontado sozinho (RN-RUN-005).

**Onde foi formalizada:** 04 RN-RUN-006 (nota);
`supabase/migrations/20261001140000_diferenca_do_motoboy.sql`;
`supabase/tests/diferenca_do_motoboy.sql`; `DiferencasDeAcerto.tsx`.

---

## D-2026-10-02-113 — Configuração do cardápio num modal só, com abas

**Data:** 02/10/2026 · **Decisão do responsável pelo produto nesta conversa**

**Decisão.** Categorias, Tamanhos, Bordas, Adicionais, Combos, Promoções e
Banners ficam no modal **"Gerenciar cardápio"**, com uma aba para cada um.
O menu "Mais › Configurar cardápio" dá lugar a um único botão "Gerenciar
cardápio", que abre o modal na aba Categorias. A aba continua no endereço
(`?aba=`): recarregar, voltar e compartilhar o link mantêm a aba. Cada aba
segue carregando só os dados dela; o modal tem largura única, para não
mudar de tamanho a cada troca; no celular as abas rolam na horizontal, com a
ativa sempre à vista.

**Onde foi formalizada:** `src/app/(admin)/admin/produtos/page.tsx` e
`_ui/ModalFerramentaCatalogo.tsx`.

---

## D-2026-10-02-114 — Data e hora no tema do sistema

**Data:** 02/10/2026 · **Decisão do responsável pelo produto nesta conversa**

**Decisão.** Os campos de data, data e hora, e hora deixam o seletor do
navegador (que não aceita as cores da Shalon) e passam a usar
`CampoDataHora`, no tema: calendário com mês, "Hoje", "Limpar" e "OK";
colunas de hora e minuto (de 5 em 5; minuto fora do passo, vindo do banco,
continua aparecendo). O valor enviado é o mesmo do campo nativo
(`AAAA-MM-DD`, `AAAA-MM-DDTHH:mm`, `HH:mm`), sem fuso, então nada muda no
servidor. Usado em promoções, banners, admissão do funcionário e horários
da loja.

**Onde foi formalizada:** `src/ui/components/CampoDataHora.tsx`.

---

## D-2026-10-02-115 — Desempenho: funções na região de São Paulo e vitrine do catálogo

**Data:** 02/10/2026 · **Decisão do responsável pelo produto nesta conversa**

**Contexto.** Auditoria de desempenho: o atraso percebido vinha de dois
pontos. (1) As funções da Vercel rodavam em `iad1` (EUA) e o Supabase está
em `sa-east-1` (São Paulo): cada consulta e cada ação cruzava o continente.
(2) O cardápio, a busca e a lista de produtos do admin recalculavam a
disponibilidade produto a produto, por funções SQL aninhadas que o
Postgres não incorpora à consulta (~150 ms por chamada, para 83 produtos).

**Decisão.**
1. `vercel.json` fixa as funções em `gru1` (São Paulo), junto do banco.
2. `vitrine_do_catalogo()` (0145) calcula preço de/por/até, promoção,
   disponibilidade e "tem tamanhos" de todos os produtos numa passada, por
   junções. `cardapio_publico`, `buscar_catalogo`, `catalogo_produtos_admin`
   e `mais_pedidos` leem dela. **Nenhuma regra muda**: as funções por produto
   (`produto_disponivel_no_cardapio`, `sabores_da_fogazza`, etc.) continuam
   sendo a regra para `montar_item`, balcão e sabores, e a suíte
   `vitrine_do_catalogo.sql` compara as duas produto a produto em cada
   cenário (pausa, inativo, combo, fogazza, promoção; servidor, visitante e
   dona). Mudar a regra numa exige mudar na outra.
3. Leituras públicas repetidas na mesma requisição usam React `cache`
   (por requisição, nunca entre requisições): `obterProdutoPublico` e
   `listarCardapio`. A página de produto carrega sabores, configurador e
   combo em paralelo, e o configurador busca o primeiro preço junto com as
   opções de cada tamanho.

Continua valendo: nada de cache entre requisições para pedidos, caixa,
entregas, notificações, financeiro, preços ou catálogo.

**Onde foi formalizada:** `vercel.json`,
`supabase/migrations/20261002100000_vitrine_do_catalogo.sql`,
`supabase/tests/vitrine_do_catalogo.sql`, `src/application/publico/consultas.ts`.

---

## D-2026-10-08-116 — Impressora de 80 mm no balcão e configuração por aparelho

**Contexto.** A Shalon tem uma térmica 58 mm (KD-1025, Bluetooth) que imprime
bem no Android pelo RawBT, mas não está funcionando direito para o balcão. A
operação passa a ter uma **térmica convencional de 80 mm**, ligada por USB ao
notebook do balcão. A exigência da dona: ao clicar em imprimir, imprimir —
sem escolher a impressora toda vez. Se precisar trocar, troca-se na
configuração.

**Decisão.**
1. **Duas larguras de papel.** A comanda e o documento ALTERAÇÃO saem em
   58 mm (32 colunas) ou 80 mm (48 colunas). O domínio
   (`montarComanda`/`montarAlteracao`) recebe a largura; o conteúdo é o mesmo,
   muda só a quebra. Cupom do PDV, segunda via e fechamento de caixa seguem a
   mesma largura.
2. **Configuração por aparelho, não por loja.** Papel e modo ("imprimir
   direto" ou "só mostrar na tela") ficam no navegador do aparelho
   (Configurações → Impressora). A impressora está fisicamente ligada ao
   aparelho; gravar no banco faria um aparelho tentar usar o papel do outro.
   Não passa por `settings.manage` nem por auditoria: não muda nada para
   ninguém além de quem está naquele aparelho. Sem configuração, vale o
   comportamento anterior (58 mm, conferir na tela).
3. **Sem janela de escolha no notebook:** o navegador do balcão é aberto com
   `--kiosk-printing` e imprime na impressora padrão do Windows. É o único
   jeito de um site imprimir sem perguntar; a tela de configuração explica o
   passo a passo. Não instala programa nenhum além do driver da impressora.
4. **O sistema não afirma que imprimiu.** No modo direto, o registro passa de
   `requested` a `sent` (o navegador entregou ao sistema). `confirmed` e
   `error` continuam dependendo de a pessoa dizer se saiu no papel.
   `order_prints.transport` registra `tela`, `sistema-58mm` ou `sistema-80mm`.
   **Não houve migration**: a coluna já era texto livre.

**Entregas seguintes, aprovadas mas não feitas:**
- **Entrega 2 — feita em 08/10/2026 (sem migration):** modo "Bluetooth
  direto". O aparelho fala com a impressora pela Web Serial (Bluetooth
  Clássico, perfil SPP) e manda ESC/POS: iniciar, tabela de caracteres,
  negrito e avanço de papel, **sem comando de corte**. A impressora é
  escolhida uma vez em Configurações → Impressora (`requestPort`, que exige
  toque). Depois disso `getPorts` a devolve sem perguntar. Trocar esquece a
  anterior. A **tabela de acentos** é escolhida pelo teste de impressão:
  CP860 (padrão), CP850 ou "sem acentos", porque o modelo não tem ficha
  técnica. Registra `serial-58mm`/`serial-80mm`. Um aparelho em Bluetooth
  direto com papel de 80 mm também pode ser o balcão. **Falta provar no
  Android** se o Chrome lembra a impressora entre sessões. O RawBT continua
  como plano B.
- **Cupons pelo Bluetooth — feito em 08/10/2026:** cupom do PDV, segunda via
  e fechamento de caixa ganharam versão em linhas de texto
  (`src/domain/impressao/cupons.ts`), com o mesmo conteúdo do HTML. No modo
  Bluetooth direto, saem por ESC/POS, sem janela. Nos outros modos,
  continuam pelo HTML aprovado e `window.print()`, como antes. O módulo só
  organiza em colunas valores que o servidor já calculou: não calcula nada
  de dinheiro.
- **Entrega 3 — feita em 08/10/2026 (migration 0147):** o celular pede a
  impressão e o notebook do balcão, com o painel aberto, imprime na 80 mm.
  **Condição aceita pela dona:** o notebook precisa estar ligado e com o
  painel aberto. Como funciona:
  - o celular, no modo "Imprimir na impressora do balcão", registra a
    impressão com transporte `balcao-80mm` e as linhas completas em
    `order_prints.content_lines`. A comanda sai sempre em 48 colunas;
  - o aparelho marcado em Configurações → Impressora como "este é o balcão"
    escuta `order_prints` pelo Realtime, com uma consulta de reserva a cada
    30 s, e chama `pegar_impressao_do_balcao`. A função trava a linha e só
    deixa um aparelho passar de `requested` para `sent`, registrando quem
    pegou em `sent_by`;
  - **prazo de 2 minutos:** pedido de impressão mais velho que isso não é
    impresso e vira `error`. Sem prazo, ligar o notebook horas depois
    imprimiria comandas antigas como se fossem novas. Prazo escolhido na
    implementação, reversível; ajustar se a operação pedir;
  - o celular acompanha a situação e só oferece "Saiu no papel" depois que
    o balcão pegou;
  - só aparelho com papel de **80 mm** pode ser o balcão: a comanda chega
    em 48 colunas.

Prioridade definida pela dona: **o notebook funcionar**.

**Onde foi formalizada:** `04-REGRAS-NEGOCIO.md` RN-PRINT-006,
`01-DOCUMENTO-MESTRE.md` §79.16, `05-PLANO-IMPLEMENTACAO.md` §10.5,
`02-MODELO-DADOS-SUPABASE.md` §16, `CLAUDE.md` §32,
`06-PENDENCIAS-VALIDACAO-PRODUCAO.md` (POC da impressora),
`src/domain/pedidos/comanda.ts`, `src/ui/impressao/`,
`src/app/(admin)/admin/configuracoes/_ui/SecaoImpressora.tsx`.

**Impacto no design.** A aba "Impressora" do design aprovado, que tinha ficado
de fora por falta de equipamento, entrou. Em vez de pares somente leitura,
tem a escolha do papel e do modo deste aparelho e o "Teste de impressão",
que imprime uma régua de colunas e os acentos.

---

## D-2026-10-08-117 — Convite para o app, com QR code, no cupom do cliente

**Contexto.** A dona quer usar o cupom para divulgar o app: uma chamada e um
QR code que leva ao cardápio.

**Decisão.**
1. **Onde:** só no cupom do PDV e na segunda via, que vão para a mão do
   cliente. A comanda é da cozinha e não leva convite.
2. **O quê:** no fim do cupom, depois de "Obrigado pela preferencia!", vêm
   "Peça pelo nosso app!", o QR code, "Aponte a câmera do celular" e o
   endereço por extenso, para quem não lê o QR.
3. **Endereço temporário:** `https://pizzariashalon.vercel.app/?origem=cupom`,
   definido pela dona até haver domínio próprio. Fica num lugar só
   (`src/ui/impressao/convite.ts`). `origem=cupom` marca a visita. O
   cardápio ignora o parâmetro hoje; os relatórios poderão contá-lo depois.
4. **Como o QR é desenhado:** no cupom em HTML (notebook), como SVG gerado
   pela `qrcode-generator` (dependência nova, aprovada). No Bluetooth direto,
   pelo comando nativo da impressora (`GS ( k`, modelo 2). Se a KD-1025 não
   o conhecer, sai só o texto: por isso o endereço vai por extenso.
5. O teste de impressão em Configurações → Impressora também imprime o
   convite, para mostrar se a impressora desenha o QR.
6. **Ajuste após o primeiro teste (08/10/2026): o celular não lia.** O QR
   tinha 28 mm com 41 módulos, ou seja, 0,68 mm = 5,5 pontos por módulo, e
   a térmica arredondava de forma desigual. Agora a correção é "L" (29
   módulos em vez de 33), cada módulo tem 1,25 mm = 10 pontos exatos, e o
   QR tem 46,25 mm com a margem. No Bluetooth, módulo de 8 pontos.

**Onde foi formalizada:** `CLAUDE.md` §44-A (versões),
`src/ui/impressao/convite.ts`, `ConviteDoApp.tsx`, `escpos.ts`,
`src/domain/impressao/cupons.ts`.

---

## D-2026-10-13-118 — Espaço no fim do papel, por aparelho

**Contexto.** No balcão entrou uma Diebold IM433TP, que tem guilhotina. A
lâmina fica alguns milímetros acima da cabeça de impressão. Com os 6 mm
fixos de papel em branco no fim, o corte passava por cima do fim do
documento, que é o QR code do convite (D-2026-10-08-117).

**Decisão.** Configurações → Impressora ganha "Espaço no fim do papel",
guardado por aparelho como o resto (D-2026-10-08-116): Normal (6 mm, o
comportamento anterior e padrão), Médio (12 mm) e Grande (20 mm). Vale para
a comanda, os cupons, o fechamento e o teste de impressão. No Bluetooth
direto vira avanço de linhas (`ESC d`), nunca menos que as 4 de antes.
Configuração antiga, sem o campo, continua valendo como Normal.

**Complementos do mesmo dia, ainda na Diebold:**
- o espaço em branco sumia porque o driver descarta papel branco no fim.
  Agora o espaço termina num ponto discreto, e o corte passa depois dele;
- a área que a cabeça alcança começa uns 2 mm para dentro, e o documento
  encostado à esquerda perdia a primeira letra. Nova opção por aparelho,
  "Margem nas laterais": Nenhuma (0 mm, padrão), Pequena (2 mm de cada
  lado) ou Média (4 mm de cada lado). Na primeira versão a margem era só à
  esquerda, e o documento passou a cortar do lado direito: a área útil da
  Diebold é mais estreita que 72 mm. Vale para a impressão pelo sistema; o
  Bluetooth direto não precisa;
- a pedido da dona, fonte maior no cupom do PDV, na segunda via e no
  fechamento de caixa (corpo de 10 para 12 px no cupom e de 11 para 13 px no
  fechamento);
- logo depois, também a pedido da dona, **a comanda no papel de 80 mm passou
  de 48 para 42 colunas** (`COLUNAS["80"]`), com letra cerca de 14% maior.
  Isso supera as menções a 48 colunas em D-2026-10-08-116, inclusive a
  comanda que o celular manda ao balcão, que agora chega em 42;
- **causa real do corte dos cupons** (foto da dona, 13/10): o cupom do PDV,
  a segunda via e o fechamento eram impressos com `window.print()` da
  própria página, e o cupom fica dentro de um modal centralizado. Na
  impressão, a posição dele era medida a partir do modal, e ele saía
  deslocado para a direita, num valor que mudava com o tamanho da tela. Por
  isso cada ajuste de margem dava um resultado diferente. **Agora os três
  imprimem a versão em linhas** (`src/domain/impressao/cupons.ts`), pelo
  mesmo documento próprio da comanda. O HTML virou só a prévia na tela, com
  o QR menor. Os botões dos modais ficaram fixos no rodapé;
- **letra fixa, colunas calculadas** (segunda foto, 13/10): com 42 colunas
  espremidas na largura a letra ficava pequena e ainda cortava na Diebold.
  Na impressão pelo sistema a letra passou a ser fixa (1,9 mm por
  caractere, a da prévia), e as colunas saem do que cabe na largura menos
  as margens: 37 sem margem, 35/33/31 com Pequena/Média/Grande (nova, 6 mm
  de cada lado). O documento fica centralizado. A comanda pede essas
  colunas ao servidor (faixa 24–48, validada). Se uma linha vier mais larga
  do que cabe (comanda do celular para o balcão), a letra encolhe só nela.
  Isso substitui as 42 colunas fixas do item anterior na impressão pelo
  sistema. O Bluetooth direto continua com as colunas da fonte da
  impressora;
- **régua de alinhamento e área medida** (13/10): em vez de adivinhar
  margens, Configurações → Impressora imprime uma régua de 0 a 80 mm, de
  borda a borda, com uma faixa preta contínua. A faixa falhada indica
  cabeçote sujo ou com defeito. Digita-se onde a impressão começa e
  termina, e a área fica guardada no aparelho (`areaMedida`, validada:
  dentro do papel e com pelo menos 30 mm). Todo documento impresso pelo
  sistema passa a ser desenhado nessa faixa, no lugar da margem.

**Onde foi formalizada:** `src/ui/impressao/impressoraDoAparelho.ts`
(`ESPACO_FINAL_MM`, `MARGEM_ESQUERDA_MM`), `imprimir.ts`, `escpos.ts`,
`SecaoImpressora.tsx`.

---

## D-2026-10-14-119 — Preço de fim de semana da fogazza por sabor

**Contexto.** A Shalon cobra mais pela fogazza no fim de semana.

**Decisão, da dona, em 14/10/2026** (formalizada em RN-FOG-010):
1. cada sabor ganha um **preço de fim de semana opcional**, digitado no
   cadastro ao lado do preço de fogazza. Em branco = o mesmo preço todo dia;
2. fim de semana é **sexta, sábado e domingo**;
3. vale o **relógio** no fuso da loja, não o turno;
4. só a **fogazza por sabor**. A fogazza comum não muda;
5. promoção continua valendo por cima. Isso não foi perguntado: é a regra
   que já existia (RN-PIZZA-005), mantida.

**Como.** Migration 0148: `product_variants.weekend_price` (só em tamanho de
fogazza, por gatilho), `e_fim_de_semana()` e `preco_regular_variante()`.
`preco_efetivo_variante` passa a usar o preço do momento. Como
`montar_item` usa essa função, o preço cobrado muda sem tocar no cálculo.
As funções que mostram "de R$ X" ou marcam promoção (vitrine, sabores da
fogazza, tamanhos, busca e código de barras do PDV) passam a usar o preço
de tabela do momento. Assim a vitrine não chama de promoção o preço de
semana num sábado. Elas são alteradas **no próprio banco**
(`pg_get_functiondef` + troca só das linhas de preço, conferindo quantas
vezes cada trecho aparece), e não recriadas a partir dos arquivos: a
`20260927200000_exige_producao` alterou `buscar_catalogo_pdv` e
`resolver_codigo_de_barras` desse jeito, e recriar a partir dos arquivos
teria apagado o `exige_producao` do PDV. Isso foi achado ao comparar o md5
das funções do banco com o dos arquivos, antes de aplicar. `montar_fogazza`
grava o preço de fim de semana. Aplicada no DEV em 14/10/2026 depois de
ensaio com 28/28 verificações. A produção estava pausada.

**Onde foi formalizada:** `04-REGRAS-NEGOCIO.md` RN-FOG-010,
`02-MODELO-DADOS-SUPABASE.md` §5.4,
`supabase/migrations/20261014100000_preco_de_fim_de_semana_da_fogazza.sql`,
`supabase/tests/fogazza_fim_de_semana.sql`.

## D-2026-10-14-120 — Contraste e prioridades da crítica visual

**Contexto.** A crítica visual (Impeccable, 14/10/2026) deu 26/40 e apontou
três prioridades altas. A dona escolheu começar por contraste e tema escuro,
e resolver as três altas.

**Decisão.**
1. Texto secundário no tema claro passa de `#8b8077` (3,85:1 no cartão) para
   `#71665e` (5,6:1). Um token só, `--shalon-muted`.
2. Texto sobre o amarelo da marca é fixo (`--shalon-sobre-amarelo`, escuro
   nos dois temas). Corrige o selo "Destaque" e o favorito no tema escuro
   (1,5:1).
3. PDV com caixa fechado: "Abrir caixa" é a ação principal. O aviso de
   conexão deixa de ser amarelo e fica curto.
4. Checkout e carrinho: o texto sobre "recalcular no servidor" sai. Nenhuma
   regra de cálculo muda.

**Fica para a próxima rodada:** barra de total fixa no celular no checkout;
cardápio no celular em duas colunas; aviso de loja fechada único; e mudanças
de identidade no painel (aprovadas em princípio, "aos poucos").

**Onde foi formalizada:** `src/ui/tokens/tokens.css`, `Badge.tsx`,
`BotaoFavorito.tsx`, `PainelDoCaixa.tsx`, `PdvComTeclado.tsx`, `Checkout.tsx`,
`Carrinho.tsx`. Relatório em `.impeccable/critique/`.

## D-2026-10-15-121 — Convite por e-mail para acesso de funcionário (fecha A-20)

**Contexto.** Cadastrar funcionário com acesso exigia que alguém criasse a
conta no painel do Supabase. Isso prendia a operação ao desenvolvedor e
travava cadastros urgentes (caso da Julia, 14/10/2026).

**Decisão, aprovada pelo Marcelo em 15/10/2026.**
1. Em `/admin/equipe`, "Enviar convite": o funcionário recebe um e-mail,
   define a própria senha em `/admin/redefinir-senha` e entra. Ninguém da
   pizzaria escolhe nem vê a senha de outra pessoa.
2. **Uso excepcional da chave `service_role`** (CLAUDE.md §13), com estas
   condições: fica só em `src/infrastructure/supabase/admin.ts`, marcado
   `server-only`; é usada só para enviar o convite; quem chama precisa de
   `employees.manage` e `roles.manage`, checados antes; a chave nunca vai
   para o navegador, para o Git, para log ou para o `.env.example`.
3. O vínculo continua sendo feito pela função `vincular_acesso`, a mesma de
   sempre, que refaz a checagem de permissão e grava auditoria. O acesso
   nasce sem papel; os papéis são atribuídos depois, deliberadamente.
4. "Vincular conta existente" continua disponível para quem já tem conta.
5. **Alteração de 15/10/2026, aprovada pelo Marcelo:** o dono pode criar a
   conta com uma senha inicial que ele mesmo define, sem confirmação por
   e-mail, para pizzaria pequena com poucas pessoas. Só cria conta nova: se
   o e-mail já existe, recusa e nunca troca senha de conta existente. Senha
   inicial com pelo menos 8 caracteres. Se o vínculo falhar, a conta criada
   é removida. O funcionário pode trocar a senha depois por "Esqueci minha
   senha". O dono passa a conhecer a senha inicial, e isso é aceito por
   decisão dele. Quem tem `employees.manage` e `roles.manage` pode usar isto,
   por isso a conta principal deve ter senha forte e poucas pessoas devem ter
   esse papel.
6. **Complemento de 15/10/2026:** para conta já vinculada mas que a pessoa
   ainda não usou (convite pendente), o dono pode definir a senha inicial ou
   reenviar o convite, em `/admin/equipe`, na edição do funcionário. Depois
   que a pessoa entra, essas ações são recusadas pelo servidor. A auditoria
   grava o autor no metadado, porque a chave administrativa não identifica
   quem chamou a função de auditoria.

**Operação.** Configurar no Supabase (Authentication → URL Configuration) o
endereço `/admin/redefinir-senha` na lista de redirecionamentos, e no Vercel
a variável `SUPABASE_SERVICE_ROLE_KEY`, em Production e Preview. Para envio
confiável, configurar SMTP próprio: o padrão do Supabase tem limite baixo de
e-mails por hora.

**Onde foi formalizada:** `src/infrastructure/supabase/admin.ts`,
`src/application/equipe/convite.ts`, `GestaoDaEquipe.tsx`. A-20 em
`docs/06-PENDENCIAS-VALIDACAO-PRODUCAO.md` passa a "resolvido, a validar com
envio real".

---

# Como registrar uma nova decisão

1. A decisão é tomada e confirmada pelo responsável pelo produto.
2. O documento normativo pertinente é atualizado **primeiro** (`CLAUDE.md` §1).
3. Uma entrada é acrescentada aqui, em ordem cronológica, com: identificador `D-AAAA-MM-DD-NN`, decisão, motivo, onde foi formalizada e impacto no design.
4. Se a decisão supera regra anterior, o texto antigo **não é apagado**: recebe marcador de supersessão apontando para a regra vigente.
5. Decisões que deixam de estar em aberto saem da tabela acima e viram entrada datada.

## D-2026-10-15-122 — A dona ajusta o que o Atendente vê e faz

**Pedido:** só existem Atendente e Owner/Admin, e não havia como definir o que o
Atendente pode ou não ver.

**Decisão:**
1. Nova aba **Permissões** em Funcionários/Equipe, só com `roles.manage`: a dona
   marca, por papel, o que ele pode ver e fazer (agrupado por assunto, em
   linguagem de balcão).
2. Migration 0149: `definir_permissoes_do_papel` passa a aceitar papel de sistema,
   **exceto Owner/Admin**, que continua completo (a dona não pode se trancar
   fora). Regra anti-escalada (RN-RBAC-005, conjunto final + o que sai) e a
   auditoria `papel_definir_permissoes` ficam como estavam.
3. Vale para todos os usuários com o papel; a mudança aparece na próxima
   leitura da sessão. Não há criação de papéis novos nesta entrega.

## D-2026-10-15-123 — Pizza abre com borda de Catupiry

Pedido da dona: toda pizza já vem com borda de Catupiry marcada; trocar ou
escolher "Sem borda" continua a um toque. Implementado no configurador
compartilhado (cardápio e balcão/PDV): a borda cujo nome contém "Catupiry",
quando o tamanho a oferece, vem selecionada ao abrir e ao trocar de tamanho. O
preço é recalculado pelo servidor com a borda incluída (CLAUDE.md §16). Sem
Catupiry no tamanho, abre sem borda como antes.

## D-2026-10-15-124 — Aviso do pedido por pergunta única e sugestão de bebida

1. **Pergunta de avisos.** Na página de acompanhamento do pedido, uma única vez
   por aparelho (`localStorage` `shalon:aviso-do-pedido`), um diálogo pergunta se
   o cliente quer ser avisado. "Ativar" liga o som e pede a permissão de aviso do
   navegador; com ela, a página confere o pedido também em segundo plano e chama
   o cliente quando o estado muda. **Não é push**: só funciona com a página
   aberta (em outra aba ou aplicativo). Push com a página fechada exigiria
   service worker e servidor de push — fora do escopo, decisão futura.
2. **Sugestão de bebida.** Ao adicionar pizza, fogazza ou combo, o painel
   "adicionado" lembra da bebida (link para `/categoria/bebidas`), exceto quando
   um item de um toque já entrou na visita.

## D-2026-10-15-125 — Promoção por dias da semana e com vários itens

**Pedido da dona:** promoção "toda terça, quarta e quinta" sem refazer a cada
semana (hoje só havia datas); poder pausar mantendo as regras; e escolher mais
de um item na mesma promoção.

**Decisão (migration 0150):**
1. `promotions.weekdays` (ISO 1..7, nulo = todos os dias). Dias da semana e
   período **se combinam**: vale nos dias marcados, dentro das datas. Pausar
   (`is_active`) continua separado e preserva dias e datas.
2. `promotions.campaign_id`: itens criados juntos formam uma promoção para a
   tela (pausar, retomar e excluir agem na promoção inteira). Cada item
   continua sendo uma linha, com preço, limite e vigência por alvo — nenhuma
   regra de preço mudou (CLAUDE.md §16/§19: preço promocional simples, um
   preço igual para todos os itens marcados).
3. RN-PROMO-004 ampliada: sobreposição só é recusada quando período **e dias**
   se cruzam. A garantia deixou de ser `EXCLUDE` e virou gatilho com lock por
   alvo (`promotions_sem_sobreposicao`), porque exclusion constraint não
   expressa interseção de conjuntos de dias.
4. A vigência por dia entra por `promocao_no_dia(dias, instante)`, no fuso da
   loja (`store_settings.timezone`), aplicada às 8 funções que precificam,
   limitam ou exibem promoção (patch no lugar).
5. Banner de promoção com vários itens abre `/promocao/<id>`, com os itens que
   valem agora; some do ar nos dias em que a promoção não vale. Banner para
   um grupo de produtos sem promoção: usar Categoria.
6. Datas do formulário (hora de parede) passam a ser lidas em Brasília
   (-03:00); antes eram lidas no fuso do servidor (UTC), deslocando 3 horas.

## D-2026-10-15-126 — Banner com vários produtos e dias da semana

**Pedido da dona:** o banner levar a vários produtos (o cliente toca em "Ver
destaque" e vê todos), com dias da semana como na promoção.

**Decisão (migration 0151):**
1. Novo destino `products` (destaque): os produtos moram em `banner_products`
   (entidade referenciada, nunca URL digitada — RN-BANNER-002). O banner abre
   `/destaque/<id>`; o banner aparece enquanto ao menos um produto está
   disponível (RN-BANNER-003 ampliada).
2. `banners.weekdays` (ISO 1..7, nulo = todos os dias), mesma semântica da
   promoção (D-2026-10-15-125): dias e período se combinam.
3. O destino de um banner continua um só; para destacar um grupo, use
   `products`. Promoção com vários itens segue em `/promocao/<id>`.
4. Formulário: o destino escolhido define o que aparece (produtos, link
   externo), no lugar dos dois campos sempre visíveis.

## D-2026-10-15-127 — Popup de abertura com arte em retrato (1:2)

**Pedido da dona:** além do banner 2:1, uma arte em retrato (1:2) que aparece
como popup quando o cliente entra, com o botão para ir ao item; **sem a arte,
sem popup**, para nunca aparecer aviso sem sentido.

**Decisão (migration 0152):**
1. `banners.popup_image_asset_id` (opcional). O popup é do próprio banner e
   herda toda a sua visibilidade: ativo, período, dias da semana e destino
   disponível (`banner_visivel`). Banner fora do ar não gera popup.
2. Cardápio (`/`): exibe o popup do primeiro banner visível que tenha arte de
   popup. Uma vez por dia, por banner, por aparelho (`localStorage`).
3. O botão "Ver agora" segue o destino do banner (produto, categoria,
   promoção, destaque, link externo). Banner sem destino mostra só a arte.
4. No cadastro, o seletor do carrossel mostra só imagens horizontais e o do
   popup só imagens em retrato.

## D-2026-10-15-128 — Adicionais da Shalon e produtos com adicionais inclusos

**Pedido da dona:** cadastrar os 39 ingredientes como adicionais, R$ 5,00,
somente na pizza Tradicional; em "À sua escolha" (até 5) e "X-tudo" (até 6) o
cliente escolhe os ingredientes **sem alterar o valor final**.

**Decisão (migration 0153):**
1. `products.addons_included` (padrão falso). Com ele, `montar_item` soma zero
   de adicional ao preço unitário e ao detalhe; o limite continua o
   `max_addons` do produto, validado no servidor.
2. O adicional segue exigindo preço por tamanho cadastrado (é o que diz que
   ele existe naquele tamanho). Preço de cadastro: R$ 5,00 em Tradicional;
   Broto e Fogazza não oferecem adicionais.
3. "À sua escolha": limite 5; "X-tudo": limite 6; ambos inclusos.
4. Tela: o adicional mostra "Incluso" em vez de "+ R$", e o cabeçalho diz
   "Incluso no preço · até N". No cadastro do produto há a opção "Adicionais
   inclusos no preço?".

**Dados (DEV):** 39 adicionais; "cebola" já existia e foi renomeado "Cebola".
Foi removido o preço antigo de R$ 3,00 da Cebola no Broto, por não fazer parte
do pedido (adicionais só na Tradicional).

## D-2026-10-15-129 — Adicionais inclusos: o excedente é cobrado

**Pedido da dona:** em "À sua escolha" e "X-tudo", se o cliente escolher
adicionais a mais, cobra-se o preço de cada um (R$ 5,00 na Tradicional) além
do valor da pizza. **Revisa a D-2026-10-15-128**, em que o limite era teto.

**Decisão (migration 0154):**
1. Com `addons_included`, `max_addons` deixa de ser teto e passa a ser a
   **quantidade inclusa** (5 e 6). Sem teto: cada adicional além dela soma o
   seu preço ao preço unitário.
2. Os inclusos são os de **maior** preço da escolha (conta mais favorável ao
   cliente); o excedente são os mais baratos. Com preços iguais é indiferente.
3. Produto sem `addons_included`: nada muda; `max_addons` segue como teto.
4. Tela: "5 ingredientes inclusos no preço · cada um a mais soma o seu valor";
   cada ingrediente mostra "Incluso" ou "+ R$ 5,00" conforme a escolha. O
   total é sempre o do servidor (`montar_item`).

## D-2026-10-15-130 — Permissão negada aparece bloqueada, não some

**Pedido da dona:** o que a pessoa não pode acessar não deve simplesmente
sumir/ficar vazio.

**Decisão:**
1. No menu, o módulo sem permissão **continua aparecendo**, com cadeado; ao
   tocar, explica que é preciso pedir à proprietária.
2. Abrir o endereço de um módulo sem permissão mostra a tela "X está bloqueado
   para você" (com volta ao painel), em vez de uma página vazia.
3. A permissão que abre cada módulo está em `PERMISSAO_DA_ROTA`
   (`src/ui/navegacao.ts`). É apenas interface: a autorização real segue no
   RLS/RPC (CLAUDE.md §12).

## D-2026-10-15-131 — Bandeira do cartão vira legenda, não escolha

**Pedido da dona:** cliente e balconista não escolhem mais a bandeira
(Visa, Mastercard…). Escolhe-se a forma — débito, crédito, voucher ou Pix — e
as bandeiras aceitas aparecem apenas como legenda.

**Decisão (migration 0156; revisa RN-PGTO-006):**
1. Checkout, pedido manual, PDV e recebimento do pedido: o seletor de bandeira
   saiu; a forma com bandeiras cadastradas mostra a lista "Bandeiras aceitas".
2. Servidor: a bandeira deixa de ser obrigatória em `criar_pedido` e
   `registrar_pagamento`. Se for enviada, continua validada contra a forma.
3. A venda/pagamento passa a não registrar a bandeira (`payment_brand_id`
   nulo). Consequência aceita: sem relatório por bandeira. Os campos seguem no
   banco, e pagamentos antigos mantêm a bandeira que já tinham.
4. Configurações › Pagamentos continua cadastrando as bandeiras — é a fonte da
   legenda.

## D-2026-10-15-132 — Busca do painel casa pelo nome, não pelo ingrediente

**Pedido da dona:** no painel (novo pedido e PDV), digitar "calabresa" deve
trazer o sabor Calabresa (pizza e fogazza), não toda pizza que leva calabresa.
O cardápio público continua buscando por ingrediente.

**Decisão:** a busca do painel casa o termo com **nome e categoria** do item;
a descrição (ingredientes) não conta. O card de fogazza permanece quando algum
**sabor** dele tem o nome buscado. Item achado por **código de barras** fica
sempre. Implementado em `casaPeloNome` (`domain/catalogo/buscaDeSabor.ts`),
aplicado em `buscarProdutos` e `buscarCatalogoPdv`. Sem migration: a RPC
pública (`buscar_catalogo`) não foi alterada.

## D-2026-10-15-133 — Cabeçalho de campanha na vitrine de promoções

**Pedido da dona:** hierarquia na seção de promoções do cardápio — a oferta
dita uma vez, com destaque, em vez de nove cards iguais com o mesmo selo.

**Decisão (migration 0157):**
1. `campanhas_em_promocao()` devolve uma linha por campanha **vigente agora**
   (ativa, no período, no dia da semana): nome, dias, fim, menor e maior preço
   e os produtos que cobre. Só leitura; preço e disponibilidade de cada item
   seguem vindo do cardápio (CLAUDE.md §16).
2. Cada campanha vira uma faixa com fundo próprio: selo "Promoção", nome, dias
   ("Terça a quinta"), até quando (se houver), quantidade de sabores e o preço
   comum ("todas por R$ 33,00", ou "a partir de" quando variam).
3. Dentro da faixa o selo "Promoção" some dos cards (era repetido) e os itens
   vão do que mais economiza ao que menos. Mais de 5 itens: carrossel.
4. Promoção que não pertence a nenhuma campanha conhecida continua na seção
   simples "Promoções". Se a consulta falhar, a vitrine cai nessa seção.

## D-2026-10-15-134 — Nome do banner é de controle interno

O título (e o texto) do banner deixam de ser desenhados sobre a imagem no
carrossel do cardápio: a arte comunica e a chamada fica só no botão. O nome
continua gravado, listado no painel e usado como texto alternativo da imagem.
No cadastro o campo vira "Nome do banner (opcional)", sem o campo "Texto".

## D-2026-10-15-135 — Promoção oculta da vitrine, acessível pelo banner

**Pedido da dona:** com mais de uma promoção, em vez de uma faixa embaixo da
outra, poder ocultar a promoção da vitrine e acessá-la pelo banner.

**Decisão (migration 0158):**
1. `promotions.show_on_menu` (padrão verdadeiro), por campanha. Falso tira a
   **faixa** da página inicial; **não muda** preço, dias, vigência nem
   carrinho — a promoção continua valendo e os itens aparecem com o preço
   promocional nas categorias.
2. Os itens de uma campanha oculta não caem na seção simples "Promoções": a
   promoção só é encontrada pelo banner (`/promocao/<id>`).
3. Painel: no cadastro, "Mostrar no cardápio" (marcado); no cartão da
   promoção, "Ocultar do cardápio"/"Mostrar no cardápio" e a etiqueta "Só pelo
   banner" quando oculta.

## D-2026-10-15-136 — Promoção de fogazza mostra as fogazzas, não as pizzas

**Problema:** campanha cujos itens eram variantes de fogazza aparecia na
vitrine e na página da promoção com as PIZZAS dos sabores, e não com as opções
de fogazza.

**Decisão (migration 0159):**
1. `campanhas_em_promocao()` separa `produtos` (alvo direto ou tamanho de
   pizza), `variantes_fogazza` e `produtos_fogazza`. `itens_da_promocao()`
   passa a dizer qual item é variante de fogazza.
2. Cada variante de fogazza em promoção é um **sabor** (`listarFogazzasDaPromocao`),
   com preço e disponibilidade da própria fogazza, apontando para
   `/produto/<card>/<sabor>`. **Revisado na D-2026-10-15-137:** não vira card
   (nem todo sabor tem foto) — aparece em lista.
3. As pizzas por trás dessas variantes não aparecem como promoção solta.

## D-2026-10-15-137 — Fogazza em promoção aparece em lista, com busca

Nem todo sabor de fogazza tem foto; card sem foto é um quadrado vazio. Em
promoção, as fogazzas aparecem em **lista** (nome, ingredientes, preço), no
mesmo formato da página da fogazza, agrupada por card (doce, salgada) e com
campo de busca. Na página da promoção (`/promocao/<id>`) é a lista completa;
na faixa da vitrine, em vez de cards, um botão "Ver os N sabores de fogazza"
leva a essa página. Itens com foto (pizzas, bebidas) seguem em cards.
Migration 0160: `itens_da_promocao` aceita também o id da campanha.

## D-2026-10-16-138 — CEP opcional no balcão, taxa à mão quando a rota falha

**Pedido da dona:** no pedido feito pelo painel o CEP não deve ser obrigatório;
o CEP digitado no balcão não localizava nada e não havia nenhum aviso; quando
o endereço não for localizado, a atendente deve poder informar o frete (só em
caso de falha). Para o cliente o CEP continua obrigatório e, na falha, aparece
o contato pelo WhatsApp.

**Decisão (migration 0161):**
1. **Balcão:** CEP opcional, no topo do endereço, com consulta (ViaCEP) e aviso
   sempre visível — encontrado, não encontrado ou consulta fora do ar. Cidade e
   UF já vêm com as da loja. Abaixo do botão, "Falta preencher: …" diz por que
   o pedido ainda não pode ser lançado.
2. **Taxa à mão:** só aparece depois que a rota FALHA (endereço não localizado
   ou serviço de rotas fora do ar — não para "fora da área"). `criar_pedido`
   aceita `taxa_manual` apenas no caminho interno, com
   `orders.override_delivery_fee`, entre 0 e 500; grava sem distância e sem
   faixa (nada inventado), marca `taxa_manual: true` no endereço do pedido e
   audita `taxa_entrega_manual`. A regra `orders_entrega_com_snapshot` aceita
   entrega sem distância só nesse caso. O detalhe do pedido mostra "Taxa de
   entrega informada à mão".
3. **Cliente:** CEP obrigatório (tela e servidor, no envio do pedido). Se a
   entrega não puder ser calculada (exceto "fora da área"), a mensagem traz o
   botão "Falar com a pizzaria pelo WhatsApp", com o endereço já escrito.

## D-2026-10-16-139 — Prévia da taxa abaixo do endereço, no balcão

No pedido pelo painel, assim que rua, número, bairro e cidade estão
preenchidos, a taxa de entrega aparece logo abaixo do endereço (valor e km de
rota; aviso quando exigir aprovação). É prévia: o lançamento mede de novo no
servidor. Se a rota falhar, a opção de taxa à mão já aparece; se for fora da
área, mostra a distância calculada e o máximo atendido.

## D-2026-10-16-140 — Localização de endereço mais confiável (HERE)

**Problema real encontrado:** (1) a própria rua da loja (Rua dos Dourados) só
existe no HERE como RUA, sem número, e era sempre recusada; (2) para "Estrada
do Retiro, 100" o HERE devolveu OUTRA rua, em outra zona, com nota 0,56 — e o
sistema aceitava e media 10,6 km (cobrança errada / "fora da área").

**Decisão (revisa o mapeamento de D-2026-09-24-75, sem afrouxar RN-ENT-003):**
1. Resultado só vale com nota de correspondência ≥ 0,8 (`queryScore`).
   Abaixo disso: "não encontrado" — nada de distância de outro endereço.
2. Número da casa (`PA`/`interpolated`) segue exata/aproximada.
3. RUA sem número passa a valer **somente quando o CEP do resultado é o CEP
   digitado** (confiança "aproximada"): o CEP de rua cobre um trecho, então o
   ponto fica no lugar certo. Sem CEP conferido, continua recusada.
4. Um segundo resultado só torna o endereço ambíguo se concorre: nota
   parecida (até 0,05 abaixo) e a mais de 300 m.
Implementado em `avaliarResultadosDoHere` (`infrastructure/rotas/here.ts`),
com testes.

## D-2026-10-16-141 — Taxa à mão fica entre o CEP e o endereço

Quando o endereço não é localizado, o campo "Taxa de entrega (R$)" aparece no
próprio bloco do endereço, logo abaixo do CEP e acima da rua — onde a
atendente está olhando —, e não mais no resumo. O resumo e o botão ("Lançar
com taxa de R$ X") refletem o valor digitado.

## D-2026-10-16-142 — TomTom como reserva de mapas

O HERE não tem algumas ruas do entorno da loja (ex.: Estrada do Retiro, CEP
04474-150) e o OpenStreetMap também não — o que descarta as opções gratuitas
baseadas nele. Fica a TomTom como **reserva**: base própria de ruas no Brasil,
cota gratuita diária, sem cartão.

1. `provedorComReserva(HERE, TomTom)`: geocodifica no HERE; se ele não
   localiza (não encontrado/ambíguo) ou está fora do ar, pergunta à TomTom.
   Rota: HERE; se falhar, TomTom. Credencial errada no HERE não é escondida.
2. A TomTom segue o MESMO rigor (D-2026-10-16-140): nota ≥ 0,8; "Point
   Address" exata; "Address Range" aproximada; "Street" só com CEP conferido;
   segundo resultado concorrente a mais de 300 m é ambíguo.
3. Ativa só com `TOMTOM_API_KEY` no servidor (Vercel). Sem a chave, nada muda.
4. Cobrança por distância APROXIMADA pelo ponto do CEP (sem localizar a rua)
   **não** foi adotada; continua proibida (RN-ENT-003) — ver análise de risco
   na conversa de 16/10/2026.
5. (16/10/2026, com a chave real) CEP completo do resultado igual ao digitado
   é confirmação forte: a nota mínima cai de 0,8 para 0,6 nesse caso (HERE e
   TomTom). Verificado: "Estrada do Retiro, 100" (CEP 04474-150) — o HERE não
   acha; a TomTom acha como "Rua do Retiro, 100", CEP 04474-150, nota 0,69 →
   0,77 km de rota. Sem CEP conferido, o mínimo segue 0,8.
6. A consulta de endereço passa a mandar o CEP sempre como "00000-000"
   (`cepFormatado`): sem o hífen a TomTom devolveu outra rua para o mesmo
   endereço. Verificado na tela do balcão: Estrada do Retiro, 100 →
   R$ 4,00 · 0,8 km.

## D-2026-10-16-143 — Troca da taxa calculada, com motivo obrigatório

**Pedido da dona:** quando o endereço é localizado mas a taxa sai errada (ex.:
mais alta do que deveria), a balconista pode trocar o valor — escolhendo o
motivo numa lista, para ficar registrado. No caso "não localizado" (D-138)
continua sem motivo.

**Decisão (migration 0162):**
1. Abaixo da prévia da taxa, "Trocar a taxa" abre: nova taxa (R$) + motivo
   (lista: rota mais longa que a real; CEP/número levaram a ponto errado;
   cliente frequente/acordo; frete promocional; cortesia da casa; outro, com
   descrição). Sem motivo, o pedido não é lançado.
2. `criar_pedido` com `taxa_manual` + `motivo_taxa_manual`: a rota é medida
   normalmente (distância e faixa gravadas) e só a taxa cobrada muda. Fica no
   endereço do pedido a taxa calculada e o motivo, e na auditoria
   (`taxa_entrega_manual`, com a taxa calculada, a cobrada e o motivo).
3. Mesmas salvaguardas: só no balcão, com `orders.override_delivery_fee`,
   0–500. **Não passa por cima de "fora da área"** (a rota é medida antes).
4. O detalhe do pedido mostra "taxa trocada (calculada: R$ X) · motivo".

## D-2026-10-16-144 — Busca de endereço com a loja como referência

**Problema (pedidos reais #25, #22, #19, #18, #20):** endereços próximos não
eram achados — sem CEP e com nome comum ("Getúlio Vargas, 6") a nota do mapa
fica baixa porque há homônimos pela cidade.

**Decisão:**
1. A geocodificação recebe a posição da loja: o HERE prioriza o entorno
   (`at`), a TomTom busca num raio de 20 km; 5 resultados para desempatar.
2. Se a regra principal (D-140/142) recusar, aceita-se UM resultado quando:
   é número da casa; o nome da rua confere com o digitado (sem acento, sem
   "Rua/Av.", sem "de/da"); fica a até 12 km em linha reta da loja; nota ≥
   0,6; e é o ÚNICO lugar assim (dois a mais de 300 m = ambíguo, recusa).
   Confiança "aproximada". Nunca se escolhe "o mais perto" entre vários.
3. Resultado nos pedidos reais: 8 de 9 localizados (antes 3). Continua sem
   mapa: Estrada do Bom Retiro, 24 (CEP 04425-005) — nenhum serviço a tem.
Implementado em `infrastructure/rotas/proximidade.ts`, com testes.

## D-2026-10-16-145 — Taxa informada à mão fica guardada no endereço

**Pedido da dona:** o valor colocado à mão deve ficar guardado para o cliente,
naquele endereço.

**Decisão (migration 0163):**
1. `customer_addresses` ganha a taxa combinada (valor, motivo, quando, quem).
   `criar_pedido` grava ali sempre que o pedido sai com taxa informada à mão
   (não localizado, ou troca com motivo).
2. `cliente_para_balcao` devolve a taxa combinada de cada endereço salvo. Ao
   escolher o endereço no balcão, a taxa já vem aplicada: se o mapa não
   localizar, como taxa à mão; se localizar com outro valor, como troca com o
   motivo "Taxa combinada salva para este endereço". Igual à calculada, nada
   muda. Trocar o CEP para outro endereço descarta a combinada.
3. É sugestão para o balcão: o lançamento continua exigindo a permissão e
   auditando. O site do cliente não usa a taxa combinada.
4. Os pedidos com taxa à mão já existentes tiveram a taxa copiada para os
   respectivos endereços (#18, #19, #20, #22, #24, #25).

## D-2026-10-16-146 — Configurações mostra quais serviços de mapa estão ativos

Em Configurações › Entrega, o cartão "Serviços de mapa" diz se o HERE
(principal) e a TomTom (reserva) têm chave configurada NESTE ambiente — só
"Configurado"/"Sem chave", nunca o valor. Serve para conferir se a Vercel
recebeu `HERE_API_KEY` e `TOMTOM_API_KEY` sem acesso ao painel dela.

## D-2026-10-17-147 — Comanda com subtotal, taxa de entrega e total

**Pedido da dona:** o valor do pedido precisa sair na comanda, porque é o
papel que o motoboy usa — total e frete discriminados.

**Decisão (amplia RN-PRINT-003):** ao fim da comanda, antes de "como cobrar",
saem Subtotal, Taxa de entrega (só na entrega) e TOTAL (em destaque), com os
valores do pedido calculados pelo servidor. A comanda de ALTERAÇÃO não mudou.

## D-2026-10-17-148 — "Letras por linha" na impressora do aparelho

**Problema:** na impressora de 58 mm da loja a comanda perdia os últimos
caracteres de cada linha (valores cortados à direita). A impressora imprime
menos colunas do que as 32 padrão, e margem/régua não valem no modo serial.

**Decisão:** em Configurações › Impressora há "Letras por linha"
(Automático ou um número fixo: 28–32 no 58 mm, 38–48 no 80 mm). Quando fixado,
manda sobre o cálculo automático em qualquer modo. Fica no aparelho, junto da
configuração da impressora; trocar o papel volta para Automático.

## D-2026-10-17-149 — Pedido do cliente com taxa a confirmar (até um teto)

**Pedido da dona:** quando o site não localiza o endereço, o cliente ficava
impedido de pedir entrega. Ela propôs deixar enviar e a balconista colocar a
taxa na confirmação.

**Decisão (cria RN-ENT-016), com o teto sugerido e aprovado:**
1. Endereço não localizado, ambíguo ou rota indisponível (não "fora de
   área"): o checkout mostra "Taxa de entrega: a confirmar (até R$ X)", X = a
   maior taxa entre as faixas ativas, e o total como "R$ ... + entrega".
2. O pedido nasce em "aguardando aprovação de entrega", com taxa 0
   provisória e o endereço marcado `taxa_a_confirmar` + `taxa_teto`.
3. Na fila aparece "Taxa de entrega a definir". "Aprovar entrega" abre o
   campo da taxa; o banco exige o valor (0 até o teto), a permissão
   `orders.override_delivery_fee`, atualiza taxa, total e valor esperado do
   pagamento, guarda a taxa no endereço do cliente e audita
   (`taxa_entrega_manual`). Depois segue o fluxo normal (aceitar etc.).
4. Acima do teto: recusar a entrega ou combinar com o cliente.
5. Pix antecipado sai das opções; troco precisa cobrir subtotal + teto.
6. O acompanhamento do cliente mostra "a confirmar (até R$ X)" até a loja
   definir a taxa.

Migration 0164 (`20261017120000_taxa_a_confirmar_no_pedido_do_cliente`).

## D-2026-10-17-150 — Cores próprias para "Em produção" e "Saiu para entrega"

**Pedido da dona:** na fila, "Saiu para entrega" e "Em produção" tinham a
mesma cor (azul de informação) e não se distinguiam de relance.

**Decisão:** duas famílias tonais novas no design, com claro e escuro:
`tp/tpb/tpf` (laranja, "Em produção") e `tr/trb/trf` (roxo, "Saiu para
entrega"). As demais etapas não mudaram: Novo pedido azul, aguardando
(Pix, aprovação, cliente) âmbar, Aceito e Pronto verdes, falha/rejeitado/
cancelado vermelhos, concluído neutro. O rótulo continua sempre junto da cor.

## D-2026-10-17-151 — Bloco de notas rápido na topbar

**Pedido da dona:** um bloco de notas rápido ao lado do claro/escuro, com
opção de referenciar, para anotações do dia a dia.

**Decisão (respostas da dona):** compartilhado com a equipe e referência a
pedido, cliente ou produto.
1. Tabela `quick_notes` (migration 0165) com RLS sem política: acesso só
   pelas funções `notas_rapidas`, `criar_nota_rapida`,
   `concluir_nota_rapida`, `excluir_nota_rapida` e `referencias_para_nota`,
   que exigem usuário interno ativo.
2. Referenciar pedido exige `orders.view`; cliente, `customers.view`;
   produto, nenhuma (o cardápio é público). O rótulo da referência é gravado
   na criação, e a nota leva link para o pedido, cliente ou produto.
3. Concluir tira da lista "Em aberto" sem apagar (aba Concluídas, com quem
   concluiu). Excluir só quem escreveu. Selo com a quantidade em aberto,
   atualizado ao abrir e a cada 2 minutos.

## D-2026-10-17-152 — Clientes: telefone na tabela e paginação

**Pedido da dona:** mostrar o telefone na lista de clientes, com opção de
copiar, e paginar para não carregar tudo de uma vez.

**Decisão:** coluna Telefone (formatado, "(11) 98811-3831") com botão de
copiar (copia só os números). A lista mostra 25 por página, com Anterior/
Próxima; os filtros seguem ao trocar de página e trocar filtro volta à
primeira. `clientes_analiticos` passou a aceitar `deslocamento` (migration
0166); o total e o resumo do topo continuam sobre a base inteira.

## D-2026-10-17-153 — Fiado: pagar depois sem mexer no caixa

**Pedido da dona:** clientes pedem para pagar depois; fazer isso sem alterar
o caixa e sem dar quebra, com filtro para ver só quem está devendo.

**Decisão (sugestão aprovada; cria RN-PGTO-015):**
1. Ação "Pagar depois (fiado)" na tela do pedido, com observação opcional;
   só para cliente identificado; permissão nova `orders.defer_payment`
   (Owner/Admin por padrão, concedível em Equipe › Permissões).
2. Fiado não é pagamento: `payment_status` segue `pending`. O caixa e o
   dinheiro do motoboy vêm dos pagamentos registrados, então nada é esperado
   e não há quebra. A retirada em fiado pode ser concluída; a comanda de
   entrega diz "FIADO - NAO COBRAR"; a central de entregas mostra "Fiado —
   não cobrar".
3. O fiado sai da fila "a receber" do dia. A cobrança é pela ficha do
   cliente (bloco "Fiado em aberto", com "Receber" e "Cobrar pelo
   WhatsApp", mensagem pronta e manual) e pela tela do pedido, onde o
   recebimento normal entra no caixa aberto daquele dia.
4. Clientes: filtro "Com fiado em aberto", coluna "Em aberto" e cartão
   "Fiado em aberto" no resumo. Dashboard: "A receber no fiado" quando há.
   Balcão: aviso ao reconhecer cliente com fiado (aviso, não bloqueio).
5. Desfazer exige motivo; não vale para retirada já concluída no fiado.
   Tudo auditado (`pedido_fiado`, `pedido_fiado_desfeito`). Sem limite.

Migration 0167 (`20261017150000_fiado_pagar_depois`).

## D-2026-10-17-154 — Acrescentar itens a pedido aceito; fiado na janela Receber

**Pedido da dona:** (1) marcar fiado na hora de receber, não só na tela do
pedido; (2) quando o cliente pede mais coisa depois do aceite, acrescentar no
mesmo pedido em vez de lançar outro e receber duas vezes.

**Decisão (sugestão aprovada; cria RN-ALT-008 e amplia RN-PGTO-013):**
1. "Pagar depois (fiado)" também na janela **Receber** da fila de pedidos.
   A forma escolhida no checkout é só a esperada: na hora de receber, o
   campo Forma registra a forma real.
2. "+ Acrescentar itens" na tela do pedido (Itens), com a mesma busca de
   produtos do balcão, até o pedido sair para entrega ou ser concluído;
   permissão `orders.request_change`; canal obrigatório (WhatsApp, telefone,
   no balcão) = aceite do cliente, sem aprovação pelo link. Só acréscimo.
3. `acrescentar_itens` (migration 0168) precifica os itens novos, não mexe
   nos antigos, atualiza total e valor esperado (troco que não cobre mais o
   total é limpo), grava revisão `addition` aplicada e audita
   (`pedido_acrescimo`).
4. Pedido já pago: volta a "pendente", com "falta receber" a diferença.
   `registrar_pagamento` aceita o complemento exato; Recebimento e janela
   Receber mostram "Já recebido R$ X, falta R$ Y"; a comanda de entrega
   diz "Ja pago / COBRAR".
5. Comanda de **ACRÉSCIMO** com só os itens novos e "a comanda anterior
   CONTINUA valendo".

## D-2026-10-17-155 — Edição de produto: foto mantida e preço por tamanho editável

**Problemas relatados:** (1) mudar o preço tirava a foto do produto;
(2) para mudar o preço de um tamanho era preciso remover e recriar.

**Correções:**
1. `salvarProduto` só mexe na imagem quando o formulário a envia; o
   formulário de edição não envia (a foto se troca na aba Imagem). Antes ele
   regravava `image_asset_id` como vazio a cada salvamento.
2. Aba Imagem: "Usar uma foto já enviada" lista as fotos de produto que
   nenhum produto usa e permite recolocá-las sem reenviar (recupera as fotos
   perdidas pelo item 1).
3. Tamanhos habilitados: "Editar preço" em cada tamanho (mesmo
   `salvarVariacao`, que já fazia upsert por produto × tamanho).
4. Ferramenta Tamanhos: "Editar tamanho" (nome, vendido como, fatias, máximo
   de sabores, ordem), usando o `salvarTamanho` que já aceitava edição.

## D-2026-10-22-156 — Retirada no balcão só com o nome

**Pedido da dona:** cliente no balcão que não quer passar o telefone.

**Decisão (amplia D-2026-09-26-81):** no Novo pedido com canal **Balcão** e
**Retirada**, o WhatsApp é opcional; basta o nome. O pedido não vincula
cliente (sem histórico, sem fiado) e o nome vai para a fila e a comanda. Sem
nome e sem telefone continua sendo a venda anônima "Balcão". Telefone
digitado pela metade continua barrando. Entrega e os outros canais
continuam exigindo WhatsApp. O aviso no campo explica a perda de histórico
e de fiado. Migration 0169 (`20261022100000_balcao_so_com_nome`).

## D-2026-10-23-157 — WhatsApp opcional nos canais Telefone e Balcão

**Pedido da dona:** a balconista recebe pedido por telefone de cliente que não
quer passar o WhatsApp de jeito nenhum; o mesmo vale no balcão.

**Decisão (amplia D-2026-10-22-156 e D-2026-09-26-81):** no Novo pedido com
canal **Telefone** ou **Balcão**, em **retirada ou entrega**, o WhatsApp é
opcional. O **nome continua obrigatório**, exceto na retirada do balcão (que
sem nome vira "Balcão", como em D-156): em entrega não há a quem entregar, e no
telefone não há quem chamar na retirada. Os canais WhatsApp, iFood e outro, e
o checkout público, continuam exigindo WhatsApp; telefone digitado pela metade
continua barrando. Condições cumulativas em `criar_pedido`: lançamento
interno, WhatsApp vazio e canal `counter` ou `phone`.

**O que muda no pedido sem WhatsApp:** `customer_id` nulo (a identidade do
cliente é o WhatsApp), então não há histórico, fiado nem remarketing. Como
`customer_addresses.customer_id` é NOT NULL, na entrega o **endereço não é
salvo para uso futuro**: fica só em `orders.delivery_address_snapshot`, que já
guarda o que a entrega e a corrida usam. A taxa combinada também não é guardada
no endereço. O aviso do campo explica isso à balconista. As telas do pedido
passaram a esconder o link "Falar no WhatsApp" quando não há número (já
aparecia quebrado no balcão sem telefone).

**Risco operacional, aceito:** sem telefone, o motoboy não tem como ligar para o
cliente se não achar o endereço; vale a balconista preencher bem a referência.

Migration 0170 (`20261023100000_whatsapp_opcional_balcao_e_telefone`).
Verificada em transação desfeita no DEV, com 11 combinações de canal,
modalidade e nome: telefone e balcão, em retirada e entrega, criam o pedido sem
cliente (e sem endereço salvo na entrega); sem nome em entrega ou telefone,
canais WhatsApp/iFood e número pela metade continuam recusados.

## D-2026-10-23-158 — Fila de pedidos em três grupos e tabela que cabe no notebook

**Origem:** crítica do Impeccable ao dashboard e à fila de pedidos (23/10/2026).

**Decisão (só apresentação; nenhuma regra, estado ou permissão mudou):**

1. **Três grupos na fila em aberto**, cada um ordenado do mais antigo para o
   mais novo: **Precisam de você** (novo, Pix por conferir, entrega por
   aprovar), **Parados** (pronto esperando o cliente ou o motoboy, entrega que
   falhou, alteração aguardando o cliente) e **Em andamento**. "Parados" usa a
   mesma lista das filas "Prontos e parados", "Aguardando resposta do cliente"
   e "Entregas com falha" da Central de Atenção do dashboard
   (`parado()` em `estados.ts`, com teste), para o alerta do dashboard levar a
   uma fila em que o item se destaca.
2. **Links do dashboard funcionam:** `/admin/pedidos?status=a,b` recorta a fila
   em aberto nesses estados, avisa "Mostrando só: …" e oferece "Ver todos os
   pedidos em aberto". Status desconhecido na URL é ignorado.
3. **Tabela de pedidos:** as 9 colunas só de 1536 px (`2xl`) para cima; abaixo
   disso, 6 colunas, com o botão da comanda ao lado do número do pedido,
   o canal sob o cliente e o pagamento sob o total. A coluna Ações fica presa
   à direita. Medido a 1280 px (notebook): antes 1144 px de conteúdo em 999 px
   de espaço, com Situação e Ações fora da tela; agora sem rolagem lateral.

Fora desta decisão, ainda abertos da crítica: dashboard "Agora × Período",
busca e resumo em Encerrados, acessibilidade do menu mobile e alvos de toque.

## D-2026-10-23-159 — Novo pedido: atalhos nos itens e resumo sempre à vista

**Origem:** avaliação do modal de Novo pedido, a pedido do balcão (23/10/2026).

**Decisão (só apresentação; preço, taxa, disponibilidade e permissão seguem
sendo do servidor):**

1. **Passo dos itens com atalhos**, em vez de uma busca vazia: "Mais pedidos"
   (os mesmos do cardápio público, `listarMaisPedidos`) em botões de um toque, e
   as categorias abertas do cardápio como botões. Tocar numa categoria lista os
   produtos dela; a caixa de busca passa a filtrar dentro dela. A categoria
   continua aberta depois de adicionar um item, para lançar vários seguidos. Com
   mouse e teclado o cursor já entra na busca; no celular não, para o teclado não
   cobrir os atalhos. Vale também onde o mesmo seletor é usado (acrescentar item e
   alteração de pedido).
2. **Resumo do pedido sempre à vista** no modal do desktop (≥1024 px), em uma
   coluna à direita, com o modal mais largo (760 → 1080 px): canal e modalidade,
   cliente, endereço ou retirada, itens, subtotal, taxa, **total estimado**,
   pagamento e o que falta para lançar. O total estimado é só a soma do subtotal
   (totais que o servidor devolveu item a item) com a taxa cotada ou informada,
   rotulado como estimativa; quem vale é o recálculo de `criar_pedido`
   (CLAUDE.md §16). No celular nada muda: o passo a passo já cumpre esse papel.

Ainda abertos desta avaliação: passo 1 mais curto (endereço em duas colunas e
canal abrindo no último usado) e atalhos de teclado.

## D-2026-10-23-160 — Novo pedido: passo 1 mais curto e atalhos de teclado

**Origem:** continuação de D-2026-10-23-159, a pedido do balcão (23/10/2026).
Só apresentação e conveniência; nenhuma regra, preço ou permissão mudou.

1. **Passo 1 mais curto no desktop do modal:** "Canal e modalidade" e "Cliente"
   lado a lado, e o endereço numa grade de 12 colunas (rua+número; bairro,
   cidade e UF; complemento e referência), em três linhas em vez de cinco.
   Uma entrega foi de ~1370 para ~960 px de altura. No celular e na página
   `/admin/pedidos/novo` o desenho é o de antes.
2. **O canal abre no último usado.** Guardado no `localStorage` do aparelho
   (`shalon:novo-pedido:ultimo-canal`): conveniência de quem usa o aparelho,
   sem valor de regra; sem armazenamento, vale o padrão (WhatsApp).
3. **Teclado no modal do desktop:**
   - **Enter** num campo vai ao próximo campo; no último, com o passo completo,
     avança (no passo dos itens o Enter é da busca);
   - **Ctrl+Enter** avança de passo e, no último, **lança**; as mesmas travas do
     botão valem (`clienteCompleto`, `podeLancar`) e o servidor confere de novo.
     Lançar nunca é um Enter solto;
   - na busca de produto, **Enter** abre o primeiro resultado disponível; com o
     configurador aberto, **Ctrl+Enter** adiciona o item e o cursor volta à
     busca; **/** pula para a busca de produto;
   - o foco entra no configurador ao abrir um produto (no primeiro tamanho ou
     no botão de adicionar) e a dica das teclas aparece no rodapé do modal.

## D-2026-10-23-162 — Comanda volta a sair toda em negrito

**Contexto:** em D-2026-10-23-161 a comanda passou a ter negrito só nos itens e
nas observações. No mesmo dia, no balcão, a atendente disse que o texto comum
ficou **fraco** na impressora térmica.

**Decisão:** revertida por completo (`git revert` do commit `9addd8e`). A comanda
volta a sair como antes: documento inteiro em negrito, com o contorno extra nos
títulos e destaques. Vale a decisão de 08/10/2026 em `imprimir.ts`: a Courier
New é fina demais para a térmica em peso normal.

**Para uma próxima tentativa** (se a ideia de hierarquia voltar): o problema
não é só o peso do texto comum, é o contraste real no papel. Algo como letra
maior ou espaçamento nos itens e nas observações, mantendo o resto escuro,
precisa ser testado na própria Diebold/KD-1025 antes de ir ao ar. Um contorno
de 0,2 px não bastou.

## D-2026-10-23-163 — Fechamento de caixa: só o que teve movimento, nomes curtos e somas

**Pedido do balcão:** o relatório trazia linhas zeradas, quebrava linha no papel
e não somava o que entrou e o que saiu. Só apresentação e leitura; o esperado e
a diferença continuam calculados como antes (RN-CAIXA-011).

1. **Só o que teve movimento.** Sangria, reforço, despesa, estorno, adiantamento,
   fundo, forma de pagamento: sem movimento, a linha não sai (tela e papel). O
   bloco "Entrou"/"Saiu" inteiro some se estiver vazio.
2. **Nomes curtos, até 12 caracteres**, escolhidos pela *família* da forma (não
   pelo nome, que o painel permite mudar): **Dinheiro, Crédito, Débito, Pix
   máquina** (era "Pix na maquininha") e **Pix chave** (era "Pix antecipado"),
   Voucher. O papel de 58 mm comporta ~25 colunas com a letra fixa, e cada linha
   leva o valor à direita; "Cartão de crédito" e "Pix na maquininha" quebravam.
   Os rótulos dos movimentos também cabem em 12 (Vendas, Reforços, Sangrias,
   Despesas, Adiantamento, Estornos, Outros, Ajuste, Sobra/Falta moto).
3. **As somas.** O relatório mostra o **total recebido** (todas as formas) e, na
   gaveta, **fundo + total que entrou − total que saiu = esperado**. Os totais
   vêm do **servidor**, não de soma na tela, por duas razões: a lista antiga era
   incompleta (não trazia adiantamento a funcionário, que sai da gaveta, nem
   outras saídas) e "estornos" somava `refund` e `adjustment` sem olhar o
   sentido. O fundo não é um movimento (`abrir_caixa` só grava `opening_amount`),
   então a conta fecha; conferido nas 9 sessões do DEV.
4. **Migration 0171** (`20261023140000_fechamento_com_movimento_completo`):
   `resumo_do_fechamento` ganha `movimentos_da_gaveta` (por tipo e sentido, só os
   grupos que existem), `entrou_na_gaveta`, `saiu_da_gaveta` e `total_recebido`.
   Só acrescenta chaves; as que existiam não mudam. **Sem a migration** o
   relatório continua saindo (com as linhas zeradas escondidas e os nomes
   curtos), apenas sem as linhas de total.
5. Um só módulo monta o relatório para a tela e para o papel
   (`domain/caixa/relatorioDeFechamento.ts`), para nunca divergirem.

## D-2026-10-23-164 — Entregas: lista de motoboys com a situação de cada um

**Pedido do balcão:** o motoboy não tem login; ao cadastrá-lo, ele precisa ficar
disponível para as entregas, e o que já estava cadastrado não aparecia como
"online".

**Diagnóstico:** o cadastro já funcionava. Funcionário **ativo** marcado como
"Faz entregas" (`is_driver`) entra na escolha do motoboy de cada pedido
(`central_de_entregas`), sem precisar de acesso (RN-MOTO-001). O que faltava era
o sistema **mostrar** os motoboys: a tela de Entregas não tinha lista nenhuma, e
eles só apareciam dentro do seletor, quando havia pedido pronto esperando.

**Decisão (só leitura; nenhum dado novo, nenhuma regra mudou):**
1. A tela de Entregas ganha a seção **Motoboys**, com a situação de cada um,
   lida do que já existe: **Disponível** (sem corrida em aberto), **Montando**
   (corrida aberta), **Na rua** e **A acertar** (voltou, falta o acerto). Quem
   está disponível vem primeiro. Sem nenhum motoboy cadastrado, a seção explica
   como cadastrar e leva a Equipe.
2. **"Disponível" não é "online".** O motoboy não tem app nem login e o sistema
   não o rastreia (sem GPS, CLAUDE.md §46): disponível = cadastrado, ativo e sem
   corrida em aberto. Quem monta e despacha a corrida é a equipe do balcão.
3. O cadastro de funcionário explica que "Faz entregas" já basta, sem acesso.

**Fora desta decisão (precisa de decisão):** um controle "de folga hoje" para o
motoboy que não está trabalhando, que exigiria um campo novo e definir se quem
está de folga some do seletor.

## D-2026-10-24-165 — Presença do motoboy: Veio ou Faltou, por dia

**Pedido da dona:** o motoboy não tem login; é preciso controlar se ele veio
trabalhar ou faltou. Opções avaliadas: (A) uma chave simples "trabalhando" —
sem histórico, esquece ligada no dia seguinte e não registra quem marcou; (B)
presença por dia — **escolhida**; (C) ponto com hora de entrada e saída —
descartada: mais do que se pediu e perto de folha de pagamento (fora da V1,
CLAUDE.md §46).

**Decisão (migration 0172, `20261024100000_presenca_do_motoboy`):**
1. **Uma marca por funcionário por dia de trabalho:** Veio ou Faltou; sem linha =
   "não marcado". Tocar de novo na marca ativa a desfaz. Tabela
   `employee_attendance` (única por funcionário e dia).
2. **O dia de trabalho vira às 5h**, no fuso da loja (`dia_de_trabalho()`): a
   pizzaria passa da meia-noite. **O servidor escolhe o dia; a tela não manda
   data**, então não há como marcar o de outro dia.
3. **"Faltou" tira o motoboy da escolha de quem recebe pedido, no servidor**
   (`atribuir_entrega` e `transferir_entrega` recusam) e na tela. **Sem marca ou
   "Veio": continua escolhível** — esquecer de marcar nunca trava o balcão.
   Desfazer a marca libera de novo. Corrida já em andamento não é afetada.
4. **Permissão nova `employees.attendance`** para a Proprietária e o Atendente,
   editável em Permissões. A tabela só se lê por quem tem `employees.view`;
   escrita só pela função `marcar_presenca`. Toda marcação e todo desfazer ficam
   em `audit_logs` (`presenca_marcar`, `presenca_desfazer`).
5. **Telas:** em Entregas, a seção Motoboys ganha os botões Veio e Faltou e a
   situação ("Disponível · Veio hoje", "Faltou hoje"…); em Equipe, a aba
   **Presença** mostra o mês de cada entregador (dias que veio, faltas e as datas
   das faltas), navegável por mês. Dia sem marcação não conta como falta nem como
   presença, e **falta não vira desconto de ninguém**: não há folha na V1.

**Também nesta rodada:** o acesso (login) do Erisvan, que nunca foi usado, foi
desativado pela própria tela de Equipe (auditado como `acesso_desativar`). O
cadastro de entregador não depende de acesso.

## D-2026-10-24-166 — Fechamento de caixa com pizzas, fogazzas e bebidas vendidas

**Pedido da dona:** o fechamento, além do dinheiro, mostra quantas pizzas,
quantas fogazzas e quantas bebidas foram vendidas.

**Decisão (migration 0173, `20261024140000_fechamento_com_itens_vendidos`):**
1. **Base:** pedidos com pagamento confirmado **nesta sessão** — o mesmo conjunto do
   "Recebido por forma de pagamento". Pedido cancelado/recusado ou com pagamento
   estornado fica fora; pedido pago em dois pagamentos conta uma vez. Pedido
   "pagar depois" entra na sessão em que for pago, não na em que foi feito.
2. **Pizza × fogazza:** pelo tamanho (`pizza_sizes.sold_as`). **Meio a meio é uma
   pizza.** Bebida é o produto de tipo `drink`. Outros tipos não entram.
3. **Combo:** contam os componentes (cada um pelo seu tipo) vezes a quantidade de
   combos; o combo em si não é uma unidade. Um combo de pizza + refrigerante soma
   1 pizza e 1 bebida.
4. O servidor conta (`resumo_do_fechamento.itens_vendidos`); a tela e o cupom só
   mostram, e escondem o que está em zero. Servidor sem a 0173: a seção não sai.

## D-2026-10-24-167 — Trocar a forma de pagamento de um pedido já pago

**Problema (dona):** o pedido é lançado numa forma (ex.: dinheiro) e o cliente paga
em outra (ex.: débito), ou o contrário. O fechamento sai errado: em 22/10, R$ 150
contados contra R$ 33 esperados, porque o dinheiro que entrou foi lançado como
cartão e Pix.

**Já existia:** estornar o pagamento e registrar de novo, em dois passos. O estorno
de um dinheiro de sessão fechada saía do caixa **aberto agora** — o caixa de hoje
ficava errado e o do dia continuava errado.

**Decisão (opção A, aprovada em 24/10/2026; migration 0174
`20261024160000_trocar_forma_de_pagamento`):**
1. **Um ato só** (`trocar_forma_de_pagamento`): o pagamento antigo vira estornado
   (motivo, quem, quando; dinheiro da gaveta ganha um `refund` vinculado) e o novo
   entra, tudo ou nada.
2. **Vale na sessão ORIGINAL do pagamento**, aberta ou já fechada. O caixa de hoje
   não é tocado. O `received_at` do original é mantido: a receita não muda de dia.
3. **Sessão fechada:** o fechamento original é guardado em `cash_session_corrections`
   (`payment_change`, antes/depois, pedido, de/para, motivo, quem). O esperado e a
   diferença gravados são recalculados; **a contagem física não é tocada**. Se a
   correção cria uma diferença onde não havia, a própria troca vira a justificativa.
4. **Permissão:** estornar (`finance.reverse`) **e** registrar pagamento
   (`payments.register`). Motivo obrigatório. Auditado (`pagamento_trocar_forma` e,
   em sessão fechada, `caixa_correcao_pagamento`).
5. A **intenção do checkout nunca é alterada** (RN-PGTO-003). A soma tem de fechar
   com o que já foi pago.
6. **Fora desta versão (recusado com mensagem):** pedido de entrega ligado a uma saída
   (o acerto do motoboy tem contabilidade própria), pagamento que não entrou em
   nenhum caixa, pagamento em mais de uma sessão.
7. **Tela:** botão **Trocar forma** no Histórico de vendas do PDV (escolhe a forma
   certa, a bandeira se for cartão, e o motivo). Troca para uma forma só; trocar para
   uma divisão em várias formas continua sendo estorno + novo recebimento.

## D-2026-10-27-168 — Permissões sem dependência escondida, explicadas na tela

**Problema (dona):** a Julia, como Balconista, não conseguia fechar uma venda
escolhendo a forma de pagamento e teve de virar Owner/Admin. Não dava para saber,
na tela de permissões, o que cada item afeta.

**Causa:** em 15/10 "Ver configurações" foi tirado do Atendente. As formas de
pagamento e as bandeiras só eram legíveis com essa permissão, e o PDV e o
recebimento abriam com a lista de formas vazia. Do mesmo jeito, o Histórico de
vendas do PDV exigia "Ver o financeiro", e o resumo do fechamento (SECURITY
INVOKER, lendo `payments`) vinha zerado para quem só tinha "Ver o caixa".

**Decisão (aprovada em 27/10/2026; migration 0175
`20261027100000_permissoes_sem_dependencia_escondida`):**
1. Formas de pagamento e bandeiras: leitura para toda a equipe interna ativa.
2. Histórico de vendas do PDV: `cash.view` + `orders.view` (era `finance.view`).
3. `resumo_do_fechamento` vira SECURITY DEFINER com checagem de `cash.view`; a
   tabela `payments` continua atrás de `finance.view` (03 §17.3, esclarecido).
4. Tela de permissões: cada item diz o que libera; marcar traz junto o que ele
   precisa; item sem dependência mostra "Não funciona sem…" com "Marcar o que
   falta"; atalhos por tarefa ("Vender no balcão", "Atender pedidos do link",
   "Abrir e fechar o caixa", "Cuidar das entregas") só acrescentam. O catálogo
   fica em `src/domain/equipe/permissoes.ts`, com teste.
5. Sem tooltip: a explicação fica sempre visível, porque tooltip não funciona no
   celular.

## D-2026-10-27-169 — O fechamento conta os pedidos do turno e avisa o que ficou sem recebimento

**Problema (dona):** a contagem de pizzas do fechamento não batia com o que ela
vendeu. Os pedidos do link estavam sendo contados; os que faltavam eram, quase
todos, **entregas concluídas sem recebimento no caixa**: concluídas fora de uma
saída do motoboy (o recebimento de entrega acontece no acerto) ou pagas em
dinheiro com "Este dinheiro entrou na gaveta agora" desmarcado. De 16 a 25/10,
31 pedidos; o dinheiro deles também não estava em fechamento nenhum.

**Decisão (aprovada em 27/10/2026; migration 0176
`20261027110000_fechamento_conta_pedidos_do_turno`; RN-CAIXA-017; substitui o
item 1 de D-2026-10-24-166):**
1. `pedidos_do_caixa(sessão)`: pagos na sessão + criados no turno sem pagamento
   confirmado em caixa nenhum (já aceitos; cancelado/recusado fora). Um pedido
   não conta em duas sessões.
2. A contagem de pizzas, fogazzas e bebidas usa esse conjunto.
3. `resumo_do_fechamento.sem_recebimento` lista esses pedidos; a prévia do
   fechamento pede para receber antes de contar, e o resumo, o relatório e o
   cupom mostram a lista. Cada linha abre o pedido.
4. Dinheiro não muda: recebido, esperado e diferença seguem só o que entrou.

## D-2026-10-27-170 — Pix numa linha só no fechamento

**Pedido (dona):** juntar no relatório de caixa o Pix antecipado e o Pix da
maquininha.

**Decisão (aprovada em 27/10/2026; só apresentação, sem migration):** no
"Recebido por forma de pagamento" — tela, relatório de caixa e cupom — os dois
somam na linha **Pix**; logo abaixo, em letra menor (no cupom, recuado), o valor
de cada origem ("máquina", "antecipado"), porque um cai na maquininha e o outro
na conta da loja. A prévia de antes da contagem continua por forma, para
conferir com a maquininha.

## D-2026-10-27-171 — Saída rápida da gaveta e fechamento que aponta as causas da diferença

**Problema (dona):** o caixa fecha com diferença quase todo dia e a balconista não
sabe explicar. Análise de 14 a 25/10: o sistema calcula certo (25/10: vendas em
dinheiro R$ 476 + fundo R$ 85 = esperado R$ 561); as diferenças vêm do que passa
pela gaveta sem passar pelo sistema:
- **nenhuma saída registrada em 12 dias** (sangria, despesa, motoboy). A sangria
  só existia por tecla (F9) e a despesa pelo caixa só no Financeiro, que a
  balconista não abre → faltas (25/10 −R$ 139; 23/10 "foi retirado 10 do caixa");
- vendas feitas em comanda de papel → sobras (20/10 +R$ 193,50);
- preço cobrado diferente do sistema (24/10 e 22/10);
- dinheiro de entrega com "entrou na gaveta" desmarcado → sobra no dia e um
  "fora da gaveta" que só crescia (R$ 296,98 em 25/10, desde 17/10).

**Decisão (aprovada em 27/10/2026; migration 0177
`20261027130000_saida_rapida_e_causas_da_diferenca`; RN-CAIXA-010-A e 012-A):**
1. **Tirar dinheiro** à vista no painel do caixa (`tirar_dinheiro_da_gaveta`,
   `cash.adjust`): motoboy, compra, retirada da dona, outro. Retirada é sangria;
   os demais são despesa paga pelo caixa, nas categorias novas "Pagamento de
   motoboy", "Compras do dia" e "Outras despesas do caixa" (achadas pelo nome).
2. **Fechamento com causas** (`causas_da_diferenca`, `cash.view`): com diferença,
   mostra dinheiro fora da gaveta ("Está na gaveta"), nenhuma saída registrada
   ("Registrar dinheiro que saiu"), forma diferente da escolhida, pedidos sem
   recebimento e vendas com troco. Corrigiu → confere de novo com a mesma
   contagem. A justificativa ganha causas marcáveis + texto opcional.
3. **Dinheiro fora da gaveta** (`dinheiro_entrou_na_gaveta`) entra no caixa do
   turno em que foi recebido; turno fechado é corrigido com o original em
   `cash_session_corrections` (`cash_collected`, tipo novo) e exige `cash.reopen`.
   Pedido de saída de entrega fica com o acerto do motoboy.
4. **Fica para a dona decidir, sem implementação:** vender tudo pelo sistema
   (sem comanda de papel) e como cobrar casos como "pedaço de brigadeiro" e
   "massa grossa" (cadastro × ajuste de preço com motivo).

## D-2026-10-27-172 — "Saiu com…": toda entrega sai com um motoboy, e a balconista faz o acerto

**Problema (dona):** muitas entregas sem motoboy atribuído. Dados de 14 a 27/10:
91 entregas concluídas, **nenhuma** em saída de motoboy (`driver_runs` vazia desde
sempre). O "Despachar" da tela Pedidos punha a entrega na rua sem motoboy, contra
RN-STATE-007; o acerto exigia `deliveries.settle`, que a balconista não tem. Sem
saída e sem acerto, o dinheiro das entregas entrava na gaveta por fora — entrega
concluída sem recebimento e dinheiro "fora da gaveta" esquecido (D-169, D-171).

**Decisão (aprovada em 27/10/2026; migration 0178 `20261027150000_saiu_com_motoboy`;
RN-STATE-007 e RN-RUN-004 detalhados; 03 §19.4 alterado):**
1. **"Saiu com…"** no lugar de "Despachar" (`sair_com_motoboy`): toca-se no motoboy
   e o pedido é vinculado (`atribuir_entrega`) e posto na rua; motoboy já na rua
   leva o pedido na mesma saída. `comando_pedido 'despachar'` recusa entrega sem
   vínculo ativo. Lista em `motoboys_para_despacho`: ativos, sem falta hoje.
2. **Concluir/Falhou pelo vínculo** (`finalizar_pedido`, usado por todos os
   comandos da tela Pedidos): entrega vinculada passa por `registrar_retorno`;
   o resto segue `comando_pedido`. Entrega que já estava na rua antes da 0178
   continua podendo ser concluída como antes.
3. **Acerto pela balconista:** `conciliar_corrida` exige `deliveries.manage`;
   `deliveries.settle` só para diferença ≠ 0 (mensagem diz quanto e pede quem
   pode conciliar). Substitui a decisão de 22/09 (03 §19.4) de o balcão não
   fechar acerto.
4. **Para a dona:** cadastrar todos os motoboys em Equipe como entregadores
   (hoje só o Erisvan). Não precisam de login.

## D-2026-10-27-173 — O fechamento pergunta pelo fundo antes da contagem

**Problema (dona):** o fundo "conta no fechamento", mas ela leva o fundo antes
de a balconista contar. Caso de 25/10: fundo R$ 85,00 + R$ 476,00 de vendas em
dinheiro = esperado R$ 561,00; contado R$ 422,00; diferença mostrada
−R$ 139,00. Os R$ 85,00 foram levados sem registro: a falta real era −R$ 54,00.

**Decisão (aprovada em 27/10/2026; sem migration; RN-CAIXA-011-A):**
1. O fundo segue no esperado (`esperado_em_caixa` inalterado): enquanto fica na
   gaveta, ele está lá e tem de ser contado.
2. Com fundo > 0, o fechamento pergunta antes da contagem: "Sim, está na
   gaveta" / "Não, a dona levou tudo" / "A dona levou só uma parte" (valor
   menor que o fundo). As duas últimas registram retirada da dona
   (`tirar_dinheiro_da_gaveta`, motivo `retirada`, exige `cash.adjust`) e o
   esperado desce.
3. A prévia do fechamento passa a trazer o fundo e as retiradas já registradas;
   nenhum dos dois revela o esperado, e a contagem continua cega
   (RN-CAIXA-011). Havendo retiradas, a pergunta avisa para não descontar duas
   vezes.
4. O fechamento de 25/10 fica como foi registrado (decisão do Marcelo).

## D-2026-10-27-174 — Várias entregas por saída, troco da gaveta e "Fulano voltou"

**Problema (Marcelo/dona):** o motoboy sai com várias entregas na mesma viagem e
o "Saiu com…" despachava uma por vez; ele leva troco tirado da gaveta sem
registro; a página Entregas quase não seria usada, porque o recebimento já é
feito pedido a pedido em Pedidos; e, sem acerto, as saídas ficariam "esperando
acerto" para sempre.

**Decisão (aprovada em 27/10/2026; migration 0179 `20261027180000_motoboy_voltou`;
RN-RUN-004-A):**
1. **"Saiu com…" com várias entregas e troco** (`sair_com_entregas`): escolhe o
   motoboy, marca as outras entregas prontas que vão junto e informa o troco
   levado da gaveta. O troco é um movimento novo da gaveta (`driver_change`):
   sai na saída, volta no acerto. `driver_runs.change_float` guarda o valor.
2. **Recebimento pedido a pedido** em Pedidos, como já era, com o dinheiro
   "com o motoboy".
3. **"Fulano voltou"** (`motoboy_voltou`): mostra as entregas da saída, recebe o
   que falta, marca as não entregues (com motivo) e confere o que o motoboy
   entrega — dinheiro das entregas + troco. Conclui tudo e faz o acerto num ato;
   diferença continua exigindo motivo e `deliveries.settle` (D-172).
4. **Entrega só sai dos abertos com recebimento** (ou fiado): `registrar_retorno`
   recusa concluir sem ele; `finalizar_pedido` manda Concluir/Falhou de entrega
   na rua para a volta do motoboy. Fiado não trava o acerto.
5. **Página Entregas enxuta:** motoboys (livre / na rua, Veio/Faltou), quem está
   na rua com o quê (com o "Fulano voltou" e a transferência em rota,
   RN-RUN-008) e o histórico das saídas por dia (`corridas_do_dia`). Saem o
   "Esperando motoboy", o despachar e o acerto antigo.
6. **Fechamento:** as causas da diferença mostram o que cada motoboy entregou
   naquela gaveta e as diferenças da volta.

## D-2026-10-28-175 — Desconto na hora do pagamento

**Problema (Marcelo/dona):** às vezes a loja dá desconto na hora de receber, e o
sistema não tinha como: o pagamento tinha de fechar no total do pedido. O
desconto virava pagamento que não batia ou diferença no fechamento.

**Decisão (aprovada em 27/10/2026; migration 0180 `20261028100000_desconto_no_pagamento`;
RN-PGTO-016):**
1. **"Dar desconto"** na tela de receber (PDV, fila de pedidos, volta do
   motoboy): valor em reais e motivo (arredondamento, cliente da casa,
   reclamação ou outro). Só antes de pagar.
2. **Limite:** quem recebe dá até **R$ 5,00**; acima, só com a permissão nova
   `orders.discount`, dada ao Owner/Admin (escolha da dona entre as opções:
   balconista até um limite, limite de R$ 5,00).
3. **Pedido guarda o bruto:** `orders.discount_amount` (+ motivo, quem, quando);
   `total = subtotal + taxa − desconto`. `dar_desconto` recalcula no servidor;
   taxa aprovada e alteração aplicada respeitam o desconto.
4. **Fechamento** mostra "Descontos dados neste caixa" (tela e papel); a
   comanda mostra a linha "Desconto" antes do total.
5. **Fora:** cupom, desconto em %, desconto depois de pago (estorna-se).

## D-2026-10-30-176 — Massa grossa

**Pedido (Marcelo):** oferecer massa grossa, com custo, para o cliente e para a
balconista. Resolve o caso "massa grossa" deixado em aberto na D-2026-10-27-171.

**Decisão (aprovada em 30/10/2026; migration 0181 `20261030100000_massa_grossa`;
RN-ADD-007):**
1. **Seção própria** "Escolha a massa" no configurador (público, pedido manual e
   PDV), com "Massa normal" e "Massa grossa + R$".
2. **Cadastro em `addons`** com `kind = 'massa'`, preço em `addon_size_prices`; o
   snapshot do pedido segue em `order_item_addons`. `montar_item` a separa antes
   do teto e dos inclusos e sempre a cobra.
3. **Só em pizza:** `massa_permitida` recusa fogazza, e "Copiar preços" não a leva.
4. **Preço:** a loja cadastra em Produtos › Adicionais; sem preço, não aparece.
5. **Comanda:** linha em destaque, separada dos adicionais.

## D-2026-10-30-177 — Sem animações na interface

**Pedido (Marcelo):** o máximo de velocidade, eliminando qualquer animação, sem
sacrificar o tempo real.

**Decisão (30/10/2026):** regra global em `src/app/globals.css` zera animações,
transições e rolagem suave no cardápio público e no painel. Exceção: o giro de
"processando" (`animate-spin`, `animate-shalon-spin`). O indicador de navegação
pendente fica aceso, parado, e skeletons ficam estáticos. Suspende o movimento do
doc 07; retirar a regra o restaura. Realtime, sons e notificações não mudam.

## D-2026-10-30-178 — Barra inferior no celular, com + para lançar pedido

**Pedido (Marcelo):** no celular, o painel deve favorecer o lançamento de pedidos:
sair o menu ☰ e entrar uma barra com botão + central. Desktop sem mudança.

**Decisão (aprovada em 30/10/2026):**
1. Abaixo de `lg`, barra fixa: Início, Pedidos (com contador de abertos em tempo
   real), + (novo pedido), Entregas e Mais. O menu ☰ foi removido.
2. "Mais" abre uma folha com os demais módulos e o tema. Módulo sem permissão
   aparece nela com cadeado; o + exige `orders.create_manual`.
3. A barra some em `/admin/pedidos/novo` e `/admin/pdv`, que têm rodapé próprio.
4. Anotações e sino seguem no topo, porque têm contador e painel próprios.

## D-2026-10-30-179 — Atalhos sempre visíveis e clicáveis, também em Pedidos

**Pedido (Marcelo):** atalhos do PDV sempre à vista e também em Pedidos, para
lançar por lá.

**Decisão (aprovada em 30/10/2026; 09 §4.5 alterado):**
1. **PDV:** a faixa vira botões, presa sob o cabeçalho, em todos os aparelhos. O
   atalho que não vale no momento fica apagado, sem sumir. A ação vem da mesma
   tabela do teclado (`decidirAtalho`). No celular ficam F2, F3, F4, F7 e F9, porque
   setas e Esc pedem teclado, e `+`, `−` e `Del` têm botão na linha do carrinho.
2. **Pedidos:** faixa com F2 (novo pedido, no lugar do botão do cabeçalho), F4
   (reforço) e F9 (sangria), por tecla ou clique. Só aparece o que a pessoa pode
   (`orders.create_manual`, `cash.adjust`); com o caixa fechado, F4 e F9 ficam
   apagados. A janela e a ação são as do PDV (`movimentarCaixa`).

---

## D-2026-10-31-180 — Diebold IM433T imprime direto pela porta USB virtual

**Contexto.** A Diebold cortava nas laterais pelo Chrome, mas o app da 99 imprime
certo no mesmo notebook e sem janela. A auditoria achou duas causas:
`@page { size: 80mm auto }` é inválido, e o Chromium descartava a regra (provado
em PDF: saiu em Carta), deixando o tamanho por conta do driver; e as margens e a
régua de 13/10 só compensavam o sintoma. O modo Bluetooth também não servia: no
conjunto de comandos IM4X3T, `ESC d` liga a altura dupla e `ESC t 3` escolhe CP437.

**Decisão (pedido do Marcelo, 31/10/2026).** Novo caminho "Diebold pela porta
USB" em Configurações → Impressora: Web Serial na porta virtual, sem driver, sem
janela e sem SDK. O documento vai como imagem de 576 pontos (`ESC k`, 72 bytes por
linha), seguido de avanço de pelo menos 20 mm (`ESC J`) e corte (`ESC w`),
conforme o Manual do Firmware I4X.51.01.PD5.XX, seção 7.2. A letra segue as 42
colunas de `COLUNAS["80"]`. Os outros caminhos continuam iguais, e a aba passa a
recolher ajustes finos e o passo a passo do atalho.

**Onde foi formalizada:** `src/ui/impressao/diebold.ts`, `rasterizar.ts`,
`serial.ts` e `SecaoImpressora.tsx`.

