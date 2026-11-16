-- Zastąpienie częściowego indeksu unikalnego na calendar_events pełnym ograniczeniem UNIQUE,
-- aby PostgREST/Supabase mógł obsłużyć upsert onConflict: "source_id,external_uid"
-- (w PostgreSQL wiele wartości NULL w UNIQUE jest dozwolone dla ręcznych wydarzeń bez source_id).

drop index if exists public.calendar_events_source_uid_idx;

alter table public.calendar_events
  drop constraint if exists calendar_events_source_uid_unique;

alter table public.calendar_events
  add constraint calendar_events_source_uid_unique unique (source_id, external_uid);

notify pgrst, 'reload schema';
