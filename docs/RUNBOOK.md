# Runbook VoiceLink CRM

Ten dokument opisuje środowiska, sekrety, konta, cron, kopie i naprawę. Wartości sekretów zostają w Vercel i w Supabase Vault. Nie wklejaj ich do repozytorium ani do czatu.

Repozytorium GitHub i projekt Vercel nie są jeszcze utworzone. Pliki są gotowe do publikacji. Publikacja wymaga osobnego zatwierdzenia.

## Trzy środowiska

| Środowisko | Gdzie działa | Baza | Skutki uboczne |
|---|---|---|---|
| development | `pnpm dev` na komputerze operatora | lokalny Supabase tego projektu, porty 54421 i 54422 | dozwolone na fikcyjnych danych |
| preview | deployment Vercel z pull requestu | osobny projekt Supabase, nigdy produkcyjny | wyłączone |
| production | deployment Vercel z gałęzi `main` | produkcyjny projekt Supabase | włączane po kolei, po checklistie |

`VERCEL_ENV=preview` blokuje tik workera, odbiór n8n, odbiór i wywołania Fathoma oraz wysyłkę push. Samo skopiowanie produkcyjnych flag tego nie odblokuje. Odblokowanie wymaga `ENABLE_PREVIEW_SIDE_EFFECTS=true` i tylko na bazie nieprodukcyjnej.

Na preview zostaw puste: `ENABLE_BACKGROUND_JOBS`, `ENABLE_OUTBOUND_PUSH`, `ENABLE_PREVIEW_SIDE_EFFECTS`, `JOB_WORKER_SECRET`, token n8n, klucze Fathom, klucze VAPID i `SUPABASE_SECRET_KEY` produkcji. Preview dostaje własny URL, własny klucz publikowalny i własny klucz serwisowy.

Lokalne `supabase db reset` czyści tylko lokalną bazę i odtwarza seed. Nie uruchamiaj go na preview ani na produkcji. Naprawa danych produkcyjnych nie polega na kasowaniu rekordów.

## Vercel

1. Po zatwierdzeniu publikacji połącz repozytorium GitHub z nowym projektem Vercel. Framework: Next.js. Katalog główny: korzeń repozytorium. Node: 24, zgodnie z `.node-version`.
2. Nie dodawaj crona Vercel. Harmonogram jest w Supabase i woła aplikację co minutę.
3. Produkcja dostaje zmienne z `.env.example`. `APP_URL` to kanoniczny adres `https://…` bez ukośnika na końcu.
4. Preview dostaje osobny projekt Supabase i puste flagi skutków ubocznych.
5. Po zmianie zmiennej zrób redeploy. Next wbudowuje `NEXT_PUBLIC_*` w build.

Zmienne:

| Nazwa | Produkcja |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL projektu produkcji |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | klucz publikowalny produkcji |
| `SUPABASE_SECRET_KEY` | klucz `service_role` produkcji, tylko serwer |
| `APP_URL` | kanoniczny adres aplikacji |
| `N8N_LEADS_WEBHOOK_TOKEN` | losowy token, inny niż na preview |
| `N8N_LEADS_WORKSPACE_ID` | `id` wiersza z `public.workspaces` |
| `FATHOM_ACCOUNT_1_API_KEY` | klucz pierwszego konta, gdy operator go ma |
| `FATHOM_ACCOUNT_1_WEBHOOK_SECRET` | sekret podpisu webhooka tego konta |
| `FATHOM_ACCOUNT_2_API_KEY` | tylko gdy istnieje drugie konto |
| `FATHOM_ACCOUNT_2_WEBHOOK_SECRET` | sekret drugiego konta |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | klucz publiczny Web Push |
| `VAPID_PRIVATE_KEY` | klucz prywatny, tylko serwer |
| `VAPID_SUBJECT` | `mailto:` operatora |
| `JOB_WORKER_SECRET` | losowy sekret tiku, ten sam tekst co w Vault |
| `ENABLE_BACKGROUND_JOBS` | `true` dopiero, gdy cron i sekret są gotowe |
| `ENABLE_OUTBOUND_PUSH` | `true` dopiero, gdy klucze VAPID są gotowe |
| `ENABLE_PREVIEW_SIDE_EFFECTS` | puste na produkcji |

`N8N_LEADS_MAX_BODY_BYTES` i `N8N_LEADS_RATE_LIMIT` są opcjonalne. Domyślnie 32 KB i 60 żądań na 60 sekund.

## Supabase

Migracje leżą w `supabase/migrations`. Na nowym projekcie produkcji:

```bash
supabase link --project-ref <ref-produkcji>
supabase db push
```

`db push` dokłada brakujące migracje. Nie uruchamia `db reset` i nie kasuje istniejących wierszy. Po pierwszej publikacji każda kolejna migracja też idzie przez `db push` na produkcji i osobno na projekcie preview.

