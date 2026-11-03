-- Usunięcie modułu Wdrożeń (deployments) oraz dodanie modułu Kalendarz Google (co 10 minut automatycznej synchronizacji) i stanu realizacji klienta na accounts.

-- 1. Stan realizacji bezpośrednio na karcie klienta (accounts)
alter table public.accounts
  add column if not exists implementation_stage text not null default 'in_progress'
    check (implementation_stage in ('todo', 'in_progress', 'waiting_for_client', 'testing', 'launched', 'completed', 'paused')),
  add column if not exists implementation_due_on date;

create or replace function private.save_account_dossier(
  p_actor_user_id uuid,
  p_account_id uuid,
  p_section text,
  p_implementation_notes text default null,
  p_integration_systems text default null,
  p_integration_docs_status text default null,
  p_integration_notes text default null,
  p_implementation_stage text default null,
  p_implementation_due_on date default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  account public.accounts%rowtype;
  docs_status text;
  impl_stage text;
begin
  perform private.assert_server_role();
  select * into account from public.accounts where id = p_account_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.require_active_member(account.workspace_id, p_actor_user_id);

  if p_section = 'implementation' then
    if p_implementation_notes is not null and pg_catalog.char_length(p_implementation_notes) > 20000 then
      raise exception 'invalid_state' using errcode = 'P0001';
    end if;
    impl_stage := coalesce(private.blank_to_null(p_implementation_stage), account.implementation_stage, 'in_progress');
    if impl_stage not in ('todo', 'in_progress', 'waiting_for_client', 'testing', 'launched', 'completed', 'paused') then
      raise exception 'invalid_state' using errcode = 'P0001';
    end if;

    update public.accounts
    set implementation_notes = private.blank_to_null(p_implementation_notes),
        implementation_stage = impl_stage,
        implementation_due_on = p_implementation_due_on,
        updated_by = p_actor_user_id
    where id = account.id;
  elsif p_section = 'integration' then
    docs_status := coalesce(private.blank_to_null(p_integration_docs_status), 'missing');
    if docs_status not in ('missing', 'partial', 'complete') then
      raise exception 'invalid_state' using errcode = 'P0001';
    end if;
    if (p_integration_systems is not null and pg_catalog.char_length(p_integration_systems) > 2000)
      or (p_integration_notes is not null and pg_catalog.char_length(p_integration_notes) > 20000) then
      raise exception 'invalid_state' using errcode = 'P0001';
    end if;

    update public.accounts
    set integration_systems = private.blank_to_null(p_integration_systems),
        integration_docs_status = docs_status,
        integration_notes = private.blank_to_null(p_integration_notes),
        updated_by = p_actor_user_id
    where id = account.id;
  else
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function private.save_account_dossier(uuid, uuid, text, text, text, text, text, text, date) from public, anon, authenticated;
grant execute on function private.save_account_dossier(uuid, uuid, text, text, text, text, text, text, date) to service_role;

-- 2. Przebudowa widoku client_directory bez odwołań do public.deployments
drop view if exists public.client_directory;

create view public.client_directory
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
      and deal.stage = 'won'
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

-- 3. Odpięcie kluczy obcych i usunięcie tabel oraz funkcji wdrożeń (deployments)
drop trigger if exists tasks_linked_accounts on public.tasks;

create or replace function private.assert_task_links()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  linked_account uuid;
begin
  if new.deal_id is not null then
    select deal.account_id into linked_account
    from public.deals as deal
    where deal.id = new.deal_id
      and deal.workspace_id = new.workspace_id;

    if linked_account is null
      or (new.account_id is not null and linked_account is distinct from new.account_id) then
      raise exception 'cross_reference' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger tasks_linked_accounts
  before insert or update of deal_id, account_id, workspace_id
  on public.tasks
  for each row execute function private.assert_task_links();

delete from public.document_links
where deployment_id is not null
  and account_id is null
  and deal_id is null;

alter table public.document_links
  drop constraint if exists document_links_one_target,
  drop constraint if exists document_links_deployment_fk;

drop index if exists public.document_links_deployment_unique;

alter table public.document_links
  drop column if exists deployment_id;

alter table public.document_links
  add constraint document_links_one_target check (
    (account_id is not null)::integer
    + (deal_id is not null)::integer = 1
  );

alter table public.tasks
  drop constraint if exists tasks_deployment_fk;

alter table public.tasks
  drop column if exists deployment_id;

alter table public.activities
  drop constraint if exists activities_deployment_fk;

alter table public.activities
  drop column if exists deployment_id;

alter table public.notes
  drop constraint if exists notes_deployment_fk;

alter table public.notes
  drop column if exists deployment_id;

drop function if exists private.create_deployment(uuid, uuid, uuid, text, text, text, text, bigint, date, date);
drop function if exists private.update_deployment(uuid, uuid, integer, uuid, uuid, text, text, text, text, bigint, date, date);
drop function if exists private.change_deployment_status(uuid, uuid, integer, text);
drop function if exists private.add_checklist_item(uuid, uuid, text);
drop function if exists private.set_checklist_item(uuid, uuid, integer, boolean);
drop function if exists private.remove_checklist_item(uuid, uuid, integer);
drop function if exists private.add_deployment_task(uuid, uuid, text, date);

drop table if exists public.deployment_checklist_items cascade;
drop table if exists public.deployment_status_history cascade;
drop table if exists public.deployments cascade;
drop function if exists private.assert_deployment_account();

-- Aktualizacja funkcji save_task, begin_document_upload, attach_document_link, merge_accounts (bez odwołań do public.deployments)
create or replace function private.save_task(
  p_actor_user_id uuid,
  p_task_id uuid,
  p_expected_version integer,
  p_title text,
  p_description text,
  p_due_on date,
  p_due_time time,
  p_priority text,
  p_status text,
  p_account_id uuid,
  p_deal_id uuid,
  p_deployment_id uuid,
  p_assignee_ids uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
<<task_save>>
declare
  actor uuid := p_actor_user_id;
  existing public.tasks%rowtype;
  workspace uuid;
  account_id uuid;
  deal_id uuid;
  linked_workspace uuid;
  linked_account uuid;
  title text;
  description text;
  due_at timestamptz;
  priority text;
  status text;
  assignee_ids uuid[] := '{}';
  assignee uuid;
  task_id uuid;
  previous_status text;
  previous_due date;
  previous_at timestamptz;
  completed_at timestamptz;
  completed_by uuid;
  row_version integer;
begin
  perform private.assert_server_role();
  title := private.blank_to_null(p_title);
  description := private.blank_to_null(p_description);
  priority := pg_catalog.btrim(coalesce(p_priority, ''));
  status := pg_catalog.btrim(coalesce(p_status, ''));

  if title is null or pg_catalog.char_length(title) > 200
    or (description is not null and pg_catalog.char_length(description) > 20000)
    or priority not in ('low', 'normal', 'high')
    or status not in ('todo', 'in_progress', 'done', 'cancelled')
    or (p_due_time is not null and p_due_on is null) then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  if p_due_time is null then
    due_at := null;
  else
    due_at := (p_due_on + p_due_time) at time zone 'Europe/Warsaw';
  end if;

  if p_task_id is not null then
    select *
      into existing
    from public.tasks
    where id = p_task_id
    for update;

    if not found or existing.archived_at is not null then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if existing.version is distinct from p_expected_version then
      raise exception 'version_conflict' using errcode = 'P0001';
    end if;
    workspace := existing.workspace_id;
  end if;

  if p_account_id is not null then
    select account.workspace_id, account.id
      into linked_workspace, linked_account
    from public.accounts as account
    where account.id = p_account_id
      and account.archived_at is null;
    if not found then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if workspace is not null and linked_workspace is distinct from workspace then
      raise exception 'cross_reference' using errcode = '23514';
    end if;
    workspace := linked_workspace;
    account_id := linked_account;
  end if;

  if p_deal_id is not null then
    select deal.workspace_id, deal.account_id
      into linked_workspace, linked_account
    from public.deals as deal
    where deal.id = p_deal_id
      and deal.archived_at is null;
    if not found then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
    if workspace is not null and linked_workspace is distinct from workspace then
      raise exception 'cross_reference' using errcode = '23514';
    end if;
    if account_id is not null and linked_account is distinct from account_id then
      raise exception 'cross_reference' using errcode = '23514';
    end if;
    workspace := linked_workspace;
    account_id := linked_account;
    deal_id := p_deal_id;
  end if;

  if workspace is null then
    select member.workspace_id
      into workspace
    from public.workspace_members as member
    where member.user_id = actor
      and member.active
    order by member.workspace_id
    limit 1;
    if workspace is null then
      raise exception 'not_a_member' using errcode = '42501';
    end if;
  end if;

  perform private.require_active_member(workspace, actor);

  if p_assignee_ids is null or coalesce(pg_catalog.cardinality(p_assignee_ids), 0) = 0 then
    assignee_ids := array[actor];
  else
    foreach assignee in array p_assignee_ids loop
      if assignee is null or assignee = any (assignee_ids) then
        continue;
      end if;
      perform private.require_active_member(workspace, assignee);
      assignee_ids := assignee_ids || assignee;
    end loop;
    if coalesce(pg_catalog.cardinality(assignee_ids), 0) = 0 then
      assignee_ids := array[actor];
    end if;
  end if;

  if p_task_id is null then
    insert into public.tasks (
      workspace_id, account_id, deal_id, title, description,
      due_on, due_at, status, priority, kind,
      completed_at, completed_by, created_by
    )
    values (
      task_save.workspace, task_save.account_id, task_save.deal_id,
      task_save.title, task_save.description,
      p_due_on, task_save.due_at, task_save.status, task_save.priority, 'task',
      case when task_save.status = 'done' then pg_catalog.clock_timestamp() else null end,
      case when task_save.status = 'done' then task_save.actor else null end,
      task_save.actor
    )
    returning id, version into task_id, row_version;

    foreach assignee in array assignee_ids loop
      insert into public.task_assignees (workspace_id, task_id, user_id, created_by)
      values (task_save.workspace, task_save.task_id, task_save.assignee, task_save.actor);
      perform private.record_domain_event(
        workspace,
        'task.assigned',
        'task',
        task_id,
        jsonb_build_object(
          'task_id', task_id,
          'assignee_user_id', assignee,
          'actor_user_id', actor,
          'due_on', p_due_on,
          'kind', 'task'
        ),
        'task:assign:' || task_id::text || ':' || assignee::text || ':' || row_version::text
      );
    end loop;

    if status = 'done' then
      perform private.record_domain_event(
        workspace, 'task.completed', 'task', task_id,
        jsonb_build_object('task_id', task_id, 'actor_user_id', actor, 'status', status),
        'task:complete:' || task_id::text || ':' || row_version::text
      );
    end if;

    return task_id;
  end if;

  previous_status := existing.status;
  previous_due := existing.due_on;
  previous_at := existing.due_at;

  if status = 'done' and previous_status is distinct from 'done' then
    completed_at := pg_catalog.clock_timestamp();
    completed_by := actor;
  elsif status = 'done' then
    completed_at := existing.completed_at;
    completed_by := existing.completed_by;
  else
    completed_at := null;
    completed_by := null;
  end if;

  update public.tasks
  set account_id = task_save.account_id,
      deal_id = task_save.deal_id,
      title = task_save.title,
      description = task_save.description,
      due_on = p_due_on,
      due_at = task_save.due_at,
      status = task_save.status,
      priority = task_save.priority,
      completed_at = task_save.completed_at,
      completed_by = task_save.completed_by,
      updated_by = task_save.actor
  where id = existing.id
  returning id, version into task_id, row_version;

  delete from public.task_assignees as link
  where link.task_id = task_save.task_id
    and not (link.user_id = any (task_save.assignee_ids));

  foreach assignee in array assignee_ids loop
    if exists (
      select 1
      from public.task_assignees as link
      where link.task_id = task_save.task_id
        and link.user_id = task_save.assignee
    ) then
      continue;
    end if;
    insert into public.task_assignees (workspace_id, task_id, user_id, created_by)
    values (task_save.workspace, task_save.task_id, task_save.assignee, task_save.actor);
    perform private.record_domain_event(
      workspace,
      'task.assigned',
      'task',
      task_id,
      jsonb_build_object(
        'task_id', task_id,
        'assignee_user_id', assignee,
        'actor_user_id', actor,
        'due_on', p_due_on,
        'kind', existing.kind
      ),
      'task:assign:' || task_id::text || ':' || assignee::text || ':' || row_version::text
    );
  end loop;

  if p_due_on is distinct from previous_due or due_at is distinct from previous_at then
    perform private.record_domain_event(
      workspace, 'task.due_changed', 'task', task_id,
      jsonb_build_object(
        'task_id', task_id,
        'actor_user_id', actor,
        'due_on', p_due_on,
        'previous_due_on', previous_due
      ),
      'task:due:' || task_id::text || ':' || row_version::text
    );
  end if;

  if status is distinct from previous_status and status = 'done' then
    perform private.record_domain_event(
      workspace, 'task.completed', 'task', task_id,
      jsonb_build_object('task_id', task_id, 'actor_user_id', actor, 'status', status),
      'task:complete:' || task_id::text || ':' || row_version::text
    );
  elsif status is distinct from previous_status then
    perform private.record_domain_event(
      workspace, 'task.status_changed', 'task', task_id,
      jsonb_build_object(
        'task_id', task_id,
        'actor_user_id', actor,
        'status', status,
        'previous_status', previous_status
      ),
      'task:status:' || task_id::text || ':' || row_version::text
    );
  end if;

  return task_id;
end;
$$;

create or replace function private.begin_document_upload(
  p_actor_user_id uuid,
  p_original_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_category text,
  p_account_id uuid,
  p_deal_id uuid,
  p_deployment_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
<<doc_begin>>
declare
  actor uuid := p_actor_user_id;
  workspace uuid;
  doc_name text;
  doc_mime text;
  doc_category text;
  max_bytes bigint;
  allowed text[];
  document_id uuid;
  storage_path text;
  target_count integer;
begin
  perform private.assert_server_role();
  doc_name := private.blank_to_null(p_original_name);
  doc_mime := pg_catalog.lower(pg_catalog.btrim(coalesce(p_mime_type, '')));
  doc_category := pg_catalog.btrim(coalesce(p_category, ''));
  target_count :=
    (p_account_id is not null)::integer
    + (p_deal_id is not null)::integer;

  select member.workspace_id
    into workspace
  from public.workspace_members as member
  where member.user_id = doc_begin.actor
    and member.active
  order by member.workspace_id
  limit 1;

  perform private.require_active_member(workspace, doc_begin.actor);

  select settings.document_max_bytes, settings.document_mime_types
    into max_bytes, allowed
  from public.automation_settings as settings
  where settings.workspace_id = workspace;

  if doc_name is null
    or pg_catalog.char_length(doc_name) > 240
    or doc_category not in ('offer', 'integration', 'contract', 'other')
    or target_count > 1
    or p_size_bytes is null
    or p_size_bytes <= 0
    or max_bytes is null
    or allowed is null then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  if p_size_bytes > max_bytes then
    raise exception 'document_too_large' using errcode = 'P0001';
  end if;

  if not private.document_mime_allowed(doc_mime, allowed) then
    raise exception 'document_type_rejected' using errcode = 'P0001';
  end if;

  if p_account_id is not null and not exists (
    select 1
    from public.accounts as account
    where account.id = p_account_id
      and account.workspace_id = workspace
      and account.archived_at is null
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if p_deal_id is not null and not exists (
    select 1
    from public.deals as deal
    where deal.id = p_deal_id
      and deal.workspace_id = workspace
      and deal.archived_at is null
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  document_id := pg_catalog.gen_random_uuid();
  storage_path := workspace::text || '/' || document_id::text || '/' || pg_catalog.gen_random_uuid()::text;

  insert into public.documents (
    id,
    workspace_id,
    storage_path,
    original_name,
    mime_type,
    category,
    status,
    size_bytes,
    uploaded_by,
    created_by,
    updated_by
  )
  values (
    document_id,
    workspace,
    storage_path,
    doc_name,
    doc_mime,
    doc_category,
    'uploading',
    p_size_bytes,
    doc_begin.actor,
    doc_begin.actor,
    doc_begin.actor
  );

  if target_count = 1 then
    insert into public.document_links (
      workspace_id,
      document_id,
      account_id,
      deal_id,
      created_by,
      updated_by
    )
    values (
      workspace,
      document_id,
      p_account_id,
      p_deal_id,
      doc_begin.actor,
      doc_begin.actor
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'id', document_id,
    'storage_path', storage_path
  );
end;
$$;

create or replace function private.attach_document_link(
  p_actor_user_id uuid,
  p_document_id uuid,
  p_account_id uuid,
  p_deal_id uuid,
  p_deployment_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
<<doc_attach>>
declare
  existing public.documents%rowtype;
  link_id uuid;
  target_count integer;
begin
  perform private.assert_server_role();
  target_count :=
    (p_account_id is not null)::integer
    + (p_deal_id is not null)::integer;

  if target_count <> 1 then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  select *
    into existing
  from public.documents
  where id = p_document_id
  for update;

  if not found or existing.deleted_at is not null or existing.status <> 'ready' then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  perform private.require_active_member(existing.workspace_id, p_actor_user_id);

  if p_account_id is not null and not exists (
    select 1 from public.accounts as account
    where account.id = p_account_id
      and account.workspace_id = existing.workspace_id
      and account.archived_at is null
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if p_deal_id is not null and not exists (
    select 1 from public.deals as deal
    where deal.id = p_deal_id
      and deal.workspace_id = existing.workspace_id
      and deal.archived_at is null
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select link.id
    into link_id
  from public.document_links as link
  where link.document_id = existing.id
    and link.account_id is not distinct from p_account_id
    and link.deal_id is not distinct from p_deal_id;

  if link_id is not null then
    return link_id;
  end if;

  insert into public.document_links (
    workspace_id,
    document_id,
    account_id,
    deal_id,
    created_by,
    updated_by
  )
  values (
    existing.workspace_id,
    existing.id,
    p_account_id,
    p_deal_id,
    p_actor_user_id,
    p_actor_user_id
  )
  returning id into link_id;

  return link_id;
end;
$$;

create or replace function private.merge_accounts(
  p_actor_user_id uuid,
  p_source_id uuid,
  p_target_id uuid,
  p_source_version integer,
  p_target_version integer,
  p_keep_display_from text,
  p_keep_company_from text,
  p_keep_kind_from text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  source public.accounts%rowtype;
  target public.accounts%rowtype;
  target_has_primary boolean;
begin
  perform private.assert_server_role();
  if p_source_id = p_target_id then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;
  if p_keep_display_from not in ('source', 'target')
    or p_keep_company_from not in ('source', 'target')
    or p_keep_kind_from not in ('source', 'target') then
    raise exception 'invalid_state' using errcode = 'P0001';
  end if;

  select * into source from public.accounts where id = p_source_id for update;
  select * into target from public.accounts where id = p_target_id for update;
  if source.id is null or target.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if source.workspace_id is distinct from target.workspace_id then
    raise exception 'cross_reference' using errcode = '23514';
  end if;
  perform private.require_active_member(target.workspace_id, p_actor_user_id);
  if source.version is distinct from p_source_version
    or target.version is distinct from p_target_version then
    raise exception 'version_conflict' using errcode = 'P0001';
  end if;

  select exists (
    select 1 from public.contacts as contact
    where contact.account_id = target.id
      and contact.is_primary
      and contact.archived_at is null
  ) into target_has_primary;

  if target_has_primary then
    update public.contacts
    set is_primary = false, updated_by = p_actor_user_id
    where account_id = source.id and is_primary;
  end if;

  update public.contacts
  set account_id = target.id, updated_by = p_actor_user_id
  where account_id = source.id;

  update public.deals
  set account_id = target.id, updated_by = p_actor_user_id
  where account_id = source.id;

  update public.tasks
  set account_id = target.id, updated_by = p_actor_user_id
  where account_id = source.id;

  update public.activities
  set account_id = target.id
  where account_id = source.id;

  update public.notes
  set account_id = target.id, updated_by = p_actor_user_id
  where account_id = source.id;

  update public.meeting_links
  set account_id = target.id, updated_by = p_actor_user_id
  where account_id = source.id;

  update public.document_links
  set account_id = target.id, updated_by = p_actor_user_id
  where account_id = source.id;

  update public.billing_agreements
  set account_id = target.id, updated_by = p_actor_user_id
  where account_id = source.id;

  perform set_config('private.merge_accounts', 'on', true);
  update public.revenue_entries
  set account_id = target.id, updated_by = p_actor_user_id
  where account_id = source.id;
  perform set_config('private.merge_accounts', '', true);

  update private.external_lead_refs
  set account_id = target.id
  where account_id = source.id;

  update public.accounts
  set display_name = case
        when p_keep_display_from = 'source' then source.display_name
        else target.display_name
      end,
      company_name = case
        when p_keep_company_from = 'source' then source.company_name
        else target.company_name
      end,
      kind = case when p_keep_kind_from = 'source' then source.kind else target.kind end,
      relationship = case
        when exists (
          select 1 from public.deals as deal
          where deal.account_id = target.id
            and deal.stage = 'won'
            and deal.archived_at is null
        ) then 'client'
        else target.relationship
      end,
      updated_by = p_actor_user_id
  where id = target.id;

  update public.accounts
  set archived_at = pg_catalog.now(),
      updated_by = p_actor_user_id
  where id = source.id;

  perform private.record_domain_event(
    target.workspace_id,
    'account.merged',
    'account',
    target.id,
    jsonb_build_object('source_account_id', source.id, 'target_account_id', target.id),
    'merge:' || source.id::text || ':' || target.id::text
  );
end;
$$;

-- 4. Moduł Kalendarza (Google Calendar import & 10-minute sync + wydarzenia zespołowe)
create table if not exists public.calendar_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id),
  user_id uuid not null references auth.users (id),
  label text not null check (char_length(btrim(label)) between 1 and 120),
  ical_url text not null check (ical_url ~ '^https?://'),
  color text not null default 'blue' check (color in ('blue', 'emerald', 'amber', 'violet', 'rose')),
  enabled boolean not null default true,
  sync_interval_minutes integer not null default 10 check (sync_interval_minutes = 10),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_sources_workspace_id_unique unique (workspace_id, id)
);

create index if not exists calendar_sources_workspace_idx
  on public.calendar_sources (workspace_id, user_id);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id),
  user_id uuid not null references auth.users (id),
  source_id uuid references public.calendar_sources (id) on delete cascade,
  external_uid text,
  title text not null check (char_length(btrim(title)) between 1 and 300),
  description text,
  location text,
  meeting_url text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  account_id uuid,
  deal_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_events_account_fk
    foreign key (workspace_id, account_id)
    references public.accounts (workspace_id, id),
  constraint calendar_events_deal_fk
    foreign key (workspace_id, deal_id)
    references public.deals (workspace_id, id)
);

create unique index if not exists calendar_events_source_uid_idx
  on public.calendar_events (source_id, external_uid)
  where source_id is not null and external_uid is not null;

create index if not exists calendar_events_range_idx
  on public.calendar_events (workspace_id, starts_at, ends_at);

alter table public.calendar_sources enable row level security;
alter table public.calendar_events enable row level security;

drop policy if exists calendar_sources_member_select on public.calendar_sources;
create policy calendar_sources_member_select
  on public.calendar_sources
  for select
  to authenticated
  using (private.is_active_member(workspace_id));

drop policy if exists calendar_events_member_select on public.calendar_events;
create policy calendar_events_member_select
  on public.calendar_events
  for select
  to authenticated
  using (private.is_active_member(workspace_id));

grant select on public.calendar_sources to authenticated, service_role;
grant select on public.calendar_events to authenticated, service_role;
revoke all on public.calendar_sources from anon, public;
revoke all on public.calendar_events from anon, public;

drop trigger if exists calendar_sources_touch on public.calendar_sources;
create trigger calendar_sources_touch
  before update on public.calendar_sources
  for each row execute function private.touch_row();

drop trigger if exists calendar_events_touch on public.calendar_events;
create trigger calendar_events_touch
  before update on public.calendar_events
  for each row execute function private.touch_row();

-- Aktualizacja dashboard_snapshot (bez odwołań do public.deployments)
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
    'open_deployments', 0,
    'paused_deployments', 0,
    'overdue_deployments', 0,
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
    'overdue_deployment_rows', '[]'::jsonb,
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

-- 5. Automatyczne kolejkowanie synchronizacji kalendarza Google co 10 minut w workerze
create or replace function private.enqueue_worker_jobs(p_at timestamptz)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  settings public.automation_settings%rowtype;
  member record;
  account_row record;
  connection record;
  cal_source record;
  local_day date;
  digest_count integer := 0;
  revenue_count integer := 0;
  fathom_count integer := 0;
  calendar_count integer := 0;
  bucket timestamptz;
  cal_bucket timestamptz;
begin
  perform private.assert_server_role();
  perform private.release_expired_jobs();

  for settings in
    select * from public.automation_settings
  loop
    local_day := private.warsaw_local(p_at)::date;

    if private.digest_is_due(p_at, settings.digest_hour) then
      for member in
        select workspace_member.user_id
        from public.workspace_members as workspace_member
        where workspace_member.workspace_id = settings.workspace_id
          and workspace_member.active
      loop
        insert into private.job_queue (workspace_id, job_type, payload, dedupe_key)
        values (
          settings.workspace_id,
          'morning_digest',
          jsonb_build_object(
            'user_id', member.user_id,
            'local_date', local_day,
            'digest_hour', settings.digest_hour
          ),
          'morning-digest:' || settings.workspace_id::text || ':' || member.user_id::text || ':' || local_day::text
        )
        on conflict (dedupe_key) where dedupe_key is not null do nothing;

        if found then
          digest_count := digest_count + 1;
        end if;
      end loop;
    end if;

    for account_row in
      select distinct agreement.account_id
      from public.billing_agreements as agreement
      where agreement.workspace_id = settings.workspace_id
        and agreement.status <> 'void'
    loop
      insert into private.job_queue (workspace_id, job_type, payload, dedupe_key)
      values (
        settings.workspace_id,
        'revenue_catch_up',
        jsonb_build_object('account_id', account_row.account_id, 'local_date', local_day),
        'revenue:' || account_row.account_id::text || ':' || local_day::text
      )
      on conflict (dedupe_key) where dedupe_key is not null do nothing;

      if found then
        revenue_count := revenue_count + 1;
      end if;
    end loop;

    bucket := date_bin(
      make_interval(mins => settings.fathom_poll_interval_minutes),
      p_at,
      timestamptz '2020-01-01+00'
    );

    for connection in
      select integration.id
      from private.integration_connections as integration
      where integration.workspace_id = settings.workspace_id
        and integration.provider = 'fathom'
        and integration.enabled
        and integration.status = 'active'
    loop
      insert into private.job_queue (workspace_id, job_type, payload, dedupe_key)
      values (
        settings.workspace_id,
        'fathom_poll',
        jsonb_build_object('connection_id', connection.id),
        'fathom:' || connection.id::text || ':' || to_char(bucket at time zone 'UTC', 'YYYYMMDDHH24MISS')
      )
      on conflict (dedupe_key) where dedupe_key is not null do nothing;

      if found then
        fathom_count := fathom_count + 1;
      end if;
    end loop;

    -- Synchronizacja Kalendarza Google co 10 minut
    cal_bucket := date_bin(
      interval '10 minutes',
      p_at,
      timestamptz '2020-01-01+00'
    );

    for cal_source in
      select src.id
      from public.calendar_sources as src
      where src.workspace_id = settings.workspace_id
        and src.enabled
    loop
      insert into private.job_queue (workspace_id, job_type, payload, dedupe_key)
      values (
        settings.workspace_id,
        'calendar_sync',
        jsonb_build_object('source_id', cal_source.id),
        'calendar:' || cal_source.id::text || ':' || to_char(cal_bucket at time zone 'UTC', 'YYYYMMDDHH24MISS')
      )
      on conflict (dedupe_key) where dedupe_key is not null do nothing;

      if found then
        calendar_count := calendar_count + 1;
      end if;
    end loop;
  end loop;

  return jsonb_build_object(
    'local_date', local_day,
    'digest_jobs', digest_count,
    'revenue_jobs', revenue_count,
    'fathom_jobs', fathom_count,
    'calendar_jobs', calendar_count
  );
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'calendar_events'
  ) then
    alter publication supabase_realtime add table public.calendar_events;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'calendar_sources'
  ) then
    alter publication supabase_realtime add table public.calendar_sources;
  end if;
end $$;
