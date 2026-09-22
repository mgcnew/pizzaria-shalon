# 03 — RLS, RBAC e Segurança | Pizzaria Shalon

**Versão:** 1.0  
**Status:** Especificação arquitetural — não implementar ainda  
**Fontes de verdade:** `01-DOCUMENTO-MESTRE.md` V2, `02-MODELO-DADOS-SUPABASE.md`

> Este documento define as fronteiras de acesso do sistema, a estratégia de autenticação, autorização, RLS, operações públicas controladas, auditoria e proteção de dados sensíveis. Ele **não é um conjunto de policies SQL pronto** e ainda não autoriza o Claude Code a implementar o banco. A implementação deve ocorrer somente após a consolidação das regras de negócio e do plano de implementação.

---

## 1. Objetivo de segurança

A segurança da V1 deve obedecer a quatro camadas complementares:

1. **Interface:** esconde ações que o usuário não pode executar, apenas por experiência de uso.
2. **Aplicação/domínio:** valida regras de negócio, estados e permissões antes de executar operações.
3. **PostgreSQL/RLS:** impede leitura ou mutação indevida mesmo que alguém contorne a interface.
4. **Operações privilegiadas/transacionais:** ações críticas passam por funções/RPCs ou backend controlado, sem entregar autoridade ao navegador.

**Regra central:** esconder botão não é segurança. Toda ação sensível precisa ser protegida no servidor/banco.

---

# 2. Identidades do sistema

## 2.1 Cliente público

O cliente do cardápio **não usa Supabase Auth** na V1.

Ele pode:

- consultar somente dados públicos necessários ao cardápio;
- manter carrinho e favoritos localmente;
- criar pedido por uma operação pública controlada;
- acompanhar um pedido usando token imprevisível específico daquele pedido;
- acessar “Meus pedidos/Histórico” no mesmo navegador por credencial local segura associada aos pedidos públicos.

O cliente público **não pode**:

- consultar diretamente tabelas administrativas;
- consultar clientes pelo número de WhatsApp;
- listar pedidos de terceiros;
- informar preços confiáveis ao backend;
- escolher livremente status de pedido;
- marcar pagamento como confirmado;
- aprovar taxa manual;
- alterar dados históricos do pedido.

## 2.2 Funcionário

`employees` representa a pessoa na operação. Pode existir sem login.

Exemplos:

- motoboy cadastrado sem acesso ao sistema;
- funcionário com consumo registrado, mas sem login;
- proprietário que também possui usuário autenticado.

## 2.3 Usuário interno autenticado

Usuários internos usam **Supabase Auth** e possuem vínculo 1:1, quando aplicável, com `app_users`/perfil interno.

O usuário autenticado recebe permissões por função/cargo, nunca por confiar em dados enviados pelo frontend.

## 2.4 Service Role

A chave `service_role`:

- nunca aparece no frontend;
- nunca é armazenada em código cliente;
- somente pode existir em ambiente de servidor seguro;
- deve ser usada apenas quando uma operação realmente precisa ignorar RLS;
- não substitui desenho correto de autorização.

---

# 3. Modelo RBAC

## 3.1 Entidades

O modelo deve usar conceitualmente:

- `roles`
- `permissions`
- `role_permissions`
- `app_users`
- vínculo do usuário com uma função/cargo

A V1 inicia pelo menos com:

- **Dono/Admin**
- **Atendente/Balconista**

O Dono/Admin pode criar funções personalizadas, como Gerente.

## 3.2 Permissões semânticas

Permissões devem representar capacidade de negócio, não nomes de telas.

Padrão recomendado:

`<dominio>.<acao>`

Exemplos:

- `orders.view`
- `orders.create_manual`
- `orders.accept`
- `orders.confirm_pix`
- `orders.request_change`
- `orders.cancel`
- `orders.override_delivery_fee`
- `orders.reprint`
- `payments.register` — registrar o pagamento efetivamente recebido
- `cash.view`
- `cash.open`
- `cash.close`
- `cash.adjust`
- `cash.reopen`
- `cash.bypass_session` — a exceção de RN-CAIXA-003: registrar recebimento
  sem sessão de caixa aberta
- `catalog.view`
- `catalog.manage`
- `customers.view`
- `customers.block`
- `remarketing.view`
- `remarketing.contact`
- `finance.view`
- `finance.create`
- `finance.reverse`
- `employees.view`
- `employees.manage`
- `employees.finance.view`
- `employees.finance.manage`
- `deliveries.view`
- `deliveries.manage`
- `reports.view`
- `reports.export`
- `settings.view`
- `settings.manage`
- `roles.manage`
- `audit.view`

A lista final será congelada antes das migrations.

## 3.3 Ações separadas

Sempre que houver risco diferente, separar:

- visualizar;
- criar;
- editar;
- aceitar/aprovar;
- cancelar/rejeitar;
- estornar;
- administrar.

Não usar uma permissão genérica `manage_all` para simplificar o sistema.

## 3.4 Princípio do menor privilégio

Atendente recebe apenas o necessário para a rotina. Por padrão, não deve poder:

- ver salário;
- ver saldo financeiro completo de funcionários;
- alterar funções/permissões;
- reabrir caixa fechado;
- alterar configurações críticas sem autorização;
- apagar auditoria;
- confirmar ações administrativas reservadas.

