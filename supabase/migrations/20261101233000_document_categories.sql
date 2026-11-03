-- Dodanie kategorii 'integration' (Integracja) dla dokumentów.

alter table public.documents
  drop constraint if exists documents_category_check;

alter table public.documents
  add constraint documents_category_check
  check (category in ('offer', 'integration', 'contract', 'other'));

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
    or doc_category not in ('offer', 'integration', 'contract', 'other')
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

revoke all on function private.begin_document_upload(uuid, text, text, bigint, text, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function private.begin_document_upload(uuid, text, text, bigint, text, uuid, uuid, uuid) to service_role;
