# Status implementacji

Data sprawdzenia: 29 października 2026.

## Etap 0 — rozpoznanie i decyzje

Zrobione.

- Katalog nie miał aplikacji, gita, Supabase ani logo. Node 26.12.1, pnpm 10.33.4, Docker dostępny. CLI Supabase zostało doinstalowane (2.122.0). Projekt Vercel niepodłączony.
- Zweryfikowano dokumentację Next.js 16.4.3 (`proxy.ts`, runtime Node), Supabase SSR (`getClaims`, klucze publishable/secret) oraz wersje Vercel Node 24.x / 22.x.
- Zapisano `docs/REQUIREMENTS.md`, `docs/DECISIONS.md` i `docs/DATA_MODEL.md`.
- D1 i D2 pozostają otwarte. Żadna niepotwierdzona wysyłka ani ukryty termin follow-upu nie zostały włączone.

## Etap 1 — powłoka, logowanie i design system

Kod etapu jest w repozytorium. Odbiór logowania nie jest zamknięty. Jedno wejście Anny sprawdzono hasłem tymczasowym, które potem zastąpiono losowym hashem. Bartek, wygaśnięcie sesji, wylogowanie i nawigacja klawiaturą nie są zaliczone. Seed nadal nie zawiera znanego hasła.

Zrobione:

- Next.js 16.4.3, React 19.3.0, TypeScript strict, Tailwind 4, pnpm.
- Klienci Supabase: przeglądarka, serwer, administrator z `server-only`.
- Logowanie, reset hasła, callback, wylogowanie, `returnTo` tylko jako ścieżka wewnętrzna.
- Proxy odświeża sesję przez `getClaims` i kieruje niezalogowanego z głębokiej trasy na logowanie.
- Konto bez zweryfikowanego członkostwa nie dostaje powłoki CRM. Brak tabel członkostwa też blokuje dane.
- Tokeny VoiceLink, sidebar, nagłówek, breadcrumb, nawigacja mobilna, komponenty shadcn oraz jawny stan „jeszcze niezaimplementowane” na siedmiu modułach, w powiadomieniach i ustawieniach.
- Ekrany CRM i auth są dynamiczne. Odpowiedzi mają `Cache-Control: no-store`.

Testy uruchomione:

| Sprawdzenie | Wynik |
|---|---|
| `pnpm test` | 6/6, ścieżki `returnTo` |
| `pnpm lint` | przechodzi |
| `pnpm typecheck` | przechodzi |
| `pnpm build` | przechodzi; trasy CRM i auth są dynamiczne |
| Wejście bez sesji na `/clients/test-id` | 307 na `/login?returnTo=%2Fclients%2Ftest-id`, bez danych CRM |
| HTML logowania | brak sekretów serwerowych |
| Login 390×844 i 1440×900 | brak poziomego overflow |

Niezaliczone przy odbiorze powłoki:

- logowanie obu członków na haśle nadanym przez operatora;
- wygaśnięcie sesji i wylogowanie na żywym koncie;
- nawigacja klawiaturą po powłoce CRM.

Odmowa obcemu użytkownikowi na Data API jest sprawdzona w etapie 2.

## Etap 2 — baza, RLS i funkcje domenowe

Zrobione na lokalnej bazie.

- Migracje: tożsamość, tabele biznesowe, tabele techniczne w `private`, RLS z jawnymi grantami, funkcje transakcyjne.
- Import leada, „Nie odebrał” z jawną datą, finalizacja, naliczenia, korekta, zamiana kwoty, koniec abonamentu, zmiana przyszłej kwoty i cofnięcie finalizacji.
- Seed fikcyjny na 29 października 2026. Wygrana gabinetu ma sumę 500000 groszy (setup 300000 z 10 września oraz cykle 20 września i 20 października po 100000). Hasła kont seeda są losowe.
- Typy bazy podpięte do klientów Supabase. Kody błędów bazy mają polskie komunikaty w `src/lib/database/errors.ts` i nie zwracają SQL.

Testy uruchomione:

| Sprawdzenie | Wynik |
|---|---|
| `psql -f tests/integration/stage2.sql` | przechodzi i robi rollback |
| Data API, klucz anon, `GET /accounts` | 401, brak odczytu |
| JWT członka Anny | 200, dwa konta i własne powiadomienie |
| JWT użytkownika spoza workspace | 200, puste listy kont i powiadomień |
| JWT członka na schemacie `private` i `import_lead` | 403 |
| Rola serwerowa, `import_lead` z flagą testu | 200, `ignored_test`, bez leada; wiersz próby usunięty |
| `pnpm test` | 10/10 |
| `pnpm typecheck` | przechodzi |
| `pnpm lint` | przechodzi |

Niezaliczone:

- logowanie obu członków na żywym haśle, bo seed nie zawiera znanego hasła;
- wygaśnięcie sesji i wylogowanie na żywym koncie;
- nawigacja klawiaturą po powłoce CRM.

D1 i D2 pozostają wyłączone. Funkcja follow-upu nie wymyśla daty.

## Etap 3 — ręczny CRM

