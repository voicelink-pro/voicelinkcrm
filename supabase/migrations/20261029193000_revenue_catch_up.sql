-- Nadrabia należne cykle jednego konta. Drugie wywołanie nie dubluje wpisów.

create or replace function private.catch_up_due_revenue(
  p_actor_user_id uuid,
  p_account_id uuid
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  account public.accounts%rowtype;
  agreement_id uuid;
  inserted integer := 0;
  added integer;
begin
  perform private.assert_server_role();

  select *
    into account
  from public.accounts
  where id = p_account_id;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  perform private.require_active_member(account.workspace_id, p_actor_user_id);

  for agreement_id in
    select agreement.id
    from public.billing_agreements as agreement
    where agreement.account_id = account.id
      and agreement.status <> 'void'
    order by agreement.created_at
  loop
    added := private.generate_due_revenue(agreement_id, null);
    inserted := inserted + added;
  end loop;

  return inserted;
end;
$$;

grant execute on function private.catch_up_due_revenue(uuid, uuid) to service_role;

alter publication supabase_realtime add table public.billing_agreements;
alter publication supabase_realtime add table public.revenue_entries;