---

# 4. Funções auxiliares de autorização no banco

As policies não devem repetir consultas complexas em dezenas de lugares. Criar funções SQL estáveis e cuidadosamente revisadas, como conceitualmente:

- `current_app_user_id()`
- `is_internal_user()`
- `has_permission(permission_code text)`
- `is_owner_or_admin()` quando realmente necessário

Regras:

- funções usadas por RLS devem ter `search_path` seguro;
- `SECURITY DEFINER` somente quando necessário e revisado;
- não aceitar `user_id` arbitrário do cliente como prova de identidade;
- identidade interna deriva de `auth.uid()`.

---

# 5. Estratégia RLS geral

## 5.1 Regra padrão

**RLS habilitado em toda tabela exposta pelo Supabase API que contenha dados de negócio.**

Política inicial mental:

> negar tudo → abrir explicitamente somente o necessário.

## 5.2 Público

Evitar policies públicas de `INSERT/UPDATE/DELETE` diretamente nas tabelas centrais de pedido.

O público deve preferencialmente consumir:

- views públicas restritas; ou
- funções/RPCs específicas; ou
- endpoint/server action controlado.

## 5.3 Interno

Acesso interno exige simultaneamente:

- sessão autenticada válida;
- usuário interno ativo;
- permissão correspondente;
- regra de domínio válida.

## 5.4 Inativo/desligado

Se um funcionário/usuário for desligado:

- histórico permanece;
- login/acesso é revogado;
- RLS deve negar novas operações mesmo que uma sessão antiga ainda exista, conforme mecanismo adotado.

---

# 6. Matriz de acesso por domínio

| Domínio | Público | Atendente padrão | Dono/Admin | Proteção principal |
|---|---|---|---|---|
| Configuração pública da loja | leitura mínima | leitura | gestão | view/RLS + auditoria |
| Catálogo público | leitura somente do publicável | leitura | gestão | view pública + RLS |
| Pedidos | criação controlada + token próprio | operação conforme permissão | gestão | RPC/domain + RLS |
| Pagamentos | nenhuma confirmação | registro operacional permitido | gestão | RLS + operação transacional |
| Pix antecipado | instruções públicas quando habilitado | confirmar se autorizado | confirmar | permissão + auditoria |
| Clientes | sem listagem | acesso operacional | gestão | RLS |
| Caixa | nenhum | abrir/operar/fechar conforme permissão | gestão/reabertura | RLS + RPC |
| Financeiro | nenhum | mínimo autorizado | gestão | RLS forte |
| Funcionários | nenhum | dados operacionais mínimos | gestão | RLS |
| Salários/financeiro funcionário | nenhum | **negado por padrão** | autorizado | RLS separado |
| Entregas/motoboys | tracking público limitado | operação | gestão | RLS |
| Remarketing | nenhum | conforme permissão/consentimento | gestão | RLS |
| Relatórios | nenhum | conforme permissão | acesso | views/RPC |
| Auditoria | nenhum | normalmente sem acesso amplo | leitura autorizada | append-only |
| Storage privado | token/URL assinada quando aplicável | conforme permissão | conforme permissão | bucket privado |

---

# 7. Loja e configurações

## 7.1 Dados públicos permitidos

Uma view/DTO pública pode expor somente o necessário, por exemplo:

- nome da loja;
- identidade visual pública;
- endereço público para retirada;
- WhatsApp público;
- aberto/fechado;
- horários;
- estimativas atuais;
- mínimo de entrega;
- métodos de pagamento ativos;
- faixas necessárias ao checkout sem revelar configuração interna desnecessária.

Não expor:

- IDs internos sem necessidade;
- histórico de alterações;
- usuário que alterou configuração;
- chaves/segredos de APIs;
- dados administrativos.

## 7.2 Configurações críticas

Alterações em:

- horários;
- fechamento temporário;
- endereço/geolocalização da loja;
- faixas de entrega;
- raio de aprovação automática;
- pedido mínimo;
- chave/instruções Pix;
- formas de pagamento;
- estimativas;
- parâmetros de alerta

exigem `settings.manage` e geram auditoria com antes/depois.

Segredos de Google/API jamais devem ser armazenados em tabela pública acessível ao cliente.

---

# 8. Catálogo público

## 8.1 Leitura pública

O cliente pode ler somente entidades que sejam publicáveis segundo regras de negócio:

- categorias ativas;
- produtos ativos;
- variações relevantes;
- tamanhos;
- bordas/adicionais permitidos;
- promoções vigentes;
- combos;
- banners válidos.

Produtos temporariamente indisponíveis podem continuar visíveis como “Indisponível hoje”, conforme regra funcional.

## 8.2 Não confiar no catálogo lido pelo cliente

Mesmo que o cliente tenha acabado de receber preço R$ X, o pedido deve recalcular no servidor:

- preço atual;
- promoção vigente;
- meio a meio;
- disponibilidade;
- compatibilidade de tamanho;
- borda;
- adicionais;
- limites de quantidade;
- combo/componentes.

O payload público informa **intenção de compra**, não total confiável.

## 8.3 Escrita

