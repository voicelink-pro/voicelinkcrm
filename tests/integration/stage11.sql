-- Odbiór etapu 11. Transakcja kończy się rollbackiem, seed zostaje.

begin;

do $$
<<stage11>>
declare
  anna uuid := '20000000-0000-4000-8000-000000000001';
  bartek uuid := '20000000-0000-4000-8000-000000000002';
  outsider uuid := '99999999-0000-4000-8000-000000000099';
  workspace uuid := '10000000-0000-4000-8000-000000000001';
  gabinet uuid := '40000000-0000-4000-8000-000000000001';
  shared_task uuid;
  job record;
  job_id uuid;
  built jsonb;
  enqueued jsonb;
  anna_title text;
  bartek_title text;
  anna_count integer;
  bartek_count integer;
  notification_count integer;
  delivery_count integer;
  first_claim integer;
  second_claim integer;
  subscription_anna uuid;
  subscription_phone uuid;
  owner uuid;
  revenue_before bigint;
  revenue_after bigint;
  notifications_before integer;
  notifications_after integer;
  other_before integer;
  other_after integer;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  select count(*) into notifications_before from public.notifications;
  select count(*) into other_before
  from public.notifications
  where kind <> 'morning_digest';

  if private.digest_is_due('2026-07-01 05:59:00+00', 8) then
    raise exception 'summer_before_eight_was_due';
  end if;
  if not private.digest_is_due('2026-07-01 06:00:00+00', 8) then
    raise exception 'summer_eight_not_due';
  end if;
  if private.digest_is_due('2026-01-15 06:00:00+00', 8) then
    raise exception 'winter_seven_was_due';
  end if;
  if not private.digest_is_due('2026-01-15 07:00:00+00', 8) then
    raise exception 'winter_eight_not_due';
  end if;
  if private.digest_is_due('2026-10-25 06:00:00+00', 8) then
    raise exception 'october_switch_used_summer_offset';
  end if;
  if not private.digest_is_due('2026-10-25 07:00:00+00', 8) then
    raise exception 'october_eight_not_due';
  end if;
  if not private.digest_is_due('2026-03-29 06:00:00+00', 8) then
    raise exception 'march_eight_not_due';
  end if;
  if private.digest_is_due('2026-03-29 05:00:00+00', 8) then
    raise exception 'march_switch_used_winter_offset';
  end if;
  if not private.digest_is_due('2026-11-01 07:00:00+00', 8) then
    raise exception 'sunday_eight_not_due';
  end if;

  insert into public.tasks (
    workspace_id, title, status, priority, kind, due_on, created_by
  )
  values (
    workspace, 'Wspolny poranek', 'todo', 'normal', 'task', date '2026-07-01', anna
  )
  returning id into shared_task;

  insert into public.task_assignees (workspace_id, task_id, user_id, created_by)
  values
    (workspace, shared_task, anna, anna),
    (workspace, shared_task, bartek, anna);

  insert into public.tasks (workspace_id, title, status, priority, kind, due_on, created_by)
  values (workspace, 'Tylko Anna', 'todo', 'normal', 'task', date '2026-07-01', anna);
  insert into public.task_assignees (workspace_id, task_id, user_id, created_by)
  select workspace, id, anna, anna from public.tasks where title = 'Tylko Anna';

  insert into public.tasks (workspace_id, title, status, priority, kind, due_on, created_by)
  values
    (workspace, 'Bartek jeden', 'todo', 'normal', 'task', date '2026-07-01', bartek),
    (workspace, 'Bartek dwa', 'todo', 'normal', 'task', date '2026-07-01', bartek);
  insert into public.task_assignees (workspace_id, task_id, user_id, created_by)
  select workspace, id, bartek, bartek
  from public.tasks
  where title in ('Bartek jeden', 'Bartek dwa');

  enqueued := private.enqueue_worker_jobs('2026-07-01 05:59:00+00');
  if (enqueued->>'digest_jobs')::integer <> 0 then
    raise exception 'digest_before_eight';
  end if;

  enqueued := private.enqueue_worker_jobs('2026-07-01 06:05:00+00');
  if (enqueued->>'digest_jobs')::integer <> 2 then
    raise exception 'digest_jobs_not_two %', enqueued;
  end if;

  enqueued := private.enqueue_worker_jobs('2026-07-02 06:05:00+00');
  if (enqueued->>'digest_jobs')::integer <> 2 then
    raise exception 'next_day_did_not_enqueue';
  end if;
  if exists (
    select 1 from private.job_queue
    where dedupe_key like 'morning-digest:%:2026-07-01'
      and payload->>'local_date' = '2026-07-02'
  ) then
    raise exception 'historical_digest_rewritten';
  end if;
  delete from private.job_queue
  where payload->>'local_date' = '2026-07-02'
     or dedupe_key like '%20260702%';

  select count(*) into first_claim from private.claim_worker_jobs(1, 120);
  select count(*) into second_claim from private.claim_worker_jobs(1, 120);
  if first_claim <> 1 or second_claim <> 1 then
    raise exception 'parallel_claim_took_same_job';
  end if;
  if (
    select count(*) from private.claim_worker_jobs(20, 120)
  ) < 1 then
    raise exception 'remaining_jobs_missing';
  end if;

  for job in
    select * from private.job_queue where job_type = 'morning_digest' and status = 'running'
  loop
    built := private.build_morning_digest(job.id, '2026-07-01 06:05:00+00');
    perform private.finish_worker_job(job.id, true, null);
  end loop;

  select title into anna_title
  from public.notifications
  where recipient_user_id = anna and kind = 'morning_digest' and event_key like '%2026-07-01';
  select title into bartek_title
  from public.notifications
  where recipient_user_id = bartek and kind = 'morning_digest' and event_key like '%2026-07-01';

  if anna_title is distinct from 'Masz 2 zadania na dziś' then
    raise exception 'anna_title %', anna_title;
  end if;
  if bartek_title is distinct from 'Masz 3 zadania na dziś' then
    raise exception 'bartek_title %', bartek_title;
  end if;

  select count(*) into notification_count
  from public.notifications
  where kind = 'morning_digest' and event_key like '%2026-07-01';
  if notification_count <> 2 then
    raise exception 'digest_duplicated %', notification_count;
  end if;

  select id into job_id from private.job_queue
  where dedupe_key = 'morning-digest:' || workspace::text || ':' || anna::text || ':2026-07-01';
  built := private.build_morning_digest(job_id, '2026-07-01 06:05:00+00');
  select count(*) into notification_count
  from public.notifications
  where recipient_user_id = anna and event_key like '%2026-07-01';
  if notification_count <> 1 then
    raise exception 'restart_duplicated_digest';
  end if;

  select id into subscription_anna
  from (
    select private.save_push_subscription(
      anna, 'https://push.example.test/anna-laptop', 'key-a', 'auth-a', 'install-anna', 'Laptop'
    ) as id
  ) as saved;

  select private.save_push_subscription(
    anna, 'https://push.example.test/anna-phone', 'key-b', 'auth-b', 'install-phone', 'Telefon'
  ) into subscription_phone;

  built := private.build_morning_digest(job_id, '2026-07-01 08:00:00+00');
  if built->>'late' is distinct from 'true' then
    raise exception 'late_flag_missing %', built;
  end if;

  select count(*) into delivery_count
  from private.push_deliveries
  where notification_id = (built->>'notification_id')::uuid;
  if delivery_count <> 2 then
    raise exception 'two_devices_not_queued %', delivery_count;
  end if;

  perform private.note_push_result(
    (built->>'notification_id')::uuid,
    subscription_phone,
    'gone',
    410,
    'gone'
  );
  if exists (
    select 1 from public.push_subscriptions
    where id = subscription_phone and active
  ) then
    raise exception 'gone_subscription_stayed_active';
  end if;

  enqueued := private.enqueue_worker_jobs('2026-08-01 06:05:00+00');
  select id into job_id
  from private.job_queue
  where dedupe_key = 'morning-digest:' || workspace::text || ':' || bartek::text || ':2026-08-01';
  built := private.build_morning_digest(job_id, '2026-08-01 06:05:00+00');
  if built->>'reason' is distinct from 'empty' then
    raise exception 'empty_day_created %', built;
  end if;

  update public.notification_preferences
  set morning_digest_enabled = false
  where user_id = anna;

  enqueued := private.enqueue_worker_jobs('2026-07-02 06:05:00+00');
  select id into job_id
  from private.job_queue
  where dedupe_key = 'morning-digest:' || workspace::text || ':' || anna::text || ':2026-07-02';
  update private.job_queue set status = 'running' where id = job_id;
  built := private.build_morning_digest(job_id, '2026-07-02 06:05:00+00');
  if built->>'reason' is distinct from 'preference' then
    raise exception 'preference_ignored';
  end if;
  if exists (
    select 1 from public.notifications
    where recipient_user_id = anna and event_key like '%2026-07-02'
  ) then
    raise exception 'disabled_digest_was_sent';
  end if;

  update public.notification_preferences
  set status_change_enabled = true,
      assignment_enabled = true,
      reminder_enabled = true,
      include_overdue = true
  where user_id = bartek;

  perform private.record_domain_event(
    workspace, 'task.status_changed', 'task', shared_task, '{}'::jsonb, 'status-test'
  );

  select count(*) into other_after
  from public.notifications
  where kind <> 'morning_digest';
  if other_after is distinct from other_before then
    raise exception 'unconfirmed_rule_sent';
  end if;

  perform private.deactivate_installation(anna, 'install-phone');
  select private.save_push_subscription(
    bartek, 'https://push.example.test/anna-phone', 'key-c', 'auth-c', 'install-phone', 'Telefon Bartka'
  ) into subscription_phone;

  select user_id into owner from public.push_subscriptions where endpoint = 'https://push.example.test/anna-phone';
  if owner is distinct from bartek then
    raise exception 'phone_still_belongs_to_previous_user';
  end if;
  if exists (
    select 1 from public.push_subscriptions
    where endpoint = 'https://push.example.test/anna-phone' and user_id = anna and active
  ) then
    raise exception 'previous_user_still_active';
  end if;

  select count(*) into anna_count
  from public.notifications
  where recipient_user_id = anna;
  select count(*) into bartek_count
  from public.notifications
  where recipient_user_id = bartek;

  execute 'set local role authenticated';
  perform set_config(
    'request.jwt.claims',
    '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}',
    true
  );
  perform set_config('request.jwt.claim.sub', bartek::text, true);

  if (
    select count(*) from public.notifications
  ) is distinct from bartek_count then
    raise exception 'bartek_saw_other_notifications';
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);

  enqueued := private.enqueue_worker_jobs('2026-07-01 06:05:00+00');
  if coalesce((enqueued->>'fathom_jobs')::integer, 0) <> 0
     or coalesce((enqueued->>'digest_jobs')::integer, 0) <> 0 then
    raise exception 'same_bucket_duplicated %', enqueued;
  end if;

  insert into private.job_queue (
    workspace_id, job_type, payload, dedupe_key, status, attempts, locked_until
  )
  values (
    workspace,
    'revenue_catch_up',
    jsonb_build_object('account_id', gabinet),
    'lease-probe',
    'running',
    1,
    pg_catalog.now() + interval '2 minutes'
  )
  returning id into job_id;

  if exists (
    select 1 from private.claim_worker_jobs(20, 120) as claimed where claimed.id = job_id
  ) then
    raise exception 'leased_job_reclaimed';
  end if;

  update private.job_queue
  set locked_until = pg_catalog.now() - interval '1 minute'
  where id = job_id;

  perform private.release_expired_jobs();

  if not exists (
    select 1 from private.job_queue where id = job_id and status = 'pending'
  ) then
    raise exception 'expired_lease_not_released';
  end if;

  update private.job_queue
  set run_after = pg_catalog.now()
  where id = job_id;

  if not exists (
    select 1 from private.claim_worker_jobs(20, 120) as claimed where claimed.id = job_id
  ) then
    raise exception 'released_job_not_reclaimed';
  end if;

  update private.job_queue
  set status = 'dead', attempts = 5, locked_until = null
  where id = job_id;

  if private.requeue_dead_jobs(anna) < 1 then
    raise exception 'dead_job_not_requeued';
  end if;

  if not exists (
    select 1 from private.job_queue
    where id = job_id and status = 'pending' and attempts = 0
  ) then
    raise exception 'requeue_changed_identity';
  end if;

  begin
    perform private.requeue_dead_jobs(outsider);
    raise exception 'outsider_requeued';
  exception
    when others then
      if sqlerrm is distinct from 'not_a_member' then
        raise;
      end if;
  end;

  begin
    execute 'set local role anon';
    perform private.worker_status();
    raise exception 'anon_called_worker';
  exception
    when insufficient_privilege then
      null;
  end;

  execute 'reset role';
  perform private.create_push_test(anna);
  if exists (
    select 1 from public.notifications
    where kind = 'push_test' and recipient_user_id <> anna
  ) then
    raise exception 'push_test_reached_other_user';
  end if;

  select coalesce(sum(amount_signed_cents), 0) into revenue_before from public.revenue_entries;
  perform private.catch_up_account_worker(gabinet);
  perform private.catch_up_account_worker(gabinet);
  select coalesce(sum(amount_signed_cents), 0) into revenue_after from public.revenue_entries;
  if revenue_after is distinct from revenue_before then
    raise exception 'worker_catch_up_duplicated';
  end if;

  select count(*) into notifications_after from public.notifications;
  if notifications_after < notifications_before then
    raise exception 'notifications_removed';
  end if;
end;
$$;

rollback;
