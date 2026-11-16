-- Dodanie roli w workspace_members (admin / member) oraz nadanie uprawnień admina kontu karol.kulis@voicelink.pl.

alter table public.workspace_members
  add column if not exists role text not null default 'member'
    check (role in ('admin', 'member'));

update public.workspace_members
set role = 'admin'
where user_id = 'c3ea6556-0a75-4329-9985-28e7d68de03a'
   or user_id in (
     select id from auth.users where lower(email) = 'karol.kulis@voicelink.pl'
   );

notify pgrst, 'reload schema';
