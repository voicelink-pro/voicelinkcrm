# VoiceLink CRM

Wewnętrzny CRM zespołu VoiceLink. Aplikacja jest w trakcie budowy według specyfikacji `VoiceLink_CRM_prompt_Grok.md`. Aktualny zakres i wyniki testów są w `docs/IMPLEMENTATION_STATUS.md`.

## Wymagania

- Node.js 22 lub nowszy. Vercel dla nowego projektu używa 24.x.
- pnpm 10.

## Uruchomienie

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

`supabase db reset` jest tylko dla lokalnej bazy. Na preview i produkcji używaj `supabase db push`. Pełna instrukcja środowisk, sekretów, kont, crona i kopii jest w `docs/RUNBOOK.md`. Lista wydania jest w `docs/RELEASE_CHECKLIST.md`.

W `.env.local` uzupełnij co najmniej:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `APP_URL` — adres tej aplikacji, bez ukośnika na końcu, potrzebny do linku resetu hasła i adresu webhooka
- `N8N_LEADS_WEBHOOK_TOKEN` i `N8N_LEADS_WORKSPACE_ID` — odbiór leadów; kontrakt jest w `docs/API.md`

Pozostałe nazwy w `.env.example` zostają puste, dopóki operator ich nie uzupełni. Nie wklejaj sekretów do repozytorium ani do czatu.

Worker przyjmuje `POST /api/worker/tick` z nagłówkiem `Authorization: Bearer <JOB_WORKER_SECRET>`. Bez sekretu endpoint zwraca 503. Przy złym sekrecie zwraca 401. Prace ruszą dopiero, gdy `ENABLE_BACKGROUND_JOBS=true`. Wysyłka na telefon wymaga dodatkowo `ENABLE_OUTBOUND_PUSH=true`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` i `VAPID_SUBJECT`. Deployment preview odmawia tiku, webhooków i pusha, dopóki `ENABLE_PREVIEW_SIDE_EFFECTS` nie jest jawnie `true`. Tych wartości nie ma w migracji. Cron co minutę przez `pg_net` i Vault opisuje `docs/RUNBOOK.md`. Ostatni tik widać w powiadomieniach i na dashboardzie. „Wznów błędne prace” wraca do tej samej pracy i nie tworzy drugiej pozycji biznesowej.

Publiczną rejestrację wyłącz w Supabase Auth. Konta dwóch członków zakłada operator i dopisuje ich do `workspace_members`.

Lokalna baza:

```bash
supabase start
supabase db reset
supabase gen types typescript --local --schema public --schema private > src/lib/supabase/database.types.ts
```

Porty tego projektu to 54421 (API), 54422 (Postgres) i 54423 (Studio), bo domyślne porty Supabase są zajęte. Adres połączenia pokazuje `supabase status`. Nie wklejaj kluczy z tego polecenia do repozytorium ani do czatu.

Test SQL etapu 2, po resecie bazy:

```bash
psql "$DB_URL" -v ON_ERROR_STOP=1 -f tests/integration/stage2.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -f tests/integration/stage3.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -f tests/integration/stage4.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -f tests/integration/stage5.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -f tests/integration/stage6.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -f tests/integration/stage7.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -f tests/integration/stage8.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -f tests/integration/stage9.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -f tests/integration/stage10.sql
psql "$DB_URL" -v ON_ERROR_STOP=1 -f tests/integration/stage11.sql
```

`DB_URL` weź z `supabase status`. Skrypt kończy się rollbackiem. Seed zawiera fikcyjne osoby i losowe hasła, więc nie służy do logowania.

## Kontrola

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Testy logowania dwóch osób na znanym haśle, Fathom, n8n oraz Web Push na iOS i Android wymagają kont operatora albo urządzeń i nie są zaliczone.
