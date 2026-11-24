import { describe, expect, it } from "vitest"

import {
  changeLeadStageApiSchema,
  createClientApiSchema,
  createLeadApiSchema,
  createNoteApiSchema,
  createTaskApiSchema,
  updateImplementationApiSchema,
  updateTaskApiSchema,
} from "@/lib/api/schemas"

describe("Agent API schemas", () => {
  it("validates lead creation and stage transitions", () => {
    const lead = createLeadApiSchema.safeParse({
      full_name: "Anna Nowak",
      email: "anna@example.com",
      stage: "warming",
    })
    expect(lead.success).toBe(true)

    const stageOk = changeLeadStageApiSchema.safeParse({ stage: "meeting_scheduled" })
    expect(stageOk.success).toBe(true)

    const stageInvalid = changeLeadStageApiSchema.safeParse({ stage: "unknown_stage" })
    expect(stageInvalid.success).toBe(false)
  })

  it("validates client creation and implementation updates", () => {
    const client = createClientApiSchema.safeParse({
      display_name: "Klinika ProDent",
      implementation_stage: "testing",
      implementation_due_on: "2026-12-15",
    })
    expect(client.success).toBe(true)

    const emptyImpl = updateImplementationApiSchema.safeParse({})
    expect(emptyImpl.success).toBe(false)

    const stageOnly = updateImplementationApiSchema.safeParse({ stage: "launched" })
    expect(stageOnly.success).toBe(true)
  })

  it("requires either account_id or deal_id for notes", () => {
    const missing = createNoteApiSchema.safeParse({ body: "Notatka bez powiązania" })
    expect(missing.success).toBe(false)

    const withDeal = createNoteApiSchema.safeParse({
      deal_id: "550e8400-e29b-41d4-a716-446655440000",
      body: "Notatka do leada",
    })
    expect(withDeal.success).toBe(true)
  })

  it("enforces due_on when due_time is supplied for tasks", () => {
    const timeWithoutDate = createTaskApiSchema.safeParse({
      title: "Oddzwonić",
      due_time: "14:00",
    })
    expect(timeWithoutDate.success).toBe(false)

    const validTask = createTaskApiSchema.safeParse({
      title: "Oddzwonić",
      due_on: "2026-11-26",
      due_time: "14:30:00",
      priority: "high",
    })
    expect(validTask.success).toBe(true)
    if (validTask.success) {
      expect(validTask.data.due_time).toBe("14:30")
      expect(validTask.data.status).toBe("todo")
    }

    const partialUpdate = updateTaskApiSchema.safeParse({ status: "in_progress" })
    expect(partialUpdate.success).toBe(true)
  })
})
