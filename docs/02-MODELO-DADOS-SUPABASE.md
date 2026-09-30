# 02 — Modelo de Dados Supabase | Pizzaria Shalon

**Versão:** 1.2 — §8.2 revisado e §5.4-A acrescentada em 25/09/2026
(`D-2026-09-25-76`, `D-2026-09-25-77`, `D-2026-09-25-78`)  
**Status:** Especificação arquitetural — implementada nas Fases 1 a 11; §5.4-A aprovada e não implementada  
**Fonte de verdade funcional:** `01-DOCUMENTO-MESTRE.md` V2  
**Documento complementar:** `03-RLS-RBAC-SEGURANCA.md`

> Este documento transforma as regras funcionais aprovadas em um modelo relacional para PostgreSQL/Supabase. Ele define entidades, relacionamentos, snapshots, invariantes e fronteiras de segurança. **Não é uma migration pronta e não autoriza o Claude Code a implementar o banco ainda.** Antes da implementação, deve ser reconciliado com o documento específico de RLS/RBAC e com as regras de negócio.

---

## 1. Princípios do modelo

1. **Uma única unidade na V1.** Não criar `tenant_id`, `organization_id` ou abstrações de multitenancy agora.
2. **UUID como chave primária interna**, usando `gen_random_uuid()` quando apropriado.
3. **Identificadores humanos separados**, especialmente número do pedido.
4. **Dinheiro em `numeric(12,2)`**, nunca `float`.
5. **Datas/horas em `timestamptz`**. A data operacional de caixa é armazenada separadamente quando necessário.
6. **Clientes públicos não são usuários do Supabase Auth.** Auth é reservado ao sistema interno.
7. **Funcionário e usuário autenticado são conceitos diferentes.** Um motoboy pode existir sem login.
8. **Snapshot histórico é obrigatório.** Mudanças futuras no cardápio, endereço, preço, pagamento ou configuração não podem reescrever pedidos antigos.
9. **Soft delete/inativação** para registros com histórico. Evitar exclusão física de entidades referenciadas.
10. **Regras críticas não dependem do frontend.** Preço, promoções, meio a meio, disponibilidade, taxa, limites, transições de status e permissões precisam ser validados no servidor/banco.
11. **Auditoria para ações sensíveis.** Caixa, financeiro, permissões, cancelamentos, rejeições, taxa manual, Pix, funcionários e configurações críticas.
12. **Storage para arquivos; banco para metadados.** Nunca armazenar imagens ou comprovantes em Base64.

---

# 2. Visão dos domínios

O banco será dividido conceitualmente nos seguintes domínios:

- Loja e configurações
- Usuários internos, funcionários e RBAC
- Cardápio e catálogo
- Promoções e banners
- Clientes públicos e endereços
- Pedidos e snapshots
- Pagamentos
- Entregas e motoboys
- Caixa
- Financeiro
- Movimentações internas de produtos
- Remarketing
- Auditoria e impressão
- Arquivos/Storage

Não é necessário criar schemas PostgreSQL separados na V1. A separação é conceitual e pode permanecer no schema `public`, desde que migrations e políticas estejam organizadas por domínio.

---

# 3. Loja e configurações

## 3.1 `store_settings`

Registro singleton da unidade.

Campos principais:

- `id uuid PK`
- `store_name text`
- `legal/display_name text nullable`
- `whatsapp text`
- `phone text nullable`
- `address_street text`
- `address_number text`
- `address_complement text nullable`
- `address_neighborhood text`
- `address_city text`
- `address_state text`
- `address_postal_code text`
- `latitude numeric(10,7)`
- `longitude numeric(10,7)`
- `geocode_provider text nullable`
- `geocoded_at timestamptz nullable`
- `is_temporarily_closed boolean`
- `temporary_close_reason text nullable`
- `temporary_closed_at timestamptz nullable`
- `temporary_closed_by uuid nullable -> app_users.id`
- `delivery_minimum_enabled boolean`
- `delivery_minimum_subtotal numeric(12,2) nullable`
- `automatic_delivery_radius_km numeric(8,3)`
- `delivery_eta_min_minutes integer`
- `delivery_eta_max_minutes integer`
- `pickup_eta_min_minutes integer`
- `pickup_eta_max_minutes integer`
- `current_delivery_eta_min_minutes integer nullable`
- `current_delivery_eta_max_minutes integer nullable`
- `current_pickup_eta_min_minutes integer nullable`
- `current_pickup_eta_max_minutes integer nullable`
- `eta_override_updated_at timestamptz nullable`
- `eta_override_updated_by uuid nullable`
- `addons_enabled boolean`
- `timezone text default 'America/Sao_Paulo'`
- `created_at`, `updated_at`

**Regra:** não guardar a distância máxima atendida como uma segunda fonte de verdade se ela puder ser derivada do maior `max_distance_km` ativo de `delivery_fee_bands`. Se futuramente for necessário armazená-la, deve existir validação de consistência.

## 3.2 `store_hours`

- `id uuid PK`
- `weekday smallint` (0–6 ou padrão documentado)
- `is_closed boolean`
- `opens_at time nullable`
- `closes_at time nullable`
- `sort_order smallint`

Deve suportar horário atravessando meia-noite. Não assumir que `closes_at < opens_at` é inválido.

## 3.3 `delivery_fee_bands`

- `id uuid PK`
- `min_distance_km numeric(8,3)`
- `max_distance_km numeric(8,3)`
- `fee numeric(12,2)`
- `is_active boolean`
- `sort_order integer`
- `created_at`, `updated_at`

**Invariantes:**

- `min_distance_km >= 0`
- `max_distance_km > min_distance_km`
- `fee >= 0`
- faixas ativas não podem se sobrepor;
- **fronteira `(min, max]`**: a faixa cobre acima de `min_distance_km` e até `max_distance_km` inclusive; a faixa iniciada em `0` cobre também a distância `0` (RN-ENT-015). A convenção é única em toda a V1, para que cada distância pertença a exatamente uma faixa ativa — sem sobreposição e sem buraco entre faixas contíguas.

## 3.4 `alert_thresholds`

Configura limites operacionais sem hardcode.

- `id uuid PK`
- `alert_key text UNIQUE`
- `threshold_minutes integer`
- `is_active boolean`
- `updated_by uuid`
- `updated_at timestamptz`

Exemplos de `alert_key`: `order_waiting_confirmation`, `pix_waiting_confirmation`, `delivery_approval_waiting`, `customer_change_waiting`, `driver_run_pending_settlement`.

---

# 4. Funcionários, autenticação e RBAC

## 4.1 `employees`

Representa qualquer pessoa vinculada operacionalmente à pizzaria, com ou sem login.

- `id uuid PK`
- `full_name text`
- `phone text nullable`
- `employee_type text` — ex.: `owner`, `counter`, `driver`, `other`
- `is_driver boolean`
- `employment_status text` — `active`, `inactive`
- `started_at date nullable`
- `ended_at date nullable`
- `notes text nullable`
- `created_at`, `updated_at`

Não excluir fisicamente funcionário com histórico.

## 4.2 `app_users`

Liga Supabase Auth ao funcionário.

- `id uuid PK` — pode ser igual a `auth.users.id` ou possuir FK explícita; definir padrão no documento de segurança
- `auth_user_id uuid UNIQUE -> auth.users.id`
- `employee_id uuid UNIQUE -> employees.id`
- `is_active boolean`
- `last_login_at timestamptz nullable`
- `created_at`, `updated_at`

Um `employee` pode existir sem `app_user`.

## 4.3 `roles`

- `id uuid PK`
- `name text UNIQUE`
- `description text nullable`
- `is_system boolean`
- `is_active boolean`
- `created_at`, `updated_at`

Perfis iniciais: Dono/Admin e Atendente. Outros são configuráveis.

## 4.4 `permissions`

Catálogo semântico de permissões.

- `id uuid PK`
- `code text UNIQUE`
- `module text`
- `action text`
- `description text`

Exemplos: `orders.view`, `orders.accept`, `orders.cancel`, `cash.open`, `cash.close`, `finance.view`, `employees.finance.view`, `settings.delivery.manage`, `roles.manage`.

## 4.5 `role_permissions`

- `role_id uuid FK`
- `permission_id uuid FK`
- PK composta (`role_id`, `permission_id`)

