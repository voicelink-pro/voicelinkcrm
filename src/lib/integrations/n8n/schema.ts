import { z } from "zod"

const contactField = (max: number) =>
  z.preprocess(
    (value) => (value == null ? "" : value),
    z.string().trim().max(max),
  )

export const n8nLeadSchema = z.object({
  schema_version: z.literal(1),
  event_id: z.string().trim().min(1).max(200),
  source: z.string().trim().min(1).max(80),
  source_record_id: z.string().trim().min(1).max(200),
  is_test: z.boolean().optional().default(false),
  contact: z.object({
    full_name: contactField(200),
    email: contactField(320),
    phone: contactField(40),
  }),
})

export type N8nLeadInput = z.infer<typeof n8nLeadSchema>

export function canonicalLeadPayload(input: N8nLeadInput) {
  return {
    schema_version: input.schema_version,
    event_id: input.event_id,
    source: input.source,
    source_record_id: input.source_record_id,
    is_test: input.is_test,
    contact: {
      full_name: input.contact.full_name,
      email: input.contact.email,
      phone: input.contact.phone,
    },
  }
}
