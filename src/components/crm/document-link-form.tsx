"use client"

import { useActionState } from "react"

import { ActionForm } from "@/components/crm/action-form"
import { controlClassName } from "@/components/crm/control-styles"
import { Button } from "@/components/ui/button"
import { attachDocumentLinkAction } from "@/lib/crm/document-actions"

type Option = { id: string; label: string }

export function DocumentLinkForm({
  documentId,
  accounts,
  deals,
}: {
  documentId: string
  accounts: Option[]
  deals: Option[]
}) {
  const [state, action, pending] = useActionState(attachDocumentLinkAction, {
    message: undefined,
    savedAt: undefined,
  })

  return (
    <ActionForm
      action={action}
      pending={pending}
      failed={Boolean(state.message && !state.savedAt)}
      className="grid gap-3"
    >
      <h2 className="text-lg font-semibold">Dodaj powiązanie</h2>
      <p className="text-sm text-muted-foreground">
        Ten sam plik można podpiąć do firmy albo szansy. Obiekt w magazynie zostaje jeden. Wybierz
        dokładnie jedno pole.
      </p>
      <input type="hidden" name="documentId" value={documentId} />
      <select name="accountId" className={controlClassName} defaultValue="">
        <option value="">Bez firmy</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.label}
          </option>
        ))}
      </select>
      <select name="dealId" className={controlClassName} defaultValue="">
        <option value="">Bez szansy</option>
        {deals.map((deal) => (
          <option key={deal.id} value={deal.id}>
            {deal.label}
          </option>
        ))}
      </select>
      {state.message ? <p className="text-sm text-destructive">{state.message}</p> : null}
      {state.savedAt ? <p className="text-sm">Powiązanie zapisane.</p> : null}
      <Button type="submit" variant="outline" className="w-fit" disabled={pending}>
        {pending ? "Zapisuję" : "Zapisz powiązanie"}
      </Button>
    </ActionForm>
  )
}