Zrobione lokalnie: listy i karty leadów oraz klientów, zapis przez funkcje serwerowe, historia etapu, archiwum, ręczne scalenie i odświeżenie po zmianie w bazie.

- Migracja `20261029163821_crm_manual_writes.sql`: tworzenie leada bez firmy, drugi kontakt i druga szansa, zmiana etapu bez drogi na „wygrany”, przegrana z powodem, wynik kontaktu z jawną datą, notatka, zadanie z karty, archiwum i scalenie kont.
- Scalenie przenosi powiązania. Przychód zmienia `account_id` tylko przy włączonym `private.merge_accounts`. Kwoty zostają.
- Listy to widoki `lead_directory` i `client_directory` z RLS wywołującego. Realtime obejmuje tabele karty; przeglądarka woła `router.refresh()`.
- Brak kwoty i brak firmy pokazują „Nie uzupełniono”. Dokumenty na karcie mówią, że moduł nie jest zbudowany. Finalizacji nie ma w formularzu etapu.
- W lokalnej bazie, po sprawdzeniu w przeglądarce, jest dodatkowy lead „Marek Bez Firmy”. `supabase db reset` wraca do seeda.

Testy uruchomione:

| Sprawdzenie | Wynik |
|---|---|
| `psql -f tests/integration/stage3.sql` | przechodzi i robi rollback |
| `pnpm test` | 13/13 |
| `pnpm typecheck` | przechodzi |
| `pnpm lint` | przechodzi |
| Logowanie Anny i lista leadów | filtr etapu zostaje w adresie, karta wraca z `returnTo` |
| Nowy lead bez firmy | karta pokazuje firmę jako „Nie uzupełniono”, historia ma aktora i czas |
| Lista klientów i karta gabinetu | przychód 5000,00 zł tylko do odczytu, wdrożenie i spotkanie bez formularza finalizacji |
| Szerokość 1280 i 625 | tabela leadów oraz karta mobilna z etapem i przyciskiem otwarcia |

Niezaliczone w przeglądarce:

- drugi kontakt i druga szansa, konflikt wersji, archiwum i scalenie — pokryte testem SQL, nie kliknięte w UI;
- kanban i druga sesja realtime;
- logowanie Bartka, wygaśnięcie sesji, wylogowanie i nawigacja klawiaturą.

D1 i D2 pozostają wyłączone.

## Etap 4 — webhook n8n

Zrobione lokalnie: `POST /api/integrations/n8n/leads`, kontrakt w `docs/API.md`, review w ustawieniach. Żywy workflow n8n nie był podłączony. Token jest tylko w `.env.local`.

- Import idzie przez `private.import_lead`. Powtórka zwraca wcześniejszy wynik. Równoległe żądanie z tym samym `event_id` zostawia jednego leada.
- Zły kontakt i pusty kontakt dostają 202 i wiersz do decyzji. `is_test` nie tworzy karty. Zły token to 401, zła treść 422, inny skrót tego samego zdarzenia 409, za duża treść 413, limit 429 z `Retry-After`.
- Ustawienia pokazują adres, stan i liczniki. Wartości tokenu nie ma na ekranie. Powiązanie i odrzucenie nie zmieniają telefonu istniejącego kontaktu.
- W lokalnej bazie zostały leady z curla: Nina Import, Ola Równoległa, Iga Równoległa, Ela Równoległa oraz otwarte zgłoszenie „Zly Numer”. `supabase db reset` wraca do seeda.

Testy uruchomione:

| Sprawdzenie | Wynik |
|---|---|
| `psql -f tests/integration/stage4.sql` | przechodzi i robi rollback |
| `pnpm test` | 19/19 |
| `pnpm typecheck` | przechodzi |
| `pnpm lint` | przechodzi |
| Ten sam payload 10 razy | pierwszy 201, kolejne 200, ten sam `lead_id` |
| Dwa równoległe żądania, dwa zdarzenia | za każdym razem jeden lead, odpowiedzi 201 i 200 |
| Nowy `event_id` tego samego wiersza po zmianie telefonu | 200 duplicate, telefon zostaje `+48500999111`, jedna szansa |
| Zły telefon, pusty kontakt, `is_test`, zły token, zła wersja, inny klucz, za duża treść, limit | 202, 202, 200, 401, 422, 422, 409, 413, 429 |
| Ustawienia 1280 | adres webhooka, „token ustawiony”, odrzucenie „Pusty Kontakt”, powiązanie Ewy z kawiarnią |
| Leady 1280 i 390 | Nina Import na liście, 7 szans, brak poziomego overflow na 390 |

Niezaliczone:

- żywy workflow n8n;
- 503 przy wyłączonej bazie nie było symulowane; brak tokenu jest sprawdzony testem jednostkowym konfiguracji, nie przez zdjęcie zmiennej z działającego serwera;
- druga sesja realtime po imporcie nie była otwarta;
- logowanie Bartka, wygaśnięcie sesji, wylogowanie i nawigacja klawiaturą.

D1 i D2 pozostają wyłączone.

## Etap 5 — finalizacja i przychód

Zrobione lokalnie. Wygranie jest osobnym formularzem i woła `private.finalize_deal`. Okresowy worker zostaje w etapie 11. Otwarcie karty dopisuje zaległe cykle przez `private.catch_up_due_revenue`.

