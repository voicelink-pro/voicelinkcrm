-- Klucze API dla agentów i integracji (działające w imieniu przypisanego członka zespołu)
-- oraz funkcje RPC do pełnego zarządzania notatkami i archiwizacji zadań przez API.

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  key_prefix text not null,
  key_hash text not null unique,
  expires_at timestamptz,
  last_used_at timestamptz,
  request_count bigint not null default 0,
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create index if not exists api_keys_workspace_idx
  on public.api_keys (workspace_id, revoked_at, created_at desc);

create index if not exists api_keys_owner_idx
  on public.api_keys (owner_user_id, revoked_at);

alter table public.api_keys enable row level security;

revoke all on public.api_keys from anon, public, authenticated;
grant select, insert, update, delete on public.api_keys to service_role;

-- Edycja treści notatki
create or replace function private.update_note(
  p_actor_user_id uuid,
  p_note_id uuid,
  p_body text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing public.notes%rowtype;
  next_body text;
begin
  perform private.assert_server_role();
  select * into existing from public.notes where id = p_note_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_active_member(existing.workspace_id, p_actor_user_id);

  next_body := private.blank_to_null(p_body);
  if next_body is null or pg_catalog.char_length(next_body) > 20000 then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  update public.notes
  set body = next_body,
      updated_by = p_actor_user_id
  where id = existing.id;

  return existing.id;
end;
$$;

revoke all on function private.update_note(uuid, uuid, text) from public, anon, authenticated;
grant execute on function private.update_note(uuid, uuid, text) to service_role;

-- Usunięcie notatki
create or replace function private.delete_note(
  p_actor_user_id uuid,
  p_note_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing public.notes%rowtype;
begin
  perform private.assert_server_role();
  select * into existing from public.notes where id = p_note_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_active_member(existing.workspace_id, p_actor_user_id);

  delete from public.notes where id = existing.id;
end;
$$;

revoke all on function private.delete_note(uuid, uuid) from public, anon, authenticated;
grant execute on function private.delete_note(uuid, uuid) to service_role;

-- Rozszerzenie private.set_archived o encję 'task'
create or replace function private.set_archived(
  p_actor_user_id uuid,
  p_entity text,
  p_id uuid,
  p_expected_version integer,
  p_archived boolean
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  updated_count integer;
  workspace_id uuid;
begin
  perform private.assert_server_role();
  if p_entity = 'account' then
    select account.workspace_id into workspace_id from public.accounts as account where account.id = p_id;
  elsif p_entity = 'deal' then
    select deal.workspace_id into workspace_id from public.deals as deal where deal.id = p_id;
  elsif p_entity = 'contact' then
    select contact.workspace_id into workspace_id from public.contacts as contact where contact.id = p_id;
  elsif p_entity = 'task' then
    select task.workspace_id into workspace_id from public.tasks as task where task.id = p_id;
  else
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  if workspace_id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_active_member(workspace_id, p_actor_user_id);

  if p_entity = 'account' then
    update public.accounts
    set archived_at = case when p_archived then pg_catalog.now() else null end,
        updated_by = p_actor_user_id
    where id = p_id and version = p_expected_version;
  elsif p_entity = 'deal' then
    update public.deals
    set archived_at = case when p_archived then pg_catalog.now() else null end,
        updated_by = p_actor_user_id
    where id = p_id and version = p_expected_version;
  elsif p_entity = 'contact' then
    update public.contacts
    set archived_at = case when p_archived then pg_catalog.now() else null end,
        updated_by = p_actor_user_id
    where id = p_id and version = p_expected_version;
  else
    update public.tasks
    set archived_at = case when p_archived then pg_catalog.now() else null end,
        updated_by = p_actor_user_id
    where id = p_id and version = p_expected_version;
  end if;

  get diagnostics updated_count = row_count;
  if updated_count = 0 then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function private.set_archived(uuid, text, uuid, integer, boolean) from public, anon, authenticated;
grant execute on function private.set_archived(uuid, text, uuid, integer, boolean) to service_role;

notify pgrst, 'reload schema';
