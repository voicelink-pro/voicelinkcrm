-- Raz na produkcyjnym projekcie Supabase, po zapisaniu sekretu w Vault pod nazwą job_worker_secret.
-- To nie jest migracja. Nie wkładaj wartości sekretu do tego pliku.
-- Zamień https://APP_URL na produkcyjny APP_URL bez ukośnika na końcu.
-- Nie kieruj crona na adres preview.

do $$
begin
  perform cron.unschedule('voicelink-worker-tick');
exception
  when others then
    null;
end
$$;

select cron.schedule(
  'voicelink-worker-tick',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://APP_URL/api/worker/tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'job_worker_secret'
        limit 1
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  ) as request_id;
  $cron$
);
