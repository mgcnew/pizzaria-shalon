# 05 — PLANO DE IMPLEMENTAÇÃO
## Sistema de Gestão e Pedidos — Pizzaria Shalon

**Versão:** 1.0  
**Status:** Plano executivo da V1 — implementação ainda não iniciada  
**Documentos normativos anteriores:**
- `01-DOCUMENTO-MESTRE.md`
- `02-MODELO-DADOS-SUPABASE.md`
- `03-RLS-RBAC-SEGURANCA.md`
- `04-REGRAS-NEGOCIO.md`

---

## 1. Objetivo

Este documento define **como construir a V1**, em qual ordem, quais dependências devem existir antes de cada módulo e quais critérios precisam ser atendidos antes de avançar.

A finalidade é impedir dois erros comuns em desenvolvimento assistido por IA:

1. tentar construir o sistema inteiro de uma vez;
2. construir telas antes de consolidar domínio, segurança e persistência.

O frontend aprovado no Claude Design continua sendo a referência visual oficial. O plano abaixo trata da transformação desse design em aplicação real, sem redesenhar ou simplificar silenciosamente a experiência aprovada.

---

# 2. Regras de execução

## PI-001 — Implementação incremental
Implementar por fases pequenas, verificáveis e reversíveis.

## PI-002 — Uma fonte de verdade
Antes de cada fase, Claude Code deve ler os documentos relevantes e apontar qualquer conflito material antes de alterar código.

## PI-003 — Não reescrever o design
Preservar identidade visual, tokens, tipografia, espaçamentos, hierarquia, responsividade, navegação, estados e componentes aprovados no Claude Design.

## PI-004 — Não preservar runtime de protótipo
Não transportar mecanismos específicos do protótipo Design como `x-dc`, `support.js`, `image-slot.js`, `<sc-if>`, `<sc-for>`, `DCLogic`, painéis demonstrativos ou breakpoints calculados por JavaScript.

## PI-005 — Backend como autoridade
Preço, disponibilidade, promoções, permissões, estados, taxas, caixa e efeitos financeiros nunca dependem exclusivamente do frontend.

## PI-006 — RLS desde cedo
Não deixar segurança para o final. Tabelas sensíveis devem nascer com estratégia de RLS e permissões coerente.

## PI-007 — Sem atalhos de service role
`service_role` nunca vai para frontend e não deve ser usado para mascarar políticas mal definidas.

## PI-008 — Migrations versionadas
Toda alteração estrutural do Supabase deve existir como migration reproduzível. Não depender de mudanças manuais não documentadas no painel.

## PI-009 — Dados fictícios separados
Fixtures/seeds de desenvolvimento devem ser claramente identificados e não misturados a dados reais.

## PI-010 — Testar antes de avançar
Cada fase possui critérios de saída. Não iniciar a próxima fase com erros estruturais conhecidos na anterior.

---

# 3. Estratégia geral

A implementação será dividida em 12 fases:

1. Preparação e auditoria do projeto;
2. Fundação técnica;
3. Banco, autenticação, RBAC e auditoria;
4. Configurações da loja e catálogo;
5. Cardápio público e carrinho;
6. Checkout, entrega e criação de pedidos;
7. Operação interna de pedidos e impressão;
8. Caixa, pagamentos e financeiro;
9. Entregas, motoboys e movimentos internos;
10. Clientes, remarketing, dashboard e relatórios;
11. Hardening, testes e performance;
12. Implantação, treinamento e estabilização.

A ordem é deliberada: módulos posteriores dependem de contratos criados nas fases anteriores.

---

# FASE 0 — PREPARAÇÃO E AUDITORIA

## 4. Objetivo

Entender exatamente o que veio do Claude Design e preparar a base sem implementar regras de negócio ainda.

## 4.1 Tarefas

- inventariar arquivos do Design;
- identificar componentes reutilizáveis;
- mapear rotas/telas públicas e internas;
- extrair tokens visuais;
- identificar fixtures e dados duplicados;
- remover dependência conceitual de runtime exclusivo do Design;
- verificar versão do React e bibliotecas;
- decidir estrutura final do projeto sem alterar visual;
- confirmar variáveis de ambiente necessárias;
- criar checklist de páginas existentes versus Documento Mestre.

