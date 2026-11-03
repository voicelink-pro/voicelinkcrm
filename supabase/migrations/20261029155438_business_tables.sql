-- Encje biznesowe. Zapis idzie przez funkcje w private, nie przez bezpośredni Data API.

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id),
  kind text not null check (kind in ('company', 'person', 'unknown')),
  relationship text not null check (relationship in ('prospect', 'client')),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 200),
  company_name text,
  website text,
  nip text,
  address text,
  service_status text not null default 'active' check (service_status in ('active', 'inactive')),
  latest_note text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  version integer not null default 1 check (version > 0),
  constraint accounts_workspace_id_unique unique (workspace_id, id)
);

create index accounts_list_idx
  on public.accounts (workspace_id, relationship, display_name, id);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  account_id uuid not null,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 200),
  job_title text,
  email text,
  email_normalized text,
  phone_raw text,
  phone_e164 text,
  is_primary boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  version integer not null default 1 check (version > 0),
  constraint contacts_account_fk
    foreign key (workspace_id, account_id)
    references public.accounts (workspace_id, id),
  constraint contacts_workspace_id_unique unique (workspace_id, id),
  constraint contacts_email_shape check (
    email_normalized is null
    or email_normalized ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint contacts_phone_e164 check (
    phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{7,14}$'
  )
);

create unique index contacts_one_primary_idx
  on public.contacts (account_id)
  where is_primary and archived_at is null;

create index contacts_account_idx
  on public.contacts (account_id);

create index contacts_email_idx
  on public.contacts (workspace_id, email_normalized)
  where email_normalized is not null and archived_at is null;

create index contacts_phone_idx
  on public.contacts (workspace_id, phone_e164)
  where phone_e164 is not null and archived_at is null;

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  account_id uuid not null,
  primary_contact_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  product_type text check (product_type is null or product_type in (
    'voice_assistant',
    'website',
    'digital_infrastructure'
  )),
  owner_user_id uuid references auth.users (id),
  description text,
  source text not null check (char_length(source) between 1 and 80),
  stage text not null check (stage in (
    'new',
    'contact_attempt',
    'conversation_done',
    'meeting_scheduled',
    'meeting_done',
    'offer_sent',
    'negotiation',
    'won',
    'lost'
  )),
  lost_reason text,
  setup_amount_gross_cents bigint check (
    setup_amount_gross_cents is null
    or setup_amount_gross_cents between 0 and 9007199254740991
  ),
  monthly_amount_gross_cents bigint check (
    monthly_amount_gross_cents is null
    or monthly_amount_gross_cents between 0 and 9007199254740991
  ),
  currency text not null default 'PLN' check (currency = 'PLN'),
  expected_close_on date,
  won_at timestamptz,
  lost_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  version integer not null default 1 check (version > 0),
  constraint deals_account_fk
    foreign key (workspace_id, account_id)
    references public.accounts (workspace_id, id),
  constraint deals_contact_fk
    foreign key (workspace_id, primary_contact_id)
    references public.contacts (workspace_id, id),
  constraint deals_workspace_id_unique unique (workspace_id, id),
  constraint deals_lost_reason check (
    stage <> 'lost' or lost_reason is not null
  )
);

create index deals_list_idx
  on public.deals (workspace_id, stage, created_at desc, id);

create index deals_account_idx
  on public.deals (account_id);

create table public.deal_stage_history (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  deal_id uuid not null,
  from_stage text,
  to_stage text not null,
  changed_at timestamptz not null default now(),
  actor_user_id uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  version integer not null default 1 check (version > 0),
  constraint deal_stage_history_deal_fk
    foreign key (workspace_id, deal_id)
    references public.deals (workspace_id, id)
);

create index deal_stage_history_deal_idx
  on public.deal_stage_history (deal_id, created_at, id);

create table public.deployments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  account_id uuid not null,
  deal_id uuid,
  product_type text not null check (product_type in (
    'voice_assistant',
    'website',
    'digital_infrastructure'
  )),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  description text,
  status text not null check (status in (
    'todo',
    'in_progress',
    'waiting_for_client',
    'testing',
    'launched',
    'completed',
    'paused',
    'cancelled'
  )),
  owner_display_name text not null,
  value_gross_cents bigint check (
    value_gross_cents is null or value_gross_cents between 0 and 9007199254740991
  ),
  currency text not null default 'PLN' check (currency = 'PLN'),
  start_on date,
  due_on date,
  completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  version integer not null default 1 check (version > 0),
  constraint deployments_account_fk
    foreign key (workspace_id, account_id)
    references public.accounts (workspace_id, id),
  constraint deployments_deal_fk
    foreign key (workspace_id, deal_id)
    references public.deals (workspace_id, id),
  constraint deployments_workspace_id_unique unique (workspace_id, id)
);

