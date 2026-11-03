const databaseErrorMessages: Record<string, string> = {
  version_conflict:
    "Ktoś zdążył zmienić ten rekord. Odśwież widok i spróbuj ponownie.",
  not_a_member: "Brak dostępu do tego obszaru roboczego.",
  idempotency_conflict:
    "To zgłoszenie zostało już zapisane z inną treścią.",
  finalization_conflict:
    "Ta szansa jest już zamknięta na innych warunkach.",
  invalid_state: "Tej operacji nie da się wykonać w obecnym stanie.",
  follow_up_date_required: "Podaj termin ponownego kontaktu.",
  subscription_revision_not_future:
    "Zmiana kwoty dotyczy tylko przyszłego, jeszcze nienaliczonego cyklu.",
  import_invalid: "Zgłoszenie ma niekompletne dane techniczne.",
  cross_reference: "Powiązanie wskazuje rekord z innego klienta.",
  revenue_immutable:
    "Zaksięgowanego przychodu nie wolno zmieniać. Dodaj korektę.",
  history_append_only: "Historii statusów nie wolno zmieniać.",
  workspace_change_forbidden: "Nie wolno przenosić rekordu między obszarami.",
  membership_change_forbidden:
    "Członkostwa nie zmienia się z poziomu aplikacji.",
  not_found: "Nie znaleziono rekordu.",
  document_type_rejected: "Ten typ pliku nie jest przyjmowany.",
  document_too_large: "Plik przekracza limit wielkości.",
  document_mismatch: "Plik w magazynie nie zgadza się z deklaracją.",
  invalid_contact:
    "E-mail albo telefon ma niepoprawny format. Numer kierunkowy nie jest dopisywany.",
  finalization_required:
    "Wygranie zapisuje się w finalizacji, która nalicza przychód.",
  invalid_billing_date: "Data naliczenia jest niepoprawna.",
  billing_horizon_exceeded: "Harmonogram jest zbyt długi.",
}

const fallback = "Nie udało się zapisać zmiany."

export function polishDatabaseError(
  error: { message?: string | null } | null | undefined,
) {
  const message = error?.message?.trim() ?? ""

  if (!message) {
    return fallback
  }

  if (databaseErrorMessages[message]) {
    return databaseErrorMessages[message]
  }

  for (const [code, text] of Object.entries(databaseErrorMessages)) {
    if (
      message.endsWith(`: ${code}`) ||
      message.endsWith(`:${code}`) ||
      message.includes(` ${code}`)
    ) {
      return text
    }
  }

  return fallback
}
