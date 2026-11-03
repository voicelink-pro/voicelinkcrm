import { describe, expect, it } from "vitest"
import { z } from "zod"

import { snapshotFields } from "@/lib/crm/form-values"
import { fieldErrorsFromZod } from "@/lib/crm/validation"

describe("snapshotFields", () => {
  it("zostawia tekst i pomija plik", () => {
    const data = new FormData()
    data.set("title", "Asystent")
    data.append("assignee", "anna")
    data.append("assignee", "bartek")
    data.set("file", new File(["x"], "notatka.txt"))

    expect(snapshotFields(data)).toEqual([
      ["title", "Asystent"],
      ["assignee", "anna"],
      ["assignee", "bartek"],
    ])
  })
})

describe("fieldErrorsFromZod", () => {
  it("zamienia angielski komunikat limitu na polski i zostawia własny", () => {
    const parsed = z.object({
      title: z.string().max(5),
      fullName: z.string().min(1, "Podaj imię i nazwisko."),
    }).safeParse({ title: "za długi", fullName: "" })

    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(fieldErrorsFromZod(parsed.error)).toEqual({
        title: "Tekst jest za długi.",
        fullName: "Podaj imię i nazwisko.",
      })
    }
  })
})