Somente usuários com `catalog.manage` alteram catálogo.

Inativação/indisponibilidade deve preservar histórico. Registros referenciados por pedidos não devem ser apagados fisicamente.

---

# 9. Criação pública de pedidos

## 9.1 Proibição de INSERT ingênuo

Não conceder ao papel `anon` permissão para inserir livremente em:

- `orders`;
- `order_items`;
- `order_item_components`;
- `payments`;
- snapshots financeiros.

## 9.2 Operação controlada

Criar pedido deve ser uma única operação de domínio transacional, via RPC/backend seguro.

Entrada pública pode conter:

- identificadores dos produtos escolhidos;
- configurações escolhidas;
- quantidades;
- observações;
- dados do cliente;
- endereço selecionado;
- método de pagamento pretendido;
- troco;
- consentimento de marketing;
- credencial local de dispositivo quando aplicável.

O servidor deve:

1. verificar loja aberta;
2. verificar cliente bloqueado quando identificável;
3. revalidar catálogo e quantidades;
4. recalcular todos os preços;
5. recalcular promoção;
6. validar meio a meio pelo maior preço efetivo;
7. validar combo/componentes;
8. validar mínimo de entrega;
9. validar/geocodificar endereço conforme fluxo;
10. calcular rota e taxa por provedor confiável;
11. determinar se entrega exige aprovação;
12. validar pagamento/bandeira;
13. criar snapshots;
14. gerar número humano do pedido;
15. gerar token de tracking imprevisível;
16. criar estado inicial correto;
17. registrar consentimento quando aplicável;
18. confirmar tudo atomicamente.

Se houver divergência comercial em relação ao carrinho, retornar dados para confirmação do cliente em vez de aceitar silenciosamente.

## 9.3 Prova de origem servidor → banco

A operação de §9.2 é `SECURITY DEFINER`, porque §9.1 proíbe dar INSERT a
`anon`. Isso a deixa acessível em `/rest/v1/rpc`. E o passo 10 — rota e taxa
por provedor confiável — não pode acontecer dentro do banco: o provedor é
chamado pelo servidor da aplicação.

Portanto a distância entra como PARÂMETRO. Para que isso não vire uma porta
aberta, a função exige um **segredo de origem**, guardado em
`server_secrets`, conhecido apenas pelo servidor. Sem ele, a chamada é
recusada sem revelar por quê.

Vale para `cotar_entrega` e `origem_da_loja`.

Para `criar_pedido` existe uma **segunda prova de legitimidade**, e só ela:
uma sessão interna com `orders.create_manual`, que é o lançamento manual do
balcão (§9.2 continua valendo — a operação é a mesma, transacional e única).
Quem não apresenta nenhuma das duas provas recebe a mesma recusa genérica.

A origem (`source`) é escolhida por quem lança: o cliente público é sempre
`shalon_link`; só o lançamento interno seleciona entre os canais previstos.
Sem essa separação, bastaria declarar-se "balcão" para tentar escapar de
alguma regra.

**Este segredo NÃO é `service_role`** e não concede acesso a nada. Ele
responde a uma única pergunta: "esta chamada partiu do nosso servidor?".
Todo o resto — RLS, revalidação, recálculo de preço — continua valendo
integralmente. Ele não é substituto de nenhuma dessas verificações.

**Regras de operação:**

- o valor nasce aleatório em migration e nunca é versionado;
- a leitura administrativa (`ler_segredo_do_servidor`) exige `settings.manage`;
- `server_secrets` tem RLS habilitado e **nenhuma policy**: nenhum papel o lê
  por consulta;
- o segredo não aparece em log, nem em mensagem de erro ao cliente.

## 9.4 Projeções públicas do checkout

Além das projeções de catálogo, o cliente público enxerga apenas:

| Função | Quem executa | O que devolve |
|---|---|---|
| `formas_pagamento_publicas(modalidade)` | `anon` | formas ativas da modalidade e suas bandeiras. Sem `code` interno. Pix por chave só aparece quando habilitado |
| `pedido_por_token(token)` | `anon` | §10: um pedido, só os dados públicos dele |
| `pix_para_pagamento(token)` | `anon` | chave Pix, e somente para um pedido que está aguardando Pix |
| `origem_da_loja(segredo)` | servidor (§9.3) | coordenada configurada da loja e raio automático |
| `cotar_entrega(km, segredo)` | servidor (§9.3) | taxa da faixa correspondente, pela mesma regra da criação |

Coordenada da loja não é dado de cardápio: ela sai por §9.3, não por projeção
pública.

---

# 10. Tracking público

## 10.1 Token

Cada pedido público recebe token:

- criptograficamente imprevisível;
- não sequencial;
- independente do número humano do pedido;
- com índice/representação segura conforme implementação.

Conhecer `#1052` jamais deve permitir consultar o pedido.

## 10.2 Dados expostos

Tracking expõe somente o necessário ao cliente daquele pedido:

- número;
- status público;
- itens/resumo apropriado;
- total;
- entrega/retirada;
- estimativa snapshot;
- motivo público de rejeição/cancelamento quando aplicável;
- proposta de alteração pendente;
- ações permitidas ao cliente.

Não expor:

