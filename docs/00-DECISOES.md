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
| **A-05** | **Contratação e integração do Google Maps Platform** — o provedor foi decidido em D-2026-09-18-20; falta contratar, guardar a chave fora do repositório e integrar. A regra continua agnóstica ao fornecedor | Fase 5 | `01-DOCUMENTO-MESTRE.md` §79.2 · `03-RLS-RBAC-SEGURANCA.md` §7.2 |
| **A-06** | **Adaptações visuais de C1–C8** — telas que o design aprovado não possui. As cinco da Fase 3 estão registradas em D-2026-09-18-22; as demais seguem fase a fase | Fases 4 a 8 | A propor fase a fase, com aprovação prévia |
| **A-07** | **Dados reais da Shalon** — preços, sabores, combos, horários, faixas de distância, chave Pix, endereço definitivo | Fase 11 (seed de produção) | `01-DOCUMENTO-MESTRE.md` §78 |
| **A-08** | **Impressão 58 mm** — viabilidade técnica real do Bluetooth pelo navegador | Fase 6 | Requer prova de conceito com o equipamento |
| ~~A-09~~ | ~~Identidade Git~~ | — | ✅ Resolvida em D-2026-09-17-10: Marcelo <mgc.info.new@gmail.com>, apenas local |
| ~~A-10~~ | ~~Criação do remoto e primeiro `push`~~ | — | ✅ Resolvida em D-2026-09-18-19: `github.com/mgcnew/pizzaria-shalon`, privado |
| **A-11** | **Projeto Supabase de PRODUÇÃO** e separação dev/prod — o de desenvolvimento existe (D-2026-09-18-15); falta o de produção e a gestão de segredos dele | Fase 11 | `05-PLANO-IMPLEMENTACAO.md` §15 |
| **A-14** | **Criação de usuários internos pela interface** — hoje depende de SQL. A tela de gestão de equipe é da Fase 8; até lá, novos acessos são criados manualmente | Fase 8 | `05-PLANO-IMPLEMENTACAO.md` §12.3 |
| **A-16** | **Ranking "Mais pedidos"** — RN-POP-001 a RN-POP-004 dependem de pedidos concluídos, que não existem antes da Fase 5. O `is_featured` (destaque manual) já está implementado e é independente | Fase 8 | `02-MODELO-DADOS-SUPABASE.md` §6.3 |
| **A-17** | **Busca pública sem acento e sem caixa** — 02 §22 recomenda avaliar `unaccent` + `pg_trgm` com consulta real para medir, o que só existe com cardápio populado | Fase 4 | `02-MODELO-DADOS-SUPABASE.md` §22 |
| **A-15** | **Política de senha, MFA e recuperação** do Supabase Auth — não configuradas; a V1 usa o padrão do projeto | Fase 10 (hardening) | `03-RLS-RBAC-SEGURANCA.md` §25 |

---

# Como registrar uma nova decisão

1. A decisão é tomada e confirmada pelo responsável pelo produto.
2. O documento normativo pertinente é atualizado **primeiro** (`CLAUDE.md` §1).
3. Uma entrada é acrescentada aqui, em ordem cronológica, com: identificador `D-AAAA-MM-DD-NN`, decisão, motivo, onde foi formalizada e impacto no design.
4. Se a decisão supera regra anterior, o texto antigo **não é apagado**: recebe marcador de supersessão apontando para a regra vigente.
5. Decisões que deixam de estar em aberto saem da tabela acima e viram entrada datada.
