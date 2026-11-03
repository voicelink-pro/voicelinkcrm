-- Dashboard liczy metryki w bazie. Przeglądarka nie sumuje tabel.
-- Okresowy worker naliczeń jest poza tym etapem, więc snapshot nie udaje kompletności.

create or replace view public.lead_directory
with (security_invoker = true) as
select
  deal.id,
  deal.workspace_id,
  deal.account_id,
  deal.primary_contact_id,
  deal.title,
  deal.product_type,
  deal.stage,
  deal.owner_user_id,
  deal.setup_amount_gross_cents,
  deal.monthly_amount_gross_cents,
  deal.created_at,
  deal.version,
  deal.archived_at,
  account.display_name as account_name,
  account.company_name,
  account.kind as account_kind,
  account.relationship as account_relationship,
  account.archived_at as account_archived_at,
  contact.full_name as contact_name,
  contact.email as contact_email,
  contact.phone_e164 as contact_phone,
  owner_profile.full_name as owner_name,
  (
    select max(activity.occurred_at)
    from public.activities as activity
    where activity.deal_id = deal.id
  ) as last_contact_at,
  (
    select min(task.due_on)
    from public.tasks as task
    where task.deal_id = deal.id
      and task.kind = 'follow_up'
      and task.status in ('todo', 'in_progress')
      and task.archived_at is null
  ) as next_follow_up_on,
  deal.won_at,
  deal.lost_at,
  deal.source
from public.deals as deal
join public.accounts as account
  on account.id = deal.account_id
 and account.workspace_id = deal.workspace_id
left join public.contacts as contact
  on contact.id = deal.primary_contact_id
 and contact.workspace_id = deal.workspace_id
left join public.profiles as owner_profile
  on owner_profile.user_id = deal.owner_user_id
 and owner_profile.workspace_id = deal.workspace_id;

