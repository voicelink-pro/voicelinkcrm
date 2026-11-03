-- Połączenia i kolejki nie są widoczne w Data API dla użytkowników.
-- secret_ref to nazwa sekretu w magazynie serwera, nigdy jego wartość.

create table private.integration_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id),
  provider text not null check (char_length(provider) between 1 and 80),
  owner_user_id uuid references auth.users (id),
  secret_ref text not null check (char_length(secret_ref) between 1 and 200),
  status text not null default 'active' check (status in ('active', 'disabled', 'error')),
  cursor jsonb not null default '{}'::jsonb,
  last_success_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0)
);

alter table public.meeting_sources
  add constraint meeting_sources_connection_fk
  foreign key (connection_id)
  references private.integration_connections (id);

create table private.inbound_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id),
  connection_id uuid references private.integration_connections (id),
  provider text not null,
  event_id text not null,
  payload_hash text not null,
  status text not null check (status in (
    'processed',
    'duplicate',
    'review',
    'ignored_test',
    'invalid'
  )),
  result jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  constraint inbound_events_provider_event_unique unique (provider, event_id)
);

create index inbound_events_received_idx
  on private.inbound_events (received_at desc, id);

create table private.external_lead_refs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id),
  source text not null,
  source_record_id text not null,
  account_id uuid,
  contact_id uuid,
  deal_id uuid,
  outcome text not null check (outcome in ('created', 'review', 'invalid')),
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint external_lead_refs_source_unique unique (workspace_id, source, source_record_id)
);

create table private.import_review_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id),
  inbound_event_id uuid not null references private.inbound_events (id),
  reason text not null,
  payload jsonb not null,
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index import_review_open_idx
  on private.import_review_items (workspace_id, created_at)
  where status = 'open';

create table private.domain_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id),
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  constraint domain_events_dedupe_unique unique (dedupe_key)
);

create index domain_events_created_idx
  on private.domain_events (workspace_id, created_at, id);

create table private.job_queue (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces (id),
  job_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in (
    'pending',
    'running',
    'succeeded',
    'failed',
    'dead'
  )),
  run_after timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  locked_until timestamptz,
  last_error text,
  dedupe_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index job_queue_dedupe_idx
  on private.job_queue (dedupe_key)
  where dedupe_key is not null;

create index job_queue_pending_idx
  on private.job_queue (run_after, id)
  where status = 'pending';

create table private.job_runs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references private.job_queue (id),
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error text
);

create table private.push_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid references public.notifications (id),
  subscription_id uuid references public.push_subscriptions (id),
  status text not null check (status in ('pending', 'sent', 'failed', 'gone')),
  provider_code integer,
  error text,
  created_at timestamptz not null default now()
);

revoke all on all tables in schema private from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema private to service_role;
