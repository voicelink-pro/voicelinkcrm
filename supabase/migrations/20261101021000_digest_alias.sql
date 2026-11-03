-- event_key kolidował z kolumną w ON CONFLICT. Ta funkcja jest tą z poprzedniej migracji.

create or replace function private.build_morning_digest(p_job_id uuid, p_at timestamptz)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  job private.job_queue%rowtype;
  task_user uuid;
  local_day date;
  digest_hour integer;
  task_count integer;
  enabled boolean;
  digest_key text;
  notice_id uuid;
  late boolean;
  notice_title text;
begin
  perform private.assert_server_role();

  select *
    into job
  from private.job_queue
  where id = p_job_id;

  if not found or job.job_type <> 'morning_digest' then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  task_user := (job.payload->>'user_id')::uuid;
  local_day := (job.payload->>'local_date')::date;
  digest_hour := coalesce((job.payload->>'digest_hour')::integer, 8);

  select preference.morning_digest_enabled
    into enabled
  from public.notification_preferences as preference
  where preference.workspace_id = job.workspace_id
    and preference.user_id = task_user;

  if found and enabled is false then
    return jsonb_build_object('created', false, 'reason', 'preference');
  end if;

  select count(distinct task.id)
    into task_count
  from public.tasks as task
  join public.task_assignees as assignee
    on assignee.task_id = task.id
   and assignee.user_id = task_user
  where task.workspace_id = job.workspace_id
    and task.archived_at is null
    and task.status in ('todo', 'in_progress')
    and task.due_on = local_day;

  if task_count = 0 then
    return jsonb_build_object('created', false, 'reason', 'empty');
  end if;

  digest_key := job.dedupe_key;
  notice_title := private.digest_title(task_count);
  late := private.digest_is_late(p_at, digest_hour);

  insert into public.notifications (
    workspace_id, recipient_user_id, kind, title, body, target_path, event_key
  )
  values (
    job.workspace_id,
    task_user,
    'morning_digest',
    notice_title,
    case
      when late then 'Podsumowanie powstało po planowanej godzinie 08:00. Dostarczenie na telefon zależy od systemu i zgody.'
      else 'Dostarczenie na telefon zależy od systemu i zgody. Zapis w aplikacji jest trwały.'
    end,
    '/tasks?view=today&assignee=me',
    digest_key
  )
  on conflict (recipient_user_id, event_key) do nothing
  returning id into notice_id;

  if notice_id is null then
    select existing.id
      into notice_id
    from public.notifications as existing
    where existing.recipient_user_id = task_user
      and existing.event_key = digest_key;
  end if;

  perform private.record_domain_event(
    job.workspace_id,
    'task.morning_digest',
    'user',
    task_user,
    jsonb_build_object('count', task_count, 'local_date', local_day, 'late', late),
    digest_key
  );

  insert into private.job_queue (workspace_id, job_type, payload, dedupe_key)
  select
    job.workspace_id,
    'push_send',
    jsonb_build_object(
      'notification_id', notice_id,
      'subscription_id', subscription.id
    ),
    'push:' || notice_id::text || ':' || subscription.id::text
  from public.push_subscriptions as subscription
  where subscription.workspace_id = job.workspace_id
    and subscription.user_id = task_user
    and subscription.active
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  insert into private.push_deliveries (notification_id, subscription_id, status)
  select notice_id, subscription.id, 'pending'
  from public.push_subscriptions as subscription
  where subscription.workspace_id = job.workspace_id
    and subscription.user_id = task_user
    and subscription.active
  on conflict (notification_id, subscription_id) do nothing;

  return jsonb_build_object(
    'created', true,
    'notification_id', notice_id,
    'count', task_count,
    'title', notice_title,
    'late', late
  );
end;
$$;
