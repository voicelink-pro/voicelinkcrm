-- Pola kartoteki wdrożeniowej i integracyjnej na karcie klienta (accounts).

alter table public.accounts
  add column if not exists implementation_notes text,
  add column if not exists integration_systems text,
  add column if not exists integration_docs_status text not null default 'missing'
    check (integration_docs_status in ('missing', 'partial', 'complete')),
  add column if not exists integration_notes text;

create or replace function private.save_account_dossier(
  p_actor_user_id uuid,
  p_account_id uuid,
  p_section text,
  p_implementation_notes text default null,
  p_integration_systems text default null,
  p_integration_docs_status text default null,
  p_integration_notes text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  account public.accounts%rowtype;
  docs_status text;
begin
  perform private.assert_server_role();
  select * into account from public.accounts where id = p_account_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_active_member(account.workspace_id, p_actor_user_id);

  if p_section = 'implementation' then
    if p_implementation_notes is not null and pg_catalog.char_length(p_implementation_notes) > 20000 then
      raise exception 'invalid_state' using errcode = 'P0001';
    end if;

    update public.accounts
    set implementation_notes = private.blank_to_null(p_implementation_notes),
        updated_by = p_actor_user_id
    where id = account.id;
  elsif p_section = 'integration' then
    docs_status := coalesce(private.blank_to_null(p_integration_docs_status), 'missing');
    if docs_status not in ('missing', 'partial', 'complete') then
      raise exception 'invalid_state' using errcode = 'P0001';
    end if;
    if (p_integration_systems is not null and pg_catalog.char_length(p_integration_systems) > 2000)
      or (p_integration_notes is not null and pg_catalog.char_length(p_integration_notes) > 20000) then
      raise exception 'invalid_state' using errcode = 'P0001';
    end if;

    update public.accounts
    set integration_systems = private.blank_to_null(p_integration_systems),
        integration_docs_status = docs_status,
        integration_notes = private.blank_to_null(p_integration_notes),
        updated_by = p_actor_user_id
    where id = account.id;
  else
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function private.save_account_dossier(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function private.save_account_dossier(uuid, uuid, text, text, text, text, text) to service_role;