- Formularz pokazuje produkt, firmę i kontakt, przyjmuje jawne zero, datę opłaty jednorazowej z dniem wygranej oraz start abonamentu tylko wtedy, gdy kwota miesięczna jest większa od zera. Koniec jest opcjonalny i ma zdanie „Od tego dnia nie naliczaj kolejnych opłat”.
- Podgląd bierze daty z `private.subscription_cycle_date`. Krótki miesiąc jest opisany na formularzu. Przyszły cykl ma stan „nie wchodzi do przychodu dzisiaj”.
- Karta szansy i karta firmy rozdzielają ofertę, warunki umowy, przychód do dziś (opłata jednorazowa, abonament, korekty) i wartość wdrożenia. Wdrożenie nie wchodzi do sumy. Pusta oferta to „Nie uzupełniono”.
- Na karcie wygranej są koniec abonamentu, zmiana przyszłej kwoty, korekta wpisu i cofnięcie finalizacji. Lista cykli do zmiany kwoty pomija dzień startu, bo funkcja SQL go odrzuca. Ten filtr doszedł po kliknięciu i nie był sprawdzony drugim otwarciem formularza.

Testy uruchomione:

| Sprawdzenie | Wynik |
|---|---|
| `psql -f tests/integration/stage5.sql` | przechodzi i robi rollback; dogonienie dopisuje jeden cykl, drugie wywołanie zwraca 0; gabinet ma 500000 groszy, wdrożenie 300000 |
| `pnpm test` | 21/21 |
| `pnpm typecheck` | przechodzi |
| `pnpm lint` | przechodzi |
| Karta gabinetu | przychód do dziś 5000,00 zł (3000 + 2000 + 0), wartość wdrożenia 3000,00 zł poza przychodem, oferta 3000 i 1000, trzy wpisy, bez listopada |
| Szansa kawiarni | zero jednorazowo i 1000 od 20 listopada 2026; podgląd od 20 listopada jest poza dzisiejszym przychodem; po zapisie suma wynosi 0,00 zł |
| Cofnięcie tej szansy | etap wraca do „Rozmowa odbyta”, lista klientów ma jednego klienta |
| Szerokość 390 na karcie wygranej | brak poziomego overflow |

Niezaliczone w przeglądarce:

- koniec abonamentu, zmiana przyszłej kwoty i korekta kwoty — formularze są na karcie, zapis pokrywa test SQL etapu 2, nie był kliknięty;
- powtórka finalizacji z tymi samymi warunkami nie była kliknięta;
- worker naliczeń, druga sesja realtime, logowanie Bartka, wygaśnięcie sesji, wylogowanie i nawigacja klawiaturą.

Po tym sprawdzeniu szansa kawiarni jest z powrotem otwarta, a firma jest prospektem. Zostały unieważnione umowy, odwrócony wpis zera oraz kwoty oferty 0 i 1000 groszy na szansie, bo cofnięcie nie czyści skopiowanej oferty. Historia etapów zostaje. `supabase db reset` wraca do seeda.

D1 i D2 pozostają wyłączone.

## Etap 6 — wdrożenia

Zrobione lokalnie. Lista, karta i zapis wdrożenia nie zmieniają ewidencji przychodu. Powiadomienia ze zdarzenia statusu zostają na później, gdy reguły D1 będą zatwierdzone.

- Lista domyślnie pokazuje otwarte realizacje, z przełącznikiem „Wszystkie”, filtrami statusu, produktu, tekstowego opiekuna i terminu oraz sortowaniem.
- Opóźnienie to otwarte wdrożenie z terminem wcześniejszym niż dzisiaj. Brak terminu nie jest opóźnieniem. „Oczekuje na klienta” i „Opóźnione” są osobnymi oznaczeniami, bez kolorowania całego wiersza.
- Formularz ręczny oraz adres z wygranej szansy wymagają zatwierdzenia. Wartość skopiowana z opłaty jednorazowej jest opisana jako informacyjna. Wdrożenie bez deala ma zdanie, że nie zasila statystyk przychodu.
- Karta ma wspólne statusy w obie strony, ręczną checklistę, historię, zadania i informację, że moduł dokumentów nie jest zbudowany. Zakończenie zapisuje datę, ponowne otwarcie ją czyści.
- Opiekun jest tekstem. Nie jest wyborem użytkownika i nie tworzy powiadomienia.

Testy uruchomione:

| Sprawdzenie | Wynik |
|---|---|
| `psql -f tests/integration/stage6.sql` | przechodzi i robi rollback; trzy produkty jednego deala, opiekun spoza zespołu, brak terminu, termin przeszły, obca firma odrzucona, otwarty deal odrzucony, zakończenie i ponowne otwarcie, checklista; przychód gabinetu zostaje 500000 groszy |
| `pnpm test` | 24/24 |
| `pnpm typecheck` | przechodzi |
| `pnpm lint` | przechodzi |
| Formularz z wygranej szansy gabinetu | firma, szansa i kwota 3000 są wstawione; zapis strony z opiekunem „Osoba spoza zespołu” i terminem 1 października 2026 |
| Przychód gabinetu po tym zapisie | nadal 500000 groszy w trzech wpisach |
| Statusy tej karty | oczekiwanie na klienta, zakończenie z datą, ponowne otwarcie bez daty, historia z aktorem |
| Checklista | dopisana ręczna pozycja |
| Filtr opóźnionych, szerokość 390 | jedna pozycja z oznaczeniem „Opóźnione”, bez wdrożenia z 3 listopada i bez poziomego overflow |