### Adresy Auth

W Authentication → URL Configuration ustaw:

- Site URL: produkcyjny `APP_URL`
- Redirect URLs: `https://<domena>/auth/callback` oraz, dla preview, dokładny adres `https://<projekt-preview>.vercel.app/auth/callback`

Wyłącz publiczną rejestrację. Dostawca e-mail zostaje włączony, inaczej logowanie hasłem nie działa. Hasło ustawione przez operatora ma co najmniej 8 znaków.

Bucket `documents` powstaje z migracji. Jest prywatny, limit pliku to 25 MB, a dozwolone typy to PDF, DOCX, XLSX, TXT, PNG i JPEG. Nie dodawaj polityki dla `anon` ani `authenticated`. Odczyt i zapis idą przez podpisany URL po sprawdzeniu członkostwa.

### Workspace i dwa konta

1. W Authentication dodaj dwie osoby. Zaznacz potwierdzenie adresu. Hasło nadaje operator i przekazuje je poza repozytorium.
2. W `supabase/manual/bootstrap-workspace.sql` zamień dwa adresy na te konta.
3. Uruchom plik raz na bazie produkcji:

```bash
psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f supabase/manual/bootstrap-workspace.sql
```

4. W Studio ustaw `profiles.full_name` na imię i nazwisko. Adres e-mail nie zostaje nazwą wyświetlaną.
5. Skopiuj `workspaces.id` do `N8N_LEADS_WORKSPACE_ID`.
6. Zaloguj każdą osobę. Wejście na `/clients` bez sesji ma prowadzić na `/login` i nie pokazywać firm. Osoba spoza `workspace_members` nie widzi danych.

Plik przerywa się, gdy w bazie jest już jakikolwiek workspace. Drugi raz go nie uruchamiaj.

### Cron i Vault

1. W projekcie produkcji włącz rozszerzenia `pg_cron` i `pg_net`.
2. W Vault utwórz sekret o nazwie `job_worker_secret`. Treść jest taka sama jak `JOB_WORKER_SECRET`. Nazwa w Vault jest stała, wartość nie wchodzi do SQL.
3. W `supabase/manual/worker-cron.sql` zamień `https://APP_URL` na produkcyjny adres.
4. Uruchom ten plik raz na produkcji. Cron woła `POST /api/worker/tick` co minutę. Ponowne uruchomienie zdejmuje poprzedni wpis o tej nazwie i zakłada go od nowa.
5. Ustaw `ENABLE_BACKGROUND_JOBS=true` i zrób redeploy. Dopiero wtedy poprawny sekret wykonuje prace. Zły sekret dostaje 401. Brak sekretu albo wyłączone prace dają 503. Preview z tym samym sekretem też dostaje 503, dopóki flaga preview nie jest jawnie włączona.

Tik obsługuje `morning_digest`, `revenue_catch_up`, `fathom_poll` i `push_send`. Digest powstaje od 08:00 Europe/Warsaw dla zadań na dziś. Pusty dzień nie tworzy powiadomienia. Zmiana statusu, przypisanie, przypomnienie i zaległe zadania nie są wysyłane.

## n8n

Adres: `POST {APP_URL}/api/integrations/n8n/leads`

Nagłówki: `Authorization: Bearer <N8N_LEADS_WEBHOOK_TOKEN>` i `Idempotency-Key` równy `event_id`. Kontrakt treści, kodów i retry jest w `docs/API.md`. Workflow buduje operator. Produkcyjny workflow wskazuje tylko produkcyjny `APP_URL` i produkcyjny token. Preview nie przyjmuje tego ruchu, dopóki `ENABLE_PREVIEW_SIDE_EFFECTS` nie jest `true`.

Ekran Ustawienia pokazuje, czy token jest ustawiony, oraz liczniki przyjętych, duplikatów, jakości i testów. Nie pokazuje wartości tokenu.

## Fathom

1. Zalogowany członek w Ustawieniach wybiera „Dodaj konto Fathom”, jeśli połączenia jeszcze nie ma. To tworzy wpis `fathom/account-1`.
2. „Dodaj drugie konto” tworzy `fathom/account-2`. Oba używają tej samej tabeli spotkań i osobnych sekretów.
3. Na serwerze ustaw odpowiadający klucz i sekret webhooka. Ekran mówi tylko, czy są ustawione.
4. Wpisz e-mail osoby, której własne nagrania mają wchodzić. Synchronizacja nie zgaduje przy kilku pasujących szansach.
5. W Fathomie ustaw webhook na adres pokazany w ustawieniach: `{APP_URL}/api/integrations/fathom/<id-połączenia>/webhook`. Adres produkcji nie może wskazywać preview.
6. Przycisk Synchronizuj pobiera nagrania od razu. Cron robi to samo przez pracę `fathom_poll`, gdy prace są włączone. Brak klucza kończy pracę bez tworzenia spotkania.

