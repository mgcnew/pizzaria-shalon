# 04 — REGRAS DE NEGÓCIO
## Sistema de Gestão e Pedidos — Pizzaria Shalon

**Versão:** 1.0  
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
Nome e WhatsApp são obrigatórios no primeiro pedido. Endereço é obrigatório somente para entrega.

### RN-CLI-003
WhatsApp é identificador operacional, mas não substitui a chave primária interna do cliente.

### RN-CLI-004
Mesmo dispositivo pode reconhecer cliente recorrente e preencher dados previamente conhecidos.

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

### RN-PRINT-004
Reimpressão é permitida e registrada.

### RN-PRINT-005
Alteração posterior à impressão preserva a impressão anterior e gera documento visualmente distinto identificado como **ALTERAÇÃO**, contendo as mudanças relevantes.

### RN-PRINT-006
A impressão é não fiscal e direcionada ao equipamento 58 mm previsto no escopo.

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

---

## 29. Fechamento

### RN-CAIXA-011
Fechamento calcula caixa esperado e compara com valor contado.

### RN-CAIXA-012
Diferença positiva ou negativa não impede necessariamente o fechamento, mas exige justificativa e auditoria.

### RN-CAIXA-013
Caixa pode ser fechado com saídas de motoboy ainda pendentes, desde que o sistema destaque a pendência.

### RN-CAIXA-014
Dinheiro ainda com motoboy não é considerado dinheiro recebido fisicamente no caixa.

### RN-CAIXA-015
Sessão fechada não pode ser editada/reaberta por atendente comum.

### RN-CAIXA-016
Correção/reabertura excepcional exige Owner/Admin ou permissão específica, motivo obrigatório e auditoria, preservando o fechamento original.

---

## 30. Movimentos financeiros

### RN-FIN-001
Categorias de entradas e despesas são configuráveis por usuário autorizado.

### RN-FIN-002
Movimento financeiro registra categoria, valor, data, descrição/observação, responsável e comprovante opcional quando aplicável.

### RN-FIN-003
Movimento confirmado não é apagado ou sobrescrito para correção.

### RN-FIN-004
Correção ocorre por estorno/reversão autorizada, com motivo, responsável e timestamp. O movimento original permanece preservado e o movimento correto é novo registro.

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

---

## 32. Saída de entrega

### RN-RUN-001
Uma “Saída de entrega” agrupa um ou mais pedidos associados a um motoboy.

### RN-RUN-002
Registra motoboy, pedidos, horário de saída e valores esperados por meio de pagamento.

### RN-RUN-003
Retorno permite registrar valores efetivamente recebidos e conciliar a saída.

### RN-RUN-004
Diferença registra valor, motivo, responsável, data/hora, notas e anexo opcional.

### RN-RUN-005
Diferença de motoboy nunca gera desconto salarial automático.

### RN-RUN-006
Usuário financeiro autorizado decide separadamente se a ocorrência deve gerar lançamento no histórico financeiro do funcionário.

### RN-RUN-007
Entrega não realizada não é tratada como dinheiro recebido pelo motoboy.

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

### RN-EMPFIN-003
Não realizar automaticamente descontos trabalhistas/salariais a partir de divergências, consumos ou ocorrências.

---

# PARTE XI — CLIENTES, REMARKETING E INTELIGÊNCIA

## 37. Cliente recorrente

### RN-CRM-001
Inteligência de ausência deve considerar o comportamento individual quando houver histórico suficiente.

### RN-CRM-002
Filtros manuais de 15/30/60/90 dias continuam disponíveis.

### RN-CRM-003
Cliente com pouco histórico não deve receber inferência artificial de frequência habitual.

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
