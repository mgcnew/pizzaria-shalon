-- 0069 — A chave de idempotência é do ATO, não da linha
-- CLAUDE.md §34 · RN-PGTO-004 · Corrige defeito introduzido na 0064
--
-- O DEFEITO, encontrado pelo teste de split.
--
-- `registrar_pagamento` grava uma linha por forma de pagamento e carimba a
-- MESMA `idempotency_key` em todas — porque a chave identifica a tentativa
-- de registro, não a linha. Mas a 0064 criou um índice único sobre a chave
-- sozinha. Resultado: todo pagamento dividido explodia na segunda linha,
-- com erro de chave duplicada.
--
-- Nenhum pagamento único era afetado, e por isso o defeito passaria fácil
-- por uma verificação feita só com dinheiro. Quem o encontrou foi o cenário
-- "R$ 60 em dinheiro + R$ 40 no débito".
--
-- A CORREÇÃO preserva a garantia no banco em vez de removê-la: a unicidade
-- passa a ser (tentativa, forma, bandeira), que é exatamente o que um
-- reenvio repetiria. `nulls not distinct` é necessário porque dinheiro não
-- tem bandeira — sem isso, duas linhas de dinheiro com a mesma chave
-- passariam, já que NULL ≠ NULL em índice único.

drop index public.payments_idempotencia;

create unique index payments_idempotencia
  on public.payments (idempotency_key, payment_method_id, payment_brand_id)
  nulls not distinct
  where idempotency_key is not null;

comment on index public.payments_idempotencia is
  'CLAUDE.md §34: a chave é do ato de registro. Um ato com split escreve várias linhas, uma por forma.';
