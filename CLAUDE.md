# CLAUDE.md
## Pizzaria Shalon — Instruções permanentes para Claude Code

**Versão:** 1.1 — reconciliação documental de 17/09/2026  
**Status:** Governança de implementação da V1  
**Aplicação:** todo trabalho realizado neste repositório  
**Idioma de comunicação do projeto:** Português do Brasil

---

# 1. SUA FUNÇÃO NESTE PROJETO

Você está trabalhando no sistema de gestão e pedidos da **Pizzaria Shalon — Tradição desde 1995**.

Sua função é implementar tecnicamente uma especificação já descoberta e aprovada.

Você **não está autorizado a redesenhar o produto, simplificar regras de negócio, ampliar escopo silenciosamente ou inventar comportamentos relevantes** para facilitar a implementação.

Quando existir ambiguidade material:

**não invente → identifique → explique o impacto → aguarde decisão → atualize a documentação apropriada → implemente somente depois.**

Decisões puramente técnicas que não alterem produto, segurança, dados, UX aprovada ou regra de negócio podem ser tomadas autonomamente, desde que sejam simples, justificáveis e reversíveis.

---

# 2. LEITURA OBRIGATÓRIA

Antes de qualquer implementação relevante, leia:

1. `docs/01-DOCUMENTO-MESTRE.md`
2. `docs/02-MODELO-DADOS-SUPABASE.md`
3. `docs/03-RLS-RBAC-SEGURANCA.md`
4. `docs/04-REGRAS-NEGOCIO.md`
5. `docs/05-PLANO-IMPLEMENTACAO.md`
6. este `CLAUDE.md`

Não trabalhe usando somente contexto de conversa.

Os documentos no repositório são a fonte persistente de verdade.

---

# 3. HIERARQUIA DOCUMENTAL

Cada documento possui função diferente:

## 3.1 Documento Mestre
`01-DOCUMENTO-MESTRE.md`

Fonte de verdade funcional do produto: visão, escopo, fluxos e decisões aprovadas.

## 3.2 Modelo de Dados
`02-MODELO-DADOS-SUPABASE.md`

Fonte de verdade para entidades, relacionamentos, snapshots e direção estrutural do banco.

## 3.3 Segurança
`03-RLS-RBAC-SEGURANCA.md`

Fonte de verdade para Auth, RBAC, RLS, Storage, exposição pública e autorização.

## 3.4 Regras de Negócio
`04-REGRAS-NEGOCIO.md`

Fonte normativa para invariantes, cálculos, estados, condições e comportamentos de domínio.

## 3.5 Plano
`05-PLANO-IMPLEMENTACAO.md`

Fonte de verdade para ordem de execução, dependências, gates e Definition of Done.

## 3.6 Este arquivo
`CLAUDE.md`

Define **como você deve trabalhar** no projeto.

---

# 4. CONFLITOS ENTRE DOCUMENTOS

Se encontrar contradição relevante:

1. não escolha silenciosamente uma versão;
2. não implemente “a que parece melhor”;
3. cite os pontos conflitantes;
4. explique o impacto técnico/funcional;
5. proponha, se útil, alternativas sem tomar decisão de negócio;
6. aguarde definição antes de implementar a parte afetada.

Uma decisão explicitamente marcada como mais recente nos documentos pode prevalecer, mas a documentação ainda deve ser reconciliada.

---

# 5. REGRA PRINCIPAL DE EXECUÇÃO

**Não tente implementar o sistema inteiro de uma vez.**

Siga as fases de `05-PLANO-IMPLEMENTACAO.md`.

Ao receber autorização para uma fase, trabalhe somente no escopo autorizado.

Não avance automaticamente para a próxima fase grande.

---

# 6. PRIMEIRA TAREFA: FASE 0

Antes de modificar a arquitetura ou implementar funcionalidades, execute a **Fase 0 — Preparação e Auditoria**.

Nesta fase:

- leia toda a documentação;
- analise a árvore do projeto;
- analise package.json e configuração;
- identifique stack e versões;
- identifique arquivos vindos do Claude Design;
- inventarie telas/componentes;
- identifique tokens visuais;
- identifique dados mockados/fixtures;
- identifique runtime específico de protótipo;
- verifique riscos técnicos;
- verifique divergências entre código/design e documentação;
- proponha estrutura técnica;
- NÃO implemente funcionalidades;
- NÃO faça migrations;
- NÃO conecte Supabase;
- NÃO refatore em massa;
- NÃO redesenhe.

