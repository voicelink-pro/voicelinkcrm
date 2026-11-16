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
  raw_row: z.record(z.string(), z.unknown()).optional(),
})

export type N8nLeadInput = z.infer<typeof n8nLeadSchema>

function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function cleanPhoneCandidate(value: string) {
  return value.trim().replace(/^p:\s*/i, "").trim()
}

function looksLikePhone(value: string) {
  const raw = value.trim()
  if (!raw || looksLikeEmail(raw) || /^(l|ag|f|c):\d+$/i.test(raw)) return false
  const cleaned = cleanPhoneCandidate(raw)
  if (!/^[+\d()[\]\s.-]+$/.test(cleaned)) return false
  const digits = cleaned.replace(/\D/g, "")
  return digits.length >= 7 && digits.length <= 15
}

export function normalizeIncomingLeadContact(
  contact: N8nLeadInput["contact"],
  rawRow?: Record<string, unknown>,
) {
  let fullName = contact.full_name.trim()
  let email = contact.email.trim()
  let phone = cleanPhoneCandidate(contact.phone)

  // Jeśli n8n przesłał też surowe kolumny wiersza (raw_row), wyciągamy z nich przesunięty telefon (np. p:+48... w kolumnie czy_prowadzisz_lub_zarządzasz...)
  if (rawRow) {
    const entries = Object.entries(rawRow).map(([k, v]) => [
      k.trim(),
      v == null ? "" : String(v).trim(),
    ] as const)

    if (!looksLikePhone(phone)) {
      const pPrefixed = entries.find(([, v]) => /^p:\s*\+?\d/i.test(v) && looksLikePhone(v))
      const anyPhone =
        pPrefixed ??
        entries.find(
          ([k, v]) =>
            !/^(id|ad_id|adset_id|campaign_id|form_id|created_time|row_number)$/i.test(k) &&
            looksLikePhone(v),
        )
      if (anyPhone) {
        phone = cleanPhoneCandidate(anyPhone[1])
      }
    }

    if (!looksLikeEmail(email)) {
      const anyEmail = entries.find(([, v]) => looksLikeEmail(v))
      if (anyEmail) {
        email = anyEmail[1].replace(/@poczta\.onetpl$/i, "@poczta.onet.pl")
      }
    }
  }

  // Naprawa przesuniętych kolumn z arkusza Meta Lead Ads:
  // w tym arkuszu kolumna N ("full_name") trzyma e-mail/domenę, kolumna O ("phone_number") trzyma imię i nazwisko,
  // a kolumna Q ("czy_prowadzisz_lub_zarządzasz...") trzyma telefon z prefiksem "p:+48..."
  if (looksLikeEmail(fullName) && !looksLikeEmail(email)) {
    const detectedEmail = fullName.replace(/@poczta\.onetpl$/i, "@poczta.onet.pl")
    const otherValues = [phone, email].map((v) => v.trim()).filter(Boolean)
    const detectedPhone = otherValues.find((v) => looksLikePhone(v)) ?? ""
    const detectedName =
      otherValues.find(
        (v) =>
          !looksLikePhone(v) &&
          !looksLikeEmail(v) &&
          !/^(tak|nie|yes|no|true|false|qualified|unqualified|created)$/i.test(v),
      ) ?? detectedEmail

    fullName = detectedName.replace(/\s+/g, " ").trim()
    email = detectedEmail
    phone = cleanPhoneCandidate(detectedPhone)
  } else {
    if (email && !looksLikeEmail(email) && /^(tak|nie|yes|no)$/i.test(email)) {
      email = ""
    }
    if (phone && !looksLikePhone(phone) && !looksLikeEmail(phone)) {
      const personName = phone.replace(/\s+/g, " ").trim()
      if (!fullName || fullName === "Lead z formularza") {
        fullName = personName
      } else if (!fullName.toLowerCase().includes(personName.toLowerCase())) {
        fullName = `${personName} (${fullName})`
      }
      phone = ""
    } else if (looksLikePhone(phone)) {
      phone = cleanPhoneCandidate(phone)
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
  const normalized = normalizeIncomingLeadContact(input.contact, input.raw_row)
  return {
    schema_version: input.schema_version,
    event_id: input.event_id,
    source: input.source,
    source_record_id: input.source_record_id,
    is_test: input.is_test,
    contact: normalized,
  }
}
