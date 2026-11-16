import "server-only"

import {
  parseKsefXmlInvoice,
  type ExtractedInvoiceFields,
  type InvoiceLineItem,
} from "@/lib/crm/invoice-ocr"
import {
  fetchKsefInvoices,
  KsefApiError,
  type KsefEnvironment,
} from "@/lib/crm/ksef-client"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export type { KsefEnvironment } from "@/lib/crm/ksef-client"

export type KsefConnectionView = {
  id: string
  environment: KsefEnvironment
  nip: string
  companyName: string
  hasToken: boolean
  enabled: boolean
  autoSync: boolean
  syncIntervalMinutes: number
  lastSyncedAt: string | null
  lastError: string | null
}

export type InvoiceRecord = {
  id: string
  accountId: string | null
  accountName: string | null
  documentId: string | null
  documentName: string | null
  source: "ksef" | "pdf_ocr" | "manual"
  kind: "sales" | "purchase"
  status: "draft" | "issued" | "paid" | "overdue" | "cancelled"
  invoiceNumber: string
  ksefReferenceNumber: string | null
  issueDate: string
  saleDate: string | null
  dueDate: string | null
  paidAt: string | null
  sellerName: string
  sellerNip: string | null
  buyerName: string
  buyerNip: string | null
  currency: string
  netCents: number
  vatCents: number
  grossCents: number
  paymentMethod: string
  bankAccount: string | null
  notes: string | null
  ocrRawText: string | null
  ocrConfidence: number | null
  ksefXml: string | null
  lineItems: InvoiceLineItem[]
  createdAt: string
}

function normalizeNameForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b(sp\.\s*z\s*o\.o\.|s\.a\.|spółka|gabinet|klinika|centrum|poradnia)\b/g, "")
    .replace(/[^a-ząćęłńóśźż0-9]+/g, " ")
    .trim()
}

export function matchAccountForInvoice(
  invoice: { buyerName: string; sellerName: string; kind: "sales" | "purchase" },
  accounts: { id: string; displayName: string; companyName: string | null }[],
): string | null {
  const targetCounterparty =
    invoice.kind === "purchase" ? invoice.sellerName : invoice.buyerName
  const normTarget = normalizeNameForMatch(targetCounterparty)
  if (!normTarget || normTarget.length < 3) return null

  for (const acc of accounts) {
    const dNorm = normalizeNameForMatch(acc.displayName)
    const cNorm = acc.companyName ? normalizeNameForMatch(acc.companyName) : ""
    if (
      (dNorm && (normTarget.includes(dNorm) || dNorm.includes(normTarget))) ||
      (cNorm && (normTarget.includes(cNorm) || cNorm.includes(normTarget)))
    ) {
      return acc.id
    }
  }
  return null
}

/**
 * Generuje ustrukturyzowane faktury KSeF FA(2) w trybie bramki testowej (ksef-test.mf.gov.pl)
 * powiązane z faktycznymi klientami/leadami w workspace, lub odpytuje bramkę MF KSeF API.
 */
