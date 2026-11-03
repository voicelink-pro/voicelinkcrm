# VoiceLink CRM — specyfikacja i prompt wykonawczy dla Groka 4.7

Wersja: 1.0 · 28 października 2026 · język aplikacji: polski.

Dokument zawiera wymagania właściciela, rekomendowaną architekturę, model danych, projekt UX i etapy implementacji. Całość można przekazać Grokowi jako główną instrukcję projektu. To specyfikacja do zbudowania aplikacji, nie raport z wykonanej implementacji.

## 1. Instrukcja główna dla modelu

Jesteś doświadczonym deweloperem fullstack i projektantem UX. Zbuduj wewnętrzny, produkcyjny CRM VoiceLink według niniejszej specyfikacji. Pracujesz w repozytorium GitHub, używasz Next.js z Reactem i TypeScriptem, Supabase oraz Vercel. Wykonuj rzeczywiste zmiany w plikach, migracje i weryfikację, jeśli środowisko pozwala. Jeśli środowisko jest wyłącznie czatem, na początku to wyjaśnij i dostarczaj kompletne pliki z ich ścieżkami, bez sugerowania, że zostały uruchomione.

Nie zamieniaj zadania w sam projekt wizualny. Wszystkie siedem modułów ma działać z prawdziwą bazą. Nie uznawaj lokalnego stanu Reacta, localStorage, fikcyjnych statystyk ani atrap integracji za gotową funkcję. Dane demonstracyjne są dozwolone tylko w oddzielnym seedzie developerskim.

Realizuj etapy w kolejności zależności. Po każdym etapie aktualizuj `docs/IMPLEMENTATION_STATUS.md`: zakres wykonany, testy i wynik, niezamknięte problemy, następny krok. Nie pytaj o zgodę na każdą zwykłą decyzję programistyczną. Pytaj przed rozstrzygnięciem nieustalonej reguły biznesowej. Nie zmieniaj istniejących wymagań bez uzgodnienia. Nie deklaruj zaliczenia testów, których nie uruchomiono.

### 1.1. Dwie otwarte decyzje biznesowe

Użytkownik prosił, aby wątpliwości wyjaśniać zamiast zgadywać. Zadaj tylko poniższe pytania, jeśli do czasu rozpoczęcia nie otrzymasz odpowiedzi. Pozostałe prace wykonuj niezależnie.

**D1 — niepełna wypowiedź o powiadomieniach.** Potwierdzono poranne powiadomienie o zadaniach na dany dzień, codziennie o 08:00. Wypowiedź skończyła się słowem „i”. Nadal nie potwierdzono odbiorców zmian statusów, powiadomień natychmiastowych o przypisaniu zadania i przypomnień o konkretnej godzinie. Zapytaj, czy: statusy powiadamiają obu użytkowników poza autorem zmiany, przypisania i przypomnienia trafiają tylko do przypisanych osób, a digest o 08:00 zawiera również zaległe zadania. Są to propozycje, nie zatwierdzone zasady. Implementuj mechanizm i jawne ustawienia; nie uruchamiaj niepotwierdzonych reguł wysyłki produkcyjnej.

**D2 — follow-up poza opisanym przedziałem.** Potwierdzono: „Nie odebrał” natychmiast tworzy zadanie przypisane do osoby klikającej; kliknięcie w godzinach 09:00–15:00 daje termin na dziś, po 15:00 na kolejny dzień roboczy. Nie ustalono zachowania przed 09:00 ani w soboty, niedziele i święta. Zapytaj o te wyjątki. Propozycja: przed 09:00 w dzień pracy termin na dziś; w dzień wolny termin na najbliższy dzień pracy; kalendarz poniedziałek–piątek z opcjonalnymi wyjątkami. Nie traktuj propozycji jako zatwierdzonej konfiguracji.

Follow-up może mieć termin będący samą datą. Nie wymyślaj godziny oddzwonienia ani nie dodawaj 1 h czy 2 h. Brak godziny nie blokuje implementacji zadań. Przyjmij granicę 15:00 jako parametr, pokaż jej dokładne działanie w ustawieniach i testach.

### 1.2. Wymagania zatwierdzone

| Obszar | Ustalenie |
|---|---|
| Użytkownicy | Początkowo dwie osoby, jednakowy pełny dostęp do danych biznesowych całego CRM-a |
| Odbiorcy aplikacji | Wewnętrzny zespół VoiceLink; bez portalu klienta w tej wersji |
| Stack | Next.js + React + TypeScript; Supabase; Vercel; repozytorium GitHub |
| Moduły | Dashboard, Wdrożenia, Leady, Spotkania, Dokumenty, Klienci, Zadania — wszystkie w pierwszej wersji |
| Firma i historia | Jedna wspólna karta; wiele kontaktów, deali i wdrożeń; zachowanie historii po wygraniu deala |
| Produkty | Asystent VoiceLink, Strona internetowa, Infrastruktura cyfrowa |
| Wdrożenia | Termin, opis, produkt, klient, wartość, opiekun jako wpisywane imię i nazwisko; wspólne etapy, bez szablonów zależnych od produktu |
| Import leadów | n8n przekazuje nowy lead do webhooka CRM-a po pojawieniu się wpisu w Google Sheets |
| Dane leada z arkusza | E-mail, imię i nazwisko, numer telefonu; techniczne identyfikatory służą wyłącznie niezawodności importu |
| Edycja po imporcie | Wyłącznie CRM; bez dwukierunkowej synchronizacji i nadpisywania danych zmianami arkusza |
| Finanse | PLN brutto; liczą się wygrane deale, opłata wdrożeniowa jednorazowo, abonament miesięcznie od daty wybranej przez użytkownika |
| Spotkania | Wyłącznie odbyte spotkania z Fathom; transkrypcja, podsumowanie/notatki, link do nagrania; bez kopiowania plików wideo |
| Konta Fathom | Jedno aktywne początkowo, architektura umożliwia dodanie drugiego |
| Dokumenty | Wgrywanie, organizacja, opcjonalne powiązanie z leadem/klientem; podgląd obsługiwanych plików i pobieranie; bez generatora ofert i podpisu elektronicznego |
| Zadania | Wiele przypisanych osób; follow-up po „Nie odebrał” przypisany do klikającego |
| Poranny digest | Codziennie 08:00 czasu Europe/Warsaw, zadania przypisane użytkownikowi na dany dzień |
| Mobile | Responsywna instalowalna PWA na iOS i Android; systemowe Web Push oraz centrum powiadomień |
| UI | Głównie jasny, subtelny i czysty; granatowy sidebar, logo na górze, ikony; komponenty customizowane w estetyce shadcn/ui |

### 1.3. Rekomendacje techniczne i granice zakresu

Poniższe decyzje są propozycją architekta, nie dodatkowymi wypowiedziami właściciela. Wdróż je, o ile nie kolidują z zastanym repozytorium. Zapisz ostateczny wybór w `docs/DECISIONS.md`.

- Jeden workspace VoiceLink; prosty model członkostwa dla uprawnień. Bez budowania platformy SaaS, płatnych planów CRM-a ani hierarchii ról.
- Supabase Auth: konta przygotowane/zaproszone przez operatora, logowanie e-mail + hasło, reset hasła; publiczna rejestracja wyłączona. Brak samodzielnego dołączania do workspace.
- Kolor akcentu VoiceLink proponowany `#0F3784`, sidebar `#0B1D3A`. Jeśli w repozytorium jest oficjalne logo lub tokeny marki, wykorzystaj je. Bez wymyślania logo; w braku pliku estetyczny znak tekstowy „VoiceLink”.
- „Przychód” oznacza naliczone kwoty brutto z wygranych umów według harmonogramu. Nie jest potwierdzeniem przelewu, zyskiem ani integracją księgową. Etykieta w UI: „Przychód brutto z umów”, z objaśnieniem.
- Wdrożenia mają wartość informacyjną/snapshot deala. Nie są drugim źródłem przychodu.
- Ręczne tworzenie wdrożenia z wygranego deala przez przycisk i wstępnie wypełniony formularz. Wygranie deala nie tworzy bez pytania dowolnej liczby projektów.
- Samo posiadanie kontaktu nie wymaga znanej nazwy firmy; import nie ma jej w payloadzie. Nie produkuj fikcyjnych nazw placówek.
- Nie dodawaj rozbudowanego marketing automation, wysyłki SMS/e-mail do leadów, kolejnego modelu AI, VoiceLink Center, VoIP, planowania przyszłych spotkań czy pobierania danych pacjentów. To odrębne zakresy.

## 2. Architektura aplikacji

### 2.1. Warstwy

1. **Prezentacja:** Next.js App Router, Server Components do bezpiecznego początkowego odczytu, Client Components tylko dla interakcji.
2. **Mutacje:** walidowane Server Actions dla formularzy i Route Handlers dla webhooków, plików, push i zadań serwerowych.
3. **Logika domenowa:** niezależne moduły usług: leads, deals, billing, deployments, tasks, meetings, documents, notifications. Reguły finansowe i kalendarzowe nie mogą być rozproszone po komponentach.
4. **Dane:** Supabase Postgres, migracje SQL, typy generowane z bazy, RLS, prywatny Storage, Supabase Realtime dla odświeżania.
5. **Prace w tle:** trwałe zdarzenia i kolejka w Postgres; Supabase Cron wywołuje zabezpieczony worker Node.js na Vercel. Bez zależności od otwartej aplikacji.
6. **Integracje:** webhook n8n; adapter Fathom dla osobnych kont; Web Push z VAPID.

Nie dodawaj osobnego serwera Express ani mikroserwisów. Nie dodawaj ORM-u tylko jako dodatkowej warstwy nad Supabase. Transakcyjne operacje wielotabelowe realizuj w SQL RPC albo rzeczywistej transakcji serwerowej — kilka kolejnych wywołań REST nie stanowi transakcji.

### 2.2. Biblioteki i wersje

Zweryfikuj stabilne, kompatybilne wersje przed instalacją i zapisz lockfile. Nie wpisuj arbitralnie numerów wersji z pamięci. Wykorzystaj:

- Next.js, React, TypeScript w trybie strict; wspierany przez Vercel i Supabase runtime Node.js, co najmniej 22 według stanu dokumentacji z dnia opracowania;
- Tailwind CSS i edytowalne komponenty shadcn/ui, Lucide do spójnych ikon;
- Zod do walidacji granic systemu; React Hook Form do złożonych formularzy;
- tabelę z sortowaniem i filtrami, np. TanStack Table; wykresy np. Recharts — potwierdź kompatybilność i aktualną dokumentację;
- `@supabase/supabase-js` i aktualne zalecane rozwiązanie SSR Supabase dla Next.js; zweryfikuj przed implementacją, nie używaj przestarzałych auth helpers;
- `web-push` po stronie Node.js; nie uruchamiaj biblioteki wymagającej Node crypto w Edge Runtime;
- Vitest do reguł domenowych i Playwright do krytycznych ścieżek.

Jeśli istniejący projekt ma już sensowne odpowiedniki bibliotek, wykorzystaj je. Nie instaluj dwóch systemów formularzy ani kilku bibliotek dat bez potrzeby. Operacje strefowe muszą być sprawdzone dla Europe/Warsaw.

### 2.3. Zalecana struktura repozytorium

```text
src/
  app/
    (auth)/login/ reset-password/ auth/callback/
    (crm)/layout.tsx page.tsx
    (crm)/deployments/ leads/ meetings/ documents/ clients/ tasks/
    (crm)/notifications/ settings/
    api/integrations/n8n/leads/route.ts
    api/integrations/fathom/[connectionId]/webhook/route.ts
    api/integrations/fathom/[connectionId]/sync/route.ts
    api/push/subscriptions/route.ts
    api/push/test/route.ts
    api/documents/upload-intent/route.ts
    api/documents/[id]/complete/route.ts
    api/documents/[id]/download/route.ts
    api/jobs/tick/route.ts
    manifest.ts
  components/ui/ shell/ shared/
  features/dashboard/ leads/ clients/ deals/ deployments/
  features/meetings/ documents/ tasks/ notifications/ settings/
  lib/supabase/browser.ts server.ts admin.ts
  lib/auth/ validation/ dates/ money/ observability/
  server/services/ repositories/ integrations/ jobs/
  proxy.ts  # albo middleware.ts, zgodnie z wybraną wersją Next.js
public/
  sw.js icons/ offline.html
supabase/
  migrations/ seed.sql
tests/
  unit/ integration/ e2e/
docs/
  REQUIREMENTS.md DECISIONS.md DATA_MODEL.md API.md
  IMPLEMENTATION_STATUS.md RUNBOOK.md RELEASE_CHECKLIST.md
```

