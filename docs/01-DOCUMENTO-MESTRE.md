Documento Mestre — Sistema de Gestão e Pedidos | Pizzaria Shalon

Versão: 2.0 — descoberta funcional consolidada
Status: Fonte de verdade funcional consolidada — pronta para arquitetura
Objetivo: consolidar as decisões funcionais, operacionais e arquiteturais definidas para orientar o Claude Design, o Claude Code e todas as etapas posteriores de desenvolvimento.

> **REGRA DE PRECEDÊNCIA DA VERSÃO 2.0** — As decisões consolidadas na seção **79. Consolidação pós-descoberta funcional (V2)** substituem qualquer regra anterior incompatível neste documento. Em especial, ficam superadas as regras antigas de entrega por bairro, sabores como entidade obrigatória separada, ausência de cálculo de rota na V1, ausência de favoritos/histórico público e a interpretação antiga de Pix. A implementação deve seguir a seção 79 em caso de conflito.

Regra do projeto: este documento deve ser tratado como a fonte de verdade. Sempre que uma decisão de negócio mudar durante o desenvolvimento, primeiro atualizamos este documento e depois refletimos a alteração no design e no código.

1. Visão do produto

O sistema da Pizzaria Shalon — Tradição desde 1995 será uma plataforma web responsiva para digitalizar o recebimento de pedidos e centralizar a gestão operacional da pizzaria.

A solução não deve ser apenas um cardápio digital. Ela deverá conectar:

Pedidos → Clientes → Caixa → Financeiro → Entregas → Funcionários → Relatórios → Remarketing → Inteligência operacional.

Atualmente, grande parte do processo depende de WhatsApp, anotações manuais, comandas em papel e conhecimento acumulado pela proprietária.

O sistema deverá transformar essas informações em dados estruturados sem tornar a operação complicada.

2. Princípios do projeto
2.1 Simplicidade operacional

A pizzaria não deverá adaptar toda a sua rotina ao software.

O sistema deve digitalizar e organizar o processo atual progressivamente.

2.2 Mobile-first

Toda a plataforma deverá funcionar adequadamente em:

smartphone;
tablet;
notebook;
desktop.

A interface será projetada inicialmente pensando no celular e adaptada para telas maiores.

2.3 Configuração em vez de hardcode

Sempre que razoável, regras que podem mudar deverão ser administráveis pelo painel.

Exemplos:

categorias;
produtos;
tamanhos;
sabores;
bordas;
adicionais;
bandeiras de cartão;
vouchers;
bairros;
taxas de entrega;
horários;
cargos;
permissões;
templates de remarketing.

Não queremos precisar alterar código porque a pizzaria começou a aceitar uma nova bandeira ou adicionou uma borda de cheddar.

> **⚠️ PARCIALMENTE SUPERADO PELA V2 — ver §79.2 e §79.27.** O item
> "cálculo de entrega por distância" desta lista **não está mais fora da V1**.
> O cálculo por rota viária passou a integrar o escopo funcional consolidado.
> Os demais itens da lista continuam vigentes. Decisão confirmada em 17/09/2026.

2.4 V1 controlada

Funcionalidades futuras deverão ser consideradas arquiteturalmente, mas não implementadas antecipadamente.

Isso é especialmente válido para:

estoque quantitativo;
ficha técnica;
KDS/tela de produção;
API do WhatsApp;
pagamento online;
cálculo de entrega por distância;
pedidos agendados;
CMV e margem real.
3. Duas experiências distintas

O produto será dividido conceitualmente em duas experiências.

3.1 Link público do cliente

Não exige autenticação tradicional.

Seu objetivo é permitir ao cliente:

entrar → escolher → personalizar → finalizar → acompanhar o pedido.

Não deverá parecer um painel administrativo.

3.2 Sistema interno

Área autenticada destinada à proprietária e funcionários autorizados.

Deverá concentrar:

Dashboard;
Pedidos;
Caixa;
Produtos/Cardápio;
Clientes;
Remarketing;
Financeiro;
Entregas;
Funcionários;
Relatórios;
Configurações.

Não haverá tela dedicada de produção na V1.

4. Identidade visual

A identidade deverá partir da marca existente da Pizzaria Shalon.

Elementos predominantes:

amarelo;
amarelo/laranja;
vermelho;
branco/creme;
tons escuros.

O sistema terá:

Modo claro e modo escuro.

Além disso, deverá suportar duas direções de identidade:

Tema Amarelo e Tema Vermelho.

A logo existente da Pizzaria Shalon será utilizada.

5. Experiência visual do cliente

A referência visual apresentada é inspirada em aplicativos modernos de alimentação, especialmente na organização visual da referência do KFC apresentada durante o planejamento.

Ela é inspiração, não deve ser copiada literalmente.

A página pública poderá possuir:

cabeçalho com identidade Shalon;
situação da loja: aberta/fechada;
pesquisa;
banner principal;
promoções;
categorias horizontais;
produtos populares;
combos;
cards de produtos;
banners promocionais;
carrinho.
Não haverá menu inferior permanente.

Quando existirem produtos no carrinho, poderá existir um CTA/barra flutuante de carrinho, pois isso não representa navegação inferior.

> **⚠️ SUPERADO EM 28/09/2026 — D-2026-09-28-85.** Não há barra flutuante de
> carrinho no rodapé. O carrinho fica no **cabeçalho público**, como ícone
> sempre visível com contador de itens (o contador só aparece com itens). Cada
> adição abre um **painel de confirmação** com o item adicionado, o total de
> itens e o subtotal visto, e duas saídas: **"Adicionar mais"** e **"Ver
> carrinho"**. Produto **sem escolhas** — sem tamanhos, e que não é pizza nem
> combo — entra no carrinho **com um toque** no "+" do card, com preço
> calculado pelo servidor como em qualquer outra adição; os demais continuam
> abrindo a página do produto (RN-LINK-001). O "+" do card fica na mesma linha
> do preço.

> **⚠️ SUPERADO PELA V2 — ver §79.3 e §79.6.** Tradicional e Brotinho **não são
> categorias**: são **tamanhos** configuráveis e reutilizáveis (§79.3, RN-PIZZA-002).
> As categorias vigentes da V1 são Pizzas Salgadas, Pizzas Doces, Fogazza, Combos
> e Bebidas (§79.6), sendo dados configuráveis e não enum estrutural.
> Decisão confirmada em 17/09/2026.

6. Cardápio inicial

Categorias inicialmente conhecidas:

Pizzas
Tradicional;
Brotinho.
Outros
Fogazzas;
Refrigerantes;
Combos.

A estrutura não deverá limitar o estabelecimento a essas categorias.

A administradora poderá criar novas categorias posteriormente.

7. Produtos e cardápio

> **Nota de reconciliação (17/09/2026) — ver §79.3.** Cada sabor comercial de pizza
> **é um produto**. O termo "sabores" na lista abaixo designa uma área de cadastro do
> painel, **não** uma entidade independente do modelo de dados. O modelo canônico está
> em `02-MODELO-DADOS-SUPABASE.md`.

O painel administrativo deverá permitir CRUD de:

produtos;
categorias;
sabores;
variações/tamanhos;
preços;
bordas;
adicionais;
combos;
promoções;
disponibilidade.

Produtos poderão possuir:

imagem;
nome;
descrição;
categoria;
preço;
variações;
adicionais;
status;
disponibilidade;
destaque;
promoção.
8. Pizza meio a meio

A pizzaria trabalha com pizza meio a meio.

Regra de preço

Quando forem selecionados dois sabores com preços diferentes:

prevalece o preço do sabor mais caro.

Exemplo:

Calabresa = R$ 40
Especial = R$ 48

Pizza meio Calabresa / meio Especial:

R$ 48

Essa regra deverá ser validada no domínio/backend e não depender exclusivamente da interface.

9. Bordas e adicionais

Inicialmente a borda conhecida é:

Catupiry.

Entretanto, a borda não será codificada como opção fixa.

O painel deverá permitir:

cadastrar borda;
definir preço;
ativar/desativar;
determinar disponibilidade;
relacioná-la aos produtos/tamanhos aplicáveis.

O mesmo princípio será utilizado para adicionais.