Niezaliczone w przeglądarce:

- zmiana klienta przy dealu innej firmy jest odrzucona w teście SQL, nie była kliknięta;
- wstrzymanie i anulowanie są na liście statusów i w teście SQL, nie były kliknięte;
- zadanie z karty wdrożenia nie było zapisane;
- druga sesja realtime, logowanie Bartka, wygaśnięcie sesji, wylogowanie i nawigacja klawiaturą.

W lokalnej bazie zostało wdrożenie „Strona testowa gabinetu”, powiązane z wygraną gabinetu, w realizacji, z terminem 1 października 2026 i jedną pozycją checklisty. `supabase db reset` wraca do seeda.

D1 i D2 pozostają wyłączone.

## Etap 7 — zadania i follow-up

Zrobione lokalnie. Lista, karta, zapis i ukończenie zadania oraz „Nie odebrał” z potwierdzonym oknem 09:00–15:00. Digest o 08:00 i wysyłka powiadomień zostają w etapie 11. Reguły D1 są wyłączone.

- Widoki: Moje, Wszystkie, Otwarte, Dzisiaj, Zaległe, Nadchodzące, Ukończone. Domyślnie Moje i Otwarte. Adres digestu to `/tasks?view=today&assignee=me`.
- Jedno zadanie ma wielu przypisanych. Ukończenie zamyka je dla wszystkich i zapisuje autora w `completed_by`. Zadanie bez klienta jest dozwolone. Pusta godzina zostawia `due_at` puste. Podana godzina jest tym samym dniem w Europe/Warsaw.
- „Nie odebrał” liczy dzień z zegara bazy i parametrów okna. W oknie, od poniedziałku do piątku, termin jest dzisiaj. Po 15:00:00 jest to najbliższy dzień poniedziałek–piątek. Przed 09:00, w sobotę i w niedzielę funkcja zwraca pustą datę i formularz wymaga wpisu. Święta nie są rozpoznawane. Follow-up dostaje tylko osobę, która kliknęła. Powtórka tego samego żądania nie tworzy drugiego wiersza. To pokrywa test SQL.
- Zdarzenia `task.assigned`, `task.due_changed`, `task.status_changed` i `task.completed` są zapisywane. Wejście w ukończenie emituje `task.completed`. Liczba powiadomień w teście SQL się nie zmienia.

Testy uruchomione:

| Sprawdzenie | Wynik |
|---|---|
| `psql -f tests/integration/stage7.sql` | przechodzi i robi rollback; granice 08:59, 09:00, 15:00 i 15:00:01, piątek po oknie na poniedziałek, sobota i niedziela puste, parametr 16:00, wspólne zadanie, ukończenie bez drugiego zdarzenia, jawna data tylko gdy polityka jest pusta, liczba powiadomień bez zmian |
| `pnpm test` | 27/27 |
| `pnpm typecheck` | przechodzi |
| `pnpm lint` | przechodzi |
| Nowe zadanie „Wspólny test zadań” | bez klienta, termin 1 października 2026, Anna i Bartek w jednym wierszu |
| Ukończenie tego zadania | status Ukończone, autor Anna Kowalska, obaj przypisani zostają; widok Zaległe ma 0, widok Ukończone pokazuje to zadanie |
| Dzisiaj, Moje | „Oddzwonić do kawiarni”, 29 października 2026, Anna i Bartek |
| „Nie odebrał” na szansie kawiarni po 15:00 | podgląd i zapisany follow-up na 30 października 2026, przypisana Anna, źródło „Próba kontaktu”, bez godziny; na formularzu linki „Otwórz zadanie” i „Zmień termin” |
| Zmiana terminu follow-upu | zapis na 12 listopada 2026, rodzaj zostaje follow-up |

Niezaliczone w przeglądarce:

- zdanie toastu „Zapisano próbę kontaktu. Follow-up: …” zniknęło, zanim zostało odczytane; na stronie zostały linki i zadanie z tą datą;
- powtórka tego samego żądania, data przed 09:00 oraz sobota i niedziela są w teście SQL, nie były kliknięte;
- wyjście ze statusu Ukończone jest w teście SQL, nie było kliknięte;
- szerokość wąska nie była sprawdzana;
- ostrzeżenie hydracji Next na karcie zadania nie zostało odizolowane; ostrzeżenie sidebara z etapu 4 zostaje;
- druga sesja realtime, logowanie Bartka, wygaśnięcie sesji, wylogowanie i nawigacja klawiaturą.

W lokalnej bazie zostały: ukończone zadanie „Wspólny test zadań” z 1 października 2026 oraz follow-up „Ponowny kontakt” kawiarni z terminem 12 listopada 2026. `supabase db reset` wraca do seeda.