## 4.6 `user_roles`

- `app_user_id uuid FK`
- `role_id uuid FK`
- `assigned_by uuid`
- `assigned_at timestamptz`
- PK composta conforme estratégia escolhida

Arquitetura preparada para mais de uma função por usuário, mesmo que a UI inicial normalmente use uma função principal.

## 4.7 `employee_financial_profiles`

Tabela separada por sensibilidade.

- `employee_id uuid PK/FK`
- `salary_reference numeric(12,2) nullable`
- `notes text nullable`
- `updated_by uuid`
- `updated_at timestamptz`

RLS mais restritiva que `employees`.

---

# 5. Cardápio

## 5.1 `categories`

- `id uuid PK`
- `name text`
- `slug text UNIQUE`
- `description text nullable`
- `is_active boolean`
- `is_temporarily_available boolean default true`
- `temporary_unavailable_note text nullable` — interno
- `sort_order integer`
- `created_at`, `updated_at`

Categorias iniciais são dados, não enum estrutural: Pizzas Salgadas, Pizzas Doces, Fogazza, Combos, Bebidas.

## 5.2 `products`

- `id uuid PK`
- `category_id uuid FK -> categories.id`
- `product_type text` — `pizza`, `fogazza`, `drink`, `combo`, `other`
- `name text`
- `slug text UNIQUE`
- `short_description text nullable`
- `base_price numeric(12,2) nullable`
- `is_active boolean`
- `is_temporarily_available boolean`
- `temporary_unavailable_note text nullable`
- `is_featured boolean`
- `max_quantity_per_order integer nullable`
- `sort_order integer`
- `image_asset_id uuid nullable -> media_assets.id`
- `flavor_category_id uuid nullable -> categories.id` — card de entrada de fogazza: categoria de onde vêm os sabores
- `flavor_size_id uuid nullable -> pizza_sizes.id` — card de entrada de fogazza: tamanho (vendido como fogazza) em que os sabores são vendidos
- `created_at`, `updated_at`

Os dois campos de fogazza vêm juntos e só existem em produto do tipo `fogazza`
(`products_escolha_de_sabor`); o tamanho indicado precisa ser vendido como
fogazza. Ver RN-FOG-003 e D-2026-09-29-98.

`base_price` atende produtos simples e combos. Pizza com tamanho usa `product_variants.price` como autoridade.

Produto sem preço aplicável não é considerado disponível para venda (RN-DISP-006): com variação, exige ao menos uma variação ativa e disponível; sem variação, exige `base_price` definido.

## 5.3 `pizza_sizes`

- `id uuid PK`
- `name text UNIQUE`
- `slice_count integer`
- `max_flavors integer default 1`
- `sold_as text default 'pizza'` — `pizza` ou `fogazza` (RN-FOG-002)
- `is_active boolean`
- `sort_order integer`
- `created_at`, `updated_at`

Tamanho vendido como `fogazza`: `max_flavors = 1`
(`pizza_sizes_fogazza_um_sabor`), sem preço de borda, e usado só por produto
do tipo `pizza`. As leituras públicas da pizza (`cardapio_publico`,
`tamanhos_publicos`, `buscar_catalogo`) consideram só tamanhos vendidos como
pizza.

## 5.4 `product_variants`

Variação comercial produto+tamanho. Principalmente pizzas.

- `id uuid PK`
- `product_id uuid FK -> products.id`
- `size_id uuid FK -> pizza_sizes.id`
- `price numeric(12,2)`
- `is_active boolean`
- `is_temporarily_available boolean`
- `temporary_unavailable_note text nullable`
- `sku text nullable`
- `created_at`, `updated_at`
- UNIQUE (`product_id`, `size_id`)

Somente produtos compatíveis com variação devem usar esta tabela. Fogazza simples e bebida não precisam ganhar tamanho artificial. A fogazza por sabor é uma variação do **sabor de pizza** no tamanho vendido como fogazza, com o preço daquele sabor (RN-FOG-002).

O `sku` é **cadastro de fornecedor** e não identificador de venda. Ele não é
usado por nenhum fluxo e **não** se confunde com código de barras, que tem
estrutura própria em §5.4-A (decisão `D-2026-09-25-78`).

## 5.4-A `product_barcodes` — aprovada, ainda não implementada

Código de barras de venda, para **produto** ou **variante**. Aprovada em
25/09/2026 por `D-2026-09-25-78`; a especificação completa, com a justificativa
da unicidade e as regras de resolução, está em
**`09-PDV-FRENTE-DE-CAIXA.md` §2.3**.

- `id uuid PK`
- `code text` — como digitado
- `code_normalized text` — **coluna gerada**, `IMMUTABLE`
- `product_id uuid nullable FK -> products.id`
- `variant_id uuid nullable FK -> product_variants.id`
- `is_primary boolean default false`
- `created_at`, `created_by`
- CHECK: exatamente **um** alvo — `(product_id is null) <> (variant_id is null)`
- **UNIQUE (`code_normalized`)** — unicidade **global**
- UNIQUE parcial de um código primário por produto e por variante

A unicidade é global de propósito: com colunas separadas em `products` e
`product_variants`, o mesmo código poderia apontar para duas coisas, e a
leitura resolveria qualquer uma delas — em cima de dinheiro.

Este código serve à **venda**. Não é controle de estoque, que segue fora da V1.

## 5.5 `crusts`

- `id uuid PK`
- `name text`
- `is_active boolean`
- `is_temporarily_available boolean`
- `sort_order integer`
- `created_at`, `updated_at`

## 5.6 `crust_size_prices`

- `id uuid PK`
- `crust_id uuid FK`
- `size_id uuid FK`
- `price numeric(12,2)`
- `is_active boolean`
- `is_temporarily_available boolean`
- UNIQUE (`crust_id`, `size_id`)

## 5.7 `product_crust_exclusions`

- `product_id uuid FK`
- `crust_id uuid FK`
- `size_id uuid nullable FK`
- PK/unique conforme estratégia

Por padrão a borda compatível com o tamanho vale para pizzas daquele tamanho; esta tabela registra exceções.

## 5.8 `addons`

- `id uuid PK`
- `name text`
- `is_active boolean`
- `is_temporarily_available boolean`
- `sort_order integer`
- `created_at`, `updated_at`

## 5.9 `addon_size_prices`

- `id uuid PK`
- `addon_id uuid FK`
- `size_id uuid FK`
- `price numeric(12,2)`
- `is_active boolean`
- UNIQUE (`addon_id`, `size_id`)

## 5.10 `product_addon_rules`

Define compatibilidade e limite por produto.

- `id uuid PK`
- `product_id uuid FK`
- `addon_id uuid FK`
- `size_id uuid nullable FK`
- `is_allowed boolean`
- `created_at`

Esta tabela registra a **exceção**, não a permissão: sem linha para o par produto × adicional, o adicional é permitido, desde que atendidas as demais condições de RN-ADD-006. A linha com `is_allowed = false` proíbe, e a regra com `size_id` preenchido prevalece sobre a genérica.

O limite máximo de adicionais pode ficar em campo próprio de `products` (`max_addons`) ou tabela de configuração por grupo. Recomenda-se `products.max_addons integer nullable` se a regra continuar simples.

## 5.11 `combo_components`

- `id uuid PK`
- `combo_product_id uuid FK -> products.id`
- `component_product_id uuid FK -> products.id`
- `component_variant_id uuid nullable FK -> product_variants.id`
- `quantity integer`
- `sort_order integer`
- `created_at`, `updated_at`

O componente é exato. Não há grupos de escolha na V1. Um combo fica indisponível para novos pedidos se qualquer componente obrigatório estiver indisponível.

---

# 6. Promoções, banners e destaques

## 6.1 `promotions`

- `id uuid PK`
- `name text`
- `target_type text` — `product`, `variant`
- `product_id uuid nullable FK`
- `variant_id uuid nullable FK`
- `promotional_price numeric(12,2)`
- `starts_at timestamptz`
- `ends_at timestamptz nullable`
- `is_active boolean`
- `max_quantity_per_order integer nullable`
- `created_by uuid`
- `created_at`, `updated_at`

**Invariantes:** exatamente um alvo coerente; preço não negativo; `ends_at > starts_at` quando existir; impedir sobreposição temporal ativa para o mesmo alvo.

