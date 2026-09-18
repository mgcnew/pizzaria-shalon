-- 0021 — Projeção pública da loja
-- 03-RLS-RBAC-SEGURANCA.md §7.1 e §33.1 · RN-LOJA-001, 002, 003, 004, 005
--
-- §33.1: "público: SELECT somente via projeção pública segura". O cliente
-- NUNCA lê store_settings direto — ali estão coordenadas, quem fechou a loja,
-- parâmetros internos e o provedor de geocodificação.
--
-- SECURITY DEFINER com colunas escolhidas à mão, em vez de view: a lista de
-- campos expostos fica explícita e auditável, sem depender de como o Postgres
-- resolve RLS em view.

-- RN-LOJA-001/002/003: aberto/fechado é DERIVADO do horário semanal e do
-- fechamento temporário. Não existe coluna "está aberta".
create or replace function public.loja_aberta(p_em timestamptz default now())
returns boolean language plpgsql stable security definer set search_path = ''
as $$
declare
  v_tz text;
  v_fechada boolean;
  v_local timestamp;
  v_dia smallint;
  v_hora time;
  v_aberta boolean;
begin
  select s.timezone, s.is_temporarily_closed into v_tz, v_fechada
    from public.store_settings s limit 1;

  if v_tz is null then
    return false;  -- loja não configurada: fechada, nunca "aberta por omissão"
  end if;

  -- RN-LOJA-002: a pausa manual vence qualquer horário cadastrado.
  if v_fechada then
    return false;
  end if;

  v_local := p_em at time zone v_tz;
  v_dia := extract(dow from v_local)::smallint;
  v_hora := v_local::time;

  select exists (
    select 1 from public.store_hours h
    where not h.is_closed
      and (
        -- Janela normal do próprio dia.
        (h.weekday = v_dia and h.closes_at > h.opens_at
         and v_hora >= h.opens_at and v_hora < h.closes_at)
        -- 02 §3.2: janela que atravessa a meia-noite. Trecho antes de 00h…
        or (h.weekday = v_dia and h.closes_at <= h.opens_at and v_hora >= h.opens_at)
        -- …e o trecho depois de 00h, que pertence ao dia ANTERIOR.
        or (h.weekday = (v_dia + 6) % 7 and h.closes_at <= h.opens_at and v_hora < h.closes_at)
      )
  ) into v_aberta;

  return v_aberta;
end;
$$;

comment on function public.loja_aberta is 'RN-LOJA-001/002: derivado do horário semanal e do fechamento temporário. Suporta janela que vira a meia-noite.';

-- §7.1: somente o necessário. NÃO expõe latitude/longitude, geocode_provider,
-- quem fechou a loja, quem alterou estimativa, raio de aprovação automática
-- nem os ids internos de usuário.
create or replace function public.loja_publica()
returns table (
  nome text,
  nome_exibicao text,
  whatsapp text,
  telefone text,
  endereco_logradouro text,
  endereco_numero text,
  endereco_complemento text,
  endereco_bairro text,
  endereco_cidade text,
  endereco_uf text,
  endereco_cep text,
  aberta boolean,
  fechada_temporariamente boolean,
  motivo_fechamento text,
  entrega_eta_min integer,
  entrega_eta_max integer,
  retirada_eta_min integer,
  retirada_eta_max integer,
  pedido_minimo_ativo boolean,
  pedido_minimo_valor numeric,
  adicionais_habilitados boolean,
  fuso text
) language sql stable security definer set search_path = ''
as $$
  select
    s.store_name,
    s.display_name,
    s.whatsapp,
    s.phone,
    s.address_street,
    s.address_number,
    s.address_complement,
    s.address_neighborhood,
    s.address_city,
    s.address_state,
    s.address_postal_code,
    public.loja_aberta(),
    s.is_temporarily_closed,
    -- O motivo é comunicação ao cliente; só faz sentido quando está fechada.
    case when s.is_temporarily_closed then s.temporary_close_reason end,
    -- RN-LOJA-004: o override temporário é o que vale quando existe.
    coalesce(s.current_delivery_eta_min_minutes, s.delivery_eta_min_minutes),
    coalesce(s.current_delivery_eta_max_minutes, s.delivery_eta_max_minutes),
    coalesce(s.current_pickup_eta_min_minutes, s.pickup_eta_min_minutes),
    coalesce(s.current_pickup_eta_max_minutes, s.pickup_eta_max_minutes),
    s.delivery_minimum_enabled,
    case when s.delivery_minimum_enabled then s.delivery_minimum_subtotal end,
    s.addons_enabled,
    s.timezone
  from public.store_settings s
  limit 1;
$$;

comment on function public.loja_publica is 'DTO público da loja (03 §7.1). Não expõe coordenadas, autores de alteração nem parâmetros internos.';

create or replace function public.horarios_publicos()
returns table (dia_semana smallint, fechado boolean, abre time, fecha time)
language sql stable security definer set search_path = ''
as $$
  select h.weekday, h.is_closed, h.opens_at, h.closes_at
  from public.store_hours h
  order by h.sort_order, h.weekday;
$$;

revoke all on function public.loja_aberta(timestamptz) from public;
revoke all on function public.loja_publica() from public;
revoke all on function public.horarios_publicos() from public;

grant execute on function public.loja_aberta(timestamptz) to anon, authenticated;
grant execute on function public.loja_publica() to anon, authenticated;
grant execute on function public.horarios_publicos() to anon, authenticated;
