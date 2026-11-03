import { createHash } from "node:crypto"

import { canonicalLeadPayload, type N8nLeadInput } from "@/lib/integrations/n8n/schema"

export function payloadHash(input: N8nLeadInput) {
  return createHash("sha256").update(JSON.stringify(canonicalLeadPayload(input))).digest("hex")
}