- notas internas;
- auditoria interna;
- dados de funcionário;
- dados financeiros internos;
- outros pedidos do mesmo cliente.

## 10.3 Ações via tracking

Ações como:

- aceitar alteração proposta;
- solicitar cancelamento

passam por operações específicas que validam token + estado atual + regras de transição.

Nunca permitir `UPDATE orders SET status = ...` pelo cliente.

---

# 11. “Meus pedidos” e histórico público

A credencial local persistente do navegador deve ser imprevisível e tratada como credencial, não como ID público previsível.

Ela pode autorizar apenas o conjunto de pedidos associado àquele dispositivo/identidade pública conforme modelo final.

**Proibido:** permitir recuperação de todo histórico apenas digitando nome ou WhatsApp.

Favoritos permanecem locais na V1 e não precisam de RLS.

---

# 12. Clientes

## 12.1 Público

Não existe endpoint público de busca de cliente por telefone.

O frontend não pode fazer algo como:

`select * from customers where whatsapp = ...`

Reconhecimento de retorno deve ocorrer por credencial local segura e operação controlada.

## 12.2 Interno

`customers.view` permite consulta operacional conforme necessidade.

`customers.block` controla bloqueio/desbloqueio.

Motivo de bloqueio é **interno** e nunca deve ser retornado ao cliente.

## 12.3 Consentimento

Consentimento promocional deve possuir histórico suficiente para demonstrar estado e alterações.

Comunicação operacional do pedido é separada de marketing.

Remarketing promocional só inclui clientes elegíveis segundo consentimento vigente.

---

# 13. Máquina de estados de pedidos

## 13.1 Regra

Status não é campo livre editável.

Cada transição deve validar:

- estado atual;
- estado desejado;
- tipo entrega/retirada;
- situação de pagamento quando relevante;
- aprovação de entrega quando relevante;
- alteração pendente;
- permissão do usuário;
- motivo obrigatório quando aplicável.

## 13.2 Exemplos de estados conceituais

- recebido / aguardando confirmação;
- aguardando confirmação do Pix;
- aguardando aprovação da entrega;
- alteração necessária — aguardando cliente;
- confirmado/aceito;
- em produção;
- pronto para retirada;
- pronto para entrega;
- saiu para entrega;
- entrega não realizada;
- retirado/concluído;
- entregue/concluído;
- rejeitado;
- cancelado.

A enumeração final deve ser congelada no documento de regras de negócio.

## 13.3 Operações privilegiadas

Aceite, rejeição, cancelamento, alteração pós-envio e transições críticas devem passar por função de domínio/RPC, não por update genérico.

---

# 14. Pix e pagamentos

## 14.1 Intenção x pagamento real

Guardar separadamente:

- método previsto pelo cliente;
- bandeira prevista;
- método efetivamente recebido;
- bandeira efetiva;
- status de pagamento;
- quem confirmou;
- quando confirmou.

## 14.2 Pix na maquininha

É pagamento presencial. Selecionar Pix na maquininha não significa “pago”.

## 14.3 Pix por chave

Só aparece se configurado e habilitado.

O sistema mostra os dados configurados; comprovante é enviado pelo WhatsApp na V1.

O pedido fica em **aguardando confirmação do Pix** e não vai para produção até confirmação manual autorizada.

Confirmar Pix exige permissão apropriada e auditoria.

## 14.4 Pagamento dividido

Checkout público: uma forma prevista.

Administrativo: arquitetura permite múltiplos pagamentos efetivos quando a operação presencial exigir.

## 14.5 Troco

O servidor valida que `cash_tendered_amount`/“troco para” seja coerente com o total. Troco calculado é derivado, não confiado ao frontend.

---

# 15. Entrega e cálculo de rota

## 15.1 Autoridade

Distância e taxa nunca são informadas livremente pelo cliente.

Backend chama camada de geocodificação/rotas e aplica as faixas cadastradas.

## 15.2 Regras

- distância por rota viária;
- origem = coordenada validada da loja;
- dentro do raio automático → fluxo normal;
- acima do raio automático e dentro da última faixa → requer aprovação;
- além da última faixa → checkout bloqueado;
- taxa R$0 somente se uma regra explícita realmente permitir, nunca por falha de cálculo.

## 15.3 Snapshot

Pedido guarda:

- endereço textual;
- ponto geográfico usado;
- distância de rota;
- taxa calculada/aplicada;
- provedor/metadados necessários;
- necessidade e decisão de aprovação.

## 15.4 Override manual

Alterar taxa manualmente exige permissão específica, motivo e auditoria.

Se mudar o total após o cliente enviar, exige aprovação do cliente antes de prosseguir.

---

# 16. Caixa

## 16.1 Sessão

Abertura e fechamento devem ocorrer por operações transacionais.

Abrir caixa registra:

- usuário;
- data/hora real;
- data operacional;
- fundo inicial, inclusive R$0.

Virada da meia-noite não fecha nem cria sessão automaticamente.

## 16.2 Acesso

Atendente pode receber permissões para:

- abrir;
- registrar movimentos operacionais;
- fechar.

Reabrir/corrigir caixa fechado exige `cash.reopen` ou equivalente, normalmente Dono/Admin.

