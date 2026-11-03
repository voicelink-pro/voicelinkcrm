-- Etap 6. Zapis wdrożenia nie dotyka ewidencji przychodu.

create or replace function private.create_deployment(
  p_actor_user_id uuid,
  p_account_id uuid,
  p_deal_id uuid,
  p_product_type text,
  p_name text,
  p_description text,
  p_owner_display_name text,
  p_value_gross_cents bigint,
  p_start_on date,
  p_due_on date
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  account public.accounts%rowtype;
  deal public.deals%rowtype;
  deployment_name text;
  owner_name text;
  deployment_id uuid;
begin
  perform private.assert_server_role();
  select * into account from public.accounts where id = p_account_id for update;
  if not found or account.archived_at is not null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_active_member(account.workspace_id, p_actor_user_id);

  deployment_name := private.blank_to_null(p_name);
  owner_name := private.blank_to_null(p_owner_display_name);
  if deployment_name is null or pg_catalog.char_length(deployment_name) > 200
    or owner_name is null or pg_catalog.char_length(owner_name) > 200
    or p_product_type not in ('voice_assistant', 'website', 'digital_infrastructure')
    or (p_description is not null and pg_catalog.char_length(p_description) > 20000)
    or (
      p_value_gross_cents is not null
      and p_value_gross_cents not between 0 and 9007199254740991
    ) then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  if p_deal_id is not null then
    select * into deal
    from public.deals
    where id = p_deal_id
      and workspace_id = account.workspace_id;
    if not found or deal.archived_at is not null then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if deal.account_id is distinct from account.id then
      raise exception 'cross_reference' using errcode = '23514';
    end if;
    if deal.stage <> 'won' then
      raise exception 'invalid_state' using errcode = 'P0001';
    end if;
  end if;

  insert into public.deployments (
    workspace_id, account_id, deal_id, product_type, name, description, status,
    owner_display_name, value_gross_cents, start_on, due_on, created_by
  )
  values (
    account.workspace_id, account.id, p_deal_id, p_product_type, deployment_name,
    private.blank_to_null(p_description), 'todo', owner_name, p_value_gross_cents,
    p_start_on, p_due_on, p_actor_user_id
  )
  returning id into deployment_id;

  insert into public.deployment_status_history (
    workspace_id, deployment_id, from_status, to_status, actor_user_id, created_by
  )
  values (account.workspace_id, deployment_id, null, 'todo', p_actor_user_id, p_actor_user_id);

  perform private.record_domain_event(
    account.workspace_id,
    'deployment.created',
    'deployment',
    deployment_id,
    jsonb_build_object(
      'deployment_id', deployment_id,
      'account_id', account.id,
      'deal_id', p_deal_id,
      'status', 'todo'
    ),
    'deployment:create:' || deployment_id::text
  );

  return deployment_id;
end;
$$;

create or replace function private.update_deployment(
  p_actor_user_id uuid,
  p_deployment_id uuid,
  p_expected_version integer,
  p_account_id uuid,
  p_deal_id uuid,
  p_product_type text,
  p_name text,
  p_description text,
  p_owner_display_name text,
  p_value_gross_cents bigint,
  p_start_on date,
  p_due_on date
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  deployment public.deployments%rowtype;
  account public.accounts%rowtype;
  deal public.deals%rowtype;
  deployment_name text;
  owner_name text;
begin
  perform private.assert_server_role();
  select * into deployment from public.deployments where id = p_deployment_id for update;
  if not found or deployment.archived_at is not null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_active_member(deployment.workspace_id, p_actor_user_id);
  if deployment.version is distinct from p_expected_version then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;

  select * into account
  from public.accounts
  where id = p_account_id
    and workspace_id = deployment.workspace_id;
  if not found or account.archived_at is not null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  deployment_name := private.blank_to_null(p_name);
  owner_name := private.blank_to_null(p_owner_display_name);
  if deployment_name is null or pg_catalog.char_length(deployment_name) > 200
    or owner_name is null or pg_catalog.char_length(owner_name) > 200
    or p_product_type not in ('voice_assistant', 'website', 'digital_infrastructure')
    or (p_description is not null and pg_catalog.char_length(p_description) > 20000)
    or (
      p_value_gross_cents is not null
      and p_value_gross_cents not between 0 and 9007199254740991
    ) then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  if p_deal_id is not null then
    select * into deal
    from public.deals
    where id = p_deal_id
      and workspace_id = deployment.workspace_id;
    if not found or deal.archived_at is not null then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if deal.account_id is distinct from account.id then
      raise exception 'cross_reference' using errcode = '23514';
    end if;
    if deal.stage <> 'won' then
      raise exception 'invalid_state' using errcode = 'P0001';
    end if;
  end if;

  update public.deployments
  set account_id = account.id,
      deal_id = p_deal_id,
      product_type = p_product_type,
      name = deployment_name,
      description = private.blank_to_null(p_description),
      owner_display_name = owner_name,
      value_gross_cents = p_value_gross_cents,
      start_on = p_start_on,
      due_on = p_due_on,
      updated_by = p_actor_user_id
  where id = deployment.id;

  perform private.record_domain_event(
    deployment.workspace_id,
    'deployment.updated',
    'deployment',
    deployment.id,
    jsonb_build_object('deployment_id', deployment.id, 'account_id', account.id, 'deal_id', p_deal_id),
    'deployment:update:' || deployment.id::text || ':' || (deployment.version + 1)::text
  );
end;
$$;

create or replace function private.change_deployment_status(
  p_actor_user_id uuid,
  p_deployment_id uuid,
  p_expected_version integer,
  p_status text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  deployment public.deployments%rowtype;
begin
  perform private.assert_server_role();
  select * into deployment from public.deployments where id = p_deployment_id for update;
  if not found or deployment.archived_at is not null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_active_member(deployment.workspace_id, p_actor_user_id);
  if deployment.version is distinct from p_expected_version then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;
  if p_status is null or p_status not in (
    'todo', 'in_progress', 'waiting_for_client', 'testing', 'launched',
    'completed', 'paused', 'cancelled'
  ) or p_status = deployment.status then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  update public.deployments
  set status = p_status,
      completed_at = case when p_status = 'completed' then pg_catalog.now() else null end,
      updated_by = p_actor_user_id
  where id = deployment.id;

  insert into public.deployment_status_history (
    workspace_id, deployment_id, from_status, to_status, actor_user_id, created_by
  )
  values (
    deployment.workspace_id, deployment.id, deployment.status, p_status,
    p_actor_user_id, p_actor_user_id
  );

  perform private.record_domain_event(
    deployment.workspace_id,
    'deployment.status_changed',
    'deployment',
    deployment.id,
    jsonb_build_object(
      'deployment_id', deployment.id,
      'from_status', deployment.status,
      'to_status', p_status
    ),
    'deployment:status:' || deployment.id::text || ':' || (deployment.version + 1)::text
  );
end;
$$;

create or replace function private.add_checklist_item(
  p_actor_user_id uuid,
  p_deployment_id uuid,
  p_title text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  deployment public.deployments%rowtype;
  item_title text;
  item_id uuid;
  next_sort integer;
begin
  perform private.assert_server_role();
  select * into deployment from public.deployments where id = p_deployment_id for update;
  if not found or deployment.archived_at is not null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_active_member(deployment.workspace_id, p_actor_user_id);
  item_title := private.blank_to_null(p_title);
  if item_title is null or pg_catalog.char_length(item_title) > 200 then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  select coalesce(max(item.sort_order), -1) + 1
    into next_sort
  from public.deployment_checklist_items as item
  where item.deployment_id = deployment.id;

  insert into public.deployment_checklist_items (
    workspace_id, deployment_id, title, sort_order, created_by
  )
  values (deployment.workspace_id, deployment.id, item_title, next_sort, p_actor_user_id)
  returning id into item_id;

  return item_id;
end;
$$;

create or replace function private.set_checklist_item(
  p_actor_user_id uuid,
  p_item_id uuid,
  p_expected_version integer,
  p_is_done boolean
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item public.deployment_checklist_items%rowtype;
  updated_count integer;
begin
  perform private.assert_server_role();
  select * into item from public.deployment_checklist_items where id = p_item_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_active_member(item.workspace_id, p_actor_user_id);
  if p_is_done is null then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  update public.deployment_checklist_items
  set is_done = p_is_done,
      updated_by = p_actor_user_id
  where id = item.id
    and version = p_expected_version;

  get diagnostics updated_count = row_count;
  if updated_count = 0 then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function private.remove_checklist_item(
  p_actor_user_id uuid,
  p_item_id uuid,
  p_expected_version integer
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item public.deployment_checklist_items%rowtype;
  updated_count integer;
begin
  perform private.assert_server_role();
  select * into item from public.deployment_checklist_items where id = p_item_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_active_member(item.workspace_id, p_actor_user_id);

  delete from public.deployment_checklist_items
  where id = item.id
    and version = p_expected_version;

  get diagnostics updated_count = row_count;
  if updated_count = 0 then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function private.add_deployment_task(
  p_actor_user_id uuid,
  p_deployment_id uuid,
  p_title text,
  p_due_on date
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  deployment public.deployments%rowtype;
  title text;
  task_id uuid;
begin
  perform private.assert_server_role();
  select * into deployment from public.deployments where id = p_deployment_id;
  if not found or deployment.archived_at is not null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_active_member(deployment.workspace_id, p_actor_user_id);
  title := private.blank_to_null(p_title);
  if title is null or pg_catalog.char_length(title) > 200 then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  insert into public.tasks (
    workspace_id, account_id, deal_id, deployment_id, title, due_on,
    status, priority, kind, created_by
  )
  values (
    deployment.workspace_id, deployment.account_id, deployment.deal_id, deployment.id,
    title, p_due_on, 'todo', 'normal', 'task', p_actor_user_id
  )
  returning id into task_id;

  insert into public.task_assignees (workspace_id, task_id, user_id, created_by)
  values (deployment.workspace_id, task_id, p_actor_user_id, p_actor_user_id);

  return task_id;
end;
$$;

revoke all on function private.create_deployment(uuid, uuid, uuid, text, text, text, text, bigint, date, date) from public, anon, authenticated;
revoke all on function private.update_deployment(uuid, uuid, integer, uuid, uuid, text, text, text, text, bigint, date, date) from public, anon, authenticated;
revoke all on function private.change_deployment_status(uuid, uuid, integer, text) from public, anon, authenticated;
revoke all on function private.add_checklist_item(uuid, uuid, text) from public, anon, authenticated;
revoke all on function private.set_checklist_item(uuid, uuid, integer, boolean) from public, anon, authenticated;
revoke all on function private.remove_checklist_item(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function private.add_deployment_task(uuid, uuid, text, date) from public, anon, authenticated;

grant execute on function private.create_deployment(uuid, uuid, uuid, text, text, text, text, bigint, date, date) to service_role;
grant execute on function private.update_deployment(uuid, uuid, integer, uuid, uuid, text, text, text, text, bigint, date, date) to service_role;
grant execute on function private.change_deployment_status(uuid, uuid, integer, text) to service_role;
grant execute on function private.add_checklist_item(uuid, uuid, text) to service_role;
grant execute on function private.set_checklist_item(uuid, uuid, integer, boolean) to service_role;
grant execute on function private.remove_checklist_item(uuid, uuid, integer) to service_role;
grant execute on function private.add_deployment_task(uuid, uuid, text, date) to service_role;

alter publication supabase_realtime add table public.deployments;
alter publication supabase_realtime add table public.deployment_checklist_items;
alter publication supabase_realtime add table public.deployment_status_history;
