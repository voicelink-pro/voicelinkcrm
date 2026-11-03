-- item kolidowal ze zmienną PL/pgSQL. Ta funkcja jest tą z poprzedniej migracji, ze zmienioną nazwą.

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
  has_segments boolean := false;
  segment_count integer;
  link_count integer;
  source_count integer;
  note_count integer;
  payload_item jsonb;
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
      from jsonb_array_elements(p_transcript) as transcript_element(segment_row)
      where pg_catalog.char_length(pg_catalog.btrim(coalesce(transcript_element.segment_row->>'text', ''))) > 0;

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
        for payload_item in select value from jsonb_array_elements(p_transcript) loop
          if pg_catalog.char_length(pg_catalog.btrim(coalesce(payload_item->>'text', ''))) = 0 then
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
            private.blank_to_null(payload_item->>'speaker_name'),
            private.normalize_email(payload_item->>'speaker_email'),
            case
              when coalesce(payload_item->>'offset_ms', '') ~ '^[0-9]+$'
                then (payload_item->>'offset_ms')::integer
              else null
            end,
            left(pg_catalog.btrim(payload_item->>'text'), 20000),
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

      for payload_item in select value from jsonb_array_elements(p_participants) loop
        normalized_email := private.normalize_email(payload_item->>'email');
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
          private.blank_to_null(payload_item->>'name'),
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
      ) into has_segments;

      if p_has_summary or p_has_transcript then
        update public.meeting_records
        set sync_status = case
              when summary_markdown is not null and has_segments then 'synced'
              when summary_markdown is not null or has_segments then 'partial'
              else 'waiting_for_content'
            end,
            content_error = null,
            content_attempts = case
              when summary_markdown is not null and has_segments then 0
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

