-- Spotkania Fathom. Sekret zostaje w zmiennej serwera, secret_ref jest tylko nazwą.
-- recording_id jest unikalne w workspace dla providera fathom. Dokumentacja Fathom
-- z 30.10.2026 nie podaje osobnej przestrzeni identyfikatorów na konto. Ten sam
-- identyfikator z dwóch połączeń to jeden rekord i dwa źródła. Tytuł nie scala spotkań.
-- n8n zostaje przy jednym połączeniu na workspace. Drugie konto Fathom może dojść.

alter table private.integration_connections
  add column label text not null default '',
  add column enabled boolean not null default true,
  add column external_account_email text;

alter table private.integration_connections
  add constraint integration_connections_email_shape check (
    external_account_email is null
    or (
      char_length(external_account_email) <= 320
      and external_account_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    )
  );

drop index private.integration_connections_provider_idx;

create unique index integration_connections_n8n_idx
  on private.integration_connections (workspace_id, provider)
  where provider = 'n8n_leads';

create unique index integration_connections_secret_ref_idx
  on private.integration_connections (workspace_id, secret_ref);

alter table private.inbound_events
  drop constraint inbound_events_status_check;

alter table private.inbound_events
  add constraint inbound_events_status_check
  check (status in (
    'processed',
    'duplicate',
    'review',
    'ignored_test',
    'invalid',
    'accepted',
    'ignored'
  ));

alter table public.automation_settings
  add column fathom_poll_interval_minutes integer not null default 15
    check (fathom_poll_interval_minutes between 5 and 1440);

alter table public.meeting_records
  add column assignment_mode text not null default 'manual'
    check (assignment_mode in ('automatic', 'manual')),
  add column matching_state text not null default 'linked'
    check (matching_state in ('unmatched', 'linked', 'needs_assignment')),
  add column provider_action_items jsonb not null default '[]'::jsonb,
  add column content_attempts integer not null default 0
    check (content_attempts >= 0),
  add column content_error text;

alter table public.meeting_participants
  add column contact_id uuid;

alter table public.meeting_participants
  add constraint meeting_participants_contact_fk
  foreign key (workspace_id, contact_id)
  references public.contacts (workspace_id, id);

alter table public.meeting_links
  add column origin text not null default 'manual'
    check (origin in ('auto', 'manual'));

create unique index meeting_links_account_only_idx
  on public.meeting_links (meeting_record_id, account_id)
  where deal_id is null;

alter table public.notes
  add column meeting_record_id uuid;

alter table public.notes
  add constraint notes_meeting_fk
  foreign key (workspace_id, meeting_record_id)
  references public.meeting_records (workspace_id, id);

create index notes_meeting_idx
  on public.notes (meeting_record_id, created_at)
  where meeting_record_id is not null;

update private.integration_connections
set label = 'Konto Fathom'
where provider = 'fathom'
  and label = '';