10. Disponibilidade operacional

Não haverá controle quantitativo completo de estoque na V1.

Entretanto, produtos e componentes relevantes poderão ser temporariamente marcados como indisponíveis.

Exemplo:

Calabresa acabou.

A balconista poderá marcar o sabor como indisponível e impedir novos pedidos que dependam daquela opção.

A estrutura deverá considerar:

disponível;
indisponível temporariamente;
ativo/inativo.

O objetivo é reduzir pedidos que posteriormente precisem ser recusados.

> **⚠️ COMPLEMENTADO PELA V2 — ver §79.12.** "Pix" desdobra-se em duas opções
> distintas: **Pix na maquininha** (pagamento presencial) e **Pix antecipado por
> chave** (só aparece se a chave estiver cadastrada e habilitada; mantém o pedido
> em "Aguardando confirmação do Pix" e impede a produção até confirmação manual
> autorizada — RN-PGTO-007 a RN-PGTO-011). O restante desta seção continua vigente.

11. Formas de pagamento

Inicialmente:

Pix;
Dinheiro;
Débito;
Crédito;
Voucher.

Não haverá gateway de pagamento online na V1.

Cartões serão pagos fisicamente utilizando a máquina levada pelo motoboy ou disponível no estabelecimento.

12. Bandeiras de cartões e vouchers

As bandeiras aceitas serão configuráveis.

O modelo deve separar:

Forma de pagamento ≠ Bandeira.

Exemplos:

Crédito → Visa

Débito → Mastercard

Voucher → Alelo

A administradora poderá:

cadastrar bandeiras;
relacioná-las aos tipos de pagamento;
ativar;
desativar.

O checkout mostrará apenas opções aceitas pela pizzaria.

Nenhuma lista crítica de bandeiras deverá depender exclusivamente de hardcode.

13. Pagamento em dinheiro e troco

Ao escolher dinheiro:

Precisa de troco?

Se não:

Não precisa.

Se sim:

Troco para quanto?

Exemplo:

Pedido: R$ 63
Cliente pagará: R$ 100

Sistema poderá calcular:

Troco esperado: R$ 37.

Essa informação deverá ficar claramente disponível no pedido e no fluxo relacionado à entrega.

14. Entrega e retirada

O cliente poderá escolher:

Entrega

Exige endereço e área/bairro atendido.

A taxa é acrescentada ao pedido.

Retirada

Não possui taxa de entrega.

O pedido deverá ser claramente identificado como:

ENTREGA

ou

RETIRADA

inclusive na comanda.

> **⚠️ SUPERADO INTEGRALMENTE PELA V2 — ver §79.2.** Esta seção descreve a regra
> antiga de **taxa por bairro/região**, mantida apenas como registro histórico da
> descoberta. A regra vigente da V1 é **distância real de rota viária**, com faixas
> configuráveis por km, raio de aprovação automática e distância máxima atendida
> (§79.2; RN-ENT-006 a RN-ENT-014). O bloco "Futuro" ao final desta seção também
> está superado: o cálculo por distância **faz parte da V1**.
> Decisão confirmada em 17/09/2026.

15. Taxa de entrega

Na V1, a taxa será definida principalmente por bairro/região.

A administradora poderá:

cadastrar bairro;
definir taxa;
ativar/desativar atendimento;
alterar valor.

Regiões não atendidas não poderão gerar acidentalmente pedidos com taxa zero.

Deverá existir possibilidade administrativa de ajuste excepcional da taxa, mantendo registro da alteração quando aplicável.

Futuro

A arquitetura deverá permitir evolução para cálculo baseado em:

distância;
geolocalização;
APIs de mapas.

Isso não faz parte da V1.

16. Horários de funcionamento

Os horários serão configuráveis.

Deverá ser possível determinar horários diferentes conforme o dia da semana e dias sem funcionamento.

Quando fechada:

o cardápio permanece visível;
o cliente pode navegar;
o checkout/finalização fica bloqueado;
mensagem clara informa que a pizzaria está fechada.
V1

Não haverá agendamento de pedidos futuros.

17. Cliente sem conta e senha

O consumidor não será obrigado a criar usuário e senha.

Dados essenciais:

nome;
WhatsApp/telefone.

Para entrega:

endereço;
número;
complemento;
bairro;
referência, quando aplicável.

O cliente poderá possuir múltiplos endereços.

18. Identificação do cliente

O telefone/WhatsApp será o principal identificador operacional para reconhecimento do consumidor.

Entretanto, o telefone não deverá ser a chave primária do banco.

Cada cliente terá identificador interno próprio.

Isso permite alteração futura do telefone sem quebrar:

pedidos;
histórico;
relatórios;
endereços;
remarketing.
19. Histórico do cliente

O sistema deverá construir automaticamente histórico a partir dos pedidos.

Poderá apresentar:

número de pedidos;
último pedido;
frequência;
ticket médio;
valor comprado;
produtos/sabores recorrentes;
endereços;
histórico cronológico;
situação de relacionamento.
20. Bloqueio de clientes

O painel administrativo poderá marcar determinado cliente como bloqueado.

O sistema deverá considerar esse estado durante novas tentativas de pedido pelo link público e aplicar tratamento adequado, sem expor informações administrativas desnecessárias ao consumidor.

21. Consentimento e remarketing

Consentimento para comunicações promocionais deverá ser tratado separadamente da realização do pedido.

Comprar na pizzaria não deverá automaticamente equivaler a consentimento irrestrito para comunicações promocionais.

22. Pedidos totalmente dentro do sistema

O WhatsApp não será responsável por transportar o pedido.

O fluxo principal será:

Cardápio Shalon → Carrinho → Checkout → Pedido salvo → Painel da pizzaria.

Isso significa que o pedido existe independentemente do WhatsApp.

23. Fluxo principal do pedido

Estado inicial:

Aguardando confirmação

O pedido público não deverá automaticamente ser considerado venda confirmada.

Fluxo conceitual:

Pedido enviado

↓

Aguardando confirmação

↓

Aceito ou Recusado

Se aceito:

Confirmado → operação/comanda → pronto → entrega/retirada → concluído

Estados adicionais poderão existir conforme necessidade técnica, mas devem respeitar a máquina de estados definida para o pedido.

24. Confirmação pela balconista

Quando chegar um pedido, a balconista poderá:

Aceitar

O pedido entra oficialmente na operação.

A partir desse momento:

pode gerar a comanda;
passa para o fluxo operacional;
poderá alimentar as movimentações financeiras conforme as regras do caixa.
Recusar

Deverá informar motivo.

Exemplos:

ingrediente indisponível;
produto indisponível;
impossibilidade de atendimento;
fora da área de entrega;
outro.

Quando “Outro” for utilizado, deverá existir justificativa.

25. Recusa ≠ cancelamento

São conceitos diferentes.

Recusado

Pedido que não chegou a ser aceito pela pizzaria.

Cancelado

Pedido que já havia sido aceito e posteriormente foi cancelado.

Essa diferença deverá permanecer nos dados e relatórios.

26. Cancelamentos e auditoria

Pedidos cancelados não serão apagados.

Todo cancelamento deverá registrar:

motivo;
usuário responsável;
data;
horário;
estágio/status em que estava;
informações necessárias para auditoria.

O mesmo princípio vale para outras operações financeiras sensíveis.

27. Indisponibilidade após o pedido

Pode ocorrer de um cliente pedir um produto que se tornou indisponível antes de a equipe atualizar o cardápio.

Nesse caso, a balconista poderá:

recusar o pedido com justificativa;
ou orientar uma alteração/substituição.

A V1 não deverá virar um sistema complexo de chat.

Quando necessário, o contato poderá continuar pelo WhatsApp.

28. Acompanhamento público do pedido

Após finalizar, o cliente deverá receber uma página de acompanhamento acessível de forma segura, sem necessidade de login tradicional.

Exemplos de estados apresentados:

Pedido recebido — aguardando confirmação.

Pedido confirmado.

Pedido pronto.

Saiu para entrega, quando aplicável.

Pedido concluído.

Se recusado, o cliente deverá receber informação adequada sobre o motivo informado pela pizzaria.

