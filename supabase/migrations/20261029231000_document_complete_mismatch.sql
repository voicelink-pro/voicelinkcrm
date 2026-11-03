-- Wyjątek cofa zmiany tej funkcji, więc UPDATE statusu przed RAISE nie zostawał w bazie.
-- Niezgodny rozmiar albo typ nie ustawia ready. Aplikacja osobno woła fail_document_upload.

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
    raise exception 'document_mismatch' using errcode = 'P0001';
  end if;

  update public.documents
  set status = 'ready',
      updated_by = p_actor_user_id
  where id = existing.id;

  return existing.id;
end;
$$;

revoke all on function private.complete_document_upload(uuid, uuid, bigint, text) from public, anon, authenticated;
grant execute on function private.complete_document_upload(uuid, uuid, bigint, text) to service_role;
