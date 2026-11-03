-- Odbiór etapu 7. Transakcja kończy się rollbackiem, seed zostaje.

begin;

do $$
<<stage7>>
declare
  anna uuid := '20000000-0000-4000-8000-000000000001';
  bartek uuid := '20000000-0000-4000-8000-000000000002';
  workspace uuid := '10000000-0000-4000-8000-000000000001';
  kawiarnia uuid := '30000000-0000-4000-8000-000000000001';
  kawiarnia_deal uuid := '30000000-0000-4000-8000-000000000003';
  gabinet_deal uuid := '40000000-0000-4000-8000-000000000003';
  window_start time := time '09:00';
  window_end time := time '15:00';
  expected date;
  result jsonb;
  task_id uuid;
  shared_id uuid;
  assignee_count integer;
  task_count integer;
  activity_count integer;
  owner uuid;
  assignee uuid;
  stored_due date;
  notifications_before integer;
  notifications_after integer;
  assigned_events integer;
  due_events integer;
  status_events integer;
  completed_events integer;
  task_version integer;
  overdue boolean;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('TimeZone', 'UTC', true);

  if private.follow_up_due_on(
    timestamp '2026-10-29 08:59:00' at time zone 'Europe/Warsaw', window_start, window_end
  ) is not null
    or private.follow_up_due_on(
      timestamp '2026-10-29 09:00:00' at time zone 'Europe/Warsaw', window_start, window_end
    ) is distinct from date '2026-10-29'
    or private.follow_up_due_on(
      timestamp '2026-10-29 14:59:00' at time zone 'Europe/Warsaw', window_start, window_end
    ) is distinct from date '2026-10-29'
    or private.follow_up_due_on(
      timestamp '2026-10-29 15:00:00' at time zone 'Europe/Warsaw', window_start, window_end
    ) is distinct from date '2026-10-29'
    or private.follow_up_due_on(
      timestamp '2026-10-29 15:00:01' at time zone 'Europe/Warsaw', window_start, window_end
    ) is distinct from date '2026-10-30'
    or private.follow_up_due_on(
      timestamp '2026-10-30 15:00:01' at time zone 'Europe/Warsaw', window_start, window_end
    ) is distinct from date '2026-11-02'
    or private.follow_up_due_on(
      timestamp '2026-10-31 12:00:00' at time zone 'Europe/Warsaw', window_start, window_end
    ) is not null
    or private.follow_up_due_on(
      timestamp '2026-11-01 10:00:00' at time zone 'Europe/Warsaw', window_start, window_end
    ) is not null
    or private.follow_up_due_on(
      timestamp '2026-10-29 10:00:00' at time zone 'Europe/Warsaw', null, null
    ) is not null
    or private.follow_up_due_on(
      timestamp '2026-10-29 15:30:00' at time zone 'Europe/Warsaw', time '09:00', time '16:00'
    ) is distinct from date '2026-10-29' then
    raise exception 'calendar_mismatch';
  end if;

  if private.resolve_follow_up_due_on(
    workspace,
    timestamp '2026-10-30 16:00:00' at time zone 'Europe/Warsaw'
  ) is distinct from date '2026-11-02' then
    raise exception 'stored_window_mismatch';
  end if;

  select count(*) into notifications_before from public.notifications;

  update public.deals
  set owner_user_id = anna
  where id = kawiarnia_deal;

  expected := private.follow_up_due_on(pg_catalog.clock_timestamp(), window_start, window_end);
  if expected is null then
    result := private.record_follow_up(bartek, kawiarnia_deal, date '2026-11-06', 'policy-or-explicit');
    if (result ->> 'due_on')::date is distinct from date '2026-11-06' then
      raise exception 'explicit_date_ignored';
    end if;
  else
    result := private.record_follow_up(bartek, kawiarnia_deal, date '2099-01-01', 'policy-or-explicit');
    if (result ->> 'due_on')::date is distinct from expected then
      raise exception 'policy_date_mismatch % %', result ->> 'due_on', expected;
    end if;
  end if;

  task_id := (result ->> 'task_id')::uuid;
  select count(*)
    into assignee_count
  from public.task_assignees
  where task_assignees.task_id = stage7.task_id;
  select user_id
    into assignee
  from public.task_assignees
  where task_assignees.task_id = stage7.task_id;
  select owner_user_id into owner from public.deals where id = kawiarnia_deal;
  if assignee_count <> 1 or assignee is distinct from bartek or owner is distinct from anna then
    raise exception 'actor_assignment % % %', assignee_count, assignee, owner;
  end if;
  if (select kind from public.tasks where id = task_id) <> 'follow_up'
    or (select origin_activity_id from public.tasks where id = task_id) is null
    or (select due_at from public.tasks where id = task_id) is not null then
    raise exception 'follow_up_shape';
  end if;

  if (private.record_follow_up(
    bartek, kawiarnia_deal, date '2099-02-01', 'policy-or-explicit'
  ) ->> 'status') <> 'existing' then
    raise exception 'double_click';
  end if;

  select count(*) into activity_count
  from public.activities
  where action_key = 'policy-or-explicit';
  select count(*) into task_count
  from public.tasks
  where origin_activity_id = (result ->> 'activity_id')::uuid;
  if activity_count <> 1 or task_count <> 1 then
    raise exception 'duplicate_follow_up % %', activity_count, task_count;
  end if;

  select due_on into stored_due from public.tasks where id = task_id;
  if expected is null then
    result := private.record_follow_up(bartek, kawiarnia_deal, date '2026-11-07', 'policy-second');
  else
    result := private.record_follow_up(bartek, kawiarnia_deal, null, 'policy-second');
  end if;
  if result ->> 'status' <> 'created' then
    raise exception 'second_attempt';
  end if;
  if (select due_on from public.tasks where id = task_id) is distinct from stored_due then
    raise exception 'replay_changed_date';
  end if;

  select public.tasks.version into task_version from public.tasks where id = task_id;
  perform private.save_task(
    bartek, task_id, task_version, 'Ponowny kontakt', null, date '2026-11-12', null,
    'normal', 'todo', kawiarnia, kawiarnia_deal, null, array[bartek]
  );
  if (select due_on from public.tasks where id = task_id) is distinct from date '2026-11-12'
    or (select kind from public.tasks where id = task_id) <> 'follow_up' then
    raise exception 'follow_up_date_edit';
  end if;

  select count(*) into due_events
  from private.domain_events
  where event_type = 'task.due_changed'
    and aggregate_id = task_id;
  if due_events <> 1 then
    raise exception 'due_event %', due_events;
  end if;

  shared_id := private.save_task(
    anna, null, null, 'Wspólne zadanie', 'Opis', private.warsaw_today() - 1, null,
    'high', 'todo', null, null, null, array[anna, bartek]
  );
  select count(*) into task_count from public.tasks where id = shared_id;
  select count(*) into assignee_count from public.task_assignees where task_assignees.task_id = stage7.shared_id;
  if task_count <> 1 or assignee_count <> 2
    or (select account_id from public.tasks where id = shared_id) is not null then
    raise exception 'shared_task % %', task_count, assignee_count;
  end if;

  select count(*) into assigned_events
  from private.domain_events
  where event_type = 'task.assigned'
    and aggregate_id = shared_id;
  if assigned_events <> 2 then
    raise exception 'assign_events %', assigned_events;
  end if;

  select public.tasks.version into task_version from public.tasks where id = shared_id;
  perform private.save_task(
    anna, shared_id, task_version, 'Wspólne zadanie', 'Opis', private.warsaw_today() - 1, time '10:30',
    'high', 'in_progress', null, null, null, array[anna, bartek]
  );
  select count(*) into status_events
  from private.domain_events
  where event_type = 'task.status_changed'
    and aggregate_id = shared_id;
  if status_events <> 1
    or (select (due_at at time zone 'Europe/Warsaw')::date from public.tasks where id = shared_id)
      is distinct from private.warsaw_today() - 1 then
    raise exception 'status_or_clock';
  end if;

  select public.tasks.version into task_version from public.tasks where id = shared_id;
  perform private.complete_task(anna, shared_id, task_version);
  if (select status from public.tasks where id = shared_id) <> 'done'
    or (select completed_by from public.tasks where id = shared_id) is distinct from anna
    or (select count(*) from public.task_assignees where task_assignees.task_id = stage7.shared_id) <> 2 then
    raise exception 'shared_completion';
  end if;

  overdue := (select status from public.tasks where id = shared_id) in ('todo', 'in_progress')
    and (select due_on from public.tasks where id = shared_id) < private.warsaw_today();
  if overdue then
    raise exception 'done_is_overdue';
  end if;

  select count(*) into completed_events
  from private.domain_events
  where event_type = 'task.completed'
    and aggregate_id = shared_id;
  select public.tasks.version into task_version from public.tasks where id = shared_id;
  perform private.complete_task(anna, shared_id, task_version);
  if (
    select count(*)
    from private.domain_events
    where event_type = 'task.completed'
      and aggregate_id = shared_id
  ) <> completed_events then
    raise exception 'second_completion_event';
  end if;

  begin
    perform private.save_task(
      anna, null, null, 'Zły związek', null, null, null,
      'normal', 'todo', kawiarnia, gabinet_deal, null, array[anna]
    );
    raise exception 'cross_should_fail';
  exception
    when others then
      if sqlerrm <> 'cross_reference' then
        raise;
      end if;
  end;

  begin
    update public.automation_settings
    set no_answer_window_start = null,
        no_answer_window_end = null
    where workspace_id = workspace;
    perform private.record_follow_up(bartek, kawiarnia_deal, null, 'needs-date');
    raise exception 'date_should_be_required';
  exception
    when others then
      if sqlerrm <> 'follow_up_date_required' then
        raise;
      end if;
  end;

  update public.automation_settings
  set no_answer_window_start = null,
      no_answer_window_end = null
  where workspace_id = workspace;
  result := private.record_follow_up(bartek, kawiarnia_deal, date '2026-11-05', 'explicit-only');
  if (result ->> 'due_on')::date is distinct from date '2026-11-05' then
    raise exception 'manual_date';
  end if;

  select count(*) into notifications_after from public.notifications;
  if notifications_after <> notifications_before then
    raise exception 'notification_written';
  end if;
end;
$$;

rollback;
