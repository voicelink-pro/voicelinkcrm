-- Odbiór etapu 8. Transakcja kończy się rollbackiem, seed zostaje.

begin;

do $$
<<stage8>>
declare
  anna uuid := '20000000-0000-4000-8000-000000000001';
  bartek uuid := '20000000-0000-4000-8000-000000000002';
  outsider uuid := '99999999-0000-4000-8000-000000000099';
  kawiarnia_deal uuid := '30000000-0000-4000-8000-000000000003';
  result jsonb;
  general_id uuid;
  linked_id uuid;
  storage_path text;
  link_count integer;
  seen integer;
  status text;
  deleted timestamptz;
  stale_count integer;
  link_id uuid;
  bucket_public boolean;
  bucket_limit bigint;
  notifications_before integer;
  notifications_after integer;
  object_id uuid;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);

  select buckets.public, buckets.file_size_limit
    into bucket_public, bucket_limit
  from storage.buckets as buckets
  where buckets.id = 'documents';

  if bucket_public is distinct from false or bucket_limit is distinct from 26214400 then
    raise exception 'bucket_mismatch';
  end if;

  select count(*) into notifications_before from public.notifications;

  begin
    perform private.begin_document_upload(outsider, 'notatka.txt', 'text/plain', 12, 'other', null, null, null);
    raise exception 'outsider_was_accepted';
  exception
    when others then
      if sqlerrm not like '%not_a_member%' then
        raise;
      end if;
  end;

  begin
    perform private.begin_document_upload(anna, 'strona.html', 'text/html', 20, 'other', null, null, null);
    raise exception 'html_was_accepted';
  exception
    when others then
      if sqlerrm not like '%document_type_rejected%' then
        raise;
      end if;
  end;

  begin
    perform private.begin_document_upload(
      anna, 'program.exe', 'application/x-msdownload', 20, 'other', null, null, null
    );
    raise exception 'executable_was_accepted';
  exception
    when others then
      if sqlerrm not like '%document_type_rejected%' then
        raise;
      end if;
  end;

  begin
    perform private.begin_document_upload(anna, 'duzy.pdf', 'application/pdf', 26214401, 'offer', null, null, null);
    raise exception 'oversize_was_accepted';
  exception
    when others then
      if sqlerrm not like '%document_too_large%' then
        raise;
      end if;
  end;

  begin
    perform private.begin_document_upload(
      anna, 'oba.pdf', 'application/pdf', 10, 'offer',
      '30000000-0000-4000-8000-000000000001', kawiarnia_deal, null
    );
    raise exception 'two_targets_accepted';
  exception
    when others then
      if sqlerrm not like '%invalid_state%' then
        raise;
      end if;
  end;

  begin
    perform private.begin_document_upload(
      anna, 'obcy.pdf', 'application/pdf', 10, 'offer',
      null, 'aaaaaaaa-0000-4000-8000-000000000099', null
    );
    raise exception 'missing_deal_accepted';
  exception
    when others then
      if sqlerrm not like '%not_found%' then
        raise;
      end if;
  end;

  result := private.begin_document_upload(anna, 'ogolny.txt', 'text/plain', 4, 'other', null, null, null);
  general_id := (result ->> 'id')::uuid;
  storage_path := result ->> 'storage_path';

  if storage_path like '%ogolny%'
    or storage_path !~ '^10000000-0000-4000-8000-000000000001/[0-9a-f-]{36}/[0-9a-f-]{36}$' then
    raise exception 'path_not_random';
  end if;

  select count(*) into link_count from public.document_links where document_id = stage8.general_id;
  if link_count <> 0 then
    raise exception 'general_has_link';
  end if;

  result := private.begin_document_upload(
    anna, 'oferta.pdf', 'application/pdf', 128, 'offer', null, kawiarnia_deal, null
  );
  linked_id := (result ->> 'id')::uuid;

  select count(*) into link_count
  from public.document_links as link
  where link.document_id = stage8.linked_id
    and link.deal_id = kawiarnia_deal;
  if link_count <> 1 then
    raise exception 'deal_link_missing';
  end if;

  begin
    perform private.complete_document_upload(anna, linked_id, 64, 'application/pdf');
    raise exception 'mismatch_was_accepted';
  exception
    when others then
      if sqlerrm not like '%document_mismatch%' then
        raise;
      end if;
  end;

  select documents.status into status from public.documents as documents where documents.id = stage8.linked_id;
  if status <> 'uploading' then
    raise exception 'mismatch_changed_status';
  end if;

  perform private.fail_document_upload(anna, linked_id);
  select documents.status into status from public.documents as documents where documents.id = stage8.linked_id;
  if status <> 'failed' then
    raise exception 'fail_not_saved';
  end if;

  perform private.complete_document_upload(anna, linked_id, 128, 'application/pdf');
  select documents.status into status from public.documents as documents where documents.id = stage8.linked_id;
  if status <> 'ready' then
    raise exception 'complete_not_ready';
  end if;

  begin
    perform private.finish_document_delete(anna, linked_id);
    raise exception 'finish_without_delete';
  exception
    when others then
      if sqlerrm not like '%invalid_state%' then
        raise;
      end if;
  end;

  perform private.begin_document_delete(anna, linked_id);
  select documents.status, documents.deleted_at
    into status, deleted
  from public.documents as documents
  where documents.id = stage8.linked_id;
  if status <> 'deleting' or deleted is not null then
    raise exception 'delete_false_success';
  end if;

  perform private.finish_document_delete(anna, linked_id);
  select documents.deleted_at into deleted
  from public.documents as documents
  where documents.id = stage8.linked_id;
  if deleted is null then
    raise exception 'delete_not_finished';
  end if;

  perform private.complete_document_upload(anna, general_id, 4, 'text/plain');

  begin
    perform private.fail_document_upload(anna, general_id);
    raise exception 'ready_was_failed';
  exception
    when others then
      if sqlerrm not like '%invalid_state%' then
        raise;
      end if;
  end;

  link_id := private.attach_document_link(anna, general_id, null, kawiarnia_deal, null);
  if private.attach_document_link(anna, general_id, null, kawiarnia_deal, null) is distinct from link_id then
    raise exception 'attach_duplicated';
  end if;

  select count(*) into link_count from public.documents as documents where documents.id = stage8.general_id;
  if link_count <> 1 then
    raise exception 'object_copied';
  end if;

  select count(*) into stale_count
  from private.list_stale_document_uploads(anna, interval '24 hours') as stale
  where stale.id = stage8.general_id;
  if stale_count <> 0 then
    raise exception 'ready_listed_as_stale';
  end if;

  update public.documents
  set created_at = pg_catalog.now() - interval '2 days',
      status = 'uploading'
  where id = stage8.general_id;

  select count(*) into stale_count
  from private.list_stale_document_uploads(anna, interval '24 hours') as stale
  where stale.id = stage8.general_id;
  if stale_count <> 1 then
    raise exception 'stale_missing';
  end if;

  select count(*) into notifications_after from public.notifications;
  if notifications_after <> notifications_before then
    raise exception 'notifications_changed';
  end if;

  insert into storage.objects (bucket_id, name)
  values ('documents', storage_path)
  returning id into object_id;

  perform set_config(
    'request.jwt.claims',
    '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}',
    true
  );
  execute 'set local role authenticated';
  select count(*) into seen from public.documents where id = stage8.general_id;
  if seen <> 1 then
    raise exception 'bartek_cannot_see_document';
  end if;
  select count(*) into seen from storage.objects where id = stage8.object_id;
  if seen <> 0 then
    raise exception 'member_can_read_storage';
  end if;
  execute 'reset role';

  perform set_config(
    'request.jwt.claims',
    '{"sub":"99999999-0000-4000-8000-000000000099","role":"authenticated"}',
    true
  );
  execute 'set local role authenticated';
  select count(*) into seen from public.documents where id = stage8.general_id;
  if seen <> 0 then
    raise exception 'outsider_sees_document';
  end if;
  execute 'reset role';

  begin
    execute 'set local role anon';
    perform 1 from public.documents;
    raise exception 'anon_should_fail';
  exception
    when insufficient_privilege then
      null;
  end;
  execute 'reset role';
end;
$$;

rollback;
