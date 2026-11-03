import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { cn } from "cn"

import { DeleteDocumentButton } from "@/components/crm/document-delete"
import { DocumentDetach } from "@/components/crm/document-detach"
import { DocumentLinkForm } from "@/components/crm/document-link-form"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { detachDocumentLinkAction } from "@/lib/crm/document-actions"
import {
  documentCategoryStyle,
  documentCategoryText,
  documentMimeText,
  documentStatusText,
  formatFileSize,
  previewKind,
} from "@/lib/crm/document-query"
import { getDocument } from "@/lib/crm/document-read"
import { formatDateTime } from "@/lib/crm/format"
import { listMembers } from "@/lib/crm/queries"
import { listTaskFormOptions } from "@/lib/crm/task-read"

export const metadata: Metadata = {
  title: "Dokument",
}

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ documentId: string }>
}) {
  const { documentId } = await params
  const [record, members, options] = await Promise.all([
    getDocument(documentId),
    listMembers(),
    listTaskFormOptions(),
  ])

  if (record.error) {
    return <p className="text-sm">{record.error}</p>
  }

  if (!record.document) {
    notFound()
  }

  const document = record.document
  const names = new Map(members.map((member) => [member.userId, member.fullName]))
  const kind = previewKind(document.mime_type)
  const ready = document.status === "ready"
  const catStyle = documentCategoryStyle(document.category)

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{document.original_name}</h1>
          <Badge variant="outline" className={cn("gap-1.5", catStyle.badge)}>
            <span className={cn("size-1.5 shrink-0 rounded-full", catStyle.dot)} />
            {documentCategoryText(document.category)}
          </Badge>
          <Badge variant="secondary">{documentMimeText(document.mime_type)}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {formatFileSize(document.size_bytes)} · {documentStatusText(document.status)} ·{" "}
          {formatDateTime(document.created_at)} · {names.get(document.uploaded_by) ?? "Nie uzupełniono"}
        </p>
        {record.links.length === 0 ? (
          <p className="text-sm text-muted-foreground">Dokument ogólny, bez klienta.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {record.links.map((link) => (
              <li key={link.id} className="flex flex-wrap items-center gap-2">
                <Link href={link.href}>{link.label}</Link>
                <DocumentDetach documentId={document.id} linkId={link.id} detach={detachDocumentLinkAction} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {ready && kind === "pdf" ? (
        <iframe
          title={document.original_name}
          src={`/documents/${document.id}/file`}
          className="h-96 w-full rounded-lg border"
        />
      ) : null}
      {ready && kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/documents/${document.id}/file`}
          alt={document.original_name}
          className="max-h-96 max-w-full rounded-lg border"
        />
      ) : null}
      {ready && kind === "download" ? (
        <p className="text-sm">Podgląd tego typu nie jest dostępny. Plik można pobrać.</p>
      ) : null}
      {ready ? (
        <div className="flex flex-col gap-2">
          <Button nativeButton={false} variant="outline" render={<a href={`/documents/${document.id}/file?pobierz=1`} />}>
            Pobierz
          </Button>
          <p className="text-sm text-muted-foreground">
            Podgląd i pobranie dostają nowy adres po każdym otwarciu. Adres wygasa po dwóch minutach
            i nie jest zapisywany przy dokumencie.
          </p>
        </div>
      ) : (
        <p className="text-sm">Plik nie jest gotowy do podglądu.</p>
      )}

      {ready ? (
        <DocumentLinkForm
          documentId={document.id}
          accounts={options.accounts.map((account) => ({
            id: account.id,
            label: account.displayName,
          }))}
          deals={options.deals.map((deal) => ({ id: deal.id, label: deal.title }))}
        />
      ) : null}

      <DeleteDocumentButton documentId={document.id} />
    </div>
  )
}