O acesso deverá utilizar mecanismo seguro e não depender simplesmente de IDs sequenciais expostos.

29. Impressão de comanda

A V1 utilizará a impressora térmica Bluetooth existente de:

58 mm.

Trata-se de impressão de comanda/recibo não fiscal.

Não faz parte do escopo:

NFC-e;
NF-e;
SAT;
CF-e;
emissão fiscal.
30. Conteúdo da comanda

A impressão deverá priorizar legibilidade operacional.

Informações importantes:

número do pedido;
data/hora;
ENTREGA ou RETIRADA;
produtos;
quantidades;
tamanho;
sabores;
meio a meio;
borda;
adicionais;
remoções;
observações;
informações relevantes de entrega;
informações necessárias de pagamento/troco.

A produção não deverá receber uma impressão poluída por informações administrativas irrelevantes.

31. Produção

Não haverá KDS/tela de produção na V1.

A proprietária não deseja essa funcionalidade neste momento.

O pizzaiolo receberá as informações pela comanda de 58 mm.

Futuro

A arquitetura poderá permitir:

Aguardando → Em produção → Pronto

com tela própria de produção.

Não implementar agora.

32. Pedidos manuais e origem

Nem todos os pedidos necessariamente virão do link público.

A balconista poderá registrar pedidos internamente.

Cada pedido deverá possuir uma origem/canal.

Exemplos:

Link próprio;
WhatsApp;
Telefone;
Balcão;
iFood;
Outro.

Isso permitirá comparar posteriormente os canais de aquisição e venda.

33. Caixa

O caixa é obrigatório na V1.

Deverá trabalhar com sessões de caixa.

Conceitos esperados:

abertura;
saldo inicial;
entradas;
vendas;
saídas;
ajustes;
fechamento;
saldo esperado;
saldo informado;
divergência;
responsável;
histórico.
34. Momento de entrada do pedido no financeiro

Pedido público em Aguardando confirmação não deve automaticamente virar receita.

Primeiro a balconista aceita.

A contabilização financeira deverá respeitar o estado real do pedido e o recebimento correspondente, evitando transformar pedidos falsos, recusados ou não pagos em faturamento.

Também deverá existir distinção entre:

forma de pagamento informada e pagamento efetivamente confirmado.

35. Financeiro

Haverá módulo de Entradas e Despesas.

Deverá permitir registrar movimentações que não sejam necessariamente vendas de pedidos.

Exemplos:

despesas operacionais;
outras entradas;
ajustes devidamente autorizados.

Movimentações deverão possuir rastreabilidade adequada.

36. Resultado financeiro da V1

A V1 poderá calcular:

faturamento;
vendas recebidas;
outras entradas;
despesas registradas;
saldo operacional registrado.

Porém, o sistema não deverá chamar esse resultado de lucro líquido real.

Ainda não teremos necessariamente:

CMV completo;
ficha técnica;
custo exato dos ingredientes;
estoque quantitativo;
todos os impostos;
todas as obrigações/custos necessários.

Portanto:

Faturamento ≠ Lucro.

37. Entregadores

Os motoboys pertencem à operação da pizzaria e, segundo o processo levantado, recebem mensalmente.

Pedidos de entrega poderão ser atribuídos a um motoboy.

O sistema deverá registrar o responsável pela entrega e permitir controle da prestação de contas.

38. Dinheiro na rua

O sistema deverá ajudar a conferir valores sob responsabilidade do motoboy.

Exemplo:

8 entregas
R$ 420 em cartão
R$ 86 esperados em dinheiro
R$ 86 devolvidos
Diferença: R$ 0

Quando houver diferença:

registrar valor;
data;
motivo;
responsável;
observação;
eventual comprovante.

Diferenças não deverão automaticamente gerar desconto salarial.

39. Funcionários

A estrutura não será limitada aos motoboys.

Todos os funcionários relevantes poderão possuir cadastro, inclusive a proprietária quando houver necessidade de registrar movimentações/consumos internos.

Isso permite controlar qualquer saída de mercadoria ou valor vinculada a pessoas da operação.

40. Lançamentos de funcionários

Cada funcionário poderá possuir histórico de lançamentos.

Exemplos:

consumo interno;
adiantamento;
diferença/acerto;
valor a conferir;
outros lançamentos autorizados.

Cada registro poderá possuir:

data;
valor;
tipo;
motivo;
observação;
responsável pelo lançamento;
comprovante/anexo;
situação.
41. Consumo de funcionário

Exemplo operacional:

Funcionário solicita uma pizza para posteriormente ser considerada em seu acerto.

A balconista poderá:

selecionar funcionário;
registrar os produtos;
calcular o valor;
gerar lançamento;
imprimir filipeta;
funcionário assina;
balconista fotografa pelo celular;
foto é anexada ao lançamento.

Isso gera histórico documental.

42. Proprietária e consumo interno

Mesmo quando a retirada/consumo for realizada pela proprietária, a saída poderá ser registrada.

Objetivo:

se saiu mercadoria, deve ser possível identificar por que saiu.

Entretanto, o sistema deverá diferenciar:

venda;
consumo interno;
movimentação de funcionário;
cortesia, quando futuramente aplicável;
perda/ajuste, quando aplicável.

Consumo interno não deve artificialmente aumentar o faturamento de clientes.

43. Folha/acerto de funcionário

O sistema poderá possuir salário mensal de referência e apresentar lançamentos vinculados ao período.

Conceitualmente:

Salário de referência

+/- lançamentos registrados

= valor previsto para conferência

O sistema deverá fornecer controle e documentação.

Não deverá assumir automaticamente que qualquer ocorrência pode legalmente ser descontada do salário.

44. Comprovantes e anexos

Determinados lançamentos poderão receber documentos/imagens.

O upload deverá funcionar adequadamente pelo celular, inclusive permitindo fotografia de comprovantes assinados.

Os arquivos deverão estar relacionados ao registro correto e sujeitos às permissões de acesso.

45. Perfis iniciais

Inicialmente teremos:

Proprietário / Administrador

Acesso administrativo completo conforme permissões.

Balconista / Atendente

Foco na operação diária.

Exemplos:

pedidos;
atendimento;
impressão;
caixa conforme autorização;
entregas;
clientes conforme autorização.
46. RBAC — permissões granulares

O sistema não deverá depender apenas de dois cargos fixos.

Deverá existir arquitetura de Role-Based Access Control.

A administradora poderá futuramente:

criar cargos;
atribuir usuários;
definir permissões.

Permissões deverão considerar operações como:

visualizar;
criar;
editar;
cancelar/estornar;
administrar.

Exemplo:

Uma balconista pode ter permissão para registrar consumo de funcionário sem possuir permissão para visualizar o salário daquele funcionário.

47. Auditoria

Ações sensíveis deverão gerar registros de auditoria.

Prioridade para:

cancelamentos;
alterações financeiras;
ajustes de caixa;
alterações de permissões;
lançamentos sensíveis de funcionários;
estornos;
operações administrativas relevantes.

O sistema deve responder, quando necessário:

Quem fez? O quê? Quando? Em qual registro?

48. Clientes para recuperação

O sistema deverá identificar clientes potencialmente inativos.

Não utilizaremos apenas uma regra simplista de “30 dias = sumido”.

A análise poderá considerar o comportamento individual.

Exemplo:

Cliente A normalmente compra a cada 7 dias e está há 25 sem comprar → comportamento anormal.

Cliente B normalmente compra a cada 30 dias e está há 25 sem comprar → pode ainda estar dentro do padrão.

49. Inteligência determinística

A inteligência inicial não dependerá de LLM ou API de IA.

Será construída com:

histórico;
estatísticas;
regras;
frequência;
médias;
tendências;
comparação temporal.

Isso reduz custo e aumenta previsibilidade.

50. Segmentação manual

Além da inteligência automática, deverá existir segmentação objetiva.

Exemplos:

15 dias sem comprar;
30 dias;
60 dias;
90 dias.

Outros filtros poderão ser combinados futuramente.

51. Remarketing V1

Na primeira versão, não haverá disparo automático pelo WhatsApp.

O sistema deverá permitir templates de mensagens.

Exemplo:

Template: Sentimos sua falta

