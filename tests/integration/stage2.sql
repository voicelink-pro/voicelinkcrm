-- Odbiór etapu 2. Całość jest transakcją i kończy się rollbackiem, więc seed zostaje.
-- Uruchamiać po `supabase db reset`, jako postgres.

begin;

-- Daty cykli liczone od miesiąca startu i dnia kotwicy, nie od poprzedniej obciętej daty.
do $$
begin
  if private.subscription_cycle_date(date '2026-11-12', 12, 0) <> date '2026-11-12'
    or private.subscription_cycle_date(date '2026-11-12', 12, 1) <> date '2026-12-12'
    or private.subscription_cycle_date(date '2026-11-12', 12, 2) <> date '2027-01-12' then
    raise exception 'cycle_november';
  end if;

  if private.subscription_cycle_date(date '2027-01-31', 31, 0) <> date '2027-01-31'
    or private.subscription_cycle_date(date '2027-01-31', 31, 1) <> date '2027-02-28'
    or private.subscription_cycle_date(date '2027-01-31', 31, 2) <> date '2027-03-31' then
    raise exception 'cycle_january_31';
  end if;

  if private.subscription_cycle_date(date '2028-01-31', 31, 0) <> date '2028-01-31'
    or private.subscription_cycle_date(date '2028-01-31', 31, 1) <> date '2028-02-29'
    or private.subscription_cycle_date(date '2028-01-31', 31, 2) <> date '2028-03-31' then
    raise exception 'cycle_leap';
  end if;

  if private.normalize_phone('p: +48 111-222-333') <> '+48111222333' then
    raise exception 'phone_prefix';
  end if;

  if private.normalize_phone('111222333') is not null then
    raise exception 'phone_local_must_stay_null';
  end if;

  if private.normalize_email('  Test@Example.TEST ') <> 'test@example.test' then
    raise exception 'email_normalize';
  end if;
end $$;

-- Anon nie czyta CRM. Członek czyta. Obce konto dostaje pusty wynik.
do $$
declare
  seen integer;
begin
  begin
    execute 'set local role anon';
    perform 1 from public.accounts;
    raise exception 'anon_should_fail';
  exception
    when insufficient_privilege then
      null;
  end;
  execute 'reset role';

  perform set_config(
    'request.jwt.claims',
    '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',
    true
  );
  execute 'set local role authenticated';
  select count(*) into seen from public.accounts;
  if seen <> 2 then
    raise exception 'member_accounts_%', seen;
  end if;
  select count(*) into seen from public.deals;
  if seen <> 2 then
    raise exception 'member_deals_%', seen;
  end if;
  select count(*) into seen from public.notifications;
  if seen <> 1 then
    raise exception 'own_notifications_%', seen;
  end if;
  execute 'reset role';

  perform set_config(
    'request.jwt.claims',
    '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}',
    true
  );
  execute 'set local role authenticated';
  select count(*) into seen from public.accounts;
  if seen <> 2 then
    raise exception 'second_member_accounts_%', seen;
  end if;
  select count(*) into seen from public.notifications;
  if seen <> 0 then
    raise exception 'other_notifications_visible';
  end if;
  execute 'reset role';
end $$;

