-- 0025 — Seed estrutural da Fase 3
-- 01-DOCUMENTO-MESTRE.md §79.6 e §79.12 · 02-MODELO-DADOS-SUPABASE.md §5.1
--
-- CRITÉRIO: só entra aqui o que a DOCUMENTAÇÃO nomeia explicitamente.
--
-- Por isso NÃO são semeados:
--   · store_settings — endereço, coordenadas, horários e estimativas reais da
--     Shalon são a pendência A-07. A tela de Configurações trata o estado
--     "ainda não configurada" e a Owner preenche, sem alterar código (§7.5).
--   · pizza_sizes — "Tradicional" e "Brotinho" são nomes iniciais, mas número
--     de fatias e máximo de sabores não constam de documento algum. Inventar
--     valor comercial é exatamente o que CLAUDE.md §54 proíbe.
--   · alert_thresholds — as chaves são conhecidas, os minutos não.
--   · payment_brands — quais bandeiras a Shalon aceita é A-07.

-- 79.6 nomeia as categorias iniciais. São DADOS: podem ser renomeadas,
-- reordenadas, inativadas ou excluídas pela Owner.
insert into public.categories (name, slug, sort_order) values
  ('Pizzas Salgadas', 'pizzas-salgadas', 1),
  ('Pizzas Doces', 'pizzas-doces', 2),
  ('Fogazza', 'fogazza', 3),
  ('Combos', 'combos', 4),
  ('Bebidas', 'bebidas', 5);

-- 79.12 nomeia as formas iniciais. Pix na maquininha e Pix antecipado por
-- chave são formas DISTINTAS, não uma só (RN-PGTO-007 e RN-PGTO-008).
insert into public.payment_methods
  (code, name, payment_family, is_active, requires_brand, sort_order) values
  ('dinheiro',       'Dinheiro',           'cash',        true,  false, 1),
  ('pix_maquininha', 'Pix na maquininha',  'pix_machine', true,  false, 2),
  -- RN-PGTO-008: a opção só aparece para o cliente quando a chave estiver
  -- cadastrada e habilitada. Nasce INATIVA de propósito.
  ('pix_chave',      'Pix antecipado',     'pix_key',     false, false, 3),
  ('debito',         'Cartão de débito',   'debit',       true,  true,  4),
  ('credito',        'Cartão de crédito',  'credit',      true,  true,  5),
  ('voucher',        'Voucher',            'voucher',     true,  true,  6);
