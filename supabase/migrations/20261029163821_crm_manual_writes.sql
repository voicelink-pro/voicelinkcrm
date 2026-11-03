-- Ręczny CRM. Mutacje idą przez funkcje serwerowe, odczyt list przez widoki z RLS wywołującego.

create or replace function private.reject_revenue_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'revenue_immutable' using errcode = '42501';
  end if;

  if new.amount_signed_cents is distinct from old.amount_signed_cents
    or new.effective_on is distinct from old.effective_on
    or new.agreement_id is distinct from old.agreement_id
    or new.deal_id is distinct from old.deal_id
    or new.entry_type is distinct from old.entry_type
    or new.cycle_index is distinct from old.cycle_index
    or new.dedupe_key is distinct from old.dedupe_key
    or new.reverses_entry_id is distinct from old.reverses_entry_id
    or new.currency is distinct from old.currency
    or new.workspace_id is distinct from old.workspace_id
    or (
      new.account_id is distinct from old.account_id
      and coalesce(pg_catalog.current_setting('private.merge_accounts', true), '') is distinct from 'on'
    )
  then
    raise exception 'revenue_immutable' using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function private.blank_to_null(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(pg_catalog.btrim(coalesce(p_value, '')), '')
$$;

create or replace function private.matching_contact_ids(
  p_workspace_id uuid,
  p_email text,
  p_phone text,
  p_except_contact_id uuid default null
)
returns uuid[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(distinct contact.id), '{}'::uuid[])
  from public.contacts as contact
  where contact.workspace_id = p_workspace_id
    and contact.archived_at is null
    and (p_except_contact_id is null or contact.id is distinct from p_except_contact_id)
    and (
      (p_email is not null and contact.email_normalized = p_email)
      or (p_phone is not null and contact.phone_e164 = p_phone)
    )
$$;

create or replace function private.prepare_contact_channels(
  p_email text,
  p_phone text,
  out email_norm text,
  out phone_norm text,
  out phone_raw text
)
language plpgsql
immutable
set search_path = ''
as $$
declare
  email_raw text;
begin
  email_raw := private.blank_to_null(p_email);
  phone_raw := private.blank_to_null(p_phone);
  email_norm := private.normalize_email(email_raw);
  phone_norm := private.normalize_phone(phone_raw);

  if email_raw is not null and not private.email_is_valid(email_norm) then
    raise exception 'invalid_contact' using errcode = 'P0001';
  end if;

  if phone_raw is not null and phone_norm is null then
    raise exception 'invalid_contact' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function private.create_manual_lead(
  p_actor_user_id uuid,
  p_full_name text,
  p_company_name text,
  p_email text,
  p_phone text,
  p_product_type text,
  p_title text,
  p_owner_user_id uuid,
  p_confirm_duplicate boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  workspace_id uuid;
  full_name text;
  company_name text;
  title text;
  channels record;
  match_ids uuid[];
  account_id uuid;
  contact_id uuid;
  deal_id uuid;
  account_kind text;
  display_name text;
begin
  perform private.assert_server_role();
  full_name := private.blank_to_null(p_full_name);
  company_name := private.blank_to_null(p_company_name);
  title := private.blank_to_null(p_title);

  if full_name is null or pg_catalog.char_length(full_name) > 200 then
    raise exception 'invalid_contact' using errcode = 'P0001';
  end if;

  if company_name is not null and pg_catalog.char_length(company_name) > 200 then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  if p_product_type is not null and p_product_type not in (
    'voice_assistant', 'website', 'digital_infrastructure'
  ) then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  select member.workspace_id
    into workspace_id
  from public.workspace_members as member
  where member.user_id = p_actor_user_id
    and member.active
  limit 1;

  if workspace_id is null then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  perform private.require_active_member(workspace_id, p_actor_user_id);

  if p_owner_user_id is not null then
    perform private.require_active_member(workspace_id, p_owner_user_id);
  end if;

  select * into channels from private.prepare_contact_channels(p_email, p_phone);
  match_ids := private.matching_contact_ids(workspace_id, channels.email_norm, channels.phone_norm, null);

  if coalesce(array_length(match_ids, 1), 0) > 0 and not coalesce(p_confirm_duplicate, false) then
    return jsonb_build_object(
      'status', 'possible_duplicate',
      'match_ids', to_jsonb(match_ids)
    );
  end if;

  if company_name is null then
    account_kind := 'unknown';
    display_name := full_name;
  else
    account_kind := 'company';
    display_name := company_name;
  end if;

  title := coalesce(title, display_name);

  insert into public.accounts (
    workspace_id, kind, relationship, display_name, company_name, service_status, created_by
  )
  values (
    workspace_id, account_kind, 'prospect', display_name, company_name, 'active', p_actor_user_id
  )
  returning id into account_id;

  insert into public.contacts (
    workspace_id, account_id, full_name, email, email_normalized,
    phone_raw, phone_e164, is_primary, created_by
  )
  values (
    workspace_id, account_id, full_name, channels.email_norm, channels.email_norm,
    channels.phone_raw, channels.phone_norm, true, p_actor_user_id
  )
  returning id into contact_id;

  insert into public.deals (
    workspace_id, account_id, primary_contact_id, title, product_type, source, stage,
    owner_user_id, created_by
  )
  values (
    workspace_id, account_id, contact_id, title, p_product_type, 'manual', 'new',
    p_owner_user_id, p_actor_user_id
  )
  returning id into deal_id;

  insert into public.deal_stage_history (
    workspace_id, deal_id, from_stage, to_stage, actor_user_id, created_by
  )
  values (
    workspace_id, deal_id, null, 'new', p_actor_user_id, p_actor_user_id
  );

  insert into public.activities (
    workspace_id, account_id, deal_id, activity_type, actor_type, actor_user_id, payload, created_by
  )
  values (
    workspace_id, account_id, deal_id, 'lead_created', 'user', p_actor_user_id,
    jsonb_build_object('account_id', account_id, 'contact_id', contact_id, 'deal_id', deal_id),
    p_actor_user_id
  );

  perform private.record_domain_event(
    workspace_id,
    'lead.created',
    'deal',
    deal_id,
    jsonb_build_object('account_id', account_id, 'contact_id', contact_id, 'deal_id', deal_id),
    'manual-lead:' || deal_id::text
  );

  return jsonb_build_object(
    'status', 'created',
    'account_id', account_id,
    'contact_id', contact_id,
    'deal_id', deal_id
  );
end;
$$;

create or replace function private.add_contact(
  p_actor_user_id uuid,
  p_account_id uuid,
  p_full_name text,
  p_email text,
  p_phone text,
  p_job_title text,
  p_is_primary boolean,
  p_confirm_duplicate boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  account public.accounts%rowtype;
  full_name text;
  channels record;
  match_ids uuid[];
  contact_id uuid;
begin
  perform private.assert_server_role();
  select * into account from public.accounts where id = p_account_id for update;
  if not found or account.archived_at is not null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_active_member(account.workspace_id, p_actor_user_id);

  full_name := private.blank_to_null(p_full_name);
  if full_name is null or pg_catalog.char_length(full_name) > 200 then
    raise exception 'invalid_contact' using errcode = 'P0001';
  end if;

  select * into channels from private.prepare_contact_channels(p_email, p_phone);
  match_ids := private.matching_contact_ids(
    account.workspace_id, channels.email_norm, channels.phone_norm, null
  );

  if coalesce(array_length(match_ids, 1), 0) > 0 and not coalesce(p_confirm_duplicate, false) then
    return jsonb_build_object('status', 'possible_duplicate', 'match_ids', to_jsonb(match_ids));
  end if;

  if coalesce(p_is_primary, false) then
    update public.contacts
    set is_primary = false, updated_by = p_actor_user_id
    where account_id = account.id
      and is_primary
      and archived_at is null;
  end if;

  insert into public.contacts (
    workspace_id, account_id, full_name, job_title, email, email_normalized,
    phone_raw, phone_e164, is_primary, created_by
  )
  values (
    account.workspace_id, account.id, full_name, private.blank_to_null(p_job_title),
    channels.email_norm, channels.email_norm, channels.phone_raw, channels.phone_norm,
    coalesce(p_is_primary, false), p_actor_user_id
  )
  returning id into contact_id;

  return jsonb_build_object('status', 'created', 'contact_id', contact_id, 'account_id', account.id);
end;
$$;

create or replace function private.add_deal(
  p_actor_user_id uuid,
  p_account_id uuid,
  p_title text,
  p_product_type text,
  p_primary_contact_id uuid,
  p_owner_user_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  account public.accounts%rowtype;
  title text;
  deal_id uuid;
begin
  perform private.assert_server_role();
  select * into account from public.accounts where id = p_account_id for update;
  if not found or account.archived_at is not null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_active_member(account.workspace_id, p_actor_user_id);

  title := private.blank_to_null(p_title);
  if title is null or pg_catalog.char_length(title) > 200 then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  if p_product_type is not null and p_product_type not in (
    'voice_assistant', 'website', 'digital_infrastructure'
  ) then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  if p_owner_user_id is not null then
    perform private.require_active_member(account.workspace_id, p_owner_user_id);
  end if;

  insert into public.deals (
    workspace_id, account_id, primary_contact_id, title, product_type, source, stage,
    owner_user_id, created_by
  )
  values (
    account.workspace_id, account.id, p_primary_contact_id, title, p_product_type, 'manual', 'new',
    p_owner_user_id, p_actor_user_id
  )
  returning id into deal_id;

  insert into public.deal_stage_history (
    workspace_id, deal_id, from_stage, to_stage, actor_user_id, created_by
  )
  values (account.workspace_id, deal_id, null, 'new', p_actor_user_id, p_actor_user_id);

  return deal_id;
end;
$$;

create or replace function private.update_account(
  p_actor_user_id uuid,
  p_account_id uuid,
  p_expected_version integer,
  p_display_name text,
  p_company_name text,
  p_kind text,
  p_website text,
  p_nip text,
  p_address text,
  p_service_status text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  account public.accounts%rowtype;
  next_name text;
begin
  perform private.assert_server_role();
  select * into account from public.accounts where id = p_account_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_active_member(account.workspace_id, p_actor_user_id);
  if account.version is distinct from p_expected_version then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;

  next_name := private.blank_to_null(p_display_name);
  if next_name is null or pg_catalog.char_length(next_name) > 200 then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  if p_kind not in ('company', 'person', 'unknown') then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  if p_service_status not in ('active', 'inactive') then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  update public.accounts
  set display_name = next_name,
      company_name = private.blank_to_null(p_company_name),
      kind = p_kind,
      website = private.blank_to_null(p_website),
      nip = private.blank_to_null(p_nip),
      address = private.blank_to_null(p_address),
      service_status = p_service_status,
      updated_by = p_actor_user_id
  where id = account.id;
end;
$$;

create or replace function private.update_contact(
  p_actor_user_id uuid,
  p_contact_id uuid,
  p_expected_version integer,
  p_full_name text,
  p_job_title text,
  p_email text,
  p_phone text,
  p_is_primary boolean,
  p_confirm_duplicate boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  contact public.contacts%rowtype;
  full_name text;
  channels record;
  match_ids uuid[];
begin
  perform private.assert_server_role();
  select * into contact from public.contacts where id = p_contact_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_active_member(contact.workspace_id, p_actor_user_id);
  if contact.version is distinct from p_expected_version then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;

  full_name := private.blank_to_null(p_full_name);
  if full_name is null or pg_catalog.char_length(full_name) > 200 then
    raise exception 'invalid_contact' using errcode = 'P0001';
  end if;

  select * into channels from private.prepare_contact_channels(p_email, p_phone);
  match_ids := private.matching_contact_ids(
    contact.workspace_id, channels.email_norm, channels.phone_norm, contact.id
  );
  if coalesce(array_length(match_ids, 1), 0) > 0 and not coalesce(p_confirm_duplicate, false) then
    return jsonb_build_object('status', 'possible_duplicate', 'match_ids', to_jsonb(match_ids));
  end if;

  if coalesce(p_is_primary, false) and not contact.is_primary then
    update public.contacts
    set is_primary = false, updated_by = p_actor_user_id
    where account_id = contact.account_id
      and id <> contact.id
      and is_primary
      and archived_at is null;
  end if;

  update public.contacts
  set full_name = full_name,
      job_title = private.blank_to_null(p_job_title),
      email = channels.email_norm,
      email_normalized = channels.email_norm,
      phone_raw = channels.phone_raw,
      phone_e164 = channels.phone_norm,
      is_primary = coalesce(p_is_primary, false),
      updated_by = p_actor_user_id
  where id = contact.id;

  return jsonb_build_object('status', 'updated', 'contact_id', contact.id);
end;
$$;

create or replace function private.update_deal(
  p_actor_user_id uuid,
  p_deal_id uuid,
  p_expected_version integer,
  p_title text,
  p_product_type text,
  p_primary_contact_id uuid,
  p_description text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  deal public.deals%rowtype;
  title text;
begin
  perform private.assert_server_role();
  select * into deal from public.deals where id = p_deal_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_active_member(deal.workspace_id, p_actor_user_id);
  if deal.version is distinct from p_expected_version then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;

  title := private.blank_to_null(p_title);
  if title is null or pg_catalog.char_length(title) > 200 then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  if p_product_type is not null and p_product_type not in (
    'voice_assistant', 'website', 'digital_infrastructure'
  ) then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  update public.deals
  set title = title,
      product_type = p_product_type,
      primary_contact_id = p_primary_contact_id,
      description = private.blank_to_null(p_description),
      updated_by = p_actor_user_id
  where id = deal.id;
end;
$$;

create or replace function private.assign_deal_owner(
  p_actor_user_id uuid,
  p_deal_id uuid,
  p_expected_version integer,
  p_owner_user_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  deal public.deals%rowtype;
begin
  perform private.assert_server_role();
  select * into deal from public.deals where id = p_deal_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_active_member(deal.workspace_id, p_actor_user_id);
  if deal.version is distinct from p_expected_version then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;
  if p_owner_user_id is not null then
    perform private.require_active_member(deal.workspace_id, p_owner_user_id);
  end if;

  update public.deals
  set owner_user_id = p_owner_user_id,
      updated_by = p_actor_user_id
  where id = deal.id;
end;
$$;

create or replace function private.change_deal_stage(
  p_actor_user_id uuid,
  p_deal_id uuid,
  p_expected_version integer,
  p_stage text,
  p_lost_reason text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  deal public.deals%rowtype;
  reason text;
begin
  perform private.assert_server_role();
  if p_stage = 'won' or p_stage is null then
    raise exception 'finalization_required' using errcode = 'P0001';
  end if;
  if p_stage not in (
    'new', 'contact_attempt', 'conversation_done', 'meeting_scheduled',
    'meeting_done', 'offer_sent', 'negotiation', 'lost'
  ) then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  select * into deal from public.deals where id = p_deal_id for update;
  if not found or deal.archived_at is not null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_active_member(deal.workspace_id, p_actor_user_id);
  if deal.stage = 'won' then
    raise exception 'finalization_required' using errcode = 'P0001';
  end if;
  if deal.version is distinct from p_expected_version then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;
  if deal.stage = p_stage then
    return;
  end if;

  reason := private.blank_to_null(p_lost_reason);
  if p_stage = 'lost' and (reason is null or pg_catalog.char_length(reason) > 500) then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  update public.deals
  set stage = p_stage,
      lost_reason = case when p_stage = 'lost' then reason else null end,
      lost_at = case when p_stage = 'lost' then pg_catalog.now() else null end,
      updated_by = p_actor_user_id
  where id = deal.id;

  insert into public.deal_stage_history (
    workspace_id, deal_id, from_stage, to_stage, actor_user_id, created_by
  )
  values (
    deal.workspace_id, deal.id, deal.stage, p_stage, p_actor_user_id, p_actor_user_id
  );

  insert into public.activities (
    workspace_id, account_id, deal_id, activity_type, actor_type, actor_user_id, payload, created_by
  )
  values (
    deal.workspace_id, deal.account_id, deal.id, 'stage_changed', 'user', p_actor_user_id,
    jsonb_build_object('deal_id', deal.id, 'from_stage', deal.stage, 'to_stage', p_stage),
    p_actor_user_id
  );
end;
$$;

create or replace function private.record_contact_outcome(
  p_actor_user_id uuid,
  p_deal_id uuid,
  p_outcome text,
  p_summary text,
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
  summary text;
  activity_id uuid;
begin
  perform private.assert_server_role();
  if p_outcome = 'no_answer' then
    return private.record_no_answer(p_actor_user_id, p_deal_id, p_due_on, p_action_key);
  end if;

  if p_outcome not in ('conversation', 'other') then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  summary := private.blank_to_null(p_summary);
  if summary is null or pg_catalog.char_length(summary) > 2000 then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  select * into deal from public.deals where id = p_deal_id for update;
  if not found or deal.archived_at is not null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_active_member(deal.workspace_id, p_actor_user_id);

  insert into public.activities (
    workspace_id, account_id, deal_id, activity_type, actor_type, actor_user_id, payload, created_by
  )
  values (
    deal.workspace_id, deal.account_id, deal.id, 'contact_outcome', 'user', p_actor_user_id,
    jsonb_build_object('deal_id', deal.id, 'outcome', p_outcome, 'summary', summary),
    p_actor_user_id
  )
  returning id into activity_id;

  return jsonb_build_object('status', 'created', 'activity_id', activity_id, 'deal_id', deal.id);
end;
$$;

create or replace function private.add_note(
  p_actor_user_id uuid,
  p_account_id uuid,
  p_deal_id uuid,
  p_body text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  account public.accounts%rowtype;
  body text;
  note_id uuid;
begin
  perform private.assert_server_role();
  select * into account from public.accounts where id = p_account_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_active_member(account.workspace_id, p_actor_user_id);
  body := private.blank_to_null(p_body);
  if body is null or pg_catalog.char_length(body) > 20000 then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  insert into public.notes (
    workspace_id, account_id, deal_id, body, created_by
  )
  values (account.workspace_id, account.id, p_deal_id, body, p_actor_user_id)
  returning id into note_id;

  return note_id;
end;
$$;

create or replace function private.add_task(
  p_actor_user_id uuid,
  p_account_id uuid,
  p_deal_id uuid,
  p_title text,
  p_due_on date,
  p_assignee_ids uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  account public.accounts%rowtype;
  title text;
  task_id uuid;
  assignee uuid;
begin
  perform private.assert_server_role();
  select * into account from public.accounts where id = p_account_id;
  if not found or account.archived_at is not null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_active_member(account.workspace_id, p_actor_user_id);
  title := private.blank_to_null(p_title);
  if title is null or pg_catalog.char_length(title) > 200 then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  insert into public.tasks (
    workspace_id, account_id, deal_id, title, due_on, status, priority, kind, created_by
  )
  values (
    account.workspace_id, account.id, p_deal_id, title, p_due_on, 'todo', 'normal', 'task', p_actor_user_id
  )
  returning id into task_id;

  if p_assignee_ids is null or coalesce(array_length(p_assignee_ids, 1), 0) = 0 then
    insert into public.task_assignees (workspace_id, task_id, user_id, created_by)
    values (account.workspace_id, task_id, p_actor_user_id, p_actor_user_id);
  else
    foreach assignee in array p_assignee_ids loop
      perform private.require_active_member(account.workspace_id, assignee);
      insert into public.task_assignees (workspace_id, task_id, user_id, created_by)
      values (account.workspace_id, task_id, assignee, p_actor_user_id);
    end loop;
  end if;

  return task_id;
end;
$$;

create or replace function private.set_archived(
  p_actor_user_id uuid,
  p_entity text,
  p_id uuid,
  p_expected_version integer,
  p_archived boolean
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  updated_count integer;
  workspace_id uuid;
begin
  perform private.assert_server_role();
  if p_entity = 'account' then
    select account.workspace_id into workspace_id from public.accounts as account where account.id = p_id;
  elsif p_entity = 'deal' then
    select deal.workspace_id into workspace_id from public.deals as deal where deal.id = p_id;
  elsif p_entity = 'contact' then
    select contact.workspace_id into workspace_id from public.contacts as contact where contact.id = p_id;
  else
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  if workspace_id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_active_member(workspace_id, p_actor_user_id);

  if p_entity = 'account' then
    update public.accounts
    set archived_at = case when p_archived then pg_catalog.now() else null end,
        updated_by = p_actor_user_id
    where id = p_id and version = p_expected_version;
  elsif p_entity = 'deal' then
    update public.deals
    set archived_at = case when p_archived then pg_catalog.now() else null end,
        updated_by = p_actor_user_id
    where id = p_id and version = p_expected_version;
  else
    update public.contacts
    set archived_at = case when p_archived then pg_catalog.now() else null end,
        updated_by = p_actor_user_id
    where id = p_id and version = p_expected_version;
  end if;

  get diagnostics updated_count = row_count;
  if updated_count = 0 then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function private.merge_accounts(
  p_actor_user_id uuid,
  p_source_id uuid,
  p_target_id uuid,
  p_source_version integer,
  p_target_version integer,
  p_keep_display_from text,
  p_keep_company_from text,
  p_keep_kind_from text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  source public.accounts%rowtype;
  target public.accounts%rowtype;
  target_has_primary boolean;
begin
  perform private.assert_server_role();
  if p_source_id = p_target_id then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  if p_keep_display_from not in ('source', 'target')
    or p_keep_company_from not in ('source', 'target')
    or p_keep_kind_from not in ('source', 'target') then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  select * into source from public.accounts where id = p_source_id for update;
  select * into target from public.accounts where id = p_target_id for update;
  if source.id is null or target.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if source.workspace_id is distinct from target.workspace_id then
    raise exception 'cross_reference' using errcode = '23514';
  end if;
  perform private.require_active_member(target.workspace_id, p_actor_user_id);
  if source.version is distinct from p_source_version
    or target.version is distinct from p_target_version then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;

  select exists (
    select 1 from public.contacts as contact
    where contact.account_id = target.id
      and contact.is_primary
      and contact.archived_at is null
  ) into target_has_primary;

  if target_has_primary then
    update public.contacts
    set is_primary = false, updated_by = p_actor_user_id
    where account_id = source.id and is_primary;
  end if;

  update public.contacts
  set account_id = target.id, updated_by = p_actor_user_id
  where account_id = source.id;

  update public.deals
  set account_id = target.id, updated_by = p_actor_user_id
  where account_id = source.id;

  update public.deployments
  set account_id = target.id, updated_by = p_actor_user_id
  where account_id = source.id;

  update public.tasks
  set account_id = target.id, updated_by = p_actor_user_id
  where account_id = source.id;

  update public.activities
  set account_id = target.id
  where account_id = source.id;

  update public.notes
  set account_id = target.id, updated_by = p_actor_user_id
  where account_id = source.id;

  update public.meeting_links
  set account_id = target.id, updated_by = p_actor_user_id
  where account_id = source.id;

  update public.document_links
  set account_id = target.id, updated_by = p_actor_user_id
  where account_id = source.id;

  update public.billing_agreements
  set account_id = target.id, updated_by = p_actor_user_id
  where account_id = source.id;

  perform set_config('private.merge_accounts', 'on', true);
  update public.revenue_entries
  set account_id = target.id, updated_by = p_actor_user_id
  where account_id = source.id;
  perform set_config('private.merge_accounts', '', true);

  update private.external_lead_refs
  set account_id = target.id
  where account_id = source.id;

  update public.accounts
  set display_name = case
        when p_keep_display_from = 'source' then source.display_name
        else target.display_name
      end,
      company_name = case
        when p_keep_company_from = 'source' then source.company_name
        else target.company_name
      end,
      kind = case when p_keep_kind_from = 'source' then source.kind else target.kind end,
      relationship = case
        when exists (
          select 1 from public.deals as deal
          where deal.account_id = target.id
            and deal.stage = 'won'
            and deal.archived_at is null
        ) then 'client'
        else target.relationship
      end,
      updated_by = p_actor_user_id
  where id = target.id;

  update public.accounts
  set archived_at = pg_catalog.now(),
      updated_by = p_actor_user_id
  where id = source.id;

  perform private.record_domain_event(
    target.workspace_id,
    'account.merged',
    'account',
    target.id,
    jsonb_build_object('source_account_id', source.id, 'target_account_id', target.id),
    'merge:' || source.id::text || ':' || target.id::text
  );
end;
$$;

create or replace view public.lead_directory
with (security_invoker = true) as
select
  deal.id,
  deal.workspace_id,
  deal.account_id,
  deal.primary_contact_id,
  deal.title,
  deal.product_type,
  deal.stage,
  deal.owner_user_id,
  deal.setup_amount_gross_cents,
  deal.monthly_amount_gross_cents,
  deal.created_at,
  deal.version,
  deal.archived_at,
  account.display_name as account_name,
  account.company_name,
  account.kind as account_kind,
  account.relationship as account_relationship,
  account.archived_at as account_archived_at,
  contact.full_name as contact_name,
  contact.email as contact_email,
  contact.phone_e164 as contact_phone,
  owner_profile.full_name as owner_name,
  (
    select max(activity.occurred_at)
    from public.activities as activity
    where activity.deal_id = deal.id
  ) as last_contact_at,
  (
    select min(task.due_on)
    from public.tasks as task
    where task.deal_id = deal.id
      and task.kind = 'follow_up'
      and task.status in ('todo', 'in_progress')
      and task.archived_at is null
  ) as next_follow_up_on
from public.deals as deal
join public.accounts as account
  on account.id = deal.account_id
 and account.workspace_id = deal.workspace_id
left join public.contacts as contact
  on contact.id = deal.primary_contact_id
 and contact.workspace_id = deal.workspace_id
left join public.profiles as owner_profile
  on owner_profile.user_id = deal.owner_user_id
 and owner_profile.workspace_id = deal.workspace_id;

create or replace view public.client_directory
with (security_invoker = true) as
select
  account.id,
  account.workspace_id,
  account.display_name,
  account.company_name,
  account.kind,
  account.relationship,
  account.service_status,
  account.archived_at,
  account.version,
  (
    select contact.full_name
    from public.contacts as contact
    where contact.account_id = account.id
      and contact.archived_at is null
      and contact.is_primary
    order by contact.created_at
    limit 1
  ) as primary_contact_name,
  (
    select count(*)::integer
    from public.deployments as deployment
    where deployment.account_id = account.id
      and deployment.archived_at is null
      and deployment.status not in ('completed', 'cancelled')
  ) as open_deployment_count,
  (
    select count(*)::integer
    from public.billing_agreements as agreement
    where agreement.account_id = account.id
      and agreement.kind = 'subscription'
      and agreement.status = 'active'
  ) as active_subscription_count,
  (
    select string_agg(distinct deployment.product_type, ',' order by deployment.product_type)
    from public.deployments as deployment
    where deployment.account_id = account.id
      and deployment.archived_at is null
      and deployment.status not in ('completed', 'cancelled')
  ) as active_products,
  (
    select max(activity.occurred_at)
    from public.activities as activity
    where activity.account_id = account.id
  ) as last_activity_at,
  (
    select owner_profile.full_name
    from public.deals as deal
    join public.profiles as owner_profile
      on owner_profile.user_id = deal.owner_user_id
     and owner_profile.workspace_id = deal.workspace_id
    where deal.account_id = account.id
      and deal.archived_at is null
      and deal.owner_user_id is not null
    order by deal.created_at desc
    limit 1
  ) as owner_name
from public.accounts as account
where account.relationship = 'client';

grant select on public.lead_directory to authenticated, service_role;
grant select on public.client_directory to authenticated, service_role;
revoke all on public.lead_directory from anon, public;
revoke all on public.client_directory from anon, public;

alter publication supabase_realtime add table public.accounts;
alter publication supabase_realtime add table public.contacts;
alter publication supabase_realtime add table public.deals;
alter publication supabase_realtime add table public.deal_stage_history;
alter publication supabase_realtime add table public.activities;
alter publication supabase_realtime add table public.notes;
alter publication supabase_realtime add table public.tasks;

revoke all on function private.reject_revenue_mutation() from public, anon, authenticated;
revoke all on function private.blank_to_null(text) from public, anon, authenticated;
revoke all on function private.matching_contact_ids(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function private.prepare_contact_channels(text, text) from public, anon, authenticated;
grant execute on function private.reject_revenue_mutation() to service_role;
grant execute on function private.blank_to_null(text) to service_role;
grant execute on function private.matching_contact_ids(uuid, text, text, uuid) to service_role;
grant execute on function private.prepare_contact_channels(text, text) to service_role;
grant execute on function private.create_manual_lead(uuid, text, text, text, text, text, text, uuid, boolean) to service_role;
grant execute on function private.add_contact(uuid, uuid, text, text, text, text, boolean, boolean) to service_role;
grant execute on function private.add_deal(uuid, uuid, text, text, uuid, uuid) to service_role;
grant execute on function private.update_account(uuid, uuid, integer, text, text, text, text, text, text, text) to service_role;
grant execute on function private.update_contact(uuid, uuid, integer, text, text, text, text, boolean, boolean) to service_role;
grant execute on function private.update_deal(uuid, uuid, integer, text, text, uuid, text) to service_role;
grant execute on function private.assign_deal_owner(uuid, uuid, integer, uuid) to service_role;
grant execute on function private.change_deal_stage(uuid, uuid, integer, text, text) to service_role;
grant execute on function private.record_contact_outcome(uuid, uuid, text, text, date, text) to service_role;
grant execute on function private.add_note(uuid, uuid, uuid, text) to service_role;
grant execute on function private.add_task(uuid, uuid, uuid, text, date, uuid[]) to service_role;
grant execute on function private.set_archived(uuid, text, uuid, integer, boolean) to service_role;
grant execute on function private.merge_accounts(uuid, uuid, uuid, integer, integer, text, text, text) to service_role;
