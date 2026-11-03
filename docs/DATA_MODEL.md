# Model danych

Model z rozdziału 3 specyfikacji. Migracje są w `supabase/migrations` i zostały zastosowane na lokalnej bazie. Wygenerowane typy są w `src/lib/supabase/database.types.ts`.

## Zasady

Encje biznesowe mają `id` UUID, `workspace_id`, `created_at`, `updated_at`, `created_by`, `updated_by` i `version`. Archiwizacja przez `archived_at` tam, gdzie ma sens. Zdarzenie systemowe może mieć pustego autora i jawne `actor_type = system|user|integration`.

Nie ma kaskady, która kasuje historię finansową albo dokumenty razem z kontaktem. Usunięcie pliku jest osobną operacją.

Powiązane encje należą do jednego workspace. Wymuszają to złożone klucze obce `(workspace_id, id)` oraz checki albo triggery. `user_metadata` nie steruje autoryzacją.

Czas biznesowy: `Europe/Warsaw`. Chwile zdarzeń: `timestamptz`. Daty rozliczeń i zadania bez godziny: `date`. Kwoty: grosze, `bigint`.

## Tabele biznesowe

| Tabela | Rola i pola szczególne |
|---|---|
| `workspaces` | `name`, `timezone`. Jeden rekord VoiceLink |
| `workspace_members` | `workspace_id`, `user_id` → `auth.users`, `active`. Unikalna para. Członkostwo nadaje operator |
| `profiles` | `user_id`, `workspace_id`, `full_name`, opcjonalny avatar |
| `accounts` | Karta relacji: `display_name`, `kind = unknown\|company\|person`, opcjonalne `company_name`, `website`, `nip`, `address`, `relationship = prospect\|client`, `service_status = active\|inactive`, `latest_note` |
| `contacts` | `account_id`, `full_name`, e-mail prezentacyjny i znormalizowany, telefon surowy i E.164, `job_title`, `is_primary` |
| `deals` | Szansa: `account_id`, opcjonalny `primary_contact_id`, `title`, `product_type`, `stage`, `owner_user_id`, opis, kwoty oferty w groszach, `currency = PLN`, daty, `source` |
| `deal_stage_history` | Wyłącznie dopisywana historia etapu, autor i czas |
| `deployments` | Realizacja: konto, opcjonalny deal, `name`, produkt, status, opis, `owner_display_name` jako tekst, `start_on`, `due_on`, wartość informacyjna `value_gross_cents` |
| `deployment_status_history` | Historia statusu wdrożenia w obie strony. Rozdział 5.3 jej wymaga, lista tabel w 3.2 nie podaje nazwy. Tabela jest wyłącznie dopisywana |
| `deployment_checklist_items` | Ręczne pozycje, bez szablonów produktu |
| `tasks` | `kind = task\|follow_up`, status, priorytet, `due_on`, opcjonalne `due_at`, `completed_by`, powiązania, `origin_activity_id`. Puste `due_at` albo jego dzień w Europe/Warsaw równy `due_on` |
| `task_assignees` | Para zadanie–użytkownik, unikalna. Jedno zadanie dla wielu osób |
| `activities` | Oś czasu. Nie kopia transkrypcji |
| `notes` | Notatki biznesowe, oddzielne od treści Fathom |
| `meeting_records` | Kanoniczne nagranie w workspace |
| `meeting_sources` | Dostęp z konkretnego połączenia. Unikalna para connection + id nagrania |
| `meeting_participants` | Uczestnik. Dopasowanie kontaktu po e-mailu, nie po samej nazwie |
| `meeting_links` | Powiązanie spotkania z kontem i opcjonalnie dealem |
| `meeting_transcript_segments` | Segmenty. Nie są pobierane na liście spotkań |
| `documents` | Metadane pliku, status `uploading\|ready\|failed\|deleting`, kategoria `offer\|contract\|other`, `deleted_at` |
| `document_links` | Dokładnie jeden cel w wierszu. Brak wierszy = dokument ogólny |

Etapy deala, kody niezależne od etykiet: `new`, `contact_attempt`, `conversation_done`, `meeting_scheduled`, `meeting_done`, `offer_sent`, `negotiation`, `won`, `lost`.

Etapy wdrożenia: `todo`, `in_progress`, `waiting_for_client`, `testing`, `launched`, `completed`, oraz `paused` i `cancelled`.

## Finanse

| Tabela | Rola |
|---|---|
| `billing_agreements` | Zatwierdzone warunki setup albo subscription. Źródło naliczeń po wygranej |
| `revenue_entries` | Ewidencja należności. Źródło sum dashboardu. Kwoty już zapisane nie podlegają `UPDATE` |

