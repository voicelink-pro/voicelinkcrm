import { z } from "zod"

import { dealStages, implementationStages, productTypes } from "@/lib/crm/labels"

export const DEAL_STAGE_CODES = dealStages.map(([code]) => code) as [string, ...string[]]
export const MUTABLE_DEAL_STAGE_CODES = dealStages
  .map(([code]) => code)
  .filter((code) => code !== "won") as [string, ...string[]]
export const IMPLEMENTATION_STAGE_CODES = implementationStages.map(([code]) => code) as [
  string,
  ...string[],
]
export const PRODUCT_TYPE_CODES = productTypes.map(([code]) => code) as [string, ...string[]]
export const TASK_STATUS_CODES = ["todo", "in_progress", "done", "cancelled"] as const
export const TASK_PRIORITY_CODES = ["low", "normal", "high"] as const
export const INTEGRATION_DOCS_STATUS_CODES = ["missing", "partial", "complete"] as const

const dateString = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Podaj datę w formacie YYYY-MM-DD.")

const nullableDate = z.union([dateString, z.literal(""), z.null()]).transform((v) => v || null)

const timeString = z
  .string()
  .trim()
  .transform((value) => {
    const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value)
    return match ? `${match[1]}:${match[2]}` : value
  })
  .refine((value) => /^\d{2}:\d{2}$/.test(value), "Podaj godzinę w formacie HH:MM.")

const nullableTime = z
  .union([timeString, z.literal(""), z.null()])
  .transform((v) => v || null)

const nullableUuid = z
  .union([z.string().uuid("Podaj poprawny UUID."), z.literal(""), z.null()])
  .transform((v) => v || null)

const nullableText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .transform((v) => (v && v.length > 0 ? v : null))

export const createLeadApiSchema = z.object({
  full_name: z.string().trim().min(1, "Podaj imię i nazwisko.").max(200),
  company_name: nullableText(200).optional(),
  email: nullableText(320).optional(),
  phone: nullableText(40).optional(),
  title: nullableText(200).optional(),
  product_type: z
    .union([z.enum(PRODUCT_TYPE_CODES), z.literal(""), z.null()])
    .optional()
    .transform((v) => v || null),
  owner_user_id: nullableUuid.optional(),
  stage: z.enum(MUTABLE_DEAL_STAGE_CODES).optional(),
  lost_reason: nullableText(500).optional(),
  note: nullableText(20000).optional(),
  confirm_duplicate: z.boolean().optional().default(false),
})

export const updateLeadApiSchema = z.object({
  version: z.number().int().positive().optional(),
  title: z.string().trim().min(1, "Podaj tytuł.").max(200).optional(),
  product_type: z
    .union([z.enum(PRODUCT_TYPE_CODES), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null)),
  primary_contact_id: nullableUuid.optional(),
  description: nullableText(20000).optional(),
  owner_user_id: nullableUuid.optional(),
  stage: z.enum(MUTABLE_DEAL_STAGE_CODES).optional(),
  lost_reason: nullableText(500).optional(),
  archived: z.boolean().optional(),
})

export const changeLeadStageApiSchema = z.object({
  stage: z.enum(DEAL_STAGE_CODES),
  lost_reason: nullableText(500).optional(),
  version: z.number().int().positive().optional(),
})

export const leadOutcomeApiSchema = z.object({
  outcome: z.enum(["no_answer", "conversation", "other"]),
  summary: nullableText(2000).optional(),
  due_on: nullableDate.optional(),
  action_key: z.string().trim().min(1).max(200).optional(),
})

export const finalizeLeadApiSchema = z.object({
  version: z.number().int().positive().optional(),
  setup_amount_cents: z.number().int().min(0),
  setup_on: dateString,
  monthly_amount_cents: z.number().int().min(0).default(0),
  subscription_starts_on: nullableDate.optional(),
  subscription_ends_on: nullableDate.optional(),
})

export const createClientApiSchema = z.object({
  display_name: z.string().trim().min(1, "Podaj nazwę klienta.").max(200),
  company_name: nullableText(200).optional(),
  full_name: nullableText(200).optional(),
  email: nullableText(320).optional(),
  phone: nullableText(40).optional(),
  nip: nullableText(20).optional(),
  implementation_stage: z.enum(IMPLEMENTATION_STAGE_CODES).optional(),
  implementation_due_on: nullableDate.optional(),
  integration_systems: nullableText(2000).optional(),
})

export const updateClientApiSchema = z.object({
  version: z.number().int().positive().optional(),
  display_name: z.string().trim().min(1, "Podaj nazwę klienta.").max(200).optional(),
  company_name: nullableText(200).optional(),
  kind: z.enum(["unknown", "person", "company"]).optional(),
  website: nullableText(200).optional(),
  nip: nullableText(20).optional(),
  address: nullableText(500).optional(),
  service_status: z.enum(["active", "inactive"]).optional(),
  archived: z.boolean().optional(),
  implementation_stage: z.enum(IMPLEMENTATION_STAGE_CODES).optional(),
  implementation_due_on: nullableDate.optional(),
  implementation_notes: nullableText(20000).optional(),
  integration_systems: nullableText(2000).optional(),
  integration_docs_status: z.enum(INTEGRATION_DOCS_STATUS_CODES).optional(),
  integration_notes: nullableText(20000).optional(),
})