Potwierdzone okno D2 jest aktywne. Przypadki przed 09:00, w sobotę, w niedzielę i w święto nadal wymagają jawnej daty. D1 pozostaje wyłączone.

## Etap 8 — dokumenty i Storage

Zrobione lokalnie. Prywatny bucket `documents`, wysyłka prosto do Storage i krótki adres po kontroli członkostwa. Nie ma generowania ofert ani e-podpisu.

- Limit produktu to 25 MB na plik. Globalny limit Storage w `config.toml` to 50MiB. Lista MIME i limit są w `automation_settings` i widać je przed wysyłką. Bucket jest prywatny i ma ten sam limit oraz te same typy.
- Ścieżka obiektu to `workspace/UUID/UUID`. Oryginalna nazwa zostaje w metadanych. HTML, SVG i pliki wykonywalne są odrzucane. Treść PDF, PNG, JPEG, DOCX i XLSX jest sprawdzana po bajtach, nie po rozszerzeniu.
- Adres wysyłki wystawia Storage na 2 godziny; biblioteka nie przyjmuje krótszego czasu. Adres pobrania i podglądu żyje 120 sekund, powstaje przy otwarciu i nie jest zapisywany przy dokumencie.
- Lista ma nazwę, typ, kategorię, wielkość, datę, autora i powiązanie. Szukanie jest po nazwie. Dokument może zostać ogólny. Ten sam wiersz można podpiąć do firmy, szansy i wdrożenia bez drugiej kopii pliku.
- Usuwanie gotowego pliku ma potwierdzenie i stan `deleting`. Gdy magazyn nie potwierdzi, sukces nie jest zapisywany i można ponowić. Niedokończona wysyłka starsza niż 24 godziny jest na liście do porządkowania.

Testy uruchomione:

| Sprawdzenie | Wynik |
|---|---|
| `psql -f tests/integration/stage8.sql` | przechodzi i robi rollback; obcy aktor, HTML, EXE, plik nad limitem, dwa powiązania, brak szansy, dokument ogólny, losowa ścieżka, niezgodny rozmiar nie ustawia gotowości, usuwanie bez fałszywego sukcesu, Bartek widzi wiersz, członek i anon nie czytają `storage.objects` |
| `pnpm test` | 30/30 |
| `pnpm typecheck` | przechodzi |
| `pnpm lint` | przechodzi |
| Wysyłka TXT i PNG tym samym PUT co formularz | pliki są gotowe; publiczny adres zwraca 400; adres na 1 sekundę po odczekaniu zwraca 400, nowy adres zwraca 200 |
| Pobranie TXT z sesji | treść pliku wraca przez `/documents/:id/file` |
| Podgląd PNG | obraz 1×1 ładuje się na karcie |
| Powiązanie notatki ze szansą kawiarni | ten sam plik jest na liście i na karcie szansy |
| Usunięcie błędnego PDF | po potwierdzeniu znika z listy |
| Szukanie `notatka` | zostaje jeden dokument |

Niezaliczone w przeglądarce:

- wybór wielu plików, pasek postępu, anulowanie i utrata sieci nie były kliknięte; formularz ma te stany, a wysyłka poszła tym samym adresem co on;
- przycisk porządkowania wysyłek starszych niż 24 godziny nie był kliknięty; wybór takich wierszy jest w teście SQL;
- logowanie Bartka nie było powtórzone; odczyt wiersza przez drugiego członka jest w teście SQL;
- ostrzeżenie hydracji Next na karcie dokumentu nie zostało odizolowane.

W lokalnej bazie zostały: `notatka-etap8.txt` powiązana ze szansą kawiarni oraz ogólny `punkt.png`. `supabase db reset` wraca do seeda.

## Etap 9 — odbyte spotkania z Fathom

Migracje `20261030093000_fathom_meetings.sql`, `20261031001000_fathom_upsert_alias.sql` i `20261031001100_fathom_upsert_account.sql` są na lokalnej bazie. Dwie późniejsze tylko prostują nazwy zmiennych w `private.upsert_fathom_meeting`, bez zmiany reguł. Żywe nagranie z Fathoma nie było pobrane.

Zrobione w kodzie, zgodnie z dokumentacją Fathom sprawdzoną 30.10.2026:

- Adapter `GET /meetings` z kursorem, filtrem `recorded_by[]` i dołączeniem podsumowania, transkrypcji oraz propozycji. Przy 429 czeka na `Retry-After`. Przy 401 zatrzymuje przebieg. Współbieżność jest jedna.
- Webhook `POST /api/integrations/fathom/{connectionId}/webhook` sprawdza podpis na surowym body, znacznik czasu do 5 minut i powtórkę `webhook-id`. Sekret zostaje w zmiennej serwera. Rejestracja dotyczy własnych nagrań, `triggered_for = my_recordings`.
- Zapis nie nadpisuje notatki CRM ani ręcznego powiązania. Pusta albo błędna transkrypcja nie kasuje metadanych. Jedno `recording_id` to jeden rekord i osobne źródło dla drugiego konta.
- Jednoznaczna firma dostaje powiązanie bez szansy. Kilka firm albo kilka otwartych szans zostaje w stanie „Do przypisania”.
- Propozycja z Fathoma nie tworzy zadania. Zadanie powstaje po wyborze firmy, osoby i terminu.
- Synchronizuj nie pobiera całej historii. Import zakresu wymaga obu dat, liczonych w Europe/Warsaw. Jedno kliknięcie bierze do 10 stron. Automatyczne dociąganie treści ma 5 prób. To limity techniczne jednego przebiegu, nie reguła klienta. Worker co 15 minut zostaje w etapie 11.

