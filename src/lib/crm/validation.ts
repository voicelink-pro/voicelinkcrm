import { z } from "zod"

import { dealStages, productTypes } from "@/lib/crm/labels"

const optionalText = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((value) => value || null)

const product = z
  .string()
  .optional()
  .transform((value) => {
    const code = value?.trim() ?? ""
    return productTypes.some(([item]) => item === code) ? code : null
  })

export const manualLeadSchema = z.object({
  fullName: z.string().trim().min(1, "Podaj imię i nazwisko.").max(200),
  companyName: optionalText,
  email: z.string().trim().max(320).optional().transform((value) => value || null),
  phone: z.string().trim().max(40).optional().transform((value) => value || null),
  title: optionalText,
  productType: product,
  ownerUserId: z.string().uuid().optional().or(z.literal("")).transform((value) => value || null),
  confirmDuplicate: z.string().optional(),
})

export const contactSchema = z.object({
  accountId: z.string().uuid(),
  fullName: z.string().trim().min(1, "Podaj imię i nazwisko.").max(200),
  jobTitle: optionalText,
  email: z.string().trim().max(320).optional().transform((value) => value || null),
  phone: z.string().trim().max(40).optional().transform((value) => value || null),
  isPrimary: z.string().optional(),
  confirmDuplicate: z.string().optional(),
  version: z.coerce.number().int().positive().optional(),
  contactId: z.string().uuid().optional(),
})

export const dealSchema = z.object({
  dealId: z.string().uuid(),
  version: z.coerce.number().int().positive(),
  title: z.string().trim().min(1, "Podaj tytuł.").max(200),
  productType: product,
  primaryContactId: z.string().uuid().optional().or(z.literal("")).transform((value) => value || null),
  description: z.string().trim().max(20000).optional().transform((value) => value || null),
})

export const stageSchema = z.object({
  dealId: z.string().uuid(),
  version: z.coerce.number().int().positive(),
  stage: z.enum(dealStages.map(([code]) => code) as [string, ...string[]]),
  lostReason: z.string().trim().max(500).optional().transform((value) => value || null),
})

export const ownerSchema = z.object({
  dealId: z.string().uuid(),
  version: z.coerce.number().int().positive(),
  ownerUserId: z.string().uuid().optional().or(z.literal("")).transform((value) => value || null),
})

export const outcomeSchema = z.object({
  dealId: z.string().uuid(),
  outcome: z.enum(["no_answer", "conversation", "other"]),
  summary: z.string().trim().max(2000).optional().transform((value) => value || null),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")).transform((value) => value || null),
  actionKey: z.string().trim().min(1).max(200),
})

export const noteSchema = z.object({
  accountId: z.string().uuid(),
  dealId: z.string().uuid().optional().or(z.literal("")).transform((value) => value || null),
  body: z.string().trim().min(1, "Wpisz treść notatki.").max(20000),
})

export const taskSchema = z.object({
  accountId: z.string().uuid(),
  dealId: z.string().uuid().optional().or(z.literal("")).transform((value) => value || null),
  title: z.string().trim().min(1, "Podaj tytuł zadania.").max(200),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")).transform((value) => value || null),
})

export const accountSchema = z.object({
  accountId: z.string().uuid(),
  version: z.coerce.number().int().positive(),
  displayName: z.string().trim().min(1, "Podaj nazwę.").max(200),
  companyName: optionalText,
  kind: z.enum(["unknown", "person", "company"]),
  website: optionalText,
  nip: optionalText,
  address: z.string().trim().max(500).optional().transform((value) => value || null),
  serviceStatus: z.enum(["active", "inactive"]),
})

export const archiveSchema = z.object({
  entity: z.enum(["account", "deal", "contact"]),
  id: z.string().uuid(),
  version: z.coerce.number().int().positive(),
  archived: z.enum(["1", "0"]),
})

export const extraDealSchema = z.object({
  accountId: z.string().uuid(),
  title: z.string().trim().min(1, "Podaj tytuł.").max(200),
  productType: product,
  primaryContactId: z.string().uuid().optional().or(z.literal("")).transform((value) => value || null),
  ownerUserId: z.string().uuid().optional().or(z.literal("")).transform((value) => value || null),
})

export const mergeSchema = z.object({
  sourceId: z.string().uuid(),
  targetId: z.string().uuid(),
  sourceVersion: z.coerce.number().int().positive(),
  targetVersion: z.coerce.number().int().positive(),
  keepDisplayFrom: z.enum(["source", "target"]),
  keepCompanyFrom: z.enum(["source", "target"]),
  keepKindFrom: z.enum(["source", "target"]),
})

export type CrmFormState = {
  error?: string
  fieldErrors?: Record<string, string>
  duplicate?: boolean
  savedAt?: number
  notice?: string
  links?: { href: string; label: string }[]
}

function polishFieldMessage(message: string) {
  if (message.startsWith("Too big:")) return "Tekst jest za długi."
  if (message.startsWith("Too small:")) return "Uzupełnij to pole."
  if (message.startsWith("Invalid ")) return "Wartość ma niepoprawny format."
  return message
}

export function fieldErrorsFromZod(error: z.ZodError) {
  const fieldErrors: Record<string, string> = {}

  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form")
    if (!fieldErrors[key]) {
      fieldErrors[key] = polishFieldMessage(issue.message)
    }
  }

  return fieldErrors
}