## 4.2 Entregável

Relatório curto de auditoria técnica contendo:
- estrutura encontrada;
- estrutura proposta;
- componentes preservados;
- elementos descartados do runtime de protótipo;
- riscos;
- divergências documentais, se houver.

## 4.3 Critério de saída

Nenhum código estrutural importante deve ser alterado até a auditoria ser aprovada.

---

# FASE 1 — FUNDAÇÃO TÉCNICA

## 5. Objetivo

Criar a infraestrutura básica sobre a qual os módulos serão implementados.

## 5.1 Estrutura

Preparar:
- roteamento público;
- roteamento administrativo;
- layouts;
- providers estritamente necessários;
- camada de acesso a dados;
- camada de domínio/serviços;
- validação de schemas;
- tratamento de erros;
- configuração de ambiente;
- cliente Supabase;
- logging seguro;
- estrutura de testes.

## 5.2 Rotas conceituais

### Público
- cardápio/início;
- produto;
- categoria;
- carrinho;
- checkout;
- confirmação;
- acompanhamento;
- meus pedidos;
- histórico;
- favoritos.

### Interno
- login;
- dashboard;
- pedidos;
- caixa;
- produtos/cardápio;
- clientes;
- remarketing;
- financeiro;
- entregas;
- funcionários/equipe;
- relatórios;
- configurações.

Os caminhos técnicos exatos podem ser definidos na implementação, desde que a experiência aprovada seja preservada.

## 5.3 Critério de saída

- projeto executa localmente;
- rotas-base funcionam;
- nenhum segredo exposto;
- lint/typecheck/testes-base funcionam;
- design continua visualmente íntegro.

---

# FASE 2 — SUPABASE, AUTH, RBAC, RLS E AUDITORIA

## 6. Objetivo

Construir a fundação persistente e de segurança antes de conectar módulos reais.

## 6.1 Ordem das migrations

A ordem detalhada deve respeitar `02-MODELO-DADOS-SUPABASE.md`, mas conceitualmente:

1. extensões/funções utilitárias necessárias;
2. perfis/usuários internos;
3. funcionários;
4. papéis;
5. permissões;
6. vínculos role/permission;
7. vínculo usuário/role;
8. configurações fundamentais;
9. tabelas-base de catálogo;
10. clientes/endereço;
11. pedidos e snapshots;
12. pagamentos;
13. caixa/financeiro;
14. entregas;
15. movimentos de funcionários;
16. remarketing;
17. auditoria;
18. storage/policies;
19. índices;
20. constraints e funções transacionais.

Não criar tudo cegamente em uma migration gigante.

## 6.2 Autenticação

- Supabase Auth somente para equipe interna;
- contas individuais;
- sem compartilhamento de login;
- funcionário pode existir sem login;
- cliente público não usa Supabase Auth administrativo.

## 6.3 RBAC

Implementar helpers/funções de autorização conforme o documento de segurança.

Validar inicialmente:
- Owner/Admin;
- Atendente;
- capacidade futura de papel customizado.

## 6.4 RLS

Ativar e testar RLS progressivamente.

Prioridade máxima:
- usuários/perfis;
- funcionários;
- dados financeiros;
- clientes;
- pedidos;
- caixa;
- anexos;
- auditoria.

## 6.5 Auditoria

Criar infraestrutura comum antes dos módulos que dependem dela.

Não espalhar formatos incompatíveis de log por cada feature.

## 6.6 Testes de segurança mínimos

- anônimo não lê dados internos;
- atendente não lê salário;
- usuário sem permissão não altera roles;
- cliente não enumera pedidos;
- tracking token só abre o pedido correspondente;
- chamadas diretas não burlam autorização;
- Storage privado não vira URL pública permanente;
- service role ausente do bundle do cliente.

## 6.7 Critério de saída

Nenhuma feature sensível é conectada ao frontend antes de Auth/RBAC/RLS fundamentais passarem nos testes.

---

# FASE 3 — CONFIGURAÇÕES E CATÁLOGO

## 7. Objetivo

Tornar o cardápio e as regras operacionais administráveis.

## 7.1 Configurações da loja