Testy uruchomione:

| Sprawdzenie | Wynik |
|---|---|
| `pnpm test` | 37/37, w tym podpis poprawny i błędny, stary znacznik czasu, dwie strony API, 429 i 401 |
| `pnpm typecheck` | przechodzi |
| `pnpm lint` | przechodzi |
| `psql -f tests/integration/stage9.sql` | przechodzi i robi rollback |
| Lista i karta spotkania | seed „Rozmowa przykładowa z gabinetem” widać z podsumowaniem i powiązaniem z gabinetem |
| Żywy Fathom | niewykonane |

## Etap 10 — dashboard i wyszukiwanie

Migracja `20261031010000_dashboard.sql` jest na lokalnej bazie. Dashboard nie sumuje tabel w przeglądarce. Okresowy worker naliczeń nie został uruchomiony i ekran o tym mówi.

Zrobione:

- Cztery karty okresu: przychód brutto, otwarte wdrożenia, zadania na dziś i nowe szanse. Pod nimi wykres i tabela sześciu miesięcy, lejek „Stan obecny”, abonament aktywny dziś, wygrane, skuteczność zamknięć, zaległe zadania i opóźnione wdrożenia.
- Filtr okresu nie zmienia zadań na dziś ani wykresu. Opiekun nie zmienia ewidencji ani wdrożeń. Pusty miesiąc na wykresie ma zero. Błąd wczytania nie jest pokazywany jako zero.
- Każda karta ma definicję i odsyłacz. Przychód otwiera listę pozycji ewidencji z sumą policzoną w bazie.
- Wyszukiwanie grupuje firmy, kontakty, szanse, wdrożenia, zadania i dokumenty. Nie przeszukuje treści transkrypcji.

Testy uruchomione:

| Sprawdzenie | Wynik |
|---|---|
| `pnpm test` | 41/41 |
| `pnpm typecheck` | przechodzi |
| `pnpm lint` | przechodzi |
| `psql -f tests/integration/stage10.sql` | przechodzi i robi rollback |
| Dashboard 31 paź 2026 | przychód października 1000,00 zł, zgodny z sumą `revenue_entries`; otwarte wdrożenia 2; zadania na dziś 0; nowe szanse 7 |
| Wykres | maj–sie 0; wrzesień 3000 + 1000 = 4000; październik 0 + 1000 = 1000 |
| Ewidencja z karty przychodu | suma 1000,00 zł, trzy pozycje, w tym abonament gabinetu 1000,00 zł |
| Szukaj „gabinet” | firma, szansa i dwa wdrożenia; klik otwiera kartę Przykładowego Gabinetu |
| Żywy Fathom | nadal niewykonany |

Niezaliczone w przeglądarce: zmiana okresu, opiekuna i źródła nie była klikana. Dolny pasek nawigacji na wąskim oknie zasłania odsyłacze, tak jak w poprzednich etapach. Reguły D1 zostają wyłączone.

## Etap 11 — worker, powiadomienia i PWA

Migracje `20261101020000_worker.sql`, `20261101021000_digest_alias.sql` i `20261101022000_push_test.sql` są na lokalnej bazie. Druga tylko zmienia nazwy zmiennych w `private.build_morning_digest`. Cron nie został zapisany. Sekret workera, przełączniki i klucze VAPID są puste, więc tik zwraca 503, a push na telefon nie wyszedł.

Zrobione:

- Kolejka bierze prace z dzierżawą 120 sekund, paczką do 10 i limitem 5 prób. Po wygaśnięciu dzierżawy praca wraca do kolejki z odroczeniem. Drugie wywołanie tego samego klucza deduplikacji nic nie dodaje.
- Digest jest należny od godziny `digest_hour` czasu Europe/Warsaw, także w weekend. Spóźnienie jest po 15 minutach tej godziny. Test obejmuje zmianę czasu 29 marca i 25 października 2026. Pusty dzień i wyłączone ustawienie nie tworzą wiersza. Jedno wspólne zadanie wchodzi raz do podsumowania każdej osoby. Tytuł ma polską liczbę. Po kilkudniowej przerwie powstaje tylko bieżący dzień.
- Zmiana statusu, przypisanie, przypomnienie i zaległe zadania nie tworzą powiadomienia, nawet gdy kolumny preferencji są ustawione. W centrum są opisane jako niezatwierdzone i niewysyłane.
- Dwa aktywne urządzenia dostają dwie dostawy. Odpowiedź 410 wyłącza subskrypcję. Ten sam endpoint przeniesiony na drugie konto przestaje być aktywny u poprzedniej osoby. Brak urządzenia zostawia powiadomienie bez pusha.
- Centrum pokazuje listę, licznik, oznaczenie jednego i wszystkich oraz odsyłacz wewnętrzny. Realtime słucha tylko wierszy zalogowanej osoby, poza wspólnym kanałem tabel CRM. Wylogowanie odwiązuje jedną instalację.
- Manifest, ikony i service worker są w aplikacji. Ikony to znak geometryczny, nie logo klienta. Cache obejmuje ekran offline i ikony. Strony CRM, dokumenty i transkrypcje nie wchodzą do cache. Wygasła sesja przy kliknięciu pusha wraca przez istniejące `returnTo`.
- Dobijanie przychodu workera i odpytanie Fathom są podpięte do tiku. Brak klucza Fathom kończy pracę jako pominiętą i zapisuje `missing_api_key`, bez tworzenia spotkania. 1 listopada 2026 drugie dobicie gabinetu nie zmienia sumy ewidencji.

