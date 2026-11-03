-- Odbiór etapu 9. Transakcja kończy się rollbackiem, seed zostaje.

begin;

do $$
<<stage9>>
declare
  anna uuid := '20000000-0000-4000-8000-000000000001';
  bartek uuid := '20000000-0000-4000-8000-000000000002';
  outsider uuid := '99999999-0000-4000-8000-000000000099';
  connection uuid := '50000000-0000-4000-8000-000000000001';
  kawiarnia uuid := '30000000-0000-4000-8000-000000000001';
  gabinet uuid := '40000000-0000-4000-8000-000000000001';
  gabinet_deal uuid := '40000000-0000-4000-8000-000000000003';
  result jsonb;
  meeting_id uuid;
  second_id uuid;
  note_body text;
  summary text;
  recording_url text;
  link_count integer;
  source_count integer;
  meeting_count integer;
  deal_id uuid;
  mode text;
  notifications_before integer;
  notifications_after integer;
  event_count integer;
  job_count integer;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  select count(*) into notifications_before from public.notifications;

  result := private.upsert_fathom_meeting(
    connection,
    'rec-ewa',
    'Rozmowa z Ewą',
    '2026-10-02 10:00:00+02',
    '2026-10-02 10:20:00+02',
    1200,
    'anna.fathom@przyklad.test',
    'https://fathom.video/calls/rec-ewa',
    'https://zoom.us/j/1',
    '## Ustalenia',
    true,
    '[{"speaker_name":"Ewa","speaker_email":"ewa.przykladowa@przyklad.test","offset_ms":5000,"text":"Dzień dobry"}]'::jsonb,
    true,
    '[{"name":"Ewa Przykładowa","email":"Ewa.Przykladowa@przyklad.test"}]'::jsonb,
    true,
    '[{"description":"Wysłać podsumowanie"}]'::jsonb,
    true,
    null
  );

  if result->>'sync_status' is distinct from 'synced'
    or result->>'matching_state' is distinct from 'linked'
    or (result->>'link_count')::integer is distinct from 1
    or (result->>'segment_count')::integer is distinct from 1 then
    raise exception 'ewa_import_mismatch: %', result;
  end if;

  meeting_id := (result->>'meeting_id')::uuid;

  select link.deal_id into deal_id
  from public.meeting_links as link
  where link.meeting_record_id = meeting_id;

  if deal_id is not null then
    raise exception 'deal_was_guessed';
  end if;

  if not exists (
    select 1
    from public.meeting_participants as participant
    where participant.meeting_record_id = meeting_id
      and participant.contact_id = '30000000-0000-4000-8000-000000000002'
  ) then
    raise exception 'contact_not_matched_by_email';
  end if;

  perform private.add_meeting_note(anna, meeting_id, 'Własna notatka CRM');

  result := private.upsert_fathom_meeting(
    connection,
    'rec-ewa',
    'Rozmowa z Ewą',
    '2026-10-02 10:00:00+02',
    null,
    null,
    null,
    'https://zoom.us/j/2',
    null,
    '## Nowe ustalenia',
    true,
    '[]'::jsonb,
    true,
    '[{"name":"Ewa Przykładowa","email":"ewa.przykladowa@przyklad.test"}]'::jsonb,
    true,
    '[]'::jsonb,
    false,
    null
  );

  select note.body into note_body
  from public.notes as note
  where note.meeting_record_id = meeting_id;

  select record.summary_markdown, record.recording_url
    into summary, recording_url
  from public.meeting_records as record
  where record.id = meeting_id;

  if note_body is distinct from 'Własna notatka CRM'
    or summary is distinct from '## Nowe ustalenia'
    or recording_url is distinct from 'https://fathom.video/calls/rec-ewa'
    or (result->>'segment_count')::integer is distinct from 1
    or (result->>'note_count')::integer is distinct from 1 then
    raise exception 'resync_overwrote_user_data: % / %', result, recording_url;
  end if;

  perform private.upsert_fathom_meeting(
    connection,
    'rec-ewa',
    'Rozmowa z Ewą',
    '2026-10-02 10:00:00+02',
    null,
    null,
    null,
    null,
    null,
    null,
    false,
    '[]'::jsonb,
    false,
    '[]'::jsonb,
    false,
    '[]'::jsonb,
    false,
    'transcript_failed'
  );

  select record.summary_markdown, record.sync_status
    into summary, mode
  from public.meeting_records as record
  where record.id = meeting_id;

  if summary is distinct from '## Nowe ustalenia' or mode is distinct from 'error' then
    raise exception 'error_removed_summary';
  end if;

  select count(*) into link_count
  from public.meeting_transcript_segments
  where meeting_record_id = meeting_id;

  if link_count is distinct from 1 then
    raise exception 'error_removed_transcript';
  end if;

  perform private.detach_meeting_link(
    anna,
    meeting_id,
    (select id from public.meeting_links where meeting_record_id = meeting_id limit 1)
  );

  result := private.upsert_fathom_meeting(
    connection,
    'rec-ewa',
    'Rozmowa z Ewą',
    '2026-10-02 10:00:00+02',
    null,
    null,
    null,
    null,
    null,
    null,
    false,
    '[]'::jsonb,
    false,
    '[{"name":"Ewa","email":"ewa.przykladowa@przyklad.test"}]'::jsonb,
    true,
    '[]'::jsonb,
    false,
    null
  );

  if (result->>'link_count')::integer is distinct from 0 then
    raise exception 'manual_unlink_was_restored: %', result;
  end if;

  insert into public.deals (
    workspace_id, account_id, title, source, stage, created_by
  )
  values (
    '10000000-0000-4000-8000-000000000001',
    kawiarnia,
    'Drugi temat kawiarni',
    'manual',
    'new',
    anna
  );

  result := private.upsert_fathom_meeting(
    connection,
    'rec-dwa-deale',
    'Dwa tematy',
    '2026-10-03 10:00:00+02',
    null,
    null,
    null,
    'https://fathom.video/calls/dwa',
    null,
    null,
    false,
    '[]'::jsonb,
    false,
    '[{"name":"Ewa","email":"ewa.przykladowa@przyklad.test"}]'::jsonb,
    true,
    '[]'::jsonb,
    false,
    null
  );

  if result->>'matching_state' is distinct from 'needs_assignment'
    or (result->>'link_count')::integer is distinct from 1 then
    raise exception 'two_deals_mismatch: %', result;
  end if;

  select link.deal_id into deal_id
  from public.meeting_links as link
  where link.meeting_record_id = (result->>'meeting_id')::uuid;

  if deal_id is not null then
    raise exception 'two_deals_guessed_a_deal';
  end if;

  result := private.upsert_fathom_meeting(
    connection,
    'rec-dwie-firmy',
    'Dwie firmy',
    '2026-10-04 10:00:00+02',
    null,
    null,
    null,
    null,
    null,
    null,
    false,
    '[]'::jsonb,
    false,
    '[
      {"name":"Ewa","email":"ewa.przykladowa@przyklad.test"},
      {"name":"Jan","email":"jan.przykladowy@przyklad.test"}
    ]'::jsonb,
    true,
    '[]'::jsonb,
    false,
    null
  );

  if result->>'matching_state' is distinct from 'needs_assignment'
    or (result->>'link_count')::integer is distinct from 0 then
    raise exception 'two_accounts_mismatch: %', result;
  end if;

  result := private.upsert_fathom_meeting(
    connection,
    'rec-jan',
    'Sam gabinet',
    '2026-10-05 10:00:00+02',
    null,
    null,
    null,
    null,
    null,
    null,
    false,
    '[]'::jsonb,
    false,
    '[{"name":"Ktoś inny","email":"jan.przykladowy@przyklad.test"}]'::jsonb,
    true,
    '[]'::jsonb,
    false,
    null
  );

  if result->>'matching_state' is distinct from 'linked'
    or (result->>'link_count')::integer is distinct from 1 then
    raise exception 'single_account_mismatch: %', result;
  end if;

  select link.deal_id into deal_id
  from public.meeting_links as link
  where link.meeting_record_id = (result->>'meeting_id')::uuid;

  if deal_id is not null then
    raise exception 'won_deal_was_attached';
  end if;

  second_id := private.ensure_fathom_connection(anna, 'fathom/account-2', 'Drugie konto');

  result := private.upsert_fathom_meeting(
    second_id,
    'rec-ewa',
    'Rozmowa z Ewą',
    '2026-10-02 10:00:00+02',
    null,
    null,
    null,
    null,
    null,
    null,
    false,
    '[]'::jsonb,
    false,
    '[]'::jsonb,
    false,
    '[]'::jsonb,
    false,
    null
  );

  select count(*) into meeting_count
  from public.meeting_records
  where recording_id = 'rec-ewa';

  select count(*) into source_count
  from public.meeting_sources
  where meeting_record_id = meeting_id;

  if meeting_count is distinct from 1 or source_count is distinct from 2 then
    raise exception 'second_account_duplicated: meetings % sources %', meeting_count, source_count;
  end if;

  result := private.accept_fathom_delivery(
    connection, 'msg-1', 'hash-1', 'rec-ewa', '{"recording_id":"rec-ewa"}'::jsonb
  );

  if result->>'state' is distinct from 'accepted' then
    raise exception 'webhook_not_accepted: %', result;
  end if;

  if private.accept_fathom_delivery(
    connection, 'msg-1', 'hash-1', 'rec-ewa', '{"recording_id":"rec-ewa"}'::jsonb
  )->>'state' is distinct from 'accepted' then
    raise exception 'pending_webhook_not_resumable';
  end if;

  perform private.finish_fathom_delivery('msg-1', (result->>'job_id')::uuid, true, null);

  if private.accept_fathom_delivery(
    connection, 'msg-1', 'hash-2', 'rec-ewa', '{}'::jsonb
  )->>'state' is distinct from 'duplicate' then
    raise exception 'processed_webhook_not_duplicate';
  end if;

  select count(*) into event_count
  from private.inbound_events
  where provider = 'fathom' and event_id = 'msg-1';

  select count(*) into job_count
  from private.job_queue
  where dedupe_key = 'fathom:webhook:msg-1';

  if event_count is distinct from 1 or job_count is distinct from 1 then
    raise exception 'webhook_duplicated_rows';
  end if;

  begin
    perform private.attach_meeting_link(outsider, meeting_id, gabinet, gabinet_deal);
    raise exception 'outsider_was_accepted';
  exception
    when others then
      if sqlerrm not like '%not_a_member%' then
        raise;
      end if;
  end;

  perform private.attach_meeting_link(anna, meeting_id, gabinet, gabinet_deal);

  result := private.upsert_fathom_meeting(
    connection,
    'rec-ewa',
    'Rozmowa z Ewą',
    '2026-10-02 10:00:00+02',
    null,
    null,
    null,
    null,
    null,
    '## Po ręcznym powiązaniu',
    true,
    '[]'::jsonb,
    false,
    '[{"name":"Ewa","email":"ewa.przykladowa@przyklad.test"}]'::jsonb,
    true,
    '[]'::jsonb,
    false,
    null
  );

  if not exists (
    select 1 from public.meeting_links as link
    where link.meeting_record_id = meeting_id
      and link.account_id = gabinet
      and link.deal_id = gabinet_deal
      and link.origin = 'manual'
  ) then
    raise exception 'manual_link_lost';
  end if;

  select count(*) into notifications_after from public.notifications;
  if notifications_before is distinct from notifications_after then
    raise exception 'notifications_changed';
  end if;

  perform set_config(
    'request.jwt.claims',
    '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}',
    true
  );
  perform set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';

  select count(*) into meeting_count
  from public.meeting_records
  where id = meeting_id;

  if meeting_count is distinct from 1 then
    raise exception 'member_cannot_read_meeting';
  end if;

  execute 'set local role anon';

  begin
    perform count(*) from public.meeting_records;
    raise exception 'anon_was_allowed';
  exception
    when insufficient_privilege then
      null;
    when others then
      if sqlerrm not like '%permission denied%' then
        raise;
      end if;
  end;
end;
$$;

rollback;