Implementar:
- identidade/dados da loja;
- endereço e coordenadas;
- horários semanais;
- fechamento temporário;
- tempos padrão entrega/retirada;
- overrides temporários;
- pedido mínimo;
- raio de aprovação automática;
- faixas de distância/taxas;
- métodos de pagamento;
- bandeiras/vouchers;
- Pix;
- limites/thresholds de alertas;
- temas e branding quando forem configurações persistentes.

## 7.2 Catálogo

Implementar na ordem:
1. categorias;
2. tamanhos;
3. produtos;
4. variações produto × tamanho;
5. bordas;
6. adicionais;
7. compatibilidades/exclusões;
8. combos;
9. componentes de combo;
10. promoções;
11. banners;
12. disponibilidade temporária;
13. destaque manual.

## 7.3 Imagens

Criar pipeline:
upload → validação → otimização → Storage → referência no banco.

Na substituição:
novo arquivo salvo → referência atualizada com sucesso → objeto antigo removido se órfão.

Nunca persistir Base64 como imagem do catálogo.

## 7.4 Regras críticas

Testar:
- tamanho indisponível;
- produto inativo;
- categoria pausada;
- borda incompatível;
- adicional incompatível;
- combo com componente indisponível;
- promoção agendada;
- promoção expirada;
- sobreposição proibida.

## 7.5 Critério de saída

Owner/Admin consegue montar um cardápio real sem alteração de código e as regras são validadas no backend.

---

# FASE 4 — CARDÁPIO PÚBLICO E CARRINHO

## 8. Objetivo

Conectar o frontend público aprovado ao catálogo real.

## 8.1 Preservar experiência visual

Manter:
- logo/saudação;
- estado aberto/fechado;
- busca;
- hero/banner;
- categorias horizontais;
- Mais pedidos;
- combos;
- promoções;
- cards;
- estados indisponíveis;
- hamburger com Meus pedidos, Histórico e Favoritos;
- ausência de navegação inferior persistente;
- CTA de carrinho somente quando aplicável.

## 8.2 Busca

Implementar busca por:
- nome;
- descrição;
- categoria;
- tamanhos oferecidos;
- normalização de acento/caixa.

## 8.3 Personalização de pizza

Fluxo:
produto → tamanho → sabores permitidos → borda → adicionais → observação → quantidade.

O frontend pode calcular prévia, mas backend permanece autoridade.

## 8.4 Meio a meio

Criar função de domínio única para:
- elegibilidade;
- compatibilidade de tamanho;
- disponibilidade;
- preço efetivo;
- promoção;
- limite.

Evitar duplicar lógica em componentes diferentes.

## 8.5 Carrinho

Implementar:
- persistência local;
- TTL 24h;
- agrupamento por configuração idêntica;
- restauração;
- invalidação/correção;
- limites;
- revalidação server-side.

## 8.6 Favoritos

Persistência local sem conta e sem promessa de sincronização entre dispositivos.

## 8.7 Mais pedidos

Consulta derivada dos últimos 30 dias, pedidos concluídos, quantidade vendida e regra de 0,5 por metade.

## 8.8 Critério de saída

Cliente consegue montar corretamente todos os tipos de item e o carrinho nunca é fonte autoritativa de preço.

---

# FASE 5 — CHECKOUT, ENTREGA E CRIAÇÃO DO PEDIDO

## 9. Objetivo

Completar o primeiro ciclo público real.

## 9.1 Identificação

Implementar:
- nome;
- WhatsApp;
- reconhecimento seguro do mesmo dispositivo;
- múltiplos endereços;
- endereço preferencial;
- consentimento de marketing separado.

## 9.2 Entrega/retirada

Primeiro selecionar modalidade.

### Retirada
- sem taxa;
- sem geocodificação;
- mostrar endereço da loja;
- mostrar estimativa de retirada.

### Entrega
- validar endereço;
- geocodificar;
- permitir ajuste no mapa em ambiguidade;
- calcular rota;
- aplicar faixa;
- determinar aprovação automática/manual;
- bloquear além do máximo.

## 9.3 Abstração do provedor de rota

Google pode ser o primeiro provedor, mas regra de domínio não deve depender de nomes/campos específicos dele.

Criar contrato interno para:
- geocodificação;
- distância de rota;
- resultado/erro;
- confiança;
- coordenadas.

## 9.4 Pagamento

