# Webhook leadów n8n

CRM przyjmuje jeden lead na żądanie. Nie czyta arkusza Google. Workflow n8n buduje operator. Ten dokument jest kontraktem endpointu.

## Adres

`POST {APP_URL}/api/integrations/n8n/leads`

Przykład lokalny: `http://127.0.0.1:3001/api/integrations/n8n/leads`

Autoryzacja: `Authorization: Bearer <token>`. Token jest w `N8N_LEADS_WEBHOOK_TOKEN` na serwerze. Ekran ustawień pokazuje tylko, czy token jest ustawiony. Nie wklejaj wartości do repozytorium, czatu ani payloadu.

Workspace bierze się z `N8N_LEADS_WORKSPACE_ID`. W treści żądania go nie ma.

## Treść v1

Nieznane pola są ignorowane. `lead_status`, `QUALIFIED` i `UNQUALIFIED` z arkusza nie zmieniają etapu. Litery kolumn N, O i Q pochodzą z jednego zrzutu ekranu i nie są kontraktem.

```json
{
  "schema_version": 1,
  "event_id": "0190example-event",
  "source": "google_sheets_form",
  "source_record_id": "sheet-row-1",
  "is_test": false,
  "contact": {
    "full_name": "Anna Przykładowa",
    "email": "anna@example.com",
    "phone": "p:+48500100200"
  }
}
```

`event_id` i `source_record_id` są wymagane. Nagłówek `Idempotency-Key` ma być równy `event_id`.

Pusty e-mail przy poprawnym telefonie albo pusty telefon przy poprawnym e-mailu jest przyjęty. Brak obu kanałów albo zły format trafia do decyzji w ustawieniach i nie tworzy leada. `@example.com` nie jest testem. Testem jest tylko `is_test: true`; taki rekord jest zapisany jako próba i nie tworzy karty.

Normalizacja e-maila i telefonu jest w bazie. Numer lokalny bez prefiksu kraju nie dostaje dopisanego `+48`.

## Odpowiedzi

| Kod | Znaczenie |
|---|---|
| 201 | Nowy lead |
| 200 | Powtórka tego samego zdarzenia, duplikat źródła albo test |
| 202 | Zapisane do decyzji. n8n traktuje to jako przyjęcie, nie jako retry |
| 400 / 422 | Zła treść. Popraw payload, nie powtarzaj w kółko |
| 401 | Zły token |
| 409 | Ten sam `event_id` z inną treścią |
| 413 | Treść większa niż limit, domyślnie 32 KB |
| 429 | Limit żądań. Czekaj tyle sekund, ile mówi `Retry-After` |
| 503 | Baza albo brak konfiguracji. Można powtórzyć |

Każdy błąd ma `code`, polski `message` i `correlation_id`.

Powtórka po utraconej odpowiedzi używa tego samego `event_id`, `source_record_id` i `Idempotency-Key`. Nowe zdarzenie dla tego samego wiersza arkusza nie tworzy drugiego leada i nie cofa telefonu ani e-maila zmienionego w CRM.

Retry w n8n: sieć, 429 i chwilowe 5xx, z rosnącą przerwą. Każdy 2xx, także 202, kończy próbę. 4xx wymaga poprawy treści.

## Przykład

```bash
curl -sS -D - \
  -H "Authorization: Bearer $N8N_LEADS_WEBHOOK_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 0190example-event" \
  -d '{"schema_version":1,"event_id":"0190example-event","source":"google_sheets_form","source_record_id":"sheet-row-1","contact":{"full_name":"Anna Przykładowa","email":"anna@example.com","phone":"p:+48500100200"}}' \
  "$APP_URL/api/integrations/n8n/leads"
```

## Mapowanie w n8n

Węzeł HTTP Request: metoda POST, adres z ustawień CRM, uwierzytelnienie nagłówkiem Bearer. `event_id` bierz ze stabilnego identyfikatora wykonania albo wiersza i wstaw ten sam tekst do `Idempotency-Key`. `source_record_id` to trwały identyfikator wiersza, nie numer kolejny, który arkusz może zmienić. Imię, e-mail i telefon mapuj z kolumn formularza po nazwie pola, nie po literze kolumny.

Limit techniczny to `N8N_LEADS_RATE_LIMIT` żądań na 60 sekund z jednego adresu, domyślnie 60. To nie jest reguła biznesowa.
