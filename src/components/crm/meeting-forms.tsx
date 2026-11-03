"use client"

import { useActionState } from "react"
import { MessageSquarePlusIcon, RefreshCwIcon, SendIcon } from "lucide-react"

import { ActionForm } from "@/components/crm/action-form"
import { controlClassName, textAreaClassName } from "@/components/crm/control-styles"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  addMeetingNoteAction,
  attachMeetingLinkAction,
  createTaskFromActionItemAction,
  detachMeetingLinkAction,
  type MeetingFormState,
} from "@/lib/crm/meeting-actions"
import { retryMeetingContentAction } from "@/lib/integrations/fathom/actions"

const empty: MeetingFormState = { message: undefined }

type Option = { id: string; label: string }
type DealOption = { id: string; accountId: string; title: string; open: boolean }

export function MeetingNoteForm({ meetingId }: { meetingId: string }) {
  const [state, action, pending] = useActionState(addMeetingNoteAction, empty)
  const failed = Boolean(state.message && state.message !== "Zapisano notatkę.")
  return (
    <ActionForm
      action={action}
      pending={pending}
      failed={failed}
      className="flex flex-col gap-3 rounded-xl border border-border/80 bg-muted/20 p-4"
    >
      <div className="flex items-center gap-2">
        <MessageSquarePlusIcon className="size-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Dodaj komentarz do spotkania</h3>
      </div>
      <input type="hidden" name="meetingId" value={meetingId} />
      <textarea
        name="body"
        placeholder="Napisz komentarz lub własne ustalenia po rozmowie..."
        className={textAreaClassName}
        required
        maxLength={20000}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          Komentarz jest zapisywany w CRM i nie zostanie nadpisany przy synchronizacji.
        </span>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? (
            <>
              <Spinner data-icon="inline-start" />
              Zapisywanie...
            </>
          ) : (
            <>
              <SendIcon data-icon="inline-start" />
              Dodaj komentarz
            </>
          )}
        </Button>
      </div>
      {state.message ? (
        <p className={failed ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
          {state.message}
        </p>
      ) : null}
    </ActionForm>
  )
}

export function MeetingLinkForm({
  meetingId,
  accounts,
  deals,
}: {
  meetingId: string
  accounts: Option[]
  deals: DealOption[]
}) {
  const [state, action, pending] = useActionState(attachMeetingLinkAction, empty)
  const failed = Boolean(state.message && state.message !== "Zapisano powiązanie.")
  return (
    <ActionForm action={action} pending={pending} failed={failed} className="grid gap-3">
      <h3 className="text-sm font-semibold">Przypisz do klienta / szansy</h3>
      <input type="hidden" name="meetingId" value={meetingId} />
      <div className="grid gap-2 sm:grid-cols-2">
        <select name="accountId" className={controlClassName} required defaultValue="">
          <option value="" disabled>
            Wybierz firmę
          </option>
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
              {deal.title}
              {deal.open ? "" : " · zamknięta"}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" variant="outline" size="sm" className="w-fit" disabled={pending}>
        Zapisz powiązanie
      </Button>
      {state.message ? <p className="text-xs text-muted-foreground">{state.message}</p> : null}
    </ActionForm>
  )
}

export function MeetingDetachForm({ meetingId, linkId }: { meetingId: string; linkId: string }) {
  return (
    <form action={detachMeetingLinkAction}>
      <input type="hidden" name="meetingId" value={meetingId} />
      <input type="hidden" name="linkId" value={linkId} />
      <Button type="submit" variant="ghost" size="xs">
        Odepnij
      </Button>
    </form>
  )
}

export function ActionItemForm({
  title,
  description,
  accounts,
  deals,
  members,
}: {
  title: string
  description: string
  accounts: Option[]
  deals: DealOption[]
  members: Option[]
}) {
  const [state, action, pending] = useActionState(createTaskFromActionItemAction, empty)
  const failed = Boolean(state.message && state.message !== "Utworzono zadanie z propozycji.")
  return (
    <ActionForm
      action={action}
      pending={pending}
      failed={failed}
      className="grid gap-3 rounded-xl border bg-card p-3"
    >
      <p className="text-sm font-medium">{title}</p>
      <input type="hidden" name="title" value={title} />
      <input type="hidden" name="description" value={description} />
      <div className="grid gap-2 sm:grid-cols-2">
        <select name="accountId" className={controlClassName} required defaultValue="">
          <option value="" disabled>
            Firma
          </option>
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
              {deal.title}
            </option>
          ))}
        </select>
        <select name="assigneeId" className={controlClassName} required defaultValue="">
          <option value="" disabled>
            Osoba
          </option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.label}
            </option>
          ))}
        </select>
        <input name="dueOn" type="date" required className={controlClassName} />
      </div>
      <Button type="submit" size="sm" className="w-fit" disabled={pending}>
        Utwórz zadanie
      </Button>
      {state.message ? <p className="text-xs text-muted-foreground">{state.message}</p> : null}
    </ActionForm>
  )
}

export function RetryContentForm({ meetingId }: { meetingId: string }) {
  const [state, action, pending] = useActionState(retryMeetingContentAction, empty)
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="meetingId" value={meetingId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        <RefreshCwIcon data-icon="inline-start" />
        {pending ? "Pobieranie..." : "Odśwież treść z Fathom"}
      </Button>
      {state.message ? <p className="text-xs text-muted-foreground">{state.message}</p> : null}
    </form>
  )
}