create index deployments_list_idx
  on public.deployments (workspace_id, status, due_on, id);

create table public.deployment_checklist_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  deployment_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  is_done boolean not null default false,
  sort_order integer not null check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  version integer not null default 1 check (version > 0),
  constraint deployment_checklist_deployment_fk
    foreign key (workspace_id, deployment_id)
    references public.deployments (workspace_id, id),
  constraint deployment_checklist_sort_unique unique (deployment_id, sort_order)
);

create table public.deployment_status_history (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  deployment_id uuid not null,
  from_status text,
  to_status text not null,
  actor_user_id uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  version integer not null default 1 check (version > 0),
  constraint deployment_status_history_fk
    foreign key (workspace_id, deployment_id)
    references public.deployments (workspace_id, id)
);

create index deployment_status_history_idx
  on public.deployment_status_history (deployment_id, created_at, id);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  account_id uuid,
  deal_id uuid,
  deployment_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text,
  due_on date,
  due_at timestamptz,
  status text not null check (status in ('todo', 'in_progress', 'done', 'cancelled')),
  priority text not null check (priority in ('low', 'normal', 'high')),
  kind text not null check (kind in ('task', 'follow_up')),
  origin_activity_id uuid,
  completed_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  version integer not null default 1 check (version > 0),
  constraint tasks_account_fk
    foreign key (workspace_id, account_id)
    references public.accounts (workspace_id, id),
  constraint tasks_deal_fk
    foreign key (workspace_id, deal_id)
    references public.deals (workspace_id, id),
  constraint tasks_deployment_fk
    foreign key (workspace_id, deployment_id)
    references public.deployments (workspace_id, id),
  constraint tasks_workspace_id_unique unique (workspace_id, id),
  constraint tasks_due_same_warsaw_day check (
    due_at is null
    or due_on = (due_at at time zone 'Europe/Warsaw')::date
  )
);

create index tasks_due_idx
  on public.tasks (workspace_id, status, due_on, id);

create table public.task_assignees (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  task_id uuid not null,
  user_id uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  version integer not null default 1 check (version > 0),
  constraint task_assignees_task_fk
    foreign key (workspace_id, task_id)
    references public.tasks (workspace_id, id),
  constraint task_assignees_user_unique unique (task_id, user_id)
);

create index task_assignees_user_idx
  on public.task_assignees (user_id, task_id);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  account_id uuid,
  deal_id uuid,
  deployment_id uuid,
  task_id uuid,
  meeting_record_id uuid,
  activity_type text not null check (char_length(activity_type) between 1 and 80),
  occurred_at timestamptz not null default now(),
  actor_type text not null check (actor_type in ('system', 'user', 'integration')),
  actor_user_id uuid references auth.users (id),
  action_key text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  version integer not null default 1 check (version > 0),
  constraint activities_account_fk
    foreign key (workspace_id, account_id)
    references public.accounts (workspace_id, id),
  constraint activities_deal_fk
    foreign key (workspace_id, deal_id)
    references public.deals (workspace_id, id),
  constraint activities_deployment_fk
    foreign key (workspace_id, deployment_id)
    references public.deployments (workspace_id, id),
  constraint activities_task_fk
    foreign key (workspace_id, task_id)
    references public.tasks (workspace_id, id),
  constraint activities_actor_check check (
    actor_type <> 'user' or actor_user_id is not null
  )
);

alter table public.activities
  add constraint activities_workspace_id_unique unique (workspace_id, id);

create unique index activities_action_key_idx
  on public.activities (workspace_id, action_key)
  where action_key is not null;

create index activities_timeline_idx
  on public.activities (workspace_id, created_at desc, id);

create index activities_account_idx
  on public.activities (account_id, occurred_at desc);

alter table public.tasks
  add constraint tasks_origin_activity_fk
  foreign key (workspace_id, origin_activity_id)
  references public.activities (workspace_id, id);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  account_id uuid,
  deal_id uuid,
  deployment_id uuid,
  body text not null check (char_length(btrim(body)) between 1 and 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id),
  updated_by uuid references auth.users (id),
  version integer not null default 1 check (version > 0),
  constraint notes_account_fk
    foreign key (workspace_id, account_id)
    references public.accounts (workspace_id, id),
  constraint notes_deal_fk
    foreign key (workspace_id, deal_id)
    references public.deals (workspace_id, id),
  constraint notes_deployment_fk
    foreign key (workspace_id, deployment_id)
    references public.deployments (workspace_id, id)
);