Testy uruchomione:

| Sprawdzenie | Wynik |
|---|---|
| `pnpm test` | 45/45 |
| `pnpm typecheck` | przechodzi |
| `pnpm lint` | przechodzi |
| `psql -f tests/integration/stage11.sql` | przechodzi i robi rollback |
| `POST /api/worker/tick` bez sekretu | 503, „Worker nie jest skonfigurowany.” |
| `/offline`, `/sw.js`, `/manifest.webmanifest` | 200 bez sesji |
| Centrum, 1 lis 2026 | Anna widzi seed „Zadanie na dziś: oddzwonić do kawiarni”; dzwonek pokazuje 1 |
| Test push | wiersz zapisany tylko u Anny; komunikat mówi, że nie ma urządzenia i push nie wyszedł; po oznaczeniu dzwonek wraca do 1 |
| Szukaj „gabinet” | firma, szansa i dwa wdrożenia |
| Dashboard 1 lis 2026 | ostrzeżenie, że tik jeszcze nie było; przychód listopada 0,00 zł; ostatni zapis ewidencji 29 paź 2026, 19:36 |
| Żywy push iOS/Android | niewykonany |
| Żywy Fathom | nadal niewykonany |

Na wąskim oknie dolny pasek nadal zasłania przyciski. Odbiór na szerokim oknie 1280×900 przeszedł, a potem metryki urządzenia zostały zdjęte.

## Etap 12 — UX i stabilność

Bez nowej migracji. Listy spotkań i dokumentów nadal nie pobierają treści transkrypcji ani bajtów pliku. Konflikt wersji zostaje przy komunikacie „Ktoś zdążył zmienić ten rekord. Odśwież widok i spróbuj ponownie.” Reguły D1 pozostają wyłączone.

Zrobione:

- Obszar przewijania kończy się nad dolną nawigacją. Szeroka tabela i kanban przewijają się we własnym pasku, a strona nie rośnie w poziomie.
- Po błędzie serwera formularz zostawia wpisane wartości. Przy braku sieci zapis nie udaje sukcesu i pokazuje „Brak połączenia. Zapis nie został wykonany.”
- Błąd wczytania listy, dashboardu, wyszukiwania, ewidencji, ustawień i powiadomień ma przycisk „Ponów”. Ustawienia, nowe zadanie i nowe wdrożenie mają stan ładowania.
- Komunikat o finalizacji nie mówi już, że ten krok jest w następnym etapie. Angielski limit długości z walidacji jest pokazywany jako „Tekst jest za długi.”
- Karty list na wąskim oknie mają odsyłacz o wysokości co najmniej 44 px. Filtr jest przyciskiem drugorzędnym.

Testy uruchomione:

| Sprawdzenie | Wynik |
|---|---|
| `pnpm test` | 47/47 |
| `pnpm typecheck` | przechodzi |
| `pnpm lint` | przechodzi |
| `pnpm build` | przechodzi |
| 390 px | dashboard, wdrożenia, leady, spotkania, dokumenty, klienci i zadania otwarte; brak poziomego przepełnienia strony; treść kończy się nad dolną nawigacją |
| 768 px | tabela i kanban leadów przewijają się wewnątrz, strona ma 768 px; dolna nawigacja ukryta |
| 1440 px | dashboard, wdrożenia i zadania bez poziomego przepełnienia strony; tabela wdrożeń mieści się w obszarze |
| Formularz szansy | za długi tytuł zostaje w polu, opis zostaje, zapis nie przechodzi |
| Brak sieci | komunikat „Brak połączenia…”, tytuł i opis zostają, w bazie tytuł się nie zmienia |
| Spotkanie | karta „Rozmowa przykładowa z gabinetem” otwarta z listy |
| Menu „Więcej” | „Wyloguj” w arkuszu jest nad dolną nawigacją i przyjmuje klik |
| Żywy Fathom | nadal niewykonany |
| Żywy push | nadal niewykonany |

Podczas sprawdzenia formularza powstały dwa zarchiwizowane leady: „Firma zachowana” i „Nie zapisuj”. Domyślna lista nadal pokazuje 7 szans. Święta, cron, klucze VAPID i sekret workera pozostają bez zmian.

## Etap 13 — przygotowanie wdrożenia

