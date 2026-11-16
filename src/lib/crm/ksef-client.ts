import { constants, publicEncrypt, X509Certificate, type KeyObject } from "node:crypto"

import { cleanNip, type ExtractedInvoiceFields } from "@/lib/crm/invoice-ocr"

export type KsefEnvironment = "test" | "demo" | "prod"

export const ksefEndpoints: Record<KsefEnvironment, { label: string; baseUrl: string }> = {
  test: {
    label: "Środowisko testowe KSeF 2.0 (api-test.ksef.mf.gov.pl)",
    baseUrl: "https://api-test.ksef.mf.gov.pl/v2",
  },
  demo: {
    label: "Środowisko demo KSeF 2.0 (api-demo.ksef.mf.gov.pl)",
    baseUrl: "https://api-demo.ksef.mf.gov.pl/v2",
  },
  prod: {
    label: "Środowisko produkcyjne KSeF 2.0 (api.ksef.mf.gov.pl)",
    baseUrl: "https://api.ksef.mf.gov.pl/v2",
  },
}

export class KsefApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "KsefApiError"
  }
}

export type KsefInvoiceMetadata = {
  ksefNumber?: string
  invoiceNumber?: string
  issueDate?: string
  invoicingDate?: string
  permanentStorageDate?: string
  seller?: { nip?: string; name?: string | null }
  buyer?: {
    identifier?: { type?: string; value?: string }
    name?: string | null
  }
  netAmount?: number
  grossAmount?: number
  vatAmount?: number
  currency?: string
}

type ExceptionBody = {
  exception?: {
    exceptionDetailList?: Array<{
      exceptionDescription?: string
      details?: string | string[]
    }>
  }
  title?: string
  detail?: string
}

type QueryResponse = {
  hasMore?: boolean
  isTruncated?: boolean
  invoices?: KsefInvoiceMetadata[]
}