create or replace function private.revenue_component(
  p_entry_type text,
  p_reversed_type text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_entry_type = 'setup' then 'setup'
    when p_entry_type = 'subscription' then 'subscription'
    when p_entry_type = 'correction' and p_reversed_type = 'setup' then 'setup'
    when p_entry_type = 'correction' and p_reversed_type = 'subscription' then 'subscription'
    else 'other'
  end
$$;

create or replace function private.period_revenue_filtered(
  p_workspace_id uuid,
  p_from date,
  p_to date,
  p_kind text
)
returns table (
  id uuid,
  entry_type text,
  component text,
  effective_on date,
  amount_signed_cents bigint,
  deal_id uuid,
  account_id uuid,
  reason text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    entry.id,
    entry.entry_type,
    private.revenue_component(entry.entry_type, reversed.entry_type),
    entry.effective_on,
    entry.amount_signed_cents,
    entry.deal_id,
    entry.account_id,
    entry.reason
  from public.revenue_entries as entry
  left join public.revenue_entries as reversed
    on reversed.id = entry.reverses_entry_id
  where entry.workspace_id = p_workspace_id
    and entry.effective_on between p_from and p_to
    and (
      p_kind = 'all'
      or private.revenue_component(entry.entry_type, reversed.entry_type) = p_kind
    )
$$;

create or replace function private.dashboard_snapshot(
  p_actor_user_id uuid,
  p_from date,
  p_to date,
  p_owner_user_id uuid,
  p_source text
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
<<dash>>
declare
  workspace uuid;
  warsaw_day date;
  period_from date;
  period_to date;
  owner_filter uuid;
  task_user uuid;
  source_filter text;
  open_stages text[] := array[
    'new',
    'contact_attempt',
    'conversation_done',
    'meeting_scheduled',
    'meeting_done',
    'offer_sent',
    'negotiation'
  ];
begin
  perform private.assert_server_role();

  select member.workspace_id
    into workspace
  from public.workspace_members as member
  where member.user_id = p_actor_user_id
    and member.active
  limit 1;

  if workspace is null then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  perform private.require_active_member(workspace, p_actor_user_id);

  warsaw_day := private.warsaw_today();
  period_from := coalesce(
    p_from,
    date_trunc('month', warsaw_day::timestamp)::date
  );
  period_to := coalesce(
    p_to,
    (date_trunc('month', warsaw_day::timestamp) + interval '1 month - 1 day')::date
  );

  if period_from > period_to then
    raise exception 'period_invalid' using errcode = '22023';
  end if;

  owner_filter := p_owner_user_id;
  if owner_filter is not null and not exists (
    select 1
    from public.workspace_members as member
    where member.workspace_id = workspace
      and member.user_id = owner_filter
      and member.active
  ) then
    owner_filter := '00000000-0000-0000-0000-000000000000';
  end if;

  task_user := coalesce(owner_filter, p_actor_user_id);
  source_filter := nullif(pg_catalog.btrim(coalesce(p_source, '')), '');

  return jsonb_build_object(
    'today', warsaw_day,
    'period_from', period_from,
    'period_to', period_to,
    'owner_user_id', case
      when owner_filter = '00000000-0000-0000-0000-000000000000' then null
      else owner_filter
    end,
    'task_user_id', task_user,
    'source', source_filter,
    'worker_running', false,
    'last_revenue_at', (
      select max(entry.created_at)
      from public.revenue_entries as entry
      where entry.workspace_id = workspace
    ),
    'gross_cents', (
      select coalesce(sum(entry.amount_signed_cents), 0)
      from private.period_revenue_filtered(workspace, period_from, period_to, 'all') as entry
    ),
    'setup_cents', (
      select coalesce(sum(entry.amount_signed_cents), 0)
      from private.period_revenue_filtered(workspace, period_from, period_to, 'setup') as entry
    ),
    'subscription_cents', (
      select coalesce(sum(entry.amount_signed_cents), 0)
      from private.period_revenue_filtered(workspace, period_from, period_to, 'subscription') as entry
    ),
    'other_cents', (
      select coalesce(sum(entry.amount_signed_cents), 0)
      from private.period_revenue_filtered(workspace, period_from, period_to, 'other') as entry
    ),
    'active_subscription_cents', (
      select coalesce(sum(agreement.amount_gross_cents), 0)
      from public.billing_agreements as agreement
      join public.deals as deal
        on deal.id = agreement.deal_id
       and deal.workspace_id = agreement.workspace_id
      where agreement.workspace_id = workspace
        and agreement.kind = 'subscription'
        and agreement.status = 'active'
        and agreement.starts_on <= warsaw_day
        and (agreement.ends_on_exclusive is null or agreement.ends_on_exclusive > warsaw_day)
        and deal.stage = 'won'
        and deal.archived_at is null
        and (owner_filter is null or deal.owner_user_id = owner_filter)
    ),
    'open_deployments', (
      select count(*)
      from public.deployments as deployment
      where deployment.workspace_id = workspace
        and deployment.archived_at is null
        and deployment.status not in ('completed', 'cancelled')
    ),
    'paused_deployments', (
      select count(*)
      from public.deployments as deployment
      where deployment.workspace_id = workspace
        and deployment.archived_at is null
        and deployment.status = 'paused'
    ),
    'overdue_deployments', (
      select count(*)
      from public.deployments as deployment
      where deployment.workspace_id = workspace
        and deployment.archived_at is null
        and deployment.status not in ('completed', 'cancelled')
        and deployment.due_on is not null
        and deployment.due_on < warsaw_day
    ),
    'tasks_today', (
      select count(distinct task.id)
      from public.tasks as task
      join public.task_assignees as assignee
        on assignee.task_id = task.id
       and assignee.user_id = task_user
      where task.workspace_id = workspace
        and task.archived_at is null
        and task.status in ('todo', 'in_progress')
        and task.due_on = warsaw_day
    ),
    'tasks_overdue', (
      select count(distinct task.id)
      from public.tasks as task
      join public.task_assignees as assignee
        on assignee.task_id = task.id
       and assignee.user_id = task_user
      where task.workspace_id = workspace
        and task.archived_at is null
        and task.status in ('todo', 'in_progress')
        and task.due_on is not null
        and task.due_on < warsaw_day
    ),
    'tasks_hourly_overdue', (
      select count(distinct task.id)
      from public.tasks as task
      join public.task_assignees as assignee
        on assignee.task_id = task.id
       and assignee.user_id = task_user
      where task.workspace_id = workspace
        and task.archived_at is null
        and task.status in ('todo', 'in_progress')
        and task.due_on = warsaw_day
        and task.due_at is not null
        and task.due_at < pg_catalog.now()
    ),
    'new_leads', (
      select count(*)
      from public.deals as deal
      join public.accounts as account
        on account.id = deal.account_id
       and account.workspace_id = deal.workspace_id
      where deal.workspace_id = workspace
        and deal.archived_at is null
        and account.archived_at is null
        and (deal.created_at at time zone 'Europe/Warsaw')::date
          between period_from and period_to
        and (owner_filter is null or deal.owner_user_id = owner_filter)
        and (source_filter is null or deal.source = source_filter)
    ),
    'won_finalized', (
      select count(*)
      from public.deals as deal
      where deal.workspace_id = workspace
        and deal.archived_at is null
        and deal.stage = 'won'
        and deal.won_at is not null
        and (deal.won_at at time zone 'Europe/Warsaw')::date
          between period_from and period_to
        and (owner_filter is null or deal.owner_user_id = owner_filter)
        and exists (
          select 1
          from public.billing_agreements as agreement
          where agreement.deal_id = deal.id
            and agreement.workspace_id = deal.workspace_id
            and agreement.status <> 'void'
        )
    ),
    'won_closed', (
      select count(*)
      from public.deals as deal
      where deal.workspace_id = workspace
        and deal.archived_at is null
        and deal.stage = 'won'
        and deal.won_at is not null
        and (deal.won_at at time zone 'Europe/Warsaw')::date
          between period_from and period_to
        and (owner_filter is null or deal.owner_user_id = owner_filter)
    ),
    'lost_closed', (
      select count(*)
      from public.deals as deal
      where deal.workspace_id = workspace
        and deal.archived_at is null
        and deal.stage = 'lost'
        and deal.lost_at is not null
        and (deal.lost_at at time zone 'Europe/Warsaw')::date
          between period_from and period_to
        and (owner_filter is null or deal.owner_user_id = owner_filter)
    ),
    'open_setup_cents', (
      select coalesce(sum(deal.setup_amount_gross_cents), 0)
      from public.deals as deal
      where deal.workspace_id = workspace
        and deal.archived_at is null
        and deal.stage = any (open_stages)
        and (owner_filter is null or deal.owner_user_id = owner_filter)
    ),
    'open_setup_missing', (
      select count(*)
      from public.deals as deal
      where deal.workspace_id = workspace
        and deal.archived_at is null
        and deal.stage = any (open_stages)
        and deal.setup_amount_gross_cents is null
        and (owner_filter is null or deal.owner_user_id = owner_filter)
    ),
    'open_monthly_cents', (
      select coalesce(sum(deal.monthly_amount_gross_cents), 0)
      from public.deals as deal
      where deal.workspace_id = workspace
        and deal.archived_at is null
        and deal.stage = any (open_stages)
        and (owner_filter is null or deal.owner_user_id = owner_filter)
    ),
    'open_monthly_missing', (
      select count(*)
      from public.deals as deal
      where deal.workspace_id = workspace
        and deal.archived_at is null
        and deal.stage = any (open_stages)
        and deal.monthly_amount_gross_cents is null
        and (owner_filter is null or deal.owner_user_id = owner_filter)
    ),
    'funnel', (
      select coalesce(jsonb_agg(
        jsonb_build_object('stage', funnel_row.stage_code, 'count', funnel_row.stage_count)
        order by funnel_row.sort_order
      ), '[]'::jsonb)
      from (
        select
          stage_list.stage_code,
          stage_list.sort_order,
          count(deal.id) as stage_count
        from unnest(open_stages) with ordinality as stage_list(stage_code, sort_order)
        left join public.deals as deal
          on deal.workspace_id = workspace
         and deal.stage = stage_list.stage_code
         and deal.archived_at is null
         and (owner_filter is null or deal.owner_user_id = owner_filter)
        group by stage_list.stage_code, stage_list.sort_order
      ) as funnel_row
    ),
    'chart', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'month', chart_row.month_start,
        'setup_cents', chart_row.setup_cents,
        'subscription_cents', chart_row.subscription_cents,
        'total_cents', chart_row.total_cents
      ) order by chart_row.month_start), '[]'::jsonb)
      from (
        select
          series.month_start::date as month_start,
          coalesce(sum(entry.amount_signed_cents) filter (where entry.component = 'setup'), 0) as setup_cents,
          coalesce(sum(entry.amount_signed_cents) filter (where entry.component = 'subscription'), 0) as subscription_cents,
          coalesce(sum(entry.amount_signed_cents), 0) as total_cents
        from generate_series(
          (date_trunc('month', warsaw_day::timestamp) - interval '5 months')::date,
          date_trunc('month', warsaw_day::timestamp)::date,
          interval '1 month'
        ) as series(month_start)
        left join lateral private.period_revenue_filtered(
          workspace,
          series.month_start::date,
          ((series.month_start::date + interval '1 month')::date - 1),
          'all'
        ) as entry on true
        group by series.month_start
      ) as chart_row
    ),
    'today_tasks', (
      select coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', listed.id,
          'title', listed.title,
          'due_on', listed.due_on,
          'due_at', listed.due_at
        ) order by listed.due_at nulls last, listed.title)
        from (
          select task.id, task.title, task.due_on, task.due_at
          from public.tasks as task
          join public.task_assignees as assignee
            on assignee.task_id = task.id
           and assignee.user_id = task_user
          where task.workspace_id = workspace
            and task.archived_at is null
            and task.status in ('todo', 'in_progress')
            and task.due_on = warsaw_day
          order by task.due_at nulls last, task.title
          limit 8
        ) as listed
      ), '[]'::jsonb)
    ),
    'overdue_deployment_rows', (
      select coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', listed.id,
          'name', listed.name,
          'due_on', listed.due_on,
          'status', listed.status
        ) order by listed.due_on, listed.name)
        from (
          select deployment.id, deployment.name, deployment.due_on, deployment.status
          from public.deployments as deployment
          where deployment.workspace_id = workspace
            and deployment.archived_at is null
            and deployment.status not in ('completed', 'cancelled')
            and deployment.due_on is not null
            and deployment.due_on < warsaw_day
          order by deployment.due_on, deployment.name
          limit 8
        ) as listed
      ), '[]'::jsonb)
    ),
    'meetings', (
      select coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', listed.id,
          'title', listed.title,
          'started_at', listed.started_at
        ) order by listed.started_at desc)
        from (
          select meeting.id, meeting.title, meeting.started_at
          from public.meeting_records as meeting
          where meeting.workspace_id = workspace
            and meeting.started_at <= pg_catalog.now()
          order by meeting.started_at desc
          limit 5
        ) as listed
      ), '[]'::jsonb)
    ),
    'sources', (
      select coalesce(jsonb_agg(source_name order by source_name), '[]'::jsonb)
      from (
        select distinct deal.source as source_name
        from public.deals as deal
        where deal.workspace_id = workspace
      ) as source_row
    )
  );
