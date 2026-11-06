"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useActionState, useEffect, useRef, useState } from "react"
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  Building2Icon,
  CalendarIcon,
  CheckCircle2Icon,
  CloudDownloadIcon,
  EyeIcon,
  FileCheck2Icon,
  FileTextIcon,
  FolderOpenIcon,
  PlusIcon,
  ReceiptTextIcon,
  RefreshCwIcon,
  ScanTextIcon,
  SearchIcon,
  Settings2Icon,
  SparklesIcon,
  Trash2Icon,
  UploadCloudIcon,
  XIcon,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"

import { controlClassName, textAreaClassName } from "@/components/crm/control-styles"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  beginDocumentsAction,
  completeDocumentAction,
} from "@/lib/crm/document-actions"
import { formatDateTime, formatDay } from "@/lib/crm/format"
import {
  deleteInvoiceAction,
  saveInvoiceAction,
  saveKsefConnectionAction,
  syncKsefNowAction,
  updateInvoiceAccountAction,
  updateInvoiceStatusAction,
  type InvoiceActionState,
} from "@/lib/crm/invoice-actions"
import { extractInvoiceFromFileClient } from "@/lib/crm/invoice-pdf-client"
import type {
  InvoiceRecord,
  KsefConnectionView,
  KsefEnvironment,
} from "@/lib/crm/ksef-sync"

type AccountOption = {
  id: string
  displayName: string
  companyName: string | null
}

const statusBadges: Record<
  InvoiceRecord["status"],
  { label: string; dot: string; badge: string }
> = {
  draft: {
    label: "Szkic",
    dot: "bg-slate-400",
    badge: "border-slate-200 bg-slate-50 text-slate-700",
  },
  issued: {
    label: "Wystawiona",
    dot: "bg-blue-500",
    badge: "border-blue-200 bg-blue-50 text-blue-700",
  },
  paid: {
    label: "Opłacona",
    dot: "bg-emerald-500",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  overdue: {
    label: "Po terminie",
    dot: "bg-rose-500",
    badge: "border-rose-200 bg-rose-50 text-rose-700",
  },
  cancelled: {
    label: "Anulowana",
    dot: "bg-zinc-400",
    badge: "border-zinc-200 bg-zinc-50 text-zinc-600",
  },
}

const sourceBadges: Record<
  InvoiceRecord["source"],
  { label: string; badge: string }
> = {
  ksef: {
    label: "KSeF API",
    badge: "border-violet-200 bg-violet-50 text-violet-700",
  },
  pdf_ocr: {
    label: "PDF + OCR",
    badge: "border-amber-200 bg-amber-50 text-amber-800",
  },
  manual: {
    label: "Ręczna",
    badge: "border-border bg-muted text-muted-foreground",
  },
}

function formatCents(cents: number, currency: string = "PLN") {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: currency || "PLN",
    minimumFractionDigits: 2,
  }).format((cents || 0) / 100)
}

function centsToInputString(cents: number): string {
  if (!cents) return ""
  return (cents / 100).toFixed(2).replace(".", ",")
}

function uploadFileToSignedUrl(url: string, file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", url)
    xhr.setRequestHeader("x-upsert", "true")
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300)
    xhr.onerror = () => resolve(false)
    const body = new FormData()
    body.append("cacheControl", "3600")
    body.append("", file)
    xhr.send(body)
  })
}

