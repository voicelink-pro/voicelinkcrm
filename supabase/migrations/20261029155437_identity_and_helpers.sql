-- Schemat techniczny nie jest czytany przez anon ani authenticated.
-- Funkcje i tabele private obsługuje wyłącznie rola serwerowa.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon, authenticated;
grant usage on schema private to service_role;

alter default privileges for role postgres in schema private
  revoke execute on functions from public;
alter default privileges for role postgres in schema private
  revoke all on tables from public, anon, authenticated;

comment on schema private is
  'Tabele techniczne i funkcje backendu. Brak grantów odczytu dla anon i authenticated.';

create or replace function private.touch_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  if tg_op = 'UPDATE' then
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

create or replace function private.reject_workspace_move()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.workspace_id is distinct from old.workspace_id then
    raise exception 'workspace_change_forbidden' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function private.guard_membership_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'membership_change_forbidden' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and (
    new.workspace_id is distinct from old.workspace_id
    or new.user_id is distinct from old.user_id
  ) then
    raise exception 'membership_change_forbidden' using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function private.reject_history_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'history_append_only' using errcode = '42501';
end;
$$;

revoke all on function private.touch_row() from public, anon, authenticated;
revoke all on function private.reject_workspace_move() from public, anon, authenticated;
revoke all on function private.guard_membership_write() from public, anon, authenticated;
revoke all on function private.reject_history_change() from public, anon, authenticated;
grant execute on function private.touch_row() to service_role;
grant execute on function private.reject_workspace_move() to service_role;
grant execute on function private.guard_membership_write() to service_role;
grant execute on function private.reject_history_change() to service_role;

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'Europe/Warsaw',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  version integer not null default 1 check (version > 0),
  constraint workspaces_timezone_check check (timezone = 'Europe/Warsaw')
);

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id),
  user_id uuid not null references auth.users (id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  version integer not null default 1 check (version > 0),
  constraint workspace_members_pair_unique unique (workspace_id, user_id),
  constraint workspace_members_workspace_id_unique unique (workspace_id, id)
);

create index workspace_members_user_active_idx
  on public.workspace_members (user_id, active);

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id uuid not null,
  full_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  version integer not null default 1 check (version > 0),
  constraint profiles_member_fk
    foreign key (workspace_id, user_id)
    references public.workspace_members (workspace_id, user_id),
  constraint profiles_workspace_id_unique unique (workspace_id, id),
  constraint profiles_user_unique unique (workspace_id, user_id)
);

create trigger workspaces_touch
  before update on public.workspaces
  for each row execute function private.touch_row();

create trigger workspace_members_touch
  before update on public.workspace_members
  for each row execute function private.touch_row();

create trigger workspace_members_guard
  before insert or update on public.workspace_members
  for each row execute function private.guard_membership_write();

create trigger profiles_touch
  before update on public.profiles
  for each row execute function private.touch_row();

create trigger profiles_no_workspace_move
  before update on public.profiles
  for each row execute function private.reject_workspace_move();