A equipe seleciona um cliente e clica em:

Chamar no WhatsApp

O WhatsApp é aberto com a mensagem preparada para envio manual, dentro das possibilidades técnicas do dispositivo/plataforma.

52. Histórico de remarketing

Quando apropriado, o sistema deverá permitir registrar uma ação de contato.

Exemplo:

cliente;
template;
data;
funcionário;
tipo de contato;
resultado/status, quando registrado.

Isso permitirá futuramente analisar recuperação de clientes.

53. WhatsApp — evolução futura

A arquitetura poderá posteriormente integrar API oficial para:

confirmação;
status;
remarketing;
notificações;
automações autorizadas.

Não faz parte da V1.

O banco e o CRM não devem depender da API para funcionar.

54. Dashboard

O dashboard deverá ser operacional e acionável, não apenas decorativo.

Deve ajudar a responder:

Quanto vendeu hoje?
Quantos pedidos aguardam confirmação?
Qual o estado do caixa?
Qual o ticket médio?
Como os clientes estão se comportando?
Existem clientes para recuperar?
Quais produtos estão vendendo pouco?
Houve cancelamentos?
Houve recusas?
Existem divergências relevantes?
Como os canais de venda estão performando?
55. Alertas inteligentes

Exemplos de alertas:

Clientes

Clientes recorrentes estão fora de sua frequência habitual.

Produtos

Produto apresentou queda relevante nas vendas.

Operação

Número de cancelamentos acima do comportamento habitual.

Financeiro

Caixa possui divergência pendente.

Esses alertas deverão, sempre que possível, levar a uma ação ou detalhe correspondente.

56. Relatórios

A V1 deverá considerar relatórios como:

faturamento por período;
vendas por dia;
vendas por produto;
vendas por categoria;
melhores produtos;
produtos de baixa saída;
combos;
ticket médio;
pedidos por canal;
pedidos por forma de pagamento;
pedidos cancelados;
pedidos recusados;
dias de maior movimento;
dias de menor movimento;
clientes recorrentes;
clientes inativos;
clientes recuperados, quando mensurável;
entregas;
movimentações relevantes.
57. Produtos de baixa saída

O sistema deverá ajudar a proprietária a perceber produtos com pouca movimentação.

Não devemos simplesmente classificar como “ruim”.

A análise poderá considerar:

quantidade vendida;
período;
comparação com período anterior;
categoria;
histórico.

Isso ajudará em decisões de promoção ou revisão de cardápio.

58. Combos

Combos fazem parte da V1.

Deverão ser tratados como recurso principal, e não como improvisação de interface.

O sistema deverá permitir configurar a composição necessária do combo e seu preço conforme a regra de negócio definida no cadastro.

Eles poderão aparecer em áreas de destaque no link público.

59. Promoções

A administradora poderá gerenciar promoções e destaques do cardápio.

O design público deverá prever:

banners;
produtos em destaque;
combos;
ofertas.

A implementação final deverá evitar que promoções dependam de alterações manuais no código.

60. Configurações da loja

A área de configurações deverá concentrar itens como:

dados da pizzaria;
contato;
WhatsApp;
horários;
status aberto/fechado quando aplicável;
bairros;
taxas;
formas de pagamento;
bandeiras;
identidade/tema;
parâmetros operacionais;
impressão;
demais configurações que surgirem durante o detalhamento.
61. Páginas internas previstas

Mapa inicial:

Dashboard

Pedidos

Caixa

Produtos / Cardápio

Clientes

Remarketing

Financeiro — Entradas e Despesas

Entregas

Funcionários

Relatórios

Configurações

Subpáginas e modais serão derivados dessas áreas durante o UX.

Navegação administrativa

O menu lateral usa uma superfície **clara e quente em toda a sua extensão**,
incluindo o cabeçalho da marca, separado da navegação apenas por uma borda
sutil. Itens inativos são neutros; amarelo e laranja ficam reservados ao item
ativo e às interações. O ativo é identificado por fundo amarelo suave e barra
lateral laranja, sem contorno completo. A mesma hierarquia vale no drawer móvel
e possui equivalência em grafite neutro no tema escuro. Decisão revisada em
22/09/2026 (D-2026-09-22-62).

Desempenho da navegação interna

Trocas de página devem preservar o shell administrativo e iniciar consultas
independentes em paralelo. Sessão e leituras repetidas podem ser deduplicadas
somente dentro da requisição corrente; pedidos, caixa e permissões não recebem
cache persistente. Novo pedido, novo produto e edição de produto usam rotas
canônicas interceptadas: na navegação interna abrem em slot modal independente,
sem recarregar a página ao fundo; no acesso direto continuam páginas completas.
Decisão de 22/09/2026 (D-2026-09-22-63).

62. Link público — estrutura inicial

Possível composição:

Header

Logo + status da loja + ações realmente necessárias.

Pesquisa

Busca por produtos/sabores.

Hero/banner

Promoções e comunicação da pizzaria.

> **⚠️ SUPERADO PELA V2 — ver §79.6 e §79.3.** O exemplo de categorias horizontais
> abaixo é anterior à consolidação. Brotinho é **tamanho**, não categoria, e
> "Refrigerantes" passou a ser "Bebidas". Categorias vigentes: Pizzas Salgadas,
> Pizzas Doces, Fogazza, Combos e Bebidas. Decisão confirmada em 17/09/2026.

Categorias horizontais

Pizza | Brotinho | Fogazza | Combos | Refrigerantes etc.

Mais pedidos / Populares

Baseado em vendas quando houver dados suficientes.

Produtos

Card **vertical**, com foto grande no topo, nome, descrição curta, preço e CTA
compacto "+" — decisão revisada em 22/09/2026 (D-2026-09-22-60).

É o mesmo card em todo o cardápio público: vitrines, listagem completa,
página de categoria e busca. Duas versões do mesmo cartão produziriam duas
formas de mostrar a mesma pizza.

Grade de **três por linha no celular**, quatro em tela média e cinco em tela
grande. Em telas estreitas o texto e o preço encolhem; o alvo de toque do CTA
não encolhe, e permanece em 44px.

O CTA é um "+" compacto, alinhado à direita e com alvo de toque de 44px. Ele
abre a configuração do produto, porque pizza tem tamanho, sabores e borda;
não adiciona o item diretamente ao carrinho. O rótulo acessível conserva a
ação "Escolher [produto]" para leitores de tela.

Combos

Não têm seção própria na home. Uma faixa colada ao banner principal anuncia
"Combos para compartilhar", com a quantidade, o menor preço e atalho para a
categoria. Eles continuam no cardápio, dentro da categoria deles — a faixa é
atalho, não é o único caminho.

Carrinho

CTA aparece quando houver itens.

63. Personalização do produto

Produtos que exigirem configuração deverão possuir fluxo apropriado.

Para pizza, por exemplo:

tamanho;
um ou dois sabores conforme regras;
borda;
adicionais;
remoções/observações;
quantidade;
preço atualizado;
adicionar ao carrinho.

O preço exibido deve refletir as regras efetivamente aplicadas.

64. Checkout

O checkout deverá coletar apenas informações necessárias.

Etapas conceituais:

Identificação

↓

Entrega ou retirada

↓

Endereço, se entrega

↓

Forma de pagamento

↓

Troco/bandeira quando necessário

↓

Resumo

↓

Enviar pedido

↓

Aguardar confirmação

65. Estados de interface

Claude Design deverá prever, além das telas “perfeitas”:

loading;
vazio;
erro;
sem resultados;
produto indisponível;
loja fechada;
pedido aguardando confirmação;
pedido recusado;
pedido cancelado;
falta de permissão;
falha de impressão;
falha de conexão;
operação concluída.
66. Segurança

A área interna será autenticada.

A arquitetura deverá considerar:

autenticação;
autorização;
RBAC;
isolamento adequado de dados;
validações no backend;
RLS quando Supabase for utilizado;
proteção de rotas;
auditoria;
tratamento seguro de uploads;
tokens seguros para acompanhamento público.

Esconder botão não é controle de permissão.

As regras críticas deverão ser validadas no backend/banco.

67. Arquitetura de dados

