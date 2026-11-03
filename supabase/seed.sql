-- Fikcyjny zestaw na 29 października 2026. To nie są dane klientów.
-- Hasła są losowe i nie nadają się do logowania. Testy RLS ustawiają JWT, nie hasło.

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change,
  email_change_token_new,
  email_change_token_current,
  reauthentication_token,
  is_sso_user,
  is_anonymous
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '20000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'anna.kowalska@przyklad.test',
    extensions.crypt(encode(extensions.gen_random_bytes(32), 'hex'), extensions.gen_salt('bf')),
    '2026-09-01 08:00:00+00',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    '2026-09-01 08:00:00+00',
    '2026-09-01 08:00:00+00',
    '',
    '',
    '',
    '',
    '',
    '',
    false,
    false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '20000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'bartek.nowak@przyklad.test',
    extensions.crypt(encode(extensions.gen_random_bytes(32), 'hex'), extensions.gen_salt('bf')),
    '2026-09-01 08:00:00+00',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    '2026-09-01 08:00:00+00',
    '2026-09-01 08:00:00+00',
    '',
    '',
    '',
    '',
    '',
    '',
    false,
    false
  );

insert into auth.identities (
  id,
  user_id,
  provider_id,
  identity_data,
  provider,
  created_at,
  updated_at
)
values
  (
    '21000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '{"sub":"20000000-0000-4000-8000-000000000001","email":"anna.kowalska@przyklad.test"}'::jsonb,
    'email',
    '2026-09-01 08:00:00+00',
    '2026-09-01 08:00:00+00'
  ),
  (
    '21000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000002',
    '{"sub":"20000000-0000-4000-8000-000000000002","email":"bartek.nowak@przyklad.test"}'::jsonb,
    'email',
    '2026-09-01 08:00:00+00',
    '2026-09-01 08:00:00+00'
  );

insert into public.workspaces (id, name, timezone)
values (
  '10000000-0000-4000-8000-000000000001',
  'VoiceLink',
  'Europe/Warsaw'
);

insert into public.workspace_members (workspace_id, user_id, active)
values
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', true),
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', true);

insert into public.profiles (workspace_id, user_id, full_name)
values
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Anna Kowalska'),
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'Bartek Nowak');

insert into public.notification_preferences (workspace_id, user_id, morning_digest_enabled)
values
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', true),
  ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', true);

insert into public.automation_settings (
  workspace_id,
  digest_hour,
  timezone,
  no_answer_window_start,
  no_answer_window_end,
  document_max_bytes,
  document_mime_types,
  fathom_poll_interval_minutes
)
values (
  '10000000-0000-4000-8000-000000000001',
  8,
  'Europe/Warsaw',
  time '09:00',
  time '15:00',
  26214400,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'image/png',
    'image/jpeg'
  ]::text[],
  15
);

insert into public.accounts (
  id, workspace_id, kind, relationship, display_name, company_name, created_by
)
values (
  '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'company',
  'prospect',
  'Przykładowa Kawiarnia',
  'Przykładowa Kawiarnia',
  '20000000-0000-4000-8000-000000000001'
);

insert into public.contacts (
  id, workspace_id, account_id, full_name, email, email_normalized,
  phone_raw, phone_e164, is_primary, created_by
)
values (
  '30000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'Ewa Przykładowa',
  'ewa.przykladowa@przyklad.test',
  'ewa.przykladowa@przyklad.test',
  '+48 500 111 222',
  '+48500111222',
  true,
  '20000000-0000-4000-8000-000000000001'
);

insert into public.deals (
  id, workspace_id, account_id, primary_contact_id, title, source, stage, created_by
)
values (
  '30000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000002',
  'Asystent głosowy dla kawiarni',
  'manual',
  'conversation_done',
  '20000000-0000-4000-8000-000000000001'
);

