-- 0105 — auxiliares de dinheiro deixam de furar o RLS do chamador
-- 03-RLS-RBAC-SEGURANCA.md §4 · CLAUDE.md §12, §15
--
-- VULNERABILIDADE COMPROVADA NA FASE 10.
--
-- Identidade usada: papel customizado com **apenas** `orders.view` — sem
-- `finance.view`, sem `cash.view`, sem `employees.view_financial`.
--
-- O RLS fez o trabalho dele: `select` direto em `cash_sessions`,
-- `cash_movements`, `payments`, `customers` e `driver_runs` devolveu 0 linhas.
-- Mas estas quatro funções são `SECURITY DEFINER`, o dono delas é `postgres`,
-- e `postgres` tem `rolbypassrls` — então elas ignoram o RLS inteiro,
-- inclusive o `force row level security` das tabelas. Resultado medido:
--
--   esperado_em_caixa(<sessao>)                  → 1734.56
--   dinheiro_fora_da_gaveta()                    → executou e agregou
--   dinheiro_da_corrida(<corrida>, true)         → executou e agregou
--   montar_mensagem_de_remarketing('{{nome}}…')  → "Ola Joana, tudo bem?"
--
-- A última é a pior em natureza: devolve o primeiro nome de QUALQUER cliente
-- a partir do UUID, o que também serve de oráculo de enumeração.
--
-- POR QUE NÃO SÃO 91 VULNERABILIDADES. As projeções de leitura do sistema
-- (`caixa_atual`, `lancamentos_financeiros`, `equipe`,
-- `historico_do_funcionario`, `sessoes_de_caixa`, `movimentos_internos`,
-- `corridas`…) são `SECURITY INVOKER` de propósito: quem autoriza é o RLS da
-- tabela, e o teste com o mesmo papel fraco confirmou que elas não devolvem
-- nada. O desenho está certo. O defeito é local, nestas quatro.
--
-- POR QUE `INVOKER` EM VEZ DE REVOGAR O `EXECUTE`. Três delas são chamadas
-- por projeções que são `INVOKER` — `caixa_atual` e `resumo_do_fechamento`
-- chamam `esperado_em_caixa` e `dinheiro_fora_da_gaveta`; `corrida` e
-- `central_de_entregas` chamam `dinheiro_da_corrida`. Revogar o `EXECUTE` de
-- `authenticated` quebraria essas telas para quem TEM a permissão correta.
--
-- `SECURITY INVOKER` resolve os dois lados de uma vez:
--
--   chamada de dentro de projeção INVOKER  → roda como o usuário  → RLS vale
--   chamada de dentro de comando DEFINER   → roda como `postgres` → vê tudo
--
-- e os comandos que precisam do número completo (`fechar_caixa`,
-- `movimentar_caixa`, `registrar_lancamento`, `conciliar_corrida`,
-- `reverter_*`, `central_de_atencao`) continuam funcionando sem alteração,
-- porque lá dentro o usuário corrente já é o dono.
--
-- O corpo das três não muda: só o modo de segurança.

alter function public.esperado_em_caixa(uuid)                security invoker;
alter function public.dinheiro_fora_da_gaveta()              security invoker;
alter function public.dinheiro_da_corrida(uuid, boolean)     security invoker;

-- `montar_mensagem_de_remarketing` é outro caso: ela depende de
-- `padrao_de_compra()`, que é definer, e seu ÚNICO chamador
-- (`preparar_contato_de_remarketing`) também é definer. Não há chamador
-- INVOKER a preservar, então aqui vale a doutrina da 0009 — auxiliar que
-- ninguém chama de fora não fica exposta na API.
revoke all on function public.montar_mensagem_de_remarketing(text, uuid)
  from public, anon, authenticated;

comment on function public.esperado_em_caixa is
  'Esperado na gaveta. INVOKER: respeita o RLS de quem chama (0105).';
comment on function public.dinheiro_fora_da_gaveta is
  'Dinheiro confirmado ainda fora do caixa. INVOKER: respeita o RLS de quem chama (0105).';
comment on function public.dinheiro_da_corrida is
  'Dinheiro da corrida. INVOKER: respeita o RLS de quem chama (0105).';
comment on function public.montar_mensagem_de_remarketing is
  'Preenche os marcadores do template. Não é chamável via API: só de dentro de preparar_contato_de_remarketing (0105).';