Implementar:
- dinheiro/troco;
- débito;
- crédito;
- voucher;
- Pix na maquininha;
- Pix antecipado se configurado.

Separar seleção esperada de recebimento real.

## 9.5 Revalidação final

Antes de inserir o pedido:
1. revalidar carrinho;
2. recalcular preços;
3. validar promoções;
4. validar entrega;
5. validar pagamento;
6. validar pedido mínimo;
7. mostrar diferenças;
8. exigir aceite quando necessário;
9. criar pedido de forma transacional.

## 9.6 Snapshots

Persistir todos os dados necessários para que o pedido continue historicamente correto mesmo após mudanças no cadastro.

## 9.7 Tracking

Gerar token imprevisível e individual.

## 9.8 Critério de saída

Ciclo obrigatório:

cliente monta → escolhe entrega/retirada → sistema calcula → escolhe pagamento → revisa → servidor revalida → pedido é criado → cliente recebe acompanhamento seguro.

---

# FASE 6 — OPERAÇÃO DE PEDIDOS E IMPRESSÃO

## 10. Objetivo

Permitir que a equipe opere pedidos reais.

## 10.1 Fila

Implementar estados e alertas para:
- Pix;
- aprovação de entrega;
- confirmação;
- alteração;
- produção;
- retirada;
- entrega;
- rejeição/cancelamento.

## 10.2 Máquina de estados

Não usar dropdown genérico capaz de gravar qualquer status.

Criar comandos de domínio como:
- confirmar Pix;
- aprovar entrega;
- rejeitar entrega;
- aceitar pedido;
- solicitar alteração;
- aprovar alteração;
- iniciar produção;
- marcar pronto;
- vincular saída;
- concluir;
- registrar falha;
- rejeitar;
- cancelar.

Cada comando valida:
estado atual + permissão + pré-condições + efeitos + auditoria.

## 10.3 Alteração

Implementar histórico/revisões e aprovação pública quando itens/total forem modificados.

## 10.4 Pedidos manuais

Permitir origem:
- WhatsApp;
- telefone;
- balcão;
- iFood;
- outro.

Usar o mesmo domínio comercial, sem criar “pedido livre” desconectado do modelo.

## 10.5 Impressão 58 mm

Primeiro implementar representação imprimível estável; depois validar comunicação real com o equipamento disponível.

Comanda só após aceite.

Reimpressão auditada.

Alteração após impressão gera documento **ALTERAÇÃO**.

## 10.6 Critério de saída

A equipe consegue receber, aceitar, imprimir, produzir, alterar, rejeitar/cancelar e concluir pedidos sem manipular estado diretamente no banco.

---

# FASE 7 — CAIXA, PAGAMENTOS E FINANCEIRO

## 11. Objetivo

Conectar venda real ao controle operacional financeiro.

## 11.1 Caixa

Implementar:
- abertura;
- fundo inicial;
- sessão atravessando meia-noite;
- sangria;
- reforço;
- despesa paga pelo caixa;
- esperado;
- contagem;
- diferença;
- justificativa;
- fechamento;
- reabertura/correção excepcional;
- alerta de caixa antigo.

## 11.2 Pagamentos reais

No momento operacional adequado, registrar:
- método efetivamente recebido;
- valor;
- eventuais divisões internas;
- responsável;
- horário.

Não reescrever a escolha original do cliente.

## 11.3 Financeiro

Implementar:
- categorias;
- entradas;
- despesas;
- comprovantes;
- estorno/reversão;
- vínculo com caixa quando aplicável.

## 11.4 Critério de saída

É possível reconstruir por que o caixa esperado possui determinado valor e rastrear cada diferença/reversão.

---

# FASE 8 — ENTREGAS, MOTOBOYS E MOVIMENTOS INTERNOS

## 12. Objetivo

Fechar o ciclo operacional fora do balcão.

## 12.1 Saída de entrega

Implementar:
- selecionar motoboy;
- agrupar pedidos;
- registrar saída;
- calcular esperado por método;
- colocar pedidos em “Saiu para entrega”.

## 12.2 Retorno

Registrar:
- entregas realizadas;
- falhas;
- valores recebidos;
- diferenças;
- justificativas;
- anexos;
- responsável.

