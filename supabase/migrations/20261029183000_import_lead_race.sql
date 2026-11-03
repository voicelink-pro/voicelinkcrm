-- Równoległe żądanie z tym samym zdarzeniem zwraca wynik wygranego zapisu.

create or replace function private.import_lead(
  p_workspace_id uuid,
  p_event_id text,
  p_source text,
  p_source_record_id text,
  p_payload_hash text,
  p_full_name text,
  p_email text,
  p_phone text,
  p_is_test boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing private.inbound_events%rowtype;
  source_ref private.external_lead_refs%rowtype;
  result jsonb;
  full_name text;
  email_raw text;
  phone_raw text;
  email_norm text;
  phone_norm text;
  invalid boolean;
  match_ids uuid[];
  account_id uuid;
  contact_id uuid;
  deal_id uuid;
  activity_id uuid;
  review_id uuid;
  event_row_id uuid;
begin
  perform private.assert_server_role();

  if p_workspace_id is null
    or p_event_id is null or pg_catalog.char_length(pg_catalog.btrim(p_event_id)) not between 1 and 200
    or p_source is null or pg_catalog.char_length(pg_catalog.btrim(p_source)) not between 1 and 80
    or p_source_record_id is null
    or pg_catalog.char_length(pg_catalog.btrim(p_source_record_id)) not between 1 and 200
    or p_payload_hash is null
    or pg_catalog.char_length(pg_catalog.btrim(p_payload_hash)) not between 1 and 128 then
    raise exception 'import_invalid' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.workspaces where id = p_workspace_id
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select *
    into existing
  from private.inbound_events as inbound
  where inbound.provider = pg_catalog.btrim(p_source)
    and inbound.event_id = pg_catalog.btrim(p_event_id)
  for update;

  if found then
    if existing.payload_hash is distinct from pg_catalog.btrim(p_payload_hash) then
      raise exception 'idempotency_conflict' using errcode = 'P0001';
    end if;
    return existing.result || jsonb_build_object('replayed', true);
  end if;

  if coalesce(p_is_test, false) then
    result := jsonb_build_object('status', 'ignored_test');
    insert into private.inbound_events (
      workspace_id, provider, event_id, payload_hash, status, result
    )
    values (
      p_workspace_id,
      pg_catalog.btrim(p_source),
      pg_catalog.btrim(p_event_id),
      pg_catalog.btrim(p_payload_hash),
      'ignored_test',
      result
    );
    return result;
  end if;

  full_name := pg_catalog.btrim(coalesce(p_full_name, ''));
  email_raw := nullif(pg_catalog.btrim(coalesce(p_email, '')), '');
  phone_raw := nullif(pg_catalog.btrim(coalesce(p_phone, '')), '');
  email_norm := private.normalize_email(email_raw);
  phone_norm := private.normalize_phone(phone_raw);
  invalid := pg_catalog.char_length(full_name) not between 1 and 200
    or (email_raw is null and phone_raw is null)
    or (email_raw is not null and not private.email_is_valid(email_norm))
    or (phone_raw is not null and phone_norm is null);

  select *
    into source_ref
  from private.external_lead_refs as ref
  where ref.workspace_id = p_workspace_id
    and ref.source = pg_catalog.btrim(p_source)
    and ref.source_record_id = pg_catalog.btrim(p_source_record_id)
  for update;

  if found then
    result := source_ref.result || jsonb_build_object('status', 'duplicate');
    insert into private.inbound_events (
      workspace_id, provider, event_id, payload_hash, status, result
    )
    values (
      p_workspace_id,
      pg_catalog.btrim(p_source),
      pg_catalog.btrim(p_event_id),
      pg_catalog.btrim(p_payload_hash),
      'duplicate',
      result
    );
    return result;
  end if;

  if invalid then
    result := jsonb_build_object('status', 'invalid', 'reason', 'invalid_contact');
    insert into private.inbound_events (
      workspace_id, provider, event_id, payload_hash, status, result
    )
    values (
      p_workspace_id,
      pg_catalog.btrim(p_source),
      pg_catalog.btrim(p_event_id),
      pg_catalog.btrim(p_payload_hash),
      'invalid',
      result
    )
    returning id into event_row_id;

    insert into private.import_review_items (
      workspace_id, inbound_event_id, reason, payload
    )
    values (
      p_workspace_id,
      event_row_id,
      'invalid_contact',
      jsonb_build_object(
        'full_name', nullif(full_name, ''),
        'email', email_raw,
        'phone', phone_raw,
        'source', pg_catalog.btrim(p_source),
        'source_record_id', pg_catalog.btrim(p_source_record_id)
      )
    );
    return result;
  end if;

  select coalesce(array_agg(distinct contact.id), '{}'::uuid[])
    into match_ids
  from public.contacts as contact
  where contact.workspace_id = p_workspace_id
    and contact.archived_at is null
    and (
      (email_norm is not null and contact.email_normalized = email_norm)
      or (phone_norm is not null and contact.phone_e164 = phone_norm)
    );

  if coalesce(array_length(match_ids, 1), 0) > 0 then
    result := jsonb_build_object(
      'status', 'review',
      'reason', 'matching_contact',
      'match_ids', to_jsonb(match_ids)
    );
    insert into private.inbound_events (
      workspace_id, provider, event_id, payload_hash, status, result
    )
    values (
      p_workspace_id,
      pg_catalog.btrim(p_source),
      pg_catalog.btrim(p_event_id),
      pg_catalog.btrim(p_payload_hash),
      'review',
      result
    )
    returning id into event_row_id;

    insert into private.import_review_items (
      workspace_id, inbound_event_id, reason, payload
    )
    values (
      p_workspace_id,
      event_row_id,
      'matching_contact',
      jsonb_build_object(
        'full_name', full_name,
        'email', email_norm,
        'phone', phone_norm,
        'source', pg_catalog.btrim(p_source),
        'source_record_id', pg_catalog.btrim(p_source_record_id)
      )
    )
    returning id into review_id;

    update private.inbound_events as inbound
    set result = inbound.result || jsonb_build_object('review_id', review_id)
    where inbound.id = event_row_id;

    insert into private.external_lead_refs (
      workspace_id, source, source_record_id, outcome, result
    )
    values (
      p_workspace_id,
      pg_catalog.btrim(p_source),
      pg_catalog.btrim(p_source_record_id),
      'review',
      result || jsonb_build_object('review_id', review_id)
    );

    perform private.record_domain_event(
      p_workspace_id,
      'lead.import_review',
      'import_review_item',
      review_id,
      jsonb_build_object('review_id', review_id, 'inbound_event_id', event_row_id),
      'lead-review:' || event_row_id::text
    );

    return result || jsonb_build_object('review_id', review_id);
  end if;

  insert into public.accounts (
    workspace_id, kind, relationship, display_name, service_status
  )
  values (
    p_workspace_id, 'unknown', 'prospect', full_name, 'active'
  )
  returning id into account_id;

  insert into public.contacts (
    workspace_id, account_id, full_name, email, email_normalized,
    phone_raw, phone_e164, is_primary
  )
  values (
    p_workspace_id, account_id, full_name, email_norm, email_norm,
    phone_raw, phone_norm, true
  )
  returning id into contact_id;

  insert into public.deals (
    workspace_id, account_id, primary_contact_id, title, source, stage
  )
  values (
    p_workspace_id, account_id, contact_id, full_name, pg_catalog.btrim(p_source), 'new'
  )
  returning id into deal_id;

  insert into public.activities (
    workspace_id, account_id, deal_id, activity_type, actor_type, payload
  )
  values (
    p_workspace_id,
    account_id,
    deal_id,
    'lead_imported',
    'integration',
    jsonb_build_object(
      'account_id', account_id,
      'contact_id', contact_id,
      'deal_id', deal_id
    )
  )
  returning id into activity_id;

  result := jsonb_build_object(
    'status', 'created',
    'account_id', account_id,
    'contact_id', contact_id,
    'deal_id', deal_id,
    'activity_id', activity_id
  );

  insert into private.external_lead_refs (
    workspace_id, source, source_record_id, account_id, contact_id, deal_id, outcome, result
  )
  values (
    p_workspace_id,
    pg_catalog.btrim(p_source),
    pg_catalog.btrim(p_source_record_id),
    account_id,
    contact_id,
    deal_id,
    'created',
    result
  );

  insert into private.inbound_events (
    workspace_id, provider, event_id, payload_hash, status, result
  )
  values (
    p_workspace_id,
    pg_catalog.btrim(p_source),
    pg_catalog.btrim(p_event_id),
    pg_catalog.btrim(p_payload_hash),
    'processed',
    result
  )
  returning id into event_row_id;

  perform private.record_domain_event(
    p_workspace_id,
    'lead.imported',
    'deal',
    deal_id,
    jsonb_build_object(
      'account_id', account_id,
      'contact_id', contact_id,
      'deal_id', deal_id,
      'activity_id', activity_id,
      'inbound_event_id', event_row_id
    ),
    'lead-import:' || pg_catalog.btrim(p_source) || ':' || pg_catalog.btrim(p_event_id)
  );

  return result;
exception
  when unique_violation then
    select *
      into existing
    from private.inbound_events as inbound
    where inbound.provider = pg_catalog.btrim(p_source)
      and inbound.event_id = pg_catalog.btrim(p_event_id);

    if found then
      if existing.payload_hash is distinct from pg_catalog.btrim(p_payload_hash) then
        raise exception 'idempotency_conflict' using errcode = 'P0001';
      end if;
      return existing.result || jsonb_build_object('replayed', true);
    end if;

    select *
      into source_ref
    from private.external_lead_refs as ref
    where ref.workspace_id = p_workspace_id
      and ref.source = pg_catalog.btrim(p_source)
      and ref.source_record_id = pg_catalog.btrim(p_source_record_id);

    if not found then
      raise;
    end if;

    result := coalesce(source_ref.result, '{}'::jsonb) || jsonb_build_object('status', 'duplicate');

    begin
      insert into private.inbound_events (
        workspace_id, provider, event_id, payload_hash, status, result
      )
      values (
        p_workspace_id,
        pg_catalog.btrim(p_source),
        pg_catalog.btrim(p_event_id),
        pg_catalog.btrim(p_payload_hash),
        'duplicate',
        result
      );
    exception
      when unique_violation then
        select *
          into existing
        from private.inbound_events as inbound
        where inbound.provider = pg_catalog.btrim(p_source)
          and inbound.event_id = pg_catalog.btrim(p_event_id);

        if not found or existing.payload_hash is distinct from pg_catalog.btrim(p_payload_hash) then
          raise exception 'idempotency_conflict' using errcode = 'P0001';
        end if;

        return existing.result || jsonb_build_object('replayed', true);
    end;

    return result;
end;
$$;


