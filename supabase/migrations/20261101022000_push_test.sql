-- Test push dotyczy tylko osoby, która go wywołała.

create or replace function private.create_push_test(p_actor_user_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  workspace uuid;
  notice_id uuid;
begin
  perform private.assert_server_role();

  select workspace_member.workspace_id
    into workspace
  from public.workspace_members as workspace_member
  where workspace_member.user_id = p_actor_user_id
    and workspace_member.active
  limit 1;

  if workspace is null then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  perform private.require_active_member(workspace, p_actor_user_id);

  insert into public.notifications (
    workspace_id, recipient_user_id, kind, title, body, target_path, event_key, created_by
  )
  values (
    workspace,
    p_actor_user_id,
    'push_test',
    'Test powiadomień VoiceLink',
    'To jest test tego urządzenia. Wiadomość nie zawiera danych CRM.',
    '/notifications',
    'push-test:' || gen_random_uuid()::text,
    p_actor_user_id
  )
  returning id into notice_id;

  insert into private.push_deliveries (notification_id, subscription_id, status)
  select notice_id, subscription.id, 'pending'
  from public.push_subscriptions as subscription
  where subscription.workspace_id = workspace
    and subscription.user_id = p_actor_user_id
    and subscription.active
  on conflict (notification_id, subscription_id) do nothing;

  return notice_id;
end;
$$;

revoke all on function private.create_push_test(uuid) from public, anon, authenticated;
grant execute on function private.create_push_test(uuid) to service_role;
