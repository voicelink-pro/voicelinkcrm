-- Nazwa zmiennej zasłaniała kolumnę i blokowała zapis kontaktu.

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
  set full_name = update_contact.full_name,
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