A modelagem deverá preservar entidades distintas em vez de colocar tudo em tabelas genéricas.

> **Nota de reconciliação (17/09/2026) — ver §79.3.** Cada sabor comercial de pizza
> **é um produto**. O termo "sabores" na lista abaixo designa um domínio funcional,
> **não** uma entidade independente do modelo de dados. O modelo canônico está em
> `02-MODELO-DADOS-SUPABASE.md`.

Entre os domínios que provavelmente existirão:

usuários;
funcionários;
cargos;
permissões;
clientes;
endereços;
categorias;
produtos;
variações;
sabores;
adicionais;
bordas;
combos;
pedidos;
itens de pedido;
pagamentos;
bandeiras;
entregas;
motoboys;
sessões de caixa;
movimentações;
despesas;
lançamentos de funcionários;
anexos;
templates;
contatos de remarketing;
configurações;
auditoria.

A modelagem definitiva será realizada antes da implementação do backend.

68. Pedido como snapshot

Dados importantes do pedido deverão ser preservados historicamente.

Exemplo: se amanhã a proprietária alterar o preço da pizza Calabresa de R$ 40 para R$ 45, um pedido feito ontem deverá continuar mostrando R$ 40.

O mesmo princípio deverá ser considerado para:

preço;
descrição relevante;
taxa de entrega;
endereço;
bandeira;
forma de pagamento;
adicionais;
demais informações históricas importantes.
69. Máquina de estados

Pedidos não deverão ter status alterados arbitrariamente.

A implementação deverá possuir transições permitidas.

Exemplo conceitual:

PENDING_CONFIRMATION

→ ACCEPTED

ou

→ REJECTED

Pedido aceito poderá posteriormente seguir seu fluxo operacional e eventualmente ser cancelado mediante permissão e justificativa.

A máquina definitiva será especificada antes do backend.

70. Caixa e auditoria financeira

Valores financeiros relevantes deverão preferencialmente utilizar lançamentos rastreáveis.

Evitar operações destrutivas como simplesmente apagar uma movimentação incorreta.

Quando necessário, utilizar:

cancelamento;
estorno;
ajuste;
lançamento compensatório;

com histórico.

71. Experiência mobile

As principais ações deverão ser confortáveis no celular.

Considerar:

áreas de toque adequadas;
botões grandes;
formulários curtos;
teclado correto por campo;
modais/bottom sheets quando apropriados;
carregamento rápido;
feedback visual;
evitar tabelas gigantes no celular.

No desktop, dados administrativos poderão utilizar tabelas e layouts mais densos.

72. Acessibilidade

Considerar desde o design:

contraste adequado;
tamanho legível;
foco de teclado;
labels;
estados não dependentes apenas de cor;
alvos de toque confortáveis;
textos alternativos quando necessários.
73. Escopo V1 — incluído

A V1 contempla conceitualmente:

cardápio público;
carrinho;
checkout;
entrega;
retirada;
confirmação manual;
acompanhamento;
produtos;
categorias;
sabores;
meio a meio;
bordas;
adicionais;
fogazzas;
refrigerantes;
combos;
promoções;
formas de pagamento;
bandeiras;
troco;
bairros/taxas;
horários;
pedidos internos;
origem dos pedidos;
impressão 58 mm;
clientes;
histórico;
bloqueio;
caixa;
entradas/despesas;
entregas;
motoboys;
funcionários;
lançamentos/consumos;
anexos;
permissões;
auditoria;
remarketing manual;
templates;
relatórios;
dashboard;
alertas;
temas claro/escuro;
identidade amarela/vermelha;
responsividade.
74. Fora da V1 / preparado para futuro

Não implementar agora:

Estoque completo
quantidade;
inventário;
ficha técnica;
baixa automática;
custo médio;
CMV detalhado.
Produção digital
KDS;
tela do pizzaiolo.
WhatsApp API
disparos automáticos;
status automáticos;
campanhas automáticas.
Pagamento online
gateway;
Pix conciliado automaticamente;
checkout financeiro externo.
> **⚠️ PARCIALMENTE SUPERADO PELA V2 — ver §79.2 e §79.27.** Deste bloco,
> **cálculo por quilômetros, roteamento e uso de API de mapas passaram a integrar
> a V1**. Permanecem fora da V1 apenas o rastreamento por **GPS do motoboy** e o
> app/login do entregador. Decisão confirmada em 17/09/2026.

Entrega avançada
cálculo por quilômetros;
roteamento;
mapas;
GPS.
Pedidos agendados
Lucro/margem real por produto

Esses recursos podem influenciar decisões arquiteturais, mas não devem aumentar silenciosamente o escopo da V1.

75. Sequência recomendada de desenvolvimento

Não pedir ao Claude Code para produzir o sistema inteiro de uma vez.

Fase 1 — Produto e UX
documento mestre;
design system;
mapa de telas;
fluxos;
Claude Design;
protótipo/responsividade.
Fase 2 — Arquitetura
stack;
estrutura do projeto;
banco;
migrations;
autenticação;
RBAC/RLS;
máquina de estados;
auditoria.
Fase 3 — Cardápio público
catálogo;
personalização;
carrinho;
checkout;
entrega/retirada;
acompanhamento.
Fase 4 — Pedidos
entrada;
confirmação;
recusa;
cancelamento;
pedidos manuais;
impressão.
Fase 5 — Operação financeira
caixa;
pagamentos;
entradas;
despesas;
fechamento;
divergências.
Fase 6 — Clientes e funcionários
CRM;
histórico;
funcionários;
consumos;
anexos;
entregadores;
prestação de contas.
Fase 7 — Inteligência
dashboard;
relatórios;
clientes inativos;
produtos de baixa saída;
remarketing;
alertas.
Fase 8 — estabilização
permissões;
auditoria;
estados de erro;
testes;
mobile;
impressão;
segurança;
performance.
76. Regra para uso de IA no desenvolvimento

Claude Design e Claude Code deverão seguir este documento, não reinterpretar livremente o produto.

Quando houver ambiguidade relevante:

não inventar regra de negócio → identificar a dúvida → decidir → atualizar a fonte de verdade → implementar.

77. Critério de sucesso

A primeira versão será bem-sucedida quando a Shalon conseguir executar um ciclo real:

Cliente acessa o link → monta uma pizza → escolhe entrega → sistema calcula taxa → escolhe pagamento → envia → balconista recebe → confirma → imprime a comanda → pedido é preparado → motoboy é associado → pagamento/entrega são conferidos → pedido é concluído → caixa recebe a informação → histórico do cliente é atualizado → venda aparece nos relatórios.

E, depois de acumular histórico:

O sistema começa a mostrar o que está acontecendo no negócio, em vez de a proprietária depender apenas de memória, papéis e percepção.

78. Decisões ainda a detalhar durante o design/arquitetura

O Documento Mestre já é suficiente para iniciarmos o design, mas algumas definições operacionais ainda poderão ser refinadas sem bloquear essa etapa:

preços reais;
sabores reais;
composição real dos combos;
lista completa de fogazzas;
adicionais;
horários reais;
bairros e taxas;
endereço e contatos definitivos;
bandeiras aceitas;
chave/instruções do Pix;
política de pedido mínimo, caso exista;
tempo estimado de entrega/retirada;
regras exatas de promoções;
conteúdo dos templates de remarketing;
formato final da comanda;
nomenclatura final dos cargos/permissões.

Esses dados devem ser configuráveis sempre que possível, para que a ausência deles agora não nos leve a codificar informações fictícias.

Status da Fonte de Verdade

Produto: design/UX já realizado e descoberta funcional consolidada.
Escopo V1: consolidado na seção 79.
Escopo futuro: separado.
Fluxo principal: consolidado.
Regras críticas de negócio: consolidadas.
Próxima etapa: documentação de arquitetura, modelo de dados Supabase, RLS/RBAC e regras de negócio antes da implementação.

# 79. Consolidação pós-descoberta funcional (V2)

Esta seção consolida as decisões tomadas após o primeiro Documento Mestre e encerra a descoberta funcional da V1. **Ela tem precedência sobre qualquer trecho anterior incompatível.** O Claude Code não deve implementar regras antigas quando houver divergência com esta seção.

