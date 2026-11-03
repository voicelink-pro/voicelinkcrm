-- Odbiór n8n korzysta z istniejącego import_lead. Retry i równoległy zapis zwracają wcześniejszy wynik.

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
    if sqlerrm like '%inbound_events_provider_event_unique%' then
      select *
        into existing
      from private.inbound_events as inbound
      where inbound.provider = pg_catalog.btrim(p_source)
        and inbound.event_id = pg_catalog.btrim(p_event_id);

      if not found or existing.payload_hash is distinct from pg_catalog.btrim(p_payload_hash) then
        raise exception 'idempotency_conflict' using errcode = 'P0001';
      end if;

      return existing.result || jsonb_build_object('replayed', true);
    end if;

    if sqlerrm like '%external_lead_refs_source_unique%' then
      select *
        into source_ref
      from private.external_lead_refs as ref
      where ref.workspace_id = p_workspace_id
        and ref.source = pg_catalog.btrim(p_source)
        and ref.source_record_id = pg_catalog.btrim(p_source_record_id);

      result := coalesce(source_ref.result, '{}'::jsonb) || jsonb_build_object('status', 'duplicate');

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

    raise;
end;
$$;


create unique index integration_connections_provider_idx
  on private.integration_connections (workspace_id, provider);

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
  on conflict (workspace_id, provider) do update
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

create or replace function private.resolve_import_review(
  p_actor_user_id uuid,
  p_review_id uuid,
  p_action text,
  p_account_id uuid,
  p_deal_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item private.import_review_items%rowtype;
  account public.accounts%rowtype;
  source_name text;
  source_record text;
  primary_contact uuid;
begin
  perform private.assert_server_role();

  if p_action not in ('link', 'dismiss') then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  select * into item from private.import_review_items where id = p_review_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_active_member(item.workspace_id, p_actor_user_id);
  if item.status is distinct from 'open' then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  source_name := item.payload ->> 'source';
  source_record := item.payload ->> 'source_record_id';

  if p_action = 'dismiss' then
    update private.import_review_items
    set status = 'dismissed', resolved_at = pg_catalog.now()
    where id = item.id;

    perform private.record_domain_event(
      item.workspace_id,
      'lead.import_dismissed',
      'import_review_item',
      item.id,
      jsonb_build_object('review_id', item.id),
      'lead-review-dismiss:' || item.id::text
    );
    return;
  end if;

  if p_account_id is null then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  select * into account from public.accounts where id = p_account_id for update;
  if not found or account.workspace_id is distinct from item.workspace_id or account.archived_at is not null then
    raise exception 'cross_reference' using errcode = '23514';
  end if;

  if p_deal_id is not null and not exists (
    select 1 from public.deals as deal
    where deal.id = p_deal_id
      and deal.account_id = account.id
      and deal.workspace_id = account.workspace_id
      and deal.archived_at is null
  ) then
    raise exception 'cross_reference' using errcode = '23514';
  end if;

  select contact.id into primary_contact
  from public.contacts as contact
  where contact.account_id = account.id
    and contact.archived_at is null
    and contact.is_primary
  limit 1;

  if source_name is not null and source_record is not null then
    insert into private.external_lead_refs (
      workspace_id, source, source_record_id, account_id, contact_id, deal_id, outcome, result
    )
    values (
      item.workspace_id,
      source_name,
      source_record,
      account.id,
      primary_contact,
      p_deal_id,
      'review',
      jsonb_build_object(
        'status', 'linked',
        'account_id', account.id,
        'deal_id', p_deal_id,
        'review_id', item.id
      )
    )
    on conflict (workspace_id, source, source_record_id) do update
    set account_id = excluded.account_id,
        contact_id = excluded.contact_id,
        deal_id = excluded.deal_id,
        result = private.external_lead_refs.result || excluded.result;
  end if;

  insert into public.activities (
    workspace_id, account_id, deal_id, activity_type, actor_type, actor_user_id, payload, created_by
  )
  values (
    account.workspace_id,
    account.id,
    p_deal_id,
    'import_linked',
    'user',
    p_actor_user_id,
    jsonb_build_object('review_id', item.id, 'account_id', account.id, 'deal_id', p_deal_id),
    p_actor_user_id
  );

  update private.import_review_items
  set status = 'resolved', resolved_at = pg_catalog.now()
  where id = item.id;

  perform private.record_domain_event(
    item.workspace_id,
    'lead.import_linked',
    'import_review_item',
    item.id,
    jsonb_build_object('review_id', item.id, 'account_id', account.id, 'deal_id', p_deal_id),
    'lead-review-link:' || item.id::text
  );
end;
$$;

grant execute on function private.note_integration_receipt(uuid, text, text, boolean, text) to service_role;
grant execute on function private.resolve_import_review(uuid, uuid, text, uuid, uuid) to service_role;
