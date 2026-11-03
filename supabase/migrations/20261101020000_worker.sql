-- Kolejka, poranny digest i subskrypcje urządzeń.
-- Wysyłka zmian statusu, przypisań, przypomnień godzinowych i zaległych zadań
-- zostaje wyłączona: reguła D1 nie jest zatwierdzona.

alter table public.push_subscriptions
  add column active boolean not null default true,
  add column device_label text;

alter table private.push_deliveries
  add column attempts integer not null default 0;

create unique index push_deliveries_once_idx
  on private.push_deliveries (notification_id, subscription_id);

create table private.worker_ticks (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'ok', 'error')),
  claimed integer not null default 0,
  detail text
);

create index worker_ticks_started_idx
  on private.worker_ticks (started_at desc);

create or replace function private.warsaw_local(p_at timestamptz)
returns timestamp
language sql
stable
set search_path = ''
as $$
  select p_at at time zone 'Europe/Warsaw'
$$;

create or replace function private.digest_is_due(p_at timestamptz, p_hour integer)
returns boolean
language sql
stable
set search_path = ''
as $$
  select extract(hour from private.warsaw_local(p_at))::integer >= p_hour
    and p_hour between 0 and 23
$$;

create or replace function private.digest_is_late(p_at timestamptz, p_hour integer)
returns boolean
language sql
stable
set search_path = ''
as $$
  select private.warsaw_local(p_at)::time > make_time(p_hour, 15, 0)
$$;

