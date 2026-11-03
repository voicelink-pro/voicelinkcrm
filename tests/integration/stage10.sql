-- Odbiór etapu 10. Transakcja kończy się rollbackiem, seed zostaje.

begin;

do $$
<<stage10>>
declare
  anna uuid := '20000000-0000-4000-8000-000000000001';
  bartek uuid := '20000000-0000-4000-8000-000000000002';
  outsider uuid := '99999999-0000-4000-8000-000000000099';
  workspace uuid := '10000000-0000-4000-8000-000000000001';
  kawiarnia uuid := '30000000-0000-4000-8000-000000000001';
  snapshot jsonb;
  listed jsonb;
  fixture uuid;
  setup_entry uuid;
  boundary uuid;
  shared_task uuid;
  plain_task uuid;
  undated_deployment uuid;
  future_meeting uuid;
  past_meeting uuid;
  notifications_before integer;
  notifications_after integer;
  direct_gross bigint;
  direct_setup bigint;
  direct_subscription bigint;
  warsaw_leads integer;
  utc_leads integer;
  distinct_tasks integer;
  assignee_rows integer;
  direct_open integer;
  direct_overdue integer;
  direct_paused integer;
  chart_month date;
  chart_total bigint;
  chart_setup bigint;
  active_direct bigint;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  select count(*) into notifications_before from public.notifications;

  snapshot := private.dashboard_snapshot(anna, date '2018-01-01', date '2018-01-31', null, null);
  if (snapshot->>'won_closed')::integer <> 0 or (snapshot->>'lost_closed')::integer <> 0 then
    raise exception 'empty_period_not_zero';
  end if;
  if snapshot->>'worker_running' <> 'false' then
    raise exception 'worker_pretended_running';
  end if;
  if jsonb_array_length(snapshot->'chart') <> 6 then
    raise exception 'chart_month_count';
  end if;

  insert into public.contacts (workspace_id, account_id, full_name, created_by)
  values (workspace, kawiarnia, 'Drugi kontakt dashboardu', anna);

  insert into public.deals (
    workspace_id, account_id, title, source, stage, owner_user_id, created_by, created_at
  )
  values (
    workspace, kawiarnia, 'Finalizacja dashboardu', 'manual', 'new', anna, anna,
    '2020-01-15 12:00:00+01'
  )
  returning id into fixture;

  perform private.finalize_deal(anna, fixture, 1, 100000, date '2020-01-10', 0, null, null, date '2020-01-31');

  select coalesce(sum(amount_signed_cents), 0)
    into direct_gross
  from public.revenue_entries
  where effective_on between date '2020-01-01' and date '2020-01-31';

  snapshot := private.dashboard_snapshot(anna, date '2020-01-01', date '2020-01-31', null, null);
  if (snapshot->>'gross_cents')::bigint is distinct from direct_gross then
    raise exception 'gross_mismatch';
  end if;
  if (snapshot->>'gross_cents')::bigint <> 100000 then
    raise exception 'gross_not_single_entry';
  end if;
  if (snapshot->>'setup_cents')::bigint <> 100000 or (snapshot->>'subscription_cents')::bigint <> 0 then
    raise exception 'setup_series_mismatch';
  end if;

  select id into setup_entry
  from public.revenue_entries
  where deal_id = fixture and entry_type = 'setup';

  perform private.correct_revenue_entry(anna, setup_entry, 'Korekta testu dashboardu');

  snapshot := private.dashboard_snapshot(anna, date '2020-01-01', date '2020-01-31', null, null);
  select coalesce(sum(amount_signed_cents), 0)
    into direct_gross
  from public.revenue_entries
  where effective_on between date '2020-01-01' and date '2020-01-31';

  if (snapshot->>'gross_cents')::bigint is distinct from direct_gross or direct_gross <> 0 then
    raise exception 'correction_doubled_or_missed';
  end if;
  if (snapshot->>'setup_cents')::bigint <> 0 then
    raise exception 'correction_left_setup_series';
  end if;

  listed := private.list_period_revenue(anna, date '2020-01-01', date '2020-01-31', 'all', null, 25, 0);
  if (listed->>'total_cents')::bigint is distinct from (snapshot->>'gross_cents')::bigint then
    raise exception 'list_total_mismatch';
  end if;
  if (listed->>'count')::integer <> 2 then
    raise exception 'correction_row_count';
  end if;

  insert into public.deals (
    workspace_id, account_id, title, source, stage, owner_user_id, created_by
  )
  values (workspace, kawiarnia, 'Abonament dashboardu', 'manual', 'new', anna, anna)
  returning id into fixture;

  perform private.finalize_deal(
    anna, fixture, 1, 40000, date '2020-02-01', 15000, date '2020-02-01', null, date '2020-02-29'
  );

  select coalesce(sum(amount_signed_cents), 0)
    into direct_gross
  from public.revenue_entries
  where effective_on between date '2020-02-01' and date '2020-02-29';

  select coalesce(sum(entry.amount_signed_cents), 0)
    into direct_setup
  from public.revenue_entries as entry
  left join public.revenue_entries as reversed on reversed.id = entry.reverses_entry_id
  where entry.effective_on between date '2020-02-01' and date '2020-02-29'
    and private.revenue_component(entry.entry_type, reversed.entry_type) = 'setup';

  select coalesce(sum(entry.amount_signed_cents), 0)
    into direct_subscription
  from public.revenue_entries as entry
  left join public.revenue_entries as reversed on reversed.id = entry.reverses_entry_id
  where entry.effective_on between date '2020-02-01' and date '2020-02-29'
    and private.revenue_component(entry.entry_type, reversed.entry_type) = 'subscription';

  snapshot := private.dashboard_snapshot(anna, date '2020-02-01', date '2020-02-29', null, null);
  if (snapshot->>'gross_cents')::bigint is distinct from direct_gross then
    raise exception 'february_gross_mismatch';
  end if;
  if (snapshot->>'setup_cents')::bigint is distinct from direct_setup
     or (snapshot->>'subscription_cents')::bigint is distinct from direct_subscription then
    raise exception 'february_series_mismatch';
  end if;
  if direct_subscription <= 0 or direct_setup <> 40000 then
    raise exception 'february_fixture';
  end if;
  if (snapshot->>'gross_cents')::bigint
     is distinct from (snapshot->>'setup_cents')::bigint
       + (snapshot->>'subscription_cents')::bigint
       + (snapshot->>'other_cents')::bigint then
    raise exception 'series_do_not_add_up';
  end if;

  insert into public.deals (
    workspace_id, account_id, title, source, stage, owner_user_id, created_by, created_at
  )
  values (
    workspace, kawiarnia, 'Granica Warszawy', 'manual', 'new', anna, anna,
    '2026-10-01 00:30:00+02'
  )
  returning id into boundary;

  if (select (created_at at time zone 'Europe/Warsaw')::date from public.deals where id = boundary)
     is distinct from date '2026-10-01' then
    raise exception 'boundary_not_warsaw_october';
  end if;
  if (select (created_at at time zone 'UTC')::date from public.deals where id = boundary)
     is distinct from date '2026-09-30' then
    raise exception 'boundary_not_utc_september';
  end if;

  select count(*) into warsaw_leads
  from public.deals as deal
  join public.accounts as account on account.id = deal.account_id
  where deal.archived_at is null
    and account.archived_at is null
    and (deal.created_at at time zone 'Europe/Warsaw')::date
      between date '2026-10-01' and date '2026-10-31';

  select count(*) into utc_leads
  from public.deals as deal
  join public.accounts as account on account.id = deal.account_id
  where deal.archived_at is null
    and account.archived_at is null
    and (deal.created_at at time zone 'UTC')::date
      between date '2026-10-01' and date '2026-10-31';

  snapshot := private.dashboard_snapshot(anna, date '2026-10-01', date '2026-10-31', null, null);
  if (snapshot->>'new_leads')::integer is distinct from warsaw_leads then
    raise exception 'lead_count_mismatch';
  end if;
  if warsaw_leads = utc_leads then
    raise exception 'warsaw_boundary_not_visible';
  end if;

  update public.deals
  set won_at = '2019-06-15 12:00:00+02'
  where id = fixture;

  insert into public.deals (
    workspace_id, account_id, title, source, stage, lost_reason, owner_user_id, created_by, lost_at
  )
  values (
    workspace, kawiarnia, 'Przegrana dashboardu', 'manual', 'lost', 'Test', anna, anna,
    '2019-06-16 12:00:00+02'
  );

  snapshot := private.dashboard_snapshot(anna, date '2019-06-01', date '2019-06-30', null, null);
  if (snapshot->>'won_closed')::integer <> 1 or (snapshot->>'lost_closed')::integer <> 1 then
    raise exception 'conversion_counts';
  end if;
  if (snapshot->>'won_finalized')::integer <> 1 then
    raise exception 'finalized_win_missing';
  end if;

  insert into public.tasks (
    workspace_id, title, status, priority, kind, due_on, due_at, created_by
  )
  values (
    workspace, 'Wspolne zadanie dashboardu', 'todo', 'normal', 'task', private.warsaw_today(),
    pg_catalog.now() - interval '1 hour', anna
  )
  returning id into shared_task;

  insert into public.task_assignees (workspace_id, task_id, user_id, created_by)
  values
    (workspace, shared_task, anna, anna),
    (workspace, shared_task, bartek, anna);

  insert into public.tasks (workspace_id, title, status, priority, kind, due_on, created_by)
  values (workspace, 'Zadanie bez godziny', 'todo', 'normal', 'task', private.warsaw_today(), anna)
  returning id into plain_task;

  insert into public.task_assignees (workspace_id, task_id, user_id, created_by)
  values (workspace, plain_task, anna, anna);

  select count(distinct task.id) into distinct_tasks
  from public.tasks as task
  join public.task_assignees as assignee
    on assignee.task_id = task.id and assignee.user_id = anna
  where task.archived_at is null
    and task.status in ('todo', 'in_progress')
    and task.due_on = private.warsaw_today();

  select count(*) into assignee_rows
  from public.task_assignees as assignee
  where assignee.task_id in (
    select task.id
    from public.tasks as task
    join public.task_assignees as anna_row
      on anna_row.task_id = task.id and anna_row.user_id = anna
    where task.archived_at is null
      and task.status in ('todo', 'in_progress')
      and task.due_on = private.warsaw_today()
  );

  snapshot := private.dashboard_snapshot(anna, null, null, null, null);
  if (snapshot->>'tasks_today')::integer is distinct from distinct_tasks then
    raise exception 'task_count_mismatch';
  end if;
  if assignee_rows <= distinct_tasks then
    raise exception 'assignee_rows_not_distinct';
  end if;
  if (snapshot->>'tasks_hourly_overdue')::integer < 1 then
    raise exception 'hourly_overdue_missing';
  end if;
  if (snapshot->>'tasks_hourly_overdue')::integer >= (snapshot->>'tasks_today')::integer then
    raise exception 'hourly_swallowed_date_tasks';
  end if;

  insert into public.deployments (
    workspace_id, account_id, product_type, name, status, owner_display_name, due_on, created_by
  )
  values (
    workspace, kawiarnia, 'website', 'Bez terminu etap 10', 'in_progress', 'Anna', null, anna
  )
  returning id into undated_deployment;

  insert into public.deployments (
    workspace_id, account_id, product_type, name, status, owner_display_name, due_on, created_by
  )
  values (
    workspace, kawiarnia, 'website', 'Wstrzymane etap 10', 'paused', 'Anna',
    private.warsaw_today() - 1, anna
  );

  select count(*) into direct_open
  from public.deployments
  where workspace_id = workspace
    and archived_at is null
    and status not in ('completed', 'cancelled');

  select count(*) into direct_overdue
  from public.deployments
  where workspace_id = workspace
    and archived_at is null
    and status not in ('completed', 'cancelled')
    and due_on is not null
    and due_on < private.warsaw_today();

  select count(*) into direct_paused
  from public.deployments
  where workspace_id = workspace
    and archived_at is null
    and status = 'paused';

  snapshot := private.dashboard_snapshot(anna, null, null, null, null);
  if (snapshot->>'open_deployments')::integer is distinct from direct_open
     or (snapshot->>'overdue_deployments')::integer is distinct from direct_overdue
     or (snapshot->>'paused_deployments')::integer is distinct from direct_paused then
    raise exception 'deployment_count_mismatch';
  end if;
  if exists (
    select 1
    from public.deployments
    where id = undated_deployment
      and due_on is null
  ) and (snapshot->>'overdue_deployments')::integer = direct_open then
    raise exception 'missing_due_counted_overdue';
  end if;

  insert into public.meeting_records (workspace_id, recording_id, title, started_at, created_by)
  values (workspace, 'stage10-future', 'Spotkanie przyszle etap 10', pg_catalog.now() + interval '2 days', anna)
  returning id into future_meeting;

  insert into public.meeting_records (workspace_id, recording_id, title, started_at, created_by)
  values (workspace, 'stage10-past', 'Spotkanie minione etap 10', pg_catalog.now() - interval '1 day', anna)
  returning id into past_meeting;

  snapshot := private.dashboard_snapshot(anna, null, null, null, null);
  if (snapshot->'meetings')::text like '%Spotkanie przyszle etap 10%' then
    raise exception 'future_meeting_shown';
  end if;
  if (snapshot->'meetings')::text not like '%Spotkanie minione etap 10%' then
    raise exception 'past_meeting_missing';
  end if;

  for chart_month, chart_total, chart_setup in
    select
      (item->>'month')::date,
      (item->>'total_cents')::bigint,
      (item->>'setup_cents')::bigint
    from jsonb_array_elements(snapshot->'chart') as item
  loop
    select coalesce(sum(amount_signed_cents), 0)
      into direct_gross
    from public.revenue_entries
    where effective_on >= chart_month
      and effective_on < (chart_month + interval '1 month')::date;

    if chart_total is distinct from direct_gross then
      raise exception 'chart_total_mismatch';
    end if;

    select coalesce(sum(entry.amount_signed_cents), 0)
      into direct_setup
    from public.revenue_entries as entry
    left join public.revenue_entries as reversed on reversed.id = entry.reverses_entry_id
    where entry.effective_on >= chart_month
      and entry.effective_on < (chart_month + interval '1 month')::date
      and private.revenue_component(entry.entry_type, reversed.entry_type) = 'setup';

    if chart_setup is distinct from direct_setup then
      raise exception 'chart_setup_mismatch';
    end if;
  end loop;

  select coalesce(sum(agreement.amount_gross_cents), 0)
    into active_direct
  from public.billing_agreements as agreement
  join public.deals as deal
    on deal.id = agreement.deal_id
   and deal.workspace_id = agreement.workspace_id
  where agreement.kind = 'subscription'
    and agreement.status = 'active'
    and agreement.starts_on <= private.warsaw_today()
    and (agreement.ends_on_exclusive is null or agreement.ends_on_exclusive > private.warsaw_today())
    and deal.stage = 'won'
    and deal.archived_at is null;

  if (snapshot->>'active_subscription_cents')::bigint is distinct from active_direct then
    raise exception 'active_subscription_mismatch';
  end if;

  perform private.dashboard_snapshot(bartek, null, null, null, null);

  begin
    perform private.dashboard_snapshot(outsider, null, null, null, null);
    raise exception 'outsider_was_allowed';
  exception
    when others then
      if sqlerrm not like '%not_a_member%' then
        raise;
      end if;
  end;

  select count(*) into notifications_after from public.notifications;
  if notifications_before is distinct from notifications_after then
    raise exception 'notifications_changed';
  end if;

  execute 'set local role anon';
  begin
    perform private.dashboard_snapshot(anna, null, null, null, null);
    raise exception 'anon_was_allowed';
  exception
    when insufficient_privilege then
      null;
    when others then
      if sqlerrm not like '%permission denied%' then
        raise;
      end if;
  end;
end;
$$;

rollback;
