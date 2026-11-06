"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { getWorkspaceGate } from "@/lib/auth/access"
import { cleanNip, parsePolishMoneyToCents } from "@/lib/crm/invoice-ocr"
import {
  matchAccountForInvoice,
  syncKsefWorkspaceInvoices,
} from "@/lib/crm/ksef-sync"
import { createAdminClient } from "@/lib/supabase/admin"

export type InvoiceActionState = {
  ok?: boolean
  error?: string
  notice?: string
  savedAt?: string
}

function revalidateInvoiceViews() {
  revalidatePath("/invoices")
  revalidatePath("/documents")
  revalidatePath("/clients")
  revalidatePath("/accounts")
}

const ksefSettingsSchema = z.object({
  environment: z.enum(["test", "demo", "prod"]),
  nip: z.string().trim().min(10).max(20),
  companyName: z.string().trim().min(2).max(160),
  authToken: z.string().trim().max(2000).optional(),
  autoSync: z.boolean().default(true),
  syncIntervalMinutes: z.coerce.number().int().min(5).max(1440).default(15),
})

export async function saveKsefConnectionAction(
  _prev: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  const gate = await getWorkspaceGate()
  if (gate.kind !== "member") {
    return { error: "Brak dostępu do obszaru roboczego." }
  }

  const rawNip = cleanNip(String(formData.get("nip") ?? ""))
  if (!rawNip) {
    return { error: "Podaj poprawny 10-cyfrowy NIP firmy." }
  }

  const parsed = ksefSettingsSchema.safeParse({
    environment: formData.get("environment") ?? "test",
    nip: rawNip,
    companyName: formData.get("companyName") ?? "VoiceLink",
    authToken: formData.get("authToken") ?? "",
    autoSync: formData.get("autoSync") === "on" || formData.get("autoSync") === "true",
    syncIntervalMinutes: formData.get("syncIntervalMinutes") ?? 15,
  })

  if (!parsed.success) {
    return { error: "Sprawdź poprawność danych konfiguracji KSeF." }
  }

  const admin = createAdminClient()
  const { data: existing } = await admin
    .from("ksef_connections")
    .select("id, auth_token")
    .eq("workspace_id", gate.workspaceId)
    .maybeSingle()

  const tokenToSave =
    parsed.data.authToken && parsed.data.authToken.trim().length > 0
      ? parsed.data.authToken.trim()
      : existing?.auth_token ?? null

  const { error } = await admin.from("ksef_connections").upsert(
    {
      workspace_id: gate.workspaceId,
      environment: parsed.data.environment,
      nip: parsed.data.nip,
      company_name: parsed.data.companyName,
      auth_token: tokenToSave,
      enabled: true,
      auto_sync: parsed.data.autoSync,
      sync_interval_minutes: parsed.data.syncIntervalMinutes,
      created_by: gate.userId,
      updated_by: gate.userId,
    },
    { onConflict: "workspace_id" },
  )

  if (error) {
    return { error: "Nie udało się zapisać konfiguracji KSeF." }
  }

  // Po zapisaniu połączenia od razu wykonujemy pierwszą synchronizację z KSeF
  const syncResult = await syncKsefWorkspaceInvoices(gate.workspaceId, gate.userId)
  revalidateInvoiceViews()

  return {
    ok: true,
    notice: syncResult.ok
      ? `Połączono z KSeF (${parsed.data.environment.toUpperCase()}) · ${syncResult.message}`
      : `Zapisano konfigurację KSeF. ${syncResult.message}`,
    savedAt: new Date().toISOString(),
  }
}

export async function syncKsefNowAction(): Promise<{
  ok: boolean
  imported: number
  message: string
}> {
  const gate = await getWorkspaceGate()
  if (gate.kind !== "member") {
    return { ok: false, imported: 0, message: "Brak dostępu." }
  }

  const res = await syncKsefWorkspaceInvoices(gate.workspaceId, gate.userId)
  revalidateInvoiceViews()
  return res
}