export const updateImplementationApiSchema = z
  .object({
    stage: z.enum(IMPLEMENTATION_STAGE_CODES).optional(),
    implementation_stage: z.enum(IMPLEMENTATION_STAGE_CODES).optional(),
    due_on: nullableDate.optional(),
    implementation_due_on: nullableDate.optional(),
    notes: nullableText(20000).optional(),
    implementation_notes: nullableText(20000).optional(),
  })
  .refine(
    (data) =>
      data.stage !== undefined ||
      data.implementation_stage !== undefined ||
      data.due_on !== undefined ||
      data.implementation_due_on !== undefined ||
      data.notes !== undefined ||
      data.implementation_notes !== undefined,
    { message: "Podaj przynajmniej jedno pole wdrożenia do aktualizacji." },
  )

export const updateIntegrationApiSchema = z
  .object({
    systems: nullableText(2000).optional(),
    integration_systems: nullableText(2000).optional(),
    docs_status: z.enum(INTEGRATION_DOCS_STATUS_CODES).optional(),
    integration_docs_status: z.enum(INTEGRATION_DOCS_STATUS_CODES).optional(),
    notes: nullableText(20000).optional(),
    integration_notes: nullableText(20000).optional(),
  })
  .refine(
    (data) =>
      data.systems !== undefined ||
      data.integration_systems !== undefined ||
      data.docs_status !== undefined ||
      data.integration_docs_status !== undefined ||
      data.notes !== undefined ||
      data.integration_notes !== undefined,
    { message: "Podaj przynajmniej jedno pole integracji do aktualizacji." },
  )

export const updateDeploymentApiSchema = z
  .object({
    stage: z.enum(IMPLEMENTATION_STAGE_CODES).optional(),
    implementation_stage: z.enum(IMPLEMENTATION_STAGE_CODES).optional(),
    due_on: nullableDate.optional(),
    implementation_due_on: nullableDate.optional(),
    notes: nullableText(20000).optional(),
    implementation_notes: nullableText(20000).optional(),
    integration_systems: nullableText(2000).optional(),
    integration_docs_status: z.enum(INTEGRATION_DOCS_STATUS_CODES).optional(),
    integration_notes: nullableText(20000).optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: "Podaj przynajmniej jedno pole do aktualizacji.",
  })

export const createContactApiSchema = z.object({
  full_name: z.string().trim().min(1, "Podaj imię i nazwisko.").max(200),
  email: nullableText(320).optional(),
  phone: nullableText(40).optional(),
  job_title: nullableText(200).optional(),
  is_primary: z.boolean().optional().default(false),
  confirm_duplicate: z.boolean().optional().default(false),
})

export const updateContactApiSchema = z.object({
  version: z.number().int().positive().optional(),
  full_name: z.string().trim().min(1, "Podaj imię i nazwisko.").max(200).optional(),
  email: nullableText(320).optional(),
  phone: nullableText(40).optional(),
  job_title: nullableText(200).optional(),
  is_primary: z.boolean().optional(),
  archived: z.boolean().optional(),
  confirm_duplicate: z.boolean().optional().default(false),
})

export const addDealToClientApiSchema = z.object({
  title: z.string().trim().min(1, "Podaj tytuł szansy.").max(200),
  product_type: z
    .union([z.enum(PRODUCT_TYPE_CODES), z.literal(""), z.null()])
    .optional()
    .transform((v) => v || null),
  primary_contact_id: nullableUuid.optional(),
  owner_user_id: nullableUuid.optional(),
})

export const createNoteApiSchema = z
  .object({
    account_id: nullableUuid.optional(),
    deal_id: nullableUuid.optional(),
    body: z.string().trim().min(1, "Wpisz treść notatki.").max(20000),
  })
  .refine((data) => Boolean(data.account_id || data.deal_id), {
    message: "Podaj account_id lub deal_id.",
  })

export const updateNoteApiSchema = z.object({
  body: z.string().trim().min(1, "Wpisz treść notatki.").max(20000),
})

export const createTaskApiSchema = z
  .object({
    title: z.string().trim().min(1, "Podaj tytuł zadania.").max(200),
    description: nullableText(20000).optional(),
    due_on: nullableDate.optional(),
    due_time: nullableTime.optional(),
    priority: z.enum(TASK_PRIORITY_CODES).optional().default("normal"),
    status: z.enum(TASK_STATUS_CODES).optional().default("todo"),
    account_id: nullableUuid.optional(),
    deal_id: nullableUuid.optional(),
    assignee_ids: z.array(z.string().uuid()).optional(),
  })
  .refine((data) => !data.due_time || Boolean(data.due_on), {
    message: "Godzina (due_time) wymaga podania daty (due_on).",
    path: ["due_time"],
  })

export const updateTaskApiSchema = z.object({
  version: z.number().int().positive().optional(),
  title: z.string().trim().min(1, "Podaj tytuł zadania.").max(200).optional(),
  description: nullableText(20000).optional(),
  due_on: nullableDate.optional(),
  due_time: nullableTime.optional(),
  priority: z.enum(TASK_PRIORITY_CODES).optional(),
  status: z.enum(TASK_STATUS_CODES).optional(),
  account_id: nullableUuid.optional(),
  deal_id: nullableUuid.optional(),
  assignee_ids: z.array(z.string().uuid()).min(1, "Podaj co najmniej jedną osobę.").optional(),
  archived: z.boolean().optional(),
})

export const completeTaskApiSchema = z.object({
  version: z.number().int().positive().optional(),
})
