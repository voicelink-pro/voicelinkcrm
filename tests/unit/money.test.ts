import { describe, expect, it } from "vitest"

import { groszeInput, parseGrosze } from "@/lib/crm/money"

describe("parseGrosze", () => {
  it("zamienia złote na grosze i przyjmuje jawne zero", () => {
    expect(parseGrosze("3000")).toBe(300000)
    expect(parseGrosze("1000,50")).toBe(100050)
    expect(parseGrosze("0")).toBe(0)
    expect(parseGrosze("0,5")).toBe(50)
  })

  it("odrzuca puste pole i ułamek dłuższy niż grosz", () => {
    expect(parseGrosze("")).toBeNull()
    expect(parseGrosze("10,505")).toBeNull()
    expect(parseGrosze("-1")).toBeNull()
  })

  it("oddaje kwotę do pola formularza", () => {
    expect(groszeInput(300000)).toBe("3000")
    expect(groszeInput(100050)).toBe("1000,50")
    expect(groszeInput(0)).toBe("0")
    expect(groszeInput(null)).toBe("")
  })
})