create index notes_timeline_idx
  on public.notes (workspace_id, created_at desc, id);

create table public.meeting_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  provider text not null default 'fathom' check (provider = 'fathom'),
  recording_id text not null,
  title text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  recording_url text,
  share_url text,
  summary_markdown text,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  recorded_by_email text,
  content_updated_at timestamptz,
  sync_status text not null default 'waiting_for_content' check (sync_status in (
    'waiting_for_content',
    'synced',
    'partial',
    'error'
  )),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  version integer not null default 1 check (version > 0),
  constraint meeting_records_workspace_id_unique unique (workspace_id, id),
  constraint meeting_records_recording_unique unique (workspace_id, provider, recording_id),
  constraint meeting_records_https check (
    (recording_url is null or recording_url ~ '^https://')
    and (share_url is null or share_url ~ '^https://')
  )
);

create index meeting_records_started_idx
  on public.meeting_records (workspace_id, started_at desc, id);

alter table public.activities
  add constraint activities_meeting_fk
  foreign key (workspace_id, meeting_record_id)
  references public.meeting_records (workspace_id, id);

create table public.meeting_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  meeting_record_id uuid not null,
  connection_id uuid not null,
  provider_recording_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  version integer not null default 1 check (version > 0),
  constraint meeting_sources_record_fk
    foreign key (workspace_id, meeting_record_id)
    references public.meeting_records (workspace_id, id),
  constraint meeting_sources_provider_unique unique (connection_id, provider_recording_id)
);

create table public.meeting_participants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  meeting_record_id uuid not null,
  display_name text,
  email text,
  matched_user_id uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  version integer not null default 1 check (version > 0),
  constraint meeting_participants_record_fk
    foreign key (workspace_id, meeting_record_id)
    references public.meeting_records (workspace_id, id)
);

create table public.meeting_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  meeting_record_id uuid not null,
  account_id uuid not null,
  deal_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  version integer not null default 1 check (version > 0),
  constraint meeting_links_record_fk
    foreign key (workspace_id, meeting_record_id)
    references public.meeting_records (workspace_id, id),
  constraint meeting_links_account_fk
    foreign key (workspace_id, account_id)
    references public.accounts (workspace_id, id),
  constraint meeting_links_deal_fk
    foreign key (workspace_id, deal_id)
    references public.deals (workspace_id, id),
  constraint meeting_links_once unique (meeting_record_id, account_id, deal_id)
);

create table public.meeting_transcript_segments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  meeting_record_id uuid not null,
  speaker_name text,
  speaker_email text,
  offset_ms integer check (offset_ms is null or offset_ms >= 0),
  segment_text text not null,
  ordinal integer not null check (ordinal >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  version integer not null default 1 check (version > 0),
  constraint meeting_segments_record_fk
    foreign key (workspace_id, meeting_record_id)
    references public.meeting_records (workspace_id, id),
  constraint meeting_segments_ordinal_unique unique (meeting_record_id, ordinal)
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null,
  category text not null default 'other' check (category in ('offer', 'contract', 'other')),
  status text not null default 'uploading' check (status in ('uploading', 'ready', 'failed', 'deleting')),
  size_bytes bigint not null check (size_bytes >= 0),
  uploaded_by uuid not null references auth.users (id),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  version integer not null default 1 check (version > 0),
  constraint documents_workspace_id_unique unique (workspace_id, id)
);

create index documents_list_idx
  on public.documents (workspace_id, created_at desc, id)
  where deleted_at is null;

create table public.document_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  document_id uuid not null,
  account_id uuid,
  deal_id uuid,
  deployment_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  version integer not null default 1 check (version > 0),
  constraint document_links_document_fk
    foreign key (workspace_id, document_id)
    references public.documents (workspace_id, id),
  constraint document_links_account_fk
    foreign key (workspace_id, account_id)
    references public.accounts (workspace_id, id),
  constraint document_links_deal_fk
    foreign key (workspace_id, deal_id)
    references public.deals (workspace_id, id),
  constraint document_links_deployment_fk
    foreign key (workspace_id, deployment_id)
    references public.deployments (workspace_id, id),
  constraint document_links_one_target check (
    (account_id is not null)::integer
    + (deal_id is not null)::integer
    + (deployment_id is not null)::integer = 1
  )
);