## 79.1 Escopo da loja e operação

A V1 é exclusiva para **uma única unidade da Pizzaria Shalon**. Não implementar multitenancy ou multiunidade agora.

A loja terá horários semanais configuráveis e poderá ser fechada/reaberta temporariamente por usuário autorizado. Quando fechada, o cardápio continua visível, mas o checkout fica bloqueado. Não haverá pedidos agendados na V1.

O endereço da loja será configurável e geocodificado, armazenando latitude/longitude como origem das rotas. Não hardcodar endereço.

Pedidos também poderão ser lançados manualmente pela equipe com origem preservada: **Link Shalon, WhatsApp, Telefone, Balcão, iFood ou Outro**. Não haverá integração automática com iFood na V1.

## 79.2 Entrega por distância — substitui entrega por bairro

A V1 **terá cálculo de entrega por rota/distância**. A regra antiga de taxa estrutural por bairro está superada.

O endereço/CEP do cliente será validado e geocodificado. Um provedor de rotas — inicialmente Google, mas abstraído no domínio — calculará **distância real por vias**, nunca distância em linha reta.

O Dono/Admin configura faixas de distância e taxas. Existem dois limites distintos:

- **raio de aprovação automática**;
- **distância máxima atendida**, correspondente à última faixa configurada.

Dentro do raio automático, a taxa é calculada e o pedido segue normalmente. Acima do raio automático, mas dentro da distância máxima, o sistema mostra a taxa ao cliente e permite enviar o pedido como **fora da área padrão / aguardando aprovação da entrega**. A pizzaria aprova ou rejeita. Além da distância máxima, o checkout de entrega é bloqueado.

O pedido guarda snapshot da distância de rota e da taxa aplicada. Override manual de taxa é excepcional, permissionado e auditado. Se uma alteração posterior aumentar ou modificar o total, o cliente precisa aprová-la no acompanhamento.

Pedido mínimo é configurável, pode ser desativado e vale **somente para entrega**, calculado sobre subtotal de produtos antes da taxa.

Tempos estimados de entrega e retirada são configurados separadamente, podem receber override temporário e cada pedido guarda o snapshot do prazo mostrado ao cliente.

## 79.3 Modelo comercial de pizzas e produtos

Cada sabor comercial de pizza é um **produto de pizza** (ex.: Pizza Calabresa, Pizza Portuguesa). Não exigir uma entidade genérica “Pizza” + tabela obrigatória de sabores para representar o cardápio.

**Tamanhos** são entidades reutilizáveis e configuráveis. Cada tamanho possui número de fatias e máximo de sabores. Cada pizza define quais tamanhos oferece e o preço de cada variação. Nem toda pizza precisa existir em todo tamanho. Os nomes iniciais Tradicional e Brotinho são dados configuráveis, não hardcode.

No meio a meio, os sabores selecionados precisam estar disponíveis no mesmo tamanho. O preço é **sempre o maior preço efetivo atual** entre os sabores selecionados. Essa regra deve ser validada no backend/domínio. Se o tamanho aceitar apenas um sabor, a interface não oferece meio a meio.

Produto ativo/inativo é diferente de indisponibilidade temporária. A disponibilidade também pode existir por variação produto+tamanho.

Fogazzas são produtos normais e não herdam automaticamente regras de pizza. Bebidas são produtos independentes por apresentação (ex.: Coca 2L e Coca 350 ml são produtos distintos).

## 79.4 Bordas e adicionais

Bordas recheadas são entidades configuráveis, com preço/disponibilidade por tamanho. Por padrão, uma borda compatível com um tamanho pode ser usada nas pizzas daquele tamanho, com possibilidade de exclusões por produto. O cliente escolhe no máximo uma borda ou “Sem borda”.

Adicionais ficam preparados e podem ser ligados/desligados por configuração. Podem ter preço por tamanho, disponibilidade e compatibilidade. O limite de adicionais pode ser configurado por produto/grupo ou ficar sem limite explícito. Um mesmo adicional funciona como checkbox, sem quantidade maior que 1. Em pizza meio a meio, adicionais valem para a pizza inteira.

Remoções e pedidos especiais permanecem como **observação livre do item**; não criar ficha técnica/ingredientes estruturais na V1.

## 79.5 Combos

Combos são parte obrigatória da V1. Serão **combos fixos**, sem grupos de escolha/substituição. Cada componente aponta para produto/variação exata e quantidade configurável. Pizza dentro de combo é exata, sem meio a meio ou troca de sabor.

Cada componente pode receber observação própria quando aplicável. O combo tem preço próprio, independente da soma atual dos componentes. A soma pode ser exibida apenas como informação administrativa.

Se qualquer componente obrigatório ficar indisponível, o combo fica automaticamente indisponível para novos pedidos e volta quando todos os componentes estiverem disponíveis, desde que o próprio combo esteja ativo.

## 79.6 Promoções, categorias, destaques e popularidade

Promoções V1 são de **preço promocional simples**. Podem ser agendadas por data/hora, ter fim ou permanecer até desativação, e atingir uma variação específica ou um combo. Não permitir períodos promocionais sobrepostos para o mesmo alvo.

No meio a meio, comparar os preços efetivos atuais (promocional quando válido, normal caso contrário) e cobrar o maior. Limite promocional por pedido só é consumido quando aquela promoção efetivamente influencia o preço final cobrado.

Categorias iniciais: **Pizzas Salgadas, Pizzas Doces, Fogazza, Combos e Bebidas**. Promoção não é categoria. Cada produto possui uma categoria principal. Categorias e produtos dentro delas têm ordenação manual, preferencialmente drag-and-drop. Categoria pode ser ativa/inativa e também pausada temporariamente na operação.

“**Mais pedidos**” é automático, baseado nos últimos 30 dias e apenas pedidos concluídos, ranqueado por quantidade. Pizza inteira conta 1 para o sabor; meio a meio conta 0,5 para cada sabor. Combo conta para a popularidade do próprio combo, não de seus componentes. Mostrar até 6 produtos ativos e disponíveis. Produto novo não recebe boost artificial.

“**Destaque/Recomendado pela Shalon**” é uma marcação manual independente da popularidade.

## 79.7 Imagens e banners

Cada produto e combo possui uma imagem principal. Se ausente, usar placeholder da identidade Shalon. Upload/colar/URL deve passar por processamento, redimensionamento quando necessário, compressão e formato web eficiente. **Nunca armazenar Base64 no banco**; armazenar arquivo no Storage e referência/metadados no banco.

Ao substituir imagem, salvar a nova, atualizar a referência e só então remover o objeto antigo quando não houver mais referência. Aceitar proporções variadas e exibir com enquadramento consistente; sem editor manual de crop/foco na V1.

Banners/carrossel são administráveis, ordenáveis e agendáveis. Destinos possíveis: produto, categoria, combo, promoção relacionada, link externo ou sem ação. Destinos internos devem referenciar entidades, não URLs digitadas. Banner vinculado a promoção não aparece fora da validade; banner de produto temporariamente indisponível se oculta e pode reaparecer quando voltar a ficar disponível.

## 79.8 Busca, compartilhamento, favoritos e histórico público

Busca pública considera nome, descrição, categoria e tamanhos oferecidos, ignorando caixa e acentos. Produto temporariamente indisponível ainda pode aparecer marcado **“Indisponível hoje”**, sem permitir adição.

Cada produto, combo e categoria pode ter link compartilhável. Link de produto sempre abre o estado comercial atual; promoção expirada não concede preço antigo.

A V1 terá **Favoritos** persistidos localmente no navegador, sem login e sem sincronização entre dispositivos. Favorito temporariamente indisponível permanece salvo e marcado; produto estruturalmente inativo não precisa aparecer.

O topo público terá menu hambúrguer com **Meus pedidos, Histórico de pedidos e Favoritos**. Não haverá navegação inferior persistente.

Meus pedidos/histórico usam credencial/token local persistente associado aos pedidos daquele navegador/dispositivo. **Nunca liberar histórico completo apenas digitando número de WhatsApp.** Cada pedido também terá URL individual de acompanhamento com token seguro e imprevisível, que dá acesso somente àquele pedido.