Entregue relatório e aguarde aprovação.

---

# 7. FRONTEND APROVADO É REFERÊNCIA VISUAL

Os arquivos entregues pelo Claude Design representam a referência visual oficial.

Preserve, salvo decisão documentada em contrário:

- identidade da Shalon;
- design system;
- cores/tokens;
- tipografia;
- radii;
- espaçamentos;
- hierarquia visual;
- responsividade;
- componentes;
- navegação;
- microcopy relevante;
- estados de loading/empty/error;
- comportamento mobile;
- fluxos público e administrativo.

Não “modernize”, “limpe”, “simplifique” ou substitua visual por gosto próprio.

---

# 8. O QUE NÃO DEVE SER PRESERVADO DO PROTÓTIPO

Não transportar runtime específico do Claude Design apenas porque existe nos arquivos.

Exemplos já identificados:

- `x-dc`;
- `support.js`;
- `image-slot.js`;
- `<sc-if>`;
- `<sc-for>`;
- `DCLogic`;
- painéis de demonstração;
- mecanismos exclusivos de preview;
- breakpoints medidos via JavaScript quando CSS responsivo resolver;
- dados duplicados usados apenas como fixture.

Extraia a intenção visual e funcional, não o motor de prototipagem.

---

# 9. ARQUITETURA: PRINCÍPIOS

A V1 é **single-store**.

Não adicionar:
- `tenant_id`;
- organizations;
- workspaces;
- multitenancy;
- abstrações SaaS não solicitadas.

O projeto pode ser adaptado futuramente, mas a V1 não deve pagar complexidade antecipada.

Separar conceitualmente:

```text
UI
↓
Application / Use Cases
↓
Domain Rules
↓
Data Access / Supabase
↓
PostgreSQL + RLS
```

A estrutura física exata pode ser adequada ao framework, mas não concentre regra crítica em componentes React.

---

# 10. SUPABASE

Supabase será usado para:
- PostgreSQL;
- Auth da equipe interna;
- Storage;
- RLS;
- funções/RPC quando apropriado.

## 10.1 Auth

Supabase Auth é para usuários internos autorizados.

Cliente público:
- não possui login/senha na V1;
- não deve ser transformado em usuário administrativo;
- usa mecanismos públicos seguros definidos na documentação.

Funcionário e usuário autenticado são entidades distintas.

Um motoboy pode ser funcionário sem possuir login.

---

# 11. MIGRATIONS

Toda alteração estrutural deve ser reproduzível por migration versionada.

Não dependa de alterações manuais invisíveis no Dashboard do Supabase.

Antes de migration:

1. conferir modelo de dados;
2. conferir regra relacionada;
3. conferir RLS;
4. avaliar impacto em dados existentes;
5. avaliar rollback/compatibilidade.

Evite migration monolítica.

Não executar migration destrutiva sem destacar claramente o risco e receber autorização quando houver dados relevantes.

---

# 12. RLS É OBRIGATÓRIO

Não adie RLS para “depois que funcionar”.

Adote **deny by default** para dados internos/sensíveis.

Frontend esconder botão não é segurança.

Teste:
- caminho autorizado;
- caminho não autorizado;
- chamada direta;
- tentativa de acesso a outro recurso.

Nunca desligue RLS para resolver bug de permissão.

---

# 13. SERVICE ROLE

É proibido:

- expor `service_role` no frontend;
- colocá-lo em variável pública;
- incluí-lo no bundle;
- usá-lo como solução genérica para políticas difíceis.

Uso server-side excepcional deve ser mínimo, justificado e protegido.

Preferir políticas e operações transacionais corretamente modeladas.

---

# 14. PERMISSÕES

O sistema usa RBAC granular.

Perfis iniciais:
- Owner/Admin;
- Atendente.

Papéis customizados poderão existir.

Permissões devem representar ações semânticas.

Exemplos:
- visualizar;
- criar;
- editar;
- cancelar;
- estornar;
- administrar;
- exportar;
- visualizar financeiro sensível.

O nome textual do cargo **nunca** é mecanismo de autorização. A decisão de
autorizar depende exclusivamente da permissão semântica efetiva do usuário no
momento da operação (RN-RBAC-004).

