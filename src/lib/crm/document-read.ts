import "server-only"

import { createClient } from "@/lib/supabase/server"

import { documentPageSize, type DocumentQuery } from "@/lib/crm/document-query"

const readError = "Nie udało się wczytać dokumentów."

export type DocumentListRow = {
  id: string
  originalName: string
  mimeType: string
  category: string
  sizeBytes: number
  status: string
  createdAt: string
  uploadedBy: string
  linkLabel: string
}

export async function getDocumentPolicy() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("automation_settings")
    .select("document_max_bytes, document_mime_types")
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    return { maxBytes: null, mimeTypes: [] as string[], error: readError }
  }

  return {
    maxBytes: data.document_max_bytes,
    mimeTypes: data.document_mime_types,
    error: null,
  }
}

export async function listDocuments(query: DocumentQuery) {
  const supabase = await createClient()
  const from = (query.page - 1) * documentPageSize
  const to = from + documentPageSize - 1
  let request = supabase
    .from("documents")
    .select(
      "id, original_name, mime_type, category, size_bytes, status, created_at, uploaded_by",
      { count: "exact" },
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to)

  if (query.category) {
    request = request.eq("category", query.category)
  }

  const needle = query.q.replace(/[%_\\]/g, "")
  if (needle) {
    request = request.ilike("original_name", `%${needle}%`)
  }

  const listed = await request
  if (listed.error) {
    return { rows: [] as DocumentListRow[], count: 0, error: readError }
  }

  const ids = (listed.data ?? []).map((row) => row.id)
  const links = ids.length
    ? await supabase
        .from("document_links")
        .select("document_id, account_id, deal_id")
        .in("document_id", ids)
    : { data: [], error: null }

  if (links.error) {
    return { rows: [] as DocumentListRow[], count: 0, error: readError }
  }

  const present = (value: string | null): value is string => value != null
  const accountIds = [...new Set((links.data ?? []).map((link) => link.account_id).filter(present))]
  const dealIds = [...new Set((links.data ?? []).map((link) => link.deal_id).filter(present))]

  const [accounts, deals] = await Promise.all([
    accountIds.length
      ? supabase.from("accounts").select("id, display_name").in("id", accountIds)
      : Promise.resolve({ data: [] }),
    dealIds.length
      ? supabase.from("deals").select("id, title").in("id", dealIds)
      : Promise.resolve({ data: [] }),
  ])

  const accountNames = new Map((accounts.data ?? []).map((row) => [row.id, row.display_name]))
  const dealNames = new Map((deals.data ?? []).map((row) => [row.id, row.title]))
  const labels = new Map<string, string[]>()

  for (const link of links.data ?? []) {
    const current = labels.get(link.document_id) ?? []
    if (link.account_id) current.push(accountNames.get(link.account_id) ?? "Klient")
    if (link.deal_id) current.push(dealNames.get(link.deal_id) ?? "Szansa")
    labels.set(link.document_id, current)
  }

  return {
    rows: (listed.data ?? []).map((row) => ({
      id: row.id,
      originalName: row.original_name,
      mimeType: row.mime_type,
      category: row.category,
      sizeBytes: row.size_bytes,
      status: row.status,
      createdAt: row.created_at,
      uploadedBy: row.uploaded_by,
      linkLabel: labels.get(row.id)?.join(", ") || "Dokument ogólny",
    })),
    count: listed.count ?? 0,
    error: null,
  }
}

export async function listLinkedDocuments(target: {
  accountId?: string
  dealId?: string
}) {
  const supabase = await createClient()
  let request = supabase.from("document_links").select("document_id")

  if (target.accountId) request = request.eq("account_id", target.accountId)
  if (target.dealId) request = request.eq("deal_id", target.dealId)

  const links = await request
  if (links.error) {
    return {
      rows: [] as { id: string; originalName: string; category: string; status: string }[],
      error: readError,
    }
  }

  const ids = [...new Set((links.data ?? []).map((link) => link.document_id))]
  if (ids.length === 0) {
    return { rows: [], error: null }
  }

  const documents = await supabase
    .from("documents")
    .select("id, original_name, category, status, created_at")
    .in("id", ids)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })

  if (documents.error) {
    return { rows: [], error: readError }
  }

  return {
    rows: (documents.data ?? []).map((row) => ({
      id: row.id,
      originalName: row.original_name,
      category: row.category,
      status: row.status,
    })),
    error: null,
  }
}

export async function getDocument(documentId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("documents")
    .select(
      "id, original_name, mime_type, category, size_bytes, status, created_at, uploaded_by, deleted_at",
    )
    .eq("id", documentId)
    .maybeSingle()

  if (error) {
    return { document: null, links: [], error: readError }
  }

  if (!data || data.deleted_at) {
    return { document: null, links: [], error: null }
  }

  const links = await supabase
    .from("document_links")
    .select("id, account_id, deal_id")
    .eq("document_id", data.id)

  if (links.error) {
    return { document: null, links: [], error: readError }
  }

  const accountIds = (links.data ?? []).map((link) => link.account_id).filter((id) => id != null)
  const dealIds = (links.data ?? []).map((link) => link.deal_id).filter((id) => id != null)

  const [accounts, deals] = await Promise.all([
    accountIds.length
      ? supabase.from("accounts").select("id, display_name").in("id", accountIds)
      : Promise.resolve({ data: [] }),
    dealIds.length
      ? supabase.from("deals").select("id, title").in("id", dealIds)
      : Promise.resolve({ data: [] }),
  ])

  const accountNames = new Map((accounts.data ?? []).map((row) => [row.id, row.display_name]))
  const dealNames = new Map((deals.data ?? []).map((row) => [row.id, row.title]))

  return {
    document: data,
    links: (links.data ?? []).map((link) => ({
      id: link.id,
      label: link.account_id
        ? (accountNames.get(link.account_id) ?? "Klient")
        : (dealNames.get(link.deal_id ?? "") ?? "Szansa"),
      href: link.account_id
        ? `/accounts/${link.account_id}`
        : `/leads/${link.deal_id}`,
    })),
    error: null,
  }
}

export async function getDocumentObject(documentId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("documents")
    .select("id, storage_path, original_name, mime_type, size_bytes, status, deleted_at")
    .eq("id", documentId)
    .maybeSingle()

  if (error || !data || data.deleted_at) {
    return null
  }

  return data
}
