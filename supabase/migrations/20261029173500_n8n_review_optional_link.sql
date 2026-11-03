-- Powiązanie recenzji może pominąć szansę. Odrzucenie nie wymaga karty.

create or replace function private.resolve_import_review(
  p_actor_user_id uuid,
  p_review_id uuid,
  p_action text,
  p_account_id uuid default null,
  p_deal_id uuid default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item private.import_review_items%rowtype;
  account public.accounts%rowtype;
  source_name text;
  source_record text;
  primary_contact uuid;
begin
  perform private.assert_server_role();

  if p_action not in ('link', 'dismiss') then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  select * into item from private.import_review_items where id = p_review_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_active_member(item.workspace_id, p_actor_user_id);
  if item.status is distinct from 'open' then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  source_name := item.payload ->> 'source';
  source_record := item.payload ->> 'source_record_id';

  if p_action = 'dismiss' then
    update private.import_review_items
    set status = 'dismissed', resolved_at = pg_catalog.now()
    where id = item.id;

    perform private.record_domain_event(
      item.workspace_id,
      'lead.import_dismissed',
      'import_review_item',
      item.id,
      jsonb_build_object('review_id', item.id),
      'lead-review-dismiss:' || item.id::text
    );
    return;
  end if;

  if p_account_id is null then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  select * into account from public.accounts where id = p_account_id for update;
  if not found or account.workspace_id is distinct from item.workspace_id or account.archived_at is not null then
    raise exception 'cross_reference' using errcode = '23514';
  end if;

  if p_deal_id is not null and not exists (
    select 1 from public.deals as deal
    where deal.id = p_deal_id
      and deal.account_id = account.id
      and deal.workspace_id = account.workspace_id
      and deal.archived_at is null
  ) then
    raise exception 'cross_reference' using errcode = '23514';
  end if;

  select contact.id into primary_contact
  from public.contacts as contact
  where contact.account_id = account.id
    and contact.archived_at is null
    and contact.is_primary
  limit 1;

  if source_name is not null and source_record is not null then
    insert into private.external_lead_refs (
      workspace_id, source, source_record_id, account_id, contact_id, deal_id, outcome, result
    )
    values (
      item.workspace_id,
      source_name,
      source_record,
      account.id,
      primary_contact,
      p_deal_id,
      'review',
      jsonb_build_object(
        'status', 'linked',
        'account_id', account.id,
        'deal_id', p_deal_id,
        'review_id', item.id
      )
    )
    on conflict (workspace_id, source, source_record_id) do update
    set account_id = excluded.account_id,
        contact_id = excluded.contact_id,
        deal_id = excluded.deal_id,
        result = private.external_lead_refs.result || excluded.result;
  end if;

  insert into public.activities (
    workspace_id, account_id, deal_id, activity_type, actor_type, actor_user_id, payload, created_by
  )
  values (
    account.workspace_id,
    account.id,
    p_deal_id,
    'import_linked',
    'user',
    p_actor_user_id,
    jsonb_build_object('review_id', item.id, 'account_id', account.id, 'deal_id', p_deal_id),
    p_actor_user_id
  );

  update private.import_review_items
  set status = 'resolved', resolved_at = pg_catalog.now()
  where id = item.id;

  perform private.record_domain_event(
    item.workspace_id,
    'lead.import_linked',
    'import_review_item',
    item.id,
    jsonb_build_object('review_id', item.id, 'account_id', account.id, 'deal_id', p_deal_id),
    'lead-review-link:' || item.id::text
  );
end;
$$;