`Owner/Admin` e `Atendente` são os **papéis conceituais** do sistema. Os nomes
exibidos na interface podem ser amigáveis e tornar-se configuráveis
posteriormente — por exemplo "Proprietária" e "Balconista", como no design
aprovado — sem que isso altere o mecanismo de autorização.
Decisão confirmada em 17/09/2026.

---

# 15. DADOS SENSÍVEIS DE FUNCIONÁRIOS

Atendente pode registrar operações permitidas, como consumo, sem automaticamente receber acesso a:

- salário;
- adiantamentos completos;
- saldo financeiro;
- histórico financeiro sensível;
- dados administrativos restritos.

Essa separação deve existir no backend/RLS.

---

# 16. REGRA DE PREÇOS

O frontend nunca é autoridade.

No servidor, recalcular:
- preço normal;
- promoção;
- tamanho;
- meio a meio;
- borda;
- adicionais;
- combo;
- quantidade;
- limites;
- taxa de entrega;
- total.

Não aceitar total calculado pelo navegador como verdade.

Snapshots históricos são obrigatórios.

---

# 17. MEIO A MEIO

Cada sabor de pizza é um produto comercial.

Meio a meio só pode usar sabores:
- compatíveis com o tamanho;
- ativos;
- disponíveis;
- oferecidos naquele tamanho.

O preço é o **maior preço efetivo atual** entre os sabores selecionados.

Preço efetivo considera promoção válida.

Implemente essa lógica em domínio reutilizável e valide novamente no backend.

Não duplique versões diferentes da fórmula em várias telas.

---

# 18. COMBOS

V1 usa combos fixos.

Não criar:
- escolha livre de componentes;
- substituição;
- grupos configuráveis;
- meio a meio dentro de componente fixo.

Componente obrigatório indisponível torna o combo indisponível para novo pedido.

Preço do combo é próprio.

---

# 19. PROMOÇÕES

V1 usa preço promocional simples.

Não adicionar:
- cupons;
- buy-X-get-Y;
- cashback;
- pontos;
- motor complexo de descontos.

Promoção pode ser programada.

Não permitir sobreposição proibida para o mesmo alvo.

Carrinho não reserva promoção.

---

# 20. ENTREGA

A regra da V1 é baseada em **distância real de rota viária**.

Não usar distância em linha reta como substituição.

O provedor inicial pode ser Google, mas crie uma abstração interna para não acoplar regra comercial ao fornecedor.

Existem:
- faixas configuráveis;
- raio de aprovação automática;
- distância máxima atendida.

Dentro do automático:
fluxo normal.

Acima do automático e dentro do máximo:
calcular taxa → permitir envio → exigir aprovação da Shalon.

Além do máximo:
bloquear entrega.

Nunca deixar falha de cálculo produzir taxa R$ 0,00 acidental.

---

# 21. PEDIDOS

Pedido público inicialmente é recebido, não automaticamente confirmado.

Não tratar criação como venda concluída.

Estados são controlados por máquina de estados.

Não implementar dropdown genérico que grave qualquer status.

Use comandos/operações de domínio.

Exemplos:
- `confirmPix`
- `approveDelivery`
- `acceptOrder`
- `requestChange`
- `approveChange`
- `startProduction`
- `markReady`
- `dispatchOrder`
- `completeOrder`
- `rejectOrder`
- `cancelOrder`

Os nomes técnicos podem variar.

O princípio não.

---

# 22. ALTERAÇÃO DE PEDIDO

Pedido enviado não é objeto livremente editável.

Mudanças devem preservar histórico.

Se alteração após envio modificar itens ou total:
- registrar proposta;
- mostrar diferenças;
- exigir aceite do cliente;
- somente depois prosseguir.

Não sobrescrever silenciosamente o pedido original.

---

# 23. PIX

Distinguir:

### Pix na maquininha
Pagamento físico operacional.

### Pix antecipado por chave
Só aparece quando configurado.

Pedido com Pix antecipado:
- não é considerado pago por seleção;
- aguarda confirmação manual;
- não vai à produção antes dessa confirmação;
- registra quem confirmou e quando.

Não implementar conciliação automática de Pix na V1.

---

# 24. PAGAMENTO ESPERADO ≠ PAGAMENTO REAL