end;
$$;

create or replace function private.list_period_revenue(
  p_actor_user_id uuid,
  p_from date,
  p_to date,
  p_kind text,
  p_owner_user_id uuid,
  p_limit integer,
  p_offset integer
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
<<ledger>>
declare
  workspace uuid;
  warsaw_day date;
  owner_filter uuid;
  row_limit integer;
  row_offset integer;
begin
  perform private.assert_server_role();

  select member.workspace_id
    into workspace
  from public.workspace_members as member
  where member.user_id = p_actor_user_id
    and member.active
  limit 1;

  if workspace is null then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  perform private.require_active_member(workspace, p_actor_user_id);

  if p_kind is null or p_kind not in ('all', 'setup', 'subscription', 'active') then
    raise exception 'period_invalid' using errcode = '22023';
  end if;

  row_limit := case
    when p_limit is null or p_limit < 1 or p_limit > 25 then 25
    else p_limit
  end;
  row_offset := case when p_offset is null or p_offset < 0 then 0 else p_offset end;
  warsaw_day := private.warsaw_today();
  owner_filter := p_owner_user_id;

  if p_kind = 'active' then
    return jsonb_build_object(
      'count', (
        select count(*)
        from public.billing_agreements as agreement
        join public.deals as deal
          on deal.id = agreement.deal_id
         and deal.workspace_id = agreement.workspace_id
        where agreement.workspace_id = workspace
          and agreement.kind = 'subscription'
          and agreement.status = 'active'
          and agreement.starts_on <= warsaw_day
          and (agreement.ends_on_exclusive is null or agreement.ends_on_exclusive > warsaw_day)
          and deal.stage = 'won'
          and deal.archived_at is null
          and (owner_filter is null or deal.owner_user_id = owner_filter)
      ),
      'total_cents', (
        select coalesce(sum(agreement.amount_gross_cents), 0)
        from public.billing_agreements as agreement
        join public.deals as deal
          on deal.id = agreement.deal_id
         and deal.workspace_id = agreement.workspace_id
        where agreement.workspace_id = workspace
          and agreement.kind = 'subscription'
          and agreement.status = 'active'
          and agreement.starts_on <= warsaw_day
          and (agreement.ends_on_exclusive is null or agreement.ends_on_exclusive > warsaw_day)
          and deal.stage = 'won'
          and deal.archived_at is null
          and (owner_filter is null or deal.owner_user_id = owner_filter)
      ),
      'rows', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', listed.id,
          'amount_gross_cents', listed.amount_gross_cents,
          'deal_id', listed.deal_id,
          'deal_title', listed.deal_title,
          'account_id', listed.account_id,
          'account_name', listed.account_name,
          'starts_on', listed.starts_on,
          'ends_on_exclusive', listed.ends_on_exclusive
        ) order by listed.account_name, listed.deal_title), '[]'::jsonb)
        from (
          select
            agreement.id,
            agreement.amount_gross_cents,
            agreement.deal_id,
            deal.title as deal_title,
            agreement.account_id,
            account.display_name as account_name,
            agreement.starts_on,
            agreement.ends_on_exclusive
          from public.billing_agreements as agreement
          join public.deals as deal
            on deal.id = agreement.deal_id
           and deal.workspace_id = agreement.workspace_id
          join public.accounts as account
            on account.id = agreement.account_id
           and account.workspace_id = agreement.workspace_id
          where agreement.workspace_id = workspace
            and agreement.kind = 'subscription'
            and agreement.status = 'active'
            and agreement.starts_on <= warsaw_day
            and (agreement.ends_on_exclusive is null or agreement.ends_on_exclusive > warsaw_day)
            and deal.stage = 'won'
            and deal.archived_at is null
            and (owner_filter is null or deal.owner_user_id = owner_filter)
          order by account.display_name, deal.title
          limit row_limit
          offset row_offset
        ) as listed
      )
    );
  end if;

  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'period_invalid' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'count', (
      select count(*)
      from private.period_revenue_filtered(workspace, p_from, p_to, p_kind) as entry
    ),
    'total_cents', (
      select coalesce(sum(entry.amount_signed_cents), 0)
      from private.period_revenue_filtered(workspace, p_from, p_to, p_kind) as entry
    ),
    'rows', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', listed.id,
        'entry_type', listed.entry_type,
        'component', listed.component,
        'effective_on', listed.effective_on,
        'amount_signed_cents', listed.amount_signed_cents,
        'deal_id', listed.deal_id,
        'deal_title', listed.deal_title,
        'account_id', listed.account_id,
        'account_name', listed.account_name,
        'reason', listed.reason
      ) order by listed.effective_on, listed.id), '[]'::jsonb)
      from (
        select
          entry.id,
          entry.entry_type,
          entry.component,
          entry.effective_on,
          entry.amount_signed_cents,
          entry.deal_id,
          deal.title as deal_title,
          entry.account_id,
          account.display_name as account_name,
          entry.reason
        from private.period_revenue_filtered(workspace, p_from, p_to, p_kind) as entry
        join public.deals as deal
          on deal.id = entry.deal_id
        join public.accounts as account
          on account.id = entry.account_id
        order by entry.effective_on, entry.id
        limit row_limit
        offset row_offset
      ) as listed
    )
  );
end;
$$;

revoke all on function private.revenue_component(text, text) from public, anon, authenticated;
revoke all on function private.period_revenue_filtered(uuid, date, date, text) from public, anon, authenticated;
revoke all on function private.dashboard_snapshot(uuid, date, date, uuid, text) from public, anon, authenticated;
revoke all on function private.list_period_revenue(uuid, date, date, text, uuid, integer, integer) from public, anon, authenticated;

grant execute on function private.revenue_component(text, text) to service_role;
grant execute on function private.period_revenue_filtered(uuid, date, date, text) to service_role;
grant execute on function private.dashboard_snapshot(uuid, date, date, uuid, text) to service_role;
grant execute on function private.list_period_revenue(uuid, date, date, text, uuid, integer, integer) to service_role;