Nazwy folderów w schemacie są skrótem — utwórz normalne foldery i konkretne pliki. Dla szczegółów encji stosuj trasy `[id]` i oddzielne strony. Utrzymuj logikę poza plikami stron. Serwerowe sekrety oznacz `server-only`.

### 2.4. Czas, pieniądze i poprawność zapisu

- Strefa biznesowa `Europe/Warsaw`, niezależna od UTC serwera i ustawień Vercel.
- Chwile zdarzeń: `timestamptz`; daty rozliczeń i zadania bez godziny: `date`.
- „Dzisiaj” i granice miesiąca zawsze obliczaj w strefie biznesowej. Filtry przedziałów czasu stosują zakres półotwarty `[od, do)`.
- Kwoty przechowuj w groszach jako integer/bigint, nie float. JSON i TypeScript mają zachować precyzję; jeśli bigint przekracza bezpieczny zakres JS, transportuj go jako string i waliduj limity.
- Format UI: `pl-PL`, PLN, np. `3 000,00 zł brutto`.
- Każda mutacja ma walidację serwerową. Założenia i checki finansowe również w DB.
- `version` lub równoważny mechanizm optimistic concurrency dla edytowanych rekordów. Konflikt dwóch edycji ma pokazać komunikat, nie nadpisać po cichu danych drugiej osoby.
- Wielokrotne kliknięcia, retry i równoległe workery nie mogą tworzyć wielokrotnych skutków biznesowych.

## 3. Model danych i relacje

### 3.1. Zasady wspólne

Encje biznesowe mają UUID `id`, `workspace_id`, `created_at`, `updated_at`, `created_by`, `updated_by`, `version`. Dodaj `archived_at` tam, gdzie archiwizacja ma sens. Systemowe zdarzenie może mieć pustego autora użytkownika oraz jawny `actor_type = system|user|integration`.

Nie stosuj usuwania kaskadowego, które skasuje historię finansową czy dokumenty po usunięciu kontaktu. Dla podstawowych rekordów używaj archiwizacji. Prawdziwe usuwanie pliku jest osobną świadomą operacją.

Wszystkie powiązane encje muszą należeć do tego samego workspace. Wymuś to złożonymi FK `(workspace_id, id)` i checkami/triggerami, nie tylko w formularzu. Indeksuj klucze obce po stronie referencji. Dane użytkownika nie mogą sterować autoryzacją przez edytowalne `user_metadata`.

### 3.2. Tabele biznesowe

| Tabela | Najważniejsze pola i funkcja |
|---|---|
| `workspaces` | `name`, `timezone`; jeden rekord VoiceLink |
| `workspace_members` | `workspace_id`, `user_id → auth.users`, `active`; unikalność pary; członkostwo nadaje operator, nie klient |
| `profiles` | `user_id`, `workspace_id`, `full_name`, opcjonalny avatar; użytkownicy widzą osoby z workspace |
| `accounts` | wspólna karta relacji: `display_name`, `kind = unknown|company|person`, `company_name?`, `website?`, `nip?`, `address?`, `relationship = prospect|client`, `service_status = active|inactive`, `latest_note?` |
| `contacts` | `account_id`, `full_name`, `email?`, `email_normalized?`, `phone_raw?`, `phone_e164?`, `job_title?`, `is_primary`; jeden lub wiele kontaktów |
| `deals` | `account_id`, `primary_contact_id?`, `title`, `product_type?`, `stage`, `owner_user_id?`, `description?`, `setup_amount_gross_cents?`, `monthly_amount_gross_cents?`, `currency = PLN`, `expected_close_on?`, `won_at?`, `lost_at?`, `lost_reason?`, `source` |
| `deal_stage_history` | `deal_id`, `from_stage?`, `to_stage`, `changed_at`, `actor_user_id?`; historia wyłącznie dopisywana |
| `deployments` | `account_id`, `deal_id?`, `name`, `product_type`, `status`, `description`, `owner_display_name`, `start_on?`, `due_on?`, `completed_at?`, `value_gross_cents?` |
| `deployment_checklist_items` | `deployment_id`, `title`, `sort_order`, `is_done`; pozycje ręczne, bez szablonów produktowych |
| `tasks` | `title`, `description?`, `kind = task|follow_up`, `status = todo|in_progress|done|cancelled`, `priority = low|normal|high`, `due_on?`, `due_at?`, `completed_at?`, `account_id?`, `deal_id?`, `deployment_id?`, `origin_activity_id?` |
| `task_assignees` | `task_id`, `user_id`, unikalność pary; wspólne zadanie, nie osobna kopia dla każdego |
| `activities` | `account_id?`, `deal_id?`, `deployment_id?`, `meeting_id?`, `type`, `occurred_at`, `actor`, bezpieczny opis/payload; oś czasu rozmów i działań, nie kopia całej transkrypcji |
| `notes` | `account_id`, opcjonalne `deal_id`, `deployment_id`, `meeting_id`, `body`, autor; zwykłe notatki biznesowe |
| `meeting_records` | kanoniczne spotkanie/nagranie: `provider`, `recording_id`, `title`, `started_at?`, `ended_at?`, `duration_seconds?`, `recorded_by_email?`, `recording_url?`, `share_url?`, `summary_markdown?`, `sync_status`, `content_updated_at?` |
| `meeting_sources` | `meeting_id`, `connection_id`, `provider_recording_id`; dostęp z konkretnego konta, unikalna para connection + id |
| `meeting_participants` | `meeting_id`, imię/nazwisko, e-mail, `contact_id?`; nie dopasowuj po samej nazwie |
| `meeting_links` | `meeting_id`, `account_id`, opcjonalnie `deal_id`; jedno spotkanie może dotyczyć więcej niż jednej relacji |
| `meeting_transcript_segments` | `meeting_id`, `ordinal`, `speaker_name?`, `speaker_email?`, `offset_ms?`, `text`; unikalne meeting + ordinal; nie pobieraj segmentów w listingu spotkań |
| `documents` | `original_name`, `storage_path`, `mime_type`, `size_bytes`, `category = offer|contract|other`, `status = uploading|ready|failed|deleting`, `uploaded_by`, `deleted_at?` |
| `document_links` | `document_id`, opcjonalne `account_id`, `deal_id`, `deployment_id`; dokładnie jeden cel w danym wierszu; brak wierszy = dokument ogólny |

„Lead” w UI jest otwartą szansą sprzedażową (`deals`) z powiązaną kartą (`accounts`) i kontaktem (`contacts`). Nie twórz osobnej kopii tabeli klientów przy wygraniu. Firma z wygranym dealem może jednocześnie mieć kolejny otwarty lead. Klient nie wraca do prospect tylko dlatego, że przegrano drugi temat.

### 3.3. Tabele finansowe

| Tabela | Najważniejsze pola i ograniczenia |
|---|---|
| `billing_agreements` | `deal_id`, `account_id`, `kind = setup|subscription`, `amount_gross_cents`, `currency`, `starts_on`, `anchor_day?`, `ends_on_exclusive?`, `status = scheduled|active|ended|void`, `agreement_version`; setup i subscription oddzielnie |
| `revenue_entries` | `agreement_id`, `deal_id`, `account_id`, `entry_type = setup|subscription|correction`, `effective_on`, `cycle_index?`, `amount_signed_cents`, `reverses_entry_id?`, `created_at`, `reason?`, `dedupe_key` |

Ograniczenia: unikalny klucz naliczenia; jeden zwykły wpis na opłatę setup i jeden na cykl abonamentu; każda korekta wskazuje konkretny wpis; jedna pełna korekta danego wpisu; zwykłe naliczenia nieujemne. Przy częściowej zmianie kwoty zapisz wycofanie starego wpisu i nowy wpis zamiast zmieniać historię w miejscu. Brak `UPDATE` kwot już zaksięgowanych w ewidencji CRM-a.

Kwoty w dealu są ofertą/przygotowaniem. Po wygraniu zatwierdzony harmonogram w `billing_agreements` jest źródłem naliczeń. Wygenerowane `revenue_entries` są źródłem sum dashboardu. Nie sumuj tych trzech warstw razem.

### 3.4. Tabele systemowe

| Tabela | Funkcja |
|---|---|
| `integration_connections` | provider, label, enabled, stan, ostatnia synchronizacja, referencja do sekretu; początkowo jeden Fathom, bez jawnych kluczy w odczycie klienta |
| `inbound_events` | provider, connection?, event id, source record id, hash payloadu, status, wynik, błąd; unikalność eventu i osobna ochrona rekordu źródłowego |
| `external_lead_refs` | source + source record id → account/contact/deal; trwały identyfikator importu niezależny od numeru wiersza |
| `import_review_items` | odrzucone jakościowo/niejednoznaczne wpisy, powód, minimalny payload, wynik ręcznego rozwiązania |
| `domain_events` | typ zdarzenia, encja, autor, occurred_at, payload i dedupe key; zapis w tej samej transakcji co mutacja biznesowa |
| `job_queue` | typ pracy, payload, status, run_after, attempts, locked_until, last_error, dedupe key |
| `notifications` | recipient_user_id, typ, tytuł, tekst, bezpieczny target_path, read_at, event key |
| `push_subscriptions` | user_id, endpoint, p256dh, auth, device label, installation id, active; unikalny endpoint; dane urządzenia tylko dla właściciela i workera |
| `push_deliveries` | notification_id, subscription_id, status, attempts, next_attempt_at, last_http_status; unikalna para notification + subscription |
| `notification_preferences` | user_id, potwierdzone kanały i typy; digest 08:00, timezone; odrębne od zgody systemowej urządzenia |
| `automation_settings` | potwierdzona polityka follow-upu, dni pracy i wyjątki; nieustalone pola mogą być null i wymagają konfiguracji |
| `job_runs` | nazwa pracy, start/end, status, liczby przetworzonych rekordów, błąd, correlation id |

Przechowuj treści integracji tylko tak długo i w takim zakresie, jak wymagają retry i diagnoza; nie duplikuj pełnych transkrypcji w logach. Zastosuj ograniczoną retencję technicznych payloadów, konfigurowaną i opisaną w runbooku.

### 3.5. Indeksy i ograniczenia

Minimum: `workspace_members(user_id, active)`, `deals(workspace_id, stage, created_at desc, id)`, `deals(account_id)`, `contacts(account_id)`, indeksy znormalizowanego e-maila i telefonu w workspace, `deployments(workspace_id, status, due_on)`, `tasks(workspace_id, status, due_on)`, `task_assignees(user_id, task_id)`, `activities(account_id, occurred_at desc)`, `meeting_records(workspace_id, started_at desc)`, `revenue_entries(workspace_id, effective_on)`, `notifications(recipient_user_id, created_at desc)`, częściowe indeksy na prace oczekujące i nieprzeczytane powiadomienia.

Unikalne indeksy, a nie sam kod `if`, zabezpieczają deduplikację. Dodaj wszystkie pozostałe FK i indeksy wynikające z rzeczywistych zapytań. Zamiast pobierać wszystko do przeglądarki zastosuj paginację i agregację w DB. Uzasadnij dodatkowe indeksy przez zapytania i EXPLAIN na reprezentatywnym seedzie.

## 4. UI i UX — wymagania wykonawcze

### 4.1. System wizualny

Docelowo ma to wyglądać jak starannie zaprojektowane narzędzie do codziennej pracy, nie panel demonstracyjny z przypadkowymi kartami. Zbuduj tokeny i wspólne komponenty przed składaniem ekranów.

| Element | Rekomendowany kierunek |
|---|---|
| Tło aplikacji | `#F6F8FB`, powierzchnie białe |
| Sidebar | `#0B1D3A`, logo VoiceLink na górze, stopka z profilem i ustawieniami |
| Akcent | `#0F3784`; jeden główny kolor akcji |
| Tekst | główny `#172033`, pomocniczy o odpowiednim kontraście |
| Obramowanie | `#E5EAF1`, subtelne; cienie oszczędne |
| Typografia | czytelny krój sans, np. Inter lub zastany font; tekst roboczy 14–16 px |
| Skala odstępów | wielokrotności 4 px; standardowo 8/12/16/24/32 |
| Zaokrąglenia | ok. 10–14 px dla kart, mniejsze dla pól i przycisków |
| Ikony | Lucide, spójny rozmiar i grubość linii; etykiety tekstowe w nawigacji |
| Stany | neutralny, niebieski, zielony, bursztynowy, czerwony; status zawsze także tekstem |

Nie stosuj dużych gradientów, dekoracyjnych ilustracji, nadmiaru cieni, gigantycznych pustych kafli ani animacji utrudniających pracę. Dostosuj shadcn/ui do tokenów VoiceLink zamiast pozostawić domyślny szablon. Nie dodawaj przełącznika motywu ciemnego w pierwszej wersji.

### 4.2. Powłoka desktopowa

