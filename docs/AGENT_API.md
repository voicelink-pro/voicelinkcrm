# VoiceLink CRM — Agent REST API (`/api/v1`)

REST API do pełnej obsługi CRM przez agentów AI i automatyzacje: leady i zmiana statusów, klienci, statusy wdrożeń, integracje, kontakty, notatki oraz zadania.

## Autoryzacja i aktor

Klucze API generuje się w ekranie **Ustawienia → Klucze API dla Agenta AI** (`/settings`).

Każdy klucz:
- jest przypisany do **istniejącego, aktywnego członka zespołu** i wykonuje wszystkie operacje w jego imieniu (widoczne w historii etapów, notatkach, zadaniach i audycie);
- ma postać `vlc_live_<losowy_token>` i jest pokazywany tylko raz w momencie utworzenia (w bazie zapisywany jest wyłącznie skrót SHA-256);
- przestaje działać natychmiast po unieważnieniu, wygaśnięciu lub dezaktywacji członka zespołu.

Przekaż klucz w jednym z nagłówków:

```http
Authorization: Bearer vlc_live_...
```

lub:

```http
X-API-Key: vlc_live_...
```

Wszystkie odpowiedzi zwracają `Content-Type: application/json`, `Cache-Control: no-store` oraz nagłówek `x-correlation-id`.

### Format odpowiedzi

Sukces pojedynczego obiektu:
```json
{
  "data": { "...": "..." },
  "correlation_id": "uuid"
}
```

Sukces listy:
```json
{
  "data": [ "..." ],
  "meta": { "total": 42, "limit": 50, "offset": 0 },
  "correlation_id": "uuid"
}
```

Błąd:
```json
{
  "error": {
    "code": "validation_error",
    "message": "Opis błędu po polsku.",
    "details": { "fields": { "stage": "..." } }
  },
  "correlation_id": "uuid"
}
```

### Optymistyczne blokowanie (`version`)

W żądaniach `PATCH` pole `version` jest **opcjonalne**:
- jeśli podasz `version`, serwer sprawdzi zgodność i w razie równoczesnej edycji zwróci `409 version_conflict`;
- jeśli nie podasz `version`, serwer użyje aktualnej wersji rekordu i bezpiecznie wykona częściową aktualizację tylko przesłanych pól.

---

## 1. Tożsamość, zespół i wyszukiwanie

### `GET /api/v1/me`
Zwraca dane aktywnego klucza, członka zespołu (aktora), `workspace_id` oraz słowniki dopuszczalnych kodów (`deal_stages`, `implementation_stages`, `product_types`, `task_statuses`, `task_priorities`).

### `GET /api/v1/members`
Lista aktywnych członków zespołu (`user_id`, `full_name`, `role`, `is_current_actor`). Użyj `user_id` przy przypisywaniu leadów i zadań.

### `GET /api/v1/search?q=fraza&limit=10`
Globalne wyszukiwanie w grupach: `clients`, `contacts`, `leads`, `tasks`.

---

## 2. Leady (`deals`)

Dopuszczalne kody etapów (`stage`):
`new`, `contact_attempt`, `conversation_done`, `warming`, `meeting_scheduled`, `meeting_done`, `offer_sent`, `negotiation`, `unqualified`, `client` (automatycznie oznacza konto jako klienta), `lost` (wymaga `lost_reason`), `won` (wyłącznie przez `/finalize`).

Dopuszczalne typy produktu (`product_type`):
`voice_assistant`, `website`, `digital_infrastructure`.

### `GET /api/v1/leads`
Parametry query:
- `q` — wyszukiwanie po tytule, firmie, kontakcie, e-mailu, telefonie
- `stage` — filtr po etapie
- `product_type` — filtr po produkcie
- `owner_user_id` — UUID, `me` (właściciel klucza) lub `none`
- `source` — filtr po źródle
- `archived` — `true` aby uwzględnić archiwalne
- `sort` — `created_at` (domyślnie), `title`, `stage`, `last_contact_at`, `next_follow_up_on`, `won_at`, `lost_at`
- `dir` — `asc` lub `desc`
- `limit` (1..200, domyślnie 50), `offset` lub `page`

### `POST /api/v1/leads`
Tworzy nowego leada (konto + kontakt + szansa). Opcjonalnie od razu ustawia etap i dodaje pierwszą notatkę.

```json
{
  "full_name": "Anna Nowak",
  "company_name": "Klinika Zdrowy Uśmiech",
  "email": "anna@klinika.pl",
  "phone": "+48500100200",
  "title": "Asystent głosowy — recepcja",
  "product_type": "voice_assistant",
  "owner_user_id": null,
  "stage": "contact_attempt",
  "note": "Lead polecony z rozmowy telefonicznej.",
  "confirm_duplicate": false
}
```
Jeśli istnieje już kontakt z takim samym e-mailem lub telefonem, API zwróci `409 possible_duplicate` (chyba że przekazano `"confirm_duplicate": true`).

