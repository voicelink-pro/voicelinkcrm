-- Odbiór etapu 5. Transakcja kończy się rollbackiem, seed zostaje.

begin;

do $$
declare
  anna uuid := '20000000-0000-4000-8000-000000000001';
  gabinet uuid := '40000000-0000-4000-8000-000000000001';
  created jsonb;
  deal uuid;
  account uuid;
  start_on date;
  revenue bigint;
  rows integer;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);

  created := private.create_manual_lead(
    anna, 'Finans Testowy', null, 'finans.test@przyklad.test', '+48600900111',
    'voice_assistant', 'Finans Testowy', anna, false
  );
  deal := (created ->> 'deal_id')::uuid;
  account := (created ->> 'account_id')::uuid;
  start_on := private.warsaw_today() - 40;

  perform private.finalize_deal(
    anna,
    deal,
    1,
    0,
    private.warsaw_today() + 30,
    100000,
    start_on,
    start_on + 1,
    start_on - 1
  );

  select count(*), coalesce(sum(entry.amount_signed_cents), 0)
    into rows, revenue
  from public.revenue_entries as entry
  where entry.deal_id = deal;
  if rows <> 0 or revenue <> 0 then
    raise exception 'before_catch_up % %', rows, revenue;
  end if;

  if private.catch_up_due_revenue(anna, account) <> 1 then
    raise exception 'catch_up_count';
  end if;

  select count(*), coalesce(sum(entry.amount_signed_cents), 0)
    into rows, revenue
  from public.revenue_entries as entry
  where entry.deal_id = deal
    and entry.effective_on = start_on
    and entry.entry_type = 'subscription';
  if rows <> 1 or revenue <> 100000 then
    raise exception 'caught_cycle % %', rows, revenue;
  end if;

  if private.catch_up_due_revenue(anna, account) <> 0 then
    raise exception 'catch_up_repeat';
  end if;

  if (
    select coalesce(sum(entry.amount_signed_cents), 0)
    from public.revenue_entries as entry
    where entry.account_id = gabinet
      and entry.effective_on <= private.warsaw_today()
  ) <> 500000 then
    raise exception 'gabinet_revenue';
  end if;

  if (
    select deployment.value_gross_cents
    from public.deployments as deployment
    where deployment.id = '40000000-0000-4000-8000-000000000004'
  ) <> 300000 then
    raise exception 'deployment_value';
  end if;
end;
$$;

rollback;