create or replace function private.digest_title(p_count integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_count = 1 then 'Masz 1 zadanie na dziś'
    when p_count % 10 between 2 and 4
      and p_count % 100 not between 12 and 14
      then 'Masz ' || p_count::text || ' zadania na dziś'
    else 'Masz ' || p_count::text || ' zadań na dziś'
  end
$$;

create or replace function private.release_expired_jobs()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  released integer;
begin
  perform private.assert_server_role();

  update private.job_queue as job
  set status = case when job.attempts >= 5 then 'dead' else 'pending' end,
      run_after = case
        when job.attempts >= 5 then job.run_after
        else pg_catalog.now() + least(
          interval '15 minutes',
          (power(2, job.attempts) * interval '10 seconds') * (0.8 + random() * 0.4)
        )
      end,
      locked_until = null,
      updated_at = pg_catalog.now()
  where job.status = 'running'
    and job.locked_until is not null
    and job.locked_until < pg_catalog.now();

  get diagnostics released = row_count;
  return released;
end;
$$;

create or replace function private.enqueue_worker_jobs(p_at timestamptz)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  settings public.automation_settings%rowtype;
  member record;
  account_row record;
  connection record;
  local_day date;
  digest_count integer := 0;
  revenue_count integer := 0;
  fathom_count integer := 0;
  bucket timestamptz;
begin
  perform private.assert_server_role();
  perform private.release_expired_jobs();

  for settings in
    select * from public.automation_settings
  loop
    local_day := private.warsaw_local(p_at)::date;

    if private.digest_is_due(p_at, settings.digest_hour) then
      for member in
        select workspace_member.user_id
        from public.workspace_members as workspace_member
        where workspace_member.workspace_id = settings.workspace_id
          and workspace_member.active
      loop
        insert into private.job_queue (workspace_id, job_type, payload, dedupe_key)
        values (
          settings.workspace_id,
          'morning_digest',
          jsonb_build_object(
            'user_id', member.user_id,
            'local_date', local_day,
            'digest_hour', settings.digest_hour
          ),
          'morning-digest:' || settings.workspace_id::text || ':' || member.user_id::text || ':' || local_day::text
        )
        on conflict (dedupe_key) where dedupe_key is not null do nothing;

        if found then
          digest_count := digest_count + 1;
        end if;
      end loop;
    end if;

    for account_row in
      select distinct agreement.account_id
      from public.billing_agreements as agreement
      where agreement.workspace_id = settings.workspace_id
        and agreement.status <> 'void'
    loop
      insert into private.job_queue (workspace_id, job_type, payload, dedupe_key)
      values (
        settings.workspace_id,
        'revenue_catch_up',
        jsonb_build_object('account_id', account_row.account_id, 'local_date', local_day),
        'revenue:' || account_row.account_id::text || ':' || local_day::text
      )
      on conflict (dedupe_key) where dedupe_key is not null do nothing;

      if found then
        revenue_count := revenue_count + 1;
      end if;
    end loop;

    bucket := date_bin(
      make_interval(mins => settings.fathom_poll_interval_minutes),
      p_at,
      timestamptz '2020-01-01+00'
    );

    for connection in
      select integration.id
      from private.integration_connections as integration
      where integration.workspace_id = settings.workspace_id
        and integration.provider = 'fathom'
        and integration.enabled
        and integration.status = 'active'
    loop
      insert into private.job_queue (workspace_id, job_type, payload, dedupe_key)
      values (
        settings.workspace_id,
        'fathom_poll',
        jsonb_build_object('connection_id', connection.id),
        'fathom:' || connection.id::text || ':' || to_char(bucket at time zone 'UTC', 'YYYYMMDDHH24MISS')
      )
      on conflict (dedupe_key) where dedupe_key is not null do nothing;

      if found then
        fathom_count := fathom_count + 1;
      end if;
    end loop;
  end loop;

  return jsonb_build_object(
    'local_date', local_day,
    'digest_jobs', digest_count,
    'revenue_jobs', revenue_count,
    'fathom_jobs', fathom_count
  );
end;
$$;

create or replace function private.claim_worker_jobs(
  p_limit integer,
  p_lease_seconds integer
)
returns setof private.job_queue
language plpgsql
security invoker
set search_path = ''
as $$
declare
  batch_size integer;
  lease_seconds integer;
begin
  perform private.assert_server_role();
  perform private.release_expired_jobs();

  batch_size := least(20, greatest(coalesce(p_limit, 10), 1));
  lease_seconds := least(300, greatest(coalesce(p_lease_seconds, 120), 30));

  return query
  with picked as (
    select job.id
    from private.job_queue as job
    where job.status = 'pending'
      and job.run_after <= pg_catalog.now()
    order by job.run_after, job.id
    for update skip locked
    limit batch_size
  )
  update private.job_queue as job
  set status = 'running',
      attempts = job.attempts + 1,
      locked_until = pg_catalog.now() + make_interval(secs => lease_seconds),
      updated_at = pg_catalog.now()
  from picked
  where job.id = picked.id
  returning job.*;
end;
$$;

create or replace function private.finish_worker_job(
  p_job_id uuid,
  p_ok boolean,
  p_error text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  job private.job_queue%rowtype;
begin
  perform private.assert_server_role();

  select *
    into job
  from private.job_queue
  where id = p_job_id
  for update;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if p_ok then
    update private.job_queue
    set status = 'succeeded',
        locked_until = null,
        last_error = null,
        updated_at = pg_catalog.now()
    where id = job.id;
    return;
  end if;

  update private.job_queue
  set status = case when job.attempts >= 5 then 'dead' else 'pending' end,
      run_after = pg_catalog.now() + least(
        interval '15 minutes',
        (power(2, greatest(job.attempts, 1)) * interval '10 seconds')
      ),
      locked_until = null,
      last_error = left(coalesce(p_error, 'error'), 300),
      updated_at = pg_catalog.now()
  where id = job.id;
end;
$$;

create or replace function private.requeue_dead_jobs(p_actor_user_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  workspace uuid;
  moved integer;
begin
  perform private.assert_server_role();

  select workspace_member.workspace_id
    into workspace
  from public.workspace_members as workspace_member
  where workspace_member.user_id = p_actor_user_id
    and workspace_member.active
  limit 1;

  if workspace is null then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  perform private.require_active_member(workspace, p_actor_user_id);

  update private.job_queue as job
  set status = 'pending',
      attempts = 0,
      run_after = pg_catalog.now(),
      locked_until = null,
      updated_at = pg_catalog.now()
  where job.workspace_id = workspace
    and job.status = 'dead';

  get diagnostics moved = row_count;
  return moved;
end;
$$;

create or replace function private.catch_up_account_worker(p_account_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  agreement_id uuid;
  inserted integer := 0;
  added integer;
begin
  perform private.assert_server_role();

  if not exists (select 1 from public.accounts where id = p_account_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  for agreement_id in
    select agreement.id
    from public.billing_agreements as agreement
    where agreement.account_id = p_account_id
      and agreement.status <> 'void'
    order by agreement.created_at
  loop
    added := private.generate_due_revenue(agreement_id, null);
    inserted := inserted + added;
  end loop;

  return inserted;
end;
$$;

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
  event_key text;
  notification_id uuid;
  late boolean;
  title text;
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

  event_key := job.dedupe_key;
  title := private.digest_title(task_count);
  late := private.digest_is_late(p_at, digest_hour);

  insert into public.notifications (
    workspace_id, recipient_user_id, kind, title, body, target_path, event_key
  )
  values (
    job.workspace_id,
    task_user,
    'morning_digest',
    title,
    case
      when late then 'Podsumowanie powstało po planowanej godzinie 08:00. Dostarczenie na telefon zależy od systemu i zgody.'
      else 'Dostarczenie na telefon zależy od systemu i zgody. Zapis w aplikacji jest trwały.'
    end,
    '/tasks?view=today&assignee=me',
    event_key
  )
  on conflict (recipient_user_id, event_key) do nothing
  returning id into notification_id;

  if notification_id is null then
    select existing.id
      into notification_id
    from public.notifications as existing
    where existing.recipient_user_id = task_user
      and existing.event_key = event_key;
  end if;

  perform private.record_domain_event(
    job.workspace_id,
    'task.morning_digest',
    'user',
    task_user,
    jsonb_build_object('count', task_count, 'local_date', local_day, 'late', late),
    event_key
  );

  insert into private.job_queue (workspace_id, job_type, payload, dedupe_key)
  select
    job.workspace_id,
    'push_send',
    jsonb_build_object(
      'notification_id', notification_id,
      'subscription_id', subscription.id
    ),
    'push:' || notification_id::text || ':' || subscription.id::text
  from public.push_subscriptions as subscription
  where subscription.workspace_id = job.workspace_id
    and subscription.user_id = task_user
    and subscription.active
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  insert into private.push_deliveries (notification_id, subscription_id, status)
  select notification_id, subscription.id, 'pending'
  from public.push_subscriptions as subscription
  where subscription.workspace_id = job.workspace_id
    and subscription.user_id = task_user
    and subscription.active
  on conflict (notification_id, subscription_id) do nothing;

  return jsonb_build_object(
    'created', true,
    'notification_id', notification_id,
    'count', task_count,
    'title', title,
    'late', late
  );
end;
$$;

create or replace function private.note_push_result(
  p_notification_id uuid,
  p_subscription_id uuid,
  p_status text,
  p_code integer,
  p_error text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.assert_server_role();

  if p_status not in ('sent', 'failed', 'gone') then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  update private.push_deliveries
  set status = p_status,
      provider_code = p_code,
      error = left(p_error, 300),
      attempts = attempts + 1
  where notification_id = p_notification_id
    and subscription_id = p_subscription_id;

  if p_code in (404, 410) or p_status = 'gone' then
    update public.push_subscriptions
    set active = false,
        updated_at = pg_catalog.now()
    where id = p_subscription_id;
  end if;
end;
$$;

create or replace function private.mark_notifications_read(
  p_actor_user_id uuid,
  p_notification_id uuid
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  workspace uuid;
  marked integer;
begin
  perform private.assert_server_role();

  select workspace_member.workspace_id
    into workspace
  from public.workspace_members as workspace_member
  where workspace_member.user_id = p_actor_user_id
    and workspace_member.active
  limit 1;

  if workspace is null then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  perform private.require_active_member(workspace, p_actor_user_id);

  update public.notifications
  set read_at = coalesce(read_at, pg_catalog.now()),
      updated_by = p_actor_user_id
  where recipient_user_id = p_actor_user_id
    and workspace_id = workspace
    and read_at is null
    and (p_notification_id is null or id = p_notification_id);

  get diagnostics marked = row_count;
  return marked;
end;
$$;

create or replace function private.set_morning_digest_enabled(
  p_actor_user_id uuid,
  p_enabled boolean
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  workspace uuid;
begin
  perform private.assert_server_role();

  select workspace_member.workspace_id
    into workspace
  from public.workspace_members as workspace_member
  where workspace_member.user_id = p_actor_user_id
    and workspace_member.active
  limit 1;

  if workspace is null then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  perform private.require_active_member(workspace, p_actor_user_id);

  insert into public.notification_preferences (
    workspace_id, user_id, morning_digest_enabled, created_by
  )
  values (workspace, p_actor_user_id, p_enabled, p_actor_user_id)
  on conflict (workspace_id, user_id) do update
  set morning_digest_enabled = excluded.morning_digest_enabled,
      updated_by = p_actor_user_id;
end;
$$;

create or replace function private.save_push_subscription(
  p_actor_user_id uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth_secret text,
  p_installation_id text,
  p_device_label text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  workspace uuid;
  saved uuid;
begin
  perform private.assert_server_role();

  if p_endpoint is null or p_endpoint !~ '^https://' then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  select workspace_member.workspace_id
    into workspace
  from public.workspace_members as workspace_member
  where workspace_member.user_id = p_actor_user_id
    and workspace_member.active
  limit 1;

  if workspace is null then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  perform private.require_active_member(workspace, p_actor_user_id);

  insert into public.push_subscriptions (
    workspace_id, user_id, endpoint, p256dh, auth_secret, installation_id, device_label, active, created_by
  )
  values (
    workspace,
    p_actor_user_id,
    p_endpoint,
    p_p256dh,
    p_auth_secret,
    nullif(left(coalesce(p_installation_id, ''), 80), ''),
    nullif(left(coalesce(p_device_label, ''), 80), ''),
    true,
    p_actor_user_id
  )
  on conflict (endpoint) do update
  set user_id = excluded.user_id,
      workspace_id = excluded.workspace_id,
      p256dh = excluded.p256dh,
      auth_secret = excluded.auth_secret,
      installation_id = excluded.installation_id,
      device_label = excluded.device_label,
      active = true,
      updated_by = excluded.user_id
  returning id into saved;

  return saved;
end;
$$;

create or replace function private.deactivate_installation(
  p_actor_user_id uuid,
  p_installation_id text
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  marked integer;
begin
  perform private.assert_server_role();

  if p_installation_id is null or btrim(p_installation_id) = '' then
    return 0;
  end if;

  update public.push_subscriptions
  set active = false,
      updated_at = pg_catalog.now(),
      updated_by = p_actor_user_id
  where user_id = p_actor_user_id
    and installation_id = p_installation_id
    and active;

  get diagnostics marked = row_count;
  return marked;
end;
$$;

create or replace function private.worker_status()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'last_finished_at', tick.finished_at,
    'status', tick.status,
    'fresh', tick.finished_at is not null
      and tick.status = 'ok'
      and tick.finished_at > pg_catalog.now() - interval '3 minutes',
    'dead_jobs', (
      select count(*) from private.job_queue as job where job.status = 'dead'
    )
  )
  from (
    select finished_at, status
    from private.worker_ticks
    where finished_at is not null
    order by finished_at desc
    limit 1
  ) as tick
  union all
  select jsonb_build_object(
    'last_finished_at', null,
    'status', null,
    'fresh', false,
    'dead_jobs', (select count(*) from private.job_queue as job where job.status = 'dead')
  )
  where not exists (select 1 from private.worker_ticks where finished_at is not null)
  limit 1
$$;

create or replace function private.start_worker_tick()
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  tick_id uuid;
begin
  perform private.assert_server_role();
  insert into private.worker_ticks (status)
  values ('running')
  returning id into tick_id;
  return tick_id;
end;
$$;

create or replace function private.finish_worker_tick(
  p_tick_id uuid,
  p_status text,
  p_claimed integer,
  p_detail text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.assert_server_role();
  update private.worker_ticks
  set finished_at = pg_catalog.now(),
      status = case when p_status = 'ok' then 'ok' else 'error' end,
      claimed = greatest(coalesce(p_claimed, 0), 0),
      detail = left(p_detail, 300)
  where id = p_tick_id;
end;
$$;

revoke all on function private.warsaw_local(timestamptz) from public, anon, authenticated;
revoke all on function private.digest_is_due(timestamptz, integer) from public, anon, authenticated;
revoke all on function private.digest_is_late(timestamptz, integer) from public, anon, authenticated;
revoke all on function private.digest_title(integer) from public, anon, authenticated;
revoke all on function private.release_expired_jobs() from public, anon, authenticated;
revoke all on function private.enqueue_worker_jobs(timestamptz) from public, anon, authenticated;
revoke all on function private.claim_worker_jobs(integer, integer) from public, anon, authenticated;
revoke all on function private.finish_worker_job(uuid, boolean, text) from public, anon, authenticated;
revoke all on function private.requeue_dead_jobs(uuid) from public, anon, authenticated;
revoke all on function private.catch_up_account_worker(uuid) from public, anon, authenticated;
revoke all on function private.build_morning_digest(uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.note_push_result(uuid, uuid, text, integer, text) from public, anon, authenticated;
revoke all on function private.mark_notifications_read(uuid, uuid) from public, anon, authenticated;
revoke all on function private.set_morning_digest_enabled(uuid, boolean) from public, anon, authenticated;
revoke all on function private.save_push_subscription(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function private.deactivate_installation(uuid, text) from public, anon, authenticated;
revoke all on function private.worker_status() from public, anon, authenticated;
revoke all on function private.start_worker_tick() from public, anon, authenticated;
revoke all on function private.finish_worker_tick(uuid, text, integer, text) from public, anon, authenticated;

grant execute on function private.warsaw_local(timestamptz) to service_role;
grant execute on function private.digest_is_due(timestamptz, integer) to service_role;
grant execute on function private.digest_is_late(timestamptz, integer) to service_role;
grant execute on function private.digest_title(integer) to service_role;
grant execute on function private.release_expired_jobs() to service_role;
grant execute on function private.enqueue_worker_jobs(timestamptz) to service_role;
grant execute on function private.claim_worker_jobs(integer, integer) to service_role;
grant execute on function private.finish_worker_job(uuid, boolean, text) to service_role;
grant execute on function private.requeue_dead_jobs(uuid) to service_role;
grant execute on function private.catch_up_account_worker(uuid) to service_role;
grant execute on function private.build_morning_digest(uuid, timestamptz) to service_role;
grant execute on function private.note_push_result(uuid, uuid, text, integer, text) to service_role;
grant execute on function private.mark_notifications_read(uuid, uuid) to service_role;
grant execute on function private.set_morning_digest_enabled(uuid, boolean) to service_role;
grant execute on function private.save_push_subscription(uuid, text, text, text, text, text) to service_role;
grant execute on function private.deactivate_installation(uuid, text) to service_role;
grant execute on function private.worker_status() to service_role;
grant execute on function private.start_worker_tick() to service_role;
grant execute on function private.finish_worker_tick(uuid, text, integer, text) to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