### `GET /api/v1/leads/:dealId`
Pełna karta leada: `deal`, `account`, `contacts`, `stage_history`, `activities`, `notes`, `tasks`.

### `PATCH /api/v1/leads/:dealId`
Częściowa aktualizacja leada. Możesz przesłać dowolny podzbiór pól:
```json
{
  "title": "Nowy tytuł szansy",
  "product_type": "voice_assistant",
  "description": "Ustalenia po rozmowie",
  "owner_user_id": "uuid-czlonka-zespolu",
  "stage": "offer_sent",
  "lost_reason": null,
  "archived": false
}
```

### `PATCH /api/v1/leads/:dealId/stage` (alias: `POST`)
Dedykowany endpoint do szybkiej zmiany statusu leada:
```json
{
  "stage": "meeting_scheduled"
}
```
Dla `stage: "lost"` wymagane jest pole `"lost_reason"`.

### `POST /api/v1/leads/:dealId/outcomes`
Rejestruje wynik kontaktu. Dla `"outcome": "no_answer"` automatycznie tworzy zadanie follow-up (w oknie 09:00–15:00 pn–pt lub z podaną datą `due_on`).
```json
{
  "outcome": "no_answer",
  "due_on": "2026-11-25",
  "summary": "Nie odbiera, spróbować jutro rano"
}
```
Dozwolone `outcome`: `no_answer`, `conversation`, `other`.

### `POST /api/v1/leads/:dealId/finalize`
Finalizuje wygranego leada (ustawia etap `won`, relację `client` i nalicza przychód w groszach):
```json
{
  "setup_amount_cents": 300000,
  "setup_on": "2026-11-23",
  "monthly_amount_cents": 100000,
  "subscription_starts_on": "2026-12-01",
  "subscription_ends_on": null
}
```

---

## 3. Klienci i kontakty (`accounts`, `contacts`)

### `GET /api/v1/clients`
Parametry query:
- `relationship` — `client` (domyślnie), `prospect` lub `all`
- `service_status` — `active` lub `inactive`
- `implementation_stage` — filtr po etapie wdrożenia
- `q` — wyszukiwanie po nazwie, firmie, NIP
- `archived` — `true` aby uwzględnić archiwalne
- `limit`, `offset` / `page`

### `POST /api/v1/clients`
Dodaje nowego klienta (wraz z głównym kontaktem i opcjonalnymi danymi wdrożenia):
```json
{
  "display_name": "Gabinet Stomatologiczny ProDent",
  "company_name": "ProDent Sp. z o.o.",
  "full_name": "Jan Kowalski",
  "email": "jan@prodent.pl",
  "phone": "+48600700800",
  "nip": "5250001122",
  "implementation_stage": "todo",
  "implementation_due_on": "2026-12-15",
  "integration_systems": "ZnanyLekarz, Google Calendar"
}
```

### `GET /api/v1/clients/:accountId`
Pełna karta klienta: `account`, `contacts`, `deals`, `notes`, `tasks`.

### `PATCH /api/v1/clients/:accountId`
Częściowa aktualizacja danych klienta, statusu obsługi, wdrożenia, integracji lub archiwizacji:
```json
{
  "display_name": "ProDent Warszawa",
  "nip": "5250001122",
  "website": "https://prodent.pl",
  "address": "ul. Marszałkowska 1, Warszawa",
  "service_status": "active",
  "implementation_stage": "in_progress",
  "implementation_due_on": "2026-12-20"
}
```

### `POST /api/v1/clients/:accountId/contacts`
Dodaje kontakt do klienta (`full_name`, `email?`, `phone?`, `job_title?`, `is_primary?`, `confirm_duplicate?`).

### `PATCH /api/v1/contacts/:contactId`
Częściowa aktualizacja lub archiwizacja kontaktu (`full_name`, `email`, `phone`, `job_title`, `is_primary`, `archived`).

### `POST /api/v1/clients/:accountId/deals`
Dodaje kolejną szansę sprzedażową do istniejącego klienta (`title`, `product_type?`, `primary_contact_id?`, `owner_user_id?`).

---

## 4. Statusy wdrożeń i integracji

Dopuszczalne etapy wdrożenia (`implementation_stage`):
`todo`, `in_progress`, `waiting_for_client`, `testing`, `launched`, `completed`, `paused`.

Dopuszczalne statusy dokumentacji integracyjnej (`integration_docs_status`):
`missing`, `partial`, `complete`.

### `GET /api/v1/deployments`
Lista klientów we wdrożeniu. Parametry query: `stage`, `overdue=true`, `q`, `limit`, `offset`.