**Registrar o pagamento recebido** é movimento operacional e usa
`payments.register` — concedida ao Atendente por padrão, porque é ele quem
confirma o recebimento na retirada e no retorno do motoboy (01 §79.18).

**Estornar pagamento** NÃO tem permissão própria: usa `finance.reverse`,
porque estornar pagamento é estornar movimentação financeira (§17.2). Uma
permissão a mais para o mesmo ato só criaria a chance de alguém ter uma e
não a outra.

**Operar sem caixa aberto** é a exceção de RN-CAIXA-003 e exige
`cash.bypass_session`, deliberadamente fora do Atendente padrão: se ele a
tivesse, a exigência de caixa aberto deixaria de existir na prática. A
exceção é registrada em auditoria com ação própria
(`caixa_excecao_sem_sessao`), nunca como fallback silencioso.

## 16.3 Movimentos

Sangria, suprimento, despesa e demais movimentos devem ser append-oriented. Evitar editar valores históricos silenciosamente.

## 16.4 Fechamento

Fechamento calcula saldo esperado no servidor.

Usuário informa valor contado; sistema calcula diferença.

Diferença exige justificativa, mas não gera desconto salarial automático.

Pendências de motoboy não impedem fechamento, mas devem ser destacadas e não podem ser tratadas como dinheiro já recebido no caixa.

---

# 17. Financeiro

## 17.1 Separação de conceitos

Não misturar:

- venda;
- entrada financeira avulsa;
- despesa;
- sangria;
- suprimento;
- cortesia;
- consumo interno;
- perda/descarte.

## 17.2 Estorno

Movimentação confirmada não é apagada. Correção ocorre por estorno/reversão autorizada + novo lançamento correto.

Estorno exige permissão, motivo e auditoria.

## 17.3 Relatórios

RLS deve impedir que usuário sem `finance.view` obtenha dados financeiros por consultas alternativas, views ou endpoints de relatório.

Exportação exige `reports.export` e respeita também permissões sobre dados sensíveis.

---

# 18. Funcionários e dados sensíveis

## 18.1 Separação física recomendada

Dados financeiros sensíveis de funcionário devem ficar em tabelas separadas das informações operacionais comuns.

Exemplo conceitual:

- `employees` → nome, função operacional, ativo etc.
- `employee_financial_profiles` → salário de referência e dados financeiros sensíveis.
- `employee_ledger_entries` → adiantamentos, consumos, ocorrências financeiras autorizadas.

## 18.2 Atendente

Pode registrar consumo/ocorrência se possuir permissão, mas isso **não concede leitura de salário ou saldo financeiro completo**.

## 18.3 Dono/Admin

Acesso financeiro de funcionários depende de permissão explícita, não apenas do fato de estar autenticado.

## 18.4 Desligamento

Não apagar funcionário com histórico. Marcar inativo e revogar acesso.

---

# 19. Motoboys e saídas de entrega

## 19.1 Sem login na V1

Motoboy pode ser `employee` sem `app_user`.

## 19.2 Saída

Criar saída de entrega deve vincular atomicamente:

- motoboy;
- pedidos elegíveis;
- horário;
- valores esperados por forma de pagamento.

Pedido passa para “Saiu para entrega” por operação de domínio.

## 19.3 Acerto

Acerto registra:

- pedidos concluídos;
- não entregues;
- pagamentos efetivos;
- valor esperado;
- valor devolvido;
- diferença;
- justificativa/anexo quando aplicável.

Diferença não gera desconto salarial automático.

---

# 20. Cortesia, consumo e perda

Essas operações devem ser explicitamente classificadas para não inflar receita.

### Cortesia

- motivo obrigatório;
- autorizador;
- produtos/quantidades;
- não contabiliza como venda normal.

### Consumo de funcionário

- vínculo com funcionário;
- valor de referência;
- comprovante/assinatura/foto quando usado;
- não contabiliza como faturamento;
- eventual efeito financeiro é lançamento separado.

### Consumo do proprietário

Classificação própria, fora de faturamento.

### Perda/descarte

Produto, quantidade, motivo, responsável e observação. Sem baixa quantitativa de ingredientes na V1.

---

# 21. Remarketing

Acesso exige permissões específicas.

A consulta de clientes recuperáveis deve respeitar consentimento promocional vigente.

Registrar:

- tentativa;
- responsável;
- data/hora;
- template/referência quando necessário;
- resultado;
- eventual compra posterior como “voltou a comprar após o contato”, sem atribuição causal automática.

Se cliente pedir para não receber promoções, atualizar consentimento e removê-lo das sugestões promocionais futuras.

---

# 22. Auditoria

## 22.1 `audit_logs`

Auditoria deve ser **append-only para usuários comuns**.

Campos conceituais:

- `id`
- `actor_user_id`
- `actor_employee_id` quando útil
- `action`
- `entity_type`
- `entity_id`
- `before_data jsonb nullable`
- `after_data jsonb nullable`
- `reason nullable`
- `metadata jsonb nullable`
- `created_at`

## 22.2 Eventos obrigatórios

Auditar pelo menos:

