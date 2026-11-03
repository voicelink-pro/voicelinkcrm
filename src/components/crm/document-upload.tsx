"use client"

import { useRef, useState, type DragEvent } from "react"
import { useRouter } from "next/navigation"
import {
  CheckCircle2Icon,
  FileTextIcon,
  FolderOpenIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
  UploadCloudIcon,
  XCircleIcon,
} from "lucide-react"
import { cn } from "cn"

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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import {
  abandonDocumentAction,
  beginDocumentsAction,
  completeDocumentAction,
  retryDocumentUploadAction,
} from "@/lib/crm/document-actions"
import { mimeIsAllowed } from "@/lib/crm/document-bytes"
import {
  documentCategories,
  documentCategoryStyle,
  documentMimeText,
  formatFileSize,
  type DocumentCategoryCode,
} from "@/lib/crm/document-query"

type Target = {
  accountId?: string
  dealId?: string
}

type Item = {
  localId: string
  file: File
  customName: string
  extension: string
  progress: number
  phase: "queued" | "uploading" | "confirming" | "ready" | "error" | "cancelled"
  documentId?: string
  message?: string
}

function splitFileName(fileName: string): { base: string; extension: string } {
  const trimmed = fileName.trim()
  const dotIndex = trimmed.lastIndexOf(".")
  if (dotIndex <= 0 || dotIndex === trimmed.length - 1) {
    return { base: trimmed || "dokument", extension: "" }
  }
  return {
    base: trimmed.slice(0, dotIndex),
    extension: trimmed.slice(dotIndex),
  }
}

function resolveFinalFileName(item: Item): string {
  const raw = item.customName.trim()
  const base = raw || splitFileName(item.file.name).base || "dokument"
  if (!item.extension) {
    return base.slice(0, 240)
  }
  if (base.toLowerCase().endsWith(item.extension.toLowerCase())) {
    return base.slice(0, 240)
  }
  const maxBaseLength = Math.max(1, 240 - item.extension.length)
  return `${base.slice(0, maxBaseLength)}${item.extension}`
}

function putFile(
  url: string,
  file: File,
  upsert: boolean,
  onProgress: (value: number) => void,
  holder: { xhr: XMLHttpRequest | null },
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    holder.xhr = xhr
    xhr.open("PUT", url)
    xhr.setRequestHeader("x-upsert", upsert ? "true" : "false")
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100))
      }
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error("upload"))
    }
    xhr.onerror = () => reject(new Error("network"))
    xhr.onabort = () => reject(new Error("abort"))
    const body = new FormData()
    body.append("cacheControl", "3600")
    body.append("", file)
    xhr.send(body)
  })
}

