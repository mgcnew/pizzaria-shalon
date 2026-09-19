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

---

### D-2026-09-19-49 — Loja fechada bloqueia o CHECKOUT, não o balcão

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
| **A-14** | **Criação de usuários internos pela interface** — hoje depende de SQL. A tela de gestão de equipe é da Fase 8; até lá, novos acessos são criados manualmente | Fase 8 | `05-PLANO-IMPLEMENTACAO.md` §12.3 |
| ~~A-16~~ | ~~Ranking "Mais pedidos"~~ | — | ✅ Resolvida em D-2026-09-19-44: `mais_pedidos`, 30 dias móveis, concluídos, por quantidade, meio a meio por fração |
| ~~A-17~~ | ~~Busca pública sem acento e sem caixa~~ | — | ✅ Resolvida em D-2026-09-19-28: `unaccent` + filtrar antes de precificar; sem índice, por medição |
| **A-15** | **Política de senha, MFA e recuperação** do Supabase Auth — não configuradas; a V1 usa o padrão do projeto | Fase 10 (hardening) | `03-RLS-RBAC-SEGURANCA.md` §25 |

---

# Como registrar uma nova decisão

1. A decisão é tomada e confirmada pelo responsável pelo produto.
2. O documento normativo pertinente é atualizado **primeiro** (`CLAUDE.md` §1).
3. Uma entrada é acrescentada aqui, em ordem cronológica, com: identificador `D-AAAA-MM-DD-NN`, decisão, motivo, onde foi formalizada e impacto no design.
4. Se a decisão supera regra anterior, o texto antigo **não é apagado**: recebe marcador de supersessão apontando para a regra vigente.
5. Decisões que deixam de estar em aberto saem da tabela acima e viram entrada datada.
