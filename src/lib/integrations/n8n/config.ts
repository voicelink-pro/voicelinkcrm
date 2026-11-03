const DEFAULT_BODY_BYTES = 32 * 1024
const DEFAULT_RATE_LIMIT = 60
const DEFAULT_WINDOW_MS = 60_000

export type N8nConfig = {
  token: string
  workspaceId: string
  maxBodyBytes: number
  rateLimit: number
  windowMs: number
}

export function readN8nConfig(): N8nConfig | null {
  const token = process.env.N8N_LEADS_WEBHOOK_TOKEN?.trim() ?? ""
  const workspaceId = process.env.N8N_LEADS_WORKSPACE_ID?.trim() ?? ""

  if (!token || !workspaceId) {
    return null
  }

  const maxBodyBytes = positiveInt(process.env.N8N_LEADS_MAX_BODY_BYTES, DEFAULT_BODY_BYTES)
  const rateLimit = positiveInt(process.env.N8N_LEADS_RATE_LIMIT, DEFAULT_RATE_LIMIT)

  return {
    token,
    workspaceId,
    maxBodyBytes,
    rateLimit,
    windowMs: DEFAULT_WINDOW_MS,
  }
}

export function n8nTokenConfigured() {
  return Boolean(process.env.N8N_LEADS_WEBHOOK_TOKEN?.trim())
}

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback
  }
  return parsed
}
