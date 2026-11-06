import type { Metadata } from "next"

import { InvoicesBoard } from "@/components/crm/invoices-board"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { getWorkspaceGate } from "@/lib/auth/access"
import { firstSearchParam } from "@/lib/auth/return-to"
import { loadInvoicesView } from "@/lib/crm/ksef-sync"

export const metadata: Metadata = {
  title: "Faktury",
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const gate = await getWorkspaceGate()

  if (gate.kind !== "member") {
    return (
      <Alert variant="destructive">
        <AlertTitle>Brak dostępu</AlertTitle>
        <AlertDescription>
          Faktury są dostępne po zalogowaniu do obszaru roboczego.
        </AlertDescription>
      </Alert>
    )
  }

  const data = await loadInvoicesView({
    workspaceId: gate.workspaceId,
    kindFilter: firstSearchParam(params.kind) ?? undefined,
    statusFilter: firstSearchParam(params.status) ?? undefined,
    sourceFilter: firstSearchParam(params.source) ?? undefined,
    q: firstSearchParam(params.q) ?? undefined,
  })

  return (
    <InvoicesBoard
      invoices={data.invoices}
      connection={data.connection}
      accounts={data.accounts}
    />
  )
}