do $$
declare
  seen integer;
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, reauthentication_token, created_at, updated_at
  )
  values (
    '00000000-0000-0000-0000-000000000000',
    '20000000-0000-4000-8000-000000000099',
    'authenticated',
    'authenticated',
    'obcy@przyklad.test',
    extensions.crypt(encode(extensions.gen_random_bytes(32), 'hex'), extensions.gen_salt('bf')),
    now(),
    '', '', '', '', '', '',
    now(), now()
  );

  perform set_config(
    'request.jwt.claims',
    '{"sub":"20000000-0000-4000-8000-000000000099","role":"authenticated"}',
    true
  );
  execute 'set local role authenticated';
  select count(*) into seen from public.accounts;
  if seen <> 0 then
    raise exception 'foreign_user_saw_accounts';
  end if;
  select count(*) into seen from public.revenue_entries;
  if seen <> 0 then
    raise exception 'foreign_user_saw_revenue';
  end if;

  begin
    insert into public.revenue_entries (
      workspace_id, agreement_id, deal_id, account_id, entry_type, effective_on,
      amount_signed_cents, dedupe_key
    )
    values (
      '10000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000003',
      '40000000-0000-4000-8000-000000000003',
      '40000000-0000-4000-8000-000000000001',
      'setup',
      date '2026-10-29',
      1,
      'illegal'
    );
    raise exception 'member_write_should_fail';
  exception
    when insufficient_privilege then
      null;
  end;
  execute 'reset role';

  update public.workspace_members
  set active = false
  where user_id = '20000000-0000-4000-8000-000000000001';

  perform set_config(
    'request.jwt.claims',
    '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}',
    true
  );
  execute 'set local role authenticated';
  select count(*) into seen from public.accounts;
  if seen <> 0 then
    raise exception 'inactive_member_saw_accounts';
  end if;
  execute 'reset role';

  update public.workspace_members
  set active = true
  where user_id = '20000000-0000-4000-8000-000000000001';
end $$;

-- Powiązanie z innego workspace albo z innym kontem jest odrzucane.
do $$
declare
  other_workspace uuid := '10000000-0000-4000-8000-000000000099';
  other_account uuid := '30000000-0000-4000-8000-000000000099';
  other_contact uuid := '30000000-0000-4000-8000-000000000098';
begin
  insert into public.workspaces (id, name) values (other_workspace, 'Inny');
  insert into public.accounts (id, workspace_id, kind, relationship, display_name)
  values (other_account, other_workspace, 'unknown', 'prospect', 'Obce konto');
  insert into public.contacts (id, workspace_id, account_id, full_name, is_primary)
  values (other_contact, other_workspace, other_account, 'Obcy kontakt', true);

  begin
    insert into public.deals (
      workspace_id, account_id, primary_contact_id, title, source, stage
    )
    values (
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      other_contact,
      'Złe powiązanie',
      'manual',
      'new'
    );
    raise exception 'cross_workspace_should_fail';
  exception
    when check_violation then
      if sqlerrm <> 'cross_reference' then
        raise;
      end if;
  end;

  begin
    insert into public.deals (
      workspace_id, account_id, primary_contact_id, title, source, stage
    )
    values (
      '10000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000002',
      'Kontakt z innego konta',
      'manual',
      'new'
    );
    raise exception 'cross_account_should_fail';
  exception
    when check_violation then
      if sqlerrm <> 'cross_reference' then
        raise;
      end if;
  end;
end $$;

-- Import leada: nowy rekord, powtórzenie, konflikt skrótu, dopasowanie i test.
do $$
declare
  created jsonb;
  repeated jsonb;
  duplicate jsonb;
  review jsonb;
  ignored jsonb;
  invalid jsonb;
  deals_before integer;
  deals_after integer;
