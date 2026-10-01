-- 0142 — o mesmo navegador reconhece o cliente
-- 04 RN-CLI-004 · 01 §1782 · 03 §11 e §12.1 · D-2026-10-01-107
--
-- A credencial do navegador (`public_devices`, criada na primeira compra e
-- ligada ao cliente por `criar_pedido`) passa a servir para o que o Documento
-- Mestre prevê: "Cliente reconhecido no mesmo navegador pode receber
-- saudação curta e ter dados/endereço pré-preenchidos."
--
-- QUEM ABRE: só quem TEM a credencial — um segredo de 64 hex que vive no
-- armazenamento local daquele navegador; o banco guarda só o hash. Não existe
-- caminho por WhatsApp, nome ou número de pedido (03 §12.1).
--
-- O QUE VOLTA, e só isso: nome, WhatsApp e endereços salvos ativos (sem
-- repetir o mesmo endereço, o preferencial primeiro). Nada de histórico,
-- consentimento, bloqueio ou dado interno.
--
-- QUANDO NÃO VOLTA NADA: credencial malformada, desconhecida, revogada, sem
-- cliente, ou de cliente bloqueado. A resposta é a mesma nos cinco casos —
-- não dá para sondar qual deles é.
--
-- "NÃO SOU EU": `esquecer_dispositivo` revoga a credencial. O navegador
-- descarta a dele e, na próxima compra, nasce outra.

create or replace function public.cliente_do_dispositivo(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_cliente record;
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('encontrado', false);
  end if;

  select c.id, c.name, coalesce(nullif(c.whatsapp_display, ''), c.whatsapp_normalized) as whatsapp
    into v_cliente
    from public.public_devices d
    join public.customers c on c.id = d.customer_id
   where d.token_hash = public.hash_token(p_token)
     and d.revoked_at is null
     and not c.is_blocked;

  if v_cliente.id is null then
    return jsonb_build_object('encontrado', false);
  end if;

  return jsonb_build_object(
    'encontrado', true,
    'nome', v_cliente.name,
    'whatsapp', v_cliente.whatsapp,
    'enderecos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'rotulo', e.label,
               'logradouro', e.street, 'numero', e.number,
               'complemento', e.complement, 'bairro', e.neighborhood,
               'cidade', e.city, 'uf', e.state, 'cep', e.postal_code,
               'referencia', e.reference_point, 'preferido', e.is_preferred)
             order by e.is_preferred desc, e.created_at desc)
        from (
          select distinct on (coalesce(a.address_key, a.id::text)) a.*
            from public.customer_addresses a
           where a.customer_id = v_cliente.id and a.is_active
           order by coalesce(a.address_key, a.id::text), a.is_preferred desc, a.created_at desc
        ) e), '[]'::jsonb));
end;
$$;

comment on function public.cliente_do_dispositivo(text) is
  'Reconhecimento no mesmo navegador: com a credencial local, devolve nome, WhatsApp e endereços salvos do dono. Sem credencial válida, nada (RN-CLI-004, 03 §12.1).';
revoke all on function public.cliente_do_dispositivo(text) from public;
grant execute on function public.cliente_do_dispositivo(text) to anon, authenticated;

create or replace function public.esquecer_dispositivo(p_token text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if coalesce(p_token, '') !~ '^[0-9a-f]{64}$' then
    return;
  end if;
  update public.public_devices
     set revoked_at = now()
   where token_hash = public.hash_token(p_token)
     and revoked_at is null;
end;
$$;

comment on function public.esquecer_dispositivo(text) is
  '"Não sou eu": revoga a credencial do navegador. Quem não a tem não consegue revogar a de ninguém.';
revoke all on function public.esquecer_dispositivo(text) from public;
grant execute on function public.esquecer_dispositivo(text) to anon, authenticated;