Combo é um produto, portanto pode receber promoção própria sem alterar seus componentes.

## 6.2 `banners`

- `id uuid PK`
- `title text nullable`
- `body text nullable`
- `image_asset_id uuid FK`
- `destination_type text` — `product`, `category`, `promotion`, `external`, `none`
- `destination_product_id uuid nullable`
- `destination_category_id uuid nullable`
- `destination_promotion_id uuid nullable`
- `external_url text nullable`
- `starts_at timestamptz nullable`
- `ends_at timestamptz nullable`
- `is_active boolean`
- `sort_order integer`
- `created_at`, `updated_at`

Visibilidade final é derivada também da disponibilidade/validade do destino.

## 6.3 “Mais pedidos”

**Não criar tabela de ranking como fonte de verdade.** Derivar dos pedidos concluídos dos últimos 30 dias.

Regras:

- ranking por quantidade;
- pizza inteira = 1 para o sabor/produto;
- meio a meio = 0,5 para cada sabor;
- combo conta para o combo no ranking público, não para componentes;
- no máximo 6 produtos ativos/disponíveis;
- destaque manual (`products.is_featured`) é independente.

Pode existir view/materialized view/cache no futuro por performance, mas o cálculo canônico deriva dos dados de pedido.

---

# 7. Mídia e Storage

## 7.1 `media_assets`

- `id uuid PK`
- `bucket text`
- `storage_path text UNIQUE`
- `mime_type text`
- `width integer nullable`
- `height integer nullable`
- `file_size_bytes bigint nullable`
- `original_filename text nullable`
- `asset_type text` — `product`, `banner`, `employee_attachment`, `financial_receipt`, etc.
- `created_by uuid nullable`
- `created_at timestamptz`

Produtos e combos apontam para um asset principal. Substituição segura: salvar novo arquivo → atualizar referência → remover objeto antigo somente se não houver outras referências.

Buckets públicos somente para mídia realmente pública do cardápio. Comprovantes/anexos financeiros devem permanecer privados.

---

# 8. Clientes públicos e acesso sem login

## 8.1 `customers`

- `id uuid PK`
- `name text`
- `whatsapp_normalized text`
- `whatsapp_display text nullable`
- `marketing_consent boolean default false`
- `marketing_consent_updated_at timestamptz nullable`
- `is_blocked boolean default false`
- `blocked_reason_internal text nullable`
- `blocked_at timestamptz nullable`
- `blocked_by uuid nullable`
- `created_at`, `updated_at`

O WhatsApp é identificador operacional, **não PK**. Estratégia de unicidade/mesclagem deve ser definida nas regras de negócio, porque troca de telefone é permitida.

## 8.2 `customer_addresses`

- `id uuid PK`
- `customer_id uuid FK`
- `label text nullable`
- `is_preferred boolean`
- `street text`
- `number text`
- `complement text nullable`
- `neighborhood text`
- `city text`
- `state text`
- `postal_code text`
- `reference_point text nullable`
- `latitude numeric(10,7)`
- `longitude numeric(10,7)`
- `geocode_provider text nullable`
- `geocode_confidence text nullable`
- `was_map_adjusted boolean default false`
- `is_active boolean`
- `created_at`, `updated_at`
- `address_key text` — **gerada pelo banco** (`D-2026-09-25-76`)
- `geocoded_at timestamptz nullable` (`D-2026-09-25-76`)
- `route_distance_km numeric(8,3) nullable` (`D-2026-09-25-77`)
- `route_provider text nullable` (`D-2026-09-25-77`)
- `route_origin_lat numeric(10,7) nullable` (`D-2026-09-25-77`)
- `route_origin_lng numeric(10,7) nullable` (`D-2026-09-25-77`)
- `route_measured_at timestamptz nullable` (`D-2026-09-25-77`)

### Taxa e distância — regra revisada em 25/09/2026

> **A redação anterior desta seção era:** "Taxa/distância **não pertencem ao
> endereço salvo**. Devem ser recalculadas a cada novo pedido."
>
> A metade sobre **taxa** continua valendo integralmente. A metade sobre
> **distância** foi alterada por `D-2026-09-25-77`.

**A TAXA não pertence ao endereço salvo, e nunca vai pertencer.**

Não existe nem existirá coluna de taxa aqui. A taxa é recalculada pelas faixas
vigentes em **toda** cotação (`cotar_entrega`) e em **todo** pedido
(`criar_pedido`). RN-ENT-008 permanece intacto: taxa antiga não é autoridade,
em nenhuma circunstância.

Consequência prática, e é o teste que prova a regra: a Shalon altera a tabela
de faixas e o **mesmo endereço já em cache** passa a custar diferente no pedido
seguinte. Reutilizar distância não congela preço.

**A DISTÂNCIA pode ser reutilizada temporariamente**, porque as duas coisas têm
naturezas diferentes e a redação anterior as tratava como uma só:

| | Taxa | Distância |
|---|---|---|
| O que é | preço | medida física entre dois pontos |
| Muda quando | a Shalon muda a tabela | a malha viária muda |
| Reutilizável | **nunca** | sim, com condições |

O reuso só acontece quando **todas** estas condições valem:

1. mesma identidade geográfica do endereço (`address_key`);
2. **mesma origem** — `route_origin_lat/lng` iguais à coordenada atual da loja;
3. mesmo provedor de rotas;
4. medição com menos de **90 dias** (`route_measured_at`);
5. distância **estritamente positiva** — garantido por constraint.

O registro é **tudo ou nada**: constraint recusa medição pela metade, porque
distância sem a origem que a produziu é um número sem sentido.

Alterar as faixas de frete **não** invalida a distância. Mudar o endereço da
loja invalida **somente** a distância — a coordenada do cliente continua
válida, porque o cliente não se mexeu.

Distância vencida, origem diferente, provedor diferente ou registro
inconsistente produzem **miss**, e miss significa medir a rota de verdade. Em
nenhuma hipótese produzem distância zero ou taxa R$ 0,00.

A coordenada tem validade própria, mais longa (**180 dias**), medida por
`geocoded_at` — e **não** por `updated_at`, que o trigger da tabela reescreve a
cada alteração e renovaria a validade do cache por engano.

## 8.3 `public_devices`

Credencial persistente do navegador para “Meus pedidos/Histórico”.

- `id uuid PK`
- `customer_id uuid nullable FK`
- `token_hash text UNIQUE`
- `created_at timestamptz`
- `last_seen_at timestamptz`
- `revoked_at timestamptz nullable`

O navegador recebe token aleatório forte; o banco guarda preferencialmente hash, não o segredo em claro. Não permitir recuperar histórico completo apenas digitando WhatsApp.

Favoritos e carrinho permanecem locais no navegador na V1 e **não precisam de tabelas**. O carrinho local expira 24h após a última alteração relevante.

---

# 9. Pedidos

## 9.1 `orders`

Entidade central.

Campos sugeridos:

- `id uuid PK`
- `order_number bigint UNIQUE`
- `customer_id uuid nullable FK`
- `public_device_id uuid nullable FK`
- `tracking_token_hash text UNIQUE`
- `source text` — `shalon_link`, `whatsapp`, `phone`, `counter`, `ifood`, `other`
- `fulfillment_type text` — `delivery`, `pickup`
- `status text`
- `payment_status text`
- `customer_name_snapshot text`
- `customer_whatsapp_snapshot text`
- `marketing_consent_snapshot boolean`
- `subtotal numeric(12,2)`
- `delivery_fee numeric(12,2)`
- `total numeric(12,2)`
- `general_note text nullable`
- `estimated_min_minutes integer nullable`
- `estimated_max_minutes integer nullable`
- `requires_delivery_approval boolean`
- `delivery_approval_status text nullable`
- `delivery_route_distance_km numeric(8,3) nullable`
- `delivery_route_provider text nullable`
- `delivery_address_snapshot jsonb nullable`
- `store_address_snapshot jsonb nullable`
- `rejection_reason text nullable`
- `cancellation_reason text nullable`
- `accepted_at timestamptz nullable`
- `accepted_by uuid nullable` — no pedido manual, RN-MAN-004 faz a criação já
  preencher as duas colunas: lançar é aceitar, e o aceite não fica sem autor
  nem sem horário
