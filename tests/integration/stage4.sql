-- Odbiór etapu 4. Transakcja kończy się rollbackiem, seed zostaje.

begin;

do $$
declare
  workspace uuid := '10000000-0000-4000-8000-000000000001';
  anna uuid := '20000000-0000-4000-8000-000000000001';
  kawiarnia uuid := '30000000-0000-4000-8000-000000000001';
  created jsonb;
  replay jsonb;
  duplicate jsonb;
  invalid jsonb;
  empty_contact jsonb;
  test_row jsonb;
  review jsonb;
  deal_id uuid;
  contact_id uuid;
  review_id uuid;
  phone_before text;
  phone_after text;
  account_count integer;
  deal_count integer;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);

  created := private.import_lead(
    workspace, 'sql-evt-create', 'google_sheets_form', 'sql-row-create', 'hash-create',
    'Anna Przykładowa', 'anna.import@przyklad.test', '+48600100200', false
  );
  if created ->> 'status' is distinct from 'created' or created ? 'replayed' then
    raise exception 'create %', created;
  end if;
  deal_id := (created ->> 'deal_id')::uuid;

  replay := private.import_lead(
    workspace, 'sql-evt-create', 'google_sheets_form', 'sql-row-create', 'hash-create',
    'Anna Przykładowa', 'anna.import@przyklad.test', '+48600100200', false
  );
  if replay ->> 'deal_id' is distinct from deal_id::text or (replay ->> 'replayed')::boolean is not true then
    raise exception 'replay %', replay;
  end if;

  begin
    perform private.import_lead(
      workspace, 'sql-evt-create', 'google_sheets_form', 'sql-row-create', 'hash-other',
      'Anna Przykładowa', 'anna.import@przyklad.test', '+48600100200', false
    );
    raise exception 'conflict_missing';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%idempotency_conflict%' then
        raise;
      end if;
  end;

  select contact.id, contact.phone_e164
    into contact_id, phone_before
  from public.contacts as contact
  where contact.account_id = (created ->> 'account_id')::uuid
    and contact.is_primary;

  perform private.update_contact(
    anna, contact_id, 1, 'Anna Przykładowa', null,
    'anna.import@przyklad.test', '+48500999888', true, false
  );

  duplicate := private.import_lead(
    workspace, 'sql-evt-create-2', 'google_sheets_form', 'sql-row-create', 'hash-create-2',
    'Anna Przykładowa', 'anna.import@przyklad.test', '+48600100200', false
  );
  if duplicate ->> 'status' is distinct from 'duplicate' or duplicate ->> 'deal_id' is distinct from deal_id::text then
    raise exception 'duplicate %', duplicate;
  end if;

  select contact.phone_e164 into phone_after
  from public.contacts as contact
  where contact.id = contact_id;
  if phone_after is distinct from '+48500999888' then
    raise exception 'phone_reverted %', phone_after;
  end if;

  select count(*) into deal_count
  from public.deals as deal
  where deal.account_id = (created ->> 'account_id')::uuid;
  if deal_count <> 1 then
    raise exception 'second_deal %', deal_count;
  end if;

  invalid := private.import_lead(
    workspace, 'sql-evt-bad-phone', 'google_sheets_form', 'sql-row-bad-phone', 'hash-bad-phone',
    'Zly Numer', '', '12345', false
  );
  if invalid ->> 'status' is distinct from 'invalid' or invalid ? 'deal_id' then
    raise exception 'bad_phone %', invalid;
  end if;

  empty_contact := private.import_lead(
    workspace, 'sql-evt-empty', 'google_sheets_form', 'sql-row-empty', 'hash-empty',
    'Pusty Kontakt', '', '', false
  );
  if empty_contact ->> 'status' is distinct from 'invalid' then
    raise exception 'empty %', empty_contact;
  end if;

  test_row := private.import_lead(
    workspace, 'sql-evt-test', 'google_sheets_form', 'sql-row-test', 'hash-test',
    'Rekord Testowy', 'test.import@przyklad.test', '+48600100999', true
  );
  if test_row ->> 'status' is distinct from 'ignored_test' then
    raise exception 'test %', test_row;
  end if;
  if exists (select 1 from public.deals where title = 'Rekord Testowy') then
    raise exception 'test_created_deal';
  end if;

  select count(*) into account_count from public.accounts;
  review := private.import_lead(
    workspace, 'sql-evt-ewa', 'google_sheets_form', 'sql-row-ewa', 'hash-ewa',
    'Ewa Drugi Raz', 'ewa.przykladowa@przyklad.test', '', false
  );
  if review ->> 'status' is distinct from 'review' or review ->> 'review_id' is null then
    raise exception 'review %', review;
  end if;
  if (select count(*) from public.accounts) <> account_count then
    raise exception 'review_created_account';
  end if;

  select contact.phone_e164 into phone_before
  from public.contacts as contact
  where contact.id = '30000000-0000-4000-8000-000000000002';

  review_id := (review ->> 'review_id')::uuid;
  perform private.resolve_import_review(anna, review_id, 'link', kawiarnia, null);
  select contact.phone_e164 into phone_after
  from public.contacts as contact
  where contact.id = '30000000-0000-4000-8000-000000000002';
  if phone_before is distinct from phone_after or phone_after is distinct from '+48500111222' then
    raise exception 'link_changed_phone % -> %', phone_before, phone_after;
  end if;

  begin
    perform private.resolve_import_review(anna, review_id, 'dismiss', null, null);
    raise exception 'second_resolve_missing';
  exception
    when sqlstate 'P0001' then
      if sqlerrm not like '%invalid_state%' then
        raise;
      end if;
  end;

  invalid := private.import_lead(
    workspace, 'sql-evt-dismiss', 'google_sheets_form', 'sql-row-dismiss', 'hash-dismiss',
    '', '', '', false
  );
  select item.id into review_id
  from private.import_review_items as item
  where item.inbound_event_id in (
    select inbound.id from private.inbound_events as inbound where inbound.event_id = 'sql-evt-dismiss'
  );
  perform private.resolve_import_review(anna, review_id, 'dismiss', null, null);
  if not exists (
    select 1 from private.import_review_items where id = review_id and status = 'dismissed'
  ) then
    raise exception 'dismiss_failed';
  end if;

  perform private.note_integration_receipt(
    workspace, 'n8n_leads', 'env:N8N_LEADS_WEBHOOK_TOKEN', true, null
  );
  if not exists (
    select 1 from private.integration_connections
    where workspace_id = workspace
      and provider = 'n8n_leads'
      and status = 'active'
      and secret_ref = 'env:N8N_LEADS_WEBHOOK_TOKEN'
      and last_error is null
  ) then
    raise exception 'receipt_missing';
  end if;
end;
$$;

rollback;