create table public.billing_agreements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  deal_id uuid not null,
  account_id uuid not null,
  kind text not null check (kind in ('setup', 'subscription')),
  amount_gross_cents bigint not null check (amount_gross_cents between 0 and 9007199254740991),
  currency text not null default 'PLN' check (currency = 'PLN'),
  starts_on date not null,
  anchor_day integer check (anchor_day between 1 and 31),
  ends_on_exclusive date,
  status text not null check (status in ('scheduled', 'active', 'ended', 'void')),
  agreement_version integer not null default 1 check (agreement_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  version integer not null default 1 check (version > 0),
  constraint billing_agreements_deal_fk
    foreign key (workspace_id, deal_id)
    references public.deals (workspace_id, id),
  constraint billing_agreements_account_fk
    foreign key (workspace_id, account_id)
    references public.accounts (workspace_id, id),
  constraint billing_agreements_workspace_id_unique unique (workspace_id, id),
  constraint billing_agreements_anchor check (
    (kind = 'setup' and anchor_day is null)
    or (kind = 'subscription' and anchor_day is not null)
  ),
  constraint billing_agreements_end_after_start check (
    ends_on_exclusive is null or ends_on_exclusive > starts_on
  )
);

create unique index billing_agreements_one_active_setup_idx
  on public.billing_agreements (deal_id)
  where kind = 'setup' and status <> 'void';

create index billing_agreements_deal_idx
  on public.billing_agreements (workspace_id, deal_id, kind, status);

create table public.revenue_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  agreement_id uuid not null,
  deal_id uuid not null,
  account_id uuid not null,
  entry_type text not null check (entry_type in ('setup', 'subscription', 'correction')),
  cycle_index integer check (cycle_index is null or cycle_index >= 0),
  effective_on date not null,
  amount_signed_cents bigint not null check (
    amount_signed_cents between -9007199254740991 and 9007199254740991
  ),
  currency text not null default 'PLN' check (currency = 'PLN'),
  reason text,
  dedupe_key text not null,
  reverses_entry_id uuid,
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  version integer not null default 1 check (version > 0),
  constraint revenue_entries_agreement_fk
    foreign key (workspace_id, agreement_id)
    references public.billing_agreements (workspace_id, id),
  constraint revenue_entries_deal_fk
    foreign key (workspace_id, deal_id)
    references public.deals (workspace_id, id),
  constraint revenue_entries_account_fk
    foreign key (workspace_id, account_id)
    references public.accounts (workspace_id, id),
  constraint revenue_entries_workspace_id_unique unique (workspace_id, id),
  constraint revenue_entries_dedupe_unique unique (dedupe_key),
  constraint revenue_entries_one_correction unique (reverses_entry_id),
  constraint revenue_entries_cycle check (
    (entry_type = 'correction' and cycle_index is null and reverses_entry_id is not null)
    or (entry_type <> 'correction' and reverses_entry_id is null)
  )
);

create unique index revenue_entries_one_active_cycle_idx
  on public.revenue_entries (agreement_id, cycle_index)
  where entry_type <> 'correction' and superseded_at is null;

create index revenue_entries_effective_idx
  on public.revenue_entries (workspace_id, effective_on, id);

alter table public.revenue_entries
  add constraint revenue_entries_reverses_fk
  foreign key (reverses_entry_id)
  references public.revenue_entries (id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  recipient_user_id uuid not null references auth.users (id),
  kind text not null,
  title text not null,
  body text,
  target_path text,
  event_key text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  version integer not null default 1 check (version > 0),
  constraint notifications_workspace_fk
    foreign key (workspace_id) references public.workspaces (id),
  constraint notifications_event_key_unique unique (recipient_user_id, event_key)
);

create index notifications_recipient_idx
  on public.notifications (recipient_user_id, created_at desc, id);

create index notifications_unread_idx
  on public.notifications (recipient_user_id, created_at desc)
  where read_at is null;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id),
  user_id uuid not null references auth.users (id),
  endpoint text not null unique,
  p256dh text not null,
  auth_secret text not null,
  installation_id text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  version integer not null default 1 check (version > 0)
);

create table public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id),
  user_id uuid not null references auth.users (id),
  morning_digest_enabled boolean not null default true,
  status_change_enabled boolean,
  assignment_enabled boolean,
  reminder_enabled boolean,
  include_overdue boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  version integer not null default 1 check (version > 0),
  constraint notification_preferences_user_unique unique (workspace_id, user_id)
);