- `ready_at timestamptz nullable`
- `completed_at timestamptz nullable`
- `cancelled_at timestamptz nullable`
- `cancelled_by uuid nullable`
- `created_at`, `updated_at`

**Observação:** snapshots estruturados em `jsonb` são aceitáveis para endereço e dados de exibição históricos, mas valores comerciais centrais continuam em colunas tipadas.

## 9.2 Máquina de estados do pedido

O `status` não deve ser editado arbitrariamente. Transições precisam passar por operação de domínio/RPC/server action autorizada.

Estados conceituais necessários incluem:

- `waiting_pix_confirmation`
- `waiting_delivery_approval`
- `waiting_store_confirmation`
- `change_requested_waiting_customer`
- `confirmed`
- `in_production`
- `ready_for_pickup`
- `ready_for_delivery`
- `out_for_delivery`
- `delivery_failed`
- `completed`
- `rejected`
- `cancelled`

A ordem exata, nomes finais e transições serão formalizados em `04-REGRAS-NEGOCIO.md`.

**Importante:** estados pré-condicionais podem depender do pagamento/entrega. Evitar uma enumeração que force combinações impossíveis. `payment_status` e `delivery_approval_status` permanecem dimensões próprias quando isso reduzir complexidade.

## 9.3 `order_items`

- `id uuid PK`
- `order_id uuid FK`
- `line_number integer`
- `item_type text` — `product`, `pizza`, `combo`
- `product_id uuid nullable FK`
- `product_name_snapshot text`
- `category_name_snapshot text nullable`
- `quantity integer`
- `unit_price numeric(12,2)`
- `line_total numeric(12,2)`
- `size_id uuid nullable FK`
- `size_name_snapshot text nullable`
- `crust_id uuid nullable FK`
- `crust_name_snapshot text nullable`
- `crust_price_snapshot numeric(12,2) default 0`
- `observation text nullable`
- `promotion_id uuid nullable FK`
- `promotion_name_snapshot text nullable`
- `regular_unit_price_snapshot numeric(12,2) nullable`
- `created_at`

Pedidos antigos não recalculam seus preços após alteração do catálogo.

## 9.4 `order_item_flavors`

Para pizza inteira ou meio a meio.

- `id uuid PK`
- `order_item_id uuid FK`
- `flavor_product_id uuid FK -> products.id`
- `flavor_name_snapshot text`
- `variant_id uuid nullable FK`
- `effective_price_snapshot numeric(12,2)`
- `portion numeric(5,4)` — ex.: 1.0000 ou 0.5000
- `sort_order integer`

Permite calcular popularidade 1/0,5 sem inferir texto.

## 9.5 `order_item_addons`

- `id uuid PK`
- `order_item_id uuid FK`
- `addon_id uuid nullable FK`
- `addon_name_snapshot text`
- `price_snapshot numeric(12,2)`

Sem quantidade >1 na V1.

## 9.6 `order_combo_components`

Snapshot dos componentes efetivamente vendidos dentro do combo.

- `id uuid PK`
- `order_item_id uuid FK`
- `component_product_id uuid nullable FK`
- `component_variant_id uuid nullable FK`
- `product_name_snapshot text`
- `size_name_snapshot text nullable`
- `quantity integer`
- `observation text nullable`
- `sort_order integer`

O preço comercial continua no `order_item` do combo. Componentes são úteis para produção e relatórios de unidades movimentadas.

## 9.7 `order_status_history`

- `id uuid PK`
- `order_id uuid FK`
- `from_status text nullable`
- `to_status text`
- `reason text nullable`
- `actor_type text` — `customer`, `user`, `system`
- `actor_user_id uuid nullable`
- `created_at timestamptz`

Append-only para usuários comuns.

## 9.8 `order_change_requests`

- `id uuid PK`
- `order_id uuid FK`
- `status text` — `pending`, `accepted`, `rejected`, `cancelled`
- `proposed_by uuid`
- `reason text`
- `before_snapshot jsonb`
- `after_snapshot jsonb`
- `old_total numeric(12,2)`
- `new_total numeric(12,2)`
- `customer_token_hash text nullable`
- `customer_responded_at timestamptz nullable`
- `created_at`, `updated_at`

Mudança de itens ou valor após solicitação da pizzaria exige aceite do cliente antes de seguir. Não sobrescrever silenciosamente o pedido.

## 9.9 `order_cancellation_requests`

- `id uuid PK`
- `order_id uuid FK`
- `requested_by_type text`
- `reason text`
- `status text`
- `decided_by uuid nullable`
- `decision_reason text nullable`
- `created_at`, `decided_at`

Cliente solicita; não cancela automaticamente.

---

# 10. Pagamentos

## 10.1 `payment_methods`

Registro central configurável.

- `id uuid PK`
- `code text UNIQUE`
- `name text`
- `payment_family text` — `cash`, `pix_machine`, `pix_key`, `debit`, `credit`, `voucher`, `other`
- `is_active boolean`
- `available_for_delivery boolean`
- `available_for_pickup boolean`
- `requires_brand boolean`
- `sort_order integer`

Pix por chave só fica disponível quando configurado e habilitado.

## 10.2 `payment_brands`

- `id uuid PK`
- `payment_method_id uuid FK`
- `name text`
- `is_active boolean`
- `sort_order integer`

Visa/Mastercard/vouchers são dados configuráveis, não enum fixa.

## 10.3 `pix_key_settings`

Registro sensível/configurável.

- `id uuid PK`
- `is_enabled boolean`
- `key_type text nullable`
- `pix_key text nullable`
- `recipient_name text nullable`
- `instructions text nullable`
- `updated_by uuid`
- `updated_at timestamptz`

RLS restritiva. O checkout público recebe somente os campos necessários quando habilitado.

## 10.4 `order_payment_intents`

O que o cliente declarou no checkout.

- `id uuid PK`
- `order_id uuid FK`
- `payment_method_id uuid FK`
- `payment_method_name_snapshot text`
- `payment_brand_id uuid nullable FK`
- `payment_brand_name_snapshot text nullable`
- `amount_expected numeric(12,2)`
- `needs_change boolean`
- `change_for_amount numeric(12,2) nullable`
- `expected_change_amount numeric(12,2) nullable`
- `pix_confirmation_status text nullable`
- `pix_confirmed_by uuid nullable`
- `pix_confirmed_at timestamptz nullable`
- `created_at`

## 10.5 `payments`

O que realmente foi recebido.

- `id uuid PK`
- `order_id uuid FK`
- `payment_method_id uuid FK`
- `payment_brand_id uuid nullable FK`
- `payment_method_name_snapshot text` · `payment_method_family_snapshot text` ·
  `payment_brand_name_snapshot text nullable` — snapshot do meio de pagamento
  (CLAUDE.md §16): renomear ou desativar a forma no cadastro não reescreve o
  que foi recebido ontem
- `amount numeric(12,2)` — **a venda**, não o que o cliente entregou na mão
- `tendered_amount numeric(12,2) nullable` · `change_amount numeric(12,2) nullable` —
  dinheiro entregue e troco devolvido. Venda de R$ 45 com nota de R$ 50 grava
  `amount = 45`, `tendered = 50`, `change = 5`, e o caixa recebe 45 líquidos
- `status text` — `pending`, `confirmed`, `reversed`
- `received_at timestamptz nullable`
- `confirmed_by uuid nullable`
- `driver_run_id uuid nullable` — **não criada na Fase 7**: depende de
  `driver_runs`, que é da Fase 8
- `cash_session_id uuid nullable` — nulo significa "não entrou em gaveta
  nenhuma": exceção autorizada (RN-CAIXA-003) ou valor ainda fora
  (RN-CAIXA-014)
- `idempotency_key uuid nullable` — a chave é do ATO de registro, não da
  linha. Um pagamento dividido grava várias linhas com a mesma chave, e o
  índice único é `(chave, forma, bandeira)` com `nulls not distinct`
- `reverses_payment_id uuid nullable` · `reversed_at` · `reversed_by` ·
  `reversal_reason` — reversão vinculada; o original permanece (RN-FIN-003)
- `notes text nullable`
- `created_at`

A V1 pública cria uma única intenção, mas `payments` permite múltiplas linhas para registrar pagamento dividido no administrativo.

**Regra:** relatórios financeiros usam pagamento realizado/confirmado, não apenas intenção do checkout.

## 10.6 `payment_adjustments`