create or replace function private.fathom_recording_url(p_url text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_url is null or pg_catalog.btrim(p_url) = '' then null
    when pg_catalog.lower(pg_catalog.btrim(p_url))
      ~ '^https://([a-z0-9-]+\.)*fathom\.video([/?#].*)?$'
      then pg_catalog.btrim(p_url)
    else null
  end
$$;

create or replace function private.note_integration_receipt(
  p_workspace_id uuid,
  p_provider text,
  p_secret_ref text,
  p_ok boolean,
  p_error text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.assert_server_role();

  insert into private.integration_connections (
    workspace_id, provider, secret_ref, status, last_success_at, last_error
  )
  values (
    p_workspace_id,
    p_provider,
    p_secret_ref,
    case when p_ok then 'active' else 'error' end,
    case when p_ok then pg_catalog.now() else null end,
    case when p_ok then null else left(coalesce(p_error, ''), 200) end
  )
  on conflict (workspace_id, provider) where provider = 'n8n_leads' do update
  set status = case when p_ok then 'active' else 'error' end,
      last_success_at = case
        when p_ok then pg_catalog.now()
        else private.integration_connections.last_success_at
      end,
      last_error = case
        when p_ok then null
        else left(coalesce(p_error, ''), 200)
      end,
      secret_ref = excluded.secret_ref,
      updated_at = pg_catalog.now();
end;
$$;

create or replace function private.upsert_fathom_meeting(
  p_connection_id uuid,
  p_recording_id text,
  p_title text,
  p_started_at timestamptz,
  p_ended_at timestamptz,
  p_duration_seconds integer,
  p_recorded_by_email text,
  p_recording_url text,
  p_share_url text,
  p_summary_markdown text,
  p_has_summary boolean,
  p_transcript jsonb,
  p_has_transcript boolean,
  p_participants jsonb,
  p_has_participants boolean,
  p_action_items jsonb,
  p_has_action_items boolean,
  p_content_error text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  connection private.integration_connections%rowtype;
  meeting public.meeting_records%rowtype;
  recording text;
  meeting_title text;
  summary_text text;
  accounts uuid[];
  account_id uuid;
  open_deals integer;
  ambiguous boolean := false;
  segment_count integer;
  link_count integer;
  source_count integer;
  note_count integer;
  item jsonb;
  ordinal integer;
  normalized_email text;
  matched_contact uuid;
  contact_matches integer;
begin
  perform private.assert_server_role();

  select * into connection
  from private.integration_connections
  where id = p_connection_id
  for update;

  if not found or connection.provider <> 'fathom' or not connection.enabled then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  recording := private.blank_to_null(p_recording_id);
  if recording is null or pg_catalog.char_length(recording) > 80 then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  meeting_title := left(coalesce(private.blank_to_null(p_title), 'Spotkanie'), 300);
  if p_started_at is null then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  select * into meeting
  from public.meeting_records
  where workspace_id = connection.workspace_id
    and provider = 'fathom'
    and recording_id = recording
  for update;

  if not found then
    insert into public.meeting_records (
      workspace_id,
      provider,
      recording_id,
      title,
      started_at,
      ended_at,
      duration_seconds,
      recorded_by_email,
      recording_url,
      share_url,
      sync_status,
      assignment_mode,
      matching_state,
      last_synced_at
    )
    values (
      connection.workspace_id,
      'fathom',
      recording,
      meeting_title,
      p_started_at,
      p_ended_at,
      p_duration_seconds,
      private.normalize_email(p_recorded_by_email),
      private.fathom_recording_url(p_recording_url),
      private.fathom_recording_url(p_share_url),
      'waiting_for_content',
      'automatic',
      'unmatched',
      pg_catalog.now()
    )
    returning * into meeting;
  else
    update public.meeting_records
    set title = meeting_title,
        started_at = p_started_at,
        ended_at = coalesce(p_ended_at, ended_at),
        duration_seconds = coalesce(p_duration_seconds, duration_seconds),
        recorded_by_email = coalesce(private.normalize_email(p_recorded_by_email), recorded_by_email),
        recording_url = coalesce(private.fathom_recording_url(p_recording_url), recording_url),
        share_url = coalesce(private.fathom_recording_url(p_share_url), share_url),
        last_synced_at = pg_catalog.now()
    where id = meeting.id
    returning * into meeting;
  end if;

  insert into public.meeting_sources (
    workspace_id, meeting_record_id, connection_id, provider_recording_id
  )
  values (connection.workspace_id, meeting.id, connection.id, recording)
  on conflict (connection_id, provider_recording_id) do nothing;

  if p_content_error is not null then
    update public.meeting_records
    set sync_status = 'error',
        content_error = left(p_content_error, 200),
        content_attempts = content_attempts + 1
    where id = meeting.id
    returning * into meeting;
  else
    if p_has_summary then
      summary_text := private.blank_to_null(p_summary_markdown);
      if summary_text is not null then
        if pg_catalog.char_length(summary_text) > 100000 then
          raise exception 'invalid_state' using errcode = 'P0001';
        end if;
        update public.meeting_records
        set summary_markdown = summary_text,
            content_updated_at = pg_catalog.now()
        where id = meeting.id;
      end if;
    end if;

    if p_has_transcript and jsonb_typeof(p_transcript) = 'array' then
      select count(*) into segment_count
      from jsonb_array_elements(p_transcript) as element(item)
      where pg_catalog.char_length(pg_catalog.btrim(coalesce(item->>'text', ''))) > 0;

      if segment_count > 5000 then
        update public.meeting_records
        set sync_status = 'error',
            content_error = 'transcript_too_large',
            content_attempts = content_attempts + 1
        where id = meeting.id
        returning * into meeting;
      elsif segment_count > 0 then
        delete from public.meeting_transcript_segments
        where meeting_record_id = meeting.id;

        ordinal := 0;
        for item in select value from jsonb_array_elements(p_transcript) loop
          if pg_catalog.char_length(pg_catalog.btrim(coalesce(item->>'text', ''))) = 0 then
            continue;
          end if;
          insert into public.meeting_transcript_segments (
            workspace_id,
            meeting_record_id,
            speaker_name,
            speaker_email,
            offset_ms,
            segment_text,
            ordinal
          )
          values (
            connection.workspace_id,
            meeting.id,
            private.blank_to_null(item->>'speaker_name'),
            private.normalize_email(item->>'speaker_email'),
            case
              when coalesce(item->>'offset_ms', '') ~ '^[0-9]+$'
                then (item->>'offset_ms')::integer
              else null
            end,
            left(pg_catalog.btrim(item->>'text'), 20000),
            ordinal
          );
          ordinal := ordinal + 1;
        end loop;

        update public.meeting_records
        set content_updated_at = pg_catalog.now()
        where id = meeting.id;
      end if;
    end if;

    if p_has_participants and jsonb_typeof(p_participants) = 'array' then
      delete from public.meeting_participants
      where meeting_record_id = meeting.id;

      for item in select value from jsonb_array_elements(p_participants) loop
        normalized_email := private.normalize_email(item->>'email');
        matched_contact := null;
        if normalized_email is not null and private.email_is_valid(normalized_email) then
          select count(*) into contact_matches
          from public.contacts as contact
          where contact.workspace_id = connection.workspace_id
            and contact.archived_at is null
            and contact.email_normalized = normalized_email;

          if contact_matches = 1 then
            select contact.id into matched_contact
            from public.contacts as contact
            where contact.workspace_id = connection.workspace_id
              and contact.archived_at is null
              and contact.email_normalized = normalized_email;
          end if;
        else
          normalized_email := null;
        end if;

        insert into public.meeting_participants (
          workspace_id, meeting_record_id, display_name, email, contact_id
        )
        values (
          connection.workspace_id,
          meeting.id,
          private.blank_to_null(item->>'name'),
          normalized_email,
          matched_contact
        );
      end loop;
    end if;

    if p_has_action_items and jsonb_typeof(p_action_items) = 'array' then
      update public.meeting_records
      set provider_action_items = p_action_items
      where id = meeting.id;
    end if;

    select * into meeting
    from public.meeting_records
    where id = meeting.id;

    if meeting.content_error is distinct from 'transcript_too_large' then
      select exists (
        select 1 from public.meeting_transcript_segments as segment
        where segment.meeting_record_id = meeting.id
      ) into ambiguous;

      if p_has_summary or p_has_transcript then
        update public.meeting_records
        set sync_status = case
              when summary_markdown is not null and ambiguous then 'synced'
              when summary_markdown is not null or ambiguous then 'partial'
              else 'waiting_for_content'
            end,
            content_error = null,
            content_attempts = case
              when summary_markdown is not null and ambiguous then 0
              else content_attempts + 1
            end
        where id = meeting.id;
      end if;
    end if;

    if p_has_participants and meeting.assignment_mode = 'automatic' then
      select coalesce(array_agg(distinct contact.account_id), '{}')
        into accounts
      from public.meeting_participants as participant
      join public.contacts as contact
        on contact.workspace_id = participant.workspace_id
       and contact.email_normalized = participant.email
       and contact.archived_at is null
      where participant.meeting_record_id = meeting.id
        and participant.email is not null;

      if coalesce(array_length(accounts, 1), 0) = 1 then
        account_id := accounts[1];
        select count(*) into open_deals
        from public.deals as deal
        where deal.workspace_id = connection.workspace_id
          and deal.account_id = account_id
          and deal.archived_at is null
          and deal.stage not in ('won', 'lost');

        if not exists (
          select 1 from public.meeting_links as link
          where link.meeting_record_id = meeting.id
            and link.account_id = account_id
        ) then
          insert into public.meeting_links (
            workspace_id, meeting_record_id, account_id, origin
          )
          values (connection.workspace_id, meeting.id, account_id, 'auto');
        end if;

        update public.meeting_records
        set matching_state = case
          when open_deals >= 2 then 'needs_assignment'
          else 'linked'
        end
        where id = meeting.id;
      elsif coalesce(array_length(accounts, 1), 0) > 1 then
        update public.meeting_records
        set matching_state = 'needs_assignment'
        where id = meeting.id;
      elsif not exists (
        select 1 from public.meeting_links as link
        where link.meeting_record_id = meeting.id
      ) then
        update public.meeting_records
        set matching_state = 'unmatched'
        where id = meeting.id;
      end if;
    end if;
  end if;

  select count(*) into link_count
  from public.meeting_links
  where meeting_record_id = meeting.id;

  select count(*) into source_count
  from public.meeting_sources
  where meeting_record_id = meeting.id;

  select count(*) into note_count
  from public.notes
  where meeting_record_id = meeting.id;

  select count(*) into segment_count
  from public.meeting_transcript_segments
  where meeting_record_id = meeting.id;

  select sync_status, matching_state, summary_markdown, content_attempts
    into meeting.sync_status, meeting.matching_state, meeting.summary_markdown, meeting.content_attempts
  from public.meeting_records
  where id = meeting.id;

  return jsonb_build_object(
    'meeting_id', meeting.id,
    'sync_status', meeting.sync_status,
    'matching_state', meeting.matching_state,
    'link_count', link_count,
    'source_count', source_count,
    'note_count', note_count,
    'segment_count', segment_count,
    'content_attempts', meeting.content_attempts
  );
end;
$$;

create or replace function private.accept_fathom_delivery(
  p_connection_id uuid,
  p_event_id text,
  p_payload_hash text,
  p_recording_id text,
  p_job_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  connection private.integration_connections%rowtype;
  existing private.inbound_events%rowtype;
  event_key text;
  job_id uuid;
begin
  perform private.assert_server_role();

  select * into connection
  from private.integration_connections
  where id = p_connection_id;

  if not found or connection.provider <> 'fathom' then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  event_key := private.blank_to_null(p_event_id);
  if event_key is null or connection.enabled = false then
    return jsonb_build_object('state', 'ignored');
  end if;

  select * into existing
  from private.inbound_events
  where provider = 'fathom'
    and event_id = event_key;

  if found then
    select id into job_id
    from private.job_queue
    where dedupe_key = 'fathom:webhook:' || event_key;

    return jsonb_build_object(
      'state', case when existing.status = 'processed' then 'duplicate' else existing.status end,
      'job_id', job_id
    );
  end if;

  insert into private.inbound_events (
    workspace_id, connection_id, provider, event_id, payload_hash, status
  )
  values (
    connection.workspace_id,
    connection.id,
    'fathom',
    event_key,
    p_payload_hash,
    'accepted'
  );

  insert into private.job_queue (
    workspace_id, job_type, payload, status, dedupe_key
  )
  values (
    connection.workspace_id,
    'fathom.upsert',
    p_job_payload,
    'pending',
    'fathom:webhook:' || event_key
  )
  returning id into job_id;

  return jsonb_build_object('state', 'accepted', 'job_id', job_id);
exception
  when unique_violation then
    select * into existing
    from private.inbound_events
    where provider = 'fathom'
      and event_id = event_key;

    select id into job_id
    from private.job_queue
    where dedupe_key = 'fathom:webhook:' || event_key;

    return jsonb_build_object(
      'state', case when existing.status = 'processed' then 'duplicate' else existing.status end,
      'job_id', job_id
    );
end;
$$;

create or replace function private.finish_fathom_delivery(
  p_event_id text,
  p_job_id uuid,
  p_ok boolean,
  p_error text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.assert_server_role();

  update private.inbound_events
  set status = case when p_ok then 'processed' else 'accepted' end,
      result = jsonb_build_object('ok', p_ok)
  where provider = 'fathom'
    and event_id = p_event_id;

  update private.job_queue
  set status = case when p_ok then 'succeeded' else 'failed' end,
      attempts = attempts + 1,
      last_error = case when p_ok then null else left(coalesce(p_error, ''), 200) end,
      updated_at = pg_catalog.now()
  where id = p_job_id;
end;
$$;

create or replace function private.save_fathom_cursor(
  p_actor_user_id uuid,
  p_connection_id uuid,
  p_cursor jsonb,
  p_ok boolean,
  p_error text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  connection private.integration_connections%rowtype;
begin
  perform private.assert_server_role();

  select * into connection
  from private.integration_connections
  where id = p_connection_id
    and provider = 'fathom';

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  perform private.require_active_member(connection.workspace_id, p_actor_user_id);

  update private.integration_connections
  set cursor = coalesce(p_cursor, '{}'::jsonb),
      status = case when p_ok then 'active' else 'error' end,
      last_success_at = case when p_ok then pg_catalog.now() else last_success_at end,
      last_error = case when p_ok then null else left(coalesce(p_error, ''), 200) end
  where id = connection.id;
end;
$$;

create or replace function private.set_fathom_account_email(
  p_actor_user_id uuid,
  p_connection_id uuid,
  p_email text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  connection private.integration_connections%rowtype;
  normalized text;
begin
  perform private.assert_server_role();

  select * into connection
  from private.integration_connections
  where id = p_connection_id
    and provider = 'fathom';

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  perform private.require_active_member(connection.workspace_id, p_actor_user_id);
  normalized := private.normalize_email(p_email);

  if normalized is not null and not private.email_is_valid(normalized) then
    raise exception 'invalid_contact' using errcode = 'P0001';
  end if;

  update private.integration_connections
  set external_account_email = normalized
  where id = connection.id;
end;
$$;

create or replace function private.set_fathom_poll_minutes(
  p_actor_user_id uuid,
  p_minutes integer
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  workspace uuid;
begin
  perform private.assert_server_role();

  select member.workspace_id into workspace
  from public.workspace_members as member
  where member.user_id = p_actor_user_id
    and member.active
  limit 1;

  if workspace is null then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  perform private.require_active_member(workspace, p_actor_user_id);

  if p_minutes is null or p_minutes < 5 or p_minutes > 1440 then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  update public.automation_settings
  set fathom_poll_interval_minutes = p_minutes
  where workspace_id = workspace;
end;
$$;

create or replace function private.ensure_fathom_connection(
  p_actor_user_id uuid,
  p_secret_ref text,
  p_label text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  workspace uuid;
  connection_id uuid;
  label text;
begin
  perform private.assert_server_role();

  select member.workspace_id into workspace
  from public.workspace_members as member
  where member.user_id = p_actor_user_id
    and member.active
  limit 1;

  if workspace is null then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  perform private.require_active_member(workspace, p_actor_user_id);

  if p_secret_ref not in ('fathom/account-1', 'fathom/account-2') then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  label := left(coalesce(private.blank_to_null(p_label), 'Konto Fathom'), 80);

  insert into private.integration_connections (
    workspace_id, provider, secret_ref, label, status, enabled
  )
  values (workspace, 'fathom', p_secret_ref, label, 'active', true)
  on conflict (workspace_id, secret_ref) do update
  set label = excluded.label
  returning id into connection_id;

  return connection_id;
end;
$$;

create or replace function private.add_meeting_note(
  p_actor_user_id uuid,
  p_meeting_id uuid,
  p_body text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  meeting public.meeting_records%rowtype;
  body text;
  note_id uuid;
begin
  perform private.assert_server_role();

  select * into meeting
  from public.meeting_records
  where id = p_meeting_id;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  perform private.require_active_member(meeting.workspace_id, p_actor_user_id);
  body := private.blank_to_null(p_body);

  if body is null or pg_catalog.char_length(body) > 20000 then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  insert into public.notes (workspace_id, meeting_record_id, body, created_by)
  values (meeting.workspace_id, meeting.id, body, p_actor_user_id)
  returning id into note_id;

  return note_id;
end;
$$;

create or replace function private.attach_meeting_link(
  p_actor_user_id uuid,
  p_meeting_id uuid,
  p_account_id uuid,
  p_deal_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  meeting public.meeting_records%rowtype;
  account public.accounts%rowtype;
  link_id uuid;
begin
  perform private.assert_server_role();

  select * into meeting from public.meeting_records where id = p_meeting_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  perform private.require_active_member(meeting.workspace_id, p_actor_user_id);

  select * into account
  from public.accounts
  where id = p_account_id
    and workspace_id = meeting.workspace_id
    and archived_at is null;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if p_deal_id is not null and not exists (
    select 1 from public.deals as deal
    where deal.id = p_deal_id
      and deal.workspace_id = meeting.workspace_id
      and deal.account_id = account.id
      and deal.archived_at is null
  ) then
    raise exception 'cross_reference' using errcode = '23514';
  end if;

  if p_deal_id is null then
    select id into link_id
    from public.meeting_links
    where meeting_record_id = meeting.id
      and account_id = account.id
      and deal_id is null;
  else
    update public.meeting_links
    set deal_id = p_deal_id,
        origin = 'manual'
    where meeting_record_id = meeting.id
      and account_id = account.id
      and deal_id is null
    returning id into link_id;

    if link_id is null then
      select id into link_id
      from public.meeting_links
      where meeting_record_id = meeting.id
        and account_id = account.id
        and deal_id = p_deal_id;
    end if;
  end if;

  if link_id is null then
    insert into public.meeting_links (
      workspace_id, meeting_record_id, account_id, deal_id, origin, created_by
    )
    values (
      meeting.workspace_id, meeting.id, account.id, p_deal_id, 'manual', p_actor_user_id
    )
    returning id into link_id;
  end if;

  update public.meeting_records
  set assignment_mode = 'manual',
      matching_state = 'linked'
  where id = meeting.id;

  return link_id;
end;
$$;

create or replace function private.detach_meeting_link(
  p_actor_user_id uuid,
  p_meeting_id uuid,
  p_link_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  meeting public.meeting_records%rowtype;
  removed uuid;
begin
  perform private.assert_server_role();

  select * into meeting from public.meeting_records where id = p_meeting_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  perform private.require_active_member(meeting.workspace_id, p_actor_user_id);

  delete from public.meeting_links
  where id = p_link_id
    and meeting_record_id = meeting.id
  returning id into removed;

  if removed is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  update public.meeting_records
  set assignment_mode = 'manual',
      matching_state = case
        when exists (
          select 1 from public.meeting_links as link
          where link.meeting_record_id = meeting.id
        ) then 'linked'
        else 'needs_assignment'
      end
  where id = meeting.id;
end;
$$;

create or replace function private.reset_fathom_content_attempts(
  p_actor_user_id uuid,
  p_meeting_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  meeting public.meeting_records%rowtype;
begin
  perform private.assert_server_role();

  select * into meeting from public.meeting_records where id = p_meeting_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  perform private.require_active_member(meeting.workspace_id, p_actor_user_id);

  update public.meeting_records
  set content_attempts = 0,
      content_error = null
  where id = meeting.id;
end;
$$;

revoke all on function private.fathom_recording_url(text) from public, anon, authenticated;
revoke all on function private.note_integration_receipt(uuid, text, text, boolean, text) from public, anon, authenticated;
revoke all on function private.upsert_fathom_meeting(uuid, text, text, timestamptz, timestamptz, integer, text, text, text, text, boolean, jsonb, boolean, jsonb, boolean, jsonb, boolean, text) from public, anon, authenticated;
revoke all on function private.accept_fathom_delivery(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function private.finish_fathom_delivery(text, uuid, boolean, text) from public, anon, authenticated;
revoke all on function private.save_fathom_cursor(uuid, uuid, jsonb, boolean, text) from public, anon, authenticated;
revoke all on function private.set_fathom_account_email(uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.set_fathom_poll_minutes(uuid, integer) from public, anon, authenticated;
revoke all on function private.ensure_fathom_connection(uuid, text, text) from public, anon, authenticated;
revoke all on function private.add_meeting_note(uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.attach_meeting_link(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.detach_meeting_link(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.reset_fathom_content_attempts(uuid, uuid) from public, anon, authenticated;

grant execute on function private.fathom_recording_url(text) to service_role;
grant execute on function private.note_integration_receipt(uuid, text, text, boolean, text) to service_role;
grant execute on function private.upsert_fathom_meeting(uuid, text, text, timestamptz, timestamptz, integer, text, text, text, text, boolean, jsonb, boolean, jsonb, boolean, jsonb, boolean, text) to service_role;
grant execute on function private.accept_fathom_delivery(uuid, text, text, text, jsonb) to service_role;
grant execute on function private.finish_fathom_delivery(text, uuid, boolean, text) to service_role;
grant execute on function private.save_fathom_cursor(uuid, uuid, jsonb, boolean, text) to service_role;
grant execute on function private.set_fathom_account_email(uuid, uuid, text) to service_role;
grant execute on function private.set_fathom_poll_minutes(uuid, integer) to service_role;
grant execute on function private.ensure_fathom_connection(uuid, text, text) to service_role;
grant execute on function private.add_meeting_note(uuid, uuid, text) to service_role;
grant execute on function private.attach_meeting_link(uuid, uuid, uuid, uuid) to service_role;
grant execute on function private.detach_meeting_link(uuid, uuid, uuid) to service_role;
grant execute on function private.reset_fathom_content_attempts(uuid, uuid) to service_role;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'meeting_records'
  ) then
    alter publication supabase_realtime add table public.meeting_records;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'meeting_links'
  ) then
    alter publication supabase_realtime add table public.meeting_links;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'meeting_transcript_segments'
  ) then
    alter publication supabase_realtime add table public.meeting_transcript_segments;
  end if;
end;
$$;
