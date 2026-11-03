# Lista wydania

Odhaczaj po wykonaniu na środowisku, którego dotyczy punkt. Lokalne zaliczenie nie odhacza produkcji.

## Przed pierwszym wydaniem

- [ ] Repozytorium GitHub istnieje, a gałąź `main` jest chroniona.
- [ ] Projekt Vercel jest połączony z tym repozytorium. Node to 24.
- [ ] Produkcja i preview mają osobne projekty Supabase.
- [ ] Preview nie ma produkcyjnego `SUPABASE_SECRET_KEY`, tokenu n8n, sekretu workera, kluczy Fathom ani VAPID.
- [ ] `ENABLE_BACKGROUND_JOBS`, `ENABLE_OUTBOUND_PUSH` i `ENABLE_PREVIEW_SIDE_EFFECTS` są puste na preview.
- [ ] `supabase db push` przeszedł na preview, a potem na produkcji. Nikt nie uruchamiał `db reset` na tych bazach.
- [ ] Publiczna rejestracja Auth jest wyłączona. Site URL i redirect `/auth/callback` wskazują właściwą domenę.
- [ ] Bucket `documents` jest prywatny.
- [ ] `supabase/manual/bootstrap-workspace.sql` został uruchomiony raz, z prawdziwymi adresami dwóch osób. `full_name` to imię i nazwisko.
- [ ] Obie osoby logują się hasłem nadanym przez operatora. Wejście na `/clients` bez sesji wraca na `/login` i nie pokazuje firm.
- [ ] `JOB_WORKER_SECRET` jest w Vercel i pod nazwą `job_worker_secret` w Vault. Cron z `supabase/manual/worker-cron.sql` wskazuje produkcyjny adres.
- [ ] Po redeploy z `ENABLE_BACKGROUND_JOBS=true` dashboard przestaje mówić, że tiku nie było.
- [ ] Workflow n8n wskazuje produkcyjny adres i produkcyjny token. Kontrakt jest w `docs/API.md`.
- [ ] Jeśli Fathom jest w tym wydaniu: pierwsze połączenie dodane w ustawieniach, klucz i sekret webhooka ustawione, adres webhooka to produkcja. Drugie konto tylko wtedy, gdy jest potrzebne.
- [ ] Jeśli push jest w tym wydaniu: trzy zmienne VAPID i `ENABLE_OUTBOUND_PUSH=true`. Bez urządzenia nie odhaczaj odbioru na telefonie.
- [ ] Zrzut bazy i kopia bucketu `documents` są poza repozytorium. Plan Pro i PITR pozostają nieodhączone, dopóki operator ich nie wybierze.
- [ ] CI na GitHub jest zielone: lint, typecheck, testy jednostkowe i build. Testy SQL są uruchomione na bazie testowej, nie produkcyjnej.

## Smoke po deploymentcie

Użyj nowego, fikcyjnego `event_id`. Nie powtarzaj go później z inną treścią.

- [ ] `POST /api/integrations/n8n/leads` z imieniem, e-mailem i telefonem zwraca 201 i tworzy leada bez wymyślonej firmy, gdy firmy nie ma w treści.
- [ ] Na karcie leada powstaje zadanie z terminem i osobą.
- [ ] Finalizacja wygranej zapisuje naliczenie w ewidencji. Przychód nie zależy od liczby wdrożeń.
- [ ] Z wygranej powstaje wdrożenie.
- [ ] Do leada albo firmy dochodzi dokument, który na liście ma stan gotowy. Lista nie pokazuje bajtów pliku.
- [ ] Powtórka tego samego `event_id` zwraca 200 i nie tworzy drugiego leada.
- [ ] Osobno: synchronizacja Fathom albo webhook tworzy jedno spotkanie. Bez klucza ten punkt zostaje otwarty, a nie zaliczony.
- [ ] Osobno: test push na zainstalowanej PWA iOS i Android. Emulacja przeglądarki tego nie zalicza.

## Po wydaniu

- [ ] Dashboard, ustawienia n8n i Fathom oraz licznik martwych prac są sprawdzone następnego ranka po 08:00 Europe/Warsaw.
- [ ] Digest nie powstał dla osoby bez zadań na dziś.
- [ ] Adres preview odrzuca tik, n8n i Fathom kodem 503, dopóki flaga preview jest pusta.