Opcional se estorno/reversão não for representado adequadamente em `payments`.

Preferência arquitetural: preservar o pagamento original e registrar reversão/estorno como evento/lançamento, sem apagar.

---

# 11. Entregas e motoboys

## 11.1 `driver_runs`

Representa uma saída de um motoboy com um ou mais pedidos.

- `id uuid PK`
- `driver_employee_id uuid FK -> employees.id`
- `status text` — `open`, `out`, `settling`, `settled`
- `departed_at timestamptz`
- `returned_at timestamptz nullable`
- `settled_at timestamptz nullable`
- `settled_by uuid nullable`
- `notes text nullable`
- `created_by uuid`
- `created_at`
- `updated_at`

Implementado na Fase 8. Cada estado carrega o carimbo que o comprova, por
CHECK: `out` exige `departed_at`, `settling` exige `returned_at`, `settled`
exige `settled_at` e `settled_by`. Uma corrida `out` sem horário de saída
seria uma saída que não saiu.

Índice único parcial garante **uma corrida ativa por entregador** — status
`open` ou `out`. Não há limite de corridas encerradas.

## 11.2 `driver_run_orders`

- `id uuid PK`
- `driver_run_id uuid FK`
- `order_id uuid FK`
- `delivery_status text` — `pending`, `delivered`, `failed`, `reassigned`
- `failure_reason text nullable`
- `delivered_at timestamptz nullable`
- `assigned_by uuid FK -> app_users.id`
- `assigned_at timestamptz`
- `created_at`
- UNIQUE parcial (`order_id`) `where delivery_status = 'pending'`, conforme a
  recomendação de §11.4: impede o pedido em duas saídas **ativas** ao mesmo
  tempo, e preserva as tentativas anteriores.

`reassigned` é o estado do vínculo quando o pedido troca de motoboy antes de
sair: o vínculo antigo **permanece**, com quem havia atribuído e quando
(CLAUDE.md §22 — não sobrescrever silenciosamente).

`transferred` é o estado do vínculo quando o pedido **já estava na rua** e
mudou de responsável (RN-RUN-008). A diferença entre os dois não é cosmética:
`reassigned` significa "ia levar", `transferred` significa "estava levando", e
só o segundo tem consequência no acerto.

## 11.5 `delivery_transfers`

Acrescentada em 22/09/2026 (RN-RUN-008). Tabela própria porque a transferência
é um **evento com dois lados**, e nenhum dos dois vínculos sozinho conta a
história inteira.

- `id uuid PK`
- `order_id uuid FK`
- `from_run_id`, `from_link_id`, `from_employee_id` — de onde saiu
- `to_run_id`, `to_link_id`, `to_employee_id` — para onde foi
- `reason text not null` — motivo obrigatório
- `notes text nullable`
- `transferred_by uuid FK -> app_users.id`
- `transferred_at timestamptz`

CHECKs impedem transferência para o mesmo motoboy e para a mesma corrida.

Só há policy de SELECT (`deliveries.view`): a escrita é da RPC
`transferir_entrega`.

## 11.3 `driver_run_settlements`

- `id uuid PK`
- `driver_run_id uuid FK`
- `expected_cash numeric(12,2)`
- `returned_cash numeric(12,2)`
- `difference numeric(12,2)`
- `difference_reason text nullable`
- `attachment_asset_id uuid nullable`
- `notes text nullable`
- `settled_by uuid`
- `settled_at timestamptz`
- `cash_session_id uuid nullable FK -> cash_sessions.id` — **onde o dinheiro
  entrou**. Nulo quando a corrida não trouxe dinheiro físico a recolher.

`difference` é **derivada**, nunca digitada: CHECK garante
`difference = returned_cash - expected_cash`, e outro CHECK exige motivo
sempre que ela for diferente de zero (RN-RUN-004). UNIQUE em
`driver_run_id`: uma corrida se acerta uma vez (CLAUDE.md §34).

`expected_cash` também não é digitado. É a soma dos recebimentos em dinheiro
já registrados nos pedidos **entregues** daquela corrida que ainda não
entraram em gaveta nenhuma — recalculada dentro da transação do acerto, e
não lida da tela (03 §16.4).

Depois da Fase 8 complementar esse cálculo passou a ser uma função só,
`dinheiro_da_corrida`, porque "de quem é este dinheiro" deixou de ser
respondível pelo vínculo de entrega: com transferência em rota, um pode ter
recebido e outro ter entregado (RN-RUN-009). `payments.responsible_driver_run_id`
carrega a resposta explícita quando existe, e o vínculo responde quando não
existe. O painel e o acerto consultam a MESMA função — duas somas parecidas
divergiriam depois da primeira transferência.

Valores de cartão/Pix máquina podem ser apresentados no resumo da saída, mas dinheiro físico esperado deve ser distinguido de pagamentos processados na maquininha.

Diferença nunca gera desconto salarial automático.

## 11.4 Entrega não realizada

Representada por `driver_run_orders.delivery_status` + histórico do pedido. Motivo obrigatório. Pode haver nova tentativa, criando novo vínculo/saída conforme a regra de negócio, sem apagar a tentativa anterior. Se for necessário preservar várias tentativas do mesmo pedido, **não usar UNIQUE global em `order_id`; usar restrição apenas para uma saída ativa por vez**. Esta é a abordagem recomendada.

---

# 12. Caixa

## 12.1 `cash_registers`

Mesmo com um único ponto inicial, separar conceito físico de sessão.

- `id uuid PK`
- `name text`
- `is_active boolean`
- `created_at`

Pode existir inicialmente apenas “Caixa Principal”.

## 12.2 `cash_sessions`

- `id uuid PK`
- `cash_register_id uuid FK`
- `operational_date date`
- `opened_at timestamptz`
- `opened_by uuid`
- `opening_amount numeric(12,2) default 0`
- `status text` — `open`, `closed`, `reopened/corrected` conforme estratégia final
- `closed_at timestamptz nullable`
- `closed_by uuid nullable`
- `expected_cash_amount numeric(12,2) nullable`
- `counted_cash_amount numeric(12,2) nullable`
- `difference_amount numeric(12,2) nullable`
- `difference_reason text nullable`
- `pending_external_cash_amount numeric(12,2) nullable` — **substitui o
  `has_pending_driver_runs boolean` previsto originalmente.** Guarda QUANTO
  em dinheiro ainda estava fora da gaveta no momento do fechamento, e não
  apenas que havia algo. Não depende de `driver_runs` (Fase 8); na Fase 7 é
  o recebimento em dinheiro sem sessão vinculada (RN-CAIXA-014)
- `created_at`, `updated_at`

**Status adotado:** `open` e `closed` apenas. Uma sessão reaberta volta a
`open`, e a correção fica em `cash_session_corrections` com o fechamento
anterior em `before_snapshot` — em vez de um terceiro status ambíguo.

**Regras:**

- abertura pode ser R$ 0;
- meia-noite não fecha nem cria sessão;
- `operational_date` normalmente é a data local da abertura;
- caixa esquecido aberto continua aberto e gera alerta;
- permitir múltiplas sessões no mesmo dia, mas apenas uma ativa por `cash_register`;
- fechamento com diferença permitido, justificativa obrigatória se diferença != 0;
- pendências de motoboy não bloqueiam fechamento.

## 12.3 `cash_movements`

> **Acrescentado em 22/09/2026 (RN-EMPFIN-004):** o tipo `employee_advance`,
> sempre com `direction = 'out'` e motivo obrigatório, e a coluna
> `employee_ledger_entry_id` que o liga ao lançamento do funcionário. O tipo é
> próprio de propósito: **não é sangria**. Sangria é a Shalon levando o próprio
> dinheiro para outro lugar dela; adiantamento é dinheiro que sai para a mão
> de uma pessoa, e que ela vai conferir depois. Somá-los no mesmo tipo apagaria
> a pergunta "quanto saiu para quem".
>
> `reverter_movimento_caixa` **recusa** estornar um movimento com
> `employee_ledger_entry_id`: o caminho é estornar o adiantamento no histórico
> do funcionário, e os dois voltam juntos.

Movimentos físicos do caixa.

