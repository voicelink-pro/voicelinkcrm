import { formatDay, formatDateTime, formatGrosze } from "@/lib/crm/format"

export type FinanceAgreement = {
  id: string
  dealId: string
  kind: string
  amountCents: number
  startsOn: string
  anchorDay: number | null
  endsOn: string | null
  status: string
  version: number
}

export type FinanceEntry = {
  id: string
  dealId: string
  entryType: string
  cycleIndex: number | null
  effectiveOn: string
  amountCents: number
  reason: string | null
  createdAt: string
  supersededAt: string | null
  reversesEntryId: string | null
}

const entryLabels: Record<string, string> = {
  setup: "Opłata jednorazowa",
  subscription: "Abonament",
  correction: "Korekta",
}

const agreementLabels: Record<string, string> = {
  setup: "Opłata jednorazowa",
  subscription: "Abonament",
}

const statusLabels: Record<string, string> = {
  scheduled: "zaplanowane",
  active: "aktywne",
  ended: "zakończone",
  void: "wyłączone",
}

export function signedThrough(entries: FinanceEntry[], today: string) {
  return entries
    .filter((entry) => entry.effectiveOn <= today)
    .reduce((sum, entry) => sum + entry.amountCents, 0)
}

export function splitThrough(entries: FinanceEntry[], today: string) {
  const due = entries.filter((entry) => entry.effectiveOn <= today)
  return {
    setup: due.filter((entry) => entry.entryType === "setup").reduce((sum, entry) => sum + entry.amountCents, 0),
    subscription: due
      .filter((entry) => entry.entryType === "subscription")
      .reduce((sum, entry) => sum + entry.amountCents, 0),
    correction: due
      .filter((entry) => entry.entryType === "correction")
      .reduce((sum, entry) => sum + entry.amountCents, 0),
  }
}

export function FinanceLedger({
  entries,
  agreements,
}: {
  entries: FinanceEntry[]
  agreements: FinanceAgreement[]
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h3 className="font-medium">Warunki</h3>
        {agreements.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak warunków abonamentu.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {agreements.map((agreement) => (
              <li key={agreement.id}>
                {agreementLabels[agreement.kind] ?? agreement.kind} · {formatGrosze(agreement.amountCents)} · od{" "}
                {formatDay(agreement.startsOn)}
                {agreement.endsOn ? ` · od ${formatDay(agreement.endsOn)} bez kolejnych opłat` : ""} ·{" "}
                {statusLabels[agreement.status] ?? agreement.status}
                {agreement.anchorDay ? ` · dzień cyklu ${agreement.anchorDay}` : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="font-medium">Ewidencja</h3>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Brak zaksięgowanego przychodu.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {entries.map((entry) => (
              <li key={entry.id}>
                {formatDay(entry.effectiveOn)} · {entryLabels[entry.entryType] ?? entry.entryType} ·{" "}
                {formatGrosze(entry.amountCents)}
                {entry.reason ? ` · ${entry.reason}` : ""}
                <span className="text-muted-foreground"> · zapis {formatDateTime(entry.createdAt)}</span>
                {entry.supersededAt ? " · zastąpiony" : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