### `GET /api/v1/deployments/:accountId`
Szczegóły wdrożenia i integracji wybranego klienta.

### `PATCH /api/v1/deployments/:accountId`
Aktualizuje status/termin/notatki wdrożenia oraz/lub dane integracji bez nadpisywania nieprzesłanych pól:
```json
{
  "stage": "testing",
  "due_on": "2026-12-10",
  "notes": "Konfiguracja numeru SIP zakończona, testy w toku.",
  "integration_systems": "Cal.com, Make",
  "integration_docs_status": "complete"
}
```

### `PATCH /api/v1/clients/:accountId/implementation` (alias: `POST`)
Dedykowana aktualizacja sekcji wdrożenia (`stage` lub `implementation_stage`, `due_on` lub `implementation_due_on`, `notes` lub `implementation_notes`).

### `PATCH /api/v1/clients/:accountId/integration` (alias: `POST`)
Dedykowana aktualizacja sekcji integracji (`systems` lub `integration_systems`, `docs_status` lub `integration_docs_status`, `notes` lub `integration_notes`).

---

## 5. Notatki (`notes`)

### `GET /api/v1/notes`
Parametry query: `account_id`, `deal_id`, `limit`, `offset`.

### `POST /api/v1/notes`
Dodaje notatkę. Wystarczy podać `account_id` albo samo `deal_id` (API automatycznie przypisze `account_id` powiązanego konta):
```json
{
  "deal_id": "uuid-leada",
  "body": "Klient prosił o przesłanie wyceny do piątku."
}
```

### `GET /api/v1/notes/:noteId`
Pobiera pojedynczą notatkę.

### `PATCH /api/v1/notes/:noteId`
Edytuje treść notatki (`{"body": "Zaktualizowana treść"}`).

### `DELETE /api/v1/notes/:noteId`
Usuwa notatkę.

---

## 6. Zadania (`tasks`)

Dopuszczalne wartości:
- `status`: `todo`, `in_progress`, `done`, `cancelled`
- `priority`: `low`, `normal`, `high`

### `GET /api/v1/tasks`
Parametry query:
- `view` — `open` (domyślnie), `today`, `overdue`, `upcoming`, `done`, `all`
- `status` — filtr po statusie
- `priority` — filtr po priorytecie
- `assignee` — `me`, `all` lub UUID członka zespołu
- `account_id`, `deal_id` — powiązanie z klientem / leadem
- `q` — wyszukiwanie po tytule
- `archived` — `true` aby uwzględnić archiwalne
- `limit`, `offset` / `page`

### `POST /api/v1/tasks`
Tworzy zadanie. Jeśli nie podasz `assignee_ids`, zadanie zostanie przypisane automatycznie do członka zespołu będącego właścicielem klucza.
```json
{
  "title": "Przygotować ofertę dla ProDent",
  "description": "Uwzględnić 2 linie telefoniczne i integrację z kalendarzem.",
  "due_on": "2026-11-26",
  "due_time": "14:00",
  "priority": "high",
  "status": "todo",
  "account_id": "uuid-klienta",
  "deal_id": "uuid-leada",
  "assignee_ids": ["uuid-czlonka-zespolu"]
}
```

### `GET /api/v1/tasks/:taskId`
Szczegóły zadania wraz z `assignee_ids`, `account_name`, `deal_title` i `version`.

### `PATCH /api/v1/tasks/:taskId`
Częściowa aktualizacja zadania (nieprzesłane pola pozostają bez zmian):
```json
{
  "status": "in_progress",
  "priority": "high",
  "due_on": "2026-11-28"
}
```

### `POST /api/v1/tasks/:taskId/complete`
Szybkie oznaczenie zadania jako ukończone (`status: "done"`).

### `DELETE /api/v1/tasks/:taskId`
Archiwizuje zadanie.

---

## Szybki test `curl`

```bash
# 1. Sprawdzenie klucza i tożsamości aktora
curl -sS -H "Authorization: Bearer $VOICELINK_API_KEY" \
  "$APP_URL/api/v1/me"

# 2. Zmiana statusu leada
curl -sS -X PATCH \
  -H "Authorization: Bearer $VOICELINK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"stage":"meeting_scheduled"}' \
  "$APP_URL/api/v1/leads/<DEAL_ID>/stage"

# 3. Zmiana etapu wdrożenia klienta
curl -sS -X PATCH \
  -H "Authorization: Bearer $VOICELINK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"stage":"testing","due_on":"2026-12-10"}' \
  "$APP_URL/api/v1/deployments/<ACCOUNT_ID>"

# 4. Dodanie zadania
curl -sS -X POST \
  -H "Authorization: Bearer $VOICELINK_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"Zadzwonić po feedback","due_on":"2026-11-26","priority":"high"}' \
  "$APP_URL/api/v1/tasks"
```