Preservar:
- método escolhido/esperado pelo cliente;
- método efetivamente recebido.

Relatórios financeiros usam o realizado.

Não sobrescrever a intenção original para “corrigir” histórico.

---

# 25. CAIXA

Sessão de caixa é operacional.

Pode:
- começar em um dia;
- terminar depois da meia-noite.

Meia-noite:
- não fecha;
- não cria;
- não troca caixa.

Somente uma sessão ativa por ponto de caixa.

Fundo inicial pode ser zero.

Distinguir:
- sangria;
- reforço;
- despesa.

Diferença no fechamento exige justificativa.

Correção posterior preserva histórico.

---

# 26. MOTOBOYS E DINHEIRO NA RUA

V1 possui “Saída de entrega”.

Uma saída:
- associa motoboy;
- agrupa pedidos;
- registra horário;
- calcula valores esperados por método;
- posteriormente recebe prestação de contas.

Dinheiro ainda com motoboy **não é dinheiro físico recebido no caixa**.

Diferença não gera desconto salarial automático.

---

# 27. MOVIMENTOS INTERNOS

Distinguir:

- Venda;
- Cortesia;
- Consumo de funcionário;
- Consumo do proprietário;
- Perda/Descarte.

Não contabilizar os quatro últimos como receita normal.

Não implementar estoque de ingredientes por causa desses movimentos.

---

# 28. FINANCEIRO

Movimento financeiro confirmado não é simplesmente editado/apagado para correção.

Use:
- estorno/reversão;
- motivo;
- responsável;
- timestamp;
- novo lançamento correto quando necessário.

Sem custos/CMV completos, não apresentar:
- lucro líquido;
- margem real;
- CMV real.

Use terminologia como receita registrada/saldo operacional quando adequada.

---

# 29. CLIENTES

Cliente não possui login tradicional.

WhatsApp é identificador operacional, não autorização suficiente para ler histórico.

Não implementar “digite seu WhatsApp e veja todos os pedidos”.

Meus Pedidos/Histórico usa mecanismo seguro persistente no mesmo navegador/dispositivo conforme documentação.

Cada acompanhamento individual usa token imprevisível.

---

# 30. FAVORITOS E CARRINHO

Favoritos:
- locais;
- sem sincronização V1.

Carrinho:
- local;
- TTL de 24h desde última alteração relevante;
- não reserva preço;
- não reserva promoção;
- deve ser revalidado.

Não persistir carrinho no banco sem nova decisão.

---

# 31. REMARKETING

V1 é manual/assistido.

Permitido:
- identificar cliente;
- sugerir recuperação;
- templates;
- abrir WhatsApp com mensagem preenchida;
- registrar tentativa/resultado.

Não implementar:
- disparo automático;
- campanhas em massa;
- WhatsApp API;
- afirmação causal de que contato gerou compra.

Respeitar consentimento promocional.

---

# 32. IMPRESSÃO 58 MM

A impressão é comanda/cupom **não fiscal**.

Não implementar NFC-e, NF-e, SAT, CF-e ou equivalente.

Comanda de produção:
- somente após pedido efetivamente aceito;
- não imprimir enquanto aguarda Pix/aprovação/alteração/confirmação.

Reimpressão deve ser registrada.

Alteração após impressão gera documento claramente identificado como **ALTERAÇÃO**.

---

# 33. AUDITORIA

Operações sensíveis devem registrar, conforme aplicável:

- ator;
- timestamp;
- ação;
- entidade;
- estado anterior;
- estado novo;
- motivo;
- metadados relevantes.

Auditar especialmente:
- rejeição;
- cancelamento;
- alteração;
- Pix;
- taxa manual;
- caixa;
- estorno;
- motoboy;
- permissões;
- configurações críticas;
- reimpressões.

Não permitir que usuário comum apague auditoria.

---

# 34. TRANSAÇÕES E CONCORRÊNCIA

Operações críticas devem ser atômicas.

Avalie RPC/função PostgreSQL/server action transacional conforme arquitetura.

Evite sequências frágeis do tipo:

```text
insert order
insert items
insert payment
insert audit
```

sem tratamento transacional quando falha parcial puder corromper o domínio.

Proteja contra dupla execução.

Exemplos:
- dois atendentes aceitando;
- dois fechamentos;
- dupla confirmação de Pix;
- dois acertos da mesma saída;
- duplo estorno.