Ograniczenia: unikalny klucz naliczenia, jeden zwykły wpis na setup i jeden na cykl, korekta wskazuje konkretny wpis, zwykłe naliczenia nieujemne. Częściowa zmiana kwoty to wycofanie starego wpisu i nowy wpis. Trzech warstw — kwot oferty, warunków i ewidencji — nie sumuje się razem.

## Tabele systemowe

W schemacie `private`, bez grantu odczytu dla `anon` i `authenticated`: `integration_connections`, `inbound_events`, `external_lead_refs`, `import_review_items`, `domain_events`, `job_queue`, `job_runs`, `push_deliveries`.

W `public`, z RLS: `notifications` tylko dla adresata, `push_subscriptions` i `notification_preferences` tylko dla właściciela, `automation_settings` do odczytu przez aktywnego członka. Zapis tych tabel nie ma polityki ani grantu dla roli zalogowanej.

`automation_settings.no_answer_window_start` i `no_answer_window_end` trzymają potwierdzone okno 09:00–15:00. Preferencje powiadomień nie uruchamiają niepotwierdzonych wysyłek D1.

Sekrety integracji nie są w kolumnach czytanych przez klienta. Payloady techniczne mają ograniczoną retencję, opisaną później w runbooku.

## Indeksy minimalne

`workspace_members(user_id, active)`, `deals(workspace_id, stage, created_at desc, id)`, `deals(account_id)`, `contacts(account_id)`, znormalizowany e-mail i telefon w workspace, `deployments(workspace_id, status, due_on)`, `tasks(workspace_id, status, due_on)`, `task_assignees(user_id, task_id)`, `activities(account_id, occurred_at desc)`, `meeting_records(workspace_id, started_at desc)`, `revenue_entries(workspace_id, effective_on)`, `notifications(recipient_user_id, created_at desc)`. Częściowe indeksy na prace oczekujące i nieprzeczytane powiadomienia.

Deduplikacja opiera się na unikalnych indeksach, nie na samym warunku w kodzie aplikacji.

Na seedzie z 29 października 2026 planner użył `deals_list_idx`, `tasks_due_idx` i `notifications_unread_idx` jako Index Scan albo Index Only Scan. Kolejka `job_queue_pending_idx` weszła jako Bitmap Index Scan. Wyszukanie e-maila przy dwóch kontaktach poszło indeksem workspace i filtrem, nie indeksem e-maila. Indeks e-maila i telefonu zostaje, bo taki jest kształt dopasowania importu, a nie dlatego, że planner wybrał go na tej próbce.

## Nazwy względem listy pól

`activity_type` jest polem typu aktywności. `meeting_record_id` jest identyfikatorem spotkania w powiązaniach. Treść segmentu transkrypcji to `segment_text`, przesunięcie to `offset_ms`. Sekret push to `auth_secret`. Kwoty umowy to `amount_gross_cents`, kwoty oferty to `setup_amount_gross_cents` i `monthly_amount_gross_cents`.

## Uprawnienia

Nowe tabele nie są wystawiane automatycznie. `anon` nie ma `SELECT`. `authenticated` ma `SELECT` tam, gdzie przechodzi RLS. `INSERT`, `UPDATE` i `DELETE` biznesowe ma tylko `service_role`, a mutacje idą przez funkcje w `private`. Jedna funkcja `SECURITY DEFINER` to `private.is_active_member`: zwraca boolean i nie czyta polityki członkostwa rekurencyjnie. Pozostałe funkcje są `SECURITY INVOKER` i odrzucają rolę inną niż serwerowa.

`private.record_no_answer` nadal wymaga jawnej daty. Ścieżka „Nie odebrał” woła `private.record_follow_up`, a dzień liczy `private.follow_up_due_on` z zegara bazy i okna workspace. Od poniedziałku do piątku, w godzinach okna włącznie z 15:00:00, termin jest dzisiaj. Po końcu okna jest to najbliższy dzień poniedziałek–piątek. Przed początkiem okna, w sobotę i w niedzielę wynik jest pusty i zapis wymaga wpisanej daty. Święta nie są rozpoznawane. Follow-up ma jednego przypisanego: osobę, która kliknęła. `due_at` zostaje puste. Powtórka tego samego klucza zwraca istniejące zadanie.

Bucket `documents` jest prywatny. Limit produktu to 25 MB, a globalny limit Storage to 50MiB. Dozwolone typy i limit są w `automation_settings.document_mime_types` oraz `document_max_bytes`. Ścieżka to `workspace/UUID/UUID`. `private.begin_document_upload` tworzy rekord `uploading`. `private.complete_document_upload` ustawia `ready` tylko przy zgodnym rozmiarze i typie. Niezgodność nie zostawia gotowego pliku. `private.begin_document_delete` ustawia `deleting`, a `private.finish_document_delete` dopisuje `deleted_at` dopiero po usunięciu obiektu. `private.list_stale_document_uploads` zwraca niedokończone wysyłki starsze niż podany odstęp. Adres podpisany nie jest kolumną dokumentu.

