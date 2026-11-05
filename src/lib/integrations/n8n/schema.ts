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

function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function looksLikePhone(value: string) {
  const digits = value.replace(/\D/g, "")
  return digits.length >= 7 && digits.length <= 15
}

export function normalizeIncomingLeadContact(contact: N8nLeadInput["contact"]) {
  let fullName = contact.full_name.trim()
  let email = contact.email.trim()
  let phone = contact.phone.trim()

  // Naprawa przesuniętych kolumn z arkusza Meta Lead Ads (np. gdy full_name trzyma e-mail, phone trzyma imię i nazwisko, a email trzyma "tak")
  if (looksLikeEmail(fullName) && !looksLikeEmail(email)) {
    const detectedEmail = fullName.replace(/@poczta\.onetpl$/i, "@poczta.onet.pl")
    const otherValues = [phone, email].map((v) => v.trim()).filter(Boolean)
    const detectedPhone = otherValues.find((v) => looksLikePhone(v)) ?? ""
    const detectedName =
      otherValues.find(
        (v) =>
          !looksLikePhone(v) &&
          !looksLikeEmail(v) &&
          !/^(tak|nie|yes|no|true|false)$/i.test(v),
      ) ?? detectedEmail

    fullName = detectedName.replace(/\s+/g, " ").trim()
    email = detectedEmail
    phone = detectedPhone
  } else {
    if (email && !looksLikeEmail(email) && /^(tak|nie|yes|no)$/i.test(email)) {
      email = ""
    }
    if (phone && !looksLikePhone(phone) && !looksLikeEmail(phone)) {
      if (!fullName || fullName === "Lead z formularza") {
        fullName = phone.replace(/\s+/g, " ").trim()
      }
      phone = ""
    }
    email = email.replace(/@poczta\.onetpl$/i, "@poczta.onet.pl")
  }

  return {
    full_name: fullName.slice(0, 200),
    email: email.slice(0, 320),
    phone: phone.slice(0, 40),
  }
}

export function canonicalLeadPayload(input: N8nLeadInput) {
  const normalized = normalizeIncomingLeadContact(input.contact)
  return {
    schema_version: input.schema_version,
    event_id: input.event_id,
    source: input.source,
    source_record_id: input.source_record_id,
    is_test: input.is_test,
    contact: normalized,
  }
}