- Sidebar ok. 240 px, możliwość zwinięcia na mniejszych ekranach; aktywna pozycja wyraźna, ale subtelna.
- Kolejność: Dashboard, Wdrożenia, Leady, Spotkania, Dokumenty, Klienci, Zadania. Ustawienia przy profilu. Dzwonek w górnym pasku.
- Header: breadcrumb/nazwa ekranu, wyszukiwanie globalne, „Dodaj” z krótką listą akcji, centrum powiadomień, avatar.
- Ekran listy: tytuł i liczba rekordów, jedna główna akcja, widoki/filtry, tabela. Bez kilku konkurujących przycisków głównych.
- Globalne wyszukiwanie grupuje firmy/kontakty, deale, wdrożenia, zadania i dokumenty; wyszukuje metadane, bez obowiązkowego pełnotekstowego przeszukiwania wszystkich transkrypcji.
- Filtry, sortowanie, strona i widok zapisane w URL. Powrót ze szczegółów przywraca listę w tym samym stanie.
- Kluczowe akcje dostępne klawiaturą; Ctrl/Cmd+K opcjonalnie otwiera wyszukiwanie; nie przechwytuj skrótów podczas wpisywania tekstu.

### 4.3. Mobile i PWA

- Dla wąskich ekranów sidebar jako wysuwane menu. Dolna nawigacja maks. 4–5 pozycji: Start, Leady, Zadania, Więcej; pozostałe moduły dostępne w „Więcej”.
- Na telefonie lista leadów/zadań jako kompaktowe karty z najważniejszymi danymi i akcjami. Tabela nie może wymuszać szerokiego przewijania całej strony.
- Kontakt z karty leada: `tel:` i `mailto:`; kliknięcie telefonu otwiera systemowe dzwonienie. CRM zapisuje wynik ręcznie, nie udaje integracji telefonicznej.
- Duże cele dotykowe minimum 44×44 px, wsparcie safe-area, pola formularzy bez przypadkowego zoomowania iOS, poprawna obsługa klawiatury ekranowej.
- Długi formularz na telefonie zajmuje pełny ekran z czytelnym przyciskiem zapisu. Zapis sygnalizuje stan oczekiwania; utrata połączenia nie może wyglądać jak sukces.
- Menu działa w standalone; uwzględnij cofanie, otwarcie konkretnego rekordu z push i przekierowanie do logowania z bezpiecznym `returnTo`.

### 4.4. Zachowania wspólne

- Dla każdej listy: skeleton ładowania, sensowny empty state, błąd z ponowieniem, brak wyników filtrowania, paginacja.
- Formularze: etykiety, wyraźne pola obowiązkowe, błędy przy polu; nie kasuj wpisanych danych po błędzie serwera.
- Sukces: krótki toast i aktualizacja właściwych danych. Błąd: konkretny komunikat po polsku bez tokenów, SQL i stack trace.
- Edycja drobnych danych w drawerze lub dialogu; pełna karta firmy/deala/wdrożenia w osobnym adresie URL.
- Utrata niezapisanych zmian wymaga ostrzeżenia. Akcje destrukcyjne mają potwierdzenie i opis skutku. Archiwizacja preferowana.
- Długi tekst i brak danych nie psują układu. Brak wartości to „Nie uzupełniono”, a nie „0 zł” czy fikcyjny kontakt.
- Accessibility: semantyczne elementy, widoczny focus, kontrast AA, etykiety ikon, poprawny focus trap i powrót fokusu z dialogu, `prefers-reduced-motion`.

## 5. Moduły i dokładne przepływy

### 5.1. Leady i deale

Domyślny widok to tabela, najnowsze leady na górze. Opcjonalny przełącznik na Kanban nad tą samą bazą rekordów. Tabela: kontakt, firma jeśli znana, produkt jeśli znany, etap, opiekun, ostatni kontakt, następny follow-up, opłata jednorazowa, abonament, data dodania. Na telefonie pokaż kontakt, etap, follow-up i szybkie akcje.

Etapy, z kodami niezależnymi od polskich etykiet:

| Kod | Etykieta |
|---|---|
| `new` | Nowy |
| `contact_attempt` | Próba kontaktu |
| `conversation_done` | Rozmowa odbyta |
| `meeting_scheduled` | Spotkanie umówione |
| `meeting_done` | Spotkanie odbyte |
| `offer_sent` | Oferta wysłana |
| `negotiation` | Negocjacje |
| `won` | Wygrany |
| `lost` | Przegrany |

Etap „Wrócić później” nie został jednoznacznie zamówiony — odroczenie realizuj datą follow-upu i zadaniem. Nie dopisuj go do lejka bez uzgodnienia.

Akcje: dodaj ręcznie, edytuj, przypisz opiekuna, zmień etap, zapisz wynik kontaktu, dodaj notatkę/zadanie/dokument, otwórz kartę firmy, archiwizuj. Wygranie deala uruchamia opisany niżej formularz finalizacji. Przegranie pozwala podać powód. Obie akcje zapisują historię, autora i czas.

„Nie odebrał” jest wynikiem konkretnej próby kontaktu, a nie osobnym etapem całego lejka. Zapisuje aktywność i tworzy follow-up atomowo. Przy pierwszym kontakcie może przesunąć etap `new → contact_attempt`; nie cofa oferty czy negocjacji do początku. Zdarzenie nie zmienia firmy w nowego klienta i nie nalicza przychodu.

Karta deala: dane i etap u góry, kontakt i szybkie akcje, wartość i produkt, następne zadanie, zakładki „Historia”, „Zadania”, „Spotkania”, „Dokumenty”, „Wdrożenia”. Z osi czasu da się przejść do źródłowego obiektu. Zmiana etapu nie wymaga istnienia transkrypcji w Fathom. Import spotkania nie zmienia etapu automatycznie: jedno spotkanie może dotyczyć kilku tematów.

### 5.2. Wspólna karta firmy i Klienci

Firma/konto gromadzi wszystkie kontakty i tematy. Przy imporcie z samym imieniem i nazwiskiem `kind=unknown`, `display_name=full_name`; pole firmy pozostaje puste. Później użytkownik uzupełnia nazwę albo łączy rekord z istniejącą kartą. Zachowaj oryginalne referencje importu.

Po pierwszym wygranym dealu oznacz kartę jako klienta. To widok istniejącej relacji, bez kopiowania danych. Klienci: aktywni i nieaktywni, z filtrem; można ręcznie oznaczyć nieaktywność. Abonament aktywny oznacza harmonogram obowiązujący na dzisiaj, nie zweryfikowaną wpłatę bankową.

Tabela klientów: nazwa, główny kontakt, aktywne produkty, aktywne abonamenty, liczba otwartych wdrożeń, ostatnia aktywność, opiekun deala jeśli przypisany. Karta: podsumowanie, kontakty, deale, wdrożenia, zadania, spotkania, dokumenty, notatki i historia naliczeń.

Przy łączeniu duplikatów pokaż rekord źródłowy i docelowy, konflikty pól i zakres przenoszonych relacji. Scalanie jest transakcyjne; nie sumuje dwa razy tego samego naliczenia ani nie gubi referencji webhooka. Sam identyczny e-mail domenowy nie jest podstawą scalenia firmy.

### 5.3. Wdrożenia

Wspólny workflow dla wszystkich produktów:

`todo` Do rozpoczęcia → `in_progress` W realizacji → `waiting_for_client` Oczekuje na klienta → `testing` Testy → `launched` Uruchomione → `completed` Zakończone.

Dodatkowo `paused` Wstrzymane i `cancelled` Anulowane. Dopuszczaj świadomą zmianę etapu w obie strony, zapisując historię. Zakończenie ustawia `completed_at`; ponowne otwarcie czyści bieżący stan zakończenia i zostawia zapis historii.

Formularz: nazwa, klient/konto, opcjonalny deal tej samej firmy, produkt, opis, termin, opcjonalna data rozpoczęcia, imię i nazwisko opiekuna jako tekst, wartość brutto. Pole opiekuna nie jest wyborem użytkownika i nie może otrzymywać powiadomień tylko na podstawie wpisanego nazwiska. Osoby do zadań wybierane są osobno z użytkowników.

Lista: domyślnie wszystkie otwarte wdrożenia; przełącznik „Wszystkie”, filtry status/produkt/opiekun/termin, sortowanie. Wyróżnij opóźnienie i „Oczekuje na klienta”, bez krzykliwych kolorów całego wiersza. Panel szczegółów: etap, termin, opis, ręczna checklista, zadania, dokumenty i historia. Bez innych szablonów dla różnych produktów.

Wartość skopiowana z deala ma etykietę i jest informacyjna. Utworzenie trzech wdrożeń do jednego deala nie nalicza trzech opłat. Samodzielne wdrożenie bez deala nie zasila statystyk przychodu; pokaż to w formularzu wartości.

### 5.4. Zadania, follow-up i poranek

Widoki: „Moje”, „Wszystkie”, „Dzisiaj”, „Zaległe”, „Nadchodzące”, „Ukończone”. Zadania mogą mieć wiele przypisanych osób. Ukończenie wspólnego zadania oznacza ukończenie dla wszystkich, z autorem wykonania. Nie mnoż kopii zadania na liczbę osób.

Formularz: tytuł, opis, przypisani użytkownicy, termin jako data, opcjonalna godzina, priorytet, status i opcjonalne powiązanie z kartą/dealem/wdrożeniem. Samodzielne zadanie bez klienta również jest dozwolone. Gdy `due_at` jest ustawione, jego dzień w Europe/Warsaw musi odpowiadać `due_on`.

Algorytm „Nie odebrał”:

1. Backend ustala autora na podstawie zweryfikowanej sesji i pobiera czas serwera.
2. Konwertuje go do Europe/Warsaw; oblicza datę według zatwierdzonej polityki D2.
3. W transakcji dopisuje aktywność `call_no_answer`, tworzy task `follow_up` i przypisuje wyłącznie klikającego.
4. Zapisuje `origin_activity_id` i unikalny klucz akcji. Ponowienie tego samego requestu nie tworzy drugiej aktywności ani zadania. Osobna późniejsza próba kontaktu z nowym identyfikatorem jest osobnym zdarzeniem.
5. Zwraca faktyczny termin. Toast: „Zapisano próbę kontaktu. Follow-up: [data]”, z akcją otwarcia zadania i zmiany terminu.

Jeśli polityka dla danego przypadku nie jest jeszcze skonfigurowana, nie gub próby kontaktu. Pozwól użytkownikowi jawnie wybrać datę w krótkim formularzu przed zatwierdzeniem całej akcji. Nie stosuj ukrytego fallbacku.

Digest o 08:00 każdego dnia kalendarzowego, w tym weekendu, zbiera zadania przypisane konkretnej osobie z `due_on = dzisiaj` i statusem `todo|in_progress`. Bez zadań brak pustego push. Tworzy jedno podsumowanie w aplikacji i wysyła je na aktywne urządzenia osoby ze zgodą. Przykład: „Masz 4 zadania na dziś” → `/tasks?view=today&assignee=me`.

Zaległe zadania i powiadomienia natychmiastowe są dodatkową polityką D1. Nie uznawaj porannego digestu za przypomnienie zadanio-specyficzne o 08:00 dla każdego rekordu. Jedno wspólne zadanie liczy się raz w podsumowaniu każdego z przypisanych użytkowników.

### 5.5. Spotkania

To archiwum odbytych spotkań, nie kalendarz planowania. Domyślnie najnowsze na górze; tytuł, data, czas trwania jeśli dostępny, prowadzący/konto Fathom, powiązana firma/deal, stan synchronizacji.

Karta spotkania: podsumowanie, transkrypcja z oznaczeniem mówców i wyszukiwaniem, uczestnicy, własne notatki CRM, powiązania, przycisk „Otwórz nagranie w Fathom”. Nie osadzaj odtwarzacza, który wymaga nieudokumentowanego obejścia autoryzacji. Link nie oznacza, że nagranie stanie się publiczne.

Treści Fathom i własne notatki są oddzielne. Ponowna synchronizacja może aktualizować treść dostawcy, ale nie nadpisuje notatek ani ręcznych powiązań użytkownika. Brak transkrypcji nie może blokować wyświetlenia metadanych. Pokaż osobne stany: oczekuje na treść, zsynchronizowane, częściowe, błąd.

Dopasowanie do kontaktów po dokładnym znormalizowanym e-mailu. Jeden jednoznaczny kontakt/klient daje możliwość bezpiecznego powiązania. Kilku pasujących klientów lub kilka otwartych deali → „Do przypisania”, bez zgadywania. Dopasowanie firmy nie wymusza przypisania konkretnego deala. Możliwość ręcznego dodania/usunięcia powiązań.