`private.save_task` zapisuje jedno zadanie i wymienionych przypisanych. `private.complete_task` ustawia `done`, `completed_at` i `completed_by`. Zdarzenia to `task.assigned`, `task.due_changed`, `task.status_changed` i `task.completed`. Wejście w `done` emituje `task.completed`. Wyjście z `done` emituje `task.status_changed` i czyści pola wykonania. Te funkcje nie zapisują wierszy w `notifications`. Poranne podsumowanie powstaje osobno, w `private.build_morning_digest`, i tylko dla zadań na wskazany dzień.

Zapis ręczny etapu 3 też idzie przez `private`: lead, kontakt, szansa, etap, opiekun, wynik kontaktu, notatka, zadanie, archiwum i scalenie. Widoki `lead_directory` i `client_directory` mają `security_invoker` i `SELECT` dla `authenticated`. Zmiana `account_id` w przychodzie przechodzi tylko, gdy na czas scalenia ustawione jest `private.merge_accounts = on`. Pozostałe pola przychodu zostają niemutowalne.

Otwarcie karty firmy albo szansy woła `private.catch_up_due_revenue`. Funkcja dopisuje zaległe cykle umów tej firmy i przy drugim wywołaniu nie dodaje wierszy. Przyszły cykl nie wchodzi do sumy na dziś. Worker woła osobno `private.catch_up_account_worker`, bez członkostwa osoby otwierającej kartę. Harmonogram tego wywołania nie jest zapisany w migracji.

`public.push_subscriptions` ma kolumny `active` i `device_label`. Ten sam endpoint może zmienić właściciela, gdy telefon przechodzi na drugie konto. `private.worker_ticks` trzyma ostatni tik. `private.enqueue_worker_jobs` dokłada digest bieżącego dnia warszawskiego, jedno dobicie przychodu na firmę i dzień oraz odpytanie Fathom w koszyku interwału. Nie dogania pominiętych dni. `private.worker_status` mówi, czy ostatni tik skończył się poprawnie w ciągu około trzech minut. Dashboard nadal dostaje z `dashboard_snapshot` stałe `worker_running = false` i ostrzeżenie bierze z tiku.

Dashboard woła `private.dashboard_snapshot`. Sumy przychodu biorą się z `revenue_entries` przez `private.period_revenue_filtered`, a nie z ofert ani wartości wdrożeń. Korekta wchodzi do serii pozycji, którą odwraca. `private.list_period_revenue` zwraca te same pozycje i tę samą sumę. Widok `lead_directory` ma dodatkowo `won_at`, `lost_at` i `source`, żeby lista szans dała się zawęzić do zakresu z dashboardu.

Wdrożenie zapisują `private.create_deployment`, `private.update_deployment` i `private.change_deployment_status`. Deal musi być wygrany i należeć do tej samej firmy. Opiekun jest tekstem. Zmiana statusu dopisuje historię i zdarzenie `deployment.status_changed`. Zakończenie ustawia `completed_at`, każdy inny status je czyści. Te funkcje nie zapisują wpisów przychodu.

Odbiór n8n woła `private.import_lead`. Powtórka tego samego zdarzenia zwraca wcześniejszy wynik. Równoległy zapis z tym samym `event_id` nie tworzy drugiego leada. `private.resolve_import_review` dopina albo odrzuca zgłoszenie i nie zmienia e-maila ani telefonu kontaktu. `private.note_integration_receipt` zapisuje stan połączenia `n8n_leads` i nazwę zmiennej sekretu, nie jego wartość. Jedno połączenie n8n na workspace wymusza częściowy indeks `provider = n8n_leads`.

Spotkanie Fathom jest jedno na `recording_id` w workspace. Dokumentacja Fathom z 30.10.2026 nie opisuje osobnej przestrzeni identyfikatorów na konto, więc drugi dostęp to wiersz `meeting_sources`, a nie drugi rekord. Tytuł nie scala spotkań. `assignment_mode = manual` blokuje dopisywanie automatycznego powiązania. Notatka z `meeting_record_id` nie jest treścią dostawcy. Limit API z tej samej dokumentacji to 60 żądań na 60 sekund, a żądania z podsumowaniem albo transkrypcją mają osobny limit 30 na 60 sekund. Odstęp uzupełniania jest w `automation_settings.fathom_poll_interval_minutes`, domyślnie 15.