## 12.3 Funcionários

Implementar:
- cadastro;
- status ativo/inativo;
- vínculo opcional com Auth;
- cargo/papel;
- dados sensíveis separados.

## 12.4 Movimentos internos

Implementar:
- consumo de funcionário;
- consumo do proprietário;
- cortesia;
- perda/descarte;
- adiantamento;
- demais lançamentos autorizados.

Não transformar esses movimentos em vendas.

## 12.5 Critério de saída

Pedido de entrega pode ser rastreado do aceite até motoboy, recebimento e acerto, sem dinheiro “sumir” entre entrega e caixa.

---

# FASE 9 — CRM, REMARKETING, DASHBOARD E RELATÓRIOS

## 13. Objetivo

Transformar os dados operacionais em informação gerencial.

## 13.1 Clientes

Implementar:
- histórico;
- pedidos;
- endereços;
- recorrência;
- bloqueio/desbloqueio;
- consentimento;
- indicadores.

## 13.2 Remarketing

Implementar:
- cálculo/sugestão de ausência;
- frequência individual quando houver dados suficientes;
- filtros 15/30/60/90;
- templates;
- deep link WhatsApp;
- registro de tentativa;
- resultado;
- exclusão de promoções quando cliente não quiser contato.

Sem disparo automático V1.

## 13.3 Dashboard

Priorizar fila de atenção:
- pedido pendente;
- Pix;
- alteração;
- aprovação de entrega;
- caixa antigo;
- saída sem acerto;
- divergências.

Indicadores gerenciais entram sem competir com urgências operacionais.

## 13.4 Relatórios

Implementar consultas por período:
- receita registrada;
- pedidos;
- ticket médio;
- produtos;
- categorias;
- combos;
- origem;
- pagamentos;
- cancelamentos/rejeições;
- recorrência;
- clientes inativos;
- dias de maior/menor movimento;
- entregas/acertos;
- movimentos internos relevantes.

## 13.5 Exportações

CSV/Excel e PDF conforme escopo, filtros e permissões.

## 13.6 Critério de saída

Os indicadores devem ser derivados dos registros reais e reconciliáveis com pedidos/financeiro; não criar métricas fictícias ou chamar saldo operacional de lucro.

---

# FASE 10 — HARDENING, TESTES E PERFORMANCE

## 14. Objetivo

Tratar a V1 como sistema operacional real, não apenas demonstração funcional.

## 14.1 Testes de domínio

Automatizar prioritariamente:
- meio a meio;
- promoções;
- limites;
- combos;
- entrega;
- revalidação;
- máquina de estados;
- alterações;
- Pix;
- caixa;
- conciliação.

## 14.2 Testes de RLS/RBAC

Executar matriz positiva e negativa:
- usuário autorizado consegue;
- usuário não autorizado é bloqueado;
- chamada direta também é bloqueada.

## 14.3 Testes E2E

Cobrir os cenários do `04-REGRAS-NEGOCIO.md`, priorizando o ciclo completo do pedido.

## 14.4 Concorrência

Testar:
- dois atendentes aceitando o mesmo pedido;
- promoção expirando durante checkout;
- produto indisponibilizado durante carrinho;
- dois fechamentos do mesmo caixa;
- dois acertos da mesma saída;
- dupla confirmação/reversão.

## 14.5 Performance

Avaliar:
- carregamento inicial mobile;
- imagens;
- queries N+1;
- índices;
- paginação;
- relatórios pesados;
- realtime;
- bundle;
- cache seguro.

## 14.6 Acessibilidade

Validar:
- contraste;
- foco;
- teclado;
- labels;
- alvos de toque;
- feedback sem depender apenas de cor;
- leitores de tela onde aplicável.

## 14.7 Critério de saída

Nenhuma vulnerabilidade crítica conhecida, nenhum cenário central quebrado e performance adequada ao uso mobile real.

---

# FASE 11 — IMPLANTAÇÃO E ESTABILIZAÇÃO

## 15. Preparação

- projeto Supabase de produção;
- variáveis de produção;
- Vercel;
- domínio se contratado;
- configuração de Storage;
- chaves de API de rota/geocodificação;
- usuários iniciais;
- configurações reais da loja;
- cardápio real;
- métodos de pagamento;
- taxas/faixas;
- horários;
- impressora 58 mm.

