-- Dodaje statusy leada: Niezakwalifikowany (unqualified) i Klient (client),
-- oraz automatyczne tworzenie klienta (relationship = 'client') po wybraniu statusu Klient.

do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'deals'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%stage%'
      and con.conname <> 'deals_lost_reason'
  loop
    execute format('alter table public.deals drop constraint %I', c.conname);
  end loop;
end
$$;

alter table public.deals
  add constraint deals_stage_check check (stage in (
    'new',
    'contact_attempt',
    'conversation_done',
    'meeting_scheduled',
    'meeting_done',
    'offer_sent',
    'negotiation',
    'unqualified',
    'client',
    'won',
    'lost'
  ));

create or replace function private.change_deal_stage(
  p_actor_user_id uuid,
  p_deal_id uuid,
  p_expected_version integer,
  p_stage text,
  p_lost_reason text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  deal public.deals%rowtype;
  reason text;
  other_client_deal boolean;
begin
  perform private.assert_server_role();
  if p_stage = 'won' or p_stage is null then
    raise exception 'finalization_required' using errcode = 'P0001';
  end if;
  if p_stage not in (
    'new',
    'contact_attempt',
    'conversation_done',
    'meeting_scheduled',
    'meeting_done',
    'offer_sent',
    'negotiation',
    'unqualified',
    'client',
    'lost'
  ) then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  select * into deal from public.deals where id = p_deal_id for update;
  if not found or deal.archived_at is not null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_active_member(deal.workspace_id, p_actor_user_id);
  if deal.stage = 'won' then
    raise exception 'finalization_required' using errcode = 'P0001';
  end if;
  if deal.version is distinct from p_expected_version then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;
  if deal.stage = p_stage then
    if p_stage = 'client' then
      update public.accounts
      set relationship = 'client',
          updated_by = p_actor_user_id
      where id = deal.account_id
        and relationship is distinct from 'client';
    end if;
    return;
  end if;

  reason := private.blank_to_null(p_lost_reason);
  if p_stage = 'lost' and (reason is null or pg_catalog.char_length(reason) > 500) then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  update public.deals
  set stage = p_stage,
      won_at = case
        when p_stage = 'client' then coalesce(deal.won_at, pg_catalog.now())
        else null
      end,
      lost_reason = case when p_stage = 'lost' then reason else null end,
      lost_at = case
        when p_stage in ('lost', 'unqualified') then pg_catalog.now()
        else null
      end,
      updated_by = p_actor_user_id
  where id = deal.id;

  if p_stage = 'client' then
    update public.accounts
    set relationship = 'client',
        updated_by = p_actor_user_id
    where id = deal.account_id
      and relationship is distinct from 'client';
  elsif deal.stage = 'client' then
    select exists (
      select 1
      from public.deals as other
      where other.account_id = deal.account_id
        and other.id <> deal.id
        and other.stage in ('won', 'client')
        and other.archived_at is null
    )
      into other_client_deal;

    if not other_client_deal then
      update public.accounts
      set relationship = 'prospect',
          updated_by = p_actor_user_id
      where id = deal.account_id
        and relationship = 'client';
    end if;
  end if;

  insert into public.deal_stage_history (
    workspace_id, deal_id, from_stage, to_stage, actor_user_id, created_by
  )
  values (
    deal.workspace_id, deal.id, deal.stage, p_stage, p_actor_user_id, p_actor_user_id
  );

  insert into public.activities (
    workspace_id, account_id, deal_id, activity_type, actor_type, actor_user_id, payload, created_by
  )
  values (
    deal.workspace_id, deal.account_id, deal.id, 'stage_changed', 'user', p_actor_user_id,
    jsonb_build_object('deal_id', deal.id, 'from_stage', deal.stage, 'to_stage', p_stage),
    p_actor_user_id
  );
end;
$$;

create or replace function private.revert_deal_finalization(
  p_actor_user_id uuid,
  p_deal_id uuid,
  p_expected_version integer,
  p_target_stage text,
  p_lost_reason text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  deal public.deals%rowtype;
  agreement public.billing_agreements%rowtype;
  entry public.revenue_entries%rowtype;
  other_won boolean;
begin
  perform private.assert_server_role();

  if p_target_stage is null or p_target_stage not in (
    'new',
    'contact_attempt',
    'conversation_done',
    'meeting_scheduled',
    'meeting_done',
    'offer_sent',
    'negotiation',
    'unqualified',
    'client',
    'lost'
  ) then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  if p_target_stage = 'lost'
    and (
      p_lost_reason is null
      or pg_catalog.char_length(pg_catalog.btrim(p_lost_reason)) not between 1 and 500
    ) then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  select *
    into deal
  from public.deals
  where id = p_deal_id
  for update;

  if not found or deal.stage <> 'won' then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  perform private.require_active_member(deal.workspace_id, p_actor_user_id);

  if deal.version is distinct from p_expected_version then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;

  for agreement in
    select *
    from public.billing_agreements as row
    where row.deal_id = deal.id
      and row.status <> 'void'
    for update
  loop
    update public.billing_agreements
    set status = 'void',
        ends_on_exclusive = case
          when agreement.kind = 'subscription'
            and private.warsaw_today() > agreement.starts_on
            then least(
              coalesce(agreement.ends_on_exclusive, private.warsaw_today()),
              private.warsaw_today()
            )
          else agreement.ends_on_exclusive
        end,
        updated_by = p_actor_user_id
    where id = agreement.id;
  end loop;

  for entry in
    select *
    from public.revenue_entries as row
    where row.deal_id = deal.id
      and row.entry_type <> 'correction'
      and not exists (
        select 1
        from public.revenue_entries as correction
        where correction.reverses_entry_id = row.id
      )
    for update
  loop
    perform private.correct_revenue_entry(
      p_actor_user_id,
      entry.id,
      'Cofnięcie finalizacji'
    );
  end loop;

  update public.deals
  set stage = p_target_stage,
      won_at = case when p_target_stage = 'client' then deal.won_at else null end,
      lost_at = case when p_target_stage in ('lost', 'unqualified') then pg_catalog.now() else null end,
      lost_reason = case
        when p_target_stage = 'lost' then pg_catalog.btrim(p_lost_reason)
        else null
      end,
      updated_by = p_actor_user_id
  where id = deal.id;

  insert into public.deal_stage_history (
    workspace_id, deal_id, from_stage, to_stage, actor_user_id, created_by
  )
  values (
    deal.workspace_id,
    deal.id,
    'won',
    p_target_stage,
    p_actor_user_id,
    p_actor_user_id
  );

  select exists (
    select 1
    from public.deals as other
    where other.account_id = deal.account_id
      and other.id <> deal.id
      and other.stage in ('won', 'client')
      and other.archived_at is null
  )
    into other_won;

  if p_target_stage = 'client' or other_won then
    update public.accounts
    set relationship = 'client',
        updated_by = p_actor_user_id
    where id = deal.account_id
      and relationship is distinct from 'client';
  else
    update public.accounts
    set relationship = 'prospect',
        updated_by = p_actor_user_id
    where id = deal.account_id;
  end if;

  perform private.record_domain_event(
    deal.workspace_id,
    'deal.finalization_reverted',
    'deal',
    deal.id,
    jsonb_build_object('deal_id', deal.id, 'account_id', deal.account_id),
    'revert:' || deal.id::text || ':' || p_expected_version::text
  );
end;
$$;

create or replace view public.client_directory
with (security_invoker = true) as
select
  account.id,
  account.workspace_id,
  account.display_name,
  account.company_name,
  account.kind,
  account.relationship,
  account.service_status,
  account.archived_at,
  account.version,
  (
    select contact.full_name
    from public.contacts as contact
    where contact.account_id = account.id
      and contact.archived_at is null
      and contact.is_primary
    order by contact.created_at
    limit 1
  ) as primary_contact_name,
  0::integer as open_deployment_count,
  (
    select count(*)::integer
    from public.billing_agreements as agreement
    where agreement.account_id = account.id
      and agreement.kind = 'subscription'
      and agreement.status = 'active'
  ) as active_subscription_count,
  (
    select string_agg(distinct deal.product_type, ',' order by deal.product_type)
    from public.deals as deal
    where deal.account_id = account.id
      and deal.archived_at is null
      and deal.stage in ('won', 'client')
      and deal.product_type is not null
  ) as active_products,
  (
    select max(activity.occurred_at)
    from public.activities as activity
    where activity.account_id = account.id
  ) as last_activity_at,
  (
    select owner_profile.full_name
    from public.deals as deal
    join public.profiles as owner_profile
      on owner_profile.user_id = deal.owner_user_id
     and owner_profile.workspace_id = deal.workspace_id
    where deal.account_id = account.id
      and deal.archived_at is null
      and deal.owner_user_id is not null
    order by deal.created_at desc
    limit 1
  ) as owner_name
from public.accounts as account
where account.relationship = 'client';

grant select on public.client_directory to authenticated, service_role;
revoke all on public.client_directory from anon, public;

revoke all on function private.change_deal_stage(uuid, uuid, integer, text, text) from public, anon, authenticated;
grant execute on function private.change_deal_stage(uuid, uuid, integer, text, text) to service_role;
revoke all on function private.revert_deal_finalization(uuid, uuid, integer, text, text) from public, anon, authenticated;
grant execute on function private.revert_deal_finalization(uuid, uuid, integer, text, text) to service_role;