“Pedir novamente” reconstrói um **novo carrinho** usando regras, preços, promoções e disponibilidade atuais. Observações antigas podem ser reaproveitadas, mas ficam editáveis/removíveis. Pedido antigo é imutável.

## 79.9 Carrinho e autoridade do servidor

Carrinho pode ser persistido localmente por **24 horas desde a última alteração relevante**. Após isso é descartado. Fechamento da loja não apaga o carrinho; bloqueia checkout e permite retomada dentro do TTL.

Antes da criação definitiva do pedido, o servidor revalida preços, promoções, disponibilidade, variações, tamanhos, meio a meio, bordas, adicionais, combos e limites. O frontend nunca é autoridade comercial.

Mudanças de preço enquanto o carrinho está aberto nunca são silenciosas: mostrar valor anterior → atual e exigir aceite. Produto inativado torna o item inválido e precisa ser removido.

Itens de configuração idêntica podem agrupar quantidade; qualquer diferença de tamanho, sabores, borda, adicionais ou observação cria linha separada. Produto e promoção podem ter limites opcionais por pedido; quando ambos existirem, vale o mais restritivo.

## 79.10 Identificação do cliente e endereços

Não há conta/senha para cliente. Primeiro pedido exige **nome + WhatsApp**. Cliente reconhecido no mesmo navegador pode receber saudação curta e ter dados/endereço pré-preenchidos.

Alteração de nome/WhatsApp em pedido futuro pode atualizar o cadastro principal para frente, sem alterar snapshots de pedidos antigos.

Cliente pode ter múltiplos endereços com rótulo opcional e um endereço preferido. Todo uso de endereço exige nova validação/geocodificação/rota/taxa; nunca reutilizar taxa antiga. Complemento e referência são campos separados e não influenciam geocodificação. Em endereço ambíguo, pode ser oferecido ajuste de localização no mapa; o texto do endereço permanece preservado.

## 79.11 Entrega, retirada e checkout

Checkout começa escolhendo **Entrega ou Retirada**. Retirada não pede endereço, distância ou taxa; mostra endereço da Shalon e estimativa atual de retirada. Comandas e administrativo devem destacar RETIRADA/ENTREGA.

Antes de enviar, cliente vê uma **revisão final** com itens, personalizações, modalidade, endereço quando aplicável, taxa, pagamento, troco, observação geral e total. Nesse momento ocorre revalidação final do servidor.

Existe observação geral opcional do pedido, separada das observações dos itens.

## 79.12 Pagamentos

Existe um registro central configurável de formas de pagamento ativas para entrega e retirada. Inicialmente: **Pix, dinheiro, débito, crédito e voucher**, conforme configuração da Shalon.

**Pix na maquininha** é pagamento presencial, tanto na entrega quanto na retirada. **Pix antecipado por chave** é uma opção separada que só aparece se a Shalon cadastrar e habilitar a chave/instruções. Se não houver chave ativa, essa opção não aparece.

No Pix antecipado por chave, o cliente copia os dados, envia o comprovante pelo **WhatsApp** e o pedido fica em **“Aguardando confirmação do Pix”**. Não há upload de comprovante no sistema na V1. O sistema nunca marca como pago só porque Pix foi selecionado. Um usuário autorizado confirma manualmente; registrar quem confirmou e quando. O pedido não vai para produção antes dessa confirmação.

Dinheiro pergunta **“Precisa de troco?”** e, se sim, “Troco para quanto?”. O sistema calcula o troco e valida valores impossíveis. Essa informação acompanha operação/motoboy.

Débito, crédito e voucher exigem seleção de uma bandeira/opção ativa aceita pela Shalon. Bandeiras são configuráveis, não hardcoded.

No checkout público V1 não haverá pagamento dividido. O modelo administrativo/financeiro, porém, deve suportar registro de pagamento efetivamente dividido quando ocorrer presencialmente.

Guardar separadamente **forma prevista** e **pagamento efetivamente realizado**. Mudança posterior é permissionada/auditada. Relatórios financeiros usam prioritariamente o que efetivamente foi recebido.

Não controlar gorjeta na V1. Gorjeta dada diretamente ao motoboy não altera pedido, receita ou acerto. O valor devido à pizzaria pelo motoboy é o valor oficial dos pedidos.

## 79.13 Consentimento e comunicação

Consentimento de marketing via WhatsApp é **opcional, separado da compra e desmarcado por padrão**. Comunicação operacional necessária para executar/resolver um pedido independe desse consentimento. Marketing/remarketing respeita a autorização registrada.

## 79.14 Criação, confirmação, alteração, rejeição e cancelamento

Pedido público enviado não vira venda confirmada automaticamente. Estado inicial normal: **Pedido recebido / Aguardando confirmação**. Após aceite da Shalon, vira pedido confirmado e segue a operação.

Pix antecipado exige confirmação do pagamento antes do aceite produtivo. Entrega fora do raio automático exige aprovação de entrega. Esses estados devem ser explícitos.

Quando um problema puder ser corrigido, a equipe usa **“Alteração necessária — aguardando cliente”** em vez de rejeitar todo o pedido. A equipe negocia via WhatsApp e registra a proposta no sistema. Se alterar itens ou valor, o cliente precisa aprovar pelo acompanhamento. Mostrar claramente mudanças e total anterior/novo. Não avançar nem cancelar automaticamente por falta de resposta; equipe decide posteriormente com motivo.

Cliente não cancela pedido automaticamente. Pode usar **“Solicitar cancelamento”** quando a fase permitir; informa motivo e a pizzaria decide. Em fases avançadas, orientar contato via WhatsApp. Rejeição e cancelamento nunca apagam pedido e exigem motivo, responsável, data/hora e auditoria.

Após envio, não mostrar “confirmado” antes do aceite. Mostrar que o pedido foi recebido e aguarda confirmação.

## 79.15 Fluxo operacional definitivo

Para **retirada**: produção → **Pronto para retirada** → **Retirado/Concluído**. “Pronto” não conclui. Na retirada, confirmar pagamento efetivo quando pendente.

Para **entrega**: produção → **Pronto para entrega** → **Saiu para entrega** → **Entregue/Concluído**.

Se a entrega falhar, usar **“Entrega não realizada”** com motivo obrigatório. Depois a equipe decide nova tentativa ou cancelamento. Valor não recebido não pode aparecer como dinheiro entregue pelo motoboy.

## 79.16 Impressão 58 mm

Não haverá KDS na V1. A produção usa comanda térmica **58 mm não fiscal**.

Comanda de produção só é impressa/gerada após aceite efetivo do pedido. Deve priorizar legibilidade: número/hora, entrega/retirada, itens, sabores/meio a meio, tamanho, borda, adicionais, observações e quantidades. Evitar poluição financeira desnecessária.

Reimpressão é permitida e auditada. Se pedido já impresso sofrer alteração autorizada, gerar **comanda adicional de ALTERAÇÃO**, visualmente destacada, mostrando exatamente o que mudou; nunca fingir que a impressão original não existiu.

## 79.17 Motoboys e saídas de entrega

Motoboy pode existir como funcionário sem login. Na V1, a atendente controla as entregas e confirma conclusão/pagamentos, especialmente no retorno.

Uma **Saída de entrega** agrupa vários pedidos de um motoboy, registra horário e valores esperados por forma de pagamento. No retorno, a atendente faz o acerto sobre a mesma saída.

Diferença de acerto registra valor, motivo/observação, responsável, data e anexo quando necessário. **Nunca descontar salário automaticamente.** Usuário financeiro autorizado decide depois se a ocorrência gera lançamento no histórico financeiro do funcionário.

## 79.18 Caixa

Operação usa **sessões de caixa**, não simplesmente dias do calendário. Abertura registra usuário, data/hora e fundo inicial, que pode ser **R$ 0,00**.

Uma sessão aberta antes da meia-noite continua sendo a mesma depois da virada do dia. A meia-noite não fecha, não cria novo caixa e não trava pedidos. Guardar data operacional da sessão e timestamps reais das movimentações.

Caixa esquecido aberto não fecha automaticamente; operação continua e o administrativo mostra alerta de há quanto tempo está aberto.