- aceite/rejeição/cancelamento;
- alteração de pedido;
- override de taxa;
- confirmação Pix;
- alteração de pagamento efetivo;
- abertura/fechamento/reabertura de caixa;
- diferenças e ajustes;
- sangria/suprimento;
- estorno financeiro;
- alterações de salário/dados financeiros sensíveis;
- adiantamentos;
- mudanças de função/permissão;
- bloqueio/desbloqueio de cliente;
- configurações críticas;
- reimpressão/comanda de alteração;
- acerto de motoboy.

## 22.3 Proteção

Usuário comum não pode atualizar/deletar auditoria. Mesmo Dono/Admin não deve ter uma ação de UI para “limpar logs”.

---

# 23. Storage

## 23.1 Buckets públicos

Imagens comerciais que realmente precisam ser públicas podem usar bucket público ou estratégia equivalente:

- produtos;
- combos;
- banners;
- identidade pública.

Upload/replace/delete continua restrito a usuário autorizado.

## 23.2 Buckets privados

Devem ser privados:

- comprovantes internos;
- anexos financeiros;
- fotos de consumo assinadas;
- documentos de funcionários;
- evidências de acertos/ocorrências.

Acesso via URL assinada curta ou endpoint autorizado.

**Implementado na Fase 7 — bucket `comprovantes`.** Privado, sem policy para
`anon` em nenhum comando. Leitura exige `finance.view`; escrita e remoção
exigem `finance.create`. Tipos aceitos: JPEG, PNG, WebP e PDF; limite de
5 MB. Imagem passa pelo pipeline que descarta metadados — foto de comprovante
costuma trazer localização junto. PDF **não** é reprocessado: alterar o
binário seria alterar a evidência; ele é validado pela assinatura `%PDF-`.

A URL assinada dura dois minutos: o suficiente para abrir o arquivo, e pouco
para sobreviver a um link copiado para fora.

**Metadado de comprovante também é dado financeiro.** As policies de
`media_assets` passaram a depender do `asset_type`: `financial_receipt`
responde a `finance.view`/`finance.create`; os demais continuam em
`catalog.view`/`catalog.manage`. Sem isso, quem tem acesso ao catálogo
enxergaria nome de arquivo, caminho e autor de um comprovante financeiro.

## 23.3 Path

Não usar nome de arquivo fornecido pelo usuário como autoridade. Gerar caminhos controlados e validar tipo/tamanho.

## 23.4 Substituição de imagem

Sequência segura:

1. validar/processar nova imagem;
2. salvar novo objeto;
3. atualizar referência no banco;
4. confirmar transação lógica;
5. remover objeto antigo se não houver outra referência.

---

# 24. Imagens e uploads

Antes do armazenamento final de imagens comerciais:

- validar MIME real;
- limitar tamanho;
- redimensionar quando necessário;
- comprimir;
- converter para formato web eficiente quando apropriado;
- remover metadados desnecessários quando possível.

Nunca armazenar Base64 de imagem em colunas de negócio.

Anexos privados devem ter limites e tipos permitidos definidos antes da implementação.

---

# 25. Proteção contra abuso público

A ausência de login no cardápio não significa ausência de controles.

Implementar no backend/edge conforme arquitetura final:

- rate limiting para criação de pedidos;
- rate limiting para tracking/token;
- proteção contra enumeração;
- validação de tamanho de payload;
- limites de quantidade;
- normalização/validação de strings;
- proteção contra spam de pedidos;
- logs técnicos de falhas relevantes.

Não introduzir CAPTCHA automaticamente na experiência normal. Usar somente se abuso real justificar.

---

# 26. Concorrência e transações

Operações que precisam ser atômicas:

- criação do pedido + itens + snapshots + estado inicial;
- aceite/rejeição/cancelamento;
- aprovação de alteração;
- confirmação Pix;
- abertura/fechamento/reabertura de caixa;
- estorno financeiro;
- criação/fechamento de saída de motoboy;
- acerto de entrega;
- alterações críticas que dependam de estado atual.

Usar locking/controle de concorrência quando necessário para impedir, por exemplo:

- pedido aceito e rejeitado simultaneamente;
- caixa fechado duas vezes;
- mesma entrega em duas saídas ativas;
- promoção conflitante criada em corrida;
- alteração aprovada depois de o pedido já ter sido cancelado.

---

# 27. Views e relatórios

Views administrativas não podem virar atalho para furar RLS.

Para relatórios sensíveis:

- preferir views com `security_invoker` quando aplicável; ou
- funções que verifiquem permissões explicitamente.

Relatórios de produto, cliente, caixa, financeiro, funcionário e entrega devem respeitar as mesmas fronteiras do dado original.

---

# 28. Segurança de dados históricos

Pedidos devem preservar snapshots. Portanto, o usuário autorizado pode alterar cadastros atuais sem reescrever:

- nome/endereço histórico do cliente no pedido;
- preço cobrado;
- taxa de entrega;
- distância;
- promoção aplicada;
- descrição comercial do item;
- pagamento previsto/real registrado naquele momento;
- estimativa mostrada ao cliente.

RLS e operações de domínio devem impedir updates genéricos nesses snapshots após consolidação do pedido, salvo correção formal auditada prevista nas regras.

---

# 29. Exclusão física

### Não excluir fisicamente quando houver histórico