export function DocumentUpload({
  maxBytes,
  mimeTypes,
  target,
  lockedTarget,
  triggerLabel = "Dodaj dokument",
  triggerVariant = "default",
  triggerSize = "default",
}: {
  maxBytes: number
  mimeTypes: string[]
  target?: Target
  lockedTarget?: string
  triggerLabel?: string
  triggerVariant?: "default" | "outline" | "secondary"
  triggerSize?: "default" | "sm" | "lg"
}) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const holders = useRef(new Map<string, { xhr: XMLHttpRequest | null }>())
  const [open, setOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [category, setCategory] = useState<DocumentCategoryCode>("offer")
  const [items, setItems] = useState<Item[]>([])
  const [formError, setFormError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  function update(localId: string, patch: Partial<Item>) {
    setItems((current) =>
      current.map((item) => (item.localId === localId ? { ...item, ...patch } : item)),
    )
  }

  function removeQueued(localId: string) {
    setItems((current) => current.filter((item) => item.localId !== localId))
  }

  function addFiles(list: FileList | File[] | null) {
    setFormError(null)
    if (!list) return
    const incoming = Array.from(list)
    if (incoming.length === 0) return

    if (items.length + incoming.length > 20) {
      setFormError("Jednorazowo można dodać maksymalnie 20 plików.")
      return
    }

    const additions: Item[] = incoming.map((file) => {
      const localId = crypto.randomUUID()
      const mime = file.type.trim().toLowerCase()
      const { base, extension } = splitFileName(file.name)
      const item: Item = {
        localId,
        file,
        customName: base,
        extension,
        progress: 0,
        phase: "queued",
      }

      if (!mime || !mimeIsAllowed(mime, mimeTypes)) {
        item.phase = "error"
        item.message = "Ten typ pliku nie jest obsługiwany."
      } else if (file.size <= 0 || file.size > maxBytes) {
        item.phase = "error"
        item.message = "Plik przekracza dopuszczalny rozmiar."
      }

      return item
    })

    setItems((current) => [...current, ...additions])
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    setDragging(false)
    if (running) return
    addFiles(event.dataTransfer.files)
  }

  async function sendOne(item: Item, signedUrl: string, upsert: boolean): Promise<boolean> {
    const holder = holders.current.get(item.localId) ?? { xhr: null }
    holders.current.set(item.localId, holder)
    update(item.localId, { phase: "uploading", progress: 0, message: undefined })
    try {
      await putFile(
        signedUrl,
        item.file,
        upsert,
        (progress) => update(item.localId, { progress }),
        holder,
      )
    } catch (error) {
      const aborted = error instanceof Error && error.message === "abort"
      if (aborted) {
        update(item.localId, { phase: "cancelled", message: "Wysyłka anulowana." })
        return false
      }
      update(item.localId, {
        phase: "error",
        message: "Wysyłka przerwana. Możesz ponowić ten plik.",
      })
      return false
    }

    update(item.localId, { phase: "confirming", progress: 100 })
    const confirmed = await completeDocumentAction(item.documentId ?? "")
    if ("message" in confirmed && confirmed.message) {
      update(item.localId, { phase: "error", message: confirmed.message })
      return false
    }
    update(item.localId, { phase: "ready", message: "Zapisano." })
    return true
  }

  async function startUpload() {
    setFormError(null)
    const pendingItems = items.filter((item) => item.phase === "queued")
    if (pendingItems.length === 0) return

    setRunning(true)
    const started = await beginDocumentsAction({
      category,
      accountId: target?.accountId ?? null,
      dealId: target?.dealId ?? null,
      files: pendingItems.map((item) => ({
        name: resolveFinalFileName(item),
        mime: item.file.type.trim().toLowerCase(),
        size: item.file.size,
      })),
    })

    if (started.message) {
      setFormError(started.message)
      setRunning(false)
      return
    }

    let allSucceeded = true
    for (const [index, item] of pendingItems.entries()) {
      const entry = started.items[index]
      if (!entry || "message" in entry) {
        allSucceeded = false
        update(item.localId, {
          phase: "error",
          message:
            entry && "message" in entry
              ? entry.message
              : "Nie udało się rozpocząć wysyłki.",
        })
        continue
      }
      update(item.localId, { documentId: entry.documentId })
      item.documentId = entry.documentId
      const ok = await sendOne(item, entry.signedUrl, false)
      if (!ok) allSucceeded = false
    }

    setRunning(false)
    router.refresh()

    if (allSucceeded && items.every((item) => item.phase === "queued" || item.phase === "ready")) {
      setItems([])
      setOpen(false)
    }
  }

  async function retry(item: Item) {
    if (!item.documentId) return
    setRunning(true)
    const again = await retryDocumentUploadAction(item.documentId)
    if (!("signedUrl" in again) || !again.signedUrl) {
      update(item.localId, {
        phase: "error",
        message: "message" in again ? again.message : "Ponowienie nie powiodło się.",
      })
      setRunning(false)
      return
    }
    await sendOne(item, again.signedUrl, true)
    setRunning(false)
    router.refresh()
  }

  async function cancel(item: Item) {
    holders.current.get(item.localId)?.xhr?.abort()
    if (item.documentId) {
      const abandoned = await abandonDocumentAction(item.documentId)
      if ("message" in abandoned && abandoned.message) {
        update(item.localId, { phase: "error", message: abandoned.message })
        return
      }
    }
    update(item.localId, { phase: "cancelled", message: "Wysyłka anulowana." })
    router.refresh()
  }

  function handleOpenChange(nextOpen: boolean) {
    if (running && !nextOpen) return
    setOpen(nextOpen)
    if (!nextOpen) {
      setDragging(false)
      setFormError(null)
      setItems((current) =>
        current.filter(
          (item) =>
            item.phase === "uploading" ||
            item.phase === "confirming" ||
            (item.phase === "error" && Boolean(item.documentId)),
        ),
      )
    }
  }

  const queuedCount = items.filter((item) => item.phase === "queued").length
  const acceptedMimeLabel = mimeTypes.map((mime) => documentMimeText(mime)).join(", ")

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button variant={triggerVariant} size={triggerSize} className="w-fit" />
        }
      >
        <PlusIcon data-icon="inline-start" />
        {triggerLabel}
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Dodaj dokument</DialogTitle>
          <DialogDescription>
            Wybierz kategorię, przeciągnij plik lub wskaż go z dysku i nadaj mu czytelną nazwę.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={mimeTypes.join(",")}
          disabled={running}
          className="sr-only"
          onChange={(event) => {
            addFiles(event.target.files)
            event.target.value = ""
          }}
        />

        <FieldGroup className="gap-4">
          {lockedTarget ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/40 px-3 py-2 text-xs">
              <span className="text-muted-foreground">Powiązanie</span>
              <span className="truncate font-medium text-foreground">{lockedTarget}</span>
            </div>
          ) : null}

          <Field>
            <FieldLabel>Kategoria dokumentu</FieldLabel>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Kategoria dokumentu">
              {documentCategories.map(([code, label]) => {
                const style = documentCategoryStyle(code)
                const selected = category === code
                return (
                  <button
                    key={code}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={running}
                    onClick={() => setCategory(code)}
                    className={cn(
                      "flex h-9 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50",
                      selected
                        ? cn(style.badge, "ring-2 ring-current/15 shadow-2xs")
                        : "border-border bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    <span className={cn("size-2 shrink-0 rounded-full", style.dot)} />
                    <span>{label}</span>
                  </button>
                )
              })}
            </div>
          </Field>

          <Field>
            <FieldLabel>Pliki</FieldLabel>
            <div
              onDragOver={(event) => {
                event.preventDefault()
                event.stopPropagation()
                if (!running) setDragging(true)
              }}
              onDragLeave={(event) => {
                event.preventDefault()
                event.stopPropagation()
                setDragging(false)
              }}
              onDrop={handleDrop}
              onClick={() => {
                if (!running) fileInputRef.current?.click()
              }}
              role="button"
              tabIndex={running ? -1 : 0}
              onKeyDown={(event) => {
                if (!running && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault()
                  fileInputRef.current?.click()
                }
              }}
              className={cn(
                "group relative flex cursor-pointer flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                dragging
                  ? "border-primary bg-primary/5"
                  : "border-border/80 bg-muted/25 hover:border-primary/40 hover:bg-muted/45",
                running && "pointer-events-none opacity-60",
              )}
            >
              <div
                className={cn(
                  "flex size-10 items-center justify-center rounded-xl border transition-colors",
                  dragging
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground group-hover:text-primary",
                )}
              >
                <UploadCloudIcon className="size-5" />
              </div>

              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-medium text-foreground">
                  Przeciągnij i upuść pliki tutaj
                </p>
                <p className="text-xs text-muted-foreground">
                  Formaty: {acceptedMimeLabel}
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={running}
                onClick={(event) => {
                  event.stopPropagation()
                  fileInputRef.current?.click()
                }}
              >
                <FolderOpenIcon data-icon="inline-start" />
                Wybierz z dysku
              </Button>
            </div>
          </Field>

          {formError ? (
            <p role="alert" className="text-xs font-medium text-destructive">
              {formError}
            </p>
          ) : null}

          {items.length > 0 ? (
            <div className="flex max-h-64 flex-col gap-2.5 overflow-y-auto pr-0.5">
              {items.map((item, idx) => {
                const nameInputId = `doc-name-${item.localId}`
                const isEditable = item.phase === "queued" && !running
                return (
                  <div
                    key={item.localId}
                    className="flex flex-col gap-2.5 rounded-xl border border-border/80 bg-card p-3 shadow-2xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                          <FileTextIcon className="size-4" />
                        </div>
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate text-xs font-medium text-foreground">
                            {resolveFinalFileName(item)}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {formatFileSize(item.file.size)}
                            {item.phase === "uploading" ? ` · ${item.progress}%` : ""}
                            {item.phase === "confirming" ? " · weryfikacja..." : ""}
                            {item.phase === "ready" ? " · zapisano" : ""}
                          </span>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        {item.phase === "ready" ? (
                          <Badge
                            variant="outline"
                            className="border-emerald-200 bg-emerald-50 text-emerald-700"
                          >
                            <CheckCircle2Icon data-icon="inline-start" />
                            Gotowy
                          </Badge>
                        ) : null}
                        {item.phase === "error" ? (
                          <Badge variant="destructive">
                            <XCircleIcon data-icon="inline-start" />
                            Błąd
                          </Badge>
                        ) : null}
                        {isEditable || (item.phase === "error" && !item.documentId) ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`Usuń plik ${item.file.name} z listy`}
                            onClick={() => removeQueued(item.localId)}
                          >
                            <Trash2Icon />
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    {isEditable ? (
                      <Field className="gap-1">
                        <FieldLabel htmlFor={nameInputId} className="text-xs text-muted-foreground">
                          Nazwa dokumentu {items.length > 1 ? `#${idx + 1}` : ""}
                        </FieldLabel>
                        <div className="flex items-center gap-1.5">
                          <Input
                            id={nameInputId}
                            value={item.customName}
                            onChange={(event) =>
                              update(item.localId, { customName: event.target.value })
                            }
                            placeholder="Wpisz własną nazwę pliku..."
                            className="h-8 text-sm"
                          />
                          {item.extension ? (
                            <span className="inline-flex h-8 shrink-0 items-center rounded-md border border-border/70 bg-muted/50 px-2 font-mono text-xs text-muted-foreground">
                              {item.extension}
                            </span>
                          ) : null}
                        </div>
                        <FieldDescription className="text-[11px]">
                          Oryginalny plik: {item.file.name}
                        </FieldDescription>
                      </Field>
                    ) : null}

                    {item.phase === "uploading" || item.phase === "confirming" ? (
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                    ) : null}

                    {item.message && item.phase !== "ready" ? (
                      <p
                        className={cn(
                          "text-xs",
                          item.phase === "error" ? "text-destructive" : "text-muted-foreground",
                        )}
                      >
                        {item.message}
                      </p>
                    ) : null}

                    {(item.phase === "error" && item.documentId) ||
                    item.phase === "uploading" ||
                    item.phase === "confirming" ? (
                      <div className="flex flex-wrap gap-2">
                        {item.phase === "error" && item.documentId ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            onClick={() => void retry(item)}
                          >
                            <RefreshCwIcon data-icon="inline-start" />
                            Ponów
                          </Button>
                        ) : null}
                        {item.phase === "uploading" || item.phase === "confirming" ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            onClick={() => void cancel(item)}
                          >
                            Anuluj
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : null}
        </FieldGroup>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={running}
            onClick={() => handleOpenChange(false)}
          >
            Anuluj
          </Button>
          <Button
            type="button"
            disabled={running || queuedCount === 0}
            onClick={() => void startUpload()}
          >
            {running ? (
              <>
                <Spinner data-icon="inline-start" />
                Wgrywanie...
              </>
            ) : queuedCount > 1 ? (
              `Wgraj pliki (${queuedCount})`
            ) : (
              "Wgraj dokument"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
