-- 0029 — Produto sem preço não está disponível
-- RN-DISP-001 · 02-MODELO-DADOS-SUPABASE.md §5.2 · 05-PLANO §7.5
--
-- ACHADO NA VERIFICAÇÃO DA TELA: um produto recém-criado, ainda sem preço
-- nenhum, aparecia como "Disponível". Ele está ativo e a categoria está
-- ativa, mas não existe preço para cobrar — o cardápio não teria o que
-- mostrar e o checkout não teria o que somar.
--
-- A autoridade de preço depende do produto (02 §5.2):
--   · com variação  → a variação manda; ao menos uma precisa estar disponível;
--   · sem variação  → o base_price manda; ele precisa existir.
--
-- Isto não é regra nova: é a mesma regra de disponibilidade, aplicada ao
-- caso que faltava.
create or replace function public.produto_disponivel(p_product_id uuid)
returns boolean language sql stable set search_path = ''
as $$
  select
    p.is_active and p.is_temporarily_available
    and c.is_active and c.is_temporarily_available
    and (p.product_type <> 'combo' or public.combo_disponivel(p.id))
    and (
      case
        when exists (select 1 from public.product_variants pv where pv.product_id = p.id)
          then exists (
            select 1 from public.product_variants pv
            where pv.product_id = p.id and pv.is_active and pv.is_temporarily_available
          )
        else p.base_price is not null
      end
    )
  from public.products p
  join public.categories c on c.id = p.category_id
  where p.id = p_product_id;
$$;

comment on function public.produto_disponivel is 'Disponibilidade efetiva: produto + categoria + (combo) componentes + preço vigente (variação disponível ou base_price).';
