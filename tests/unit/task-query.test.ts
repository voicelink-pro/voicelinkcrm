import { describe, expect, it } from "vitest"

import { parseTaskQuery, taskIsOverdue, tasksHref } from "@/lib/crm/task-query"

describe("zadania", () => {
  it("domyślnie pokazuje moje otwarte zadania", () => {
    expect(parseTaskQuery({})).toMatchObject({
      assignee: "me",
      view: "open",
      status: "",
      priority: "",
      page: 1,
    })
  })

  it("adres digestu wskazuje dzisiejsze zadania zalogowanej osoby", () => {
    expect(parseTaskQuery({ view: "today", assignee: "me" })).toMatchObject({
      assignee: "me",
      view: "today",
    })
    expect(tasksHref(parseTaskQuery({ view: "today", assignee: "me" }))).toBe(
      "/tasks?view=today&assignee=me",
    )
  })

  it("ukończone zadanie z przeszłym terminem nie jest zaległe", () => {
    expect(taskIsOverdue("done", "2026-10-01", "2026-10-29")).toBe(false)
    expect(taskIsOverdue("cancelled", "2026-10-01", "2026-10-29")).toBe(false)
    expect(taskIsOverdue("todo", "2026-10-28", "2026-10-29")).toBe(true)
    expect(taskIsOverdue("in_progress", null, "2026-10-29")).toBe(false)
    expect(taskIsOverdue("todo", "2026-10-29", "2026-10-29")).toBe(false)
  })
})
