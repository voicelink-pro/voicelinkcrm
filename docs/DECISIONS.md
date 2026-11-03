# Decyzje techniczne

Zapisy architekta i stanu środowiska. Reguły biznesowe D1 i D2 nie są tutaj zatwierdzane.

## Środowisko zastane, 28 października 2026

- Katalog projektu zawierał wyłącznie specyfikację. Nie było `package.json`, lockfile, Supabase, konfiguracji Vercel ani repozytorium Git.
- Node lokalnie: 26.12.1. npm 11.20.0. pnpm 10.33.4. Yarn niedostępny.
- CLI Supabase: brak. CLI Vercel: zainstalowane, projekt niepodłączony.
- Docker jest dostępny. Nie uruchamiano lokalnego Supabase w Etapie 0–1.
- Brak pliku logo i tokenów marki poza kolorami ze specyfikacji. Znak w interfejsie to tekst „VoiceLink”.
- Sekrety nie są wpisane do repozytorium. Wzorzec nazw: `.env.example`.

## Wersje z lockfile

| Pakiet | Wersja |
|---|---|
| Next.js | 16.4.3 |
| React / React DOM | 19.3.0 |
| TypeScript | 5.9.3 |
| Tailwind CSS | 4.3.3 |
| `@supabase/supabase-js` | 2.118.0 |
| `@supabase/ssr` | 0.12.7 |
| Zod | 4.6.7 |
| Vitest | 5.0.5 |
| shadcn | 4.23.0 |
| `@base-ui/react` | 1.9.0 |
| lucide-react | 1.63.0 |
| sonner | 2.0.8 |

Manager pakietów: pnpm 10.33.4, bo w katalogu nie było wcześniejszego lockfile, a pnpm był dostępny.

Node w `package.json`: `>=22`. Vercel dla nowych projektów używa 24.x. Node 20 nie jest już celem wdrożenia. Lokalny Node 26 służy do developmentu.

## Uwierzytelnianie

- Klient przeglądarki i serwera: `@supabase/ssr`, klucze publikowalne `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Klient administratora: `@supabase/supabase-js` i `SUPABASE_SECRET_KEY`, wyłącznie `server-only`. Nie jest używany do odczytów użytkownika w Etapie 1.
- Odświeżanie sesji: `src/proxy.ts` i `supabase.auth.getClaims()`. `getSession()` nie jest podstawą autoryzacji.
- Next.js 16 nazywa tę warstwę `proxy`, nie `middleware`. Proxy działa na runtime Node.js.
- Publiczna rejestracja nie ma formularza. Konta zakłada operator w Supabase, z wyłączoną rejestracją publiczną.
- Nowe hasło w formularzu resetu: minimum 8 znaków. To techniczny próg formularza, nie reguła biznesowa CRM. Logowanie nie odrzuca krótszego hasła nadanego przez operatora.
- `returnTo` przyjmuje tylko ścieżkę tego samego originu. Adres zewnętrzny, `//` i ukośnik wsteczny wracają na `/`.

## Cache

`create-next-app` dla Next.js 16.4.3 włącza Cache Components i partial prefetching. Dla tego CRM zostały wyłączone.

Uzasadnienie: prawie każdy ekran jest prywatny. Cache Components prerenderuje wspólną skorupę, a specyfikacja zabrania wspólnego cache i CDN dla HTML użytkownika. Dopóki każdy odczyt nie jest jawnie oddzielony od skorupy, bezpieczniejszy jest render na żądanie. Proxy ustawia `Cache-Control: private, no-cache, no-store, must-revalidate, max-age=0` oraz `CDN-Cache-Control: no-store`.

Nie używamy `use cache` dla danych CRM. Ciasteczko sidebara przechowuje tylko stan zwinięcia menu, nie dane biznesowe ani sesję.

Układy `(auth)` i `(crm)` mają `dynamic = "force-dynamic"`. Bez tego brak zmiennych przy buildzie sprawiał, że Next prerenderował stałe przekierowanie na logowanie i nie czytał sesji po późniejszym uzupełnieniu środowiska.

