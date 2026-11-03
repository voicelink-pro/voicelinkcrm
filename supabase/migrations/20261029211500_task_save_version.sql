-- Zmienna wersji nie może nazywać się jak kolumna tasks.version.

create or replace function private.save_task(
  p_actor_user_id uuid,
  p_task_id uuid,
  p_expected_version integer,
  p_title text,
  p_description text,
  p_due_on date,
  p_due_time time,
  p_priority text,
  p_status text,
  p_account_id uuid,
  p_deal_id uuid,
  p_deployment_id uuid,
  p_assignee_ids uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
<<task_save>>
declare
  actor uuid := p_actor_user_id;
  existing public.tasks%rowtype;
  workspace uuid;
  account_id uuid;
  deal_id uuid;
  deployment_id uuid;
  linked_workspace uuid;
  linked_account uuid;
  linked_deal uuid;
  title text;
  description text;
  due_at timestamptz;
  priority text;
  status text;
  assignee_ids uuid[] := '{}';
  assignee uuid;
  task_id uuid;
  previous_status text;
  previous_due date;
  previous_at timestamptz;
  completed_at timestamptz;
  completed_by uuid;
  row_version integer;
begin
  perform private.assert_server_role();
  title := private.blank_to_null(p_title);
  description := private.blank_to_null(p_description);
  priority := pg_catalog.btrim(coalesce(p_priority, ''));
  status := pg_catalog.btrim(coalesce(p_status, ''));

  if title is null or pg_catalog.char_length(title) > 200
    or (description is not null and pg_catalog.char_length(description) > 20000)
    or priority not in ('low', 'normal', 'high')
    or status not in ('todo', 'in_progress', 'done', 'cancelled')
    or (p_due_time is not null and p_due_on is null) then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  if p_due_time is null then
    due_at := null;
  else
    due_at := (p_due_on + p_due_time) at time zone 'Europe/Warsaw';
  end if;

  if p_task_id is not null then
    select *
      into existing
    from public.tasks
    where id = p_task_id
    for update;

    if not found or existing.archived_at is not null then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if existing.version is distinct from p_expected_version then
      raise exception 'version_conflict' using errcode = 'P0001';
    end if;
    workspace := existing.workspace_id;
  end if;

  if p_account_id is not null then
    select account.workspace_id, account.id
      into linked_workspace, linked_account
    from public.accounts as account
    where account.id = p_account_id
      and account.archived_at is null;
    if not found then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if workspace is not null and linked_workspace is distinct from workspace then
      raise exception 'cross_reference' using errcode = '23514';
    end if;
    workspace := linked_workspace;
    account_id := linked_account;
  end if;

  if p_deal_id is not null then
    select deal.workspace_id, deal.account_id
      into linked_workspace, linked_account
    from public.deals as deal
    where deal.id = p_deal_id
      and deal.archived_at is null;
    if not found then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if workspace is not null and linked_workspace is distinct from workspace then
      raise exception 'cross_reference' using errcode = '23514';
    end if;
    if account_id is not null and linked_account is distinct from account_id then
      raise exception 'cross_reference' using errcode = '23514';
    end if;
    workspace := linked_workspace;
    account_id := linked_account;
    deal_id := p_deal_id;
  end if;

  if p_deployment_id is not null then
    select deployment.workspace_id, deployment.account_id, deployment.deal_id
      into linked_workspace, linked_account, linked_deal
    from public.deployments as deployment
    where deployment.id = p_deployment_id
      and deployment.archived_at is null;
    if not found then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if workspace is not null and linked_workspace is distinct from workspace then
      raise exception 'cross_reference' using errcode = '23514';
    end if;
    if account_id is not null and linked_account is distinct from account_id then
      raise exception 'cross_reference' using errcode = '23514';
    end if;
    if deal_id is not null and linked_deal is not null and linked_deal is distinct from deal_id then
      raise exception 'cross_reference' using errcode = '23514';
    end if;
    workspace := linked_workspace;
    account_id := linked_account;
    deployment_id := p_deployment_id;
  end if;

  if workspace is null then
    select member.workspace_id
      into workspace
    from public.workspace_members as member
    where member.user_id = actor
      and member.active
    order by member.workspace_id
    limit 1;
    if workspace is null then
      raise exception 'not_a_member' using errcode = '42501';
    end if;
  end if;

  perform private.require_active_member(workspace, actor);

  if p_assignee_ids is null or coalesce(pg_catalog.cardinality(p_assignee_ids), 0) = 0 then
    assignee_ids := array[actor];
  else
    foreach assignee in array p_assignee_ids loop
      if assignee is null or assignee = any (assignee_ids) then
        continue;
      end if;
      perform private.require_active_member(workspace, assignee);
      assignee_ids := assignee_ids || assignee;
    end loop;
    if coalesce(pg_catalog.cardinality(assignee_ids), 0) = 0 then
      assignee_ids := array[actor];
    end if;
  end if;

  if p_task_id is null then
    insert into public.tasks (
      workspace_id, account_id, deal_id, deployment_id, title, description,
      due_on, due_at, status, priority, kind,
      completed_at, completed_by, created_by
    )
    values (
      task_save.workspace, task_save.account_id, task_save.deal_id, task_save.deployment_id,
      task_save.title, task_save.description,
      p_due_on, task_save.due_at, task_save.status, task_save.priority, 'task',
      case when task_save.status = 'done' then pg_catalog.clock_timestamp() else null end,
      case when task_save.status = 'done' then task_save.actor else null end,
      task_save.actor
    )
    returning id, version into task_id, row_version;

    foreach assignee in array assignee_ids loop
      insert into public.task_assignees (workspace_id, task_id, user_id, created_by)
      values (task_save.workspace, task_save.task_id, task_save.assignee, task_save.actor);
      perform private.record_domain_event(
        workspace,
        'task.assigned',
        'task',
        task_id,
        jsonb_build_object(
          'task_id', task_id,
          'assignee_user_id', assignee,
          'actor_user_id', actor,
          'due_on', p_due_on,
          'kind', 'task'
        ),
        'task:assign:' || task_id::text || ':' || assignee::text || ':' || row_version::text
      );
    end loop;

    if status = 'done' then
      perform private.record_domain_event(
        workspace, 'task.completed', 'task', task_id,
        jsonb_build_object('task_id', task_id, 'actor_user_id', actor, 'status', status),
        'task:complete:' || task_id::text || ':' || row_version::text
      );
    end if;

    return task_id;
  end if;

  previous_status := existing.status;
  previous_due := existing.due_on;
  previous_at := existing.due_at;

  if status = 'done' and previous_status is distinct from 'done' then
    completed_at := pg_catalog.clock_timestamp();
    completed_by := actor;
  elsif status = 'done' then
    completed_at := existing.completed_at;
    completed_by := existing.completed_by;
  else
    completed_at := null;
    completed_by := null;
  end if;

  update public.tasks
  set account_id = task_save.account_id,
      deal_id = task_save.deal_id,
      deployment_id = task_save.deployment_id,
      title = task_save.title,
      description = task_save.description,
      due_on = p_due_on,
      due_at = task_save.due_at,
      status = task_save.status,
      priority = task_save.priority,
      completed_at = task_save.completed_at,
      completed_by = task_save.completed_by,
      updated_by = task_save.actor
  where id = existing.id
  returning id, version into task_id, row_version;

  delete from public.task_assignees as link
  where link.task_id = task_save.task_id
    and not (link.user_id = any (task_save.assignee_ids));

  foreach assignee in array assignee_ids loop
    if exists (
      select 1
      from public.task_assignees as link
      where link.task_id = task_save.task_id
        and link.user_id = task_save.assignee
    ) then
      continue;
    end if;
    insert into public.task_assignees (workspace_id, task_id, user_id, created_by)
    values (task_save.workspace, task_save.task_id, task_save.assignee, task_save.actor);
    perform private.record_domain_event(
      workspace,
      'task.assigned',
      'task',
      task_id,
      jsonb_build_object(
        'task_id', task_id,
        'assignee_user_id', assignee,
        'actor_user_id', actor,
        'due_on', p_due_on,
        'kind', existing.kind
      ),
      'task:assign:' || task_id::text || ':' || assignee::text || ':' || row_version::text
    );
  end loop;

  if p_due_on is distinct from previous_due or due_at is distinct from previous_at then
    perform private.record_domain_event(
      workspace, 'task.due_changed', 'task', task_id,
      jsonb_build_object(
        'task_id', task_id,
        'actor_user_id', actor,
        'due_on', p_due_on,
        'previous_due_on', previous_due
      ),
      'task:due:' || task_id::text || ':' || row_version::text
    );
  end if;

  if status is distinct from previous_status and status = 'done' then
    perform private.record_domain_event(
      workspace, 'task.completed', 'task', task_id,
      jsonb_build_object('task_id', task_id, 'actor_user_id', actor, 'status', status),
      'task:complete:' || task_id::text || ':' || row_version::text
    );
  elsif status is distinct from previous_status then
    perform private.record_domain_event(
      workspace, 'task.status_changed', 'task', task_id,
      jsonb_build_object(
        'task_id', task_id,
        'actor_user_id', actor,
        'status', status,
        'previous_status', previous_status
      ),
      'task:status:' || task_id::text || ':' || row_version::text
    );
  end if;

  return task_id;
end;
$$;

create or replace function private.complete_task(
  p_actor_user_id uuid,
  p_task_id uuid,
  p_expected_version integer
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing public.tasks%rowtype;
  task_id uuid;
  row_version integer;
begin
  perform private.assert_server_role();
  select *
    into existing
  from public.tasks
  where id = p_task_id
  for update;

  if not found or existing.archived_at is not null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_active_member(existing.workspace_id, p_actor_user_id);
  if existing.version is distinct from p_expected_version then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;
  if existing.status = 'done' then
    return existing.id;
  end if;

  update public.tasks
  set status = 'done',
      completed_at = pg_catalog.clock_timestamp(),
      completed_by = p_actor_user_id,
      updated_by = p_actor_user_id
  where id = existing.id
  returning id, version into task_id, row_version;

  perform private.record_domain_event(
    existing.workspace_id,
    'task.completed',
    'task',
    task_id,
    jsonb_build_object(
      'task_id', task_id,
      'actor_user_id', p_actor_user_id,
      'status', 'done'
    ),
    'task:complete:' || task_id::text || ':' || row_version::text
  );

  return task_id;
end;
$$;