begin
  select count(*) into deals_before from public.deals;

  created := private.import_lead(
    '10000000-0000-4000-8000-000000000001',
    'evt-1',
    'form',
    'src-1',
    'hash-1',
    'Ola Nowa',
    '  Ola.Nowa@Przyklad.test ',
    'p: +48 500-777-888',
    false
  );
  if created ->> 'status' <> 'created' then
    raise exception 'import_created_%', created;
  end if;

  if (
    select email_normalized from public.contacts where id = (created ->> 'contact_id')::uuid
  ) <> 'ola.nowa@przyklad.test' then
    raise exception 'import_email';
  end if;

  if (
    select phone_e164 from public.contacts where id = (created ->> 'contact_id')::uuid
  ) <> '+48500777888' then
    raise exception 'import_phone';
  end if;

  if (
    select setup_amount_gross_cents from public.deals where id = (created ->> 'deal_id')::uuid
  ) is not null then
    raise exception 'import_amount_must_be_null';
  end if;

  repeated := private.import_lead(
    '10000000-0000-4000-8000-000000000001',
    'evt-1',
    'form',
    'src-1',
    'hash-1',
    'Ola Nowa',
    'ola.nowa@przyklad.test',
    '+48500777888',
    false
  );
  if repeated ->> 'deal_id' <> created ->> 'deal_id' then
    raise exception 'import_repeat';
  end if;

  begin
    perform private.import_lead(
      '10000000-0000-4000-8000-000000000001',
      'evt-1',
      'form',
      'src-1',
      'hash-inny',
      'Ola Nowa',
      'ola.nowa@przyklad.test',
      '+48500777888',
      false
    );
    raise exception 'hash_conflict_missing';
  exception
    when others then
      if sqlerrm <> 'idempotency_conflict' then
        raise;
      end if;
  end;

  duplicate := private.import_lead(
    '10000000-0000-4000-8000-000000000001',
    'evt-2',
    'form',
    'src-1',
    'hash-2',
    'Inne imię',
    'inny@przyklad.test',
    '+48500999000',
    false
  );
  if duplicate ->> 'status' <> 'duplicate' then
    raise exception 'import_duplicate_%', duplicate;
  end if;

  select count(*) into deals_after from public.deals;
  if deals_after <> deals_before + 1 then
    raise exception 'import_created_extra_deals';
  end if;

  review := private.import_lead(
    '10000000-0000-4000-8000-000000000001',
    'evt-3',
    'form',
    'src-3',
    'hash-3',
    'Ktoś Inny',
    'ewa.przykladowa@przyklad.test',
    null,
    false
  );
  if review ->> 'status' <> 'review' then
    raise exception 'import_review_%', review;
  end if;

  if exists (
    select 1 from public.deals where title = 'Ktoś Inny'
  ) then
    raise exception 'review_created_deal';
  end if;

  ignored := private.import_lead(
    '10000000-0000-4000-8000-000000000001',
    'evt-test',
    'form',
    'src-test',
    'hash-test',
    'Test Dummy',
    'test@przyklad.test',
    '+48500111000',
    true
  );
  if ignored ->> 'status' <> 'ignored_test' then
    raise exception 'import_test_%', ignored;
  end if;

  if exists (select 1 from public.contacts where email_normalized = 'test@przyklad.test') then
    raise exception 'test_created_contact';
  end if;

  invalid := private.import_lead(
    '10000000-0000-4000-8000-000000000001',
    'evt-bad',
    'form',
    'src-bad',
    'hash-bad',
    'Bez kraju',
    null,
    '500111222',
    false
  );
  if invalid ->> 'status' <> 'invalid' then
    raise exception 'import_invalid_%', invalid;
  end if;
end $$;

-- Nie odebrał wymaga jawnej daty i nie cofa późniejszego etapu.
do $$
declare
  fresh uuid;
  result jsonb;
  assignees integer;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);

  insert into public.deals (
    id, workspace_id, account_id, title, source, stage, created_by
  )
  values (
    '30000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'Deal do follow-upu',
    'manual',
    'new',
    '20000000-0000-4000-8000-000000000001'
  )
  returning id into fresh;

  begin
    perform private.record_no_answer(
      '20000000-0000-4000-8000-000000000001',
      fresh,
      null,
      'no-date'
    );
    raise exception 'date_should_be_required';
  exception
    when others then
      if sqlerrm <> 'follow_up_date_required' then
        raise;
      end if;
  end;

  result := private.record_no_answer(
    '20000000-0000-4000-8000-000000000001',
    fresh,
    date '2026-10-29',
    'follow-1'
  );
  if result ->> 'status' <> 'created' then
    raise exception 'no_answer_created';
  end if;

  if (select stage from public.deals where id = fresh) <> 'contact_attempt' then
    raise exception 'stage_should_move_once';
  end if;

  select count(*) into assignees
  from public.task_assignees
  where task_id = (result ->> 'task_id')::uuid;
  if assignees <> 1 then
    raise exception 'follow_up_assignees_%', assignees;
  end if;

  if (
    select user_id from public.task_assignees where task_id = (result ->> 'task_id')::uuid
  ) <> '20000000-0000-4000-8000-000000000001' then
    raise exception 'follow_up_assignee';
  end if;

  if (private.record_no_answer(
    '20000000-0000-4000-8000-000000000001',
    fresh,
    date '2026-10-30',
    'follow-1'
  ) ->> 'status') <> 'existing' then
    raise exception 'no_answer_idempotent';
  end if;

  update public.deals
  set stage = 'negotiation'
  where id = '30000000-0000-4000-8000-000000000003';

  perform private.record_no_answer(
    '20000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000003',
    date '2026-11-02',
    'follow-2'
  );

  if (
    select stage from public.deals where id = '30000000-0000-4000-8000-000000000003'
  ) <> 'negotiation' then
    raise exception 'stage_rewound';
  end if;