- `id uuid PK`
- `cash_session_id uuid FK`
- `movement_type text` — `opening`, `sale_receipt`, `supply`, `withdrawal`, `expense`, `refund`, `adjustment`, `other`
- `direction text` — `in`, `out`
- `amount numeric(12,2)`
- `order_id uuid nullable`
- `financial_entry_id uuid nullable`
- `reason text nullable`
- `created_by uuid`
- `created_at`
- `payment_id uuid nullable` — o recebimento que originou o movimento
- `reverses_movement_id uuid nullable` — o movimento compensatório aponta
  para o original; único, para impedir duplo estorno
- `reversed_at timestamptz nullable`
- `reversed_by uuid nullable`
- `reversal_reason text nullable`
- `idempotency_key uuid nullable` — protege contra dupla sangria e reenvio

Sangria (`withdrawal`) e suprimento (`supply`) são operações distintas. Despesa paga pelo caixa gera registro financeiro e movimento físico relacionado.

**`amount` é sempre positivo.** Quem decide o sinal é `direction` — guardar
valor negativo permitiria uma sangria "de valor negativo" que soma no caixa.

**O fundo inicial NÃO vira movimento.** Ele mora em
`cash_sessions.opening_amount`, com autor e horário. Criá-lo também como
movimento `opening` daria duas fontes para o mesmo dinheiro, e um fundo de
R$ 0,00 nem poderia existir como linha (o valor tem de ser positivo). O tipo
`opening` segue no CHECK para uso futuro.

## 12.4 Correção de caixa fechado

Não sobrescrever fechamento. Recomenda-se tabela/evento `cash_session_corrections`:

- `id uuid PK`
- `cash_session_id uuid FK`
- `correction_type text`
- `reason text`
- `before_snapshot jsonb`
- `after_snapshot jsonb`
- `created_by uuid`
- `created_at`

Somente permissão administrativa específica.

---

# 13. Financeiro

## 13.1 `financial_categories`

- `id uuid PK`
- `name text`
- `kind text` — `income`, `expense`, `both`
- `is_active boolean`
- `sort_order integer`
- `created_at`, `updated_at`

## 13.2 `financial_entries`

Entradas/despesas operacionais que não devem ser confundidas com o ledger de pagamentos de pedidos.

- `id uuid PK`
- `entry_type text` — `income`, `expense`
- `category_id uuid FK`
- `amount numeric(12,2)`
- `occurred_at timestamptz`
- `description text`
- `payment_method_id uuid nullable`
- `cash_session_id uuid nullable`
- `attachment_asset_id uuid nullable` — comprovante em `media_assets`, com
  `asset_type = 'financial_receipt'` e bucket privado `comprovantes`. Enquanto
  o lançamento é alterável, pode ser trocado ou removido; depois do estorno a
  evidência congela (RN-FIN-002/003)
- `status text` — `confirmed`, `reversed`
- `payment_method_name_snapshot text nullable`
- `reverses_entry_id uuid nullable` — o lançamento CORRETO aponta para o que
  ele corrige. O sistema não o cria sozinho: quem sabe o valor certo é a
  pessoa (RN-FIN-004)
- `created_by uuid`
- `created_at`
- `reversed_by uuid nullable`
- `reversed_at timestamptz nullable`
- `reversal_reason text nullable`

**`cash_session_id` só é preenchido quando o dinheiro passou pela gaveta.**
Uma conta paga por transferência é despesa e **não** é saída de caixa
(RN-CAIXA-010).

**Esta tabela não é o ledger de vendas** e não tem como apontar para um
pedido: venda vive em `payments`. A separação é estrutural, e é ela que fará
cortesia e consumo interno (Fase 8) não entrarem no faturamento por terem
produtos (03 §17.1).

Registro confirmado não é apagado. Correção por estorno + novo lançamento.

## 13.3 `employee_ledger_entries`

- `id uuid PK`
- `employee_id uuid FK`
- `entry_type text` — `consumption`, `advance`, `discrepancy`, `adjustment`, `other`
- `amount numeric(12,2)`
- `occurred_at timestamptz`
- `reason text`
- `notes text nullable`
- `status text`
- `related_driver_run_id uuid nullable`
- `related_internal_movement_id uuid nullable`
- `attachment_asset_id uuid nullable`
- `created_by uuid`
- `authorized_by uuid nullable`
- `created_at`
- `reverses_entry_id uuid nullable`
- `reversed_by uuid nullable`, `reversed_at timestamptz nullable`,
  `reversal_reason text nullable`
- `idempotency_key uuid nullable` — UNIQUE parcial
- `payment_method_id uuid nullable` + `payment_method_name_snapshot text
  nullable` — RN-EMPFIN-001 prevê registrar como o adiantamento foi pago; o
  snapshot existe para que renomear a forma depois não reescreva o lançamento

Não é folha de pagamento. Não desconta automaticamente do salário.

RN-EMPFIN-004: quando o adiantamento sai em dinheiro da gaveta, o outro lado
do fato é um `cash_movements` do tipo `employee_advance`, apontando de volta
por `cash_movements.employee_ledger_entry_id`. Os dois nascem na mesma
transação e são revertidos juntos — não existe meio estorno.

Implementado na Fase 8. Índices únicos parciais impedem **dois lançamentos
confirmados para a mesma corrida** e **dois para o mesmo movimento interno**:
a diferença de um acerto vira lançamento uma vez só (CLAUDE.md §34).

Esta tabela é o ponto exato da separação de §15: a policy de leitura exige
`employees.finance.view`, que o Atendente **não** possui — enquanto as
movimentações internas de §14 exigem apenas `internal.view`, que ele possui.
Registrar o consumo de alguém não abre o livro dessa pessoa.

---

# 14. Cortesias, consumo interno e perdas

## 14.1 `internal_product_movements`

Tabela para distinguir saída não comercial de produto.

- `id uuid PK`
- `movement_type text` — `courtesy`, `employee_consumption`, `owner_consumption`, `loss`
- `employee_id uuid nullable FK` — obrigatório quando aplicável
- `reason text`
- `authorized_by uuid nullable`
- `created_by uuid`
- `occurred_at timestamptz`
- `status text`
- `attachment_asset_id uuid nullable`
- `notes text nullable`
- `created_at`
- `reversed_by uuid nullable`, `reversed_at timestamptz nullable`,
  `reversal_reason text nullable`
- `idempotency_key uuid nullable` — UNIQUE parcial

Implementado na Fase 8. CHECK de coerência: `employee_consumption` **exige**
funcionário; `courtesy` e `loss` **não podem** ter um — com funcionário,
pareceriam consumo, que é a confusão que RN-CLASS-001 manda evitar.
`owner_consumption` aceita os dois casos, porque o proprietário pode ou não
estar cadastrado como funcionário. Outro CHECK exige `authorized_by` para
cortesia (RN-CORT-002).

Estorno não apaga: `status = 'reversed'` com quem, quando e por quê, e os
itens permanecem (CLAUDE.md §28).

## 14.2 `internal_product_movement_items`

- `id uuid PK`
- `movement_id uuid FK`
- `product_id uuid nullable FK`
- `variant_id uuid nullable FK`
- `product_name_snapshot text`
- `size_name_snapshot text nullable`
- `quantity numeric(10,2)`
- `reference_unit_price numeric(12,2) nullable`
- `observation text nullable`

`product_name_snapshot` guarda o **rótulo completo** que o configurador
montou — para meio a meio, "Sabor A / Sabor B". `variant_id` é a variação
escolhida e fica **nulo em meio a meio**, onde há mais de uma: quem carrega a
identidade do que saiu é o snapshot, não a chave estrangeira.

`reference_unit_price` vem de `montar_item`, a mesma autoridade de preço do
cardápio, do balcão e da alteração (CLAUDE.md §16/§17). É valor **de
referência**: dimensiona o movimento no relatório e não cobra de ninguém.

Essas movimentações **não entram em faturamento, ticket médio ou venda ao cliente**. Podem alimentar relatórios de saída interna. Sem estoque quantitativo, não dão baixa automática em ingredientes.

Consumo de funcionário pode gerar `employee_ledger_entry` relacionado. Cortesia exige motivo/autorização. Perda/descarte registra responsável/motivo.

---

# 15. Remarketing e consentimento

## 15.1 `marketing_consent_history`

- `id uuid PK`
- `customer_id uuid FK`
- `consent boolean`
- `source text`
- `created_at timestamptz`
- `actor_type text`
- `actor_user_id uuid nullable`

