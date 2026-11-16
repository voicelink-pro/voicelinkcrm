-- Tabela trwałych linków zaproszeń dla użytkowników (ważnych przez 48 godzin i wielokrotnego wejścia aż do ustawienia hasła).

create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index if not exists workspace_invites_user_idx
  on public.workspace_invites (user_id, used_at);

alter table public.workspace_invites enable row level security;

revoke all on public.workspace_invites from anon, public, authenticated;
grant select, insert, update, delete on public.workspace_invites to service_role;

notify pgrst, 'reload schema';