- produtos/variações referenciados;
- categorias referenciadas;
- funcionários;
- clientes;
- métodos/bandeiras usados;
- pedidos;
- pagamentos;
- caixas;
- movimentos financeiros;
- entregas;
- auditoria.

Usar `active`, `status`, `disabled_at`, `archived_at` ou mecanismo equivalente conforme entidade.

Exclusão física fica reservada a dados sem referência e objetos órfãos de Storage, seguindo regras seguras.

---

# 30. Segredos e variáveis de ambiente

Nunca colocar no repositório/frontend:

- Supabase service role;
- segredo de assinatura;
- chaves privadas de APIs;
- credenciais Google Maps/Routes que exijam segredo de servidor;
- tokens administrativos.

Chaves públicas que tecnicamente precisem estar no navegador devem ter restrições adequadas de domínio/API e não podem conceder privilégios administrativos.

---

# 31. Logs e privacidade

Evitar registrar desnecessariamente em logs técnicos:

- telefone completo;
- endereço completo;
- chave Pix;
- dados financeiros de funcionário;
- tokens de tracking;
- credenciais locais de histórico.

Logs de aplicação devem usar IDs internos e dados minimizados sempre que possível.

---

# 32. Matriz inicial de permissões

A matriz abaixo é referência inicial; será congelada antes da implementação.

| Ação | Dono/Admin | Atendente padrão |
|---|:---:|:---:|
| Ver pedidos | ✓ | ✓ |
| Criar pedido manual | ✓ | ✓ |
| Aceitar pedido | ✓ | ✓ |
| Solicitar alteração | ✓ | ✓ |
| Rejeitar/cancelar | ✓ | conforme permissão |
| Override taxa entrega | ✓ | não por padrão |
| Reimprimir comanda | ✓ | ✓ |
| Registrar pagamento recebido | ✓ | ✓ |
| Abrir caixa | ✓ | ✓ |
| Fechar caixa | ✓ | ✓ |
| Reabrir caixa fechado | ✓ | ✗ |
| Registrar recebimento sem caixa aberto | ✓ | ✗ |
| Sangria/suprimento | ✓ | conforme permissão |
| Registrar despesa | ✓ | conforme permissão |
| Estornar financeiro | ✓ | ✗ por padrão |
| Gerenciar catálogo | ✓ | conforme permissão |
| Pausar disponibilidade | ✓ | ✓ se autorizado |
| Ver clientes | ✓ | ✓ |
| Bloquear cliente | ✓ | ✗ por padrão |
| Remarketing | ✓ | conforme permissão |
| Gerenciar entregas | ✓ | ✓ |
| Fazer acerto motoboy | ✓ | ✓ se autorizado |
| Registrar consumo funcionário | ✓ | ✓ |
| Ver salário | ✓ | ✗ |
| Ver financeiro completo funcionário | ✓ | ✗ |
| Registrar adiantamento | ✓ | ✗ por padrão |
| Gerenciar funcionários | ✓ | conforme permissão |
| Gerenciar cargos/permissões | ✓ | ✗ |
| Ver relatórios | ✓ | conforme permissão |
| Exportar relatórios | ✓ | conforme permissão |
| Configurações críticas | ✓ | ✗ por padrão |
| Ver auditoria ampla | ✓ | ✗ por padrão |

**Importante:** “Dono/Admin” não deve ser hardcoded em cada policy. Policies preferem permissões semânticas. O cargo inicial apenas recebe o conjunto apropriado.

---

# 33. Políticas por grupo de tabelas

## 33.1 `store_settings`, horários, entrega, pagamentos

- público: SELECT somente via projeção pública segura;
- interno: SELECT com usuário ativo;
- UPDATE: `settings.manage`;
- DELETE: negar.

## 33.2 catálogo

- público: SELECT somente publicável;
- interno: SELECT conforme acesso;
- INSERT/UPDATE: `catalog.manage`;
- DELETE físico: negar quando houver referência.

## 33.3 clientes/endereço

- público: sem SELECT direto;
- operações públicas via função controlada;
- interno: `customers.view`;
- bloqueio: `customers.block`.

## 33.4 pedidos/itens/snapshots

- público: sem SELECT/INSERT/UPDATE direto; usar operações controladas/token;
- interno SELECT: `orders.view`;
- criação manual: `orders.create_manual`;
- transições: permissões específicas;
- DELETE: negar.

## 33.5 pagamentos

- público: sem escrita direta;
- interno: leitura ligada a `orders.view`/financeiro conforme detalhe;
- confirmação/alteração: permissão operacional específica;
- DELETE: negar.

## 33.6 caixa

- público: negar tudo;
- interno: ações por permissões de caixa;
- operações críticas via RPC;
- DELETE: negar.

## 33.7 financeiro

- público: negar tudo;
- SELECT: `finance.view`;
- INSERT: `finance.create`;
- reversão: `finance.reverse`;
- UPDATE/DELETE destrutivo: negar.

## 33.8 funcionários

- público: negar;
- dados operacionais: `employees.view`;
- gestão: `employees.manage`;
- financeiro sensível: permissões próprias.

## 33.9 entregas

- público: somente estado apropriado via tracking do próprio pedido;
- interno: `deliveries.view/manage`;
- acerto: operação transacional.