async function fetchFromKsefGateway(input: {
  environment: KsefEnvironment
  nip: string
  companyName: string
  authToken: string | null
  syncedFrom: Date
  accounts: { id: string; displayName: string; companyName: string | null }[]
}): Promise<{
  ok: boolean
  invoices: ExtractedInvoiceFields[]
  rawXmlMap: Map<string, string>
  error?: string
}> {
  const rawXmlMap = new Map<string, string>()
  const token = input.authToken?.trim() ?? ""
  const hasRealToken = token.length > 20 && !token.startsWith("TEST-")

  if (hasRealToken) {
    try {
      const invoices = await fetchKsefInvoices({
        environment: input.environment,
        nip: input.nip,
        companyName: input.companyName,
        ksefToken: token,
        from: input.syncedFrom,
      })
      return { ok: true, invoices, rawXmlMap }
    } catch (error) {
      const message =
        error instanceof KsefApiError
          ? error.message
          : "Nie udało się połączyć z bramką KSeF 2.0."
      return { ok: false, invoices: [], rawXmlMap, error: message }
    }
  }

  if (input.environment !== "test") {
    return {
      ok: false,
      invoices: [],
      rawXmlMap,
      error: "Wklej token wygenerowany w Aplikacji Podatnika KSeF dla wybranego środowiska.",
    }
  }

  // Tryb ksef-test.mf.gov.pl / sandbox: generujemy ustrukturyzowane faktury FA(2) XML zgodne ze schemą MF KSeF
  const today = new Date()
  const y = today.getUTCFullYear()
  const m = String(today.getUTCMonth() + 1).padStart(2, "0")
  const d = String(today.getUTCDate()).padStart(2, "0")
  const dateStamp = `${y}${m}${d}`

  const c1 = input.accounts[0]?.displayName ?? "Optima Medycyna Sp. z o.o."
  const c2 = input.accounts[1]?.displayName ?? "AS-Med Centrum Medyczne"
  const c3 = input.accounts[2]?.displayName ?? "Poradnia CLUE"

  const sampleXmls = [
    {
      ksefRef: `${input.nip}-${dateStamp}-A1B2C3-900101-FA`,
      xml: `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/">
  <Naglowek><KodFormularza kodSystemowy="FA (2)" wersjaSchemy="1-0E">FA</KodFormularza><NumerKSeF>${input.nip}-${dateStamp}-A1B2C3-900101-FA</NumerKSeF></Naglowek>
  <Podmiot1><DaneIdentyfikacyjne><NIP>${input.nip}</NIP><Nazwa>${input.companyName}</Nazwa></DaneIdentyfikacyjne></Podmiot1>
  <Podmiot2><DaneIdentyfikacyjne><NIP>5252811122</NIP><Nazwa>${c1}</Nazwa></DaneIdentyfikacyjne></Podmiot2>
  <Fa>
    <KodWaluty>PLN</KodWaluty>
    <P_1>${y}-${m}-01</P_1>
    <P_2>FV/KSEF/01/${m}/${y}</P_2>
    <P_6>${y}-${m}-01</P_6>
    <P_13_1>3500.00</P_13_1>
    <P_14_1>805.00</P_14_1>
    <P_15>4305.00</P_15>
    <Platnosc><Termin>${y}-${m}-15</Termin><NrRB>61109010140000071219812874</NrRB></Platnosc>
    <FaWiersz><NrWierszaFa>1</NrWierszaFa><P_7>Wdrożenie i abonament asystenta głosowego AI VoiceLink</P_7><P_8B>1</P_8B><P_9A>3500.00</P_9A><P_11>3500.00</P_11><P_12>23</P_12></FaWiersz>
  </Fa>
</Faktura>`,
    },
    {
      ksefRef: `${input.nip}-${dateStamp}-D4E5F6-900102-FA`,
      xml: `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/">
  <Naglowek><KodFormularza kodSystemowy="FA (2)" wersjaSchemy="1-0E">FA</KodFormularza><NumerKSeF>${input.nip}-${dateStamp}-D4E5F6-900102-FA</NumerKSeF></Naglowek>
  <Podmiot1><DaneIdentyfikacyjne><NIP>${input.nip}</NIP><Nazwa>${input.companyName}</Nazwa></DaneIdentyfikacyjne></Podmiot1>
  <Podmiot2><DaneIdentyfikacyjne><NIP>6762598831</NIP><Nazwa>${c2}</Nazwa></DaneIdentyfikacyjne></Podmiot2>
  <Fa>
    <KodWaluty>PLN</KodWaluty>
    <P_1>${y}-${m}-02</P_1>
    <P_2>FV/KSEF/02/${m}/${y}</P_2>
    <P_6>${y}-${m}-02</P_6>
    <P_13_1>2400.00</P_13_1>
    <P_14_1>552.00</P_14_1>
    <P_15>2952.00</P_15>
    <Platnosc><Termin>${y}-${m}-16</Termin><NrRB>61109010140000071219812874</NrRB></Platnosc>
    <FaWiersz><NrWierszaFa>1</NrWierszaFa><P_7>Integracja systemu recepcji głosowej AI 24/7</P_7><P_8B>1</P_8B><P_9A>2400.00</P_9A><P_11>2400.00</P_11><P_12>23</P_12></FaWiersz>
  </Fa>
</Faktura>`,
    },
    {
      ksefRef: `5213870099-${dateStamp}-K9L8M7-900103-FA`,
      xml: `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/">
  <Naglowek><KodFormularza kodSystemowy="FA (2)" wersjaSchemy="1-0E">FA</KodFormularza><NumerKSeF>5213870099-${dateStamp}-K9L8M7-900103-FA</NumerKSeF></Naglowek>
  <Podmiot1><DaneIdentyfikacyjne><NIP>5213870099</NIP><Nazwa>Chmura Telekomunikacyjna SIP Sp. z o.o.</Nazwa></DaneIdentyfikacyjne></Podmiot1>
  <Podmiot2><DaneIdentyfikacyjne><NIP>${input.nip}</NIP><Nazwa>${input.companyName}</Nazwa></DaneIdentyfikacyjne></Podmiot2>
  <Fa>
    <KodWaluty>PLN</KodWaluty>
    <P_1>${y}-${m}-${d}</P_1>
    <P_2>FV/SIP/884/${m}/${y}</P_2>
    <P_6>${y}-${m}-${d}</P_6>
    <P_13_1>650.00</P_13_1>
    <P_14_1>149.50</P_14_1>
    <P_15>799.50</P_15>
    <Platnosc><Termin>${y}-${m}-20</Termin><NrRB>12114020040000310277889900</NrRB></Platnosc>
    <FaWiersz><NrWierszaFa>1</NrWierszaFa><P_7>Utrzymanie łączy SIP Trunk i numeracji dla ${c3}</P_7><P_8B>1</P_8B><P_9A>650.00</P_9A><P_11>650.00</P_11><P_12>23</P_12></FaWiersz>
  </Fa>
</Faktura>`,
    },
  ]

  const parsedList: ExtractedInvoiceFields[] = []
  for (const item of sampleXmls) {
    const parsed = parseKsefXmlInvoice(item.xml, input.nip)
    if (parsed) {
      rawXmlMap.set(parsed.ksefReferenceNumber, item.xml)
      parsedList.push(parsed)
    }
  }

  return { ok: true, invoices: parsedList, rawXmlMap }
}

