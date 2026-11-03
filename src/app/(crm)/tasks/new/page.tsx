import type { Metadata } from "next"

import { TaskEditor } from "@/components/crm/task-forms"
import { getWorkspaceGate } from "@/lib/auth/access"
import { firstSearchParam } from "@/lib/auth/return-to"
import { listMembers } from "@/lib/crm/queries"
import { listTaskFormOptions } from "@/lib/crm/task-read"

export const metadata: Metadata = {
  title: "Nowe zadanie",
}

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const [gate, members, options] = await Promise.all([
    getWorkspaceGate(),
    listMembers(),
    listTaskFormOptions(),
  ])
  const requestedAccount = firstSearchParam(params.account) ?? ""
  const accountId = options.accounts.some((item) => item.id === requestedAccount)
    ? requestedAccount
    : ""
  const requestedDeal = firstSearchParam(params.deal) ?? ""
  const dealId = options.deals.some((item) => item.id === requestedDeal && item.accountId === accountId)
    ? requestedDeal
    : ""

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Nowe zadanie</h1>
        <p className="text-sm text-muted-foreground">
          Zadanie może istnieć bez klienta. Wspólne przypisanie tworzy jeden rekord.
        </p>
      </div>
      <TaskEditor
        assigneeIds={gate.kind === "member" ? [gate.userId] : []}
        accountId={accountId}
        dealId={dealId}
        members={members}
        accounts={options.accounts}
        deals={options.deals}
      />
    </div>
  )
}