Mantém histórico da autorização promocional. Comunicação operacional do pedido é independente.

## 15.2 `remarketing_templates`

- `id uuid PK`
- `name text`
- `message text`
- `is_active boolean`
- `created_by uuid`
- `created_at`, `updated_at`

## 15.3 `remarketing_contacts`

- `id uuid PK`
- `customer_id uuid FK`
- `template_id uuid nullable FK`
- `contacted_by uuid`
- `contacted_at timestamptz`
- `channel text default 'whatsapp'`
- `result text` — `contacted`, `no_response`, `interested`, `opted_out`, `other`
- `notes text nullable`
- `subsequent_order_id uuid nullable FK`
- `returned_after_contact boolean default false`
- `created_at`, `updated_at`

Não afirmar causalidade. O relatório pode dizer “voltou a comprar após o contato”. Se cliente pedir para não receber promoções, atualizar consentimento.

## 15.4 Inteligência de clientes inativos

Não precisa de tabela canônica inicialmente. Derivar de histórico de pedidos concluídos:

- última compra;
- frequência/intervalo habitual;
- dias ausente;
- quantidade de pedidos;
- ticket médio;
- filtros 15/30/60/90 dias.

Pode existir view/cache posteriormente. Clientes sem consentimento não entram em ações promocionais, embora continuem aparecendo em análises internas conforme regras de privacidade.

---

# 16. Impressão 58 mm

## 16.1 `print_jobs`

- `id uuid PK`
- `order_id uuid nullable FK`
- `internal_movement_id uuid nullable FK`
- `print_type text` — `production`, `order_change`, `employee_consumption`, `reprint`
- `content_snapshot jsonb`
- `status text`
- `requested_by uuid`
- `requested_at timestamptz`
- `printed_at timestamptz nullable`
- `reprint_of_id uuid nullable FK -> print_jobs.id`

A comanda de produção só é gerada após aceite efetivo. Alteração posterior gera **comanda adicional de ALTERAÇÃO**; não apaga a impressão anterior. Reimpressões ficam registradas.

Não fiscal.

---

# 17. Auditoria

## 17.1 `audit_logs`

- `id uuid PK`
- `actor_user_id uuid nullable`
- `actor_type text`
- `action text`
- `entity_type text`
- `entity_id uuid nullable`
- `before_data jsonb nullable`
- `after_data jsonb nullable`
- `reason text nullable`
- `metadata jsonb nullable`
- `created_at timestamptz`

Eventos prioritários:

- aceite/rejeição/cancelamento de pedido;
- alteração de pedido;
- confirmação de Pix;
- override de taxa de entrega;
- aprovação/rejeição de entrega fora da área padrão;
- abertura/fechamento/correção de caixa;
- sangria/suprimento/estorno;
- diferença de caixa;
- acerto/diferença de motoboy;
- lançamentos financeiros e estornos;
- salário/referência financeira de funcionário;
- adiantamentos;
- alterações de função/permissão;
- bloqueio/desbloqueio de cliente;
- configurações críticas;
- reimpressões.

`audit_logs` deve ser append-only para usuários normais.

---

# 18. Configurações críticas e histórico

Além de `audit_logs`, não é necessário criar uma tabela de versão para cada configuração na V1. O log de auditoria deve armazenar `before_data` e `after_data` suficientes para responder:

- quem alterou;
- quando;
- valor anterior;
- valor novo.

Para configurações com histórico operacional próprio (caixa, promoções, pedidos), manter também as tabelas específicas.

---

# 19. Revalidação do carrinho e criação segura do pedido

A criação do pedido público deve ocorrer por **operação controlada no servidor**, idealmente uma função/RPC transacional ou endpoint server-side que:

1. recebe IDs e escolhas do cliente, nunca preços como autoridade;
2. identifica produtos/variações atuais;
3. valida ativo + disponibilidade de categoria/produto/variação;
4. valida tamanho e quantidade máxima de sabores;
5. valida meio a meio e calcula maior preço efetivo;
6. resolve promoção vigente e limites por pedido;
7. valida borda e adicionais compatíveis;
8. valida combo e todos os componentes;
9. valida quantidade máxima por produto/promoção;
10. recalcula subtotal;
11. valida loja aberta e pedido mínimo;
12. para entrega, valida endereço/geocode/rota/faixa/taxa;
13. valida forma/bandeira de pagamento ativa;
14. calcula troco quando aplicável;
15. compara resultado atual com o carrinho apresentado;
16. se houver diferença comercial, devolve estado de **reconfirmação** em vez de criar silenciosamente;
17. somente após aceite final cria `orders`, itens, snapshots e intenção de pagamento em uma transação.

Nenhum valor enviado pelo navegador pode ser tratado como preço definitivo.

---

# 20. Snapshot mínimo obrigatório do pedido

Mesmo mantendo FKs para entidades atuais, cada pedido deve preservar no mínimo:

- nome/WhatsApp do cliente;
- endereço textual e coordenadas de entrega;
- distância de rota e provedor;
- taxa de entrega;
- prazo estimado mostrado;
- nomes dos produtos;
- tamanho;
- sabores/porções;
- borda e preço;
- adicionais e preços;
- componentes do combo;
- observações;
- preço normal e promocional quando relevante;
- subtotal e total;
- forma/bandeira de pagamento prevista;
- troco;
- origem do pedido;
- dados necessários à impressão.

O histórico nunca deve depender de `JOIN` com o catálogo atual para reconstruir o que foi vendido no passado.

---

# 21. Views e consultas derivadas recomendadas

Criar como views SQL somente quando a implementação chegar à fase correspondente:

- `v_current_effective_product_prices`
- `v_public_catalog_availability`
- `v_top_products_30d`
- `v_customer_purchase_patterns`
- `v_remarketing_candidates`
- `v_open_operational_alerts`
- `v_cash_session_expected_balance`
- `v_driver_run_expected_settlement`
- `v_sales_summary_by_period`
- `v_product_sales_summary`
- `v_payment_summary`

Evitar materialized views prematuras. Começar com consultas/views normais e otimizar após medir.

---

# 22. Índices iniciais esperados

Além de PK/UNIQUE/FKs, prever índices para:

- `orders(created_at)`
- `orders(status, created_at)`
- `orders(customer_id, created_at desc)`
- `orders(source, created_at)`
- `order_items(order_id)`
- `order_item_flavors(order_item_id)`
- `payments(order_id, status)`
- `customers(whatsapp_normalized)`
- `customer_addresses(customer_id, is_active)`
- `products(category_id, is_active, sort_order)`
- `product_variants(product_id, size_id)`
- `promotions(product_id/variant_id, starts_at, ends_at)` conforme desenho final
- `driver_runs(driver_employee_id, status, departed_at)`
- `driver_run_orders(order_id)`
- `cash_sessions(cash_register_id, status)`
- `cash_movements(cash_session_id, created_at)`
- `financial_entries(occurred_at, entry_type, category_id)`
- `employee_ledger_entries(employee_id, occurred_at)`
- `remarketing_contacts(customer_id, contacted_at)`
- `audit_logs(entity_type, entity_id, created_at)`

Busca pública por nome/descrição/categoria deverá ser case/accent-insensitive. Avaliar `unaccent` + `pg_trgm`/índice adequado durante implementação, sem hardcodar solução antes de testar no Supabase.

---

# 23. Constraints e invariantes prioritárias

O banco deve impedir estados evidentemente inválidos sempre que possível:

- valores monetários não negativos onde aplicável;
- quantidade > 0;
- `max_flavors >= 1`;
- `slice_count > 0`;
- `max_quantity_per_order > 0` quando não nulo;
- promoção com fim posterior ao início;
- faixas de entrega válidas e sem sobreposição;
- apenas uma sessão de caixa aberta por caixa;
- funcionário desligado não pode manter acesso ativo;
- `pix_key` só é exposta quando Pix por chave estiver habilitado;
- pedido de retirada não possui taxa de entrega;
- pedido de entrega possui snapshot de endereço/rota quando criado normalmente;
- alteração de pagamento preserva intenção original;
- estornos não apagam lançamento original;
- pedidos concluídos/cancelados/rejeitados não são fisicamente apagados.

Regras que exigem contexto complexo devem ficar em funções de domínio/RPC e não em `CHECK` excessivamente inteligente.