export async function saveInvoiceAction(
  _prev: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  const gate = await getWorkspaceGate()
  if (gate.kind !== "member") {
    return { error: "Brak dostępu do obszaru roboczego." }
  }

  const invoiceNumber = String(formData.get("invoiceNumber") ?? "").trim()
  if (!invoiceNumber) {
    return { error: "Podaj numer faktury." }
  }

  const kind = formData.get("kind") === "purchase" ? "purchase" : "sales"
  const sourceRaw = String(formData.get("source") ?? "manual")
  const source: "ksef" | "pdf_ocr" | "manual" =
    sourceRaw === "ksef" || sourceRaw === "pdf_ocr" ? sourceRaw : "manual"

  const statusRaw = String(formData.get("status") ?? "issued")
  const status: "draft" | "issued" | "paid" | "overdue" | "cancelled" = [
    "draft",
    "issued",
    "paid",
    "overdue",
    "cancelled",
  ].includes(statusRaw)
    ? (statusRaw as "draft" | "issued" | "paid" | "overdue" | "cancelled")
    : "issued"

  const sellerName = String(formData.get("sellerName") ?? "").trim() || "VoiceLink"
  const sellerNip = cleanNip(String(formData.get("sellerNip") ?? "")) || null
  const buyerName = String(formData.get("buyerName") ?? "").trim()
  if (!buyerName) {
    return { error: "Podaj nazwę nabywcy / kontrahenta." }
  }
  const buyerNip = cleanNip(String(formData.get("buyerNip") ?? "")) || null

  const issueDate =
    String(formData.get("issueDate") ?? "").trim() ||
    new Date().toISOString().slice(0, 10)
  const saleDate = String(formData.get("saleDate") ?? "").trim() || issueDate
  const dueDate = String(formData.get("dueDate") ?? "").trim() || null
  const currency =
    (String(formData.get("currency") ?? "PLN").trim().toUpperCase() || "PLN").slice(0, 3)

  const netCents =
    parsePolishMoneyToCents(String(formData.get("netAmount") ?? "0")) ?? 0
  const vatCents =
    parsePolishMoneyToCents(String(formData.get("vatAmount") ?? "0")) ?? 0
  let grossCents =
    parsePolishMoneyToCents(String(formData.get("grossAmount") ?? "0")) ?? 0

  if (grossCents === 0 && netCents > 0) {
    grossCents = netCents + vatCents
  }

  const ksefReferenceNumber =
    String(formData.get("ksefReferenceNumber") ?? "").trim() || null
  const bankAccount = String(formData.get("bankAccount") ?? "").trim() || null
  const paymentMethod = String(formData.get("paymentMethod") ?? "transfer").trim() || "transfer"
  const notes = String(formData.get("notes") ?? "").trim() || null
  const documentIdRaw = String(formData.get("documentId") ?? "").trim()
  const documentId =
    /^[0-9a-f-]{36}$/i.test(documentIdRaw) ? documentIdRaw : null
  const ocrRawText = String(formData.get("ocrRawText") ?? "").trim() || null
  const ocrConfidenceRaw = Number(formData.get("ocrConfidence") ?? "")
  const ocrConfidence =
    Number.isFinite(ocrConfidenceRaw) && ocrConfidenceRaw > 0
      ? Math.min(100, Math.round(ocrConfidenceRaw))
      : null

  const admin = createAdminClient()

  let accountIdRaw = String(formData.get("accountId") ?? "").trim()
  if (!accountIdRaw) {
    const { data: accountsData } = await admin
      .from("accounts")
      .select("id, display_name, company_name")
      .eq("workspace_id", gate.workspaceId)
      .is("archived_at", null)
      .limit(300)

    const matched = matchAccountForInvoice(
      { buyerName, sellerName, kind },
      (accountsData ?? []).map((a) => ({
        id: a.id,
        displayName: a.display_name,
        companyName: a.company_name,
      })),
    )
    if (matched) accountIdRaw = matched
  }
  const accountId = /^[0-9a-f-]{36}$/i.test(accountIdRaw) ? accountIdRaw : null

  const { error } = await admin.from("invoices").insert({
    workspace_id: gate.workspaceId,
    account_id: accountId,
    document_id: documentId,
    source,
    kind,
    status,
    invoice_number: invoiceNumber,
    ksef_reference_number: ksefReferenceNumber,
    issue_date: issueDate,
    sale_date: saleDate,
    due_date: dueDate,
    paid_at: status === "paid" ? new Date().toISOString() : null,
    seller_name: sellerName,
    seller_nip: sellerNip,
    buyer_name: buyerName,
    buyer_nip: buyerNip,
    currency,
    net_cents: netCents,
    vat_cents: vatCents,
    gross_cents: grossCents,
    payment_method: paymentMethod,
    bank_account: bankAccount,
    notes,
    ocr_raw_text: ocrRawText,
    ocr_confidence: ocrConfidence,
    created_by: gate.userId,
    updated_by: gate.userId,
  })

  if (error) {
    if (error.message?.includes("invoices_workspace_ksef_ref_unique")) {
      return { error: "Faktura o tym numerze referencyjnym KSeF jest już zapisana w CRM." }
    }
    return { error: "Nie udało się zapisać faktury." }
  }

  // Jeśli faktura ma załącznik PDF i powiązano ją z klientem, dopinamy dokument do karty klienta
  if (documentId && accountId) {
    await admin
      .from("document_links")
      .upsert(
        {
          workspace_id: gate.workspaceId,
          document_id: documentId,
          account_id: accountId,
          created_by: gate.userId,
          updated_by: gate.userId,
        },
        { onConflict: "document_id,account_id", ignoreDuplicates: true },
      )
  }

  revalidateInvoiceViews()
  return {
    ok: true,
    notice: `Zapisano fakturę ${invoiceNumber}.`,
    savedAt: new Date().toISOString(),
  }
}

