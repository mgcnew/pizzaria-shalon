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
itens, ausência de navegação inferior, microcopy do meio a meio e da
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
| **A-20** | **Criação da conta de login do funcionário** — `/admin/equipe` vincula uma conta que **já existe** no Auth, e o sistema não a cria. Criar exigiria `service_role` (CLAUDE.md §13) e uma política de senha inicial/recuperação que não está normatizada. Falta decidir o mecanismo: convite por e-mail, criação pelo painel do Supabase, ou outro | Onboarding de novo funcionário com acesso | `03-RLS-RBAC-SEGURANCA.md` §19.7 e §25 |
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

---

# Como registrar uma nova decisão

1. A decisão é tomada e confirmada pelo responsável pelo produto.
2. O documento normativo pertinente é atualizado **primeiro** (`CLAUDE.md` §1).
3. Uma entrada é acrescentada aqui, em ordem cronológica, com: identificador `D-AAAA-MM-DD-NN`, decisão, motivo, onde foi formalizada e impacto no design.
4. Se a decisão supera regra anterior, o texto antigo **não é apagado**: recebe marcador de supersessão apontando para a regra vigente.
5. Decisões que deixam de estar em aberto saem da tabela acima e viram entrada datada.