Pobrane action items mogą być pokazane jako sugestie. Utworzenie zadania z action item wymaga świadomego kliknięcia i wybrania przypisania/terminu; nie generuj samodzielnie zadań, których użytkownik nie zamówił.

### 5.6. Dokumenty

Moduł obejmuje upload, kategorie, wyszukiwanie, podgląd bezpiecznie obsługiwanych typów, pobieranie i opcjonalne powiązanie. Lista: nazwa, typ/kategoria, wielkość, data, autor, powiązanie. Dokument ogólny może pozostać bez klienta.

Upload wieloplikowy z postępem, anulowaniem i retry per plik. Kategorie minimum Oferta, Umowa, Inne. Parametry limitu wielkości i listy MIME konfigurowalne, wyświetlane przed uploadem; techniczny punkt startowy 25 MB na plik, PDF, DOCX, XLSX, TXT, PNG, JPEG, do zweryfikowania z konfiguracją Storage. Nie obiecuj podglądu DOCX/XLSX bez zbudowania odpowiedniego rozwiązania — dla nich pobieranie, dla PDF/obrazów bezpieczny podgląd.

Plik trafia do prywatnego bucketu. Oryginalna nazwa w metadanych, ścieżka obiektu generowana losowo: workspace/UUID/plik. Nie traktuj rozszerzenia za dowód typu. Zabroń plików wykonywalnych i aktywnego HTML/SVG w podglądzie aplikacji.

Flow: utwórz rekord uploading → uzyskaj autoryzowany upload intent → wyślij bezpośrednio do Storage → serwer potwierdza istnienie, rozmiar i metadane obiektu → status ready. Nie kieruj całego pliku przez funkcję Vercel bez potrzeby. Prace porządkowe usuwają osierocone, nieukończone uploady według runbooka. Usuwanie ma stan deleting i ponowienie, aby awaria Storage nie zostawiła fałszywego sukcesu.

## 6. Finanse — jednoznaczna logika naliczeń

### 6.1. Finalizacja wygranego deala

Przycisk „Oznacz jako wygrany” otwiera formularz z podsumowaniem:

- produkt i firma/kontakt;
- opłata jednorazowa brutto, także 0 jeśli jej nie ma;
- miesięczny abonament brutto, także 0 jeśli go nie ma;
- data naliczenia jednorazowego — widoczna, edytowalna; techniczna propozycja w formularzu: dzień wygrania;
- data rozpoczęcia abonamentu, obowiązkowa, gdy kwota miesięczna > 0; wybrana przez użytkownika, nigdy wyliczana z terminu wdrożenia;
- opcjonalna data zakończenia abonamentu z jednoznacznym objaśnieniem granicy;
- podgląd pierwszych kilku naliczeń, w tym ewentualnych zaległych przy dacie w przeszłości.

Zapis atomowo ustawia `won`, zachowuje `won_at`, oznacza relację jako klienta, tworzy zatwierdzone agreementy i należne już wpisy, dopisuje historię. Ponowienie nie tworzy duplikatów. Brak kwot w nowym leadzie nie jest równoważny 0; uzupełnij je w finalizacji. Brak przyszłych naliczeń w faktycznym przychodzie.

### 6.2. Harmonogram miesięczny

Pierwszy termin to `starts_on`, kolejny co miesiąc w miesięcznicę. W danym cyklu nalicza się pełna miesięczna kwota. Nie dziel na miesiące kalendarzowe i nie stosuj ukrytej proporcji. Zakończenie można ustawić na datę; nie naliczaj cykli o terminie `>= ends_on_exclusive`. Formularz wyraźnie mówi „Od tego dnia nie naliczaj kolejnych opłat”. Bez automatycznego zwrotu części wcześniej naliczonego cyklu.

Techniczna reguła krótszego miesiąca: pamiętaj oryginalny anchor day; termin to `min(anchor_day, ostatni_dzień_miesiąca)`. Licz każdy cykl od pierwszej daty, nie od poprzedniej przyciętej daty. Pokaż tę regułę w podglądzie harmonogramu, aby użytkownik widział daty przed zapisem.

Przykłady dla testów, kwoty fikcyjne:

| Początek | Cykl 0 | Cykl 1 | Cykl 2 |
|---|---|---|---|
| 12.11.2026 | 12.11.2026 | 12.12.2026 | 12.01.2027 |
| 31.01.2027 | 31.01.2027 | 28.02.2027 | 31.03.2027 |
| 31.01.2028 | 31.01.2028 | 29.02.2028 | 31.03.2028 |

Nie ustalono abonamentu zmiennego zależnego od minut — ta wersja obsługuje kwotę miesięczną wpisaną w dealu. Nie pobieraj stawek z marketingowej strony VoiceLink ani nie zakładaj cennika. Zmiana kwoty na przyszłość tworzy nową wersję warunków od wskazanego cyklu i nie przelicza po cichu zamkniętych miesięcy. Utrzymuj ciągłość anchor day i brak nakładających się okresów.

### 6.3. Generowanie, korekty i wyliczenia

- Generuj tylko należne terminy, których `effective_on <= dzisiaj`, dla zatwierdzonych warunków wygranego deala. Wpis dla przyszłej daty nie może wejść do zrealizowanej sumy.
- Worker nadrabia wszystkie brakujące cykle po przerwie; przetwarza porcjami, z zapisem postępu. Opóźniona praca ma zachować oryginalną datę naliczenia, a nie datę uruchomienia workera.
- Unikalny klucz normalnego cyklu: agreement + cycle index. Przetwarzanie musi być odporne na równoległość, nie tylko na uruchamianie sekwencyjne.
- Zakończenie abonamentu blokuje przyszłe terminy, zachowuje prawidłowo naliczoną historię. Nie kasuje przychodu z poprzednich miesięcy.
- Zmiana zatwierdzonej kwoty/terminu z przeszłości wymaga ekranu korekty z podglądem wpływu i powodem. Nie rób zwykłego UPDATE historii.
- Jeśli wygrany deal ma wrócić do otwartego/przegranego, uruchom osobny proces cofnięcia finalizacji: podgląd, wyłączenie przyszłych naliczeń, odwrócenie już naliczonych wpisów i dopiero zmiana etapu w jednej transakcji. Nie zostaw aktywnego abonamentu otwartego deala.
- Korekty odwracają właściwe wpisy, z `effective_on` oryginału, aby poprawione sumy historycznych okresów były czytelne; UI pokazuje historię korekt i datę ich wykonania.
- Archiwizacja prawidłowo wygranego deala nie usuwa przychodu. Cofnięcie finalizacji jest oddzielną, świadomą operacją.

Przychód okresu = suma `amount_signed_cents` w ewidencji o `effective_on` w okresie, z rozbiciem setup/subscription i korekt przypisanych do ich pierwotnego typu. Nie dodawaj całej przyszłej wartości abonamentu, wartości wdrożeń ani wartości otwartych deali.

Przykład: deal wygrany 10.11, setup 3000 zł z datą 10.11, abonament 1000 zł od 20.11. Dnia 19.11 suma wynosi 3000 zł; 20.11 wynosi 4000 zł. W grudniu wpada 1000 zł dnia 20.12. Przeniesienie terminu wdrożenia nie zmienia tych naliczeń.

## 7. Integracja n8n → CRM

### 7.1. Zakres

Nie buduj bezpośredniego połączenia CRM-a z Google Sheets, pollowania arkusza ani Google OAuth. Użytkownik sam przygotuje workflow n8n. Dostarcz mu działający, udokumentowany webhook, przykład payloadu i instrukcję retry. Arkusz pozostaje źródłem pierwszego zgłoszenia; po imporcie CRM jest źródłem bieżących danych kontaktowych i etapu sprzedaży.

Na dostarczonym zrzucie faktyczne dane są w N (e-mail), O (imię i nazwisko), Q (telefon), mimo niepasujących nagłówków. To obserwacja konkretnego zrzutu, nie gwarancja przyszłego układu. W n8n należy jawnie zmapować dane i przetestować podgląd fikcyjnego wpisu. Ignoruj arkuszowe lead_status/QUALIFIED/UNQUALIFIED oraz inne odpowiedzi formularza. Nie mapuj ich do etapów CRM-a.

### 7.2. Kontrakt endpointu

`POST /api/integrations/n8n/leads`

Nagłówki:

```http
Content-Type: application/json
Authorization: Bearer <N8N_LEADS_WEBHOOK_TOKEN>
Idempotency-Key: <event_id>
```

Payload v1, wyłącznie fikcyjne dane:

```json
{
  "schema_version": 1,
  "event_id": "lead-created:formularz-voicelink:source-000123",
  "source": "google_sheets_form",
  "source_record_id": "source-000123",
  "contact": {
    "full_name": "Anna Przykładowa",
    "email": "anna@example.com",
    "phone": "p:+48500100200"
  }
}
```

`event_id` pozostaje ten sam przy każdym retry. `source_record_id` identyfikuje zgłoszenie, nie numer wiersza: użyj istniejącego identyfikatora źródłowego, a gdy go brak, n8n nadaje go raz i zachowuje. Nie losuj nowego UUID przy każdej próbie wysyłki. W payloadzie nie ma dowolnego workspace_id — serwer przypisuje workspace na podstawie konfiguracji uwierzytelnionej integracji.

Walidacja: wersja schematu, długości identyfikatorów i tekstów, imię/nazwisko, e-mail i telefon zgodnie z jawnie opisanymi regułami. Pusty jeden kanał kontaktu może być zaakceptowany, jeśli drugi jest poprawny; brak obu lub niepoprawny podany format → błąd jakości/review, bez tworzenia fikcyjnych wartości. Nie wstawiaj placeholderów do tabel biznesowych. Techniczny limit body np. 32 KB, konfigurowalny.

Normalizacja: trim imienia i e-maila, przechowywanie wersji prezentacyjnej, osobna znormalizowana wersja e-maila do dopasowań; telefon bez prefiksu `p:`, spacji i separatorów, walidacja E.164; polski numer lokalny bez kodu tylko przy jawnie skonfigurowanym regionie PL. Nie zmieniaj znaków `+` i nie zgaduj kodu kraju zagranicznych numerów. Testowe payloady i wiersze dummy mają być oznaczane i pomijane/rejestrowane jako testowe, nie produkcyjne leady.

### 7.3. Transakcja i idempotencja

1. Sprawdź token porównaniem bezpiecznym czasowo, limit body i walidację schematu.
2. Oblicz kanoniczny hash walidowanego payloadu; nie loguj pełnego kontaktu.
3. W transakcji zabezpiecz event unikalnym indeksem. Ten sam event i ten sam hash zwraca wcześniej zapisany wynik. Ten sam event i inny hash → 409, bez nadpisania.
4. Sprawdź niezależnie `(source, source_record_id)` w `external_lead_refs`. Nowy event_id dla już zaimportowanego zgłoszenia nie tworzy nowego leada i nie aktualizuje pól edytowanych w CRM-ie.
5. Dla nowego, poprawnego zgłoszenia utwórz kartę z nieznaną firmą, kontakt, deal na etapie `new`, referencję importu i aktywność w jednej transakcji.
6. Jeśli nowy source_record_id wskazuje na kontakt z tym samym e-mailem/telefonem, a relacja jest niejednoznaczna, zapisz review item. Nie scalaj po cichu różnych firm, nie odrzucaj zgłoszenia bez śladu i nie nadpisuj istniejącego klienta.
7. Zapisz zdarzenie domenowe dla odświeżenia UI i ewentualnych zatwierdzonych powiadomień. Odpowiedz sukcesem dopiero po trwałym zapisie.

Przykładowy sukces:

```json
{
  "status": "created",
  "event_id": "lead-created:formularz-voicelink:source-000123",
  "lead_id": "<uuid-deala>",
  "account_id": "<uuid-karty>",
  "correlation_id": "<uuid-żądania>"
}
```

Kody odpowiedzi: 201 nowy lead, 200 duplikat z wcześniejszym wynikiem, 202 trwale zapisane zgłoszenie oczekujące na ręczną weryfikację, 400/422 niepoprawne dane, 401 niepoprawny token, 409 konflikt idempotencji, 413 za duży body, 429 limit, 503 przejściowa niedostępność. Body błędu ma stabilny `code`, czytelny komunikat i correlation_id.

n8n traktuje 2xx jako przyjęcie, a 202 jako przyjęcie do review, nie błąd do ponawiania. Retry wyłącznie dla błędów sieci, 429 i przejściowych 5xx, z exponential backoff i tymi samymi identyfikatorami. 4xx wymagają poprawy konfiguracji/danych. Jeśli n8n straci odpowiedź po zatwierdzonym zapisie, retry ma zwrócić ten sam wynik.

