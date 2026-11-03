-- Funkcje domenowe są SECURITY INVOKER i wolno je wywołać tylko roli serwerowej.
-- Daty „Nie odebrał” nie są tu liczone: D2 nie jest zatwierdzone, więc termin podaje wywołujący.

create or replace function private.assert_server_role()
returns void
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'not_a_member' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.require_active_member(
  p_workspace_id uuid,
  p_actor_user_id uuid
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform private.assert_server_role();

  if auth.uid() is not null and auth.uid() is distinct from p_actor_user_id then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.workspace_members as member
    where member.workspace_id = p_workspace_id
      and member.user_id = p_actor_user_id
      and member.active
  ) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;
end;
$$;

create or replace function private.normalize_email(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_email is null or pg_catalog.btrim(p_email) = '' then null
    else pg_catalog.lower(pg_catalog.btrim(p_email))
  end
$$;

create or replace function private.email_is_valid(p_email text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_email is not null
    and pg_catalog.char_length(p_email) <= 320
    and p_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
$$;

create or replace function private.normalize_phone(p_phone text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  raw text;
  compact text;
begin
  if p_phone is null or pg_catalog.btrim(p_phone) = '' then
    return null;
  end if;

  raw := pg_catalog.btrim(p_phone);
  if pg_catalog.lower(pg_catalog.left(raw, 2)) = 'p:' then
    raw := pg_catalog.btrim(pg_catalog.substr(raw, 3));
  end if;

  compact := pg_catalog.regexp_replace(raw, '[[:space:]\-\(\)\.]', '', 'g');
  if compact !~ '^\+[1-9][0-9]{7,14}$' then
    return null;
  end if;

  return compact;
end;
$$;

create or replace function private.warsaw_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (pg_catalog.now() at time zone 'Europe/Warsaw')::date
$$;

create or replace function private.subscription_cycle_date(
  p_starts_on date,
  p_anchor_day integer,
  p_cycle_index integer
)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  month_start date;
  month_last date;
begin
  if p_starts_on is null or p_anchor_day is null or p_cycle_index is null
    or p_cycle_index < 0 or p_anchor_day < 1 or p_anchor_day > 31 then
    raise exception 'invalid_billing_date' using errcode = '22023';
  end if;

  month_start := (
    pg_catalog.date_trunc('month', p_starts_on::timestamp)
    + pg_catalog.make_interval(months => p_cycle_index)
  )::date;
  month_last := (month_start + interval '1 month' - interval '1 day')::date;

  return pg_catalog.make_date(
    extract(year from month_start)::integer,
    extract(month from month_start)::integer,
    least(p_anchor_day, extract(day from month_last)::integer)
  );
end;
$$;

create or replace function private.record_domain_event(
  p_workspace_id uuid,
  p_event_type text,
  p_aggregate_type text,
  p_aggregate_id uuid,
  p_payload jsonb,
  p_dedupe_key text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into private.domain_events (
    workspace_id,
    event_type,
    aggregate_type,
    aggregate_id,
    payload,
    dedupe_key
  )
  values (
    p_workspace_id,
    p_event_type,
    p_aggregate_type,
    p_aggregate_id,
    coalesce(p_payload, '{}'::jsonb),
    p_dedupe_key
  )
  on conflict (dedupe_key) do nothing;
end;
$$;

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
    return existing.result;
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
end;
$$;

create or replace function private.record_no_answer(
  p_actor_user_id uuid,
  p_deal_id uuid,
  p_due_on date,
  p_action_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  deal public.deals%rowtype;
  existing_activity_id uuid;
  existing_task_id uuid;
  activity_id uuid;
  new_task_id uuid;
begin
  perform private.assert_server_role();

  if p_due_on is null then
    raise exception 'follow_up_date_required' using errcode = 'P0001';
  end if;

  if p_action_key is null or pg_catalog.char_length(pg_catalog.btrim(p_action_key)) not between 1 and 200 then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  select *
    into deal
  from public.deals
  where id = p_deal_id
  for update;

  if not found or deal.archived_at is not null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  perform private.require_active_member(deal.workspace_id, p_actor_user_id);

  select activity.id, activity.task_id
    into existing_activity_id, existing_task_id
  from public.activities as activity
  where activity.workspace_id = deal.workspace_id
    and activity.action_key = pg_catalog.btrim(p_action_key);

  if found then
    return jsonb_build_object(
      'status', 'existing',
      'activity_id', existing_activity_id,
      'task_id', existing_task_id,
      'deal_id', deal.id
    );
  end if;

  insert into public.activities (
    workspace_id, account_id, deal_id, activity_type, actor_type, actor_user_id,
    action_key, payload, created_by
  )
  values (
    deal.workspace_id,
    deal.account_id,
    deal.id,
    'call_no_answer',
    'user',
    p_actor_user_id,
    pg_catalog.btrim(p_action_key),
    jsonb_build_object('deal_id', deal.id),
    p_actor_user_id
  )
  returning id into activity_id;

  insert into public.tasks (
    workspace_id, account_id, deal_id, title, due_on, status, priority, kind,
    origin_activity_id, created_by
  )
  values (
    deal.workspace_id,
    deal.account_id,
    deal.id,
    'Ponowny kontakt',
    p_due_on,
    'todo',
    'normal',
    'follow_up',
    activity_id,
    p_actor_user_id
  )
  returning id into new_task_id;

  update public.activities
  set task_id = new_task_id
  where id = activity_id;

  insert into public.task_assignees (
    workspace_id, task_id, user_id, created_by
  )
  values (
    deal.workspace_id, new_task_id, p_actor_user_id, p_actor_user_id
  );

  if deal.stage = 'new' then
    update public.deals
    set stage = 'contact_attempt',
        updated_by = p_actor_user_id
    where id = deal.id;

    insert into public.deal_stage_history (
      workspace_id, deal_id, from_stage, to_stage, actor_user_id, created_by
    )
    values (
      deal.workspace_id, deal.id, 'new', 'contact_attempt', p_actor_user_id, p_actor_user_id
    );
  end if;

  perform private.record_domain_event(
    deal.workspace_id,
    'deal.no_answer',
    'deal',
    deal.id,
    jsonb_build_object(
      'deal_id', deal.id,
      'activity_id', activity_id,
      'task_id', new_task_id
    ),
    'no-answer:' || pg_catalog.btrim(p_action_key)
  );

  return jsonb_build_object(
    'status', 'created',
    'activity_id', activity_id,
    'task_id', new_task_id,
    'deal_id', deal.id
  );
end;
$$;

create or replace function private.generate_due_revenue(
  p_agreement_id uuid,
  p_as_of date default null
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  agreement public.billing_agreements%rowtype;
  as_of date;
  cycle integer := 0;
  cycle_on date;
  inserted integer := 0;
  inserted_now integer;
begin
  perform private.assert_server_role();

  select *
    into agreement
  from public.billing_agreements
  where id = p_agreement_id
  for update;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if agreement.status = 'void' then
    return 0;
  end if;

  as_of := coalesce(p_as_of, private.warsaw_today());

  if agreement.kind = 'setup' then
    if agreement.starts_on <= as_of then
      insert into public.revenue_entries (
        workspace_id, agreement_id, deal_id, account_id, entry_type, cycle_index,
        effective_on, amount_signed_cents, dedupe_key, created_by
      )
      values (
        agreement.workspace_id,
        agreement.id,
        agreement.deal_id,
        agreement.account_id,
        'setup',
        0,
        agreement.starts_on,
        agreement.amount_gross_cents,
        agreement.id::text || ':setup',
        agreement.created_by
      )
      on conflict (dedupe_key) do nothing;
      get diagnostics inserted_now = row_count;
      inserted := inserted + inserted_now;
    end if;
    return inserted;
  end if;

  loop
    cycle_on := private.subscription_cycle_date(
      agreement.starts_on,
      agreement.anchor_day,
      cycle
    );
    exit when cycle_on > as_of;
    exit when agreement.ends_on_exclusive is not null
      and cycle_on >= agreement.ends_on_exclusive;

    insert into public.revenue_entries (
      workspace_id, agreement_id, deal_id, account_id, entry_type, cycle_index,
      effective_on, amount_signed_cents, dedupe_key, created_by
    )
    values (
      agreement.workspace_id,
      agreement.id,
      agreement.deal_id,
      agreement.account_id,
      'subscription',
      cycle,
      cycle_on,
      agreement.amount_gross_cents,
      agreement.id::text || ':' || cycle::text,
      agreement.created_by
    )
    on conflict (dedupe_key) do nothing;
    get diagnostics inserted_now = row_count;
    inserted := inserted + inserted_now;
    cycle := cycle + 1;
    if cycle > 600 then
      raise exception 'billing_horizon_exceeded' using errcode = 'P0001';
    end if;
  end loop;

  return inserted;
end;
$$;

create or replace function private.finalize_deal(
  p_actor_user_id uuid,
  p_deal_id uuid,
  p_expected_version integer,
  p_setup_amount_cents bigint,
  p_setup_on date,
  p_monthly_amount_cents bigint,
  p_subscription_starts_on date default null,
  p_subscription_ends_on date default null,
  p_as_of date default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  deal public.deals%rowtype;
  account public.accounts%rowtype;
  setup public.billing_agreements%rowtype;
  subscription public.billing_agreements%rowtype;
  as_of date;
  setup_id uuid;
  subscription_id uuid;
  revenue_cents bigint;
  same_terms boolean;
begin
  perform private.assert_server_role();

  if p_setup_amount_cents is null
    or p_monthly_amount_cents is null
    or p_setup_on is null
    or p_setup_amount_cents < 0
    or p_monthly_amount_cents < 0 then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  if p_monthly_amount_cents > 0 and p_subscription_starts_on is null then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  if p_subscription_ends_on is not null
    and (
      p_subscription_starts_on is null
      or p_subscription_ends_on <= p_subscription_starts_on
    ) then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  select *
    into deal
  from public.deals
  where id = p_deal_id
  for update;

  if not found or deal.archived_at is not null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  perform private.require_active_member(deal.workspace_id, p_actor_user_id);
  as_of := coalesce(p_as_of, private.warsaw_today());

  select *
    into setup
  from public.billing_agreements as agreement
  where agreement.deal_id = deal.id
    and agreement.kind = 'setup'
    and agreement.status <> 'void'
  order by agreement.created_at
  limit 1;

  select *
    into subscription
  from public.billing_agreements as agreement
  where agreement.deal_id = deal.id
    and agreement.kind = 'subscription'
    and agreement.status <> 'void'
  order by agreement.agreement_version desc, agreement.created_at desc
  limit 1;

  if deal.stage = 'won' then
    same_terms := setup.id is not null
      and setup.amount_gross_cents = p_setup_amount_cents
      and setup.starts_on = p_setup_on
      and (
        (
          p_monthly_amount_cents = 0
          and subscription.id is null
        )
        or (
          p_monthly_amount_cents > 0
          and subscription.id is not null
          and subscription.amount_gross_cents = p_monthly_amount_cents
          and subscription.starts_on = p_subscription_starts_on
          and subscription.ends_on_exclusive is not distinct from p_subscription_ends_on
        )
      );

    if not same_terms then
      raise exception 'finalization_conflict' using errcode = 'P0001';
    end if;

    select coalesce(sum(entry.amount_signed_cents), 0)
      into revenue_cents
    from public.revenue_entries as entry
    where entry.deal_id = deal.id;

    return jsonb_build_object(
      'status', 'existing',
      'deal_id', deal.id,
      'account_id', deal.account_id,
      'setup_agreement_id', setup.id,
      'subscription_agreement_id', subscription.id,
      'revenue_cents', revenue_cents
    );
  end if;

  if deal.stage = 'lost' then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  if deal.version is distinct from p_expected_version then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;

  select *
    into account
  from public.accounts
  where id = deal.account_id
  for update;

  insert into public.billing_agreements (
    workspace_id, deal_id, account_id, kind, amount_gross_cents, starts_on, anchor_day,
    status, created_by
  )
  values (
    deal.workspace_id,
    deal.id,
    deal.account_id,
    'setup',
    p_setup_amount_cents,
    p_setup_on,
    null,
    case when p_setup_on <= as_of then 'active' else 'scheduled' end,
    p_actor_user_id
  )
  returning id into setup_id;

  if p_monthly_amount_cents > 0 then
    insert into public.billing_agreements (
      workspace_id, deal_id, account_id, kind, amount_gross_cents, starts_on, anchor_day,
      ends_on_exclusive, status, created_by
    )
    values (
      deal.workspace_id,
      deal.id,
      deal.account_id,
      'subscription',
      p_monthly_amount_cents,
      p_subscription_starts_on,
      extract(day from p_subscription_starts_on)::integer,
      p_subscription_ends_on,
      case
        when p_subscription_ends_on is not null and p_subscription_ends_on <= as_of then 'ended'
        when p_subscription_starts_on <= as_of then 'active'
        else 'scheduled'
      end,
      p_actor_user_id
    )
    returning id into subscription_id;
  end if;

  update public.deals
  set stage = 'won',
      setup_amount_gross_cents = p_setup_amount_cents,
      monthly_amount_gross_cents = p_monthly_amount_cents,
      won_at = pg_catalog.now(),
      lost_at = null,
      lost_reason = null,
      updated_by = p_actor_user_id
  where id = deal.id;

  insert into public.deal_stage_history (
    workspace_id, deal_id, from_stage, to_stage, actor_user_id, created_by
  )
  values (
    deal.workspace_id, deal.id, deal.stage, 'won', p_actor_user_id, p_actor_user_id
  );

  if account.relationship is distinct from 'client' then
    update public.accounts
    set relationship = 'client',
        updated_by = p_actor_user_id
    where id = account.id;
  end if;

  perform private.generate_due_revenue(setup_id, as_of);
  if subscription_id is not null then
    perform private.generate_due_revenue(subscription_id, as_of);
  end if;

  select coalesce(sum(entry.amount_signed_cents), 0)
    into revenue_cents
  from public.revenue_entries as entry
  where entry.deal_id = deal.id;

  perform private.record_domain_event(
    deal.workspace_id,
    'deal.finalized',
    'deal',
    deal.id,
    jsonb_build_object(
      'deal_id', deal.id,
      'account_id', deal.account_id,
      'setup_agreement_id', setup_id,
      'subscription_agreement_id', subscription_id
    ),
    'finalize:' || deal.id::text
  );

  return jsonb_build_object(
    'status', 'created',
    'deal_id', deal.id,
    'account_id', deal.account_id,
    'setup_agreement_id', setup_id,
    'subscription_agreement_id', subscription_id,
    'revenue_cents', revenue_cents
  );
end;
$$;

create or replace function private.correct_revenue_entry(
  p_actor_user_id uuid,
  p_entry_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  entry public.revenue_entries%rowtype;
  correction_id uuid;
begin
  perform private.assert_server_role();

  if p_reason is null or pg_catalog.char_length(pg_catalog.btrim(p_reason)) not between 1 and 500 then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  select *
    into entry
  from public.revenue_entries
  where id = p_entry_id
  for update;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  perform private.require_active_member(entry.workspace_id, p_actor_user_id);

  if entry.entry_type = 'correction' then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  select correction.id
    into correction_id
  from public.revenue_entries as correction
  where correction.reverses_entry_id = entry.id;

  if found then
    return correction_id;
  end if;

  insert into public.revenue_entries (
    workspace_id, agreement_id, deal_id, account_id, entry_type, cycle_index,
    effective_on, amount_signed_cents, reason, dedupe_key, reverses_entry_id, created_by
  )
  values (
    entry.workspace_id,
    entry.agreement_id,
    entry.deal_id,
    entry.account_id,
    'correction',
    null,
    entry.effective_on,
    -entry.amount_signed_cents,
    pg_catalog.btrim(p_reason),
    'correction:' || entry.id::text,
    entry.id,
    p_actor_user_id
  )
  returning id into correction_id;

  perform private.record_domain_event(
    entry.workspace_id,
    'revenue.corrected',
    'revenue_entry',
    entry.id,
    jsonb_build_object(
      'entry_id', entry.id,
      'correction_id', correction_id,
      'deal_id', entry.deal_id
    ),
    'correction:' || entry.id::text
  );

  return correction_id;
end;
$$;

create or replace function private.replace_revenue_entry(
  p_actor_user_id uuid,
  p_entry_id uuid,
  p_amount_cents bigint,
  p_reason text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  entry public.revenue_entries%rowtype;
  replacement_id uuid;
  existing_correction uuid;
begin
  perform private.assert_server_role();

  if p_amount_cents is null or p_amount_cents < 0 then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  select id
    into replacement_id
  from public.revenue_entries
  where dedupe_key = 'replacement:' || p_entry_id::text;

  if found then
    return replacement_id;
  end if;

  select *
    into entry
  from public.revenue_entries
  where id = p_entry_id
  for update;

  if not found or entry.entry_type = 'correction' or entry.superseded_at is not null then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  perform private.require_active_member(entry.workspace_id, p_actor_user_id);

  select correction.id
    into existing_correction
  from public.revenue_entries as correction
  where correction.reverses_entry_id = entry.id;

  if found then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  perform private.correct_revenue_entry(p_actor_user_id, entry.id, p_reason);

  update public.revenue_entries
  set superseded_at = pg_catalog.now(),
      updated_by = p_actor_user_id
  where id = entry.id;

  insert into public.revenue_entries (
    workspace_id, agreement_id, deal_id, account_id, entry_type, cycle_index,
    effective_on, amount_signed_cents, reason, dedupe_key, created_by
  )
  values (
    entry.workspace_id,
    entry.agreement_id,
    entry.deal_id,
    entry.account_id,
    entry.entry_type,
    entry.cycle_index,
    entry.effective_on,
    p_amount_cents,
    pg_catalog.btrim(p_reason),
    'replacement:' || entry.id::text,
    p_actor_user_id
  )
  returning id into replacement_id;

  perform private.record_domain_event(
    entry.workspace_id,
    'revenue.replaced',
    'revenue_entry',
    replacement_id,
    jsonb_build_object(
      'entry_id', entry.id,
      'replacement_id', replacement_id,
      'deal_id', entry.deal_id
    ),
    'replacement:' || entry.id::text
  );

  return replacement_id;
end;
$$;

create or replace function private.end_subscription(
  p_actor_user_id uuid,
  p_agreement_id uuid,
  p_expected_version integer,
  p_ends_on_exclusive date
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  agreement public.billing_agreements%rowtype;
  booked_after boolean;
begin
  perform private.assert_server_role();

  select *
    into agreement
  from public.billing_agreements
  where id = p_agreement_id
  for update;

  if not found or agreement.kind <> 'subscription' or agreement.status = 'void' then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  perform private.require_active_member(agreement.workspace_id, p_actor_user_id);

  if agreement.version is distinct from p_expected_version then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;

  if p_ends_on_exclusive is null or p_ends_on_exclusive <= agreement.starts_on then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  select exists (
    select 1
    from public.revenue_entries as entry
    where entry.agreement_id = agreement.id
      and entry.entry_type <> 'correction'
      and entry.superseded_at is null
      and entry.effective_on >= p_ends_on_exclusive
  )
    into booked_after;

  if booked_after then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  update public.billing_agreements
  set ends_on_exclusive = p_ends_on_exclusive,
      status = case
        when p_ends_on_exclusive <= private.warsaw_today() then 'ended'
        when agreement.starts_on <= private.warsaw_today() then 'active'
        else 'scheduled'
      end,
      updated_by = p_actor_user_id
  where id = agreement.id;

  perform private.record_domain_event(
    agreement.workspace_id,
    'subscription.ended',
    'billing_agreement',
    agreement.id,
    jsonb_build_object('agreement_id', agreement.id, 'deal_id', agreement.deal_id),
    'end-subscription:' || agreement.id::text || ':' || p_ends_on_exclusive::text
  );
end;
$$;

create or replace function private.revise_subscription_amount(
  p_actor_user_id uuid,
  p_agreement_id uuid,
  p_expected_version integer,
  p_from_cycle_index integer,
  p_new_amount_cents bigint
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  agreement public.billing_agreements%rowtype;
  cycle_on date;
  new_id uuid;
  today date;
begin
  perform private.assert_server_role();

  if p_from_cycle_index is null or p_from_cycle_index < 0 or p_new_amount_cents is null
    or p_new_amount_cents < 0 then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  select *
    into agreement
  from public.billing_agreements
  where id = p_agreement_id
  for update;

  if not found or agreement.kind <> 'subscription' or agreement.status = 'void' then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  perform private.require_active_member(agreement.workspace_id, p_actor_user_id);

  if agreement.version is distinct from p_expected_version then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;

  today := private.warsaw_today();
  cycle_on := private.subscription_cycle_date(
    agreement.starts_on,
    agreement.anchor_day,
    p_from_cycle_index
  );

  if cycle_on <= today then
    raise exception 'subscription_revision_not_future' using errcode = 'P0001';
  end if;

  if cycle_on <= agreement.starts_on then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  if agreement.ends_on_exclusive is not null and cycle_on > agreement.ends_on_exclusive then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.revenue_entries as entry
    where entry.agreement_id = agreement.id
      and entry.entry_type <> 'correction'
      and entry.superseded_at is null
      and entry.cycle_index >= p_from_cycle_index
  ) then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  update public.billing_agreements
  set ends_on_exclusive = cycle_on,
      status = case
        when cycle_on <= today then 'ended'
        when agreement.starts_on <= today then 'active'
        else 'scheduled'
      end,
      updated_by = p_actor_user_id
  where id = agreement.id;

  insert into public.billing_agreements (
    workspace_id, deal_id, account_id, kind, amount_gross_cents, starts_on, anchor_day,
    ends_on_exclusive, status, agreement_version, created_by
  )
  values (
    agreement.workspace_id,
    agreement.deal_id,
    agreement.account_id,
    'subscription',
    p_new_amount_cents,
    cycle_on,
    agreement.anchor_day,
    case
      when agreement.ends_on_exclusive is not null and agreement.ends_on_exclusive > cycle_on
        then agreement.ends_on_exclusive
      else null
    end,
    'scheduled',
    agreement.agreement_version + 1,
    p_actor_user_id
  )
  returning id into new_id;

  perform private.record_domain_event(
    agreement.workspace_id,
    'subscription.revised',
    'billing_agreement',
    new_id,
    jsonb_build_object(
      'agreement_id', new_id,
      'previous_agreement_id', agreement.id,
      'deal_id', agreement.deal_id
    ),
    'revise-subscription:' || agreement.id::text || ':' || p_from_cycle_index::text
  );

  return new_id;
end;
$$;

create or replace function private.revert_deal_finalization(
  p_actor_user_id uuid,
  p_deal_id uuid,
  p_expected_version integer,
  p_target_stage text,
  p_lost_reason text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  deal public.deals%rowtype;
  agreement public.billing_agreements%rowtype;
  entry public.revenue_entries%rowtype;
  other_won boolean;
begin
  perform private.assert_server_role();

  if p_target_stage is null or p_target_stage not in (
    'new',
    'contact_attempt',
    'conversation_done',
    'meeting_scheduled',
    'meeting_done',
    'offer_sent',
    'negotiation',
    'lost'
  ) then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  if p_target_stage = 'lost'
    and (
      p_lost_reason is null
      or pg_catalog.char_length(pg_catalog.btrim(p_lost_reason)) not between 1 and 500
    ) then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  select *
    into deal
  from public.deals
  where id = p_deal_id
  for update;

  if not found or deal.stage <> 'won' then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  perform private.require_active_member(deal.workspace_id, p_actor_user_id);

  if deal.version is distinct from p_expected_version then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;

  for agreement in
    select *
    from public.billing_agreements as row
    where row.deal_id = deal.id
      and row.status <> 'void'
    for update
  loop
    update public.billing_agreements
    set status = 'void',
        ends_on_exclusive = case
          when agreement.kind = 'subscription'
            and private.warsaw_today() > agreement.starts_on
            then least(
              coalesce(agreement.ends_on_exclusive, private.warsaw_today()),
              private.warsaw_today()
            )
          else agreement.ends_on_exclusive
        end,
        updated_by = p_actor_user_id
    where id = agreement.id;
  end loop;

  for entry in
    select *
    from public.revenue_entries as row
    where row.deal_id = deal.id
      and row.entry_type <> 'correction'
      and not exists (
        select 1
        from public.revenue_entries as correction
        where correction.reverses_entry_id = row.id
      )
    for update
  loop
    perform private.correct_revenue_entry(
      p_actor_user_id,
      entry.id,
      'Cofnięcie finalizacji'
    );
  end loop;

  update public.deals
  set stage = p_target_stage,
      won_at = null,
      lost_at = case when p_target_stage = 'lost' then pg_catalog.now() else null end,
      lost_reason = case
        when p_target_stage = 'lost' then pg_catalog.btrim(p_lost_reason)
        else null
      end,
      updated_by = p_actor_user_id
  where id = deal.id;

  insert into public.deal_stage_history (
    workspace_id, deal_id, from_stage, to_stage, actor_user_id, created_by
  )
  values (
    deal.workspace_id,
    deal.id,
    'won',
    p_target_stage,
    p_actor_user_id,
    p_actor_user_id
  );

  select exists (
    select 1
    from public.deals as other
    where other.account_id = deal.account_id
      and other.id <> deal.id
      and other.stage = 'won'
      and other.archived_at is null
  )
    into other_won;

  if not other_won then
    update public.accounts
    set relationship = 'prospect',
        updated_by = p_actor_user_id
    where id = deal.account_id;
  end if;

  perform private.record_domain_event(
    deal.workspace_id,
    'deal.finalization_reverted',
    'deal',
    deal.id,
    jsonb_build_object('deal_id', deal.id, 'account_id', deal.account_id),
    'revert:' || deal.id::text || ':' || p_expected_version::text
  );
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on all functions in schema private to service_role;
grant execute on function private.is_active_member(uuid) to authenticated;