## 33.10 remarketing

- público: negar;
- SELECT: `remarketing.view`;
- registrar contato: `remarketing.contact`;
- consulta deve filtrar consentimento promocional.

## 33.11 auditoria

- público: negar;
- leitura: `audit.view`;
- insert: funções/triggers controlados;
- update/delete: negar para usuários comuns.

---

# 34. Testes obrigatórios de segurança

Antes de liberar produção, testar pelo menos:

1. usuário anônimo não lista clientes;
2. usuário anônimo não lista pedidos;
3. número do pedido não dá acesso ao tracking;
4. token de um pedido não abre outro;
5. cliente não consegue alterar preço no payload;
6. cliente não consegue forçar promoção expirada;
7. cliente não consegue marcar pedido como pago;
8. cliente não consegue forçar taxa de entrega R$0;
9. cliente não consegue finalizar além da distância máxima;
10. atendente não vê salário;
11. atendente não vê financeiro sensível via API mesmo escondido na UI;
12. atendente sem permissão não reabre caixa;
13. usuário desligado perde acesso;
14. funcionário sem login não autentica;
15. cancelamento exige estado/permissão/motivo corretos;
16. Pix só é confirmado por usuário autorizado;
17. pedido aguardando Pix não entra em produção;
18. alteração de taxa que muda total exige aceite do cliente;
19. movimento financeiro não pode ser apagado;
20. auditoria não pode ser editada/apagada por usuário comum;
21. bucket privado não entrega arquivo por URL pública permanente;
22. comprovante de funcionário não é acessível a usuário sem permissão;
23. relatório não vaza dados que a tabela original protegeria;
24. exportação respeita permissão;
25. `service_role` não existe no bundle frontend;
26. duas ações concorrentes não conseguem fechar o mesmo caixa duas vezes;
27. pedido não entra simultaneamente em duas saídas de motoboy incompatíveis;
28. produto inativado no carrinho não pode ser comprado via requisição manual;
29. cliente bloqueado recebe mensagem neutra, sem motivo interno;
30. busca por WhatsApp não permite enumeração pública de clientes.

---

# 35. Anti-patterns proibidos

Claude Code **não deve**:

- desligar RLS para “fazer funcionar”;
- usar `service_role` no navegador;
- criar policy `USING (true)` em tabelas sensíveis;
- confiar em role/cargo enviado pelo frontend;
- confiar em total/preço enviado pelo carrinho;
- permitir update genérico de status;
- expor tabela `customers` ao `anon`;
- recuperar histórico só por telefone;
- guardar tracking token previsível;
- guardar comprovantes sensíveis em bucket público;
- permitir delete de financeiro/auditoria;
- misturar funcionário e `auth.users` como se fossem a mesma entidade;
- hardcodar “admin” em toda policy quando uma permissão semântica resolve;
- colocar segredo de API em `store_settings` legível pelo público;
- implementar multitenancy não solicitado.

---

# 36. Ordem recomendada para implementação de segurança

Quando a implementação for autorizada:

1. criar entidades de Auth/perfil/funcionário;
2. criar roles/permissões;
3. criar funções auxiliares de autorização;
4. habilitar RLS imediatamente nas tabelas;
5. aplicar policies por domínio;
6. criar views públicas mínimas;
7. criar operações transacionais públicas de pedido;
8. criar máquina de estados protegida;
9. criar políticas de Storage;
10. criar auditoria;
11. criar testes automatizados de autorização;
12. somente então conectar telas reais aos dados.

Não deixar RLS “para o final”.

---

# 37. Decisões que o próximo documento deve congelar

O documento `04-REGRAS-NEGOCIO.md` deverá transformar em invariantes explícitos, entre outros:

- enumeração final dos status de pedido;
- transições permitidas e seus atores;
- precedência entre Pix, aprovação de entrega e aceite do pedido;
- momento exato de reconhecimento financeiro de cada pagamento;
- regras de conclusão/cancelamento;
- cálculo formal de meio a meio;
- promoção e limites por pedido;
- disponibilidade derivada de combos;
- cálculo de entrega;
- sessão operacional de caixa;
- acerto de motoboy;
- alteração pós-impressão;
- elegibilidade de remarketing.

---

# 38. Critério de aprovação deste documento

A segurança estará suficientemente especificada para iniciar migrations somente quando conseguirmos responder, para cada operação crítica:

> **Quem está executando? Qual permissão possui? Qual estado atual permite a ação? Que dados pode ler? Que dados pode alterar? A operação é auditada? O banco impediria a ação se o frontend fosse contornado?**

Se qualquer uma dessas respostas depender apenas da interface, a regra ainda não está segura.

---

# 39. Instrução para Claude Code

> **NÃO IMPLEMENTAR AINDA.** Este documento é especificação arquitetural. Não criar migrations, policies, funções, triggers ou código de autenticação até que `04-REGRAS-NEGOCIO.md`, `05-PLANO-IMPLEMENTACAO.md` e o `CLAUDE.md` estejam consolidados e a implementação seja explicitamente autorizada.

Quando autorizado, preservar o frontend aprovado como referência visual oficial e adaptar a camada de dados a ele sem redesenhar a experiência.