insert into public.tasks (
  id, workspace_id, account_id, deal_id, title, due_on, status, priority, kind, created_by
)
values (
  '30000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000003',
  'Oddzwonić do kawiarni',
  date '2026-10-29',
  'todo',
  'normal',
  'task',
  '20000000-0000-4000-8000-000000000001'
);

insert into public.task_assignees (workspace_id, task_id, user_id, created_by)
values
  (
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000004',
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001'
  ),
  (
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000004',
    '20000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001'
  );

insert into public.notes (workspace_id, account_id, deal_id, body, created_by)
values (
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000003',
  'Rozmowa przykładowa. Klient chce najpierw zobaczyć zakres.',
  '20000000-0000-4000-8000-000000000001'
);

insert into public.accounts (
  id, workspace_id, kind, relationship, display_name, company_name, created_by
)
values (
  '40000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'company',
  'prospect',
  'Przykładowy Gabinet',
  'Przykładowy Gabinet',
  '20000000-0000-4000-8000-000000000002'
);

insert into public.contacts (
  id, workspace_id, account_id, full_name, email, email_normalized,
  phone_raw, phone_e164, is_primary, created_by
)
values (
  '40000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  'Jan Przykładowy',
  'jan.przykladowy@przyklad.test',
  'jan.przykladowy@przyklad.test',
  '+48 500 333 444',
  '+48500333444',
  true,
  '20000000-0000-4000-8000-000000000002'
);

insert into public.deals (
  id, workspace_id, account_id, primary_contact_id, title, source, stage, created_by
)
values (
  '40000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000002',
  'Strona i asystent dla gabinetu',
  'manual',
  'new',
  '20000000-0000-4000-8000-000000000002'
);

select private.finalize_deal(
  '20000000-0000-4000-8000-000000000002',
  '40000000-0000-4000-8000-000000000003',
  1,
  300000,
  date '2026-09-10',
  100000,
  date '2026-09-20',
  null,
  date '2026-10-29'
);

insert into public.deployments (
  id, workspace_id, account_id, deal_id,   product_type, name, status,
  owner_display_name, value_gross_cents, due_on, created_by
)
values (
  '40000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000003',
  'voice_assistant',
  'Wdrożenie asystenta gabinetu',
  'in_progress',
  'Bartek Nowak',
  300000,
  date '2026-11-03',
  '20000000-0000-4000-8000-000000000002'
);

insert into public.deployment_checklist_items (
  workspace_id, deployment_id, title, sort_order, created_by
)
values (
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000004',
  'Zebrać materiały od klienta',
  0,
  '20000000-0000-4000-8000-000000000002'
);

insert into public.deployment_status_history (
  workspace_id, deployment_id, from_status, to_status, actor_user_id, created_by
)
values (
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000004',
  'todo',
  'in_progress',
  '20000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000002'
);

insert into private.integration_connections (
  id, workspace_id, provider, owner_user_id, secret_ref, status
)
values (
  '50000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'fathom',
  '20000000-0000-4000-8000-000000000001',
  'fathom/account-1',
  'active'
);

insert into public.meeting_records (
  id, workspace_id, recording_id, title, started_at, summary_markdown, sync_status
)
values (
  '50000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  'przyklad-001',
  'Rozmowa przykładowa z gabinetem',
  '2026-10-01 10:00:00+02',
  'Ustalone przykładowe kolejne kroki.',
  'synced'
);

insert into public.meeting_sources (
  workspace_id, meeting_record_id, connection_id, provider_recording_id
)
values (
  '10000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000002',
  '50000000-0000-4000-8000-000000000001',
  'przyklad-001'
);

insert into public.meeting_links (
  workspace_id, meeting_record_id, account_id, deal_id
)
values (
  '10000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000002',
  '40000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000003'
);

insert into public.notifications (
  workspace_id, recipient_user_id, kind, title, event_key
)
values (
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'task_due',
  'Zadanie na dziś: oddzwonić do kawiarni',
  'seed:task-due:anna'
);
