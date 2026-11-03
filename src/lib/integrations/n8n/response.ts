export type ImportResult = {
  status?: string
  deal_id?: string
  account_id?: string
  review_id?: string
  replayed?: boolean
}

export function readImportResult(value: unknown): ImportResult {
  if (!value || typeof value !== "object") {
    return {}
  }

  const row = value as Record<string, unknown>
  return {
    status: typeof row.status === "string" ? row.status : undefined,
    deal_id: typeof row.deal_id === "string" ? row.deal_id : undefined,
    account_id: typeof row.account_id === "string" ? row.account_id : undefined,
    review_id: typeof row.review_id === "string" ? row.review_id : undefined,
    replayed: row.replayed === true,
  }
}

export function importHttpStatus(result: ImportResult) {
  if (result.status === "created" && !result.replayed) {
    return 201
  }

  if (result.status === "review" || result.status === "invalid") {
    return 202
  }

  return 200
}

export function publicImportBody(
  result: ImportResult,
  eventId: string,
  correlationId: string,
) {
  return {
    status: result.status === "invalid" ? "review" : (result.status ?? "accepted"),
    event_id: eventId,
    lead_id: result.deal_id ?? null,
    account_id: result.account_id ?? null,
    review_id: result.review_id ?? null,
    correlation_id: correlationId,
  }
}
