import { describe, expect, it } from "vitest"

import { activeLeadFilterCount, leadQueryString, parseLeadQuery } from "@/lib/crm/lead-query"

describe("parseLeadQuery", () => {
  it("zostawia domyślne sortowanie od najnowszych", () => {
    const query = parseLeadQuery({})
    expect(query.sort).toBe("created_at")
    expect(query.dir).toBe("desc")
    expect(query.view).toBe("table")
    expect(query.page).toBe(1)
    expect(leadQueryString(query)).toBe("")
  })

  it("odrzuca nieznany etap i sortowanie", () => {
    const query = parseLeadQuery({
      stage: "callback",
      sort: "amount",
      view: "kanban",
      page: "2",
      q: "  kawiarnia  ",
    })
    expect(query.stage).toBe("")
    expect(query.sort).toBe("created_at")
    expect(query.view).toBe("kanban")
    expect(query.page).toBe(2)
    expect(query.q).toBe("kawiarnia")
  })

  it("liczy tylko filtry różne od widoku domyślnego", () => {
    expect(activeLeadFilterCount(parseLeadQuery({}))).toBe(0)
    expect(
      activeLeadFilterCount(
        parseLeadQuery({ stage: "new", view: "kanban", archived: "1", dir: "asc" }),
      ),
    ).toBe(4)
  })
})
