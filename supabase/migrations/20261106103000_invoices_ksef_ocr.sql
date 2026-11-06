-- Moduł Faktury + Integracja KSeF API + Załączniki PDF z OCR

create table if not exists public.ksef_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  environment text not null default 'test'
    check (environment in ('test', 'demo', 'prod')),
  nip text not null,
  company_name text not null default 'VoiceLink',
  auth_token text,
  enabled boolean not null default true,
  auto_sync boolean not null default true,
  sync_interval_minutes integer not null default 15
    check (sync_interval_minutes between 5 and 1440),
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  version integer not null default 1 check (version > 0),
  constraint ksef_connections_workspace_unique unique (workspace_id)
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  account_id uuid references public.accounts (id) on delete set null,
  document_id uuid references public.documents (id) on delete set null,
  source text not null default 'manual'
    check (source in ('ksef', 'pdf_ocr', 'manual')),
  kind text not null default 'sales'
    check (kind in ('sales', 'purchase')),
  status text not null default 'issued'
    check (status in ('draft', 'issued', 'paid', 'overdue', 'cancelled')),
  invoice_number text not null,
  ksef_reference_number text,
  issue_date date not null default current_date,
  sale_date date,
  due_date date,
  paid_at timestamptz,
  seller_name text not null default 'VoiceLink',
  seller_nip text,
  buyer_name text not null,
  buyer_nip text,
  currency text not null default 'PLN',
  net_cents bigint not null default 0,
  vat_cents bigint not null default 0,
  gross_cents bigint not null default 0,
  payment_method text not null default 'transfer',
  bank_account text,
  notes text,
  ocr_raw_text text,
  ocr_confidence integer check (ocr_confidence is null or (ocr_confidence between 0 and 100)),
  ksef_xml text,
  line_items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  version integer not null default 1 check (version > 0)
);

create unique index if not exists invoices_workspace_ksef_ref_unique
  on public.invoices (workspace_id, ksef_reference_number)
  where ksef_reference_number is not null;

create index if not exists invoices_workspace_issue_idx
  on public.invoices (workspace_id, issue_date desc, created_at desc);

create index if not exists invoices_workspace_account_idx
  on public.invoices (workspace_id, account_id);

alter table public.ksef_connections enable row level security;
alter table public.invoices enable row level security;

drop policy if exists ksef_connections_member_select on public.ksef_connections;
create policy ksef_connections_member_select
  on public.ksef_connections
  for select
  to authenticated
  using (private.is_active_member(workspace_id));

drop policy if exists invoices_member_select on public.invoices;
create policy invoices_member_select
  on public.invoices
  for select
  to authenticated
  using (private.is_active_member(workspace_id));

grant select on public.ksef_connections to authenticated;
grant select on public.invoices to authenticated;

drop trigger if exists ksef_connections_touch on public.ksef_connections;
create trigger ksef_connections_touch
  before update on public.ksef_connections
  for each row execute function private.touch_row();

drop trigger if exists invoices_touch on public.invoices;
create trigger invoices_touch
  before update on public.invoices
  for each row execute function private.touch_row();

-- Kategorie dokumentów: dodajemy "invoice" (Faktura) obok offer, integration, contract, other
alter table public.documents
  drop constraint if exists documents_category_check;

alter table public.documents
  add constraint documents_category_check
  check (category in ('offer', 'integration', 'contract', 'invoice', 'other'));

create or replace function private.begin_document_upload(
  p_actor_user_id uuid,
  p_original_name text,
  p_mime_type text,
  p_size_bytes bigint,
  p_category text default 'other',
  p_account_id uuid default null,
  p_deal_id uuid default null,
  p_deployment_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_settings public.automation_settings;
  v_document_id uuid;
  v_safe_name text;
  v_storage_path text;
  v_mime text;
  v_link_count integer;
  v_account_id uuid := p_account_id;
begin
  perform private.assert_server_role();
  v_workspace_id := private.require_actor_workspace(p_actor_user_id);

  select *
    into v_settings
  from public.automation_settings as settings
  where settings.workspace_id = v_workspace_id;

  v_mime := pg_catalog.lower(pg_catalog.btrim(coalesce(p_mime_type, '')));

  if p_size_bytes is null
     or p_size_bytes <= 0
     or p_size_bytes > coalesce(v_settings.document_max_bytes, 26214400) then
    raise exception 'document_size_invalid' using errcode = 'P0001';
  end if;

  if not private.document_mime_allowed(v_mime, v_settings.document_mime_types) then
    raise exception 'document_mime_invalid' using errcode = 'P0001';
  end if;

  if p_category is null or p_category not in ('offer', 'integration', 'contract', 'invoice', 'other') then
    raise exception 'document_category_invalid' using errcode = 'P0001';
  end if;

  v_safe_name := pg_catalog.btrim(
    pg_catalog.regexp_replace(coalesce(p_original_name, ''), '[[:cntrl:]/\\]+', ' ', 'g')
  );

  if v_safe_name = '' or pg_catalog.char_length(v_safe_name) > 240 then
    raise exception 'document_name_invalid' using errcode = 'P0001';
  end if;

  v_link_count := (case when p_account_id is not null then 1 else 0 end)
    + (case when p_deal_id is not null then 1 else 0 end);

  if v_link_count > 1 then
    raise exception 'document_link_invalid' using errcode = 'P0001';
  end if;

  if p_account_id is not null and not exists (
    select 1
    from public.accounts as account
    where account.id = p_account_id
      and account.workspace_id = v_workspace_id
      and account.archived_at is null
  ) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if p_deal_id is not null then
    select deal.account_id
      into v_account_id
    from public.deals as deal
    where deal.id = p_deal_id
      and deal.workspace_id = v_workspace_id
      and deal.archived_at is null;

    if v_account_id is null then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
  end if;

  v_document_id := gen_random_uuid();
  v_storage_path := v_workspace_id::text || '/' || v_document_id::text;

  insert into public.documents (
    id,
    workspace_id,
    storage_bucket,
    storage_path,
    original_name,
    mime_type,
    size_bytes,
    category,
    status,
    created_by,
    updated_by
  )
  values (
    v_document_id,
    v_workspace_id,
    'documents',
    v_storage_path,
    v_safe_name,
    v_mime,
    p_size_bytes,
    p_category,
    'uploading',
    p_actor_user_id,
    p_actor_user_id
  );

  if v_link_count = 1 then
    insert into public.document_links (
      workspace_id,
      document_id,
      account_id,
      deal_id,
      created_by,
      updated_by
    )
    values (
      v_workspace_id,
      v_document_id,
      v_account_id,
      p_deal_id,
      p_actor_user_id,
      p_actor_user_id
    );
  end if;

  return jsonb_build_object(
    'id', v_document_id,
    'storage_bucket', 'documents',
    'storage_path', v_storage_path
  );
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.invoices;
exception
  when duplicate_object then null;
end;
$$;
