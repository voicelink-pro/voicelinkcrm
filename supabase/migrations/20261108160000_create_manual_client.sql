-- Ręczne dodanie klienta (i wdrożenia) z listy, bez przechodzenia przez leada.

create or replace function private.create_manual_client(
  p_actor_user_id uuid,
  p_display_name text,
  p_company_name text,
  p_full_name text,
  p_email text,
  p_phone text,
  p_nip text,
  p_implementation_stage text,
  p_implementation_due_on date,
  p_integration_systems text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  workspace_id uuid;
  display_name text;
  company_name text;
  contact_name text;
  nip text;
  systems text;
  stage text;
  channels record;
  account_id uuid;
  account_kind text;
begin
  perform private.assert_server_role();

  display_name := private.blank_to_null(p_display_name);
  company_name := private.blank_to_null(p_company_name);
  contact_name := coalesce(private.blank_to_null(p_full_name), display_name);
  nip := private.blank_to_null(p_nip);
  systems := private.blank_to_null(p_integration_systems);
  stage := coalesce(private.blank_to_null(p_implementation_stage), 'in_progress');

  if display_name is null or pg_catalog.char_length(display_name) > 200
    or contact_name is null or pg_catalog.char_length(contact_name) > 200
    or (company_name is not null and pg_catalog.char_length(company_name) > 200)
    or (nip is not null and pg_catalog.char_length(nip) > 20)
    or (systems is not null and pg_catalog.char_length(systems) > 2000)
    or stage not in (
      'todo', 'in_progress', 'waiting_for_client', 'testing', 'launched', 'completed', 'paused'
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
  select * into channels from private.prepare_contact_channels(p_email, p_phone);

  account_kind := case when company_name is null then 'person' else 'company' end;

  insert into public.accounts (
    workspace_id, kind, relationship, display_name, company_name, nip,
    service_status, implementation_stage, implementation_due_on, integration_systems, created_by
  )
  values (
    workspace_id, account_kind, 'client', display_name, company_name, nip,
    'active', stage, p_implementation_due_on, systems, p_actor_user_id
  )
  returning id into account_id;

  insert into public.contacts (
    workspace_id, account_id, full_name, email, email_normalized,
    phone_raw, phone_e164, is_primary, created_by
  )
  values (
    workspace_id, account_id, contact_name, channels.email_norm, channels.email_norm,
    channels.phone_raw, channels.phone_norm, true, p_actor_user_id
  );

  insert into public.activities (
    workspace_id, account_id, activity_type, actor_type, actor_user_id, payload, created_by
  )
  values (
    workspace_id, account_id, 'client_created', 'user', p_actor_user_id,
    jsonb_build_object('account_id', account_id, 'display_name', display_name),
    p_actor_user_id
  );

  return account_id;
end;
$$;

revoke all on function private.create_manual_client(uuid, text, text, text, text, text, text, text, date, text) from public, anon, authenticated;
grant execute on function private.create_manual_client(uuid, text, text, text, text, text, text, text, date, text) to service_role;

notify pgrst, 'reload schema';