end $$;

-- Finalizacja, naliczenia, korekta i cofnięcie.
do $$
declare
  fresh_deal uuid;
  account_id uuid;
  first jsonb;
  again jsonb;
  setup_id uuid;
  subscription_id uuid;
  entry_id uuid;
  replacement_id uuid;
  revenue bigint;
  agreement_version integer;
  new_agreement uuid;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);

  insert into public.accounts (
    workspace_id, kind, relationship, display_name
  )
  values (
    '10000000-0000-4000-8000-000000000001',
    'unknown',
    'prospect',
    'Klient rozliczeniowy'
  )
  returning id into account_id;

  insert into public.deals (
    workspace_id, account_id, title, source, stage
  )
  values (
    '10000000-0000-4000-8000-000000000001',
    account_id,
    'Deal rozliczeniowy',
    'manual',
    'negotiation'
  )
  returning id into fresh_deal;

  begin
    perform private.finalize_deal(
      '20000000-0000-4000-8000-000000000001',
      fresh_deal,
      1,
      null,
      date '2026-11-10',
      100000,
      date '2026-11-20',
      null,
      date '2026-11-19'
    );
    raise exception 'null_amount_should_fail';
  exception
    when others then
      if sqlerrm <> 'invalid_state' then
        raise;
      end if;
  end;

  first := private.finalize_deal(
    '20000000-0000-4000-8000-000000000001',
    fresh_deal,
    1,
    300000,
    date '2026-11-10',
    100000,
    date '2026-11-20',
    null,
    date '2026-11-19'
  );
  if first ->> 'status' <> 'created' or (first ->> 'revenue_cents')::bigint <> 300000 then
    raise exception 'finalize_nov_19_%', first;
  end if;

  if (select relationship from public.accounts where id = account_id) <> 'client' then
    raise exception 'account_should_be_client';
  end if;

  setup_id := (first ->> 'setup_agreement_id')::uuid;
  subscription_id := (first ->> 'subscription_agreement_id')::uuid;
  perform private.generate_due_revenue(subscription_id, date '2026-11-20');
  select coalesce(sum(amount_signed_cents), 0) into revenue
  from public.revenue_entries
  where deal_id = fresh_deal;
  if revenue <> 400000 then
    raise exception 'finalize_nov_20_%', revenue;
  end if;

  again := private.finalize_deal(
    '20000000-0000-4000-8000-000000000001',
    fresh_deal,
    99,
    300000,
    date '2026-11-10',
    100000,
    date '2026-11-20',
    null,
    date '2026-11-20'
  );
  if again ->> 'status' <> 'existing' then
    raise exception 'finalize_existing';
  end if;

  begin
    perform private.finalize_deal(
      '20000000-0000-4000-8000-000000000001',
      fresh_deal,
      1,
      1,
      date '2026-11-10',
      100000,
      date '2026-11-20',
      null,
      date '2026-11-20'
    );
    raise exception 'conflict_missing';
  exception
    when others then
      if sqlerrm <> 'finalization_conflict' then
        raise;
      end if;
  end;

  select id into entry_id
  from public.revenue_entries
  where agreement_id = setup_id
    and entry_type = 'setup';

  begin
    update public.revenue_entries
    set amount_signed_cents = 1
    where id = entry_id;
    raise exception 'amount_update_should_fail';
  exception
    when others then
      if sqlerrm <> 'revenue_immutable' then
        raise;
      end if;
  end;

  perform private.correct_revenue_entry(
    '20000000-0000-4000-8000-000000000001',
    entry_id,
    'Pełna korekta testowa'
  );
  select coalesce(sum(amount_signed_cents), 0) into revenue
  from public.revenue_entries
  where deal_id = fresh_deal
    and (id = entry_id or reverses_entry_id = entry_id);
  if revenue <> 0 then
    raise exception 'correction_net_%', revenue;
  end if;

  select id into entry_id
  from public.revenue_entries
  where agreement_id = subscription_id
    and cycle_index = 0;

  replacement_id := private.replace_revenue_entry(
    '20000000-0000-4000-8000-000000000001',
    entry_id,
    150000,
    'Zmiana kwoty cyklu'
  );
  select coalesce(sum(amount_signed_cents), 0) into revenue
  from public.revenue_entries
  where id = entry_id
    or reverses_entry_id = entry_id
    or id = replacement_id;
  if revenue <> 150000 then
    raise exception 'replacement_net_%', revenue;
  end if;

  select version into agreement_version
  from public.billing_agreements
  where id = subscription_id;

  begin
    perform private.revise_subscription_amount(
      '20000000-0000-4000-8000-000000000001',
      subscription_id,
      agreement_version,
      0,
      80000
    );
    raise exception 'revision_from_start_should_fail';
  exception
    when others then
      if sqlerrm <> 'invalid_state' then
        raise;
      end if;
  end;

  declare
    seed_agreement uuid;
    seed_version integer;
  begin
    select id, version
      into seed_agreement, seed_version
    from public.billing_agreements
    where deal_id = '40000000-0000-4000-8000-000000000003'
      and kind = 'subscription'
      and status <> 'void';

    begin
      perform private.revise_subscription_amount(
        '20000000-0000-4000-8000-000000000001',
        seed_agreement,
        seed_version,
        1,
        80000
      );
      raise exception 'past_revision_should_fail';
    exception
      when others then
        if sqlerrm <> 'subscription_revision_not_future' then
          raise;
        end if;
    end;
  end;

  new_agreement := private.revise_subscription_amount(
    '20000000-0000-4000-8000-000000000001',
    subscription_id,
    agreement_version,
    2,
    80000
  );
  if (
    select ends_on_exclusive from public.billing_agreements where id = subscription_id
  ) <> date '2027-01-20' then
    raise exception 'revision_end';
  end if;
  if (
    select anchor_day from public.billing_agreements where id = new_agreement
  ) <> 20 then
    raise exception 'revision_anchor';
  end if;
  if (
    select count(*) from public.revenue_entries where agreement_id = new_agreement
  ) <> 0 then
    raise exception 'future_revision_booked';
  end if;

  perform private.generate_due_revenue(subscription_id, date '2027-02-20');
  if exists (
    select 1
    from public.revenue_entries
    where agreement_id = subscription_id
      and effective_on >= date '2027-01-20'
      and entry_type <> 'correction'
      and superseded_at is null
      and dedupe_key not like 'replacement:%'
  ) then
    raise exception 'cycle_after_end_was_booked';
  end if;