## 15.1 Seed de produção

Não usar fixtures de demonstração como dados reais.

Carga inicial deve ser consciente e validada.

## 15.2 Smoke test

Antes da operação:
1. abrir loja;
2. criar pedido público real de teste;
3. calcular entrega;
4. aceitar;
5. imprimir;
6. produzir;
7. associar entrega/retirada;
8. confirmar pagamento;
9. concluir;
10. conferir caixa;
11. conferir cliente;
12. conferir relatório;
13. cancelar/estornar um pedido de teste controlado quando necessário para validar histórico.

## 15.3 Treinamento

Separar treinamento por perfil:
- Owner/Admin;
- Atendente.

Priorizar rotina real, não tour de todas as telas.

## 15.4 Estabilização

Durante o período inicial:
- bugs são registrados;
- correções não podem alterar regra de negócio silenciosamente;
- novas funcionalidades ficam separadas de correções do escopo.

---

# 16. DEPENDÊNCIAS ENTRE MÓDULOS

Fluxo principal:

```text
Fundação
  ↓
Auth + RBAC + RLS + Auditoria
  ↓
Configurações + Catálogo
  ↓
Cardápio + Carrinho
  ↓
Checkout + Entrega + Pedido
  ↓
Operação + Impressão
  ↓
Caixa + Pagamentos
  ↓
Entregas + Motoboys
  ↓
CRM + Remarketing + Relatórios
```

Não inverter dependências apenas para “mostrar uma tela funcionando”.

---

# 17. ESTRATÉGIA DE COMMITS

Preferir commits pequenos e semânticos.

Exemplos conceituais:
- `feat(auth): estrutura perfis internos`
- `feat(rbac): permissões e papéis`
- `feat(catalog): categorias e ordenação`
- `feat(pizza): variações por tamanho`
- `feat(order): criação transacional`
- `feat(cash): abertura de sessão`
- `test(order): transições inválidas`

Evitar commits gigantes como “implementa sistema”.

---

# 18. ESTRATÉGIA DE BRANCHES

Não é obrigatório adotar Git Flow complexo.

Para desenvolvimento individual assistido por IA:
- branch principal protegida/estável;
- branches curtas por fase ou feature relevante;
- merge somente após validação.

Antes de mudanças estruturais grandes, criar ponto de restauração/commit limpo.

---

# 19. DEFINITION OF DONE POR FEATURE

Uma feature só está pronta quando, quando aplicável:

- UI corresponde ao design aprovado;
- responsividade verificada;
- regra de domínio implementada;
- validação server-side existe;
- RLS/RBAC testados;
- loading/empty/error tratados;
- auditoria implementada;
- snapshots preservados;
- testes relevantes passam;
- TypeScript sem erros relevantes;
- lint passa;
- não há segredo no frontend;
- documentação foi atualizada se a regra mudou.

“Funciona clicando na minha tela” não é Definition of Done.

---

# 20. O QUE NÃO FAZER DURANTE A IMPLEMENTAÇÃO

Claude Code não deve:

1. redesenhar telas aprovadas por preferência própria;
2. remover fluxo porque parece complexo;
3. transformar cliente público em Supabase Auth sem decisão nova;
4. adicionar multitenancy;
5. implementar estoque/ficha técnica;
6. implementar KDS;
7. adicionar gateway online;
8. adicionar WhatsApp API automática;
9. criar agendamento de pedidos;
10. calcular lucro/margem sem custo;
11. substituir distância de rota por linha reta;
12. confiar em preço do frontend;
13. desligar RLS;
14. usar `service_role` no navegador;
15. permitir alteração arbitrária de status;
16. apagar histórico para corrigir erro;
17. deduzir salário automaticamente;
18. contar consumo/cortesia/perda como venda;
19. fazer migration destrutiva sem análise;
20. expandir escopo silenciosamente.

---

# 21. GATES DE APROVAÇÃO

Ao final de cada fase, Claude Code deve apresentar:

**1. O que foi implementado**  
Resumo objetivo.

**2. Arquivos/migrations principais alterados**  
Sem despejar código inteiro.

**3. Regras atendidas**  
Referenciar documentos/regras aplicáveis.