W ustawieniach CRM pokaż URL webhooka, stan i datę ostatniego odbioru, liczby przyjętych/duplikatów/review/błędów. Sekret ustawiany po stronie serwera; UI nie wyświetla jego wartości. Historyczny import istniejących wierszy może użyć tego samego endpointu, porcjami, bez osobnej drogi omijającej walidację.

## 8. Integracja Fathom

### 8.1. Sposób połączenia

Użyj serwerowego API key jednego konta Fathom; nie zakładaj uprawnień administratora do cudzych nieudostępnionych spotkań. Zapisuj connection_id przy synchronizacji, żeby drugie konto dało się dodać bez zmiany schematu. Klucze i webhook secrets w menedżerze sekretów/zmiennych środowiskowych, metadane połączenia oddzielnie.

Opracowano na podstawie oficjalnej dokumentacji Fathom sprawdzonej 28.10.2026. Przed kodowaniem zweryfikuj bieżący kontrakt. Baza API: `https://api.fathom.ai/external/v1`; uwierzytelnianie nagłówkiem `X-Api-Key`.

Potrzebne operacje:

| Operacja | Zastosowanie |
|---|---|
| `GET /meetings` | Początkowy i uzupełniający import, paginacja kursorem, filtr utworzenia |
| `GET /recordings/{recording_id}/summary` | Pobranie/uzupełnienie podsumowania |
| `GET /recordings/{recording_id}/transcript` | Pobranie/uzupełnienie transkrypcji |
| `POST /webhooks` | Rejestracja nowych treści spotkań |

Z listy korzystaj defensywnie: odczytaj `recording_id`, URL i dostępne metadane; opcje include zależą od aktualnego rodzaju autoryzacji. Dedykowane endpointy nagrania są ścieżką uzupełnienia treści. Nie twórz endpointów na podstawie nazwy z pamięci.

### 8.2. Webhook jako główna droga

Rejestruj docelowo `/api/integrations/fathom/{connectionId}/webhook` z podsumowaniem i transkrypcją; action items mogą być pobrane jako treść do ręcznego wykorzystania. Weryfikuj aktualnie wymagane `triggered_for`. Początkowo pobieraj własne nagrania danego konta; nie rozszerzaj bez uzgodnienia na wszystkie cudze udostępnione spotkania.

Weryfikacja webhooka musi działać na surowym body przed JSON parsingiem. Użyj aktualnego SDK/kompatybilnego weryfikatora podpisu Fathom, sprawdź identyfikator zdarzenia, timestamp i podpis, z ochroną przed replay. Nie wystarczy sekret w URL. Dopiero po weryfikacji utrwal event i pracę do wykonania, następnie zwróć 2xx; przy niedostępnym DB zwróć błąd, żeby dostawca mógł ponowić.

Worker upsertuje treść spotkania i jego źródło, rozpoznaje istniejące nagranie, uzupełnia brakujące treści i próbuje jednoznacznego dopasowania kontaktów. Każdy krok może być wznowiony. Błędna transkrypcja nie może usunąć poprawnie zapisanych metadanych.

### 8.3. Backfill, retry, dwa konta

- Przycisk „Synchronizuj” oraz początkowy import z wybranym zakresem dat. Przed pełnym importem pokaż zakres i źródło, bez ukrytego pobierania całej historii.
- Uzupełniająca praca okresowa jako zabezpieczenie przed utratą webhooka; rekomendowany interwał 15 minut, konfigurowalny. Kursor/stan per konto, niewielki overlap, deduplikacja po nagraniu.
- Przy 429 respektuj `Retry-After`, ogranicz współbieżność; bieżący limit dostawcy sprawdź w dokumentacji. 401 pokazuje problem połączenia i wstrzymuje pętlę błędnych prób.
- Jeśli treść nie jest gotowa, retry z opóźnieniem zamiast pustego sukcesu; ograniczone próby i widoczna możliwość ponowienia.
- Jeżeli oba konta widzą to samo `recording_id`, zachowaj jeden rekord kanoniczny w workspace i dwa źródła dostępu, o ile potwierdzono, że ID jest globalne u dostawcy. Gdy zakres unikalności ID się różni, użyj klucza dostawcy i udokumentowanej reguły; nie scalaj po samym podobnym tytule.
- Usunięcie połączenia nie kasuje automatycznie całej historii biznesowej. Synchronizacja nie nadpisuje własnych notatek i ręcznych linków.
- Nie kopiuj nagrań wideo do Storage. Przechowuj i otwieraj link z odpowiedzi API; nie generuj publicznych linków, jeśli nie zostały dostarczone/udostępnione przez konto.

## 9. Dashboard i definicje statystyk

Dashboard ma odpowiadać na trzy pytania: ile naliczono przychodu, co wymaga działania dzisiaj i gdzie są opóźnienia. Domyślnie bieżący miesiąc, filtr okresu i właściciela dla odpowiednich sekcji. Każda karta ma nazwany okres i możliwość otwarcia źródłowych rekordów.

Pierwszy rząd: przychód brutto okresu, otwarte wdrożenia, moje zadania na dziś, nowe leady okresu. Drugi: wykres miesięcznego przychodu w dwóch seriach — wdrożenia jednorazowe i abonamenty — oraz niewielkie podsumowanie lejka. Niżej zadania, opóźnione wdrożenia i ostatnie odbyte spotkania. Bez modułu przyszłych spotkań.

| Metryka | Dokładna definicja |
|---|---|
| Przychód brutto z umów | Suma należnych wpisów ewidencji w okresie, z uwzględnieniem korekt; niezależna od liczby wdrożeń |
| Opłaty jednorazowe | Podzbiór setup i odnoszących się do niego korekt |
| Abonamenty okresu | Podzbiór subscription i odnoszących się do niego korekt; nie mnożnik przyszłych miesięcy |
| Bieżąca miesięczna kwota abonamentów | Suma aktywnych dziś miesięcznych warunków wygranych deali; osobna metryka, nie dodawana do już naliczonego przychodu |
| Otwarte wdrożenia | Status inny niż completed/cancelled, z uwzględnieniem paused; obok liczba wstrzymanych |
| Opóźnione wdrożenia | Otwarte i due_on < dzisiaj; brak terminu nie oznacza opóźnienia |
| Zadania na dziś | Dla wybranego użytkownika, due_on = dzisiaj, status todo/in_progress; jedno zadanie raz, mimo wielu przypisanych |
| Zadania zaległe | Niezakończone zadanie z due_on < dzisiaj; opcjonalna godzina może wyróżniać zaległość godzinową osobno |
| Nowe leady w okresie | Liczba deali utworzonych w okresie, bez ponowień webhooka i odrzuconych testów; źródło osobnym filtrem |
| Aktualny lejek | Liczby deali na poszczególnych otwartych etapach na teraz; podpis „Stan obecny”, bez udawania historii lejka |
| Wygrane deale w okresie | Unikalne deale z won_at w okresie i ważną finalizacją |
| Skuteczność zamkniętych deali | won / (won + lost) dla deali zamkniętych w okresie; przy zerowym mianowniku „Brak danych” |
| Wartość otwartych tematów | Osobno suma znanych opłat jednorazowych i suma znanych abonamentów miesięcznych; bez fikcyjnej całkowitej wartości wieczystej umowy |

Wykres 6 ostatnich miesięcy jako rekomendowany domyślny widok. Miesiące bez naliczeń mają 0, brak integracji/błąd pobrania ma stan błędu, nie zero. Tooltip pokazuje miesiąc i składniki; wykres ma także czytelny opis/tabelę danych. Sumy i filtry liczone serwerowo w DB; odświeżane po finalizacji, korekcie, naliczeniu i zmianie zadania. Nie łącz JOIN-ów mnożących revenue przez liczbę kontaktów czy task_assignees.

Każde KPI ma tooltip z definicją. Nie nazywaj naliczeń „wpłatami”, a przychodu „zyskiem”. Przy niedziałającym workerze pokaż datę ostatniego poprawnego przeliczenia i ostrzeżenie o nieaktualności, zamiast udawać kompletność.

## 10. Powiadomienia, PWA i prace w tle

### 10.1. Zdarzenie → powiadomienie → urządzenie

Mutacja biznesowa zapisuje domain event w tej samej transakcji. Worker przetwarza zdarzenie według potwierdzonych preferencji i reguł, tworzy osobne `notifications` odbiorców oraz `push_deliveries` ich aktywnych urządzeń. Ten sam event/odbiorca tworzy maksymalnie jedno powiadomienie. Nie wysyłaj push bez trwałego zapisu zdarzenia.

Centrum powiadomień: licznik nieprzeczytanych, lista, oznacz jako przeczytane, oznacz wszystkie, otwarcie powiązanego obiektu. Stan przeczytania per użytkownik, nie globalnie. Realtime aktualizuje licznik przy otwartej aplikacji; Web Push działa przez service worker, także gdy aplikacja jest zamknięta.

Treść blokady ekranu powinna być oszczędna, np. „Masz zadania na dziś” lub „Zmieniono status wdrożenia”. Nie umieszczaj w push transkrypcji, treści umów i danych kontaktowych bez potrzeby. Właściwy szczegół dostępny po zalogowaniu. `target_path` musi być wewnętrzną, walidowaną trasą, bez otwartego redirectu.

### 10.2. Harmonogram 08:00 i odporność

Supabase Cron uruchamia tick co minutę. Tick może wywołać worker przez pg_net; sekret wywołania trzymaj w Vault/bezpiecznej konfiguracji, bez wpisywania do migracji i repozytorium. Endpoint worker wymaga dedykowanego sekretu, nie ciasteczka użytkownika.

W każdej iteracji sprawdź lokalny czas Europe/Warsaw i należne zadania, zamiast ustawić stałą godzinę UTC. Zmiana czasu letniego nie przesuwa digestu na 07:00 albo 09:00. Dedupe digestu: workspace + user + lokalna data + typ. Nie nadrabiaj wielu historycznych digestów po kilkudniowej awarii; dla aktualnego dnia dopuszczaj kontrolowane nadrobienie w skonfigurowanym oknie i pokaż stan opóźnienia.

Planowana godzina uruchomienia to 08:00; dostarczenie na urządzenie zależy też od systemu, sieci i zgód. Nie obiecuj gwarancji dotarcia co do sekundy. W aplikacji zapis powiadomienia jest trwały niezależnie od powodzenia push.

Worker pracuje krótkimi partiami z limitem czasu. Claim zadań transakcyjny, `FOR UPDATE SKIP LOCKED` lub równoważny, z lease/locked_until, retry z exponential backoff i jitter, limit prób, dead-letter/failed do ręcznego wznowienia. Prace po wygaśnięciu lease wracają do przetworzenia. Wywołanie HTTP przez pg_net nie jest dowodem skutecznego wykonania; monitoruj wynik workera i heartbeat.

Skutki biznesowe mają być idempotentne. Transport push jest co najmniej raz, nie obiecuj matematycznej exactly-once delivery przez zewnętrzny system. Użyj stabilnego notification id/tag do ograniczenia duplikatów. HTTP 404/410 z push dezaktywuje subskrypcję, przejściowe błędy podlegają retry.

Nie opieraj przypomnień na `setTimeout`, cron uruchomionym w procesie Next.js, localStorage czy otwartym telefonie. Scheduler Supabase jest świadomym wyborem architektury; nie polegaj na niedostatecznej częstotliwości crona planu Vercel. Parametry i limity usług zweryfikuj przed wdrożeniem.

### 10.3. Wykonanie PWA

Manifest: nazwa VoiceLink CRM, short_name VoiceLink, stabilne id, start_url/scope, display standalone, theme/background colors, ikony 192/512 i maskable, apple-touch-icon. Prawidłowe HTTPS i service worker obsługujący push, notificationclick oraz aktualizację wersji.

Subskrypcje trwale w DB per użytkownik i urządzenie. Publiczny VAPID key może być w frontendzie, prywatny wyłącznie na serwerze. Nigdy nie używaj pojedynczej zmiennej modułowej jako magazynu subskrypcji. Wiele telefonów i laptopów ma działać niezależnie.

Zgoda dopiero po kliknięciu „Włącz powiadomienia”. Stan: nieobsługiwane, wymaga instalacji, można włączyć, włączone, odmowa, błąd. iOS/iPadOS od 16.4 wymaga aplikacji dodanej na ekran początkowy dla Web Push; pokaż właściwą instrukcję i nie udawaj obsługi `beforeinstallprompt` w Safari. Android korzysta z dostępnego mechanizmu instalacji i zgód.

