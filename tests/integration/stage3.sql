-- Odbiór etapu 3. Transakcja kończy się rollbackiem, seed zostaje.
-- Uruchamiać jako postgres po `supabase db reset`.

begin;

do $$
declare
  anna uuid := '20000000-0000-4000-8000-000000000001';
  client_id uuid := '40000000-0000-4000-8000-000000000001';
  created jsonb;
  named jsonb;
  reviewed jsonb;
  confirmed jsonb;
  added jsonb;
  fresh_account uuid;
  fresh_deal uuid;
  extra_contact uuid;
  extra_deal uuid;
  source_account uuid;
  client_version integer;
  history_count integer;
  revenue_before bigint;
  revenue_after bigint;
  revenue_rows integer;
  ref_id uuid;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);

  created := private.create_manual_lead(
    anna, 'Adam Bez Firmy', null, null, null, null, null, null, false
  );
  if created ->> 'status' is distinct from 'created' then
    raise exception 'lead_without_company %', created;
  end if;

  fresh_account := (created ->> 'account_id')::uuid;
  fresh_deal := (created ->> 'deal_id')::uuid;

  if not exists (
    select 1
    from public.accounts
    where id = fresh_account
      and kind = 'unknown'
      and company_name is null
      and display_name = 'Adam Bez Firmy'
      and relationship = 'prospect'
  ) then
    raise exception 'unknown_account';
  end if;

  named := private.create_manual_lead(
    anna, 'Adam Bez Firmy', null, 'inny.adam@przyklad.test', null, null, null, null, false
  );
  if named ->> 'status' is distinct from 'created' then
    raise exception 'same_name_is_not_duplicate %', named;
  end if;
  source_account := (named ->> 'account_id')::uuid;

  reviewed := private.create_manual_lead(
    anna, 'Ktos Inny', 'Inna Firma', 'inny.adam@przyklad.test', null, null, null, null, false
  );
  if reviewed ->> 'status' is distinct from 'possible_duplicate' then
    raise exception 'email_match_should_wait %', reviewed;
  end if;
  if exists (select 1 from public.contacts where full_name = 'Ktos Inny') then
    raise exception 'review_wrote_a_row';
  end if;

  confirmed := private.create_manual_lead(
    anna, 'Ktos Inny', null, 'inny.adam@przyklad.test', null, null, null, null, true
  );
  if confirmed ->> 'status' is distinct from 'created' then
    raise exception 'confirmed_duplicate_should_create %', confirmed;
  end if;

  added := private.add_contact(
    anna, fresh_account, 'Drugi Kontakt', 'drugi.kontakt@przyklad.test', '+48500999888', 'Manager', false, false
  );
  if added ->> 'status' is distinct from 'created' then
    raise exception 'second_contact %', added;
  end if;
  extra_contact := (added ->> 'contact_id')::uuid;

  extra_deal := private.add_deal(
    anna, fresh_account, 'Druga szansa', 'website', extra_contact, anna
  );

  if (
    select count(*) from public.contacts where account_id = fresh_account and archived_at is null
  ) < 2 or (
    select count(*) from public.deals where account_id = fresh_account and archived_at is null
  ) < 2 then
    raise exception 'company_should_have_two_contacts_and_deals';
  end if;

  begin
    perform private.change_deal_stage(anna, fresh_deal, 1, 'won', null);
    raise exception 'won_should_fail';
  exception
    when sqlstate 'P0001' then
      if sqlerrm is distinct from 'finalization_required' then
        raise;
      end if;
  end;

  begin
    perform private.change_deal_stage(anna, fresh_deal, 1, 'lost', null);
    raise exception 'lost_without_reason_should_fail';
  exception
    when sqlstate 'P0001' then
      if sqlerrm is distinct from 'invalid_state' then
        raise;
      end if;
  end;

  perform private.change_deal_stage(anna, fresh_deal, 1, 'conversation_done', null);

  begin
    perform private.change_deal_stage(anna, fresh_deal, 1, 'lost', 'Za drogo');
    raise exception 'stale_version_should_fail';
  exception
    when sqlstate 'P0001' then
      if sqlerrm is distinct from 'version_conflict' then
        raise;
      end if;
  end;

  perform private.change_deal_stage(anna, fresh_deal, 2, 'lost', 'Za drogo');

  select count(*)
    into history_count
  from public.deal_stage_history
  where deal_id = fresh_deal;

  if history_count < 3 then
    raise exception 'history_missing %', history_count;
  end if;

  perform private.set_archived(anna, 'deal', fresh_deal, 3, true);

  if not exists (
    select 1 from public.deals where id = fresh_deal and archived_at is not null
  ) or (
    select count(*) from public.deal_stage_history where deal_id = fresh_deal
  ) < history_count then
    raise exception 'archive_dropped_history';
  end if;

  select coalesce(sum(amount_signed_cents), 0), count(*)
    into revenue_before, revenue_rows
  from public.revenue_entries;

  select version into client_version from public.accounts where id = client_id;

  insert into private.external_lead_refs (
    workspace_id, source, source_record_id, account_id, outcome
  )
  values (
    '10000000-0000-4000-8000-000000000001',
    'stage3',
    'ref-1',
    source_account,
    'created'
  )
  returning id into ref_id;

  perform private.merge_accounts(
    anna,
    source_account,
    client_id,
    1,
    client_version,
    'target',
    'target',
    'target'
  );

  select coalesce(sum(amount_signed_cents), 0)
    into revenue_after
  from public.revenue_entries;

  if revenue_after is distinct from revenue_before
    or (select count(*) from public.revenue_entries) is distinct from revenue_rows then
    raise exception 'merge_changed_revenue';
  end if;

  if not exists (
    select 1 from public.deals where id = (named ->> 'deal_id')::uuid and account_id = client_id
  ) then
    raise exception 'merge_did_not_move_deal';
  end if;

  if not exists (
    select 1 from public.accounts where id = source_account and archived_at is not null
  ) then
    raise exception 'source_not_archived';
  end if;

  if not exists (
    select 1 from private.external_lead_refs where id = ref_id and account_id = client_id
  ) then
    raise exception 'webhook_ref_lost';
  end if;

  if extra_deal is null then
    raise exception 'second_deal_missing';
  end if;
end $$;

rollback;
