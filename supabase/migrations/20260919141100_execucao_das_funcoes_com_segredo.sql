-- 0045 — corrige a execução de origem_da_loja e cotar_entrega
--
-- A 0044 revogou EXECUTE dessas duas funções de `anon`. Só que o nosso
-- Server Action fala com o Supabase usando a chave publicável — ou seja,
-- ele TAMBÉM é `anon` do ponto de vista do Postgres. O resultado seria
-- 42501 em toda cotação de entrega.
--
-- A postura correta é a mesma já adotada em `criar_pedido` (0042): a função
-- fica exposta, e quem barra é o SEGREDO DE ORIGEM (0040), verificado na
-- primeira linha do corpo. Sem o segredo, a chamada volta
-- `origem_nao_confiavel` e não revela coordenada, raio nem taxa.
--
-- Trocar a chave publicável por `service_role` para "resolver" isto seria
-- exatamente o atalho proibido por CLAUDE.md §13.

grant execute on function public.origem_da_loja(text) to anon, authenticated;
grant execute on function public.cotar_entrega(numeric, text) to anon, authenticated;
