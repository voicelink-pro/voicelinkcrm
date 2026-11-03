import { describe, expect, it } from "vitest"

import { polishDatabaseError } from "@/lib/database/errors"

describe("polishDatabaseError", () => {
  it("tłumaczy stabilny kod bazy", () => {
    expect(polishDatabaseError({ message: "version_conflict" })).toBe(
      "Ktoś zdążył zmienić ten rekord. Odśwież widok i spróbuj ponownie.",
    )
  })

  it("tłumaczy kod opakowany przez PostgREST", () => {
    expect(polishDatabaseError({ message: "P0001: follow_up_date_required" })).toBe(
      "Podaj termin ponownego kontaktu.",
    )
  })

  it("nie oddaje surowego SQL", () => {
    expect(
      polishDatabaseError({
        message: 'duplicate key value violates unique constraint "deals_pkey"',
      }),
    ).toBe("Nie udało się zapisać zmiany.")
  })

  it("tłumaczy kody etapu ręcznego CRM", () => {
    expect(polishDatabaseError({ message: "invalid_contact" })).toBe(
      "E-mail albo telefon ma niepoprawny format. Numer kierunkowy nie jest dopisywany.",
    )
    expect(polishDatabaseError({ message: "finalization_required" })).toContain("finalizacji")
  })

  it("ma komunikat, gdy błędu nie ma", () => {
    expect(polishDatabaseError(null)).toBe("Nie udało się zapisać zmiany.")
  })
})