## Push

Klucze VAPID generuje operator i wstawia do trzech zmiennych. `ENABLE_OUTBOUND_PUSH=true` włącza wysyłkę. Bez kluczy albo bez urządzenia powiadomienie zostaje w centrum, a push nie wychodzi. Test w centrum tworzy jedno powiadomienie zalogowanej osoby. Odbiór na iOS i Android nie jest zaliczony, dopóki nie ma zapisu z prawdziwego telefonu.

## Kopie i odtwarzanie

Plan płatny Supabase nie został wybrany. Point-in-time recovery jest dostępne od planu Pro i nie jest włączone. Do czasu wyboru planu kopia przed wydaniem wygląda tak:

1. Zatrzymaj na chwilę świadomość, że cron może dopisać wiersz w trakcie zrzutu. Zrzut i tak jest kopią logiczną z chwili uruchomienia.
2. Zrób zrzut bazy z panelu Supabase albo `supabase db dump --linked -f backup.sql`. Plik trzymaj poza repozytorium.
3. Z bucketu `documents` pobierz obiekty do magazynu operatora. Podpisane adresy z aplikacji wygasają, więc do kopii użyj narzędzia Storage w panelu albo klucza serwisowego poza czatem.
4. Przywrócenie bazy to nowy projekt albo pusta baza i odtworzenie zrzutu, potem ponowne wgranie obiektów do bucketu `documents` pod tymi samymi ścieżkami. Przywrócenie nadpisuje stan bazy z chwili zrzutu. Nie jest sposobem na cofnięcie jednej błędnej edycji.

Gdy operator wybierze plan Pro albo wyższy, włącza codzienne kopie i PITR w panelu projektu produkcji. Preview nie potrzebuje PITR.

## Monitoring

- Dashboard pokazuje, czy ostatni tik jest świeży. Brak tiku oznacza, że cron, sekret albo flaga prac nie działają.
- Powiadomienia pokazują liczbę martwych prac.
- Ustawienia pokazują ostatni błąd n8n i ostatni błąd każdego połączenia Fathom.
- Logi funkcji Vercel obejmują `/api/worker/tick` oraz webhooki. Logi Supabase obejmują bazę, Auth i wywołania `pg_net`.

Osobny system typu Sentry nie jest podłączony.

## Rotacja sekretów

Zrób to pojedynczo i zapisz godzinę poza repozytorium.

- Worker: nowa wartość w Vault i w `JOB_WORKER_SECRET`, potem redeploy. Cron czyta Vault przy każdym tiku. Do czasu zgodności obu miejsc tik może dostać 401. Jeden taki tik nie tworzy drugiej pozycji biznesowej.
- Token n8n: nowa wartość w Vercel, redeploy, potem ta sama wartość w credentialu n8n. W przerwie n8n dostaje 401 i może powtórzyć żądanie tym samym `event_id`.
- Fathom: nowy klucz i sekret w Vercel, redeploy, potem ten sam sekret w konfiguracji webhooka Fathom.
- VAPID: nowa para unieważnia zapisane subskrypcje. Po redeploy każda osoba włącza powiadomienia ponownie. Nie rotuj tej pary bez tej świadomości.

## Martwe prace

Praca po pięciu nieudanych próbach ma status `dead`. W Powiadomieniach przycisk „Wznów błędne prace” zeruje licznik prób tej samej pracy i ustawia ją z powrotem jako `pending`. Nie tworzy drugiej pracy ani drugiej pozycji biznesowej. Przycisk jest dostępny dla zalogowanego członka.

## Niedokończone pliki

Wysyłka, która została w stanie ładowania dłużej niż 24 godziny, nie jest plikiem gotowym. Zalogowany członek na liście Dokumenty wybiera „Porządkuj niedokończone”. Akcja usuwa obiekt ze Storage i dopiero potem zdejmuje wiersz. Gdy Storage nie odda obiektu, wiersz zostaje i akcję można powtórzyć.

## Testy SQL

Na bazie testowej, nigdy produkcyjnej:

```bash
SUPABASE_DB_URL="$TEST_DB_URL" bash scripts/run-integration.sh
```

Każdy plik robi rollback. W GitHub testy SQL startują tylko wtedy, gdy zmienna repozytorium `RUN_SQL_INTEGRATION` ma wartość `true`, a sekret `SUPABASE_DB_URL` wskazuje bazę testową. Domyślnie ta zmienna jest wyłączona. CI bez niej i tak uruchamia instalację z lockfile, lint, typecheck, testy jednostkowe i build.
