"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { getWorkspaceGate } from "@/lib/auth/access"
import { matchesDeclaredMime } from "@/lib/crm/document-bytes"
import { getDocumentObject } from "@/lib/crm/document-read"
import {
  createUploadUrl,
  readObjectInfo,
  readObjectPrefix,
  removeObject,
} from "@/lib/crm/document-storage"
import { callCrm } from "@/lib/crm/mutate"

const uuid = z.uuid()
const optionalUuid = z.union([z.uuid(), z.literal(""), z.null()]).optional()

const fileSchema = z.object({
  name: z.string().trim().min(1).max(240),
  mime: z.string().trim().min(1).max(200),
  size: z.number().int().positive(),
})

const beginSchema = z.object({
  category: z.enum(["offer", "integration", "contract", "other"]),
  accountId: optionalUuid,
  dealId: optionalUuid,
  files: z.array(fileSchema).min(1).max(20),
})

export type UploadStart =
  | { name: string; documentId: string; signedUrl: string }
  | { name: string; message: string }

function refreshDocuments() {
  revalidatePath("/documents")
  revalidatePath("/accounts")
  revalidatePath("/leads")
}

function emptyToNull(value: string | null | undefined) {
  return value ? value : null
}

function memberGate() {
  return getWorkspaceGate()
}

export async function beginDocumentsAction(input: unknown): Promise<{
  items: UploadStart[]
  message: string | null
}> {
  const gate = await memberGate()
  if (gate.kind !== "member") {
    return { items: [], message: "Brak dostępu do tego obszaru roboczego." }
  }

  const parsed = beginSchema.safeParse(input)
  if (!parsed.success) {
    return { items: [], message: "Dane wysyłki są niekompletne." }
  }

  const targets = [parsed.data.accountId, parsed.data.dealId].filter(
    (value) => Boolean(value),
  )
  if (targets.length > 1) {
    return { items: [], message: "Wybierz jedno powiązanie albo zostaw dokument ogólny." }
  }

  const items: UploadStart[] = []

  for (const file of parsed.data.files) {
    const begun = await callCrm<{ id?: string; storage_path?: string }>("begin_document_upload", {
      p_actor_user_id: gate.userId,
      p_original_name: file.name,
      p_mime_type: file.mime,
      p_size_bytes: file.size,
      p_category: parsed.data.category,
      p_account_id: emptyToNull(parsed.data.accountId),
      p_deal_id: emptyToNull(parsed.data.dealId),
      p_deployment_id: null,
    })

    const documentId = begun.data?.id
    const storagePath = begun.data?.storage_path
    if (!documentId || !storagePath || begun.message) {
      items.push({
        name: file.name,
        message: begun.message ?? "Nie udało się rozpocząć wysyłki.",
      })
      continue
    }

    const signedUrl = await createUploadUrl(storagePath, false)
    if (!signedUrl) {
      await callCrm("fail_document_upload", {
        p_actor_user_id: gate.userId,
        p_document_id: documentId,
      })
      items.push({ name: file.name, message: "Nie udało się przygotować wysyłki do magazynu." })
      continue
    }

    items.push({ name: file.name, documentId, signedUrl })
  }

  return { items, message: null }
}

export async function retryDocumentUploadAction(documentId: string) {
  const gate = await memberGate()
  if (gate.kind !== "member") {
    return { message: "Brak dostępu do tego obszaru roboczego." }
  }
  if (!uuid.safeParse(documentId).success) {
    return { message: "Nie znaleziono pliku." }
  }

  const row = await getDocumentObject(documentId)
  if (!row || (row.status !== "uploading" && row.status !== "failed")) {
    return { message: "Tej wysyłki nie można ponowić." }
  }

  const signedUrl = await createUploadUrl(row.storage_path, true)
  if (!signedUrl) {
    return { message: "Nie udało się przygotować ponownej wysyłki." }
  }

  return { signedUrl }
}

export async function completeDocumentAction(documentId: string) {
  const gate = await memberGate()
  if (gate.kind !== "member") {
    return { message: "Brak dostępu do tego obszaru roboczego." }
  }
  if (!uuid.safeParse(documentId).success) {
    return { message: "Nie znaleziono pliku." }
  }

  const row = await getDocumentObject(documentId)
  if (!row) {
    return { message: "Nie znaleziono pliku." }
  }
  if (row.status === "ready") {
    return { ok: true as const }
  }
  if (row.status !== "uploading" && row.status !== "failed") {
    return { message: "Tej operacji nie da się wykonać w obecnym stanie." }
  }

  const info = await readObjectInfo(row.storage_path)
  const prefix = info ? await readObjectPrefix(row.storage_path) : null
  const contentType = (info?.contentType ?? "").split(";")[0]?.trim().toLowerCase() ?? ""
  const matches =
    info != null &&
    prefix != null &&
    info.size === row.size_bytes &&
    contentType === row.mime_type &&
    matchesDeclaredMime(row.mime_type, prefix)

  if (!matches) {
    await callCrm("fail_document_upload", {
      p_actor_user_id: gate.userId,
      p_document_id: row.id,
    })
    return { message: "Plik w magazynie nie zgadza się z deklaracją albo nie dotarł." }
  }

  const completed = await callCrm("complete_document_upload", {
    p_actor_user_id: gate.userId,
    p_document_id: row.id,
    p_size_bytes: info.size,
    p_mime_type: row.mime_type,
  })

  if (completed.message) {
    return { message: completed.message }
  }

  refreshDocuments()
  return { ok: true as const }
}

