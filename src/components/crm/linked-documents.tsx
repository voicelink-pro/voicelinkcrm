import Link from "next/link"
import { FileTextIcon } from "lucide-react"
import { cn } from "cn"

import { DocumentUpload } from "@/components/crm/document-upload"
import { Badge } from "@/components/ui/badge"
import {
  documentCategoryStyle,
  documentCategoryText,
  documentStatusText,
} from "@/lib/crm/document-query"
import { getDocumentPolicy, listLinkedDocuments } from "@/lib/crm/document-read"

export async function LinkedDocuments({
  accountId,
  dealId,
  lockedTarget,
}: {
  accountId?: string
  dealId?: string
  lockedTarget: string
}) {
  const [policy, linked] = await Promise.all([
    getDocumentPolicy(),
    listLinkedDocuments({ accountId, dealId }),
  ])

  return (
    <div className="flex flex-col gap-3">
      {linked.error ? <p className="text-sm text-destructive">{linked.error}</p> : null}
      {linked.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Brak powiązanych dokumentów.</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {linked.rows.map((row) => {
            const catStyle = documentCategoryStyle(row.category)
            return (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2.5"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <FileTextIcon className="size-4 shrink-0 text-primary" />
                  <Link
                    href={`/documents/${row.id}`}
                    className="truncate font-medium underline-offset-4 hover:underline"
                  >
                    {row.originalName}
                  </Link>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={cn("gap-1.5", catStyle.badge)}>
                    <span className={cn("size-1.5 shrink-0 rounded-full", catStyle.dot)} />
                    {documentCategoryText(row.category)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {documentStatusText(row.status)}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {policy.maxBytes && policy.mimeTypes.length ? (
        <DocumentUpload
          maxBytes={policy.maxBytes}
          mimeTypes={policy.mimeTypes}
          target={{ accountId, dealId }}
          lockedTarget={lockedTarget}
          triggerVariant="outline"
        />
      ) : null}
    </div>
  )
}