---

# 24. Concorrência e transações

Operações que devem ser atômicas/transacionais:

- criação definitiva do pedido;
- aceite do pedido + geração da primeira comanda;
- confirmação de alteração pelo cliente;
- cancelamento/rejeição;
- confirmação de Pix + avanço permitido;
- abertura e fechamento de caixa;
- despesa paga em dinheiro + movimento de caixa;
- estorno financeiro;
- criação de saída de motoboy com associação de pedidos;
- acerto de saída;
- consumo de funcionário + lançamento financeiro relacionado;
- alteração de permissões sensíveis.

Usar locking/constraints apropriados para impedir duplo aceite, dupla sessão aberta, duplo acerto ou pedido simultaneamente atribuído a duas saídas ativas.

---

# 25. RLS — fronteiras que o próximo documento deverá formalizar

Este documento **não substitui** a matriz de RLS/RBAC, mas o modelo deve permitir:

### Público anônimo

Pode ler somente catálogo/configuração estritamente pública e executar operações públicas controladas. Não deve receber acesso CRUD direto a pedidos, clientes, pagamentos ou tabelas internas.

### Cliente sem login

Acesso a um pedido específico somente por credencial/token imprevisível validado no servidor. Histórico do mesmo dispositivo por credencial persistente própria, não por WhatsApp digitado.

### Atendente

Acesso operacional conforme permissões, sem salário ou financeiro sensível de funcionários por padrão.

### Dono/Admin

Acesso ampliado conforme RBAC, ainda respeitando operações auditadas.

### Service role

Nunca no frontend.

---

# 26. Dados locais que NÃO pertencem ao Supabase na V1

- favoritos do cliente;
- carrinho em andamento;
- TTL do carrinho;
- preferências efêmeras de UI.

Favoritos ficam em armazenamento persistente local. Carrinho expira após 24 horas da última alteração relevante e é revalidado no servidor ao retomar/finalizar.

A credencial de dispositivo para histórico é um segredo local, mas sua representação segura/hash e associação pertencem ao servidor.

---

# 27. O que não modelar agora

Não criar tabelas ou abstrações completas para:

- multitenancy/multiunidade;
- estoque quantitativo;
- ingredientes/ficha técnica;
- CMV/margem real;
- KDS/tela de produção;
- integração automática com iFood;
- API oficial do WhatsApp;
- disparo automático de remarketing;
- gateway de pagamento;
- conciliação automática de Pix;
- folha de pagamento;
- GPS/rastreamento do motoboy;
- pedidos agendados;
- escolha flexível de componentes de combo;
- conta/senha de cliente;
- sincronização de favoritos entre dispositivos.

Preparar extensibilidade não significa criar tabelas vazias para funcionalidades fora do escopo.

---

# 28. Ordem sugerida das migrations futuras

Quando a implementação for autorizada, a ordem recomendada é:

1. extensões PostgreSQL necessárias;
2. tipos/enums mínimos ou domínios textuais controlados;
3. loja/configurações;
4. funcionários/app_users;
5. roles/permissions;
6. mídia;
7. categorias/produtos/tamanhos/variações;
8. bordas/adicionais/combos;
9. promoções/banners;
10. clientes/endereços/dispositivos;
11. pagamentos configuráveis;
12. pedidos/itens/snapshots/históricos;
13. entregas/saídas/acertos;
14. caixa;
15. financeiro/employee ledger;
16. movimentações internas;
17. remarketing;
18. impressão;
19. auditoria;
20. views/funções transacionais;
21. índices adicionais;
22. RLS/policies e testes de autorização.

Na prática, RLS deve ser desenvolvida junto das tabelas e validada continuamente; o item 22 representa a consolidação/testes finais, não deixar segurança para o fim.

---

# 29. Pontos a decidir tecnicamente antes das migrations

Não são novas perguntas de negócio para o proprietário. São decisões de engenharia:

1. padronizar enums PostgreSQL vs `text + CHECK` para estados que podem evoluir;
2. definir estratégia de `order_number` sequencial e concorrente;
3. definir implementação do token público e hashing;
4. escolher funções RPC/server actions para operações transacionais;
5. definir integração de geocoding/route provider sem expor chaves;
6. definir estratégia de normalização de telefone;
7. definir política de retenção/remoção de mídia órfã;
8. definir índices de busca (`unaccent`, trigram etc.);
9. definir política de idempotência para criação de pedido e confirmações;
10. definir modelo exato de eventos de pagamento/estorno;
11. formalizar máquina de estados;
12. formalizar matriz RLS/RBAC por tabela/operação.

Esses pontos serão resolvidos nos documentos técnicos seguintes, sem reabrir a descoberta funcional salvo se surgir conflito real com uma regra de negócio.

---

# 30. Mapa resumido de relacionamentos

```text
auth.users
   │
   └── app_users ── employees ── employee_financial_profiles
          │              │
          ├── user_roles ── roles ── role_permissions ── permissions
          │              │
          │              └── employee_ledger_entries
          │
          └── audit_logs

categories ── products ── product_variants ── pizza_sizes
                 │               │
                 ├── combo_components
                 ├── product_crust_exclusions ── crusts ── crust_size_prices
                 ├── product_addon_rules ── addons ── addon_size_prices
                 ├── promotions
                 └── media_assets

customers ── customer_addresses
    │
    ├── public_devices
    ├── marketing_consent_history
    ├── remarketing_contacts
    └── orders ── order_items ── order_item_flavors
                    │  │
                    │  ├── order_item_addons
                    │  └── order_combo_components
                    │
                    ├── order_status_history
                    ├── order_change_requests
                    ├── order_cancellation_requests
                    ├── order_payment_intents
                    ├── payments
                    ├── print_jobs
                    └── driver_run_orders ── driver_runs ── driver_run_settlements

cash_registers ── cash_sessions ── cash_movements
                                └── cash_session_corrections

financial_categories ── financial_entries

internal_product_movements ── internal_product_movement_items
```

---

# 31. Critério de aprovação deste modelo

O modelo estará pronto para virar migrations somente quando conseguirmos demonstrar, em papel, os seguintes ciclos sem inventar dados ou quebrar histórico:

1. cliente monta pizza inteira ou meio a meio com preço correto;
2. promoção expira enquanto carrinho está aberto e ocorre revalidação;
3. endereço é geocodificado, rota calculada e taxa aplicada;
4. pedido fora do raio automático aguarda aprovação;
5. Pix por chave aguarda confirmação antes da produção;
6. pedido é aceito e gera comanda 58 mm;
7. alteração posterior gera aceite do cliente + comanda de alteração;
8. pedido entra em saída com vários pedidos de motoboy;
9. pagamento efetivo difere do previsto sem perder histórico;
10. motoboy retorna com diferença e isso não desconta salário automaticamente;
11. caixa atravessa meia-noite sem ser fechado;
12. despesa paga em dinheiro reduz saldo físico e permanece classificada como despesa;
13. caixa fecha com pendência de motoboy sem fingir recebimento;
14. funcionário consome produto sem inflar faturamento;
15. cortesia/perda/consumo do dono ficam separados de venda;
16. cliente retorna pelo mesmo dispositivo e acessa histórico sem senha;
17. outro dispositivo não obtém histórico apenas digitando WhatsApp;
18. cliente bloqueado não recebe o motivo interno;
19. remarketing respeita consentimento;
20. alteração de configuração crítica deixa auditoria.

---

# 32. Próximo documento

Após aprovação deste modelo, criar:

**`03-RLS-RBAC-SEGURANCA.md`**

O documento `03-RLS-RBAC-SEGURANCA.md` consolidou a especificação de segurança e este modelo em uma matriz concreta de:

- tabela/recurso;
- ator;
- SELECT/INSERT/UPDATE/DELETE;
- operação via RPC/server;
- permissão semântica necessária;
- campos sensíveis;
- eventos auditados;
- cenários de teste de autorização.

Somente depois disso consolidar `04-REGRAS-NEGOCIO.md`, `05-PLANO-IMPLEMENTACAO.md` e o `CLAUDE.md` raiz.

---

**Regra final:** este documento descreve o modelo de dados desejado. **Claude Code deve analisá-lo, apontar conflitos técnicos e aguardar autorização. Não deve criar migrations, tabelas, policies ou código de produção apenas por receber este arquivo.**
