# 04 — REGRAS DE NEGÓCIO
## Sistema de Gestão e Pedidos — Pizzaria Shalon

**Versão:** 1.1 — RN-CAIXA-018 e RN-CAIXA-019 acrescentadas em 25/09/2026 (`D-2026-09-25-78`)  
**Status:** Especificação normativa da V1  
**Dependências:** `01-DOCUMENTO-MESTRE.md`, `02-MODELO-DADOS-SUPABASE.md`, `03-RLS-RBAC-SEGURANCA.md`

---

## 1. Finalidade

Este documento transforma as decisões funcionais da Pizzaria Shalon em regras formais que deverão ser respeitadas pela interface, camada de domínio/backend, banco de dados e políticas de segurança.

Ele não substitui o Documento Mestre. Em caso de conflito:

1. uma decisão funcional mais recente e explicitamente aprovada prevalece;
2. a documentação deve ser reconciliada antes da implementação;
3. o Claude Code não deve inventar regra para preencher ambiguidade relevante.

A interface nunca é autoridade para preço, permissão, estado, disponibilidade ou cálculo financeiro.

---

## 2. Princípios invariáveis

- V1 para uma única unidade da Pizzaria Shalon; sem multitenancy.
- Clientes públicos não possuem conta/senha administrativa.
- Funcionários e usuários autenticados são conceitos distintos.
- Preços e regras comerciais são validados no servidor no momento da criação/alteração do pedido.
- Registros históricos relevantes não são apagados para “corrigir” fatos passados.
- Pedido, pagamento, caixa, entrega e movimentos financeiros precisam ser rastreáveis.
- Valores históricos usam snapshots; mudanças futuras de cadastro não reescrevem pedidos antigos.
- Operações sensíveis exigem permissão e auditoria.
- Não existe estoque quantitativo, ficha técnica, CMV real, folha de pagamento ou KDS na V1.

---

# PARTE I — LOJA E DISPONIBILIDADE

## 3. Estado operacional da loja

### RN-LOJA-001 — Horário semanal
A loja possui horários configuráveis por dia da semana, incluindo dias fechados.

### RN-LOJA-002 — Fechamento temporário
Usuário autorizado pode pausar o recebimento de pedidos sem esconder o cardápio. O checkout fica bloqueado até a reabertura. O bloqueio é do **canal público**: o lançamento manual interno continua permitido (RN-MAN-006).

### RN-LOJA-003 — Sem agendamento
A V1 não aceita pedidos para data/horário futuro. Loja fechada significa navegação permitida e checkout bloqueado.

### RN-LOJA-004 — Tempo estimado
Entrega e retirada possuem intervalos estimados independentes. Pode existir override temporário autorizado. Cada pedido armazena snapshot do intervalo mostrado ao cliente.

### RN-LOJA-005 — Pedido mínimo
Pedido mínimo é configurável e, quando ativo, aplica-se somente à entrega. O cálculo considera o subtotal dos produtos antes da taxa de entrega.

---

## 4. Disponibilidade operacional

### RN-DISP-001 — Ativo não é igual a disponível
`ativo/inativo` representa estado estrutural do cadastro. `indisponível temporariamente` representa estado operacional.

### RN-DISP-002 — Produto/variação
Produto e, quando aplicável, sua variação por tamanho podem ser temporariamente indisponibilizados.

### RN-DISP-003 — Operação em lote
Usuário autorizado pode marcar múltiplos produtos/variações como “Indisponível hoje” ou restaurá-los.

### RN-DISP-004 — Pausa de categoria
Uma categoria pode ser pausada temporariamente sem ser inativada. Enquanto pausada, todos os produtos pertencentes a ela ficam indisponíveis para novos pedidos. Ao reativar a categoria, cada produto/variação volta a obedecer ao próprio estado individual.

### RN-DISP-005 — Histórico
Inativação ou indisponibilidade nunca altera itens de pedidos históricos.

### RN-DISP-006 — Produto sem preço aplicável não está disponível
Produto sem preço aplicável **não pode ser considerado disponível para venda**, ainda que o cadastro esteja ativo e a categoria não esteja pausada.

Preço aplicável significa:

- produto **com** variação por tamanho: ao menos uma variação ativa e disponível, já que a autoridade de preço é a variação (`02-MODELO-DADOS-SUPABASE.md` §5.2);
- produto **sem** variação: preço próprio definido.

Esta regra também cobre o estado normal de um cadastro recém-criado, ainda incompleto: ele existe, é editável e não aparece para venda. *(Decisão aprovada em 18/09/2026; histórico em `docs/00-DECISOES.md` D-2026-09-18-21.)*

O preço de fogazza (RN-FOG-002) não é tamanho de pizza. A pizza de preço
único que também é vendida como fogazza continua sendo pizza **sem**
variação por tamanho: vende pelo preço próprio, e a fogazza dela, pelo preço
de fogazza. *(D-2026-09-29-100.)*

---

# PARTE II — CARDÁPIO E PRECIFICAÇÃO

## 5. Categorias e produtos

### RN-CAT-001
Cada produto possui uma categoria primária.

### RN-CAT-002
Categorias possuem ordenação manual e podem ser ativadas/inativadas. Categoria inativa não aparece no cardápio público.

### RN-PROD-001
Tipos de produto incluem pelo menos pizza, fogazza, bebida, combo e outros que venham a ser cadastrados.

### RN-PROD-002
Cada produto pode possuir nome, descrição curta, imagem principal, ordenação, destaque manual e limite opcional de quantidade por pedido.

### RN-PROD-003
Imagem ausente usa placeholder da Shalon. Imagens devem ser otimizadas antes do armazenamento final; Base64 não deve ser persistido no banco.

---

## 6. Pizzas e tamanhos

### RN-PIZZA-001 — Sabor como produto
Cada sabor comercial de pizza é um produto próprio.

### RN-PIZZA-002 — Tamanhos reutilizáveis
Tamanhos são entidades configuráveis e reutilizáveis. Cada tamanho possui, entre outros atributos, quantidade de fatias e máximo de sabores.

### RN-PIZZA-003 — Oferta por tamanho
Cada pizza escolhe quais tamanhos oferece e define preço para cada combinação produto × tamanho. Nem toda pizza precisa existir em todos os tamanhos.

### RN-PIZZA-004 — Meio a meio
Meio a meio somente é permitido quando o tamanho aceita mais de um sabor e todos os sabores escolhidos estão disponíveis naquele mesmo tamanho.

### RN-PIZZA-005 — Preço do meio a meio
O preço de uma pizza meio a meio é sempre o maior **preço efetivo atual** entre os sabores escolhidos para o mesmo tamanho.

Preço efetivo = preço promocional válido, se houver; caso contrário, preço normal.

A regra deve ser recalculada no backend.

### RN-PIZZA-006 — Popularidade do meio a meio
Para ranking por quantidade, pizza inteira atribui 1 unidade ao sabor. Meio a meio com dois sabores atribui 0,5 a cada sabor.

---

## 7. Bordas e adicionais

### RN-BORDA-001
No máximo uma borda recheada pode ser escolhida por pizza: “Sem borda” ou uma borda compatível.

### RN-BORDA-002
Preço e disponibilidade de borda podem variar por tamanho.

### RN-BORDA-003
Borda compatível com um tamanho é, por padrão, elegível às pizzas daquele tamanho, admitindo exclusões específicas por produto.

### RN-ADD-001
O recurso de adicionais é configurável e pode ser desligado globalmente.

### RN-ADD-002
Adicionais podem ter preço por tamanho e regras de compatibilidade.

### RN-ADD-003
O mesmo adicional funciona como seleção única por tipo, não como quantidade repetida do mesmo adicional.

### RN-ADD-004
O limite de adicionais pode ser configurado por produto/grupo ou inexistir.

### RN-ADD-005
Em pizza meio a meio, adicionais aplicam-se à pizza inteira, nunca a apenas uma metade na V1.

### RN-ADD-006 — Padrão de compatibilidade
Na ausência de regra específica cadastrada para o par produto × adicional, o adicional é **permitido**, seguindo o mesmo princípio que RN-BORDA-003 aplica às bordas: o cadastro registra a exceção, não a permissão.

Essa permissão por omissão **não dispensa nenhuma das demais condições**. O adicional só é oferecido quando, cumulativamente:

- o recurso de adicionais está ligado globalmente (RN-ADD-001);
- o adicional está ativo e disponível;
- existe preço cadastrado para o tamanho em questão (RN-ADD-002).

Uma regra cadastrada como proibição prevalece sobre o padrão; entre regras aplicáveis, a mais específica (com tamanho) prevalece sobre a genérica. *(Decisão aprovada em 18/09/2026; histórico em `docs/00-DECISOES.md` D-2026-09-18-21.)*

### RN-OBS-001
Remoção de ingredientes e pedidos especiais são registrados como observação livre do item. Não existe ficha técnica estrutural na V1.

---

## 8. Fogazzas e bebidas

### RN-FOG-001
Fogazza é produto normal e não herda automaticamente regras de pizza.

> **Substituída em 29/09/2026 (D-2026-09-29-98)** para a fogazza vendida por
> sabor, que segue RN-FOG-002 a RN-FOG-006. Continua valendo para a fogazza
> comum, cadastrada como produto simples com preço próprio.

### RN-FOG-002 — Fogazza é o sabor de pizza num tamanho de fogazza
A fogazza por sabor usa os sabores de pizza já cadastrados. Cada sabor pode
ter um preço "como fogazza", que é a variação do sabor num tamanho marcado
como vendido como fogazza. O preço é individual por sabor. O tamanho de
fogazza só é usado por sabor de pizza e nunca aparece como opção na página da
pizza.

