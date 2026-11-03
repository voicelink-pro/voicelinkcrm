-- Raz na pustej bazie produkcji, po migracjach. To nie jest migracja.
-- Nie uruchamiaj tego pliku na lokalnej bazie z seedem i nie rób db reset na produkcji.
-- Najpierw wyłącz publiczną rejestrację, utwórz dwa potwierdzone konta w Authentication
-- i zamień dwa adresy poniżej na te konta. Potem ustaw profiles.full_name na imię i nazwisko.

do $$
begin
  if exists (select 1 from public.workspaces) then
    raise exception 'workspace_exists';
  end if;
end
$$;

insert into public.workspaces (name, timezone)
values ('VoiceLink', 'Europe/Warsaw');

insert into public.automation_settings (
  workspace_id,
  digest_hour,
  timezone,
  no_answer_window_start,
  no_answer_window_end
)
select id, 8, 'Europe/Warsaw', time '09:00', time '15:00'
from public.workspaces
where name = 'VoiceLink';

-- Wstaw dwa adresy założone w Authentication. Hasła nie należą do tego pliku.
insert into public.workspace_members (workspace_id, user_id, active)
select workspace.id, users.id, true
from public.workspaces as workspace
join auth.users as users
  on users.email in ('pierwsza.osoba@domena-firmy', 'druga.osoba@domena-firmy')
where workspace.name = 'VoiceLink';

insert into public.profiles (workspace_id, user_id, full_name)
select members.workspace_id, members.user_id, users.email
from public.workspace_members as members
join auth.users as users on users.id = members.user_id
join public.workspaces as workspace on workspace.id = members.workspace_id
where workspace.name = 'VoiceLink';

insert into public.notification_preferences (workspace_id, user_id, morning_digest_enabled)
select members.workspace_id, members.user_id, true
from public.workspace_members as members
join public.workspaces as workspace on workspace.id = members.workspace_id
where workspace.name = 'VoiceLink';
