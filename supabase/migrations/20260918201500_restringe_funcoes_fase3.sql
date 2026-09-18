-- 0026 — Restringe a execução das funções da Fase 3
-- CLAUDE.md §13 · 03-RLS-RBAC-SEGURANCA.md §4 · mesma postura da migration 0009
--
-- O EXECUTE nasce concedido a PUBLIC. As trigger functions criadas nas
-- migrations 0014, 0016, 0017 e 0022 ficaram, por omissão, chamáveis via
-- /rest/v1/rpc/. Chamá-las direto falharia, mas superfície exposta sem uso é
-- superfície a menos que se deva manter (princípio do menor privilégio, §3.4).
revoke all on function public.tg_variante_produto_compativel() from public, anon, authenticated;
revoke all on function public.tg_combo_componente_valido() from public, anon, authenticated;
revoke all on function public.tg_promocao_alvo_coerente() from public, anon, authenticated;
revoke all on function public.tg_audit_pix() from public, anon, authenticated;

-- As funções abaixo CONTINUAM públicas de propósito: são exatamente a
-- projeção pública prevista em 03 §7.1 e §33.1. Nenhuma recebe parâmetro de
-- identidade e nenhuma devolve campo interno — a lista de colunas de
-- loja_publica() é escrita à mão justamente por isso.
--   · loja_publica()          — DTO da loja para o cardápio
--   · horarios_publicos()     — horário semanal
--   · loja_aberta()           — aberto/fechado derivado
--   · adicionais_habilitados()— só o liga/desliga global de adicionais