## Interfejs

- shadcn/ui, styl `base-nova`, prymitywy Base UI, ikony Lucide.
- Tokeny: tło `#F6F8FB`, powierzchnia biała, akcent `#0F3784`, sidebar `#0B1D3A`, tekst `#172033`, obramowanie `#E5EAF1`, tekst pomocniczy `#3E4C63`.
- Krój: Inter, z `latin-ext`.
- Brak przełącznika motywu ciemnego. Klasa `.dark` z szablonu nie jest nakładana.
- React Hook Form wejdzie przy złożonych formularzach modułów. Logowanie i reset używają akcji serwerowych oraz Zod, bez drugiej biblioteki formularzy.

## Baza, etap 2

- CLI Supabase 2.122.0. Porty domyślne 54321–54327 były zajęte przez inny lokalny projekt, więc VoiceLink używa 54421 (API), 54422 (baza), 54423 (Studio) i 54424 (poczta lokalna).
- `auto_expose_new_tables = false`. Granty są jawne. Schemat `private` jest w API tylko po to, by rola serwerowa wołała funkcje. `anon` i `authenticated` nie mają do niego dostępu.
- Publiczna rejestracja jest wyłączona przez `[auth].enable_signup = false`. W tym CLI flaga `[auth.email].enable_signup` włącza dostawcę e-mail, więc zostaje włączona. Inaczej logowanie hasłem zwraca `email_provider_disabled`. Hasło minimalne w Auth: 8.
- Seed tworzy Annę Kowalską i Bartka Nowaka jako fikcyjne konta. Hasło jest losowe i nie nadaje się do logowania. Testy RLS ustawiają `request.jwt.claims`, bo lokalne `auth.uid()` czyta `sub` z tego ustawienia albo z `request.jwt.claim.sub`.
- Kwoty ewidencji nie zmieniają się przez `UPDATE`. Korekta to nowy wiersz. Zmiana kwoty już naliczonego cyklu to pełne wycofanie i nowy wiersz.
- Daty cykli liczy `private.subscription_cycle_date` od miesiąca startu i dnia kotwicy.

## Środowiska, etap 13

- Development to lokalny Supabase na portach 54421 i 54422. Preview i produkcja mają być osobnymi projektami Supabase. Ten podział jest zapisany w `docs/RUNBOOK.md`. Projekty hosted nie zostały jeszcze utworzone.
- `VERCEL_ENV=preview` nie wykonuje tiku, nie przyjmuje n8n ani Fathoma i nie wysyła pusha. Wyjątek wymaga `ENABLE_PREVIEW_SIDE_EFFECTS=true` i bazy nieprodukcyjnej.
- Harmonogram zostaje w Supabase Cron i `pg_net`, co minutę. Cron Vercel nie jest używany. Sekret wywołania jest w Vault pod nazwą `job_worker_secret` i w `JOB_WORKER_SECRET`. Skrypt `supabase/manual/worker-cron.sql` nie jest migracją i nie zawiera wartości sekretu.
- Node na Vercel i w CI to 24, z pliku `.node-version`. Lokalny development może zostać na nowszym Node 22+.
- CI GitHuba instaluje zależności z lockfile i uruchamia lint, typecheck, testy jednostkowe oraz build. Testy SQL wymagają zmiennej `RUN_SQL_INTEGRATION=true` i sekretu bazy testowej. Domyślnie są wyłączone, żeby przypadek nie podłączył produkcji.
- Plan Supabase z PITR nie został wybrany. Do tego czasu kopia wydania to zrzut logiczny i kopia bucketu `documents`.

## Integracje jeszcze niepodłączone

Endpoint leadów n8n jest w aplikacji. Token i workspace są w lokalnym `.env.local`, poza repozytorium. Żywy workflow n8n nie był podłączony. Brak kluczy Fathom, VAPID i urządzeń iOS/Android. Ich testy na żywo nie są zaliczone i blokują odbiór Etapów 9 i 11.
