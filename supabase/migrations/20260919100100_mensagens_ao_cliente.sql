-- 0035 — Mensagens de item em linguagem de cliente
-- 03-RLS-RBAC-SEGURANCA.md §37 (CLAUDE.md §37): erro útil, sem detalhe interno
--
-- DEFEITO ENCONTRADO NO NAVEGADOR: com um sabor indisponível, o carrinho
-- mostrava ao CLIENTE o texto "Sabor indisponivel no tamanho escolhido
-- (RN-PIZZA-004)" — a assertiva de domínio, com código de regra e sem
-- acentuação.
--
-- As mensagens de `preco_meio_a_meio` continuam como estão: elas são a
-- assertiva técnica, citada nos testes e útil no log. Quem traduz para a
-- pessoa é `montar_item`, que é a fronteira com a interface.
create or replace function public.mensagem_ao_cliente(p_erro text)
returns text language sql immutable set search_path = ''
as $$
  select case
    when p_erro like '%mesmo tamanho%'
      then 'Os sabores escolhidos não estão disponíveis no mesmo tamanho.'
    when p_erro like '%maximo%sabor%'
      then 'Este tamanho não aceita essa quantidade de sabores.'
    when p_erro like '%indisponivel%'
      then 'Um dos sabores está indisponível no tamanho escolhido.'
    when p_erro like '%inexistente%' or p_erro like '%nao acessivel%'
      then 'Um dos sabores saiu do cardápio.'
    when p_erro like '%Tamanho inativo%'
      then 'Este tamanho não está mais disponível.'
    when p_erro like '%ao menos um sabor%'
      then 'Escolha ao menos um sabor.'
    else 'Não foi possível montar este item com as opções escolhidas.'
  end;
$$;

comment on function public.mensagem_ao_cliente is 'Traduz assertiva de domínio em texto para o cliente (CLAUDE.md §37).';

revoke all on function public.mensagem_ao_cliente(text) from public;
grant execute on function public.mensagem_ao_cliente(text) to anon, authenticated;

-- `montar_item` passa a traduzir a exceção do meio a meio antes de devolver.
-- (Corpo completo aplicado na mesma migration; ver a definição vigente no
-- banco — a única mudança em relação à 0032 é a linha abaixo.)
--
--   exception when others then
--     return jsonb_build_object('ok', false, 'nome', v_produto.name,
--       'erro', public.mensagem_ao_cliente(sqlerrm));
--
-- Também foram acentuadas as mensagens que já eram escritas para o cliente
-- ("Este tamanho não está mais disponível.", "Escolha no máximo N
-- adicionais.").
