-- Jedyna funkcja SECURITY DEFINER. Czyta członkostwo właściciela funkcji,
-- żeby polityka workspace_members nie wywoływała samej siebie.
-- Zwraca tylko boolean dla auth.uid() i przekazanego workspace.

create or replace function private.is_active_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members as member
    where member.workspace_id = p_workspace_id
      and member.user_id = auth.uid()
      and member.active
  );
$$;

comment on function private.is_active_member(uuid) is
  'SECURITY DEFINER wyłącznie przeciw rekurencji RLS. Nie zwraca wierszy ani danych innych użytkowników.';

revoke all on function private.is_active_member(uuid) from public, anon;
grant execute on function private.is_active_member(uuid) to authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'workspaces',
    'workspace_members',
    'profiles',
    'accounts',
    'contacts',
    'deals',
    'deal_stage_history',
    'deployments',
    'deployment_checklist_items',
    'deployment_status_history',
    'tasks',
    'task_assignees',
    'activities',
    'notes',
    'meeting_records',
    'meeting_sources',
    'meeting_participants',
    'meeting_links',
    'meeting_transcript_segments',
    'documents',
    'document_links',
    'billing_agreements',
    'revenue_entries',
    'notifications',
    'push_subscriptions',
    'notification_preferences',
    'automation_settings'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('alter table public.%I force row level security', table_name);
    execute format('revoke all on table public.%I from public, anon, authenticated', table_name);
    execute format('grant select on table public.%I to authenticated', table_name);
    execute format(
      'grant select, insert, update, delete on table public.%I to service_role',
      table_name
    );
  end loop;
end;
$$;

create policy workspaces_select on public.workspaces
  for select to authenticated
  using (private.is_active_member(id));

create policy workspace_members_select on public.workspace_members
  for select to authenticated
  using (
    user_id = auth.uid()
    or private.is_active_member(workspace_id)
  );

create policy profiles_select on public.profiles
  for select to authenticated
  using (private.is_active_member(workspace_id));

create policy accounts_select on public.accounts
  for select to authenticated
  using (private.is_active_member(workspace_id));

create policy contacts_select on public.contacts
  for select to authenticated
  using (private.is_active_member(workspace_id));

create policy deals_select on public.deals
  for select to authenticated
  using (private.is_active_member(workspace_id));

create policy deal_stage_history_select on public.deal_stage_history
  for select to authenticated
  using (private.is_active_member(workspace_id));

create policy deployments_select on public.deployments
  for select to authenticated
  using (private.is_active_member(workspace_id));

create policy deployment_checklist_select on public.deployment_checklist_items
  for select to authenticated
  using (private.is_active_member(workspace_id));

create policy deployment_status_history_select on public.deployment_status_history
  for select to authenticated
  using (private.is_active_member(workspace_id));

create policy tasks_select on public.tasks
  for select to authenticated
  using (private.is_active_member(workspace_id));

create policy task_assignees_select on public.task_assignees
  for select to authenticated
  using (private.is_active_member(workspace_id));

create policy activities_select on public.activities
  for select to authenticated
  using (private.is_active_member(workspace_id));

create policy notes_select on public.notes
  for select to authenticated
  using (private.is_active_member(workspace_id));

create policy meeting_records_select on public.meeting_records
  for select to authenticated
  using (private.is_active_member(workspace_id));

create policy meeting_sources_select on public.meeting_sources
  for select to authenticated
  using (private.is_active_member(workspace_id));

create policy meeting_participants_select on public.meeting_participants
  for select to authenticated
  using (private.is_active_member(workspace_id));

create policy meeting_links_select on public.meeting_links
  for select to authenticated
  using (private.is_active_member(workspace_id));

create policy meeting_segments_select on public.meeting_transcript_segments
  for select to authenticated
  using (private.is_active_member(workspace_id));

create policy documents_select on public.documents
  for select to authenticated
  using (private.is_active_member(workspace_id));

create policy document_links_select on public.document_links
  for select to authenticated
  using (private.is_active_member(workspace_id));

create policy billing_agreements_select on public.billing_agreements
  for select to authenticated
  using (private.is_active_member(workspace_id));

create policy revenue_entries_select on public.revenue_entries
  for select to authenticated
  using (private.is_active_member(workspace_id));

create policy notifications_select on public.notifications
  for select to authenticated
  using (
    recipient_user_id = auth.uid()
    and private.is_active_member(workspace_id)
  );

create policy push_subscriptions_select on public.push_subscriptions
  for select to authenticated
  using (
    user_id = auth.uid()
    and private.is_active_member(workspace_id)
  );

create policy notification_preferences_select on public.notification_preferences
  for select to authenticated
  using (
    user_id = auth.uid()
    and private.is_active_member(workspace_id)
  );

create policy automation_settings_select on public.automation_settings
  for select to authenticated
  using (private.is_active_member(workspace_id));