Service worker cache'uje tylko bezpieczne statyczne zasoby i neutralny ekran offline. Nie utrwalaj transkrypcji, dokumentów, API CRM ani stron z danymi sesji w publicznym cache. Aplikacja tej wersji nie oferuje edycji offline. Pokaż stan offline i zachowaj niezapisany formularz w pamięci, bez zapisu poufnych danych do localStorage. Po wylogowaniu usuń/odwiąż subskrypcję dla danej instalacji, nie wylogowuj innych urządzeń; wyczyść prywatny stan klienta.

Kliknięcie push otwiera albo aktywuje okno tego samego originu i kieruje do właściwej trasy. Gdy sesja wygasła, po logowaniu wraca do rekordu. Gdy rekord zarchiwizowano lub brak dostępu, pokaż komunikat zamiast błędu technicznego. Odczyt danych nadal wymaga sesji — posiadanie adresu z push nie daje uprawnień.

## 11. Uwierzytelnianie, uprawnienia i bezpieczeństwo implementacji

Obie osoby mają identyczny dostęp do wszystkich danych biznesowych workspace, niezależnie od opiekuna leada czy przypisania do zadania. Filtr „Moje” jest wygodą, nie polityką RLS. Prywatne pozostają hasła, tokeny sesji, klucze integracji i subskrypcje urządzeń. Pełny dostęp do CRM-a nie oznacza pokazania tych sekretów drugiej osobie.

- Każda tabela w schemacie wystawionym przez Data API ma włączone RLS. Jawne GRANT-y są oddzielne od polityk. Nie zakładaj automatycznej ekspozycji nowych tabel.
- Autoryzacja przez aktywne członkostwo workspace; same `TO authenticated` albo `auth.uid() IS NOT NULL` nie wystarczają. Obca uwierzytelniona osoba nie ma dostępu do danych.
- Zaprojektuj politykę członkostwa bez rekurencji. Użytkownik nie może sam dopisać się do workspace przez API ani zmienić workspace_id obiektu.
- Odczyty używają klienta użytkownika z RLS. Zalecana ścieżka mutacji: serwer weryfikuje sesję i członkostwo, waliduje input, a kontrolowana usługa wykonuje operację transakcyjną. Jeśli używa klienta uprzywilejowanego, każda ścieżka musi jawnie sprawdzać autora, workspace i powiązania; klient admina sam omija RLS.
- Dla transakcyjnych RPC wywoływanych tylko przez backend odbierz EXECUTE od PUBLIC/anon/authenticated i nadaj właściwej roli serwerowej. Preferuj SECURITY INVOKER; SECURITY DEFINER tylko z udokumentowaną koniecznością, stałym search_path i kontrolą dostępu. Nie naprawiaj błędu uprawnień dodaniem definer do wszystkiego.
- Jeśli wybrano mutacje wyłącznie serwerowe, frontend ma SELECT do potrzebnych tabel, nie nieograniczony zapis do tabel finansowych/kolejek. Reguły krytyczne i eventy nie mogą być omijane bezpośrednią zmianą etapu przez Data API. Zastosuj odpowiednie uprawnienia i transakcyjne funkcje zamiast polegać na ukryciu przycisku.
- Widoki agregujące muszą respektować RLS, np. `security_invoker=true`, albo być dostępne wyłącznie z bezpiecznego backendu.
- Sesje cookie według aktualnych zaleceń Supabase SSR; sprawdzaj tożsamość na serwerze wspieraną metodą, nie ufaj samemu stanowi Reacta ani niezaufanemu cookie. Nie używaj `getSession()` jako jedynej podstawy autoryzacji.
- Brak wspólnego cache/CDN dla prywatnych odpowiedzi i HTML użytkownika. Jawnie przeanalizuj cache Next.js, Route Handlers i RSC.
- Storage prywatny, autoryzacja workspace i ścieżki obiektu; krótkotrwałe signed URLs po kontroli uprawnień. Nie zapisuj signed URL jako trwałego adresu dokumentu.
- Sekrety Supabase i Fathom, token n8n, klucz prywatny VAPID oraz worker secret nie mają prefiksu NEXT_PUBLIC. `.env.local` poza git; `.env.example` wyłącznie z nazwami i pustymi wartościami.
- Dane z n8n i Fathom walidowane; markdown podsumowań renderowany bez niebezpiecznego HTML; transkrypcja jako tekst. Linki do nagrań sprawdzane pod kątem schematu i pochodzenia.
- Ochrona mutacji użytkownika przed obcym originem/CSRF zgodnie z wybranym mechanizmem; webhooki mają odrębne uwierzytelnianie i limity.
- Logi bez kluczy, pełnych transkrypcji i kontaktów. correlation_id, typ błędu, status integracji i czas wystarczają do codziennej diagnozy.
- Powiadomienia tylko swojego recipient_user_id, push subskrypcje tylko własne; worker ma osobny, kontrolowany dostęp. Realtime nie może publikować cudzych powiadomień całemu workspace.

Nie twórz danych produkcyjnych ani użytkowników na podstawie prawdziwych osób ze zrzutu ekranu. Zrzut służy wyłącznie ustaleniu mapowania.

## 12. Etapy implementacji — instrukcje i kryteria odbioru

Każdy etap obejmuje kod, obsługę błędów, walidację i aktualizację dokumentacji. Kryteria to warunki zakończenia, a nie lista funkcji do odłożenia na koniec. Nie przechodź do integracji zależnej od błędnego modelu danych. Jeżeli brak zewnętrznego klucza, zbuduj adapter i testy kontraktowe, oznacz integrację jako niesprawdzoną na żywo i kontynuuj niezależne moduły.

### Etap 0 — rozpoznanie repozytorium i decyzje

**Cel:** przekształcić specyfikację w zgodny z zastanym środowiskiem plan.

**Wykonaj:**

1. Sprawdź AGENTS.md, strukturę, package.json, lockfile, wersję Node, istniejący Supabase i konfigurację Vercel/GitHub. Nie nadpisuj istniejącego projektu generatorami.
2. Zweryfikuj aktualne oficjalne dokumentacje Next.js, Supabase SSR/Data API/Storage/Cron, Fathom i PWA. Zapisz wybrane wersje i istotne ograniczenia.
3. Przepisz zatwierdzone wymagania do `docs/REQUIREMENTS.md`, decyzje do `docs/DECISIONS.md`, model do `docs/DATA_MODEL.md`.
4. Rozstrzygnij D1 i D2 z użytkownikiem, jeśli brak odpowiedzi. Równolegle możesz wykonać niezależne etapy; nie aktywuj ukrytych domyślnych wysyłek.
5. Ustal dostępność logo i środowisk. Sekrety konfiguruje się w ustawieniach środowiska, nie przesyła publicznie ani nie wpisuje w odpowiedź.
6. Utwórz checklistę kolejnych etapów i jawnie oznacz elementy wymagające rzeczywistego konta Fathom, n8n, urządzeń iOS/Android.

**Odbiór:** wiadomo, co jest potwierdzone, jakie są dwie otwarte reguły i jak uruchomić projekt. Nie zaczynasz od pustej makiety udającej CRM.

### Etap 1 — fundament aplikacji, logowanie i design system

**Cel:** działająca, chroniona powłoka aplikacji.

**Wykonaj:**

1. Przygotuj Next.js App Router + strict TypeScript, style i podstawowe komendy lint/typecheck/test/build. Zachowaj zastany manager pakietów, jeśli istnieje.
2. Dodaj klienty Supabase browser/server/admin z czytelnymi granicami importów. Skonfiguruj odświeżanie sesji zgodnie z wybraną wersją Next.js.
3. Wdroż logowanie, wylogowanie, reset hasła i ochronę tras oraz mutacji. Konto spoza workspace nie wchodzi do CRM-a.
4. Zbuduj tokeny VoiceLink, sidebar, header, breadcrumb, mobile navigation, podstawowe Button/Input/Select/Dialog/Sheet/Table/Badge/Toast/EmptyState/Skeleton.
5. Dodaj siedem tras modułów ze wspólną powłoką i jawnymi stanami „jeszcze niezaimplementowane” tylko na czas developmentu. Nie traktuj ich jako ukończonych modułów.
6. Pokaż widoczny stan sesji i bezpieczne przekierowanie po zalogowaniu.

**Sprawdź:** logowanie obu członków, odmowa obcemu użytkownikowi, wygaśnięcie sesji, wylogowanie, wejście bez sesji na głęboką trasę, layout 390 px i 1440 px, nawigacja klawiaturą.

**Odbiór:** prywatna aplikacja uruchamia się, ma spójną nawigację i prawdziwą sesję. Brak sekretu w bundlu klienta.

### Etap 2 — baza, RLS i transakcyjne operacje domenowe

**Cel:** trwały model danych i bezpieczny punkt wyjścia dla wszystkich modułów.

**Wykonaj:**

1. Utwórz migracje tabel z rozdziału 3 w kolejności FK, indeksy, checki, triggery aktualizacji i polityki. Nazwy migracji generuj przez aktualny Supabase CLI, nie zgaduj timestampów.
2. Rozdziel tabele biznesowe dostępne użytkownikowi od technicznych, które obsługuje backend. Jawnie ustaw granty i schematy wystawione do Data API.
3. Zaimplementuj funkcje transakcyjne dla importu leada, zapisania próby kontaktu + follow-upu, finalizacji deala, naliczeń i korekt.
4. Wprowadź wspólne serwerowe sprawdzanie sesji, członkostwa i workspace przed uprzywilejowanymi operacjami.
5. Dodaj generowane typy DB, spójne mapowanie błędów i optimistic concurrency.
6. Przygotuj fikcyjny seed: dwie osoby testowe/profilowe, kontakty bez firmy, firma z dwoma kontaktami, kilka etapów, kilka produktów, deale wygrane/przegrane, wdrożenia i zadania. Produkcyjne konta tworzy operator, seed nie ma prawdziwych haseł.
7. Sprawdź polityki i dostęp narzędziami/SQL na rzeczywistym lokalnym albo testowym Supabase. Zachowaj migracje odtwarzalne od czystej bazy.

**Sprawdź:** anonim nie czyta CRM; członek czyta wspólne dane; obca sesja nie czyta; obce workspace_id i powiązania są odrzucane; brak bezpośredniego zapisu do ewidencji przez klienta; usunięcie członkostwa odbiera dostęp.

**Odbiór:** migracje odtwarzają bazę, RLS przetestowane, typy wygenerowane, kluczowe operacje są atomowe. Nie wystarczy deklaracja „RLS enabled”.

### Etap 3 — ręczny CRM: kontakty, leady, klienci i historia

**Cel:** pełny podstawowy workflow sprzedaży bez zależności od zewnętrznych integracji.

**Wykonaj:**

1. Zbuduj listę leadów z paginacją, sortowaniem, filtrami, szukaniem i zachowaniem stanu w URL.
2. Dodaj tworzenie/edycję konta, kontaktu i deala. Obsłuż lead bez nazwy firmy, drugi kontakt i drugi deal tej samej firmy.
3. Zbuduj kartę deala i firmy z historią i własnymi notatkami.
4. Dodaj zmianę etapów, przypisanie opiekuna, wynik kontaktu i utrwalanie deal_stage_history; UI finansowej finalizacji w następnym etapie, bez fałszywego naliczania.
5. Zbuduj listę i kartę klientów nad tymi samymi encjami. Zapewnij archiwizację bez kasowania historii.
6. Zaprojektuj bezpieczne wykrywanie i ręczne rozwiązanie potencjalnych duplikatów; żadne scalenie automatyczne po samej nazwie.
7. Wprowadź odświeżanie po zmianie i aktualizację drugiej otwartej sesji bez przeładowywania całej aplikacji.

**Sprawdź:** firma z dwoma kontaktami i dwoma dealami, brak utraty danych przy konwersji, poprawny powrót z karty do przefiltrowanej listy, konflikt równoczesnej edycji.

**Odbiór:** da się prowadzić realny lead ręcznie od nowego do oferty; biznesowe dane przeżywają restart i zmianę urządzenia.

### Etap 4 — webhook n8n i odporność importu

**Cel:** nowy wpis trafia do CRM-a raz i bez późniejszego nadpisania.

**Wykonaj:**

1. Dodaj endpoint, schemat Zod v1 i opis kontraktu w `docs/API.md`.
2. Wprowadź autoryzację tokenem, limity body i żądań, normalizację e-maila i telefonu, identyfikatory zdarzenia i rekordu.
3. Podłącz transakcyjny import, durable event log, unikalności DB i odpowiedzi idempotentne.
4. Zbuduj widok review w ustawieniach integracji z powodem i bezpiecznym ręcznym powiązaniem albo odrzuceniem zgłoszenia.
5. Pokaż stan połączenia i ostatnie wyniki bez ujawniania sekretu.
6. Dostarcz przykład żądania HTTP/cURL z placeholderem tokenu, bez prawdziwych danych kontaktowych, oraz instrukcję mapowania w n8n i retry.
7. Sprawdź dostępność integracji z drugim użytkownikiem w otwartej aplikacji: nowy lead widoczny po odświeżeniu danych/Realtime.

