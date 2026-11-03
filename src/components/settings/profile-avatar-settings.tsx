"use client"

import { useRouter } from "next/navigation"
import { useActionState, useEffect, useRef, useState } from "react"
import {
  CameraIcon,
  CheckCircle2Icon,
  ImagePlusIcon,
  Trash2Icon,
  UploadIcon,
  UserIcon,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "cn"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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
import { Spinner } from "@/components/ui/spinner"
import {
  removeMemberAvatarAction,
  updateMemberAvatarAction,
  type ProfileAvatarState,
} from "@/lib/crm/profile-actions"

export type TeamMemberProfile = {
  userId: string
  fullName: string
  avatarUrl: string | null
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]!.slice(0, 1)}${parts[parts.length - 1]!.slice(0, 1)}`.toUpperCase()
}

async function compressImageToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error("Nie udało się odczytać pliku."))
    reader.onload = () => {
      const src = typeof reader.result === "string" ? reader.result : ""
      if (!src) {
        reject(new Error("Pusty plik obrazu."))
        return
      }
      const img = new window.Image()
      img.onerror = () => resolve(src)
      img.onload = () => {
        const size = 256
        const canvas = document.createElement("canvas")
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext("2d")
        if (!ctx) {
          resolve(src)
          return
        }

        // Wyśrodkowane przycięcie do kwadratu 1:1
        const minSide = Math.min(img.width, img.height)
        const sx = Math.max(0, (img.width - minSide) / 2)
        const sy = Math.max(0, (img.height - minSide) / 2)
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size)

        const out = canvas.toDataURL("image/webp", 0.88)
        resolve(out.startsWith("data:image/") ? out : canvas.toDataURL("image/jpeg", 0.88))
      }
      img.src = src
    }
    reader.readAsDataURL(file)
  })
}

export function ProfileAvatarSettings({
  viewerId,
  members,
}: {
  viewerId: string
  members: TeamMemberProfile[]
}) {
  const router = useRouter()
  const [removingId, setRemovingId] = useState<string | null>(null)

  async function handleRemove(member: TeamMemberProfile) {
    setRemovingId(member.userId)
    const res = await removeMemberAvatarAction(member.userId)
    setRemovingId(null)
    if (res.ok) {
      toast.success(`Usunięto zdjęcie profilowe (${member.fullName}).`)
      router.refresh()
    } else {
      toast.error(res.error ?? "Nie udało się usunąć zdjęcia.")
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-2xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground">
              Zdjęcia profilowe użytkowników
            </h2>
            <Badge variant="secondary" className="tabular-nums">
              {members.length} {members.length === 1 ? "osoba" : "osoby"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground sm:text-sm">
            Zmień swoje zdjęcie profilowe lub ustaw awatary członkom zespołu. Zdjęcia wyświetlają się w nagłówku, zadaniach i kalendarzu.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {members.map((member) => {
          const isMe = member.userId === viewerId
          const isRemoving = removingId === member.userId

          return (
            <div
              key={member.userId}
              className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-muted/15 p-3.5 shadow-2xs transition-colors hover:bg-muted/25"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="size-12 ring-2 ring-background shadow-2xs">
                  {member.avatarUrl ? (
                    <AvatarImage
                      src={member.avatarUrl}
                      alt={member.fullName}
                      className="object-cover"
                    />
                  ) : null}
                  <AvatarFallback className="bg-secondary text-sm font-semibold text-primary">
                    {initials(member.fullName)}
                  </AvatarFallback>
                </Avatar>

                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-foreground">
                      {member.fullName}
                    </span>
                    {isMe ? (
                      <Badge variant="outline" className="text-[10px]">
                        Ty
                      </Badge>
                    ) : null}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {member.avatarUrl ? "Własne zdjęcie profilowe" : "Domyślny inicjał"}
                  </span>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <ChangeMemberAvatarDialog member={member} />

                {member.avatarUrl ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    disabled={isRemoving}
                    aria-label={`Usuń zdjęcie użytkownika ${member.fullName}`}
                    title="Usuń zdjęcie profilowe"
                    onClick={() => void handleRemove(member)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    {isRemoving ? <Spinner /> : <Trash2Icon />}
                  </Button>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function ChangeMemberAvatarDialog({ member }: { member: TeamMemberProfile }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [previewDataUrl, setPreviewDataUrl] = useState<string>(member.avatarUrl ?? "")
  const [fileName, setFileName] = useState<string>("")
  const [dragActive, setDragActive] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [state, action, pending] = useActionState(
    updateMemberAvatarAction,
    {} as ProfileAvatarState,
  )

  useEffect(() => {
    if (state.updatedAt) {
      setOpen(false)
      toast.success(state.notice ?? "Zapisano zdjęcie profilowe.")
      router.refresh()
    }
  }, [state.updatedAt, state.notice, router])

  async function handlePickedFile(file: File | null | undefined) {
    setLocalError(null)
    if (!file) return
    if (!file.type.startsWith("image/")) {
      setLocalError("Wybierz plik graficzny (JPG, PNG lub WEBP).")
      return
    }
    try {
      const dataUrl = await compressImageToDataUrl(file)
      setPreviewDataUrl(dataUrl)
      setFileName(file.name)
    } catch {
      setLocalError("Nie udało się przygotować podglądu zdjęcia.")
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setPreviewDataUrl(member.avatarUrl ?? "")
          setFileName("")
          setLocalError(null)
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <CameraIcon data-icon="inline-start" />
        Zmień zdjęcie
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Zdjęcie profilowe · {member.fullName}</DialogTitle>
          <DialogDescription>
            Przeciągnij plik ze zdjęciem lub wybierz obraz z dysku. Zdjęcie zostanie automatycznie dopasowane do okrągłego awatara.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="flex flex-col gap-4">
          <input type="hidden" name="userId" value={member.userId} />
          <input type="hidden" name="avatarDataUrl" value={previewDataUrl} />

          {/* Podgląd awatara */}
          <div className="flex items-center gap-4 rounded-xl border border-border/80 bg-muted/20 p-3.5">
            <Avatar className="size-16 ring-2 ring-background shadow-sm">
              {previewDataUrl ? (
                <AvatarImage
                  src={previewDataUrl}
                  alt={member.fullName}
                  className="object-cover"
                />
              ) : null}
              <AvatarFallback className="bg-secondary text-lg font-semibold text-primary">
                {initials(member.fullName)}
              </AvatarFallback>
            </Avatar>

            <div className="flex min-w-0 flex-col gap-1">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <UserIcon className="size-3.5 text-primary" />
                {member.fullName}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {fileName
                  ? `Wybrano: ${fileName}`
                  : previewDataUrl
                    ? "Aktualne zdjęcie profilowe"
                    : "Brak wgranego zdjęcia"}
              </span>
            </div>
          </div>

          {/* Pole drag & drop lub wybór pliku */}
          <div
            onDragOver={(e) => {
              e.preventDefault()
              setDragActive(true)
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragActive(false)
              const dropped = e.dataTransfer.files?.[0]
              void handlePickedFile(dropped)
            }}
            className={cn(
              "flex flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors",
              dragActive
                ? "border-primary bg-primary/5"
                : "border-border bg-muted/15 hover:bg-muted/30",
            )}
          >
            <div className="flex size-10 items-center justify-center rounded-full bg-secondary text-primary">
              <ImagePlusIcon className="size-5" />
            </div>
            <div className="flex flex-col gap-0.5">
              <p className="text-xs font-medium text-foreground">
                Przeciągnij i upuść zdjęcie tutaj
              </p>
              <p className="text-[11px] text-muted-foreground">
                PNG, JPG lub WEBP · automatyczne kadrowanie 1:1
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              name="avatarFile"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="sr-only"
              onChange={(e) => void handlePickedFile(e.target.files?.[0])}
            />

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadIcon data-icon="inline-start" />
              Wybierz plik
            </Button>
          </div>

          {localError || state.error ? (
            <p className="text-xs font-medium text-destructive">
              {localError ?? state.error}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Anuluj
            </Button>
            <Button type="submit" disabled={pending || !previewDataUrl}>
              {pending ? (
                <>
                  <Spinner data-icon="inline-start" />
                  Zapisywanie...
                </>
              ) : (
                <>
                  <CheckCircle2Icon data-icon="inline-start" />
                  Zapisz zdjęcie
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
