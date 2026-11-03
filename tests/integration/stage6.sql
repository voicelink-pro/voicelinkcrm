-- Odbiór etapu 6. Transakcja kończy się rollbackiem, seed zostaje.

begin;

do $$
declare
  anna uuid := '20000000-0000-4000-8000-000000000001';
  gabinet uuid := '40000000-0000-4000-8000-000000000001';
  gabinet_deal uuid := '40000000-0000-4000-8000-000000000003';
  kawiarnia uuid := '30000000-0000-4000-8000-000000000001';
  kawiarnia_deal uuid := '30000000-0000-4000-8000-000000000003';
  before_sum bigint;
  after_sum bigint;
  before_rows integer;
  after_rows integer;
  voice_id uuid;
  site_id uuid;
  infra_id uuid;
  item_id uuid;
  owner_hits integer;
  history_rows integer;
  status_events integer;
  completed timestamptz;
  same_deal integer;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);

  select coalesce(sum(entry.amount_signed_cents), 0), count(*)
    into before_sum, before_rows
  from public.revenue_entries as entry
  where entry.account_id = gabinet;

  voice_id := private.create_deployment(
    anna, gabinet, gabinet_deal, 'voice_assistant', 'Asystent dodatkowy', null,
    'Osoba spoza zespołu', null, null, null
  );
  site_id := private.create_deployment(
    anna, gabinet, gabinet_deal, 'website', 'Strona gabinetu', 'Opis strony',
    'Osoba spoza zespołu', 0, null, private.warsaw_today() - 1
  );
  infra_id := private.create_deployment(
    anna, gabinet, gabinet_deal, 'digital_infrastructure', 'Infrastruktura gabinetu', null,
    'Osoba spoza zespołu', 150000, private.warsaw_today(), private.warsaw_today() + 7
  );

  select count(*) into owner_hits
  from public.profiles
  where full_name = 'Osoba spoza zespołu';
  if owner_hits <> 0 then
    raise exception 'owner_should_not_be_a_user';
  end if;

  if (select due_on from public.deployments where id = voice_id) is not null
    or (select due_on from public.deployments where id = site_id) <> private.warsaw_today() - 1
    or (select value_gross_cents from public.deployments where id = site_id) <> 0
    or (select status from public.deployments where id = infra_id) <> 'todo' then
    raise exception 'deployment_fields_mismatch';
  end if;

  select count(*) into same_deal
  from public.deployments
  where deal_id = gabinet_deal
    and archived_at is null;
  if same_deal < 4 then
    raise exception 'same_deal_count %', same_deal;
  end if;

  select coalesce(sum(entry.amount_signed_cents), 0), count(*)
    into after_sum, after_rows
  from public.revenue_entries as entry
  where entry.account_id = gabinet;
  if after_sum is distinct from before_sum
    or after_rows is distinct from before_rows
    or after_sum <> 500000 then
    raise exception 'revenue_changed % %', after_sum, after_rows;
  end if;

  begin
    perform private.create_deployment(
      anna, kawiarnia, kawiarnia_deal, 'website', 'Niedozwolone', null,
      'Osoba spoza zespołu', null, null, null
    );
    raise exception 'open_deal_was_accepted';
  exception
    when others then
      if sqlerrm not like '%invalid_state%' then
        raise;
      end if;
  end;

  begin
    perform private.update_deployment(
      anna, site_id, 1, kawiarnia, gabinet_deal, 'website', 'Strona gabinetu', null,
      'Osoba spoza zespołu', 0, null, private.warsaw_today() - 1
    );
    raise exception 'cross_account_was_accepted';
  exception
    when others then
      if sqlerrm not like '%cross_reference%' then
        raise;
      end if;
  end;

  perform private.change_deployment_status(anna, site_id, 1, 'completed');
  select completed_at into completed from public.deployments where id = site_id;
  if completed is null then
    raise exception 'completed_at_missing';
  end if;

  perform private.change_deployment_status(anna, site_id, 2, 'in_progress');
  select completed_at into completed from public.deployments where id = site_id;
  if completed is not null or (select status from public.deployments where id = site_id) <> 'in_progress' then
    raise exception 'reopen_failed';
  end if;

  perform private.change_deployment_status(anna, site_id, 3, 'paused');
  perform private.change_deployment_status(anna, site_id, 4, 'cancelled');
  if (select completed_at from public.deployments where id = site_id) is not null
    or (select status from public.deployments where id = site_id) <> 'cancelled' then
    raise exception 'cancel_failed';
  end if;

  select count(*) into history_rows
  from public.deployment_status_history
  where deployment_id = site_id;
  select count(*) into status_events
  from private.domain_events
  where aggregate_id = site_id
    and event_type = 'deployment.status_changed';
  if history_rows <> 5 or status_events <> 4 then
    raise exception 'history % events %', history_rows, status_events;
  end if;

  item_id := private.add_checklist_item(anna, voice_id, 'Sprawdzić numer');
  perform private.set_checklist_item(anna, item_id, 1, true);
  if (select is_done from public.deployment_checklist_items where id = item_id) is not true then
    raise exception 'checklist_failed';
  end if;
end;
$$;

rollback;