### RN-FOG-003 — Cards de entrada
O cliente chega à fogazza por cards de entrada (por exemplo "Fogazza
salgada" e "Fogazza doce"), produtos do tipo fogazza que indicam de qual
categoria vêm os sabores e em qual tamanho de fogazza. O card mostra "a
partir de" o menor preço de fogazza dos sabores e lista os sabores com o
preço de cada um.

O card aparece no cardápio, na categoria dele, no link direto e na busca; a
busca também o encontra pelo nome dos sabores ("fogazza calabresa"). A lista
de sabores tem busca própria, com a mesma regra da busca do cardápio
(RN-BUSCA-001). Escolhido o sabor, abre a página daquela fogazza, com o
configurador de sempre e o tamanho fixo; o link dela é compartilhável e é
para ela que o "Editar" do carrinho volta. O balcão ("Novo pedido") segue o
mesmo caminho: card, sabor, configurador. *(D-2026-09-29-99.)*

O card se monta na própria tela dele: escolhe-se a categoria de pizza e
marcam-se os sabores que entram, com o preço de fogazza de cada um, numa
operação só. O preço fica guardado no sabor. Se ainda não houver tamanho de
fogazza, ele é criado ("Fogazza"). Sabor que sai da fogazza tem o preço
desativado, não apagado. *(D-2026-09-30-102.)*

### RN-FOG-004 — Um sabor, sem borda
Fogazza tem exatamente um sabor: não existe meio a meio. Fogazza não tem
borda.

### RN-FOG-005 — Adicionais
Os adicionais da fogazza são os mesmos da pizza, cobrados à parte pelo preço
cadastrado no tamanho de fogazza. A Shalon decidiu que esse preço é o mesmo
da Tradicional; o painel oferece copiar os preços de um tamanho para outro,
e a cópia fica auditada.

### RN-FOG-006 — Disponibilidade compartilhada
Sabor esgotado esgota a pizza e a fogazza daquele sabor. A fogazza de um
sabor também pode ser pausada sozinha (por exemplo, falta de massa de
fogazza) sem afetar a pizza.

O contrário também vale: com os tamanhos de pizza de um sabor pausados e a
fogazza à venda, a pizza aparece indisponível no cardápio e a fogazza
continua à venda. O card de entrada fica disponível enquanto ele e a
categoria dele estiverem abertos e houver ao menos um sabor à venda.
*(D-2026-09-29-99.)*

### RN-FOG-007 — A fogazza se vende pelo card
A fogazza de um sabor só é vendida enquanto houver card de entrada
disponível para aquele tamanho de fogazza e aquela categoria de sabores.
Pausar o card — ou a categoria dele — pausa as fogazzas que ele oferece, sem
afetar as pizzas. O servidor aplica a regra em toda montagem de item
(cardápio, carrinho, checkout e balcão), não só na tela.
*(D-2026-09-29-99.)*

### RN-FOG-009 — Fogazza não tem tamanho
Produto do tipo fogazza nunca recebe tamanho: a fogazza comum tem preço
próprio, e o card de entrada vende os sabores. Um produto com tamanhos não
vira fogazza. O servidor recusa as duas coisas. *(D-2026-09-30-102.)*

### RN-FOG-010 — Preço de fim de semana da fogazza por sabor
Cada sabor pode ter, além do preço de fogazza, um **preço de fim de semana**,
opcional. Fim de semana é **sexta, sábado e domingo**, pelo **relógio** no
fuso da loja: um pedido às 00:30 de segunda já paga o preço de semana, e às
00:30 de sexta já paga o de fim de semana. Não segue o turno. Sem preço de
fim de semana, o sabor cobra o mesmo preço todos os dias. Vale só para a
fogazza por sabor; a fogazza comum, de preço próprio, não muda. Promoção
vigente continua valendo por cima de qualquer um dos dois (RN-PIZZA-005).
Como todo preço, é recalculado pelo servidor, e o carrinho não reserva o
preço de um dia para o outro. *(D-2026-10-14-119.)*

### RN-FOG-008 — Fogazza nos relatórios
Nos relatórios e no ranking do painel, a fogazza de cada sabor é linha
própria ("Calabresa · Fogazza"), separada da pizza do sabor e na categoria
do card de entrada. Vendas por categoria separam fogazza de pizza. O card de
entrada não aparece no ranking: quem vende são os sabores. O que identifica
a fogazza vendida é o tamanho do item (vendido como fogazza).
*(D-2026-09-30-101.)*

### RN-BEB-001
Cada apresentação de bebida é um produto independente, com preço e disponibilidade próprios.

---

## 9. Combos

### RN-COMBO-001
A V1 aceita somente combos fixos. O cliente não substitui componentes.

### RN-COMBO-002
Cada componente referencia produto/variação exatos e quantidade configurada.

### RN-COMBO-003
Pizza dentro de combo é uma configuração exata; não pode virar meio a meio nem trocar sabor/tamanho.

### RN-COMBO-004
Se qualquer componente obrigatório estiver indisponível, o combo fica automaticamente indisponível para novos pedidos.

### RN-COMBO-005
Quando todos os componentes voltarem a estar disponíveis, o combo pode voltar automaticamente, desde que o próprio combo esteja ativo/disponível.

### RN-COMBO-006
O preço do combo é próprio e não é recalculado automaticamente pela soma dos componentes.

### RN-COMBO-007
A venda do combo conta para popularidade pública do combo, não dos componentes. Relatórios internos podem contabilizar unidades físicas movimentadas pelos componentes.

### RN-COMBO-008
Observações podem ser registradas por componente quando aplicável.

---

## 10. Promoções

### RN-PROMO-001
Promoção da V1 é preço promocional simples.

### RN-PROMO-002
Promoção pode ter início/fim programados ou permanecer válida até desativação manual.

### RN-PROMO-003
Promoção pode atingir uma variação específica de produto ou um combo.

Produto com tamanho de pizza recebe promoção pela variação. A pizza de preço
único continua recebendo promoção no produto mesmo quando tem preço de
fogazza; a fogazza dela recebe promoção na variação de fogazza, e uma não
altera a outra. *(D-2026-09-29-100.)*

### RN-PROMO-004
Não são permitidos períodos promocionais conflitantes/sobrepostos para o mesmo alvo.

### RN-PROMO-005
Combo pode ter promoção própria sem alterar preços dos componentes.

### RN-PROMO-006
Limite promocional por pedido é opcional e independente do limite normal do produto. Quando ambos existirem, prevalece o mais restritivo.

### RN-PROMO-007
Em meio a meio, uma promoção consome seu limite somente quando efetivamente influencia/determina o preço final cobrado.

---

## 11. Mais pedidos, destaques e banners

### RN-POP-001
“Mais pedidos” é calculado automaticamente usando pedidos concluídos dos últimos 30 dias.

### RN-POP-002
Ranking é por quantidade vendida, não por faturamento.

### RN-POP-003
Exibir até 6 produtos elegíveis, ativos e disponíveis. Produto temporariamente indisponível sai do conjunto exibido enquanto durar a indisponibilidade.

### RN-POP-004
Produto novo não recebe impulso artificial.

### RN-POP-005 — Fogazza no "Mais pedidos"
A fogazza vendida soma no card de entrada que a vende (ex.: "Fogazza
salgada"), e não na pizza do sabor: é o card que o cliente abre no cardápio.
A pizza do sabor conta só pizzas. *(D-2026-09-30-101.)*

### RN-DEST-001
“Destaque/Recomendado pela Shalon” é escolha manual independente do ranking de vendas.

### RN-BANNER-001
Banner possui imagem, ordenação, período opcional e destino configurável.

### RN-BANNER-002
Destinos internos devem referenciar entidades do sistema, não URLs internas digitadas manualmente.

### RN-BANNER-003
Banner vinculado a promoção não pode aparecer fora da validade da promoção.

### RN-BANNER-004
Banner vinculado a produto temporariamente indisponível é ocultado e pode reaparecer quando o produto voltar, desde que ainda esteja dentro de suas demais regras de exibição.

---

# PARTE III — CARRINHO E EXPERIÊNCIA PÚBLICA

## 12. Busca e links

### RN-BUSCA-001
Busca pública considera nome, descrição, categoria e tamanhos oferecidos, sem diferenciar acentos ou caixa.

### RN-BUSCA-002
Produto ativo porém temporariamente indisponível pode aparecer na busca com indicação “Indisponível hoje”, sem possibilidade de adição.

Produto, categoria ou tamanho **inativo** não aparece no cardápio, na busca
nem pelo link direto — para ninguém, inclusive para a equipe logada no
painel. *(D-2026-09-30-103.)*

### RN-LINK-001
Produtos, combos e categorias podem possuir links compartilháveis.

### RN-LINK-002
Link de produto promocional expirado continua abrindo o produto, porém sempre com preço/regra atual.

---

## 13. Favoritos, carrinho e histórico local

### RN-FAV-001
Favoritos da V1 são persistidos localmente no navegador/dispositivo, sem sincronização entre dispositivos.

### RN-FAV-002
Produto temporariamente indisponível pode permanecer favoritado; produto estruturalmente inativo não precisa continuar visível no cardápio.

### RN-CART-001
Carrinho é persistido localmente e possui TTL de 24 horas desde a última alteração relevante.

### RN-CART-002
Cada alteração relevante renova o TTL.

### RN-CART-003
Fechamento da loja não apaga o carrinho; apenas impede checkout. Na reabertura, se ainda válido, o carrinho é revalidado.

### RN-CART-004
Itens com configuração idêntica podem ser agrupados em uma linha. Diferença de tamanho, sabores, borda, adicionais ou observação gera linha distinta.

### RN-CART-005
Quantidade maior que 1 é permitida, respeitando limites configurados.

---

## 14. Revalidação comercial

### RN-VALID-001
Antes da criação definitiva do pedido, o servidor deve revalidar preços, promoções, disponibilidade, tamanhos, meio a meio, bordas, adicionais, combos, componentes, limites e demais regras comerciais.

### RN-VALID-002
O carrinho não reserva preço nem promoção.

### RN-VALID-003
Mudança de preço, para cima ou para baixo, não pode ser silenciosa. O cliente deve ver a alteração e aceitá-la antes de finalizar.

### RN-VALID-004
Produto inativado enquanto estava no carrinho torna o item inválido e exige correção/remoção.

### RN-VALID-005
Valores enviados pelo frontend nunca são aceitos como autoridade financeira.

---

# PARTE IV — CLIENTE, ENTREGA E CHECKOUT

## 15. Cliente público

### RN-CLI-001
Não há cadastro com senha para cliente na V1.

### RN-CLI-002
Nome e WhatsApp são obrigatórios no primeiro pedido. Endereço é obrigatório somente para entrega. Exceção no lançamento manual interno, sem cliente cadastrado: nos canais Balcão e Telefone, em retirada ou entrega, o WhatsApp pode ser dispensado (D-2026-10-22-156 e D-2026-10-23-157); o nome continua obrigatório, salvo na retirada do balcão, e na entrega o endereço fica só no pedido.

### RN-CLI-003
WhatsApp é identificador operacional, mas não substitui a chave primária interna do cliente.

### RN-CLI-004
Mesmo dispositivo pode reconhecer cliente recorrente e preencher dados previamente conhecidos.

**Como funciona (D-2026-10-01-107).** A chave é a credencial que o navegador
guarda na primeira compra; o banco guarda só o hash e a liga ao cliente. Com
ela, o checkout recebe nome, WhatsApp e endereços salvos (o preferido
primeiro), mostra uma saudação curta e preenche **só campos vazios**. Na
entrega, o cliente escolhe um endereço salvo ou "Outro endereço"; escolhido
um salvo, a taxa é calculada sem precisar apertar "calcular". "Não sou eu"
revoga a credencial e limpa o que foi preenchido. Credencial inválida,
revogada ou de cliente bloqueado não devolve nada. O WhatsApp digitado nunca
serve de chave de busca (03 §12.1). A credencial é por endereço de site:
compra feita em um domínio não é reconhecida em outro.

### RN-CLI-005
Alteração de nome/WhatsApp em pedido novo pode atualizar o cadastro principal para uso futuro, sem alterar snapshots de pedidos antigos.

### RN-CLI-006
Cliente pode manter múltiplos endereços e definir um preferencial.

### RN-CLI-007
Consentimento de marketing é separado da execução do pedido e vem desmarcado por padrão.

### RN-CLI-008
Bloqueio de cliente impede novos pedidos. A razão interna não é exposta publicamente.

---

## 16. Endereço e cálculo de entrega

### RN-ENT-001
O cliente escolhe Entrega ou Retirada antes da etapa de endereço.

### RN-ENT-002
Retirada não usa geocodificação, distância nem taxa de entrega.

### RN-ENT-003
Endereço de entrega precisa ser validado/geocodificado com confiança suficiente antes de avançar.

### RN-ENT-004
Complemento e ponto de referência não participam do cálculo geográfico.

### RN-ENT-005
Em caso de ambiguidade, o fluxo pode oferecer ajuste de localização no mapa sem substituir o endereço textual.

### RN-ENT-006
A distância usada para taxa é distância real de rota viária fornecida pelo provedor configurado, não distância em linha reta.

### RN-ENT-007
O endereço da loja e suas coordenadas são configuráveis e constituem a origem da rota.

### RN-ENT-008
Cada seleção/edição de endereço exige novo cálculo; taxa antiga não deve ser reaproveitada como autoridade.

### RN-ENT-009
Faixas de distância e valores são configuráveis.

### RN-ENT-010
Dentro do raio de aprovação automática, a entrega segue fluxo normal com taxa da faixa correspondente.

### RN-ENT-011
Acima do raio automático, mas dentro da última faixa atendida, o pedido pode ser enviado com a taxa calculada e fica aguardando aprovação da entrega.

### RN-ENT-012
Além da distância máxima atendida, o checkout de entrega é bloqueado.

### RN-ENT-013
Pedido armazena snapshot de distância de rota e taxa aplicada.

### RN-ENT-014
Override manual de taxa é excepcional, permissionado e auditado. Se alterar total de pedido já enviado, exige aceite do cliente antes de prosseguir.

### RN-ENT-015 — Fronteira das faixas de distância
As faixas usam a convenção **`(min, max]`**: a faixa cobre distâncias **acima** de `min_distance_km` e **até** `max_distance_km` inclusive. A faixa cuja distância inicial é `0` cobre também a distância `0`.

A convenção é única e obrigatória em toda a V1 — configuração, cálculo e validação —, de modo que cada distância pertença a **exatamente uma** faixa ativa: sem sobreposição e sem buraco entre faixas contíguas.

Distância não coberta por faixa ativa alguma **nunca** produz taxa zero: o resultado é entrega fora de área, conforme RN-ENT-012. *(Decisão aprovada em 18/09/2026; histórico em `docs/00-DECISOES.md` D-2026-09-18-21.)*

### RN-ENT-016 — Taxa a confirmar quando o endereço não é localizado
Exceção controlada a RN-ENT-003, só no pedido do cliente: quando o endereço não é localizado ou a rota não pode ser medida (não quando está fora de área), o cliente pode enviar com a taxa **a confirmar pela loja, até o teto** — a maior taxa entre as faixas ativas, mostrada antes do envio. O pedido nasce aguardando aprovação de entrega; aprovar exige informar a taxa (de 0 ao teto), com `orders.override_delivery_fee`, e a taxa fica auditada e guardada no endereço do cliente. Acima do teto, a loja recusa ou combina com o cliente. Pix antecipado não é aceito nesse caso, e o troco precisa cobrir subtotal + teto. Nunca há taxa R$ 0,00 por omissão: sem a taxa informada, a entrega não é aprovada. *(Decisão de 17/10/2026; D-2026-10-17-149.)*

---

## 17. Pagamentos no checkout

### RN-PGTO-001
Métodos disponíveis vêm do cadastro ativo da Shalon.

### RN-PGTO-002
Pagamento selecionado/esperado e pagamento efetivamente realizado são dados distintos.

### RN-PGTO-003
Relatórios financeiros usam o pagamento efetivamente realizado.

### RN-PGTO-004
Checkout público aceita um método por pedido. O modelo interno pode registrar pagamentos efetivos divididos quando necessário.

### RN-PGTO-005 — Dinheiro
Se o cliente precisar de troco, informa “troco para quanto”. O valor informado não pode ser inferior ao total. O troco esperado é calculado e exibido operacionalmente.

### RN-PGTO-006 — Cartões/voucher
Débito, crédito e voucher usam somente bandeiras/opções ativas cadastradas para o tipo correspondente.

### RN-PGTO-007 — Pix na maquininha
Pix físico na maquininha segue fluxo operacional equivalente aos demais meios físicos.

### RN-PGTO-008 — Pix antecipado
Pix por chave só aparece se os dados estiverem configurados e ativos.

### RN-PGTO-009
Com Pix antecipado, comprovante é enviado por WhatsApp na V1; não há upload público de comprovante dentro do sistema.

### RN-PGTO-010
Selecionar Pix antecipado não significa pagamento confirmado. O pedido permanece “Aguardando confirmação do Pix” até confirmação manual autorizada.

### RN-PGTO-011
Confirmação manual do Pix registra responsável e horário.

### RN-PGTO-012 — Registrar o recebimento é um ato próprio
O pagamento efetivamente recebido é registrado por um ato explícito de
usuário autorizado (`payments.register`), com responsável e horário. Nenhum
estado do pedido cria recebimento sozinho, e confirmar Pix antecipado
(RN-PGTO-010) **não** é registrar recebimento: são etapas distintas.

Na retirada, a conclusão do pedido exige o recebimento já registrado — é o
que o invariante 13 de §44 manda impedir ("conclusão de retirada apenas por
ter ficado pronta") e o que `01 §79.18` pede ("na retirada, confirmar
pagamento efetivo quando pendente"). A direção é essa e não a inversa:
concluir não cria receita; ela precisa já existir para concluir.

Na entrega, `01 §79.18` põe essa confirmação no **retorno do entregador**, que
é prestação de contas da Fase 8. A regra que sustenta essa separação é
**RN-PGTO-014**: pedido entregue não é valor recebido.

Decisão de 21/09/2026 (D-2026-09-21-54).

**Na tela, entrega começa em "Receber na entrega" (D-2026-10-01-110).**
Enquanto o pedido de entrega não saiu, o recebimento abre com "Receber na
entrega" marcado — nada é registrado, e o motoboy cobra na porta. A um toque
fica "Cliente já pagou na loja", que registra na hora (dinheiro na gaveta) e
faz a comanda sair como **PAGO - NAO COBRAR**, sem troco. Depois que o pedido
sai, o que se registra é o que o motoboy recebeu: dinheiro "com o motoboy"
(fora da gaveta) até o acerto. Nada disso é bloqueio no banco: pagar antes da
entrega é um caso real e continua permitido.

### RN-PGTO-013 — Um ato de registro por pedido, com quantas formas precisar
O pagamento dividido de RN-PGTO-004 é **um** ato com várias linhas — R$ 30 em
dinheiro e R$ 25 no débito são duas linhas do mesmo registro, não dois
pagamentos pela metade. A soma das linhas tem de fechar exatamente com o
total do pedido, sem tolerância de arredondamento, e a conferência acontece
no servidor.

Cada linha usa forma ativa e, quando a forma exige, bandeira ativa daquela
forma. Duas linhas da mesma forma e bandeira são recusadas: é uma linha só,
com o valor somado.

Corrigir um recebimento é estorná-lo e registrar outro — não editar o
existente (RN-FIN-003).

> **Complemento (D-2026-10-17-154):** depois de um acréscimo (RN-ALT-008) num pedido já pago, um segundo ato de registro recebe exatamente o que falta. Nunca mais que o total.

### RN-PGTO-014 — Pedido entregue não é valor recebido
Concluir uma entrega registra que o pedido **chegou ao cliente**. Não registra
recebimento, não reconhece receita e não coloca dinheiro em caixa nenhum.

```text
pedido entregue  ≠  valor conciliado/recebido pela Shalon
```

Enquanto o valor de uma entrega não for conciliado, ele não é dinheiro físico
no caixa (RN-CAIXA-014), é contabilizado à parte (RN-CAIXA-017) e aparece
destacado no fechamento (RN-CAIXA-013). A conclusão da entrega **não** exige o
recebimento registrado — diferente da retirada (RN-PGTO-012) — porque a
confirmação do valor que estava com o entregador acontece no retorno dele.

**A Fase 8 usa esta regra** ao implementar retorno e prestação de contas: o
que ela conciliará é justamente o que esta regra mantém separado. Nada aqui
autoriza tratar um pedido concluído como pago.

Decisão aprovada em 21/09/2026 (D-2026-09-21-54, confirmada no complemento).


### RN-PGTO-015 — Fiado: pagamento deixado para depois
Com a permissão `orders.defer_payment`, um pedido de **cliente identificado** pode ficar para pagar depois. Fiado **não é pagamento**: o status financeiro continua pendente e nada entra no caixa nem no dinheiro do motoboy, que vêm só dos pagamentos registrados. Registra-se quem autorizou, quando e uma observação.

- retirada em fiado pode ser concluída sem pagamento (exceção a RN-PGTO-012);
- na entrega, a comanda diz "FIADO - NAO COBRAR";
- o fiado sai da fila de cobrança do dia e fica na ficha do cliente; quando ele pagar, o recebimento normal entra no caixa aberto daquele dia, e a receita conta ali;
- desfazer exige motivo e não vale para retirada já concluída no fiado;
- tudo é auditado. Sem limite por cliente; o balcão avisa quando o cliente tem fiado em aberto. *(Decisão de 17/10/2026; D-2026-10-17-153.)*

---

## 18. Revisão e envio

### RN-CHK-001
Antes do envio, mostrar resumo completo: itens, customizações, modalidade, endereço quando houver, taxa, pagamento, troco, observações e total.

### RN-CHK-002
A última revalidação server-side ocorre antes da criação definitiva.

### RN-CHK-003
Pedido enviado pelo cliente não é apresentado como automaticamente confirmado. Mensagem inicial deve comunicar recebimento e espera de confirmação da Shalon.

### RN-CHK-004
Não existe gorjeta estruturada na V1. Valor dado diretamente ao motoboy fica fora de receita e conciliação do sistema.

---

# PARTE V — PEDIDOS E MÁQUINA DE ESTADOS

## 19. Regra geral de estado

Estados não podem ser alterados arbitrariamente por simples edição de coluna. Transições devem ocorrer por operações de domínio autorizadas, validando estado atual, permissões, pré-condições, efeitos financeiros e auditoria.

---

## 20. Estados conceituais principais

O modelo pode implementar nomes técnicos próprios, mas deve representar pelo menos:

- aguardando confirmação do Pix;
- aguardando aprovação da entrega;
- aguardando confirmação da pizzaria;
- alteração necessária / aguardando cliente;
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

Estados de espera especiais podem preceder a confirmação operacional.

---

## 21. Transições obrigatórias

### RN-STATE-001 — Pix antecipado
Pedido com Pix antecipado não pode ser liberado à produção antes da confirmação manual do recebimento.

`AGUARDANDO_PIX -> AGUARDANDO_CONFIRMACAO`

Somente após confirmação autorizada.

### RN-STATE-002 — Entrega fora da área automática
Pedido dentro da área máxima, porém fora do raio automático:

`AGUARDANDO_APROVACAO_ENTREGA -> AGUARDANDO_CONFIRMACAO`

ou

`AGUARDANDO_APROVACAO_ENTREGA -> REJEITADO`

A rejeição registra motivo e fica visível no acompanhamento em forma adequada ao cliente.

### RN-STATE-003 — Aceitação
Somente pedido com todas as pré-condições resolvidas pode ser aceito.

`AGUARDANDO_CONFIRMACAO -> CONFIRMADO/ACEITO`

### RN-STATE-004 — Produção
Pedido aceito pode avançar para produção.

`CONFIRMADO -> EM_PRODUCAO`

### RN-STATE-005 — Retirada
Fluxo normal:

`EM_PRODUCAO -> PRONTO_RETIRADA -> CONCLUIDO/RETIRADO`

“Pronto” não equivale a concluído.

### RN-STATE-006 — Entrega
Fluxo normal:

`EM_PRODUCAO -> PRONTO_ENTREGA -> SAIU_ENTREGA -> CONCLUIDO/ENTREGUE`

### RN-STATE-007 — Saída de entrega
Vinculação do pedido a uma saída de entrega/motoboy é a operação que o coloca como “Saiu para entrega”.

**Como (D-2026-10-27-172).** O "Despachar" da tela Pedidos é **"Saiu com…"**:
escolhe-se o motoboy (entregadores ativos, sem quem faltou hoje) e o pedido é
vinculado e despachado num ato; motoboy já na rua leva o pedido na mesma saída.
O servidor recusa pôr entrega na rua sem vínculo ativo. "Concluir" e "Falhou" de
entrega vinculada registram o retorno daquela saída; sem entrega pendente, a
saída vai para o acerto.

### RN-STATE-008 — Falha
Falha de entrega:

`SAIU_ENTREGA -> ENTREGA_NAO_REALIZADA`

com motivo obrigatório. A equipe decide posteriormente entre nova tentativa e encerramento/cancelamento autorizado.

### RN-STATE-009 — Rejeição
Rejeição ocorre antes da aceitação operacional e exige motivo configurável/registrado.

### RN-STATE-010 — Cancelamento
Cancelamento é distinto de rejeição, nunca apaga o pedido e exige motivo, responsável e timestamp.

---

## 22. Alteração de pedido após envio

### RN-ALT-001
Cliente não edita livremente pedido já enviado.

### RN-ALT-002
Shalon pode solicitar alteração e contatar o cliente via WhatsApp.

### RN-ALT-003
Alteração registra estado anterior, proposta, responsável, horário e diferenças relevantes.

### RN-ALT-004
Se a alteração modificar itens ou total, o cliente precisa aprová-la pelo acompanhamento antes do pedido prosseguir.

### RN-ALT-005
A tela de aprovação mostra mudança e total anterior/novo.

### RN-ALT-006
Sem resposta do cliente não há produção automática nem cancelamento automático.

### RN-ALT-007
Após aprovação, novos snapshots/revisões preservam o histórico anterior em vez de sobrescrevê-lo silenciosamente.

### RN-ALT-008 — Acréscimo pedido pelo cliente
Exceção controlada a RN-ALT-004: quando o **próprio cliente** pede mais itens (por WhatsApp, telefone ou no balcão), a equipe com `orders.request_change` pode **acrescentar** itens ao pedido até ele sair para entrega ou ser concluído, sem aprovação pelo acompanhamento. O canal é obrigatório e fica registrado como o aceite do cliente. Só acréscimo: tirar ou trocar itens segue RN-ALT-004. Os itens novos são precificados pelo servidor; os que já estavam não são reprecificados. Fica uma revisão aplicada do tipo acréscimo (RN-ALT-007), auditada, e a comanda de **ACRÉSCIMO** lista só os itens novos, mantendo a comanda anterior válida. Pedido já pago passa a ter "falta receber" a diferença, recebida como complemento (RN-PGTO-013). *(Decisão de 17/10/2026; D-2026-10-17-154.)*

---

## 23. Solicitação de cancelamento pelo cliente

### RN-CANC-001
Cliente pode solicitar cancelamento enquanto a regra operacional permitir, informando motivo.

### RN-CANC-002
Solicitação não cancela automaticamente o pedido; Shalon decide.

### RN-CANC-003
Em estágios tardios, o sistema pode orientar contato por WhatsApp.

---

## 24. Pedidos manuais

### RN-MAN-001
Atendente pode registrar pedidos recebidos por WhatsApp, telefone, balcão, iFood ou outro canal.

### RN-MAN-002
A origem do pedido é preservada para relatórios.

### RN-MAN-003
Pedido manual deve respeitar as regras estruturais do domínio e não deve virar atalho para corromper preços, estados ou histórico.

### RN-MAN-004 — Estado inicial: o lançamento interno já é o aceite
Pedido público é **solicitação** do cliente e aguarda a confirmação da Shalon.
Pedido manual é **registro** de um pedido que a Shalon já recebeu e já aceitou
por outro canal — balcão, telefone, WhatsApp, iFood ou outro. Por isso o
pedido manual criado por usuário interno autorizado nasce **aceito/liberado
para operação**, sem exigir o segundo gesto de "aceitar".

A aceitação ocorrida na criação deve ser identificável: autor e horário do
aceite ficam registrados como ficariam se viessem do comando de aceite, e o
histórico e a auditoria dizem que o lançamento e o aceite foram o mesmo ato.

Decisão de 21/09/2026, que resolve a lacuna registrada em D-2026-09-19-48.

### RN-MAN-005 — Nascer aceito é o caso sem bloqueio
RN-MAN-004 não contorna bloqueio normativo nenhum. Quando existe condição que
impeça a liberação operacional, o pedido manual preserva o estado/bloqueio
correspondente em vez de ser forçado para a produção. Em particular:

- Pix antecipado por chave continua aguardando confirmação do recebimento
  (RN-PGTO-010, §23 do CLAUDE.md);
- entrega acima do raio automático continua aguardando aprovação
  (RN-ENT-011).

Só quando nada bloqueia o pedido manual nasce aceito. A consequência prática
para a comanda é a regra de sempre: ela sai porque o pedido está liberado
(RN-PRINT-001), e não sai enquanto houver bloqueio.

### RN-MAN-006 — Pausa fecha o público, não o balcão
A pausa/fechamento operacional do canal público bloqueia novos checkouts
públicos (RN-LOJA-002) e **não** impede usuário interno autorizado de criar
pedido manual. Mesmo com o link público pausado continuam podendo ser
registrados pedidos de balcão, telefone, WhatsApp, iFood e outros canais
manuais permitidos.

Isso não reabre o checkout público e não afrouxa mais nada: o pedido manual
continua sujeito às permissões, às regras de catálogo, à disponibilidade dos
produtos, aos preços, às compatibilidades e aos demais bloqueios operacionais
aplicáveis. Pausa da loja **não** é autorização para vender produto
indisponível.

Decisão de 21/09/2026, que promove a interpretação registrada em
D-2026-09-19-49.

### RN-MAN-007 — O balcão reconhece o cliente pelo WhatsApp exato
No lançamento manual, ao informar o WhatsApp **completo** de um cliente já
cadastrado, a equipe vê:

- resumo: nome, cliente desde, pedidos concluídos, último pedido e ticket médio;
- endereços salvos ativos, sem repetir o mesmo endereço, o preferencial
  primeiro, com a opção de digitar outro;
- o último pedido (não cancelado nem rejeitado), para repetir;
- o que ele mais pede (produto + tamanho, em pedidos concluídos, só o que está
  ativo), para adicionar com um toque;
- a forma de pagamento que ele mais usa, e se costuma pedir troco.

Tudo isso é **sugestão**. Preenche só campos vazios, nunca sobrescreve o que o
atendente digitou. Item repetido ou sugerido entra **reprecificado pelo
cardápio de hoje** (preço, promoção e disponibilidade atuais); o que não pode
mais ser vendido não entra, e a tela diz por quê. O pedido continua sendo
recalculado inteiro na criação.

Endereço salvo escolhido só é reaproveitado se for **deste** cliente, estiver
ativo e igual ao digitado; qualquer diferença vira endereço novo.

**Cliente bloqueado:** a tela avisa, com o motivo interno, e não deixa lançar.
A recusa de verdade continua em `criar_pedido` (RN-CLI-008). O motivo é da
equipe e nunca é repassado ao cliente.

Não é busca: número incompleto não consulta nada. Exige `orders.create_manual`
e `customers.view`. Favoritos continuam locais ao aparelho do cliente (§30 do
`CLAUDE.md`) e não aparecem aqui; "mais pedidos" cumpre esse papel no balcão.

Decisão de 30/09/2026 (D-2026-09-30-104).

---

# PARTE VI — ACOMPANHAMENTO PÚBLICO

## 25. Acesso

### RN-TRACK-001
Cada pedido público possui token individual, imprevisível e seguro.

### RN-TRACK-002
Token de um pedido concede acesso somente ao acompanhamento daquele pedido.

### RN-TRACK-003
Histórico completo do cliente não pode ser recuperado apenas digitando número de WhatsApp.

### RN-TRACK-004
“Meus pedidos/Histórico” no mesmo dispositivo utiliza credencial/token local persistente adequado; favoritos continuam exclusivamente locais.

### RN-TRACK-005
Compartilhamento do acompanhamento envia somente informação mínima necessária, como número do pedido e link seguro, sem expor endereço/telefone/valor desnecessariamente.

### RN-REORDER-001
“Pedir novamente” cria carrinho novo usando catálogo, disponibilidade, preços e regras atuais.

### RN-REORDER-002
Pedido antigo permanece imutável.

### RN-REORDER-003
Observações antigas podem ser reaproveitadas, mas devem poder ser editadas/removidas antes do novo envio.

---

# PARTE VII — IMPRESSÃO 58 MM

## 26. Comanda de produção

### RN-PRINT-001
Comanda de produção só é gerada/impressa depois que o pedido estiver efetivamente aceito e liberado.

### RN-PRINT-002
Não imprimir pedido ainda aguardando Pix, aprovação de entrega, alteração do cliente ou confirmação da pizzaria.

### RN-PRINT-003
Comanda prioriza informação operacional: número/hora, entrega ou retirada, itens, quantidades, sabores, tamanho, borda, adicionais, remoções/observações e demais instruções necessárias à produção.

**Ampliada em 17/10/2026 (D-2026-10-17-147):** como a comanda também é o papel do motoboy, ela termina com os valores calculados pelo servidor — subtotal, taxa de entrega (na entrega) e TOTAL em destaque —, seguidos de como cobrar (pago, troco ou forma de pagamento).

### RN-PRINT-004
Reimpressão é permitida e registrada.

### RN-PRINT-005
Alteração posterior à impressão preserva a impressão anterior e gera documento visualmente distinto identificado como **ALTERAÇÃO**, contendo as mudanças relevantes.

### RN-PRINT-006
A impressão é não fiscal e direcionada ao equipamento 58 mm previsto no escopo.

> **Ampliada por D-2026-10-08-116.** A impressão é não fiscal e pode sair em
> papel de **58 mm (32 colunas)** ou de **80 mm (42 colunas** — eram 48 até
> 13/10/2026, reduzidas para a letra ficar maior). A largura e o
> caminho até a impressora são configurados **por aparelho**, não por loja. O
> conteúdo da comanda é o mesmo nas duas larguras; muda só a quebra das linhas.

---

# PARTE VIII — CAIXA E FINANCEIRO

## 27. Sessão de caixa

### RN-CAIXA-001
Uma sessão de caixa é necessária para operação normal de vendas.

### RN-CAIXA-002
Abertura registra responsável, timestamp e fundo inicial. Fundo inicial pode ser R$ 0,00.

### RN-CAIXA-003
Exceção à exigência de caixa depende de permissão específica.

### RN-CAIXA-004
Sessão é operacional e não limitada à meia-noite. Uma sessão iniciada em um dia pode ser encerrada no dia seguinte.

### RN-CAIXA-005
Meia-noite nunca fecha, cria ou troca automaticamente uma sessão.

### RN-CAIXA-006
Pode haver várias sessões no mesmo dia, mas somente uma ativa por ponto de caixa.

### RN-CAIXA-007
Caixa esquecido aberto não é fechado automaticamente. O sistema alerta.

---

## 28. Movimentos físicos

### RN-CAIXA-008 — Sangria
Sangria representa retirada física de dinheiro do caixa e reduz o caixa físico esperado.

### RN-CAIXA-009 — Reforço
Reforço/suprimento representa dinheiro físico adicionado e aumenta o caixa físico esperado.

### RN-CAIXA-010 — Despesa
Despesa representa gasto do negócio. Se paga com o caixa da sessão, reduz o físico esperado. Não deve ser confundida com sangria.

### RN-CAIXA-010-A — Saída rápida da gaveta
Quem opera o caixa (`cash.adjust`) registra qualquer saída de dinheiro da gaveta
num só gesto, escolhendo o motivo: **pagamento do motoboy**, **compra** ou
**outro** são despesa paga pelo caixa (lançamento no Financeiro, na categoria do
motivo, mais a saída da gaveta); **retirada da dona** é sangria. "Outro" exige
dizer para que foi. A saída não pode ser maior que o esperado na gaveta
(D-2026-10-27-171).

Na implementação isso são **dois registros com significados diferentes**: o
lançamento (`financial_entries`) diz que houve um gasto, com categoria e
motivo; o movimento (`cash_movements`) diz que saiu dinheiro da gaveta. Uma
conta paga por transferência gera o primeiro e não o segundo. Uma sangria
gera o segundo e não o primeiro.

### RN-CAIXA-017 — Dinheiro que não entrou na gaveta
Recebimento em dinheiro pode ser registrado sem ter entrado na gaveta — é o
caso do valor que ainda está com quem entregou. Esse dinheiro **não** entra no
esperado em caixa (RN-CAIXA-014), é contabilizado à parte e aparece
destacado no fechamento (RN-CAIXA-013). Pedido cancelado ou rejeitado sai
dessa conta, mas o pagamento registrado permanece no histórico.

Cartão, Pix e voucher nunca entram no esperado em caixa: eles são
recebimento, e aparecem no fechamento em bloco separado do dinheiro físico.

### RN-CAIXA-018 — Pagar não avança a produção

O eixo financeiro (`payment_status`) e o eixo operacional (`status`) do pedido
são independentes. Registrar o pagamento **não** conclui o pedido, **não** o
coloca em produção e **não** o marca como pronto. Um pedido pode ser pago
enquanto está no forno, e um pedido pronto pode seguir sem pagamento.

A única dependência existente é no sentido inverso e já valia: concluir uma
**retirada** exige pagamento confirmado.

Decisão de 25/09/2026 (`D-2026-09-25-78`). Desenho do fluxo em
`09-PDV-FRENTE-DE-CAIXA.md` §1.1.

### RN-CAIXA-019 — Cancelar pedido pago exige estorno

Pedido com pagamento confirmado **não pode ser cancelado sozinho**. O
cancelamento simples é recusado; cancelar exige o **estorno financeiro na mesma
transação**, com motivo e com as permissões de cancelar **e** de estornar.

Não pode existir pedido cancelado com pagamento confirmado e sem estorno: seria
dinheiro retido sem venda e sem registro de devolução.

Consequência herdada e desejada: recebimento em dinheiro cuja sessão já fechou
só pode ser estornado com **caixa aberto** — tirar dinheiro exige gaveta aberta.

Decisão de 25/09/2026 (`D-2026-09-25-78`). Desenho em
`09-PDV-FRENTE-DE-CAIXA.md` §1.5.

---

## 29. Fechamento

### RN-CAIXA-011
Fechamento calcula caixa esperado e compara com valor contado.

### RN-CAIXA-011-A — O fundo antes da contagem
Quando o caixa foi aberto com fundo maior que zero, o fechamento pergunta, antes
da contagem, se o fundo ainda está na gaveta: **sim** (conta-se tudo, fundo
incluído), **a dona levou tudo** ou **a dona levou só uma parte** (informa-se
quanto, menos que o fundo). Levar o fundo, inteiro ou em parte, é registrado
como retirada da dona (sangria, RN-CAIXA-010-A) e sai do esperado. O fundo
**continua** no esperado quando fica na gaveta: não é excluído por regra. Se já
há retiradas da dona registradas no caixa, a pergunta avisa, para não registrar
o fundo duas vezes. A contagem continua cega (D-2026-10-27-173).

### RN-CAIXA-012
Diferença positiva ou negativa não impede necessariamente o fechamento, mas exige justificativa e auditoria.

### RN-CAIXA-012-A — Causas antes da justificativa
Com diferença, antes de pedir a justificativa o fechamento mostra o que o
sistema encontrou no turno e pode explicá-la — dinheiro registrado fora da
gaveta, nenhuma saída registrada (quando falta), forma registrada diferente da
escolhida no pedido, pedidos sem recebimento e vendas com troco — cada um com o
gesto que corrige. Depois de corrigir, o caixa é conferido de novo com a mesma
contagem; se bater, fecha. A justificativa pode ser feita marcando causas
("venda fora do sistema", "preço diferente", "dinheiro tirado sem registrar",
"troco errado", "não sei explicar") e um texto opcional.

Dinheiro registrado fora da gaveta que de fato entrou entra no caixa **do turno
em que foi recebido**. Turno fechado é corrigido como em RN-CAIXA-016: esperado
e diferença recalculados, original preservado, contagem física intocada, e
exige permissão de corrigir caixa fechado (D-2026-10-27-171).

### RN-CAIXA-013
Caixa pode ser fechado com saídas de motoboy ainda pendentes, desde que o sistema destaque a pendência.

### RN-CAIXA-014
Dinheiro ainda com motoboy não é considerado dinheiro recebido fisicamente no caixa.

### RN-CAIXA-015
Sessão fechada não pode ser editada/reaberta por atendente comum.

### RN-CAIXA-016
Correção/reabertura excepcional exige Owner/Admin ou permissão específica, motivo obrigatório e auditoria, preservando o fechamento original.

### RN-CAIXA-017 — Pedidos do turno e o que ficou sem recebimento
O "Vendido na sessão" conta os pedidos **do turno**: os que têm pagamento
confirmado na sessão e os criados entre a abertura e o fechamento que ainda não
têm pagamento confirmado em caixa nenhum (já aceitos; cancelado e recusado
ficam fora). Um pedido conta numa sessão só: recebido depois em outra sessão,
passa a contar nela. Os pedidos do turno sem recebimento no caixa aparecem no
fechamento — antes da contagem e no relatório — com acesso ao pedido para
registrar o recebimento. Os valores em dinheiro não mudam: recebido, esperado e
diferença continuam sendo só o que entrou na sessão (D-2026-10-27-169).

---

## 30. Movimentos financeiros

### RN-FIN-001
Categorias de entradas e despesas são configuráveis por usuário autorizado.

### RN-FIN-002
Movimento financeiro registra categoria, valor, data, descrição/observação, responsável e comprovante opcional quando aplicável.

O comprovante é **evidência, não confirmação**: anexá-lo não muda estado, não
reconhece receita e não dispensa confirmação manual de pagamento
(RN-PGTO-010). O sistema guarda o arquivo e **não o interpreta** — não há
leitura automática de valor, data ou beneficiário.

Comprovante é dado financeiro privado: fica em armazenamento privado, o acesso
depende de `finance.view` e é feito por URL assinada curta (03 §23.2).
Enquanto o lançamento puder ser alterado, o comprovante pode ser substituído
ou removido, sempre com registro de quem e por quê. **Depois do estorno a
evidência congela**: é ela que explica o que foi registrado, e a reversão não
a apaga (RN-FIN-003).

### RN-FIN-003
Movimento confirmado não é apagado ou sobrescrito para correção.

### RN-FIN-004
Correção ocorre por estorno/reversão autorizada, com motivo, responsável e timestamp. O movimento original permanece preservado e o movimento correto é novo registro.

### RN-FIN-004-A
Trocar a forma de um pagamento confirmado (registrada errada, ou o cliente pagou de outro jeito) é um ato único: o pagamento original é estornado e o correto é registrado novo, **na sessão de caixa original** do pagamento e com o mesmo dia de recebimento. Se essa sessão já fechou, o fechamento original é preservado como correção (antes/depois, motivo e responsável), esperado e diferença são recalculados e a contagem física não muda. Exige permissão de estornar e de registrar pagamento, com motivo (D-2026-10-24-167).

### RN-FIN-005
Sem modelo de custos completo, o sistema não deve chamar saldo operacional de lucro líquido, margem real ou CMV.

---

# PARTE IX — ENTREGADORES E PRESTAÇÃO DE CONTAS

## 31. Motoboys

### RN-MOTO-001
Motoboy pode existir como funcionário sem usuário/login.

### RN-MOTO-002
A V1 não exige aplicativo/login do motoboy.

### RN-MOTO-003
Atendente autorizado controla associação, estados e prestação de contas.

### RN-MOTO-004 — O que a prestação de contas concilia
O valor de uma entrega concluída permanece **não conciliado** até a prestação
de contas do entregador (RN-PGTO-014). É esse valor que o acerto confronta —
não o estado do pedido, que já está concluído desde a entrega.

---

## 32. Saída de entrega

### RN-RUN-001
Uma “Saída de entrega” agrupa um ou mais pedidos associados a um motoboy.

### RN-RUN-002
Registra motoboy, pedidos, horário de saída e valores esperados por meio de pagamento.

### RN-RUN-003
Retorno permite registrar valores efetivamente recebidos e conciliar a saída.

**Como (D-2026-10-01-111).** O recebimento de cada entrega é registrado **no
próprio acerto**: cada pedido entregue sem pagamento tem "Receber", com a
forma esperada já marcada e o dinheiro como "com o motoboy". Cartão e Pix na
maquininha não entram no "deveria trazer em dinheiro". O acerto **só conclui
quando toda entrega concluída da corrida tem recebimento** — o banco recusa
antes disso. Concluir recolhe para a gaveta exatamente o dinheiro registrado;
"quanto ele trouxe" só confere contra esse valor e registra a diferença. Não
existe caminho para dinheiro da rua entrar no caixa sem pedido por trás.

### RN-RUN-004
Diferença registra valor, motivo, responsável, data/hora, notas e anexo opcional.

**Quem faz o acerto (D-2026-10-27-172).** Quem monta a saída (`deliveries.manage`)
conclui o acerto quando o motoboy traz exatamente o esperado. Com diferença, só
quem pode conciliá-la (`deliveries.settle`).

### RN-RUN-005
Diferença de motoboy nunca gera desconto salarial automático.

### RN-RUN-006
Usuário financeiro autorizado decide separadamente se a ocorrência deve gerar lançamento no histórico financeiro do funcionário.

**Como (D-2026-10-01-112).** A diferença do acerto (o motoboy trouxe menos ou
mais do que o recebido registrado) tem dois efeitos, e nenhum é desconto:
1. **No caixa**, entra um movimento próprio, de falta (saída) ou sobra
   (entrada), ligado ao acerto e com o motivo. A gaveta passa a esperar o que
   entrou de fato, e o fechamento mostra a linha "Diferenças de motoboy" sem
   cobrar justificativa de novo. A venda continua sendo o que o cliente pagou.
2. **No histórico do motoboy** (Equipe › Livro), a diferença fica
   **pendente** até alguém com `employees.finance.manage` decidir, uma vez só:
   **"Lançar no funcionário"** (falta vira lançamento de diferença no livro
   dele, ligado à corrida) ou **"Não lançar"** (arquivada, com motivo). O
   lançamento só vale para quem fez a corrida.

### RN-RUN-007
Entrega não realizada não é tratada como dinheiro recebido pelo motoboy.

### RN-RUN-008 — Transferência excepcional de entrega já em rota
Decisão de 22/09/2026, que resolve a lacuna registrada em `D-2026-09-22-57`
(item A-18).

Depois que o pedido sai (`out_for_delivery`), **não existe troca de motoboy**.
Existe **transferência de responsabilidade**, que é outra coisa e é excepcional.

O caso real é "a moto do João quebrou e o Pedro foi buscar uma das entregas".

1. A transferência é **por pedido**, não pela corrida. Uma corrida com três
   pedidos pode ter só um transferido; os outros continuam com quem saiu.
2. **Motivo é obrigatório.**
3. O registro preserva, e nunca reescreve: motoboy anterior, motoboy novo,
   pedido, corrida de origem, corrida de destino, horário, usuário interno
   responsável e motivo. O vínculo antigo permanece com situação
   `transferred` — quem saiu com o pedido é um fato, não um campo editável.
4. **O pedido continua em rota.** Nada aqui o devolve para "pronto": o que
   mudou foi a responsabilidade operacional, não o estado da entrega.
5. Entrega já **concluída ou não realizada** não se transfere por fluxo comum.
   Pedido cujo dinheiro **já entrou no caixa** também não.
6. Funcionário **inativo** não recebe transferência.
7. Se a transferência esvaziar a corrida de origem, ela passa a "voltou — a
   acertar": não há mais o que entregar, e quem saiu tem contas a prestar.

A transferência **não move dinheiro**: não cria pagamento, não cria movimento
de caixa e não altera recebimento nenhum.

### RN-RUN-009 — Quem responde pelo dinheiro depois da transferência
Dinheiro **já recebido** continua sob responsabilidade de **quem o recebeu**,
mesmo que a entrega passe a outro. Dinheiro **ainda não recebido** passa com a
entrega.

Consequência obrigatória: o mesmo recebimento **nunca** pode aparecer em duas
corridas. O acerto de cada entregador cobra o que lhe cabe, e o total de
dinheiro na rua continua existindo uma vez só (RN-CAIXA-014).

---

# PARTE X — FUNCIONÁRIOS E MOVIMENTOS INTERNOS

## 33. Funcionários

### RN-FUNC-001
Funcionário com histórico nunca é fisicamente apagado. Deve ser inativado/desligado.

### RN-FUNC-002
Revogar acesso não apaga a entidade funcionário nem seus vínculos históricos.

### RN-FUNC-003
Dados salariais e histórico financeiro sensível não ficam acessíveis ao atendente apenas porque ele pode registrar uma ocorrência/consumo.

---

## 34. Consumo de funcionário e proprietário

### RN-CONS-001
Consumo de funcionário é movimento interno, não venda e não receita.

### RN-CONS-002
Registra funcionário, itens, quantidades, valores de referência, responsável e demais evidências aplicáveis.

### RN-CONS-003
Quando utilizado o fluxo de assinatura, pode gerar comprovante 58 mm e foto/anexo.

### RN-CONS-004
Consumo do proprietário também é movimento interno e deve ser distinguido do consumo de funcionário.

### RN-CONS-005
Nenhum consumo interno gera desconto salarial automático.

---

## 35. Cortesia e perda

### RN-CORT-001
Cortesia possui classificação própria e não é receita normal.

### RN-CORT-002
Cortesia exige motivo e autorizador, preservando itens/quantidades e valores de referência.

### RN-PERDA-001
Perda/descarte registra produto, quantidade, motivo, notas, responsável e timestamp.

### RN-PERDA-002
Perda não realiza baixa de ingredientes na V1; serve para controle gerencial de produtos/movimentos.

### RN-CLASS-001
Relatórios devem distinguir, quando aplicável: **Venda × Cortesia × Consumo de funcionário × Consumo do proprietário × Perda/Descarte**.

---

## 36. Adiantamentos e histórico financeiro de funcionário

### RN-EMPFIN-001
Adiantamento pode registrar valor, data, motivo, notas, forma de pagamento e responsável.

### RN-EMPFIN-002
O sistema pode manter salário de referência e lançamentos para conferência gerencial, mas não é sistema de folha de pagamento.
O salário de referência pode ser mensal ou por diária. Na diária, a quantidade de dias usada na prévia é informada por quem confere; não é inferida de entregas ou presença.

### RN-EMPFIN-003
Não realizar automaticamente descontos trabalhistas/salariais a partir de divergências, consumos ou ocorrências.
Cada lançamento começa fora da prévia de abatimentos e só é considerado quando o usuário financeiro o seleciona. Essa seleção não registra pagamento nem altera o livro do funcionário.

### RN-EMPFIN-004 — Adiantamento pago em dinheiro pela gaveta
Decisão de 22/09/2026, que resolve a lacuna registrada em `D-2026-09-22-57`
(item A-19).

Quando o adiantamento é **efetivamente pago em dinheiro pelo caixa**, um único
fato produz **dois registros vinculados**:

1. o lançamento `advance` no histórico do funcionário;
2. o movimento **físico** de saída do caixa.

Regras:

- os dois são criados **atomicamente**: se um falhar, nenhum permanece;
- os **valores são idênticos**;
- o vínculo permite reconstruir os dois lados, em qualquer direção;
- exige **sessão de caixa aberta** e valor não maior que o dinheiro esperado
  na gaveta;
- o movimento tem **tipo próprio** (`employee_advance`). **Não é sangria**:
  sangria é a Shalon levando o próprio dinheiro para outro lugar dela;
  adiantamento é dinheiro que sai para a mão de uma pessoa. Também **não é
  despesa, não é venda e não é diferença de caixa**;
- a **reversão devolve os dois juntos**. É proibido reverter só o movimento de
  caixa pelo extrato, ou só o lançamento: não existe meio estorno. Originais e
  compensatórios seguem a arquitetura da Fase 7;
- dupla reversão é recusada;
- **nada disso altera `employee_financial_profiles` nem desconta salário**
  (RN-EMPFIN-003).

Adiantamento pago por outro meio (transferência, por exemplo) registra apenas
o lançamento, com a forma de pagamento, e **não move o caixa**.

---

# PARTE XI — CLIENTES, REMARKETING E INTELIGÊNCIA

## 37. Cliente recorrente

### RN-CRM-001
Inteligência de ausência deve considerar o comportamento individual quando houver histórico suficiente.

### RN-CRM-002
Filtros manuais de 15/30/60/90 dias continuam disponíveis.

### RN-CRM-003
Cliente com pouco histórico não deve receber inferência artificial de frequência habitual.

### RN-CRM-004
A classificação comportamental de cadência exige **três ou mais** compras concluídas.

- **1 compra** → `dados_insuficientes`. Não existe intervalo.
- **2 compras** → `base_fraca`. Existe um intervalo observado, e um intervalo
  não é hábito. Os fatos objetivos aparecem — intervalo observado, dias desde
  a última compra, última compra, ticket médio —, mas o cliente **não** é
  classificado automaticamente como `atencao` nem `afastado`.
- **3 ou mais** → cadência individual pela mediana dos intervalos.

Os filtros objetivos de ausência (RN-CRM-002) são independentes desta regra e
**incluem** clientes de 1 ou 2 compras quando atenderem ao filtro.

### RN-CRM-005
Para três ou mais compras, a classificação compara os dias desde a última
compra com o intervalo típico **do próprio cliente**:

| razão | estado |
|---|---|
| ≤ 1× | `recorrente` |
| > 1× e ≤ 2× | `atencao` |
| > 2× | `afastado` |

O intervalo típico é a **mediana** dos intervalos entre compras concluídas
consecutivas — não a média, que uma ausência excepcional distorceria.

A interface deve exibir os números que produziram o estado (intervalo típico
e dias sem comprar), de modo que a sinalização seja sempre explicável. Não
usar score opaco.

---

## 38. Remarketing

### RN-RMKT-001
Remarketing da V1 é assistido/manual; não há disparo automático pela API do WhatsApp.

### RN-RMKT-002
Sistema pode sugerir clientes, mostrar indicadores e abrir WhatsApp com mensagem pré-preenchida.

### RN-RMKT-003
A tentativa de contato e seu resultado podem ser registrados.

### RN-RMKT-004
Resultados podem incluir contatado, sem resposta, interessado, não quer contato e voltou a comprar após contato.

### RN-RMKT-005
Nova compra após contato pode ser identificada temporalmente como “voltou a comprar após o contato”, sem afirmar causalidade.

### RN-RMKT-006
Contato promocional respeita consentimento de marketing.

### RN-RMKT-007
“Não quer promoções” atualiza o consentimento/preferência e retira o cliente das sugestões promocionais adequadas.

### RN-RMKT-008
Contato necessário para executar pedido em andamento não depende de consentimento promocional.

---

## 39. Dashboard e relatórios

### RN-DASH-001
Dashboard é central de atenção operacional, não coleção decorativa de gráficos.

### RN-DASH-002
Alertas resolvidos deixam de ocupar a fila ativa.

### RN-DASH-003
Tempos-limite de alertas operacionais são configuráveis.

### RN-DASH-004
Alertas podem incluir pedido pendente além do limite, Pix aguardando, alteração aguardando cliente, entrega fora da área aguardando aprovação, caixa aberto há tempo incomum, saída de entrega sem acerto e divergências.

### RN-REL-001
Relatórios permitem filtros por período e comparação com período anterior quando aplicável.

### RN-REL-002
Métricas incluem receita registrada, quantidade de pedidos, ticket médio, cancelamentos, recorrência, vendas por produto/categoria, formas de pagamento, origem, combos, entregas e demais indicadores definidos no escopo.

### RN-REL-003
“Dias de maior/menor movimento” refere-se ao movimento comercial registrado, não a clima.

### RN-REL-004
Exportações CSV/Excel/PDF obedecem às permissões do usuário e à sensibilidade dos dados.

### RN-REL-005 — Produtos de menor movimentação
O bloco de produtos de menor movimentação representa **produtos elegíveis com
a menor quantidade vendida no período analisado**. Ele **não** é conclusão de
que o produto tem baixa demanda: é ordem relativa entre o que pôde ser
comparado.

1. Considerar somente produtos **elegíveis** segundo as regras analíticas já
   definidas — esteve no catálogo o período inteiro e continua disponível.
2. Ordenar pela quantidade vendida no período, da **menor para a maior**.
3. Desempatar por critério **determinístico** (nome do produto), para que a
   mesma consulta produza sempre a mesma lista.
4. **Excluir** do recorte os produtos que também estejam no grupo apresentado
   como "mais vendidos" na mesma visão. Com poucos elegíveis, o fundo da
   lista traria o campeão de vendas junto, e a tela afirmaria duas coisas
   contraditórias ao mesmo tempo.
5. Limitar a apresentação padrão aos **5 primeiros**.
6. O limite de 5 é **decisão de apresentação da V1**, não limiar estatístico.
   Não deriva de amostra, significância nem qualquer cálculo.
7. Estar neste bloco **não** gera alerta automaticamente (RN-DASH-001: só
   vira pendência o que tem ação possível).
8. Não usar "encalhado", "baixa demanda", "parado" ou equivalentes sem
   evidência adicional. O rótulo da interface é **"Menor movimentação"**, com
   texto auxiliar "Produtos elegíveis com menor quantidade vendida no
   período."
9. Enquanto a disponibilidade histórica não puder ser determinada
   (`D-2026-09-23-67`, A-22), a ressalva correspondente acompanha o bloco.
10. Produto **novo** ou **sem base suficiente** não recebe conclusão
    negativa: ele fica fora do recorte e aparece com o motivo da
    inelegibilidade.

A elegibilidade e a ordenação já são produzidas pelo banco; os itens 4, 5 e 8
são de apresentação.

---

# PARTE XII — SEGURANÇA, PERMISSÕES E AUDITORIA

## 40. RBAC

### RN-RBAC-001
Perfis iniciais incluem Owner/Admin e Atendente, mas o Owner pode criar papéis personalizados.

### RN-RBAC-002
Permissões devem ser semânticas por módulo/ação, como visualizar, criar, editar, cancelar/estornar e administrar.

### RN-RBAC-003
Ocultar botão não substitui autorização no backend/RLS.

### RN-RBAC-004
Ações sensíveis dependem da permissão efetiva do usuário no momento da operação.

### RN-RBAC-004-A — Cada permissão vale pelo que o nome diz
Uma permissão não pode ser pré-requisito escondido de outra tarefa. Ler o que
uma tarefa precisa (formas de pagamento para registrar pagamento, totais da
sessão para fechar o caixa) é garantido pela permissão da própria tarefa. A tela
de permissões diz o que cada item libera e de quais outros ele precisa para
funcionar (D-2026-10-27-168).

### RN-RBAC-005 — Ninguém concede o que não tem
Decisão de 22/09/2026.

Quem atribui um papel a um usuário interno precisa possuir, ele próprio,
**todas as permissões que aquele papel concede**. Sem isso, `roles.manage`
seria a chave de todas as portas: bastaria atribuir a si mesmo um papel mais
forte.

A verificação acontece no servidor, e a escrita direta em `user_roles` deixa de
existir para a aplicação — a checagem não pode morar só na tela
(CLAUDE.md §12, RN-RBAC-003).

Complementos:

- papel **inativo** não é atribuível;
- toda alteração de papel é **auditada**, com o antes e o depois;
- ninguém desativa o **próprio** acesso;
- desligar o funcionário **revoga o acesso** e **não apaga** usuário, papéis
  nem histórico (RN-FUNC-002, 03 §18.4).

---

## 41. Auditoria

### RN-AUD-001
Auditar pelo menos cancelamentos, rejeições, alterações de pedido, reimpressões relevantes, confirmação manual de Pix, overrides de taxa, diferenças/fechamentos de caixa, reversões financeiras, acertos de motoboy, alterações de permissões e configurações críticas.

### RN-AUD-002
Configurações críticas incluem horários, raios/faixas/taxas de entrega, pedido mínimo, dados de Pix, métodos de pagamento e tempos estimados.

### RN-AUD-003
Auditoria deve preservar ator, timestamp, ação, entidade e, quando aplicável, valores anteriores/novos e motivo.

### RN-AUD-004
Usuário comum não pode apagar ou reescrever logs para ocultar ações anteriores.

---

# PARTE XIII — REGRAS DE DADOS E TRANSAÇÕES

## 42. Snapshots

### RN-SNAP-001
Pedido preserva snapshots necessários para reconstruir o fato comercial ocorrido, incluindo descrições, preços, customizações, endereço de entrega, taxa/distância, estimativa mostrada e demais dados voláteis relevantes.

### RN-SNAP-002
Mudança posterior em produto, cliente, endereço, promoção, taxa ou configuração não altera o snapshot histórico.

---

## 43. Operações atômicas

As seguintes operações devem ser tratadas como candidatas obrigatórias a transação/RPC/server action equivalente:

- criação definitiva do pedido;
- aceitação/rejeição/cancelamento;
- aplicação e aceite de alteração;
- confirmação de Pix;
- abertura/fechamento/correção de caixa;
- registro e reversão de movimento financeiro;
- criação/fechamento de saída de entrega;
- conciliação de valores do motoboy;
- alteração de permissões;
- operações que escrevem simultaneamente cabeçalho, itens, pagamentos, snapshots e auditoria.

Falha parcial não pode deixar o domínio em estado contraditório.

---

# PARTE XIV — INVARIANTES QUE O BANCO/BACKEND DEVE IMPEDIR

## 44. Invariantes críticos

O sistema deve impedir, independentemente do frontend:

1. preço de pedido arbitrado pelo cliente;
2. meio a meio com tamanho incompatível;
3. meio a meio cobrando valor inferior ao maior preço efetivo aplicável;
4. uso de produto/variação/componente indisponível em novo pedido;
5. promoção fora de validade;
6. promoções conflitantes para o mesmo alvo quando proibidas;
7. quantidade acima do limite comercial aplicável;
8. entrega além da distância máxima;
9. taxa de entrega inexistente/R$0 por falha de faixa quando deveria existir cobrança;
10. produção antes das aprovações obrigatórias;
11. pedido Pix antecipado tratado como pago apenas pela seleção do método;
12. alteração financeira silenciosa de pedido enviado;
13. conclusão de retirada apenas por ter ficado pronta;
14. dinheiro ainda com motoboy contado como caixa físico recebido;
15. exclusão simples de movimento financeiro confirmado;
16. desconto salarial automático por divergência;
17. atendente comum acessando dados salariais sensíveis;
18. cliente consultando histórico completo apenas por WhatsApp;
19. usuário sem permissão executando operação sensível por chamada direta;
20. alteração arbitrária de estado pulando a máquina de estados.

---

# PARTE XV — CENÁRIOS DE ACEITE

## 45. Cenários mínimos antes de considerar a regra implementada

1. Pizza inteira normal.
2. Meio a meio com preços diferentes.
3. Meio a meio com promoção em apenas um sabor.
4. Tamanho incompatível bloqueado.
5. Borda por tamanho e exclusão específica.
6. Combo indisponível por componente.
7. Promoção expirando com carrinho aberto.
8. Mudança de preço exigindo aceite.
9. Loja fechando com carrinho aberto.
10. Categoria pausada temporariamente.
11. Entrega dentro do raio automático.
12. Entrega fora do raio automático e dentro do máximo.
13. Entrega além do máximo.
14. Pix antecipado aguardando confirmação.
15. Alteração de pedido exigindo aceite do cliente.
16. Retirada pronta mas ainda não concluída.
17. Saída de entrega com múltiplos pedidos e meios de pagamento.
18. Motoboy retornando com diferença.
19. Caixa atravessando meia-noite.
20. Fechamento com diferença justificada.
21. Fechamento com entrega ainda pendente.
22. Estorno financeiro preservando original.
23. Consumo de funcionário sem virar venda.
24. Cortesia sem virar receita.
25. Cliente bloqueado recebendo mensagem pública neutra.
26. Reorder usando preços e disponibilidade atuais.
27. Tracking token de um pedido sem acesso aos demais.
28. Usuário sem permissão tentando operação por chamada direta.
29. Reimpressão auditada.
30. Alteração após impressão gerando comanda “ALTERAÇÃO”.

---

# PARTE XVI — ORIENTAÇÃO PARA IMPLEMENTAÇÃO

## 46. Regra para Claude Code

Ao implementar:

1. ler `01-DOCUMENTO-MESTRE.md`;
2. ler `02-MODELO-DADOS-SUPABASE.md`;
3. ler `03-RLS-RBAC-SEGURANCA.md`;
4. ler este documento;
5. identificar a regra aplicável antes de escrever a operação;
6. não reinterpretar regra comercial por conveniência técnica;
7. não implementar uma regra somente no frontend;
8. não criar campos/tabelas para “resolver rápido” sem reconciliar o modelo;
9. não desabilitar RLS para contornar autorização;
10. não avançar diante de contradição documental relevante: apontar a inconsistência primeiro.

---

## 47. O que este documento não decide

Detalhes puramente técnicos que não alterem o comportamento de negócio podem ser escolhidos na arquitetura/implementação, desde que respeitem o Documento Mestre, o modelo de dados e a especificação de segurança.

Exemplos: nomes exatos de funções internas, estratégia de cache, biblioteca de formulários, organização de componentes e detalhes de implementação do adaptador do provedor de rotas.

---

## 48. Status

Com este documento, as regras funcionais da descoberta passam a estar formalizadas para a V1.

**Próximo documento:** `05-PLANO-IMPLEMENTACAO.md`.

A implementação do sistema ainda não deve começar antes da consolidação do plano de implementação e do `CLAUDE.md`.