create table public.automation_settings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces (id),
  digest_hour smallint not null default 8 check (digest_hour between 0 and 23),
  timezone text not null default 'Europe/Warsaw',
  no_answer_window_start time,
  no_answer_window_end time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  version integer not null default 1 check (version > 0),
  constraint automation_settings_timezone check (timezone = 'Europe/Warsaw')
);

create or replace function private.assert_deal_contact()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  contact_account uuid;
begin
  if new.primary_contact_id is null then
    return new;
  end if;

  select contact.account_id
    into contact_account
  from public.contacts as contact
  where contact.id = new.primary_contact_id
    and contact.workspace_id = new.workspace_id;

  if contact_account is null or contact_account is distinct from new.account_id then
    raise exception 'cross_reference' using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function private.assert_deployment_account()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  deal_account uuid;
begin
  if new.deal_id is null then
    return new;
  end if;

  select deal.account_id
    into deal_account
  from public.deals as deal
  where deal.id = new.deal_id
    and deal.workspace_id = new.workspace_id;

  if deal_account is null or deal_account is distinct from new.account_id then
    raise exception 'cross_reference' using errcode = '23514';
  end if;

  return new;
end;
$$;

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

  if new.deployment_id is not null then
    select deployment.account_id into linked_account
    from public.deployments as deployment
    where deployment.id = new.deployment_id
      and deployment.workspace_id = new.workspace_id;

    if linked_account is null
      or (new.account_id is not null and linked_account is distinct from new.account_id) then
      raise exception 'cross_reference' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.assert_meeting_link_account()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  deal_account uuid;
begin
  if new.deal_id is null then
    return new;
  end if;

  select deal.account_id into deal_account
  from public.deals as deal
  where deal.id = new.deal_id
    and deal.workspace_id = new.workspace_id;

  if deal_account is null or deal_account is distinct from new.account_id then
    raise exception 'cross_reference' using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function private.reject_revenue_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'revenue_immutable' using errcode = '42501';
  end if;

  if new.amount_signed_cents is distinct from old.amount_signed_cents
    or new.effective_on is distinct from old.effective_on
    or new.agreement_id is distinct from old.agreement_id
    or new.deal_id is distinct from old.deal_id
    or new.account_id is distinct from old.account_id
    or new.entry_type is distinct from old.entry_type
    or new.cycle_index is distinct from old.cycle_index
    or new.dedupe_key is distinct from old.dedupe_key
    or new.reverses_entry_id is distinct from old.reverses_entry_id
    or new.currency is distinct from old.currency
    or new.workspace_id is distinct from old.workspace_id
  then
    raise exception 'revenue_immutable' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.assert_deal_contact() from public, anon, authenticated;
revoke all on function private.assert_deployment_account() from public, anon, authenticated;
revoke all on function private.assert_task_links() from public, anon, authenticated;
revoke all on function private.assert_meeting_link_account() from public, anon, authenticated;
revoke all on function private.reject_revenue_mutation() from public, anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'accounts',
    'contacts',
    'deals',
    'deployments',
    'deployment_checklist_items',
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
    execute format(
      'create trigger %I before update on public.%I for each row execute function private.touch_row()',
      table_name || '_touch',
      table_name
    );
  end loop;

  foreach table_name in array array[
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
    execute format(
      'create trigger %I before update on public.%I for each row execute function private.reject_workspace_move()',
      table_name || '_no_workspace_move',
      table_name
    );
  end loop;
end;
$$;

create trigger deals_contact_account
  before insert or update of primary_contact_id, account_id, workspace_id
  on public.deals
  for each row execute function private.assert_deal_contact();

create trigger deployments_deal_account
  before insert or update of deal_id, account_id, workspace_id
  on public.deployments
  for each row execute function private.assert_deployment_account();

create trigger tasks_linked_accounts
  before insert or update of deal_id, deployment_id, account_id, workspace_id
  on public.tasks
  for each row execute function private.assert_task_links();

create trigger meeting_links_deal_account
  before insert or update of deal_id, account_id, workspace_id
  on public.meeting_links
  for each row execute function private.assert_meeting_link_account();

create trigger revenue_entries_immutable
  before update or delete on public.revenue_entries
  for each row execute function private.reject_revenue_mutation();

create trigger deal_stage_history_append_only
  before update or delete on public.deal_stage_history
  for each row execute function private.reject_history_change();

create trigger deployment_status_history_append_only
  before update or delete on public.deployment_status_history
  for each row execute function private.reject_history_change();
