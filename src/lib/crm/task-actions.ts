"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { getWorkspaceGate } from "@/lib/auth/access"
import { callCrm } from "@/lib/crm/mutate"
import { fieldErrorsFromZod, type CrmFormState } from "@/lib/crm/validation"

const statusCodes = ["todo", "in_progress", "done", "cancelled"] as [string, ...string[]]
const priorityCodes = ["low", "normal", "high"] as [string, ...string[]]

const optionalUuid = z
  .string()
  .uuid()
  .optional()
  .or(z.literal(""))
  .transform((value) => value || null)

const optionalDate = z
  .union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Podaj datę.")])
  .optional()
  .transform((value) => value || null)

const optionalTime = z
  .string()
  .trim()
  .optional()
  .transform((value) => {
    if (!value) {
      return null
    }
    const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value)
    return match ? `${match[1]}:${match[2]}` : value
  })
  .refine((value) => value === null || /^\d{2}:\d{2}$/.test(value), "Podaj godzinę.")

const saveSchema = z.object({
  taskId: optionalUuid,
  version: z
    .string()
    .optional()
    .transform((value) => {
      if (!value) {
        return null
      }
      const parsed = Number(value)
      return Number.isInteger(parsed) && parsed > 0 ? parsed : null
    }),
  title: z.string().trim().min(1, "Podaj tytuł zadania.").max(200),
  description: z.string().trim().max(20000).optional().transform((value) => value || null),
  dueOn: optionalDate,
  dueTime: optionalTime,
  priority: z.enum(priorityCodes),
  status: z.enum(statusCodes),
  accountId: optionalUuid,
  dealId: optionalUuid,
})

const completeSchema = z.object({
  taskId: z.string().uuid(),
  version: z.coerce.number().int().positive(),
})

function refreshTasks() {
  revalidatePath("/tasks")
  revalidatePath("/leads")
  revalidatePath("/clients")
  revalidatePath("/accounts")
  revalidatePath("/calendar")
}

function formObject(formData: FormData) {
  return Object.fromEntries(formData.entries())
}

async function actorId(): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const gate = await getWorkspaceGate()
  if (gate.kind !== "member") {
    return { ok: false, message: "Brak dostępu do tego obszaru roboczego." }
  }
  return { ok: true, id: gate.userId }
}

export async function saveTaskAction(
  _state: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const parsed = saveSchema.safeParse(formObject(formData))
  if (!parsed.success) return { fieldErrors: fieldErrorsFromZod(parsed.error) }
  if (parsed.data.dueTime && !parsed.data.dueOn) {
    return { fieldErrors: { dueTime: "Godzina wymaga daty." } }
  }
  if (parsed.data.taskId && parsed.data.version == null) {
    return { error: "Odśwież zadanie i zapisz ponownie." }
  }

  const assignees = z
    .array(z.string().uuid())
    .min(1, "Wybierz co najmniej jedną osobę.")
    .safeParse([
      ...new Set(
        formData.getAll("assigneeIds").filter((value): value is string => typeof value === "string"),
      ),
    ])
  if (!assignees.success) {
    return {
      fieldErrors: {
        assigneeIds: assignees.error.issues[0]?.message ?? "Wybierz co najmniej jedną osobę.",
      },
    }
  }

  const actor = await actorId()
  if (!actor.ok) return { error: actor.message }

  const saved = await callCrm<string>("save_task", {
    p_actor_user_id: actor.id,
    p_task_id: parsed.data.taskId,
    p_expected_version: parsed.data.version,
    p_title: parsed.data.title,
    p_description: parsed.data.description,
    p_due_on: parsed.data.dueOn,
    p_due_time: parsed.data.dueTime,
    p_priority: parsed.data.priority,
    p_status: parsed.data.status,
    p_account_id: parsed.data.accountId,
    p_deal_id: parsed.data.dealId,
    p_deployment_id: null,
    p_assignee_ids: assignees.data,
  })
  if (saved.message || !saved.data) {
    return { error: saved.message ?? "Nie udało się zapisać zmiany." }
  }

  refreshTasks()
  if (!parsed.data.taskId && formData.get("noRedirect") !== "1") {
    redirect(`/tasks/${saved.data}`)
  }
  return { savedAt: Date.now(), notice: parsed.data.taskId ? "Zapisano zmiany w zadaniu." : "Utworzono nowe zadanie." }
}

export async function quickUpdateTaskAction(input: {
  taskId: string
  version: number
  title: string
  description: string | null
  dueOn: string | null
  dueTime: string | null
  priority: string
  status: string
  accountId: string | null
  dealId: string | null
  assigneeIds: string[]
}): Promise<{ ok: boolean; error?: string }> {
  const actor = await actorId()
  if (!actor.ok) return { ok: false, error: actor.message }

  if (!input.assigneeIds.length) {
    return { ok: false, error: "Zadanie musi mieć przypisaną co najmniej jedną osobę." }
  }

  const saved = await callCrm<string>("save_task", {
    p_actor_user_id: actor.id,
    p_task_id: input.taskId,
    p_expected_version: input.version,
    p_title: input.title,
    p_description: input.description,
    p_due_on: input.dueOn,
    p_due_time: input.dueTime,
    p_priority: input.priority,
    p_status: input.status,
    p_account_id: input.accountId,
    p_deal_id: input.dealId,
    p_deployment_id: null,
    p_assignee_ids: input.assigneeIds,
  })

  if (saved.message || !saved.data) {
    return { ok: false, error: saved.message ?? "Nie udało się zapisać zmiany." }
  }

  refreshTasks()
  return { ok: true }
}

export async function completeTaskAction(
  _state: CrmFormState,
  formData: FormData,
): Promise<CrmFormState> {
  const parsed = completeSchema.safeParse(formObject(formData))
  if (!parsed.success) return { fieldErrors: fieldErrorsFromZod(parsed.error) }
  const actor = await actorId()
  if (!actor.ok) return { error: actor.message }

  const saved = await callCrm<string>("complete_task", {
    p_actor_user_id: actor.id,
    p_task_id: parsed.data.taskId,
    p_expected_version: parsed.data.version,
  })
  if (saved.message || !saved.data) {
    return { error: saved.message ?? "Nie udało się zapisać zmiany." }
  }
  refreshTasks()
  return { savedAt: Date.now() }
}