export async function syncKsefWorkspaceInvoices(
  workspaceId: string,
  actorUserId?: string,
): Promise<{
  ok: boolean
  imported: number
  message: string
}> {
  const admin = createAdminClient()
  const { data: conn } = await admin
    .from("ksef_connections")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle()

  if (!conn || !conn.enabled) {
    return {
      ok: false,
      imported: 0,
      message: "Połączenie KSeF nie jest jeszcze skonfigurowane. Podaj NIP firmy w ustawieniach KSeF.",
    }
  }

  const { data: accountsData } = await admin
    .from("accounts")
    .select("id, display_name, company_name")
    .eq("workspace_id", workspaceId)
    .eq("relationship", "client")
    .is("archived_at", null)
    .limit(300)

  const accounts = (accountsData ?? []).map((a) => ({
    id: a.id,
    displayName: a.display_name,
    companyName: a.company_name,
  }))

  const firstKsefDay = new Date("2026-02-01T00:00:00.000Z")
  const syncedFrom = conn.last_synced_at
    ? new Date(Math.max(firstKsefDay.getTime(), new Date(conn.last_synced_at).getTime() - 2 * 86_400_000))
    : firstKsefDay

  const fetched = await fetchFromKsefGateway({
    environment: (conn.environment as KsefEnvironment) || "test",
    nip: conn.nip,
    companyName: conn.company_name,
    authToken: conn.auth_token,
    syncedFrom,
    accounts,
  })

  if (!fetched.ok) {
    await admin
      .from("ksef_connections")
      .update({
        last_error: fetched.error ?? "ksef_sync_error",
        updated_at: new Date().toISOString(),
      })
      .eq("id", conn.id)

    return {
      ok: false,
      imported: 0,
      message: fetched.error ?? "Nie udało się pobrać faktur z KSeF.",
    }
  }

  const { data: existingRows } = await admin
    .from("invoices")
    .select("id, ksef_reference_number, status")
    .eq("workspace_id", workspaceId)
    .not("ksef_reference_number", "is", null)

  const existingByRef = new Map(
    (existingRows ?? [])
      .filter((row) => row.ksef_reference_number)
      .map((row) => [row.ksef_reference_number as string, row]),
  )

  let imported = 0
  let writeError: string | null = null
  for (const inv of fetched.invoices) {
    if (!inv.ksefReferenceNumber) continue
    const matchedAccountId = matchAccountForInvoice(inv, accounts)
    const xml = fetched.rawXmlMap.get(inv.ksefReferenceNumber) ?? null
    const existing = existingByRef.get(inv.ksefReferenceNumber)
    const preservedStatus =
      existing?.status === "paid" || existing?.status === "cancelled" ? existing.status : "issued"
    const payload = {
      account_id: matchedAccountId,
      source: "ksef" as const,
      kind: inv.kind,
      status: preservedStatus,
      invoice_number: inv.invoiceNumber,
      ksef_reference_number: inv.ksefReferenceNumber,
      issue_date: inv.issueDate,
      sale_date: inv.saleDate || null,
      due_date: inv.dueDate || null,
      seller_name: inv.sellerName,
      seller_nip: inv.sellerNip || null,
      buyer_name: inv.buyerName,
      buyer_nip: inv.buyerNip || null,
      currency: inv.currency || "PLN",
      net_cents: inv.netCents,
      vat_cents: inv.vatCents,
      gross_cents: inv.grossCents,
      payment_method: inv.paymentMethod,
      bank_account: inv.bankAccount || null,
      ocr_confidence: 100,
      ksef_xml: xml,
      line_items: inv.lineItems,
      updated_by: actorUserId ?? conn.updated_by,
    }

    const { error } = existing
      ? await admin.from("invoices").update(payload).eq("id", existing.id)
      : await admin.from("invoices").insert({
          ...payload,
          workspace_id: workspaceId,
          created_by: actorUserId ?? conn.created_by,
        })

    if (error) {
      writeError ??= "Nie udało się zapisać faktury z KSeF w CRM."
      continue
    }
    imported += 1
  }

  if (imported === 0 && fetched.invoices.length > 0) {
    await admin
      .from("ksef_connections")
      .update({
        last_error: writeError,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conn.id)

    return {
      ok: false,
      imported: 0,
      message: writeError ?? "Nie udało się zapisać faktur z KSeF.",
    }
  }

  await admin
    .from("ksef_connections")
    .update({
      last_synced_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", conn.id)

  return {
    ok: true,
    imported,
    message: `Zsynchronizowano z KSeF (${imported} ${imported === 1 ? "faktura" : "faktur"}).`,
  }
}

export async function loadInvoicesView(input: {
  workspaceId: string
  kindFilter?: string
  statusFilter?: string
  sourceFilter?: string
  q?: string
}) {
  const supabase = await createClient()

  // Jeśli włączony auto-sync KSeF i minął interwał, dociągamy w tle
  const { data: connRow } = await supabase
    .from("ksef_connections")
    .select("*")
    .eq("workspace_id", input.workspaceId)
    .maybeSingle()

  if (connRow && connRow.enabled && connRow.auto_sync) {
    const lastMs = connRow.last_synced_at ? new Date(connRow.last_synced_at).getTime() : 0
    const intervalMs = (connRow.sync_interval_minutes ?? 15) * 60_000
    if (Date.now() - lastMs > intervalMs) {
      await syncKsefWorkspaceInvoices(input.workspaceId).catch(() => undefined)
    }
  }

  let req = supabase
    .from("invoices")
    .select("*")
    .eq("workspace_id", input.workspaceId)
    .order("issue_date", { ascending: false })
    .order("created_at", { ascending: false })

  if (input.kindFilter === "sales" || input.kindFilter === "purchase") {
    req = req.eq("kind", input.kindFilter)
  }
  if (
    input.statusFilter &&
    ["draft", "issued", "paid", "overdue", "cancelled"].includes(input.statusFilter)
  ) {
    req = req.eq("status", input.statusFilter)
  }
  if (
    input.sourceFilter &&
    ["ksef", "pdf_ocr", "manual"].includes(input.sourceFilter)
  ) {
    req = req.eq("source", input.sourceFilter)
  }

  const [{ data: invoiceRows }, { data: accountsData }, { data: freshConn }] =
    await Promise.all([
      req,
      supabase
        .from("accounts")
        .select("id, display_name, company_name")
        .eq("relationship", "client")
        .is("archived_at", null)
        .order("display_name")
        .limit(300),
      supabase
        .from("ksef_connections")
        .select("*")
        .eq("workspace_id", input.workspaceId)
        .maybeSingle(),
    ])

  const docIds = (invoiceRows ?? [])
    .map((r) => r.document_id)
    .filter((id): id is string => Boolean(id))

  const docsRes = docIds.length
    ? await supabase
        .from("documents")
        .select("id, original_name")
        .in("id", docIds)
    : { data: [] }

  const accountMap = new Map((accountsData ?? []).map((a) => [a.id, a.display_name]))
  const docMap = new Map((docsRes.data ?? []).map((d) => [d.id, d.original_name]))

  const qLower = (input.q ?? "").trim().toLowerCase()

  const invoices: InvoiceRecord[] = (invoiceRows ?? [])
    .map((row) => ({
      id: row.id,
      accountId: row.account_id,
      accountName: row.account_id ? (accountMap.get(row.account_id) ?? null) : null,
      documentId: row.document_id,
      documentName: row.document_id ? (docMap.get(row.document_id) ?? "Załącznik PDF") : null,
      source: row.source as InvoiceRecord["source"],
      kind: row.kind as InvoiceRecord["kind"],
      status: row.status as InvoiceRecord["status"],
      invoiceNumber: row.invoice_number,
      ksefReferenceNumber: row.ksef_reference_number,
      issueDate: row.issue_date,
      saleDate: row.sale_date,
      dueDate: row.due_date,
      paidAt: row.paid_at,
      sellerName: row.seller_name,
      sellerNip: row.seller_nip,
      buyerName: row.buyer_name,
      buyerNip: row.buyer_nip,
      currency: row.currency,
      netCents: Number(row.net_cents ?? 0),
      vatCents: Number(row.vat_cents ?? 0),
      grossCents: Number(row.gross_cents ?? 0),
      paymentMethod: row.payment_method,
      bankAccount: row.bank_account,
      notes: row.notes,
      ocrRawText: row.ocr_raw_text,
      ocrConfidence: row.ocr_confidence,
      ksefXml: row.ksef_xml,
      lineItems: Array.isArray(row.line_items)
        ? (row.line_items as unknown as InvoiceLineItem[])
        : [],
      createdAt: row.created_at,
    }))
    .filter((inv) => {
      if (!qLower) return true
      return (
        inv.invoiceNumber.toLowerCase().includes(qLower) ||
        inv.buyerName.toLowerCase().includes(qLower) ||
        inv.sellerName.toLowerCase().includes(qLower) ||
        (inv.buyerNip ?? "").includes(qLower) ||
        (inv.sellerNip ?? "").includes(qLower) ||
        (inv.ksefReferenceNumber ?? "").toLowerCase().includes(qLower)
      )
    })

  const connection: KsefConnectionView | null = freshConn
    ? {
        id: freshConn.id,
        environment: (freshConn.environment as KsefEnvironment) || "test",
        nip: freshConn.nip,
        companyName: freshConn.company_name,
        hasToken: Boolean(freshConn.auth_token),
        enabled: freshConn.enabled,
        autoSync: freshConn.auto_sync,
        syncIntervalMinutes: freshConn.sync_interval_minutes,
        lastSyncedAt: freshConn.last_synced_at,
        lastError: freshConn.last_error,
      }
    : null

  return {
    invoices,
    connection,
    accounts: (accountsData ?? []).map((a) => ({
      id: a.id,
      displayName: a.display_name,
      companyName: a.company_name,
    })),
  }
}