export async function abandonDocumentAction(documentId: string) {
  const gate = await memberGate()
  if (gate.kind !== "member") {
    return { message: "Brak dostępu do tego obszaru roboczego." }
  }
  if (!uuid.safeParse(documentId).success) {
    return { message: "Nie znaleziono pliku." }
  }

  const row = await getDocumentObject(documentId)
  if (!row) {
    return { ok: true as const }
  }

  const removed = await removeObject(row.storage_path)
  if (!removed) {
    await callCrm("fail_document_upload", {
      p_actor_user_id: gate.userId,
      p_document_id: row.id,
    })
    return { message: "Nie udało się usunąć niedokończonego pliku z magazynu." }
  }

  const abandoned = await callCrm("abandon_document_upload", {
    p_actor_user_id: gate.userId,
    p_document_id: row.id,
  })

  if (abandoned.message) {
    return { message: abandoned.message }
  }

  refreshDocuments()
  return { ok: true as const }
}

export async function deleteDocumentAction(documentId: string) {
  const gate = await memberGate()
  if (gate.kind !== "member") {
    return { message: "Brak dostępu do tego obszaru roboczego." }
  }
  if (!uuid.safeParse(documentId).success) {
    return { message: "Nie znaleziono pliku." }
  }

  const current = await getDocumentObject(documentId)
  if (current && (current.status === "uploading" || current.status === "failed")) {
    return abandonDocumentAction(documentId)
  }

  const started = await callCrm<string>("begin_document_delete", {
    p_actor_user_id: gate.userId,
    p_document_id: documentId,
  })

  if (!started.data || started.message) {
    return { message: started.message ?? "Nie udało się rozpocząć usuwania." }
  }

  const removed = await removeObject(started.data)
  if (!removed) {
    return { message: "Usuwanie nie doszło do końca. Spróbuj ponownie." }
  }

  const finished = await callCrm("finish_document_delete", {
    p_actor_user_id: gate.userId,
    p_document_id: documentId,
  })

  if (finished.message) {
    return { message: finished.message }
  }

  refreshDocuments()
  return { ok: true as const }
}

export async function cleanupStaleDocumentsAction(
  previous: { removed: number; message: string | null },
  formData: FormData,
) {
  void previous
  void formData
  const gate = await memberGate()
  if (gate.kind !== "member") {
    return { removed: 0, message: "Brak dostępu do tego obszaru roboczego." }
  }

  const listed = await callCrm<{ id: string; storage_path: string }[]>("list_stale_document_uploads", {
    p_actor_user_id: gate.userId,
    p_older_than: "24 hours",
  })

  if (listed.message || !listed.data) {
    return { removed: 0, message: listed.message ?? "Nie udało się odczytać niedokończonych wysyłek." }
  }

  let removedCount = 0
  for (const row of listed.data) {
    const removed = await removeObject(row.storage_path)
    if (!removed) continue
    const abandoned = await callCrm("abandon_document_upload", {
      p_actor_user_id: gate.userId,
      p_document_id: row.id,
    })
    if (!abandoned.message) removedCount += 1
  }

  refreshDocuments()
  return { removed: removedCount, message: null }
}

const linkSchema = z
  .object({
    documentId: uuid,
    accountId: optionalUuid,
    dealId: optionalUuid,
  })
  .refine((value) => {
    const count = [value.accountId, value.dealId].filter((item) => Boolean(item)).length
    return count === 1
  })

export async function attachDocumentLinkAction(
  _state: { message?: string; savedAt?: number },
  formData: FormData,
): Promise<{ message?: string; savedAt?: number }> {
  const gate = await memberGate()
  if (gate.kind !== "member") {
    return { message: "Brak dostępu do tego obszaru roboczego." }
  }

  const parsed = linkSchema.safeParse({
    documentId: formData.get("documentId"),
    accountId: formData.get("accountId") || null,
    dealId: formData.get("dealId") || null,
  })

  if (!parsed.success) {
    return { message: "Wybierz jedno powiązanie." }
  }

  const attached = await callCrm("attach_document_link", {
    p_actor_user_id: gate.userId,
    p_document_id: parsed.data.documentId,
    p_account_id: emptyToNull(parsed.data.accountId),
    p_deal_id: emptyToNull(parsed.data.dealId),
    p_deployment_id: null,
  })

  if (attached.message) {
    return { message: attached.message }
  }

  refreshDocuments()
  return { savedAt: Date.now() }
}

export async function detachDocumentLinkAction(documentId: string, linkId: string) {
  const gate = await memberGate()
  if (gate.kind !== "member") {
    return { message: "Brak dostępu do tego obszaru roboczego." }
  }
  if (!uuid.safeParse(documentId).success || !uuid.safeParse(linkId).success) {
    return { message: "Nie znaleziono powiązania." }
  }

  const detached = await callCrm("detach_document_link", {
    p_actor_user_id: gate.userId,
    p_document_id: documentId,
    p_link_id: linkId,
  })

  if (detached.message) {
    return { message: detached.message }
  }

  refreshDocuments()
  return { ok: true as const }
}