Bez nowej migracji i bez `db reset`. Repozytorium GitHub i projekt Vercel nie zostały utworzone. Smoke na produkcji nie był uruchamiany, bo produkcji nie ma.

Zrobione:

- CI w `.github/workflows/ci.yml` instaluje zależności z lockfile i uruchamia lint, typecheck, testy jednostkowe oraz build na Node 24. Testy SQL startują tylko przy `RUN_SQL_INTEGRATION=true` i sekrecie bazy testowej.
- Preview blokuje tik, odbiór n8n, odbiór i wywołania Fathoma oraz push. Odblokowanie wymaga `ENABLE_PREVIEW_SIDE_EFFECTS=true`.
- `.env.example`, `docs/RUNBOOK.md` i `docs/RELEASE_CHECKLIST.md` opisują Vercel, Auth, bucket `documents`, Vault, cron, dwa konta, n8n, Fathom, push, kopie, rotację, martwe prace i niedokończone pliki.
- `supabase/manual/bootstrap-workspace.sql` i `supabase/manual/worker-cron.sql` nie są migracjami i nie zawierają sekretów. Nie były uruchamiane.
- Ustawienia pozwalają dodać pierwsze połączenie Fathom, gdy seed go nie utworzył, oraz drugie konto jak wcześniej.

Testy uruchomione:

| Sprawdzenie | Wynik |
|---|---|
| `pnpm test` | 50/50 |
| `pnpm typecheck` | przechodzi |
| `pnpm lint` | przechodzi |
| `pnpm build` | przechodzi |
| `GET /clients` bez sesji | 307 na `/login?returnTo=%2Fclients`; strona logowania nie zawiera rekordów CRM |
| `POST /api/integrations/n8n/leads` bez tokenu | 401, „Nieprawidłowy token.” |
| `POST /api/worker/tick` bez sekretu | 503, „Worker nie jest skonfigurowany.” |
| Ustawienia | pierwsze konto Fathom jest widoczne; przycisk drugiego konta jest na stronie; token n8n nie jest pokazany |
| Workflow GitHub | plik jest w repozytorium roboczym; sam workflow nie był uruchomiony, bo nie ma zdalnego repozytorium |
| Smoke produkcji, żywy Fathom, żywy push | niewykonane |

## Następny krok

Publikacja wymaga zatwierdzenia: utworzenie repozytorium GitHub i projektu Vercel oraz osobnych projektów Supabase dla preview i produkcji. Po zatwierdzeniu obowiązuje `docs/RELEASE_CHECKLIST.md`. Etap 9 zostaje bez weryfikacji na żywym koncie Fathoma. Reguły D1 pozostają nieaktywne. Digest powstanie po ustawieniu sekretu, `ENABLE_BACKGROUND_JOBS=true` i crona. Push na telefon wymaga kluczy VAPID, `ENABLE_OUTBOUND_PUSH=true` i urządzenia.

## Zależności zewnętrzne

| Element | Status |
|---|---|
| Dwa konta z hasłem nadanym przez operatora | wymagane do odbioru logowania; lokalny seed nie ma znanego hasła |
| Konto Fathom i klucz API | wymagane do testu live Etapu 9 |
| Workflow n8n i token webhooka | endpoint i kontrakt są lokalnie; żywy workflow n8n niepodłączony |
| iPhone/iPad z iOS 16.4+ oraz Android | wymagane do odbioru Web Push; lokalnie niewykonane |
| Repozytorium GitHub i projekt Vercel | pliki CI i runbook gotowe; repozytorium i deployment nieutworzone, czekają na zatwierdzenie |

## Checklist etapów

| Etap | Stan |
|---|---|
| 0 Rozpoznanie | zrobione |
| 1 Powłoka i logowanie | kod gotowy, odbiór live otwarty |
| 2 Baza i RLS | zrobione lokalnie |
| 3 Ręczny CRM | zrobione lokalnie; część odbioru UI otwarta |
| 4 Webhook n8n | zrobione lokalnie; żywy workflow n8n niepodłączony |
| 5 Finanse | zrobione lokalnie; koniec, zmiana kwoty i korekta niekliknięte w UI |
| 6 Wdrożenia | zrobione lokalnie; wstrzymanie, anulowanie i zadanie niekliknięte w UI |
| 7 Zadania i follow-up | zrobione lokalnie; przed 09:00, weekend i święto wymagają jawnej daty; D1 wyłączone |
| 8 Dokumenty | zrobione lokalnie; wieloplikowy postęp i porządkowanie 24 h niekliknięte |
| 9 Fathom | zrobione lokalnie; test SQL przechodzi; żywy Fathom niewykonany |
| 10 Dashboard i wyszukiwanie | zrobione lokalnie; sumy zgodne z ewidencją; ostrzeżenie workera bierze się z tiku |
| 11 Worker, powiadomienia, PWA | zrobione lokalnie; cron i klucze puste; żywy push niewykonany; reguły D1 nieaktywne |
| 12 UX i stabilność | zrobione lokalnie; build przechodzi; święta, cron i klucze bez zmian |
| 13 Wdrożenie | przygotowane lokalnie; GitHub, Vercel, cron, sekrety i smoke produkcji niewykonane |
