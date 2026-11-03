# Wymagania VoiceLink CRM

Źródło: `VoiceLink_CRM_prompt_Grok.md`, wersja 1.0 z 28 października 2026. Ten plik zapisuje wymagania zatwierdzone oraz dwie reguły nadal otwarte. Nie zastępuje specyfikacji i nie opisuje wykonanej implementacji.

## Zakres

Wewnętrzny CRM zespołu VoiceLink. Dwie osoby na start, jednakowy pełny dostęp do danych biznesowych. Bez portalu klienta, planów SaaS i hierarchii ról.

Moduły pierwszej wersji: Dashboard, Wdrożenia, Leady, Spotkania, Dokumenty, Klienci, Zadania.

Stack: Next.js, React, TypeScript, Supabase, Vercel, repozytorium GitHub.

## Dane i sprzedaż

- Jedna wspólna karta relacji. Wiele kontaktów, deali i wdrożeń. Historia zostaje po wygraniu deala.
- Produkty: Asystent VoiceLink, Strona internetowa, Infrastruktura cyfrowa.
- Lead w interfejsie to otwarty deal z kartą i kontaktem. Nie ma osobnej kopii klienta po wygranej.
- Import z n8n po nowym wierszu Google Sheets. CRM dostaje e-mail, imię i nazwisko oraz telefon. Po imporcie edycja jest tylko w CRM.
- Sam kontakt nie wymaga nazwy firmy. Import nie tworzy fikcyjnych nazw placówek.
- „Nie odebrał” jest wynikiem próby kontaktu, nie etapem lejka. Follow-up przypisany jest do osoby klikającej. Termin może być samą datą. Brak godziny oddzwonienia.

## Finanse

- PLN brutto. Kwoty w groszach jako liczby całkowite.
- Liczą się wygrane deale: opłata wdrożeniowa jednorazowo i abonament miesięcznie od daty wybranej przez użytkownika.
- Etykieta w interfejsie: „Przychód brutto z umów”. To naliczenie z harmonogramu, nie wpłata, zysk ani księgowość.
- Wdrożenie ma wartość informacyjną i nie jest drugim źródłem przychodu.
- Wygranie deala nie tworzy wdrożenia bez osobnego zatwierdzenia.

## Spotkania, dokumenty, zadania

- Wyłącznie odbyte spotkania z Fathom: transkrypcja, podsumowanie lub notatki i link do nagrania. Bez kopiowania wideo i bez kalendarza przyszłych spotkań.
- Jedno konto Fathom na start. Schemat ma umożliwić drugie.
- Dokumenty: wgrywanie, organizacja, opcjonalne powiązanie, podgląd obsługiwanych plików i pobieranie. Bez generatora ofert i podpisu elektronicznego.
- Zadania mogą mieć wiele przypisanych osób. Jedno wspólne zadanie, nie kopia na osobę.

## Powiadomienia i urządzenie

- Potwierdzony jest poranny digest o 08:00 czasu Europe/Warsaw dla zadań przypisanych użytkownikowi na dany dzień.
- Aplikacja ma być responsywną, instalowalną PWA z systemowym Web Push i centrum powiadomień.
- Interfejs jasny. Sidebar granatowy, znak VoiceLink u góry, ikony, komponenty w estetyce shadcn/ui.

## Poza tą wersją

Marketing automation, SMS i e-mail do leadów, dodatkowy model AI, VoiceLink Center, VoIP, planowanie przyszłych spotkań, dane pacjentów, ciemny motyw, portal klienta.

## Reguły otwarte

Poniższe propozycje nie są zatwierdzoną konfiguracją. Mechanizm i jawne ustawienia mają powstać później. Automatyczna wysyłka i ukryty termin nie są aktywne.

### D1 — powiadomienia poza porannym digestem

Potwierdzono tylko digest zadań na dziś, codziennie o 08:00. Nie potwierdzono:

- czy zmiana statusu powiadamia obu użytkowników poza autorem zmiany;
- czy przypisanie i przypomnienie trafiają tylko do przypisanych osób;
- czy digest o 08:00 zawiera również zaległe zadania.

### D2 — follow-up poza przedziałem 09:00–15:00

Potwierdzono: „Nie odebrał” od razu tworzy zadanie osoby klikającej. Kliknięcie w godzinach 09:00–15:00 daje termin na dziś, po 15:00 na kolejny dzień roboczy. Nie ustalono zachowania przed 09:00 oraz w soboty, niedziele i święta. Do czasu decyzji taki przypadek wymaga jawnego wyboru daty. Granica 15:00 jest parametrem, nie ukrytą stałą do zgadywania wyjątków.