export async function updateInvoiceStatusAction(
  invoiceId: string,
  nextStatus: "draft" | "issued" | "paid" | "overdue" | "cancelled",
): Promise<{ ok: boolean; error?: string }> {
  const gate = await getWorkspaceGate()
  if (gate.kind !== "member") {
    return { ok: false, error: "Brak dostępu." }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from("invoices")
    .update({
      status: nextStatus,
      paid_at: nextStatus === "paid" ? new Date().toISOString() : null,
      updated_by: gate.userId,
    })
    .eq("id", invoiceId)
    .eq("workspace_id", gate.workspaceId)

  if (error) {
    return { ok: false, error: "Nie udało się zmienić statusu faktury." }
  }

  revalidateInvoiceViews()
  return { ok: true }
}

export async function updateInvoiceAccountAction(
  invoiceId: string,
  accountId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const gate = await getWorkspaceGate()
  if (gate.kind !== "member") {
    return { ok: false, error: "Brak dostępu." }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from("invoices")
    .update({
      account_id: accountId || null,
      updated_by: gate.userId,
    })
    .eq("id", invoiceId)
    .eq("workspace_id", gate.workspaceId)

  if (error) {
    return { ok: false, error: "Nie udało się przypisać klienta." }
  }

  revalidateInvoiceViews()
  return { ok: true }
}

export async function deleteInvoiceAction(
  invoiceId: string,
): Promise<{ ok: boolean; error?: string }> {
  const gate = await getWorkspaceGate()
  if (gate.kind !== "member") {
    return { ok: false, error: "Brak dostępu." }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from("invoices")
    .delete()
    .eq("id", invoiceId)
    .eq("workspace_id", gate.workspaceId)

  if (error) {
    return { ok: false, error: "Nie udało się usunąć faktury." }
  }

  revalidateInvoiceViews()
  return { ok: true }
}
