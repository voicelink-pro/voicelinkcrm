-- Naprawa aktualizacji źródeł i wydarzeń kalendarza:
-- private.touch_row() oczekiwał kolumny version, której tabele calendar_sources i calendar_events nie miały,
-- przez co każdy UPDATE (zapis last_synced_at, last_error oraz ponowny upsert wydarzeń) kończył się błędem.

alter table public.calendar_sources
  add column if not exists version integer not null default 1 check (version > 0);

alter table public.calendar_events
  add column if not exists version integer not null default 1 check (version > 0);

-- Naprawa niejednoznacznej nazwy zmiennej w private.update_deal oraz private.update_contact.
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
  next_title text;
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

  next_title := private.blank_to_null(p_title);
  if next_title is null or pg_catalog.char_length(next_title) > 200 then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  if p_product_type is not null and p_product_type not in (
    'voice_assistant', 'website', 'digital_infrastructure'
  ) then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  update public.deals
  set title = next_title,
      product_type = p_product_type,
      primary_contact_id = p_primary_contact_id,
      description = private.blank_to_null(p_description),
      updated_by = p_actor_user_id
  where id = deal.id;
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
  next_full_name text;
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

  next_full_name := private.blank_to_null(p_full_name);
  if next_full_name is null or pg_catalog.char_length(next_full_name) > 200 then
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
  set full_name = next_full_name,
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

notify pgrst, 'reload schema';