**Sprawdź:** ten sam payload 10 razy, dwa równoległe identyczne requesty, utrata odpowiedzi i retry, inny hash dla tego samego event_id, nowy event_id dla tego samego source_record_id, błędny telefon, pusty kontakt, test dummy, błędny token, DB unavailable.

**Odbiór:** jeden zgłoszony lead tworzy jedną szansę; edycja telefonu w CRM-ie nie zostaje cofnięta po retry n8n. Workflow n8n pozostaje po stronie użytkownika, ale CRM ma gotowy kontrakt i sprawdzony endpoint.

### Etap 5 — finalizacja deali i ewidencja przychodów

**Cel:** poprawne naliczanie bez podwójnego liczenia.

**Wykonaj:**

1. Zbuduj formularz finalizacji, kwoty brutto, datę opłaty jednorazowej, datę początku abonamentu i podgląd harmonogramu.
2. Zaimplementuj wygraną w transakcji z agreementami, historią, oznaczeniem klienta i już należnymi wpisami.
3. Zaimplementuj czystą funkcję wyznaczania dat miesięcznych z anchor day, strefą, końcem umowy i rokiem przestępnym.
4. Zaimplementuj idempotentne generowanie należnych cykli i catch-up po przerwie.
5. Dodaj widok historii naliczeń i warunków abonamentu na karcie klienta/deala.
6. Dodaj zakończenie abonamentu, zmianę warunków od przyszłego cyklu i kontrolowaną korektę historii/cofnięcie finalizacji.
7. Oddziel metryki kwot oferty, warunków abonamentu, wpisów przychodu i wartości wdrożeń.

**Sprawdź:** przypadki z rozdziału 6, brak abonamentu, setup=0, przyszły start, start w przeszłości z podglądem, dzień 31, luty przestępny, końcowa data wyłączająca cykl, dwa workery równolegle, ponowne kliknięcie wygranej, korekta i cofnięcie wygranej.

**Odbiór:** konkretna firma z setup 3000 i abonamentem 1000 daje dokładnie oczekiwane wpisy; dodatkowe wdrożenie niczego nie podwaja; przyszłe cykle nie zawyżają przychodu dzisiaj.

### Etap 6 — wdrożenia

**Cel:** bieżąca praca nad realizacją usług.

**Wykonaj:**

1. Lista aktywnych/wszystkich wdrożeń, filtry, sortowanie, termin i opóźnienie.
2. Formularz ręczny oraz „Utwórz wdrożenie” na wygranym dealu, z jawnym zatwierdzeniem danych.
3. Typ produktu, opis, klient, termin, wartość informacyjna i tekstowy opiekun.
4. Szczegóły, wspólne statusy, ręczna checklista, historia, powiązane zadania i dokumenty.
5. Wstrzymanie, anulowanie, zakończenie i ponowne otwarcie z aktualizacją odpowiednich dat.
6. Zapis domain event dla późniejszych potwierdzonych powiadomień.

**Sprawdź:** trzy produkty z tym samym schematem, opiekun niebędący użytkownikiem, brak terminu, termin przeszły, zmiana klienta a zgodność deala, wiele wdrożeń tego samego deala.

**Odbiór:** moduł obsługuje wszystkie aktywne realizacje i nie zmienia automatycznie ewidencji przychodu.

### Etap 7 — zadania i follow-up

**Cel:** wykonywalna kolejka pracy obu osób.

**Wykonaj:**

1. Lista „Moje/Wszystkie”, widoki terminów, statusy i priorytety.
2. Tworzenie, edycja, wielokrotne przypisanie, zakończenie i powiązania.
3. Atomowy przycisk „Nie odebrał” z przypisaniem do aktora i datą według D2.
4. Edycja terminu utworzonego follow-upu; czytelna informacja, skąd pochodzi zadanie.
5. Model zdarzeń przypisania, zmiany terminu/statusu i zakończenia, gotowy do powiadomień.
6. Czyste funkcje kalendarza roboczego; bez stałych zależnych od strefy serwera.

**Sprawdź:** kliknięcie przez osobę A przypisuje A, mimo że lead ma opiekuna B; wspólne zadanie jest jednym rekordem; task done nie jest zaległy; double click nie tworzy dwóch follow-upów; przypadki 09:00, 14:59, 15:00, po granicy i piątek po 15:00 oraz wyjątki D2.

**Odbiór:** dzień zadania zgodny z potwierdzoną polityką, bez wymyślonej godziny oddzwonienia. Nieustalone wyjątki wymagają jawnego wyboru daty zamiast fallbacku.

### Etap 8 — dokumenty i Storage

**Cel:** uporządkowane prywatne dokumenty.

**Wykonaj:**

1. Prywatny bucket, polityki i bezpieczne ścieżki; konfiguracja rozmiarów i typów.
2. Wieloplikowy upload z postępem i per-file retry, upload intent oraz complete.
3. Lista, kategorie, szukanie, powiązania opcjonalne, podgląd PDF/obrazu i pobieranie pozostałych obsługiwanych plików.
4. Kontrola dostępu przed signed URL; brak publicznego trwałego adresu.
5. Potwierdzenie usunięcia, usuwanie z retry i sprzątanie niekompletnych uploadów.
6. Dostęp do tych samych dokumentów z kart firm, leadów i wdrożeń bez powielania obiektów.

**Sprawdź:** plik bez powiązania, plik powiązany z leadem, utrata sieci w uploadzie, za duży i niedozwolony typ, wygasły URL, obcy użytkownik, awaria końcowego potwierdzenia.

**Odbiór:** plik jest dostępny obu osobom po ponownym wejściu, lecz nie anonimowo; nie ma generowania ofert ani e-podpisu.

### Etap 9 — odbyte spotkania z Fathom

**Cel:** prawdziwa integracja z jednym kontem i gotowość na drugie.

**Wykonaj:**

1. Adapter API z autoryzacją, paginacją, retry i typowanym kontraktem.
2. Trwałe połączenie, bezpieczne wskazanie sekretu, webhook z weryfikacją podpisu na raw body.
3. Worker importu, normalizacja metadanych i oddzielne segmenty transkrypcji.
4. Backfill z wyborem zakresu i przycisk „Synchronizuj”; stan per connection.
5. Lista i karta spotkania z treścią Fathom, własnymi notatkami i linkiem do nagrania.
6. Dopasowania kontaktów po e-mailu; bezpieczny stan do przypisania przy niejednoznaczności.
7. Ochrona przed duplikatem z webhooka, pollingu i drugiego konta. Ręczne powiązania odporne na resync.

**Sprawdź:** podpis poprawny/błędny, stary timestamp, ten sam webhook dwa razy, kilka stron API, opóźniona transkrypcja, 429, 401, brak powiązania, dwa możliwe deale, zachowanie notatek po ponownym imporcie.

**Odbiór:** rzeczywiste odbyte spotkanie z konta testowego/produkcyjnego trafia do CRM-a z treścią i linkiem. Bez klucza oznacz weryfikację live jako niewykonaną; mock nie stanowi jej zaliczenia.

### Etap 10 — dashboard i wyszukiwanie globalne

**Cel:** użyteczne, zgodne z bazą statystyki i szybki dostęp do pracy.

**Wykonaj:**

1. Agregacje metryk zgodnie z rozdziałem 9, bez sumowania w przeglądarce całych tabel.
2. Karty KPI, wykres dwóch serii, obecny lejek, zadania na dziś, opóźnione wdrożenia i ostatnie odbyte spotkania.
3. Filtry okresu, czytelne podpisy i drill-down z każdej metryki do odpowiadającej listy.
4. Spójne rozróżnienie „w okresie”, „dzisiaj” i „stan obecny”. Nie pozwalaj globalnemu filtrowi zmieniać znaczenia zadań na dziś bez opisu.
5. Wyszukiwanie globalne z paginowanymi grupami wyników i odsyłaczami.
6. Odświeżanie po zmianach, korektach i pracy workera; oznaczenie nieaktualności przy awarii.

**Sprawdź:** uzgodnij sumy z konkretnymi rekordami SQL, brak podwojenia przez JOIN, granica miesiąca w Warszawie, brak danych vs błąd, poprawny mianownik konwersji, filtr okresu i linki źródłowe.

**Odbiór:** liczby dają się odtworzyć z ewidencji i nie są fikcyjne; wykres pokazuje zera w pustych miesiącach, nie losowe trendy.

### Etap 11 — worker, centrum powiadomień i Web Push

**Cel:** zadania i zmiany docierają do użytkowników bez otwartej aplikacji.

**Wykonaj:**

1. Uruchom trwałą kolejkę, claim/lease/retry, worker tick i heartbeat. Podłącz naliczenia oraz Fathom, jeśli do tej pory uruchamiano je ręcznie.
2. Wdroż digest 08:00 Europe/Warsaw, z dedupe per użytkownik i dzień.
3. Podłącz inne zdarzenia wyłącznie zgodnie z odpowiedzią D1. Preferencje użytkownika i zgoda urządzenia muszą być oddzielne.
4. Zbuduj centrum powiadomień z RLS per odbiorca, licznikiem i odczytem.
5. Wdroż trwałe subskrypcje wielu urządzeń, VAPID, bezpieczny push/test, retry i dezaktywację 410.
6. Dodaj manifest, service worker, ikony i instrukcje instalacji iOS/Android; obsługę zgód i odmowy.
7. Dodaj bezpieczne deep links, powrót po logowaniu i zachowanie po wylogowaniu na jednym urządzeniu.
8. Nie cache'uj prywatnych ekranów/treści; dodaj neutralny offline state i aktualizację service workera.

**Sprawdź:** digest obu osób z różnymi zadaniami; dwa urządzenia jednej osoby; brak subskrypcji; odmowa zgody; wygasła subskrypcja; zamknięta PWA; zmiana czasu marzec/październik; dwa ticki naraz; restart workera po zapisie; kliknięcie powiadomienia przy wygasłej sesji; przeniesienie używanego telefonu na drugie konto po wylogowaniu bez przecieku push poprzedniej osoby.

**Odbiór:** udokumentowany test rzeczywistego push na zainstalowanej PWA iOS i Android. Emulacja widoku mobilnego nie zastępuje testu dostarczenia systemowego. Jeśli brak urządzeń, oznacz testy jako wymagające wykonania, nie jako zaliczone.

### Etap 12 — dopracowanie UX, dostępność i stabilność

**Cel:** całość nadaje się do codziennej pracy.

**Wykonaj:**

1. Przejdź wszystkie siedem modułów na szerokościach ok. 390, 768, 1440 px; popraw overflow, focus i cele dotykowe.
2. Ujednolić należy odstępy, hierarchię przycisków, nazwy, statusy, polskie komunikaty, format dat i kwot; doprowadź je do wspólnego standardu.
3. Uzupełnij wszystkie stany ładowania, błędu, pustego wyniku i braku uprawnień.
4. Sprawdź konflikty edycji dwóch osób, zachowanie formularzy po błędzie i odświeżanie danych po mutacjach.
5. Przejrzyj zapytania N+1, paginację, ciężkie transkrypcje i agregacje. Nie pobieraj w liście całej zawartości dokumentów ani spotkań.
6. Uruchom krytyczne testy, lint, typecheck i production build; popraw znalezione błędy.

**Odbiór:** brak atrap, martwych przycisków, fikcyjnych KPI i `TODO` w krytycznej ścieżce. Błędy integracji są widoczne i da się je ponowić. Nie dodawaj testów kopiujących każdą klasę CSS; testuj reguły i przepływy.

### Etap 13 — przygotowanie wdrożenia i przekazanie

**Cel:** odtwarzalny deployment na Vercel z Supabase i GitHub.

**Wykonaj:**

1. Skonfiguruj CI w GitHub: instalacja z lockfile, lint/typecheck, testy domenowe, build; integration/e2e na właściwym środowisku testowym.
2. Rozdziel development/preview/production. Preview nie może odpalać produkcyjnych webhooków, crona ani wysyłać rzeczywistych push bez jawnego włączenia.
3. Przygotuj `.env.example`, instrukcję konfiguracji Vercel, Supabase URL/redirects, domeny, bucketu, crona, Vault i sekretów integracji.
4. Zastosuj migracje w uzgodnionym środowisku. Nie uruchamiaj `db reset` na produkcji ani nie czyść istniejących rekordów jako sposobu naprawy.
5. Przygotuj dwa konta członków przez operatora, skonfiguruj logowanie i zweryfikuj brak publicznego dostępu.
6. Udokumentuj endpoint dla n8n, konfigurację konta Fathom i możliwość dodania drugiego, test push oraz statusy prac.
7. Opisz kopie/odtwarzanie DB i Storage z uwzględnieniem wybranego planu, monitoring, rotację sekretów, ponawianie dead-letter i naprawę zawieszonych uploadów.
8. Przeprowadź smoke test po deployment: nowy fikcyjny lead przez n8n endpoint → zadanie → wygrana → naliczenie → wdrożenie → dokument; osobno Fathom i push.
9. Uzupełnij `RUNBOOK.md`, `RELEASE_CHECKLIST.md` i status. Jeśli w środowisku obowiązuje zgoda na publikację, najpierw przygotuj konkretną gotową wersję i dopiero poproś o wymagane zatwierdzenie.