**4. Testes executados**  
Com resultado.

**5. Pendências/riscos**  
Sem esconder erro conhecido.

**6. Próxima fase proposta**  
Não iniciar automaticamente uma fase grande sem o checkpoint definido no plano.

---

# 22. PRIMEIRA ORDEM AO CLAUDE CODE

Quando chegar o momento de implementação, a primeira ordem **não** será “crie o sistema”.

Será algo equivalente a:

> Leia integralmente os documentos do projeto e audite o código/design existente. Não implemente funcionalidades ainda. Produza um relatório da estrutura atual, divergências, riscos, dependências, elementos do Claude Design que devem ser preservados e uma proposta de execução da Fase 0 do Plano de Implementação. Não altere arquivos até apresentar a análise.

O texto definitivo ficará no `CLAUDE.md`.

---

# 23. CHECKLIST PRÉ-IMPLEMENTAÇÃO

Antes da primeira alteração de código, confirmar:

- [x] `01-DOCUMENTO-MESTRE.md` presente e atualizado;
- [x] `02-MODELO-DADOS-SUPABASE.md` presente;
- [x] `03-RLS-RBAC-SEGURANCA.md` presente;
- [x] `04-REGRAS-NEGOCIO.md` presente;
- [x] `05-PLANO-IMPLEMENTACAO.md` presente;
- [x] `CLAUDE.md` presente;
- [x] frontend aprovado disponível;
- [x] código versionado em Git;
- [x] working tree limpo ou estado conhecido;
- [x] projeto Supabase correto identificado;
- [ ] ambientes dev/prod diferenciados;
- [x] segredos fora do repositório;
- [x] nenhuma documentação antiga conflitante no contexto do Claude.

---

# 24. ORDEM RECOMENDADA DE VALIDAÇÃO DO PRODUTO

A validação deve crescer em círculos:

### Círculo 1 — Domínio isolado
Regras puras: preço, promoção, disponibilidade, estados.

### Círculo 2 — Persistência e segurança
Banco, transações, RLS, permissões.

### Círculo 3 — Fluxos internos
CRUDs e operação administrativa.

### Círculo 4 — Fluxo público
Carrinho, checkout, tracking.

### Círculo 5 — Ciclo completo
Pedido → produção → pagamento → entrega → caixa → relatório.

### Círculo 6 — Exceções
Cancelamento, alteração, divergência, falha de entrega, estorno.

Não deixar exceções somente para depois do lançamento.

---

# 25. CRITÉRIO DE V1 FUNCIONAL

A V1 é funcional quando a Shalon consegue executar, com dados reais e segurança ativa:

**Cliente acessa → escolhe → personaliza → checkout → entrega/retirada → pagamento esperado → pedido recebido → aprovações necessárias → aceite → impressão → produção → retirada/saída → pagamento real → conclusão → caixa → histórico do cliente → relatórios.**

E também consegue tratar:
- rejeição;
- cancelamento;
- alteração;
- Pix pendente;
- entrega fora do raio automático;
- falha de entrega;
- diferença de caixa;
- diferença de motoboy;
- consumo interno;
- cortesia;
- perda;
- estorno.

---

# 25-A. DÍVIDA DE VALIDAÇÃO PARA PRODUÇÃO

Nem toda pendência bloqueia a fase seguinte. Existe código escrito, revisado e
coberto por teste automatizado que ainda não foi exercitado contra o mundo
real — uma API de terceiro, um equipamento físico, os dados verdadeiros da
Shalon.

Essas pendências ficam em `06-PENDENCIAS-VALIDACAO-PRODUCAO.md`, com situação
atual, passos de configuração e roteiro de validação. Elas **não impedem**
avançar nas fases; **impedem liberar para produção**.

Nenhuma delas pode ser dada por resolvida sem execução real registrada
naquele documento.

---

# 26. PRÓXIMO PASSO

Após este plano, criar o arquivo raiz:

`CLAUDE.md`

Ele será o **manual operacional do Claude Code**: ordem de leitura, limites de autonomia, comandos proibidos, workflow, critérios de checkpoint, padrão para migrations, segurança, testes e preservação do frontend aprovado.

**Ainda não iniciar a implementação antes de finalizar e revisar o `CLAUDE.md`.**