Permitir mais de uma sessão no mesmo dia, mas apenas uma ativa por caixa/ponto. Um caixa fechado não é alterado pela atendente comum. Reabertura/correção excepcional exige permissão, motivo e auditoria, preservando o fechamento original.

Ter **Sangria** e **Reforço/Suprimento** como operações distintas, com valor, motivo, responsável e data/hora.

Despesa paga diretamente pelo caixa é registrada como **Despesa**, não apenas sangria, e reduz o saldo físico esperado.

Fechamento compara saldo esperado e valor contado. Diferença não impede fechamento, mas exige justificativa. **Diferença de caixa nunca gera desconto automático de funcionário.**

O caixa pode fechar com motoboys/recebimentos pendentes, exibindo alerta forte. Valores ainda em poder do motoboy não são considerados dinheiro já recebido no caixa. Acertos posteriores mantêm vínculo com pedido, saída, sessão/período.

## 79.19 Financeiro e classificações operacionais

Distinguir claramente:

- **Venda real**;
- **Cortesia**;
- **Consumo de funcionário**;
- **Consumo do proprietário**;
- **Perda/Descarte**.

Somente venda real deve inflar faturamento/ticket médio de clientes. Cortesia exige motivo e autorizador. Consumos internos preservam itens e valor de referência, mas não são vendas. Perda/descarte registra produto, quantidade, motivo, observação e responsável; não baixa ingredientes porque não há estoque quantitativo V1.

Financeiro terá categorias configuráveis de entradas e despesas. Movimentação financeira confirmada não é apagada: corrigir por **estorno** permissionado, com motivo/auditoria, mantendo o lançamento original.

Relatórios podem mostrar **saldo operacional registrado**, mas não chamar isso de lucro líquido/margem real sem custos/ficha técnica.

## 79.20 Funcionários e financeiro sensível

Funcionário é separado de usuário autenticado. Nem todo funcionário possui login.

Dono/Admin pode criar funções/cargos personalizados e atribuir permissões granulares por módulo/ação (visualizar, criar, editar, cancelar/estornar, administrar etc.). Segurança deve ser aplicada também no backend/RLS, nunca apenas escondendo botões.

Funcionário com histórico não é excluído fisicamente: fica inativo/desligado e perde acesso, preservando vínculos históricos.

Atendente pode registrar operações autorizadas como consumo/ocorrência, mas salário, adiantamentos, saldos e histórico financeiro sensível exigem permissão financeira específica.

Adiantamentos podem ser registrados com valor, data, observação, forma de pagamento e responsável. O sistema **não é folha de pagamento** e não executa desconto trabalhista automático.

## 79.21 Clientes e bloqueio

Dono/Admin pode bloquear cliente para novos pedidos com motivo interno, responsável e timestamp. O motivo não é exposto ao cliente. No público, mostrar mensagem neutra orientando contato com a Shalon. Desbloqueio também é auditado. Histórico nunca é apagado.

## 79.22 Remarketing

Remarketing V1 é **assistido e manual**, sem envio automático. O sistema identifica clientes potencialmente inativos usando cadência individual quando houver histórico suficiente e também filtros manuais de 15/30/60/90 dias.

Exibir informações úteis como último pedido, frequência habitual, dias sem pedir, quantidade de pedidos e ticket médio. Botão abre WhatsApp com template configurável. Registrar tentativa e resultado: contatado, não respondeu, demonstrou interesse, não quer receber contatos, voltou a comprar etc.

Se cliente pedir para não receber promoções, atualizar consentimento e removê-lo das sugestões promocionais. Quando houver nova compra após contato, pode-se registrar **“voltou a comprar após o contato”**, sem afirmar causalidade.

## 79.23 Dashboard e alertas

Dashboard deve funcionar como **central de atenção operacional**, não coleção de gráficos decorativos. Destacar pendências reais: pedido aguardando confirmação, Pix aguardando conferência, alteração aguardando cliente, entrega fora do raio aguardando aprovação, caixa aberto por tempo incomum, saída de motoboy sem acerto, divergências pendentes etc. Pendência resolvida deixa de aparecer automaticamente.

Limites de tempo para alertas são configuráveis, não hardcoded.

Novos pedidos geram **alerta visual e sonoro dentro do administrativo**. Decisão posterior, em 28/09/2026: o painel administrativo também terá notificações Web Push opcionais para operadores que autorizarem o navegador, precedidas da base PWA instalável. SMS e WhatsApp automáticos continuam fora da V1. Push não substitui a lista interna nem altera a autoridade dos pedidos.

## 79.24 Relatórios

Relatórios incluem faturamento registrado, pedidos, ticket médio, pagamentos, origens, produtos/categorias, combos, cancelamentos/rejeições, dias de maior/menor movimento, recorrência/inatividade, entregas/acertos, movimentações de funcionários e demais indicadores derivados.

Principais relatórios permitem **comparação entre períodos** com variação. Permitir exportação conforme filtros/período, principalmente **Excel/CSV e PDF**, respeitando permissões de acesso/exportação.

## 79.25 Configurações e auditoria

Alterações em configurações críticas — horários, fechamento temporário, raio de aprovação, faixas/taxas, pedido mínimo, chave Pix, pagamentos, estimativas etc. — registram **quem, quando, valor anterior e valor novo**. Ações excepcionais/sensíveis podem exigir motivo.

Disponibilidade operacional pode ser alterada em massa para vários produtos/variações. Categoria inteira pode ser pausada temporariamente sem inativar cadastro. Motivo interno da indisponibilidade é opcional; público vê apenas **“Indisponível hoje”**.

## 79.26 Segurança e integridade

Supabase Auth é exclusivo para usuários internos autenticados. Clientes públicos não usam conta/senha administrativa. RLS deve existir desde o início. `service_role` nunca vai para frontend.

Ações críticas e transições sensíveis devem passar por camada de domínio/backend e, quando necessário, operação transacional/RPC. Estados de pedido não podem ser arbitrariamente editados.

Snapshots históricos devem preservar dados comerciais relevantes do momento do pedido. Auditoria deve cobrir cancelamentos, rejeições, alterações de pedido, reimpressões, ajustes financeiros, diferenças, mudanças de permissões e configurações críticas.

## 79.27 O que continua fora da V1

Continuam fora da V1:

- estoque quantitativo, inventário e ficha técnica;
- baixa automática de ingredientes;
- CMV/margem/lucro real por produto;
- KDS/tela digital do pizzaiolo;
- API oficial do WhatsApp e disparos automáticos;
- gateway de pagamento/Pix conciliado automaticamente;
- pedidos agendados;
- login/app do motoboy;
- sincronização de favoritos/histórico entre dispositivos por conta de cliente;
- multitenancy/multiunidade.

**Atenção:** cálculo de entrega por rota/distância **não está mais fora da V1**; agora faz parte do escopo funcional consolidado.

## 79.28 Estado da descoberta e próxima fase

**Descoberta funcional: ENCERRADA.**

O design aprovado permanece como referência visual oficial. Não redesenhar ou simplificar silenciosamente a experiência aprovada. Artefatos específicos do runtime do Claude Design não devem ser levados para produção quando forem apenas infraestrutura de protótipo.

Antes de implementar funcionalidades, a documentação técnica deve ser reconciliada com esta V2. A sequência passa a ser:

1. atualizar/reconciliar segurança e permissões; ✅ concluído
2. criar **02-MODELO-DADOS-SUPABASE.md**; ✅ concluído
3. criar/refinar **03-RLS-RBAC-SEGURANCA.md**; ✅ concluído
4. criar **04-REGRAS-NEGOCIO.md**; ✅ concluído
5. criar **05-PLANO-IMPLEMENTACAO.md**; ✅ concluído
6. criar o `CLAUDE.md` raiz; ✅ concluído
7. somente então iniciar implementação por fases.

> **Nota de reconciliação (17/09/2026):** a numeração originalmente prevista
> (03 a 06) foi executada como 02 a 05. Os nomes acima refletem os arquivos
> realmente existentes em `docs/`.

**Regra final para Claude Code:** não implementar ainda a partir de decisões antigas isoladas. Em qualquer conflito, esta consolidação V2 é a fonte de verdade funcional mais recente.