end $$;

-- Zakończenie przed następnym terminem nie tworzy kolejnego cyklu. Cofnięcie zeruje należność.
do $$
declare
  ending_deal uuid;
  account_id uuid;
  other_deal uuid;
  result jsonb;
  subscription_id uuid;
  version integer;
  revenue bigint;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);

  insert into public.accounts (workspace_id, kind, relationship, display_name)
  values (
    '10000000-0000-4000-8000-000000000001', 'company', 'prospect', 'Konto do końca'
  )
  returning id into account_id;

  insert into public.deals (workspace_id, account_id, title, source, stage)
  values (
    '10000000-0000-4000-8000-000000000001', account_id, 'Deal kończony', 'manual', 'offer_sent'
  )
  returning id into ending_deal;

  result := private.finalize_deal(
    '20000000-0000-4000-8000-000000000001',
    ending_deal,
    1,
    0,
    date '2026-10-01',
    100000,
    date '2026-10-15',
    null,
    date '2026-10-15'
  );
  if (result ->> 'revenue_cents')::bigint <> 100000 then
    raise exception 'zero_setup_plus_cycle_%', result;
  end if;

  subscription_id := (result ->> 'subscription_agreement_id')::uuid;
  select agreement.version into version
  from public.billing_agreements as agreement
  where agreement.id = subscription_id;
  perform private.end_subscription(
    '20000000-0000-4000-8000-000000000001',
    subscription_id,
    version,
    date '2026-11-15'
  );
  perform private.generate_due_revenue(subscription_id, date '2026-12-15');
  if exists (
    select 1 from public.revenue_entries
    where agreement_id = subscription_id
      and effective_on >= date '2026-11-15'
  ) then
    raise exception 'ended_cycle_created';
  end if;

  insert into public.deals (workspace_id, account_id, title, source, stage)
  values (
    '10000000-0000-4000-8000-000000000001', account_id, 'Druga wygrana', 'manual', 'new'
  )
  returning id into other_deal;

  perform private.finalize_deal(
    '20000000-0000-4000-8000-000000000001',
    other_deal,
    1,
    0,
    date '2026-10-02',
    0,
    null,
    null,
    date '2026-10-02'
  );

  select deal.version into version
  from public.deals as deal
  where deal.id = ending_deal;
  perform private.revert_deal_finalization(
    '20000000-0000-4000-8000-000000000001',
    ending_deal,
    version,
    'negotiation',
    null
  );

  if (select stage from public.deals where id = ending_deal) <> 'negotiation' then
    raise exception 'revert_stage';
  end if;
  if (select relationship from public.accounts where id = account_id) <> 'client' then
    raise exception 'other_won_should_keep_client';
  end if;

  select deal.version into version
  from public.deals as deal
  where deal.id = other_deal;
  perform private.revert_deal_finalization(
    '20000000-0000-4000-8000-000000000001',
    other_deal,
    version,
    'lost',
    'Przykładowa rezygnacja'
  );
  if (select relationship from public.accounts where id = account_id) <> 'prospect' then
    raise exception 'last_won_should_return_prospect';
  end if;

  select coalesce(sum(amount_signed_cents), 0) into revenue
  from public.revenue_entries
  where deal_id in (ending_deal, other_deal);
  if revenue <> 0 then
    raise exception 'revert_revenue_%', revenue;
  end if;

  begin
    perform private.finalize_deal(
      '20000000-0000-4000-8000-000000000001',
      other_deal,
      1,
      0,
      date '2026-10-02',
      0,
      null,
      null,
      date '2026-10-02'
    );
    raise exception 'lost_finalize_should_fail';
  exception
    when others then
      if sqlerrm <> 'invalid_state' then
        raise;
      end if;
  end;
end $$;

-- Seedowa wygrana ma stabilną sumę na 29 października 2026.
do $$
declare
  revenue bigint;
begin
  select coalesce(sum(amount_signed_cents), 0) into revenue
  from public.revenue_entries
  where deal_id = '40000000-0000-4000-8000-000000000003';
  if revenue <> 500000 then
    raise exception 'seed_revenue_%', revenue;
  end if;
end $$;

rollback;