---

# 35. STORAGE

Não armazenar arquivos como Base64 no banco.

Usar Storage.

Arquivos sensíveis:
- privados;
- acesso controlado;
- signed URL quando apropriado.

Na substituição de imagem:
1. salvar nova;
2. atualizar referência;
3. somente depois remover antiga se órfã.

Não deixar arquivos órfãos crescerem indefinidamente.

---

# 36. TIPAGEM E VALIDAÇÃO

Preferir TypeScript estrito.

Evitar `any` como solução rápida.

Schemas de entrada devem validar fronteiras de confiança.

Não confiar em:
- query params;
- localStorage;
- payload do cliente;
- IDs enviados;
- valores financeiros enviados;
- status enviados.

---

# 37. ERROS

Erros devem ser:
- seguros;
- úteis;
- observáveis;
- sem vazar segredo ou detalhes internos desnecessários.

UI deve possuir estados:
- loading;
- vazio;
- erro;
- sucesso;
- indisponibilidade;
- retry quando adequado.

Não deixar promise rejection ou erro de rede virar tela quebrada.

---

# 38. ACESSIBILIDADE E MOBILE

O projeto é mobile-first.

Preservar:
- alvos de toque confortáveis (~44px quando aplicável);
- contraste;
- foco;
- labels;
- teclado;
- feedback não dependente apenas de cor;
- textos alternativos.

Não sacrificar mobile para facilitar desktop.

---

# 39. PERFORMANCE

Não otimizar prematuramente ao custo de clareza, mas evite:

- N+1;
- carregar catálogo inteiro repetidamente;
- imagens originais enormes;
- subscriptions realtime desnecessárias;
- queries sem índice em filtros frequentes;
- relatórios pesados no carregamento do dashboard;
- bundle inflado sem necessidade.

Meça antes de grandes otimizações.

---

# 40. REALTIME

Use realtime somente onde traz valor operacional claro.

Exemplo provável:
- chegada/alteração de pedido na área interna.

Não transformar todo banco em subscription.

Alertas de novos pedidos devem funcionar visualmente e com som dentro do painel conforme escopo.

---

# 41. TESTES

Prioridade:

## 41.1 Unit/domain
- preços;
- meio a meio;
- promoções;
- limites;
- disponibilidade;
- estados;
- taxas.

## 41.2 Integration
- banco;
- transações;
- RLS;
- Auth;
- Storage.

## 41.3 E2E
- pedido completo;
- Pix;
- entrega;
- alteração;
- cancelamento;
- caixa;
- motoboy.

Todo bug de regra importante corrigido deve, quando viável, ganhar teste de regressão.

---

# 42. GIT

Antes de mudança grande:
- conferir `git status`;
- não sobrescrever trabalho do usuário;
- não apagar arquivos desconhecidos sem investigar;
- criar ponto de restauração adequado.

Commits devem ser pequenos e semânticos.

Não fazer commit/push remoto automaticamente sem autorização explícita se isso não tiver sido solicitado.

Nunca reescrever histórico remoto por conveniência.

---

# 43. COMANDOS DESTRUTIVOS

Não executar sem necessidade e autorização apropriada:

- reset destrutivo de banco;
- drop de tabelas com dados;
- exclusão em massa;
- limpeza indiscriminada de Storage;
- `git reset --hard` sobre trabalho existente;
- force push;
- remoção massiva de arquivos.

Sempre explique impacto antes.

---

# 44. DEPENDÊNCIAS

Não adicionar biblioteca apenas para resolver algo trivial.

Antes de nova dependência:
- verificar se já existe solução no projeto;
- avaliar manutenção;
- tamanho;
- compatibilidade;
- necessidade real.

Não atualizar todas as bibliotecas durante uma feature sem motivo.

Atualizações estruturais devem ser tratadas separadamente.

---

# 44-A. STACK DEFINIDA

**Status:** aprovada em 17/09/2026. Versões registradas ao final da Fase 1.

Esta seção registra a stack oficial do projeto.

| Camada | Decisão |
|---|---|
| Framework | **Next.js com App Router** |
| Linguagem | **TypeScript em modo strict** |
| UI | **React** |
| Backend / Banco / Auth / Storage | **Supabase** |
| Gestor de pacotes | **npm** |
| Estilização | **Tailwind CSS** |
| Deploy previsto | **Vercel** |