export function encryptKsefTokenWithKey(publicKey: KeyObject, ksefToken: string, timestampMs: number): string {
  const encrypted = publicEncrypt(
    {
      key: publicKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    Buffer.from(`${ksefToken}|${timestampMs}`, "utf8"),
  )
  return encrypted.toString("base64")
}

export function encryptKsefToken(certificateBase64: string, ksefToken: string, timestampMs: number): string {
  const certificate = new X509Certificate(Buffer.from(certificateBase64, "base64"))
  return encryptKsefTokenWithKey(certificate.publicKey, ksefToken, timestampMs)
}

export function mapKsefMetadataInvoice(
  row: KsefInvoiceMetadata,
  input: { nip: string; companyName: string; kind: "sales" | "purchase" },
): ExtractedInvoiceFields | null {
  const ksefReferenceNumber = row.ksefNumber?.trim() ?? ""
  const invoiceNumber = row.invoiceNumber?.trim() ?? ""
  const issueDate = (row.issueDate ?? row.invoicingDate ?? "").slice(0, 10)
  if (!ksefReferenceNumber || !invoiceNumber || !/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) return null

  const buyerIdentifier = row.buyer?.identifier?.value ?? ""
  return {
    invoiceNumber,
    ksefReferenceNumber,
    issueDate,
    saleDate: issueDate,
    dueDate: "",
    sellerName: row.seller?.name?.trim() || (input.kind === "sales" ? input.companyName : "Sprzedawca KSeF"),
    sellerNip: cleanNip(row.seller?.nip ?? (input.kind === "sales" ? input.nip : "")),
    buyerName: row.buyer?.name?.trim() || (input.kind === "purchase" ? input.companyName : "Nabywca KSeF"),
    buyerNip: cleanNip(buyerIdentifier),
    currency: row.currency?.trim() || "PLN",
    netCents: moneyToCents(row.netAmount),
    vatCents: moneyToCents(row.vatAmount),
    grossCents: moneyToCents(row.grossAmount),
    paymentMethod: "other",
    bankAccount: "",
    kind: input.kind,
    confidence: 100,
    rawText: "",
    lineItems: [],
  }
}

export async function fetchKsefInvoices(input: {
  environment: KsefEnvironment
  nip: string
  companyName: string
  ksefToken: string
  from: Date
}): Promise<ExtractedInvoiceFields[]> {
  const nip = cleanNip(input.nip)
  if (!nip) {
    throw new KsefApiError("NIP firmy w ustawieniach KSeF musi mieć 10 cyfr.")
  }

  const baseUrl = ksefEndpoints[input.environment].baseUrl
  const accessToken = await authenticateWithKsefToken({
    baseUrl,
    nip,
    ksefToken: input.ksefToken,
  })

  const to = new Date()
  const windows = dateWindows(input.from, to, 90)
  const byNumber = new Map<string, ExtractedInvoiceFields>()

  for (const subjectType of ["Subject1", "Subject2"] as const) {
    const kind = subjectType === "Subject1" ? "sales" : "purchase"
    for (const window of windows) {
      const rows = await queryInvoiceMetadata({
        baseUrl,
        accessToken,
        subjectType,
        from: window.from,
        to: window.to,
      })
      for (const row of rows) {
        const mapped = mapKsefMetadataInvoice(row, {
          nip,
          companyName: input.companyName,
          kind,
        })
        if (mapped) byNumber.set(mapped.ksefReferenceNumber, mapped)
      }
    }
  }

  return [...byNumber.values()]
}

async function authenticateWithKsefToken(input: {
  baseUrl: string
  nip: string
  ksefToken: string
}): Promise<string> {
  const challengeRes = await ksefRequest(`${input.baseUrl}/auth/challenge`, {
    method: "POST",
    headers: jsonHeaders(),
    body: "{}",
  })
  if (!challengeRes.ok) {
    throw new KsefApiError(`KSeF odrzucił rozpoczęcie logowania (${await readKsefError(challengeRes)}).`)
  }
  const challenge = (await challengeRes.json()) as { challenge?: string; timestampMs?: number }
  if (!challenge.challenge || typeof challenge.timestampMs !== "number") {
    throw new KsefApiError("Bramka KSeF nie zwróciła wyzwania logowania.")
  }

  const certsRes = await ksefRequest(`${input.baseUrl}/security/public-key-certificates`, {
    method: "GET",
    headers: { Accept: "application/json" },
  })
  if (!certsRes.ok) {
    throw new KsefApiError(`Nie udało się pobrać klucza publicznego KSeF (${await readKsefError(certsRes)}).`)
  }
  const certs = (await certsRes.json()) as Array<{
    certificate?: string
    publicKeyId?: string
    usage?: string[]
  }>
  const cert = certs.find((item) => item.usage?.includes("KsefTokenEncryption") && item.certificate)
  if (!cert?.certificate) {
    throw new KsefApiError("Bramka KSeF nie zwróciła klucza do szyfrowania tokena.")
  }

  const encryptedToken = encryptKsefToken(cert.certificate, input.ksefToken, challenge.timestampMs)
  const initRes = await ksefRequest(`${input.baseUrl}/auth/ksef-token`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({
      challenge: challenge.challenge,
      contextIdentifier: { type: "Nip", value: input.nip },
      encryptedToken,
      publicKeyId: cert.publicKeyId,
    }),
  })
  if (!initRes.ok) {
    throw new KsefApiError(`KSeF odrzucił token (${await readKsefError(initRes)}).`)
  }

  const init = (await initRes.json()) as {
    referenceNumber?: string
    authenticationToken?: { token?: string }
  }
  const operationToken = init.authenticationToken?.token
  if (!init.referenceNumber || !operationToken) {
    throw new KsefApiError("KSeF nie rozpoczął sesji logowania.")
  }

  let statusCode = 100
  let statusDetail = ""
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const statusRes = await ksefRequest(
      `${input.baseUrl}/auth/${encodeURIComponent(init.referenceNumber)}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${operationToken}`,
        },
      },
    )
    if (!statusRes.ok) {
      throw new KsefApiError(`Nie udało się sprawdzić logowania KSeF (${await readKsefError(statusRes)}).`)
    }
    const statusBody = (await statusRes.json()) as {
      status?: { code?: number; description?: string; details?: string | string[] }
    }
    statusCode = statusBody.status?.code ?? 500
    statusDetail = joinStatus(statusBody.status?.description, statusBody.status?.details)
    if (statusCode !== 100) break
    await delay(500)
  }

  if (statusCode !== 200) {
    throw new KsefApiError(statusDetail || "Logowanie tokenem KSeF nie powiodło się.")
  }

  const redeemRes = await ksefRequest(`${input.baseUrl}/auth/token/redeem`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${operationToken}`,
    },
  })
  if (!redeemRes.ok) {
    throw new KsefApiError(`KSeF nie wydał tokena dostępu (${await readKsefError(redeemRes)}).`)
  }
  const redeemed = (await redeemRes.json()) as { accessToken?: { token?: string } }
  if (!redeemed.accessToken?.token) {
    throw new KsefApiError("KSeF nie zwrócił tokena dostępu.")
  }
  return redeemed.accessToken.token
}

async function queryInvoiceMetadata(input: {
  baseUrl: string
  accessToken: string
  subjectType: "Subject1" | "Subject2"
  from: string
  to: string
}): Promise<KsefInvoiceMetadata[]> {
  const collected: KsefInvoiceMetadata[] = []
  let from = input.from

  for (let slice = 0; slice < 12; slice += 1) {
    let pageOffset = 0
    let truncatedAt: string | null = null

    for (;;) {
      const url = new URL(`${input.baseUrl}/invoices/query/metadata`)
      url.searchParams.set("sortOrder", "Asc")
      url.searchParams.set("pageOffset", String(pageOffset))
      url.searchParams.set("pageSize", "100")

      const res = await ksefRequest(url.toString(), {
        method: "POST",
        headers: {
          ...jsonHeaders(),
          Authorization: `Bearer ${input.accessToken}`,
        },
        body: JSON.stringify({
          subjectType: input.subjectType,
          dateRange: {
            dateType: "PermanentStorage",
            from,
            to: input.to,
          },
        }),
      })
      if (!res.ok) {
        throw new KsefApiError(`KSeF odrzucił pobranie faktur (${await readKsefError(res)}).`)
      }

      const body = (await res.json()) as QueryResponse
      const invoices = body.invoices ?? []
      collected.push(...invoices)

      if (!body.hasMore) {
        truncatedAt = null
        break
      }
      if (body.isTruncated && invoices.length > 0) {
        truncatedAt = invoices[invoices.length - 1]?.permanentStorageDate ?? null
        break
      }
      pageOffset += 1
      if (pageOffset > 20) break
    }

    if (!truncatedAt || truncatedAt === from) break
    from = truncatedAt
  }

  return collected
}

function dateWindows(from: Date, to: Date, days: number): Array<{ from: string; to: string }> {
  const windows: Array<{ from: string; to: string }> = []
  let cursor = from.getTime()
  const end = to.getTime()
  const span = days * 86_400_000
  while (cursor < end) {
    const next = Math.min(end, cursor + span)
    windows.push({
      from: new Date(cursor).toISOString(),
      to: new Date(next).toISOString(),
    })
    cursor = next
  }
  return windows
}

function moneyToCents(value: number | undefined): number {
  const amount = Number(value ?? 0)
  if (!Number.isFinite(amount)) return 0
  return Math.round((amount + Number.EPSILON) * 100)
}

function jsonHeaders(): HeadersInit {
  return { Accept: "application/json", "Content-Type": "application/json" }
}

async function ksefRequest(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    })
  } catch {
    throw new KsefApiError("Nie udało się połączyć z bramką KSeF 2.0.")
  }
}

async function readKsefError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "")
  try {
    const body = JSON.parse(text) as ExceptionBody
    const details = body.exception?.exceptionDetailList
      ?.map((item) => joinStatus(item.exceptionDescription, item.details))
      .filter(Boolean)
    if (details && details.length > 0) return details.join(" ")
    if (body.detail) return body.detail
    if (body.title) return body.title
  } catch {
    // odpowiedź nie jest JSON-em
  }
  return `HTTP ${res.status}`
}

function joinStatus(description?: string, details?: string | string[]): string {
  const extra = Array.isArray(details) ? details.filter(Boolean).join(" ") : details?.trim()
  return [description?.trim(), extra].filter(Boolean).join(": ")
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