**Odbiór:** działające środowisko, wszystkie wymagane sekrety skonfigurowane, migracje zastosowane, worker aktywny, testy live opisane zgodnie z prawdą; brak instrukcji „resztę dopisz sam”.

## 13. Macierz krytycznych testów akceptacyjnych

Poniższe przypadki są obowiązkowym minimum weryfikacji. Dobierz poziom unit/integration/e2e adekwatnie do reguły, bez duplikowania tego samego testu wszędzie.

| ID | Scenariusz | Oczekiwany wynik |
|---|---|---|
| A01 | Brak sesji otwiera `/clients/<id>` | Logowanie; brak danych w odpowiedzi |
| A02 | Uwierzytelniona osoba bez członkostwa | Brak dostępu także przez Data API i Storage |
| A03 | Użytkownik B otwiera firmę utworzoną przez A | Pełny dostęp biznesowy |
| A04 | Próba podmiany workspace_id w mutacji | Odrzucona na serwerze i/lub przez DB |
| L01 | Nowy lead ma tylko imię, e-mail, telefon | Poprawny rekord bez fikcyjnej firmy |
| L02 | Dziesięć retry tego samego eventu n8n | Jeden deal, jeden kontakt, ten sam wynik |
| L03 | Dwa równoległe requesty importu | Jedno zgłoszenie biznesowe, brak race condition |
| L04 | Ten sam event_id i zmienione dane | 409; brak nadpisania |
| L05 | Edycja w CRM, potem replay źródłowego wpisu | Dane z CRM zachowane |
| L06 | Ten sam e-mail, nowy niejednoznaczny source id | Widoczny review, bez cichego scalenia |
| L07 | `p:+48500100200` | Znormalizowany telefon +48500100200 |
| L08 | Arkuszowy QUALIFIED | Nie ustawia samodzielnie etapu sprzedaży |
| F01 | Otwarty/przegrany deal z wpisanymi kwotami | Zero naliczonego przychodu |
| F02 | Wygrany setup 3000, bez abonamentu | Jedna opłata 3000, brak cykli |
| F03 | Wygrany abonament z przyszłą datą | Brak naliczenia przed datą |
| F04 | Początek 31 stycznia | Luty przycięty, marzec wraca na 31 |
| F05 | Worker dwukrotnie i równolegle | Jeden wpis na cykl |
| F06 | Worker nie działał dwa miesiące | Właściwe zaległe cykle z właściwymi datami |
| F07 | Trzy wdrożenia tego samego deala | Przychód nie rośnie od liczby wdrożeń |
| F08 | Zakończenie przed następnym terminem | Następny cykl nie powstaje, historia zostaje |
| F09 | Cofnięcie wygranej | Zgodny podgląd i korekty, brak aktywnych przyszłych naliczeń |
| F10 | Dwa kontakty + wiele zadań na firmie | Agregacja revenue nie mnoży kwot |
| T01 | B klika „Nie odebrał” w leadzie A | Follow-up przypisany B |
| T02 | Dzień pracy 10:00 | Termin follow-upu dziś |
| T03 | Piątek po 15:00 | Kolejny dzień roboczy według potwierdzonego kalendarza |
| T04 | Przed 09:00/weekend/święto | Dokładna reguła z D2 albo jawny wybór daty |
| T05 | Wspólne zadanie A i B kończy A | Jeden rekord zakończony dla obu |
| N01 | 08:00 Europe/Warsaw | Jeden dzienny digest na osobę z zadaniami na dziś |
| N02 | Przejście czasu letniego/zimowego | Lokalna 08:00 zachowana |
| N03 | Brak zadań na dziś | Brak pustego digestu |
| N04 | Dwa telefony tej samej osoby | Dostarczenie na obie aktywne subskrypcje |
| N05 | Odmowa push | CRM i centrum powiadomień działają |
| N06 | Provider push zwraca 410 | Subskrypcja wyłączona, bez nieskończonych retry |
| N07 | Wylogowanie A i logowanie B na telefonie | Brak push A do nowej instalacji/sesji B |
| M01 | Powtórka webhooka i synchronizacja Fathom | Jedno spotkanie |
| M02 | Treść niegotowa | Metadane widoczne, kontrolowany retry treści |
| M03 | Kilka pasujących deali | Bez zgadywania; ręczne przypisanie |
| M04 | Resync po własnej notatce | Własna notatka zachowana |
| D01 | Dokument bez przypisania | Widoczny w Dokumentach, brak sztucznego klienta |
| D02 | Wygasły signed URL | Nowy URL po ponownej autoryzacji |
| D03 | Upload przerwany | Stan błędu/retry; brak pozornego ready |
| U01 | Dwie osoby jednocześnie edytują deal | Wykryty konflikt, brak cichej utraty danych |
| U02 | Mobile 390 px i klawiatura ekranowa | Formularze i akcje dostępne, bez poziomego overflow strony |
| U03 | Offline przy zapisie | Widoczny brak sukcesu; możliwość ponowienia |

## 14. Dokumentacja konfiguracji i środowiska

Przygotuj zestaw nazw zmiennych dopasowany do aktualnego SDK. Przykładowy zakres, bez rzeczywistych wartości:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
APP_URL=
N8N_LEADS_WEBHOOK_TOKEN=
N8N_LEADS_WORKSPACE_ID=
FATHOM_ACCOUNT_1_API_KEY=
FATHOM_ACCOUNT_1_WEBHOOK_SECRET=
# Drugie konto dopiero po konfiguracji; brak nie może psuć pierwszego.
FATHOM_ACCOUNT_2_API_KEY=
FATHOM_ACCOUNT_2_WEBHOOK_SECRET=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=
JOB_WORKER_SECRET=
ENABLE_BACKGROUND_JOBS=
ENABLE_OUTBOUND_PUSH=
```

Workspace i connection mappings skonfiguruj serwerowo; nie przyjmuj ich bez weryfikacji z przeglądarki ani webhooka. Jeżeli projekt używa starszego service role key, nie mieszaj go z nowym secret key bez sprawdzenia aktualnej dokumentacji i migracji. Kluczy nie wpisuj do seedów, testów, logów, przykładowych curlów ani kodu frontendowego.

W README opisz: instalację, uruchomienie, wymagane zmienne, lokalne migracje, generowanie typów, seed testowy, komendy kontroli, deployment, konfigurację dwóch kont i wszystkie testy wymagające urządzenia/sekretów. W runbooku opisz dodatkowo, gdzie sprawdzić heartbeat workera i jak wznowić błędny import bez zdublowania rekordów.

## 15. Definicja gotowości całego CRM-a

Projekt jest gotowy dopiero, gdy:

1. Obie osoby logują się do wspólnej aplikacji i mają pełny dostęp do siedmiu modułów.
2. Lead przechodzi cały proces, a firma i kontakty zachowują wspólną historię po wygraniu deala.
3. n8n może utworzyć leada przez bezpieczny, odporny na retry endpoint; arkusz nie nadpisuje dalszych zmian.
4. Setup nalicza się raz, abonament w miesięcznicę wskazanej daty; dashboard opiera się na prawidłowych wpisach.
5. Wdrożenia mają terminy, produkty, opiekuna tekstowego, wartość i powiązanego klienta.
6. Zadania współdzielone i follow-up działają zgodnie z potwierdzonym kalendarzem.
7. Odbyte spotkania z Fathom mają treści i link do nagrania; drugie konto można dodać bez przebudowy bazy.
8. Dokumenty są prywatne, dają się wgrać i opcjonalnie powiązać z właściwą relacją.
9. PWA jest instalowalna; digest 08:00 i zatwierdzone powiadomienia działają niezależnie od otwarcia aplikacji.
10. UI jest spójne na desktopie i telefonie; brak martwych akcji i fikcyjnych danych w produkcji.
11. Testy krytycznych reguł i production build przechodzą; testy live mają rzeczywisty status, nie deklarację bez dowodu.
12. Dokumentacja pozwala uruchomić, odtworzyć i utrzymać aplikację, a otwarte decyzje D1/D2 są rozstrzygnięte przed aktywacją dotyczących ich automatyzacji.

## 16. Jak korzystać z tego promptu

Przekaż Grokowi cały dokument jako kontekst projektu. Pierwsza instrukcja do wykonania:

> Przeczytaj całą specyfikację VoiceLink CRM i instrukcje repozytorium. Wykonaj Etap 0, zadaj wyłącznie nierozstrzygnięte pytania D1/D2 i rozpocznij niezależne prace Etapu 1. Nie ograniczaj się do propozycji. Aktualizuj pliki i status implementacji. Nie aktywuj niepotwierdzonych reguł biznesowych.

Kolejne etapy uruchamiaj z tym samym dokumentem i stanem repozytorium:

> Kontynuuj według `docs/IMPLEMENTATION_STATUS.md` i specyfikacji VoiceLink CRM. Sprawdź, co faktycznie wykonano. Zrealizuj kolejny nieukończony etap, uruchom jego kryteria odbioru, popraw błędy i zapisz wynik. Zachowaj działające moduły i ustalone reguły. Jeśli brak klucza zewnętrznego blokuje test live, wykonaj niezależną implementację i oznacz ten test zgodnie z prawdą.

Nie każ modelowi przepisywać całego projektu od początku po każdej odpowiedzi. Dokument stanowi stałą specyfikację, a status w repozytorium stanowi zapis postępu. Każda uzgodniona zmiana biznesowa ma aktualizować wymagania, testy i decyzje.

## 17. Oficjalne źródła do ponownej weryfikacji podczas implementacji

Poniższe źródła potwierdzają techniczne możliwości integracji i platform. Własny model CRM-a, UX i reguły naliczeń zaprojektowano dla wymagań VoiceLink; nie są one gotową funkcją dostawców. Dokumentacja i limity mogą się zmieniać.

- [Next.js: Progressive Web Applications](https://nextjs.org/docs/app/guides/progressive-web-apps) — manifest, service worker, VAPID, push i wymagania instalacji.
- [WebKit: Web Push na iOS i iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) — dodanie aplikacji na ekran początkowy i zgoda wywołana działaniem użytkownika.
- [Supabase: SSR i tworzenie klientów](https://supabase.com/docs/guides/auth/server-side/creating-a-client) — sesje cookie i rozdzielenie klientów.
- [Supabase: Storage Access Control](https://supabase.com/docs/guides/storage/security/access-control) — prywatne obiekty i polityki dostępu.
- [Supabase: Cron](https://supabase.com/docs/guides/cron) — prace cykliczne w Postgres i wywołania HTTP.
- [Supabase: pg_net](https://supabase.com/docs/guides/database/extensions/pg_net) — asynchroniczne wywołania z DB.
- [Supabase: Changelog](https://supabase.com/changelog) — m.in. ekspozycja tabel do Data API, wspierane wersje Node i zmiany SDK.
- [Fathom: indeks dokumentacji](https://developers.fathom.ai/llms.txt) — aktualne ścieżki oficjalnych referencji.
- [Fathom: lista spotkań](https://developers.fathom.ai/api-reference/meetings/list-meetings) — identyfikatory, paginacja i pola spotkań.
- [Fathom: podsumowanie](https://developers.fathom.ai/api-reference/recordings/get-summary) i [transkrypcja](https://developers.fathom.ai/api-reference/recordings/get-transcript) — uzupełnienie treści nagrania.
- [Fathom: webhooks](https://developers.fathom.ai/webhooks) — obsługa zdarzeń i weryfikacja podpisu.
- [Fathom: tworzenie webhooka](https://developers.fathom.ai/api-reference/webhooks/create-a-webhook) — ustawienia zdarzeń i treści.
- [Fathom: dostęp i limity Public API](https://help.fathom.video/en/articles/8368641) — zakres klucza użytkownika i limity żądań.
- [shadcn/ui: dokumentacja](https://ui.shadcn.com/docs) — edytowalne komponenty będące bazą customowego UI.

Stan sprawdzenia źródeł: 28 października 2026. Weryfikacja dokumentacji nie oznacza podłączenia kont VoiceLink ani przeprowadzenia testów produkcyjnych.