## 44-A.1 Versões

**Nenhuma versão está fixada nesta seção e nenhuma deve ser presumida.**

Em particular, **não assumir Next.js 15** nem qualquer outro número mencionado
durante a auditoria da Fase 0: aquilo foi proposta, não decisão.

Na preparação da Fase 1:

1. verificar as versões estáveis e **mutuamente compatíveis** disponíveis no
   momento da instalação;
2. instalar com `npm`, deixando o `package-lock.json` fixar as versões;
3. **registrar aqui as versões efetivamente adotadas**, após a instalação;
4. registrar a mesma informação em `docs/00-DECISOES.md`.

### Versões efetivamente adotadas

Instaladas e validadas na Fase 1, em 17/09/2026. Fixadas pelo
`package-lock.json`, que é versionado.

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
| @types/node | 22.20.3 |
| @types/react · @types/react-dom | 19.3.0 |

**Duas versões NÃO são a mais recente do registro, por incompatibilidade
comprovada — não por preferência:**

1. **TypeScript 6.0.3 em vez de 7.0.2.** `typescript-eslint` 8.70, embutido
   no `eslint-config-next`, recusa a API do TypeScript 7.0 com erro
   explícito. Revisar quando `typescript-eslint` suportar TS >= 7.1.
2. **ESLint 9.39.5 em vez de 10.10.0.** `eslint-plugin-react`, embutido no
   `eslint-config-next` 16, usa `context.getFilename()`, removido no
   ESLint 10. Revisar quando o `eslint-config-next` atualizar o plugin.

Ambas continuam sendo TypeScript e ESLint: nenhuma tecnologia aprovada foi
substituída. Ao atualizar qualquer uma delas, revalidar a compatibilidade
mútua e atualizar esta tabela.

## 44-A.2 Tailwind não autoriza redesign

Tailwind é **mecanismo de implementação**, não licença para redesenhar.

Continuam sendo referência visual obrigatória, conforme §7 e conforme o design
aprovado do Claude Design:

- tokens de cor (marca, superfície, texto, semânticos, tonais, CTA);
- tipografia (Bricolage Grotesque e Be Vietnam Pro) e a escala definida;
- espaçamentos;
- raios;
- temas claro/escuro e os temas de acento amarelo/vermelho;
- estados de loading, vazio, erro, indisponível e bloqueado;
- hierarquia visual, navegação, responsividade e microcopy.

Os tokens do design devem ser a **fonte** da configuração do Tailwind, e não o
contrário. Não substituir a paleta da Shalon pela paleta padrão do Tailwind, não
trocar a tipografia por utilitários genéricos e não "simplificar" espaçamentos ou
raios para valores redondos do framework.

## 44-A.3 Alteração desta seção

Alterações nesta seção exigem decisão explícita registrada, não podem ser feitas
como efeito colateral de uma feature, e devem ser refletidas em
`05-PLANO-IMPLEMENTACAO.md` §5 e em `docs/00-DECISOES.md`.

---

# 45. VARIÁVEIS DE AMBIENTE

Nunca:
- commitar segredo;
- colocar chave privada no código;
- imprimir segredo em log;
- expor variável server-side como pública.

Manter `.env.example` sem valores secretos quando necessário.

---

# 46. ESCOPO PROIBIDO NA V1

Não implementar sem nova decisão explícita:

- multitenancy;
- estoque quantitativo;
- ficha técnica;
- baixa automática de ingrediente;
- CMV real;
- margem/lucro real;
- KDS/tela do pizzaiolo;
- API oficial do WhatsApp;
- disparo automático de marketing;
- gateway de pagamento;
- conciliação automática de Pix;
- pedidos agendados;
- GPS do motoboy;
- app/login do motoboy;
- programa de fidelidade;
- cupons complexos;
- gorjeta estruturada;
- folha de pagamento.

“Deixar preparado” não significa criar infraestrutura pesada para isso agora.

---

# 47. NÃO CRIE GENERALIZAÇÕES PREMATURAS

Prefira a solução mais simples que respeite integralmente a V1.

Não criar:
- framework interno genérico;
- event bus complexo;
- microserviços;
- abstrações SaaS;
- motor universal de promoções;
- workflow engine genérico;

