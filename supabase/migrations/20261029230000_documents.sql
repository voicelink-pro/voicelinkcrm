-- Prywatny bucket dokumentów. Globalny limit Storage w config.toml to 50MiB.
-- Limit produktu to 25 MB i jest zapisany też w automation_settings, żeby ekran mógł go pokazać.
-- anon i authenticated nie dostają polityki na storage.objects: brak polityki przy włączonym RLS
-- oznacza brak odczytu i zapisu. Dostęp idzie przez krótki signed URL wystawiony po kontroli członkostwa.

alter table public.automation_settings
  add column document_max_bytes bigint not null default 26214400
    check (document_max_bytes between 1 and 52428800),
  add column document_mime_types text[] not null default array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'image/png',
    'image/jpeg'
  ]::text[];

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  26214400,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'image/png',
    'image/jpeg'
  ]::text[]
);

create unique index document_links_account_unique
  on public.document_links (document_id, account_id)
  where account_id is not null;

create unique index document_links_deal_unique
  on public.document_links (document_id, deal_id)
  where deal_id is not null;

create unique index document_links_deployment_unique
  on public.document_links (document_id, deployment_id)
  where deployment_id is not null;

create or replace function private.document_mime_allowed(
  p_mime text,
  p_allowed text[]
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_mime = any(p_allowed)
    and p_mime not in (
      'text/html',
      'application/xhtml+xml',
      'image/svg+xml',
      'application/javascript',
      'text/javascript',
      'application/x-msdownload',
      'application/x-executable',
      'application/x-dosexec',
      'application/x-sh'
    )
    and p_mime not like '%svg%'
    and p_mime not like 'text/html%';
$$;

create or replace function private.begin_document_upload(
  p_actor_user_id uuid,
  p_original_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_category text,
  p_account_id uuid,
  p_deal_id uuid,
  p_deployment_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
<<doc_begin>>
declare
  actor uuid := p_actor_user_id;
  workspace uuid;
  doc_name text;
  doc_mime text;
  doc_category text;
  max_bytes bigint;
  allowed text[];
  document_id uuid;
  storage_path text;
  target_count integer;
begin
  perform private.assert_server_role();
  doc_name := private.blank_to_null(p_original_name);
  doc_mime := pg_catalog.lower(pg_catalog.btrim(coalesce(p_mime_type, '')));
  doc_category := pg_catalog.btrim(coalesce(p_category, ''));
  target_count :=
    (p_account_id is not null)::integer
    + (p_deal_id is not null)::integer
    + (p_deployment_id is not null)::integer;

  select member.workspace_id
    into workspace
  from public.workspace_members as member
  where member.user_id = doc_begin.actor
    and member.active
  order by member.workspace_id
  limit 1;

  perform private.require_active_member(workspace, doc_begin.actor);

  select settings.document_max_bytes, settings.document_mime_types
    into max_bytes, allowed
  from public.automation_settings as settings
  where settings.workspace_id = workspace;

  if doc_name is null
    or pg_catalog.char_length(doc_name) > 240
    or doc_category not in ('offer', 'contract', 'other')
    or target_count > 1
    or p_size_bytes is null
    or p_size_bytes <= 0
    or max_bytes is null
    or allowed is null then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  if p_size_bytes > max_bytes then
    raise exception 'document_too_large' using errcode = 'P0001';
  end if;

  if not private.document_mime_allowed(doc_mime, allowed) then
    raise exception 'document_type_rejected' using errcode = 'P0001';
  end if;

  if p_account_id is not null and not exists (
    select 1
    from public.accounts as account
    where account.id = p_account_id
      and account.workspace_id = workspace
      and account.archived_at is null
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if p_deal_id is not null and not exists (
    select 1
    from public.deals as deal
    where deal.id = p_deal_id
      and deal.workspace_id = workspace
      and deal.archived_at is null
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if p_deployment_id is not null and not exists (
    select 1
    from public.deployments as deployment
    where deployment.id = p_deployment_id
      and deployment.workspace_id = workspace
      and deployment.archived_at is null
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  document_id := pg_catalog.gen_random_uuid();
  storage_path := workspace::text || '/' || document_id::text || '/' || pg_catalog.gen_random_uuid()::text;

  insert into public.documents (
    id,
    workspace_id,
    storage_path,
    original_name,
    mime_type,
    category,
    status,
    size_bytes,
    uploaded_by,
    created_by,
    updated_by
  )
  values (
    document_id,
    workspace,
    storage_path,
    doc_name,
    doc_mime,
    doc_category,
    'uploading',
    p_size_bytes,
    doc_begin.actor,
    doc_begin.actor,
    doc_begin.actor
  );

  if target_count = 1 then
    insert into public.document_links (
      workspace_id,
      document_id,
      account_id,
      deal_id,
      deployment_id,
      created_by,
      updated_by
    )
    values (
      workspace,
      document_id,
      p_account_id,
      p_deal_id,
      p_deployment_id,
      doc_begin.actor,
      doc_begin.actor
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'id', document_id,
    'storage_path', storage_path
  );
end;
$$;

create or replace function private.complete_document_upload(
  p_actor_user_id uuid,
  p_document_id uuid,
  p_size_bytes bigint,
  p_mime_type text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
<<doc_complete>>
declare
  existing public.documents%rowtype;
  doc_mime text;
begin
  perform private.assert_server_role();
  doc_mime := pg_catalog.lower(pg_catalog.btrim(coalesce(p_mime_type, '')));

  select *
    into existing
  from public.documents
  where id = p_document_id
  for update;

  if not found or existing.deleted_at is not null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  perform private.require_active_member(existing.workspace_id, p_actor_user_id);

  if existing.status not in ('uploading', 'failed') then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  if p_size_bytes is distinct from existing.size_bytes
    or doc_mime is distinct from existing.mime_type then
    update public.documents
    set status = 'failed',
        updated_by = p_actor_user_id
    where id = existing.id;
    raise exception 'document_mismatch' using errcode = 'P0001';
  end if;

  update public.documents
  set status = 'ready',
      updated_by = p_actor_user_id
  where id = existing.id;

  return existing.id;
end;
$$;

create or replace function private.fail_document_upload(
  p_actor_user_id uuid,
  p_document_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing public.documents%rowtype;
begin
  perform private.assert_server_role();

  select *
    into existing
  from public.documents
  where id = p_document_id
  for update;

  if not found or existing.deleted_at is not null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  perform private.require_active_member(existing.workspace_id, p_actor_user_id);

  if existing.status = 'failed' then
    return existing.id;
  end if;

  if existing.status <> 'uploading' then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  update public.documents
  set status = 'failed',
      updated_by = p_actor_user_id
  where id = existing.id;

  return existing.id;
end;
$$;

create or replace function private.abandon_document_upload(
  p_actor_user_id uuid,
  p_document_id uuid
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing public.documents%rowtype;
begin
  perform private.assert_server_role();

  select *
    into existing
  from public.documents
  where id = p_document_id
  for update;

  if not found or existing.deleted_at is not null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  perform private.require_active_member(existing.workspace_id, p_actor_user_id);

  if existing.status not in ('uploading', 'failed') then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  update public.documents
  set deleted_at = pg_catalog.clock_timestamp(),
      updated_by = p_actor_user_id
  where id = existing.id;

  return existing.storage_path;
end;
$$;

create or replace function private.begin_document_delete(
  p_actor_user_id uuid,
  p_document_id uuid
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing public.documents%rowtype;
begin
  perform private.assert_server_role();

  select *
    into existing
  from public.documents
  where id = p_document_id
  for update;

  if not found or existing.deleted_at is not null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  perform private.require_active_member(existing.workspace_id, p_actor_user_id);

  if existing.status not in ('ready', 'deleting') then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  update public.documents
  set status = 'deleting',
      updated_by = p_actor_user_id
  where id = existing.id;

  return existing.storage_path;
end;
$$;

create or replace function private.finish_document_delete(
  p_actor_user_id uuid,
  p_document_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing public.documents%rowtype;
begin
  perform private.assert_server_role();

  select *
    into existing
  from public.documents
  where id = p_document_id
  for update;

  if not found or existing.deleted_at is not null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  perform private.require_active_member(existing.workspace_id, p_actor_user_id);

  if existing.status <> 'deleting' then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  update public.documents
  set deleted_at = pg_catalog.clock_timestamp(),
      updated_by = p_actor_user_id
  where id = existing.id;

  return existing.id;
end;
$$;

create or replace function private.attach_document_link(
  p_actor_user_id uuid,
  p_document_id uuid,
  p_account_id uuid,
  p_deal_id uuid,
  p_deployment_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
<<doc_attach>>
declare
  existing public.documents%rowtype;
  link_id uuid;
  target_count integer;
begin
  perform private.assert_server_role();
  target_count :=
    (p_account_id is not null)::integer
    + (p_deal_id is not null)::integer
    + (p_deployment_id is not null)::integer;

  if target_count <> 1 then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  select *
    into existing
  from public.documents
  where id = p_document_id
  for update;

  if not found or existing.deleted_at is not null or existing.status <> 'ready' then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  perform private.require_active_member(existing.workspace_id, p_actor_user_id);

  if p_account_id is not null and not exists (
    select 1 from public.accounts as account
    where account.id = p_account_id
      and account.workspace_id = existing.workspace_id
      and account.archived_at is null
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if p_deal_id is not null and not exists (
    select 1 from public.deals as deal
    where deal.id = p_deal_id
      and deal.workspace_id = existing.workspace_id
      and deal.archived_at is null
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if p_deployment_id is not null and not exists (
    select 1 from public.deployments as deployment
    where deployment.id = p_deployment_id
      and deployment.workspace_id = existing.workspace_id
      and deployment.archived_at is null
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select link.id
    into link_id
  from public.document_links as link
  where link.document_id = existing.id
    and link.account_id is not distinct from p_account_id
    and link.deal_id is not distinct from p_deal_id
    and link.deployment_id is not distinct from p_deployment_id;

  if link_id is not null then
    return link_id;
  end if;

  insert into public.document_links (
    workspace_id,
    document_id,
    account_id,
    deal_id,
    deployment_id,
    created_by,
    updated_by
  )
  values (
    existing.workspace_id,
    existing.id,
    p_account_id,
    p_deal_id,
    p_deployment_id,
    p_actor_user_id,
    p_actor_user_id
  )
  returning id into link_id;

  return link_id;
end;
$$;

create or replace function private.detach_document_link(
  p_actor_user_id uuid,
  p_document_id uuid,
  p_link_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing public.documents%rowtype;
  removed uuid;
begin
  perform private.assert_server_role();

  select *
    into existing
  from public.documents
  where id = p_document_id;

  if not found or existing.deleted_at is not null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  perform private.require_active_member(existing.workspace_id, p_actor_user_id);

  delete from public.document_links as link
  where link.id = p_link_id
    and link.document_id = existing.id
  returning link.id into removed;

  if removed is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  return removed;
end;
$$;

create or replace function private.list_stale_document_uploads(
  p_actor_user_id uuid,
  p_older_than interval
)
returns table (id uuid, storage_path text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  workspace uuid;
begin
  perform private.assert_server_role();

  if p_older_than is null or p_older_than <= interval '0' then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  select member.workspace_id
    into workspace
  from public.workspace_members as member
  where member.user_id = p_actor_user_id
    and member.active
  order by member.workspace_id
  limit 1;

  perform private.require_active_member(workspace, p_actor_user_id);

  return query
  select document.id, document.storage_path
  from public.documents as document
  where document.workspace_id = workspace
    and document.deleted_at is null
    and document.status in ('uploading', 'failed')
    and document.created_at < pg_catalog.now() - p_older_than
  order by document.created_at, document.id;
end;
$$;

revoke all on function private.document_mime_allowed(text, text[]) from public, anon, authenticated;
revoke all on function private.begin_document_upload(uuid, text, text, bigint, text, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.complete_document_upload(uuid, uuid, bigint, text) from public, anon, authenticated;
revoke all on function private.fail_document_upload(uuid, uuid) from public, anon, authenticated;
revoke all on function private.abandon_document_upload(uuid, uuid) from public, anon, authenticated;
revoke all on function private.begin_document_delete(uuid, uuid) from public, anon, authenticated;
revoke all on function private.finish_document_delete(uuid, uuid) from public, anon, authenticated;
revoke all on function private.attach_document_link(uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.detach_document_link(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.list_stale_document_uploads(uuid, interval) from public, anon, authenticated;

grant execute on function private.document_mime_allowed(text, text[]) to service_role;
grant execute on function private.begin_document_upload(uuid, text, text, bigint, text, uuid, uuid, uuid) to service_role;
grant execute on function private.complete_document_upload(uuid, uuid, bigint, text) to service_role;
grant execute on function private.fail_document_upload(uuid, uuid) to service_role;
grant execute on function private.abandon_document_upload(uuid, uuid) to service_role;
grant execute on function private.begin_document_delete(uuid, uuid) to service_role;
grant execute on function private.finish_document_delete(uuid, uuid) to service_role;
grant execute on function private.attach_document_link(uuid, uuid, uuid, uuid, uuid) to service_role;
grant execute on function private.detach_document_link(uuid, uuid, uuid) to service_role;
grant execute on function private.list_stale_document_uploads(uuid, interval) to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'documents'
  ) then
    alter publication supabase_realtime add table public.documents;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'document_links'
  ) then
    alter publication supabase_realtime add table public.document_links;
  end if;
end;
$$;