export function InvoicesBoard({
  invoices,
  connection,
  accounts,
}: {
  invoices: InvoiceRecord[]
  connection: KsefConnectionView | null
  accounts: AccountOption[]
}) {
  const router = useRouter()
  const [kindFilter, setKindFilter] = useState<"all" | "sales" | "purchase">("all")
  const [sourceFilter, setSourceFilter] = useState<"all" | "ksef" | "pdf_ocr">("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [syncingKsef, setSyncingKsef] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceRecord | null>(null)

  const filtered = invoices.filter((inv) => {
    if (kindFilter !== "all" && inv.kind !== kindFilter) return false
    if (sourceFilter !== "all" && inv.source !== sourceFilter) return false
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      const hit =
        inv.invoiceNumber.toLowerCase().includes(q) ||
        inv.buyerName.toLowerCase().includes(q) ||
        inv.sellerName.toLowerCase().includes(q) ||
        (inv.buyerNip ?? "").includes(q) ||
        (inv.sellerNip ?? "").includes(q) ||
        (inv.ksefReferenceNumber ?? "").toLowerCase().includes(q) ||
        (inv.accountName ?? "").toLowerCase().includes(q)
      if (!hit) return false
    }
    return true
  })

  const salesGrossCents = filtered
    .filter((i) => i.kind === "sales" && i.status !== "cancelled")
    .reduce((acc, i) => acc + i.grossCents, 0)
  const purchaseGrossCents = filtered
    .filter((i) => i.kind === "purchase" && i.status !== "cancelled")
    .reduce((acc, i) => acc + i.grossCents, 0)
  const ksefCount = invoices.filter((i) => i.source === "ksef").length
  const ocrCount = invoices.filter((i) => i.source === "pdf_ocr").length

  async function handleManualKsefSync() {
    setSyncingKsef(true)
    const res = await syncKsefNowAction()
    setSyncingKsef(false)
    if (res.ok) {
      toast.success(res.message)
      router.refresh()
    } else {
      toast.error(res.message)
    }
  }

  async function handleStatusChange(
    invoiceId: string,
    status: InvoiceRecord["status"],
  ) {
    const res = await updateInvoiceStatusAction(invoiceId, status)
    if (res.ok) {
      toast.success("Zaktualizowano status faktury.")
      router.refresh()
    } else {
      toast.error(res.error ?? "Nie udało się zmienić statusu.")
    }
  }

  async function handleAccountChange(invoiceId: string, accountId: string) {
    const res = await updateInvoiceAccountAction(invoiceId, accountId || null)
    if (res.ok) {
      toast.success("Zaktualizowano przypisanie klienta.")
      router.refresh()
    } else {
      toast.error(res.error ?? "Nie udało się przypisać klienta.")
    }
  }

  async function handleDelete(invoiceId: string) {
    const res = await deleteInvoiceAction(invoiceId)
    if (res.ok) {
      toast.success("Usunięto fakturę.")
      setSelectedInvoice(null)
      router.refresh()
    } else {
      toast.error(res.error ?? "Nie udało się usunąć faktury.")
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Górny wiersz: Tytuł Faktury + kompaktowe filtry i przyciski KSeF oraz Dodaj PDF z OCR */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold">Faktury</h1>
            <Badge
              variant="outline"
              className={cn(
                "gap-1.5 text-xs",
                connection?.enabled
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-amber-800",
              )}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  connection?.enabled ? "bg-emerald-500 animate-pulse" : "bg-amber-500",
                )}
              />
              {connection?.enabled
                ? `KSeF (${connection.environment.toUpperCase()}) · NIP ${connection.nip}`
                : "KSeF do skonfigurowania"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Automatyczne pobieranie faktur z Krajowego Systemu e-Faktur (KSeF) oraz odczyt załączników PDF przez OCR
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {connection?.enabled ? (
            <Button
              type="button"
              variant="outline"
              disabled={syncingKsef}
              onClick={() => void handleManualKsefSync()}
            >
              {syncingKsef ? (
                <Spinner data-icon="inline-start" />
              ) : (
                <RefreshCwIcon data-icon="inline-start" />
              )}
              Pobierz z KSeF
            </Button>
          ) : null}

          <KsefConnectionDialog connection={connection} />

          <UploadInvoiceOcrDialog
            ourNip={connection?.nip}
            accounts={accounts}
          />
        </div>
      </div>

      {/* Karty podsumowania shadcn */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col justify-between gap-2 rounded-2xl border border-border bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Faktury sprzedaży (Brutto)</span>
            <span className="flex size-7 items-center justify-center rounded-lg border border-emerald-200/80 bg-emerald-50 text-emerald-600">
              <ArrowUpRightIcon className="size-4" />
            </span>
          </div>
          <p className="text-xl font-bold tracking-tight text-foreground tabular-nums">
            {formatCents(salesGrossCents)}
          </p>
          <span className="text-[11px] text-muted-foreground">
            Wystawione dla klientów VoiceLink
          </span>
        </div>

        <div className="flex flex-col justify-between gap-2 rounded-2xl border border-border bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Faktury kosztowe (Brutto)</span>
            <span className="flex size-7 items-center justify-center rounded-lg border border-blue-200/80 bg-blue-50 text-blue-600">
              <ArrowDownLeftIcon className="size-4" />
            </span>
          </div>
          <p className="text-xl font-bold tracking-tight text-foreground tabular-nums">
            {formatCents(purchaseGrossCents)}
          </p>
          <span className="text-[11px] text-muted-foreground">
            Zakupowe z KSeF i wgranych PDF
          </span>
        </div>

        <div className="flex flex-col justify-between gap-2 rounded-2xl border border-border bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Pobrane przez KSeF API</span>
            <span className="flex size-7 items-center justify-center rounded-lg border border-violet-200/80 bg-violet-50 text-violet-600">
              <CloudDownloadIcon className="size-4" />
            </span>
          </div>
          <p className="text-xl font-bold tracking-tight text-foreground tabular-nums">
            {ksefCount}
          </p>
          <span className="text-[11px] text-muted-foreground">
            {connection?.lastSyncedAt
              ? `Ostatnia synchr.: ${formatDateTime(connection.lastSyncedAt)}`
              : "Gotowe do synchronizacji FA(2)"}
          </span>
        </div>

        <div className="flex flex-col justify-between gap-2 rounded-2xl border border-border bg-card p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Rozpoznane przez PDF OCR</span>
            <span className="flex size-7 items-center justify-center rounded-lg border border-amber-200/80 bg-amber-50 text-amber-600">
              <ScanTextIcon className="size-4" />
            </span>
          </div>
          <p className="text-xl font-bold tracking-tight text-foreground tabular-nums">
            {ocrCount}
          </p>
          <span className="text-[11px] text-muted-foreground">
            Automatyczna ekstrakcja NIP, dat i kwot
          </span>
        </div>
      </div>

      {/* Pasek filtrów i wyszukiwania */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <nav
            aria-label="Typ faktur"
            className="inline-flex h-9 items-center gap-1 rounded-xl border border-border bg-card p-1 shadow-2xs"
          >
            {(
              [
                ["all", `Wszystkie (${invoices.length})`],
                ["sales", "Sprzedażowe"],
                ["purchase", "Kosztowe"],
              ] as const
            ).map(([code, label]) => {
              const active = kindFilter === code
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => setKindFilter(code)}
                  className={cn(
                    "inline-flex h-7 items-center rounded-lg px-2.5 text-xs font-medium transition-all",
                    active
                      ? "bg-primary text-primary-foreground shadow-2xs"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              )
            })}
          </nav>

          <nav
            aria-label="Źródło faktury"
            className="inline-flex h-9 items-center gap-1 rounded-xl border border-border bg-card p-1 shadow-2xs"
          >
            {(
              [
                ["all", "Wszystkie źródła"],
                ["ksef", "KSeF API"],
                ["pdf_ocr", "PDF + OCR"],
              ] as const
            ).map(([code, label]) => {
              const active = sourceFilter === code
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => setSourceFilter(code)}
                  className={cn(
                    "inline-flex h-7 items-center rounded-lg px-2.5 text-xs font-medium transition-all",
                    active
                      ? "bg-secondary font-semibold text-primary shadow-2xs"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              )
            })}
          </nav>
        </div>

        <div className="relative flex w-full sm:w-72">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Szukaj nr faktury, NIP, kontrahenta..."
            className="h-9 pl-8 pr-8 text-xs"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Wyczyść wyszukiwanie"
            >
              <XIcon className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Tabela faktur */}
      {filtered.length === 0 ? (
        <Empty className="rounded-2xl border border-border bg-card py-14 shadow-2xs">
          <EmptyHeader>
            <div className="mx-auto mb-2 flex size-11 items-center justify-center rounded-xl border border-border/80 bg-secondary text-primary">
              <ReceiptTextIcon className="size-5" />
            </div>
            <EmptyTitle>Brak faktur na liście</EmptyTitle>
            <EmptyDescription>
              Połącz konto z bramką KSeF API, aby automatycznie pobrać faktury ustrukturyzowane, albo wgraj plik PDF/skan faktury — system OCR sam rozpozna wszystkie pola i przypisze je we właściwe miejsca.
            </EmptyDescription>
          </EmptyHeader>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <KsefConnectionDialog connection={connection} />
            <UploadInvoiceOcrDialog ourNip={connection?.nip} accounts={accounts} />
          </div>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-2xs">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/35 hover:bg-muted/35">
                <TableHead className="pl-4">Numer faktury / KSeF</TableHead>
                <TableHead>Kontrahent i NIP</TableHead>
                <TableHead>Klient w CRM</TableHead>
                <TableHead>Wystawiono / Termin</TableHead>
                <TableHead className="text-right">Netto</TableHead>
                <TableHead className="text-right">Brutto</TableHead>
                <TableHead>Źródło</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-4 text-right">Szczegóły</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((inv) => {
                const st = statusBadges[inv.status] ?? statusBadges.issued
                const src = sourceBadges[inv.source] ?? sourceBadges.manual
                const counterpartyName =
                  inv.kind === "purchase" ? inv.sellerName : inv.buyerName
                const counterpartyNip =
                  inv.kind === "purchase" ? inv.sellerNip : inv.buyerNip

                return (
                  <TableRow key={inv.id} className="group">
                    <TableCell className="pl-4">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setSelectedInvoice(inv)}
                            className="font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline"
                          >
                            {inv.invoiceNumber}
                          </button>
                          <Badge variant="outline" className="text-[10px]">
                            {inv.kind === "purchase" ? "Koszt" : "Sprzedaż"}
                          </Badge>
                        </div>
                        {inv.ksefReferenceNumber ? (
                          <span className="font-mono text-[10px] text-muted-foreground">
                            KSeF: {inv.ksefReferenceNumber}
                          </span>
                        ) : inv.documentName ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                            <FileTextIcon className="size-3 text-primary" />
                            {inv.documentName}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium text-foreground">
                          {counterpartyName}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {counterpartyNip ? `NIP: ${counterpartyNip}` : "Brak NIP"}
                        </span>
                      </div>
                    </TableCell>

                    <TableCell>
                      <select
                        aria-label={`Przypisz klienta do faktury ${inv.invoiceNumber}`}
                        value={inv.accountId ?? ""}
                        onChange={(e) => void handleAccountChange(inv.id, e.target.value)}
                        className="h-7 max-w-44 truncate rounded-lg border border-border/80 bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                      >
                        <option value="">— Przypisz klienta —</option>
                        {accounts.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.displayName}
                          </option>
                        ))}
                      </select>
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground tabular-nums">
                      <div className="flex flex-col gap-0.5">
                        <span>{formatDay(inv.issueDate)}</span>
                        {inv.dueDate ? (
                          <span className="text-[11px] text-muted-foreground/80">
                            Termin: {formatDay(inv.dueDate)}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>

                    <TableCell className="text-right font-mono text-xs text-muted-foreground tabular-nums">
                      {formatCents(inv.netCents, inv.currency)}
                    </TableCell>

                    <TableCell className="text-right font-mono text-sm font-semibold text-foreground tabular-nums">
                      {formatCents(inv.grossCents, inv.currency)}
                    </TableCell>

                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                          src.badge,
                        )}
                      >
                        {src.label}
                        {inv.source === "pdf_ocr" && inv.ocrConfidence ? (
                          <span className="opacity-75">({inv.ocrConfidence}%)</span>
                        ) : null}
                      </span>
                    </TableCell>

                    <TableCell>
                      <select
                        aria-label={`Status faktury ${inv.invoiceNumber}`}
                        value={inv.status}
                        onChange={(e) =>
                          void handleStatusChange(
                            inv.id,
                            e.target.value as InvoiceRecord["status"],
                          )
                        }
                        className={cn(
                          "h-7 rounded-full border px-2.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                          st.badge,
                        )}
                      >
                        {Object.entries(statusBadges).map(([code, meta]) => (
                          <option key={code} value={code}>
                            {meta.label}
                          </option>
                        ))}
                      </select>
                    </TableCell>

                    <TableCell className="pr-4 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Podgląd faktury ${inv.invoiceNumber}`}
                        onClick={() => setSelectedInvoice(inv)}
                      >
                        <EyeIcon />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Panel szczegółów wybranej faktury (załącznik PDF / XML KSeF / pola OCR) */}
      <Sheet
        open={Boolean(selectedInvoice)}
        onOpenChange={(open) => {
          if (!open) setSelectedInvoice(null)
        }}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto p-0 sm:max-w-2xl"
        >
          {selectedInvoice ? (
            <div className="flex flex-col gap-5 p-6">
              <SheetHeader className="border-b border-border pb-4 p-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={
                      (sourceBadges[selectedInvoice.source] ?? sourceBadges.manual).badge
                    }
                  >
                    {(sourceBadges[selectedInvoice.source] ?? sourceBadges.manual).label}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={
                      (statusBadges[selectedInvoice.status] ?? statusBadges.issued).badge
                    }
                  >
                    {(statusBadges[selectedInvoice.status] ?? statusBadges.issued).label}
                  </Badge>
                </div>
                <SheetTitle className="text-xl font-semibold">
                  Faktura {selectedInvoice.invoiceNumber}
                </SheetTitle>
                <SheetDescription>
                  {selectedInvoice.ksefReferenceNumber
                    ? `Numer KSeF: ${selectedInvoice.ksefReferenceNumber}`
                    : "Faktura zapisana w repozytorium firmy VoiceLink"}
                </SheetDescription>
              </SheetHeader>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1 rounded-xl border border-border/80 bg-muted/20 p-3.5 text-xs">
                  <span className="font-semibold uppercase tracking-wider text-muted-foreground">
                    Sprzedawca
                  </span>
                  <span className="text-sm font-semibold text-foreground">
                    {selectedInvoice.sellerName}
                  </span>
                  <span className="font-mono text-muted-foreground">
                    NIP: {selectedInvoice.sellerNip || "Nie podano"}
                  </span>
                </div>

                <div className="flex flex-col gap-1 rounded-xl border border-border/80 bg-muted/20 p-3.5 text-xs">
                  <span className="font-semibold uppercase tracking-wider text-muted-foreground">
                    Nabywca
                  </span>
                  <span className="text-sm font-semibold text-foreground">
                    {selectedInvoice.buyerName}
                  </span>
                  <span className="font-mono text-muted-foreground">
                    NIP: {selectedInvoice.buyerNip || "Nie podano"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 rounded-xl border border-border bg-card p-4 shadow-2xs">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">Kwota Netto</span>
                  <span className="font-mono text-base font-semibold text-foreground tabular-nums">
                    {formatCents(selectedInvoice.netCents, selectedInvoice.currency)}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">Podatek VAT</span>
                  <span className="font-mono text-base font-semibold text-foreground tabular-nums">
                    {formatCents(selectedInvoice.vatCents, selectedInvoice.currency)}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">Kwota Brutto</span>
                  <span className="font-mono text-lg font-bold text-primary tabular-nums">
                    {formatCents(selectedInvoice.grossCents, selectedInvoice.currency)}
                  </span>
                </div>
              </div>

              <div className="grid gap-2 rounded-xl border border-border/80 bg-card p-4 text-xs sm:grid-cols-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Data wystawienia:</span>
                  <span className="font-medium text-foreground">
                    {formatDay(selectedInvoice.issueDate)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Data sprzedaży:</span>
                  <span className="font-medium text-foreground">
                    {formatDay(selectedInvoice.saleDate ?? selectedInvoice.issueDate)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Termin płatności:</span>
                  <span className="font-medium text-foreground">
                    {selectedInvoice.dueDate ? formatDay(selectedInvoice.dueDate) : "Brak"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Konto bankowe:</span>
                  <span className="font-mono text-foreground">
                    {selectedInvoice.bankAccount || "Nie podano"}
                  </span>
                </div>
              </div>

              {selectedInvoice.documentId ? (
                <div className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <FileTextIcon className="size-4 text-primary" />
                      Załącznik faktury ({selectedInvoice.documentName ?? "PDF"})
                    </span>
                    <Button
                      variant="outline"
                      size="xs"
                      nativeButton={false}
                      render={
                        <Link
                          href={`/documents/${selectedInvoice.documentId}/file`}
                          target="_blank"
                        />
                      }
                    >
                      Otwórz plik PDF
                    </Button>
                  </div>
                  <iframe
                    title={`Podgląd faktury ${selectedInvoice.invoiceNumber}`}
                    src={`/documents/${selectedInvoice.documentId}/file`}
                    className="h-80 w-full rounded-lg border border-border bg-muted/20"
                  />
                </div>
              ) : null}

              {selectedInvoice.ocrRawText ? (
                <div className="flex flex-col gap-1.5 rounded-xl border border-border/80 bg-muted/20 p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <SparklesIcon className="size-3.5 text-amber-600" />
                      Tekst rozpoznany przez system OCR
                    </span>
                    {selectedInvoice.ocrConfidence ? (
                      <Badge variant="secondary" className="text-[10px]">
                        Pewność OCR: {selectedInvoice.ocrConfidence}%
                      </Badge>
                    ) : null}
                  </div>
                  <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] text-muted-foreground">
                    {selectedInvoice.ocrRawText}
                  </pre>
                </div>
              ) : null}

              {selectedInvoice.ksefXml ? (
                <div className="flex flex-col gap-1.5 rounded-xl border border-border/80 bg-muted/20 p-3.5">
                  <span className="text-xs font-semibold text-foreground">
                    Struktura XML KSeF FA(2)
                  </span>
                  <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] text-muted-foreground">
                    {selectedInvoice.ksefXml}
                  </pre>
                </div>
              ) : null}

              <div className="flex items-center justify-between border-t border-border pt-3">
                {selectedInvoice.accountId ? (
                  <Button
                    variant="outline"
                    size="sm"
                    nativeButton={false}
                    render={<Link href={`/accounts/${selectedInvoice.accountId}`} />}
                  >
                    <Building2Icon data-icon="inline-start" />
                    Przejdź do karty klienta
                  </Button>
                ) : (
                  <span />
                )}

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => void handleDelete(selectedInvoice.id)}
                >
                  <Trash2Icon data-icon="inline-start" />
                  Usuń fakturę
                </Button>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function KsefConnectionDialog({
  connection,
}: {
  connection: KsefConnectionView | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [env, setEnv] = useState<KsefEnvironment>(connection?.environment ?? "test")
  const [state, action, pending] = useActionState(
    saveKsefConnectionAction,
    {} as InvoiceActionState,
  )

  useEffect(() => {
    if (state.savedAt) {
      setOpen(false)
      toast.success(state.notice ?? "Zapisano połączenie KSeF.")
      router.refresh()
    }
  }, [state.savedAt, state.notice, router])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <Settings2Icon data-icon="inline-start" />
        Połączenie KSeF API
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Konfiguracja Krajowego Systemu e-Faktur (KSeF)</DialogTitle>
          <DialogDescription>
            Połącz konto firmowe z bramką Ministerstwa Finansów KSeF API, aby automatycznie pobierać faktury sprzedażowe i kosztowe oraz parować je z klientami w CRM.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="environment" value={env} />

          <FieldGroup className="gap-4">
            <Field>
              <FieldLabel>Środowisko bramki KSeF MF</FieldLabel>
              <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Środowisko KSeF">
                {(
                  [
                    ["test", "Testowe (Sandbox)"],
                    ["demo", "Demo (Przedprod.)"],
                    ["prod", "Produkcyjne MF"],
                  ] as const
                ).map(([code, label]) => {
                  const selected = env === code
                  return (
                    <button
                      key={code}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setEnv(code)}
                      className={cn(
                        "flex h-9 items-center justify-center rounded-lg border px-2.5 text-xs font-medium transition-all",
                        selected
                          ? "border-primary bg-primary text-primary-foreground shadow-2xs"
                          : "border-border bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      )}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
              <FieldDescription className="text-xs">
                Środowisko Testowe (Sandbox) pozwala od razu przetestować automatyczne zaciąganie faktur FA(2) bez certyfikatu produkcyjnego.
              </FieldDescription>
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="ksef-nip">NIP firmy</FieldLabel>
                <Input
                  id="ksef-nip"
                  name="nip"
                  required
                  defaultValue={connection?.nip ?? "5250001020"}
                  placeholder="Np. 5250001020"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="ksef-company">Nazwa podmiotu</FieldLabel>
                <Input
                  id="ksef-company"
                  name="companyName"
                  required
                  defaultValue={connection?.companyName ?? "VoiceLink"}
                  placeholder="VoiceLink"
                />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="ksef-token">
                Token autoryzacyjny KSeF {connection?.hasToken ? "(zapisany — wpisz nowy, aby podmienić)" : "(opcjonalny w trybie Testowym)"}
              </FieldLabel>
              <Input
                id="ksef-token"
                name="authToken"
                type="password"
                placeholder="Token wygenerowany w Aplikacji Podatnika KSeF..."
              />
              <FieldDescription className="text-xs">
                W środowisku Produkcyjnym wklej token wygenerowany w Aplikacji Podatnika KSeF z uprawnieniami `InvoiceRead`.
              </FieldDescription>
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="ksef-interval">Odstęp auto-synchronizacji (min)</FieldLabel>
                <Input
                  id="ksef-interval"
                  name="syncIntervalMinutes"
                  type="number"
                  min={5}
                  max={1440}
                  defaultValue={connection?.syncIntervalMinutes ?? 15}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="ksef-autosync">Synchronizacja w tle</FieldLabel>
                <label className="flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground">
                  <input
                    id="ksef-autosync"
                    name="autoSync"
                    type="checkbox"
                    defaultChecked={connection?.autoSync ?? true}
                    className="size-4 accent-primary"
                  />
                  Pobieraj automatycznie z KSeF
                </label>
              </Field>
            </div>
          </FieldGroup>

          {state.error ? (
            <p className="text-xs font-medium text-destructive">{state.error}</p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Anuluj
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <>
                  <Spinner data-icon="inline-start" />
                  Łączenie z KSeF...
                </>
              ) : (
                <>
                  <CloudDownloadIcon data-icon="inline-start" />
                  Zapisz i pobierz faktury z KSeF
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function UploadInvoiceOcrDialog({
  ourNip,
  accounts,
}: {
  ourNip?: string | null
  accounts: AccountOption[]
}) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [open, setOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [ocrRunning, setOcrRunning] = useState(false)
  const [ocrStage, setOcrStage] = useState("")
  const [ocrPercent, setOcrPercent] = useState(0)
  const [uploadingPdf, setUploadingPdf] = useState(false)

  // Stany formularza wypełniane automatycznie przez OCR i edytowalne przez użytkownika
  const [source, setSource] = useState<"pdf_ocr" | "manual">("pdf_ocr")
  const [kind, setKind] = useState<"sales" | "purchase">("sales")
  const [status, setStatus] = useState<"issued" | "paid" | "overdue" | "draft">("issued")
  const [invoiceNumber, setInvoiceNumber] = useState("")
  const [ksefReferenceNumber, setKsefReferenceNumber] = useState("")
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [saleDate, setSaleDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [dueDate, setDueDate] = useState("")
  const [sellerName, setSellerName] = useState("VoiceLink")
  const [sellerNip, setSellerNip] = useState(ourNip ?? "")
  const [buyerName, setBuyerName] = useState("")
  const [buyerNip, setBuyerNip] = useState("")
  const [accountId, setAccountId] = useState("")
  const [currency, setCurrency] = useState("PLN")
  const [netAmount, setNetAmount] = useState("")
  const [vatAmount, setVatAmount] = useState("")
  const [grossAmount, setGrossAmount] = useState("")
  const [bankAccount, setBankAccount] = useState("")
  const [notes, setNotes] = useState("")
  const [documentId, setDocumentId] = useState("")
  const [uploadedFileName, setUploadedFileName] = useState("")
  const [ocrRawText, setOcrRawText] = useState("")
  const [ocrConfidence, setOcrConfidence] = useState<number>(0)

  const [state, action, pending] = useActionState(
    saveInvoiceAction,
    {} as InvoiceActionState,
  )

  useEffect(() => {
    if (state.savedAt) {
      setOpen(false)
      toast.success(state.notice ?? "Zapisano fakturę.")
      router.refresh()
    }
  }, [state.savedAt, state.notice, router])

  function matchClientByName(buyer: string, seller: string, currentKind: "sales" | "purchase") {
    const target = (currentKind === "purchase" ? seller : buyer).toLowerCase().trim()
    if (!target || target.length < 3) return ""
    for (const acc of accounts) {
      const dn = acc.displayName.toLowerCase()
      const cnName = (acc.companyName ?? "").toLowerCase()
      if ((dn && (target.includes(dn) || dn.includes(target))) || (cnName && (target.includes(cnName) || cnName.includes(target)))) {
        return acc.id
      }
    }
    return ""
  }

  async function processDroppedOrSelectedFile(file: File | null | undefined) {
    if (!file) return
    setUploadedFileName(file.name)
    setOcrRunning(true)
    setOcrStage("Rozpoczynanie analizy pliku...")
    setOcrPercent(10)

    try {
      // 1. Równolegle: wgrywamy załącznik PDF/obraz do Storage (kategoria "invoice") oraz uruchamiamy silnik OCR
      const uploadPromise = (async () => {
        if (
          file.type === "application/pdf" ||
          file.type === "image/png" ||
          file.type === "image/jpeg"
        ) {
          setUploadingPdf(true)
          const started = await beginDocumentsAction({
            category: "invoice",
            accountId: accountId || null,
            dealId: null,
            files: [
              {
                name: file.name,
                mime: file.type,
                size: file.size,
              },
            ],
          })
          const first = started.items[0]
          if (first && "signedUrl" in first && first.signedUrl) {
            const ok = await uploadFileToSignedUrl(first.signedUrl, file)
            if (ok) {
              await completeDocumentAction(first.documentId)
              setDocumentId(first.documentId)
            }
          }
          setUploadingPdf(false)
        }
      })()

      const extracted = await extractInvoiceFromFileClient(
        file,
        ourNip,
        (stageText, pct) => {
          setOcrStage(stageText)
          setOcrPercent(pct)
        },
      )

      await uploadPromise

      // 2. Przypisujemy rozpoznane dane we właściwe pola formularza
      setSource("pdf_ocr")
      setKind(extracted.kind)
      setInvoiceNumber(extracted.invoiceNumber)
      if (extracted.ksefReferenceNumber) {
        setKsefReferenceNumber(extracted.ksefReferenceNumber)
      }
      if (extracted.issueDate) setIssueDate(extracted.issueDate)
      if (extracted.saleDate) setSaleDate(extracted.saleDate)
      if (extracted.dueDate) setDueDate(extracted.dueDate)
      if (extracted.sellerName) setSellerName(extracted.sellerName)
      if (extracted.sellerNip) setSellerNip(extracted.sellerNip)
      if (extracted.buyerName) setBuyerName(extracted.buyerName)
      if (extracted.buyerNip) setBuyerNip(extracted.buyerNip)
      if (extracted.currency) setCurrency(extracted.currency)
      if (extracted.netCents > 0) setNetAmount(centsToInputString(extracted.netCents))
      if (extracted.vatCents > 0) setVatAmount(centsToInputString(extracted.vatCents))
      if (extracted.grossCents > 0) setGrossAmount(centsToInputString(extracted.grossCents))
      if (extracted.bankAccount) setBankAccount(extracted.bankAccount)

      const guessedAcc = matchClientByName(
        extracted.buyerName,
        extracted.sellerName,
        extracted.kind,
      )
      if (guessedAcc) setAccountId(guessedAcc)

      setOcrRawText(extracted.rawText)
      setOcrConfidence(extracted.confidence)

      toast.success(
        `System OCR rozpoznał dane faktury ${extracted.invoiceNumber} (${extracted.confidence}% pewności).`,
      )
    } catch {
      toast.error("Nie udało się przeprowadzić automatycznego odczytu OCR. Możesz uzupełnić pola ręcznie.")
    } finally {
      setOcrRunning(false)
      setUploadingPdf(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <PlusIcon data-icon="inline-start" />
        Dodaj fakturę PDF / OCR
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl max-h-[92svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Wgraj fakturę PDF / skan z rozpoznawaniem OCR</DialogTitle>
          <DialogDescription>
            Przeciągnij plik PDF, obraz faktury lub plik XML KSeF. System OCR automatycznie odczyta numer faktury, NIP, kontrahenta, daty oraz kwoty Netto/VAT/Brutto i przypisze je w odpowiednie pola.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/png,image/jpeg,text/xml,application/xml,.pdf,.png,.jpg,.jpeg,.xml"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0]
            void processDroppedOrSelectedFile(f)
            e.target.value = ""
          }}
        />

        {/* Strefa Drag & Drop PDF / OCR */}
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            const f = e.dataTransfer.files?.[0]
            void processDroppedOrSelectedFile(f)
          }}
          onClick={() => {
            if (!ocrRunning) fileInputRef.current?.click()
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (!ocrRunning && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault()
              fileInputRef.current?.click()
            }
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed px-4 py-5 text-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
            dragging
              ? "border-primary bg-primary/5"
              : "border-border bg-muted/20 hover:border-primary/40 hover:bg-muted/35",
          )}
        >
          <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-background text-primary shadow-2xs">
            {ocrRunning ? (
              <Spinner />
            ) : documentId ? (
              <FileCheck2Icon className="size-5 text-emerald-600" />
            ) : (
              <UploadCloudIcon className="size-5" />
            )}
          </div>

          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-semibold text-foreground">
              {ocrRunning
                ? ocrStage
                : uploadedFileName
                  ? `Wczytano plik: ${uploadedFileName}`
                  : "Przeciągnij fakturę PDF, skan (PNG/JPG) lub XML KSeF"}
            </p>
            <p className="text-xs text-muted-foreground">
              {ocrRunning
                ? `Postęp rozpoznawania OCR: ${ocrPercent}%`
                : ocrConfidence > 0
                  ? `Rozpoznano automatycznie przez OCR (${ocrConfidence}% pewności) · załącznik PDF gotowy`
                  : "System OCR sam wyciągnie numer faktury, NIP, daty i kwoty oraz powiąże klienta"}
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={ocrRunning}
            onClick={(e) => {
              e.stopPropagation()
              fileInputRef.current?.click()
            }}
          >
            <FolderOpenIcon data-icon="inline-start" />
            {uploadedFileName ? "Wybierz inny plik PDF" : "Wybierz plik z dysku"}
          </Button>
        </div>

        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="source" value={source} />
          <input type="hidden" name="documentId" value={documentId} />
          <input type="hidden" name="ocrRawText" value={ocrRawText} />
          <input type="hidden" name="ocrConfidence" value={ocrConfidence || ""} />

          <FieldGroup className="gap-3.5">
            <div className="grid gap-3 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="inv-num">Numer faktury</FieldLabel>
                <Input
                  id="inv-num"
                  name="invoiceNumber"
                  required
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="Np. FV/11/2026"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="inv-kind">Rodzaj faktury</FieldLabel>
                <select
                  id="inv-kind"
                  name="kind"
                  value={kind}
                  onChange={(e) =>
                    setKind(e.target.value === "purchase" ? "purchase" : "sales")
                  }
                  className={controlClassName}
                >
                  <option value="sales">Sprzedażowa (Przychód)</option>
                  <option value="purchase">Kosztowa (Zakup)</option>
                </select>
              </Field>

              <Field>
                <FieldLabel htmlFor="inv-status">Status płatności</FieldLabel>
                <select
                  id="inv-status"
                  name="status"
                  value={status}
                  onChange={(e) =>
                    setStatus(
                      e.target.value as "issued" | "paid" | "overdue" | "draft",
                    )
                  }
                  className={controlClassName}
                >
                  <option value="issued">Wystawiona</option>
                  <option value="paid">Opłacona</option>
                  <option value="overdue">Po terminie</option>
                  <option value="draft">Szkic</option>
                </select>
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="inv-buyer">Nabywca (Klient / Firma)</FieldLabel>
                <Input
                  id="inv-buyer"
                  name="buyerName"
                  required
                  value={buyerName}
                  onChange={(e) => setBuyerName(e.target.value)}
                  placeholder="Nazwa firmy nabywcy rozpoznana przez OCR..."
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="inv-buyer-nip">NIP Nabywcy</FieldLabel>
                <Input
                  id="inv-buyer-nip"
                  name="buyerNip"
                  value={buyerNip}
                  onChange={(e) => setBuyerNip(e.target.value)}
                  placeholder="10 cyfr NIP"
                />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="inv-seller">Sprzedawca</FieldLabel>
                <Input
                  id="inv-seller"
                  name="sellerName"
                  value={sellerName}
                  onChange={(e) => setSellerName(e.target.value)}
                  placeholder="VoiceLink"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="inv-seller-nip">NIP Sprzedawcy</FieldLabel>
                <Input
                  id="inv-seller-nip"
                  name="sellerNip"
                  value={sellerNip}
                  onChange={(e) => setSellerNip(e.target.value)}
                  placeholder="10 cyfr NIP"
                />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="inv-issue">Data wystawienia</FieldLabel>
                <Input
                  id="inv-issue"
                  name="issueDate"
                  type="date"
                  required
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="inv-sale">Data sprzedaży</FieldLabel>
                <Input
                  id="inv-sale"
                  name="saleDate"
                  type="date"
                  value={saleDate}
                  onChange={(e) => setSaleDate(e.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="inv-due">Termin płatności</FieldLabel>
                <Input
                  id="inv-due"
                  name="dueDate"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <Field>
                <FieldLabel htmlFor="inv-net">Kwota Netto</FieldLabel>
                <Input
                  id="inv-net"
                  name="netAmount"
                  value={netAmount}
                  onChange={(e) => setNetAmount(e.target.value)}
                  placeholder="0,00"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="inv-vat">Kwota VAT</FieldLabel>
                <Input
                  id="inv-vat"
                  name="vatAmount"
                  value={vatAmount}
                  onChange={(e) => setVatAmount(e.target.value)}
                  placeholder="0,00"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="inv-gross">Kwota Brutto</FieldLabel>
                <Input
                  id="inv-gross"
                  name="grossAmount"
                  required
                  value={grossAmount}
                  onChange={(e) => setGrossAmount(e.target.value)}
                  placeholder="0,00"
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="inv-curr">Waluta</FieldLabel>
                <Input
                  id="inv-curr"
                  name="currency"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  placeholder="PLN"
                />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="inv-account">Przypisz do klienta w CRM</FieldLabel>
                <select
                  id="inv-account"
                  name="accountId"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className={controlClassName}
                >
                  <option value="">Dopasuj automatycznie po nazwie lub wybierz...</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.displayName}
                    </option>
                  ))}
                </select>
              </Field>

              <Field>
                <FieldLabel htmlFor="inv-ksef-ref">Numer KSeF (opcjonalnie)</FieldLabel>
                <Input
                  id="inv-ksef-ref"
                  name="ksefReferenceNumber"
                  value={ksefReferenceNumber}
                  onChange={(e) => setKsefReferenceNumber(e.target.value)}
                  placeholder="Np. 5250001020-20261106-..."
                />
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="inv-iban">Numer konta bankowego (IBAN)</FieldLabel>
                <Input
                  id="inv-iban"
                  name="bankAccount"
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value)}
                  placeholder="Rozpoznany rachunek bankowy..."
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="inv-notes">Notatka</FieldLabel>
                <Input
                  id="inv-notes"
                  name="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Dodatkowy opis..."
                />
              </Field>
            </div>
          </FieldGroup>

          {state.error ? (
            <p className="text-xs font-medium text-destructive">{state.error}</p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Anuluj
            </Button>
            <Button type="submit" disabled={pending || ocrRunning || uploadingPdf}>
              {pending || uploadingPdf ? (
                <>
                  <Spinner data-icon="inline-start" />
                  Zapisywanie faktury...
                </>
              ) : (
                <>
                  <CheckCircle2Icon data-icon="inline-start" />
                  Zapisz fakturę i załącznik
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