a menos que exista necessidade técnica demonstrável e aprovação.

---

# 48. QUANDO VOCÊ PODE DECIDIR SOZINHO

Pode decidir autonomamente detalhes como:
- nome de variável/função;
- extração de componente;
- organização interna de módulo;
- implementação equivalente de helper;
- índice evidentemente necessário;
- tratamento técnico de erro;
- testes adicionais;
- pequenas melhorias de acessibilidade;
- refatoração local sem mudança comportamental.

Desde que:
- não altere regra;
- não altere UX aprovada;
- não altere escopo;
- não reduza segurança;
- não crie dependência arquitetural desnecessária.

---

# 49. QUANDO VOCÊ DEVE PARAR E PERGUNTAR

Pare quando a decisão afetar:

- regra comercial;
- dinheiro;
- preço;
- taxa;
- status;
- permissão;
- exposição de dados;
- privacidade;
- comportamento público;
- fluxo operacional;
- escopo;
- contrato;
- exclusão de histórico;
- arquitetura estrutural não prevista;
- divergência entre documentos.

Faça uma pergunta objetiva, com contexto suficiente para decisão.

Não despeje dezenas de perguntas de uma vez.

---

# 50. FORMATO DE CHECKPOINT

Ao terminar uma fase/feature relevante, responda:

## Implementado
Resumo curto.

## Arquivos principais
Arquivos/migrations afetados.

## Regras atendidas
IDs/seções relevantes da documentação.

## Testes
Comandos executados e resultados.

## Segurança
RLS/RBAC/validações relevantes.

## Pendências ou riscos
Somente fatos reais.

## Próximo passo
Sugestão alinhada ao plano.

Não inicie automaticamente uma nova fase grande sem autorização.

---

# 51. DEFINITION OF DONE

“Pronto” significa, conforme aplicável:

- design preservado;
- mobile validado;
- regra correta;
- servidor valida;
- banco consistente;
- RLS correto;
- permissão correta;
- loading/error/empty tratados;
- auditoria presente;
- snapshots corretos;
- testes passando;
- TypeScript/lint adequados;
- sem segredo exposto;
- documentação reconciliada.

Uma tela renderizar não significa que a feature está pronta.

---

# 52. OBJETIVO FINAL DA V1

O sistema deve conseguir sustentar o ciclo real:

```text
Cliente
→ Cardápio
→ Personalização
→ Carrinho
→ Checkout
→ Entrega/Retirada
→ Pagamento esperado
→ Pedido recebido
→ Aprovações necessárias
→ Aceite
→ Comanda 58 mm
→ Produção
→ Retirada/Entrega
→ Pagamento realizado
→ Conclusão
→ Caixa
→ Cliente/Histórico
→ Relatórios
→ Inteligência operacional
```

Com tratamento correto de exceções:
- Pix pendente;
- entrega fora da área automática;
- alteração;
- rejeição;
- cancelamento;
- falha de entrega;
- diferença de motoboy;
- diferença de caixa;
- estorno;
- consumo interno;
- cortesia;
- perda.

---

# 53. COMANDO DE INÍCIO DESTE PROJETO

Ao iniciar a implementação pela primeira vez, sua primeira atividade deve ser:

> Leia integralmente `CLAUDE.md` e todos os arquivos `docs/01` a `docs/05`. Em seguida, execute somente a **Fase 0 — Preparação e Auditoria** definida em `docs/05-PLANO-IMPLEMENTACAO.md`. Analise o projeto existente e os arquivos oriundos do Claude Design. Não implemente funcionalidades, não conecte Supabase, não crie migrations e não faça refatoração em massa. Entregue um relatório contendo: estrutura atual, stack/versões, inventário das telas e componentes, elementos visuais que devem ser preservados, runtime de protótipo que deve ser removido/substituído, fixtures/dados duplicados, divergências entre código e documentação, riscos técnicos e proposta objetiva para a Fase 1. Aguarde aprovação antes de alterar a arquitetura.

---

# 54. REGRA FINAL

Quando houver pressão entre **“fazer rápido”** e **“preservar integridade do domínio”**, preserve a integridade.

Quando houver pressão entre **“facilitar a implementação”** e **“respeitar a experiência aprovada”**, respeite a experiência.

Quando houver dúvida relevante:

**não invente.**
