-- 0183 — Mínimo de sabores por tamanho e meio a meio como opção própria
-- D-2026-11-06-184 · RN-PIZZA-004 · CLAUDE.md §17
--
-- Clientes escolhiam a Tradicional achando que já era meio a meio, porque o
-- mesmo cartão oferecia "inteira ou meio a meio". Decisão do Marcelo: a escolha
-- de tamanho fica Tradicional (1 sabor), Meio a meio (2 sabores obrigatórios),
-- Broto (2º sabor opcional, em destaque) e Especial (3 sabores obrigatórios).
--
-- "Meio a meio" NÃO é tamanho novo: é a Tradicional com dois sabores, com os
-- mesmos preços. Por isso o cadastro ganha só duas informações:
--   · `min_flavors`: quantos sabores o tamanho EXIGE. O servidor recusa menos;
--   · `half_as_own_option`: o tamanho aparece em duas opções, a inteira e a
--     "Meio a meio". É apresentação: o servidor aceita os dois jeitos.

-- 1. Cadastro ---------------------------------------------------------------------
alter table public.pizza_sizes
  add column min_flavors integer not null default 1,
  add column half_as_own_option boolean not null default false;

alter table public.pizza_sizes
  add constraint pizza_sizes_minimo check (min_flavors >= 1 and min_flavors <= max_flavors),
  add constraint pizza_sizes_meio_a_meio_proprio check (
    not half_as_own_option or (max_flavors = 2 and min_flavors = 1)
  );

comment on column public.pizza_sizes.min_flavors is
  'Quantos sabores o tamanho exige. A Especial pede 3 (D-2026-11-06-184).';
comment on column public.pizza_sizes.half_as_own_option is
  'Mostra o tamanho como duas opções: inteira (1 sabor) e "Meio a meio" (2 sabores obrigatórios).';

-- Configuração da Shalon. Pelo nome: é o que a dona vê e mantém no cadastro.
update public.pizza_sizes set min_flavors = 3 where name = 'Especial' and max_flavors = 3;
update public.pizza_sizes set half_as_own_option = true where name = 'Tradicional' and max_flavors = 2;
update public.pizza_sizes set sort_order = 1 where name = 'Tradicional' and sold_as = 'pizza';
update public.pizza_sizes set sort_order = 2 where name = 'Broto' and sold_as = 'pizza';
update public.pizza_sizes set sort_order = 3 where name = 'Especial' and sold_as = 'pizza';

-- 2. Servidor recusa menos sabores que o mínimo ------------------------------------
-- `preco_meio_a_meio` é por onde todo item de pizza passa (`montar_item`), no
-- carrinho, na revalidação, na criação e na edição do pedido.
do $$
declare
  v_def text := pg_get_functiondef('public.preco_meio_a_meio(uuid[],timestamptz)'::regprocedure);
  v_novo text;
begin
  v_novo := replace(v_def,
    E'  v_max_flavors integer;\n',
    E'  v_max_flavors integer;\n  v_min_flavors integer;\n');
  v_novo := replace(v_novo,
    E'  select s.max_flavors into v_max_flavors\n',
    E'  select s.max_flavors, s.min_flavors into v_max_flavors, v_min_flavors\n');
  v_novo := replace(v_novo,
    E'  select count(*) into v_indisponivel\n',
    E'  -- D-2026-11-06-184: a Especial exige os 3 sabores.\n'
    || E'  if v_pedidos < coalesce(v_min_flavors, 1) then\n'
    || E'    raise exception ''Este tamanho pede no minimo % sabores (RN-PIZZA-004)'', v_min_flavors\n'
    || E'      using errcode = ''22023'';\n'
    || E'  end if;\n\n'
    || E'  select count(*) into v_indisponivel\n');

  if v_novo not like '%v_min_flavors integer;%'
     or v_novo not like '%into v_max_flavors, v_min_flavors%'
     or v_novo not like '%no minimo % sabores%' then
    raise exception 'preco_meio_a_meio mudou: o patch do mínimo de sabores não encontrou os trechos';
  end if;
  execute v_novo;
end;
$$;

-- 3. Mensagem ao cliente ------------------------------------------------------------
do $$
declare
  v_def text := pg_get_functiondef('public.mensagem_ao_cliente(text)'::regprocedure);
  v_novo text;
begin
  v_novo := replace(v_def,
    E'    when p_erro like ''%maximo%sabor%''\n',
    E'    when p_erro like ''%minimo%sabor%''\n'
    || E'      then ''Escolha os '' || coalesce(substring(p_erro from ''minimo (\\d+)''), '''') || '' sabores deste tamanho.''\n'
    || E'    when p_erro like ''%maximo%sabor%''\n');
  if v_novo = v_def then
    raise exception 'mensagem_ao_cliente mudou: o patch do mínimo de sabores não encontrou o trecho';
  end if;
  execute v_novo;
end;
$$;
