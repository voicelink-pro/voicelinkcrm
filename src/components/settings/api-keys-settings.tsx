"use client"

import { useActionState, useState, useTransition } from "react"
import {
  AlertTriangleIcon,
  BotIcon,
  CheckCircle2Icon,
  CopyIcon,
  KeyRoundIcon,
  ShieldAlertIcon,
  Trash2Icon,
  UserIcon,
} from "lucide-react"
import { toast } from "sonner"

import { controlClassName } from "@/components/crm/control-styles"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import {
  createApiKeyAction,
  revokeApiKeyAction,
  type ApiKeyListItem,
  type CreateApiKeyState,
} from "@/lib/crm/api-key-actions"
import { formatDateTime } from "@/lib/crm/format"
import type { MemberOption } from "@/lib/crm/queries"

const initialState: CreateApiKeyState = {}

export function ApiKeysSettings({
  viewerId,
  isAdmin,
  members,
  keys,
  apiBaseUrl,
  loadError,
}: {
  viewerId: string
  isAdmin: boolean
  members: MemberOption[]
  keys: ApiKeyListItem[]
  apiBaseUrl: string | null
  loadError: string | null
}) {
  const [state, action, pending] = useActionState(createApiKeyAction, initialState)
  const [copiedKey, setCopiedKey] = useState(false)
  const [copiedUrl, setCopiedUrl] = useState(false)
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const activeKeys = keys.filter((k) => !k.revokedAt)
  const revokedKeys = keys.filter((k) => Boolean(k.revokedAt))
  const viewerMember = members.find((m) => m.userId === viewerId)

  async function copyText(text: string, kind: "key" | "url") {
    try {
      await navigator.clipboard.writeText(text)
      if (kind === "key") {
        setCopiedKey(true)
        toast.success("Skopiowano klucz API do schowka.")
        setTimeout(() => setCopiedKey(false), 2500)
      } else {
        setCopiedUrl(true)
        toast.success("Skopiowano bazowy adres API.")
        setTimeout(() => setCopiedUrl(false), 2500)
      }
    } catch {
      toast.error("Nie udało się skopiować do schowka.")
    }
  }

  function handleRevoke(keyId: string) {
    setRevokingId(keyId)
    startTransition(async () => {
      const res = await revokeApiKeyAction(keyId)
      setRevokingId(null)
      setConfirmRevokeId(null)
      if (res.ok) {
        toast.success("Klucz API został unieważniony.")
      } else {
        toast.error(res.error ?? "Nie udało się unieważnić klucza.")
      }
    })
  }

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5 shadow-2xs">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 pb-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
            <BotIcon className="size-5" />
          </span>
          <div className="flex flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">Klucze API dla Agenta AI</h2>
              <Badge variant="secondary" className="font-mono text-[11px]">
                REST /api/v1
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Generuj klucze dostępu do leadów, klientów, wdrożeń, notatek i zadań. Każdy klucz
              wykonuje operacje w imieniu przypisanego członka zespołu (widoczne w historii zmian).
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-border/80 bg-muted/25 p-3.5 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium text-foreground">
            Bazowy adres API:{" "}
            <code className="rounded bg-background px-1.5 py-0.5 font-mono text-primary">
              {apiBaseUrl ?? "/api/v1"}
            </code>
          </span>
          {apiBaseUrl ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void copyText(apiBaseUrl, "url")}
            >
              <CopyIcon data-icon="inline-start" />
              {copiedUrl ? "Skopiowano" : "Kopiuj adres"}
            </Button>
          ) : null}
        </div>
        <p className="text-muted-foreground">
          Autoryzacja nagłówkiem{" "}
          <code className="rounded bg-background px-1 py-0.5 font-mono">
            Authorization: Bearer &lt;klucz&gt;
          </code>{" "}
          lub{" "}
          <code className="rounded bg-background px-1 py-0.5 font-mono">
            X-API-Key: &lt;klucz&gt;
          </code>
          . Pełna dokumentacja endpointów znajduje się w{" "}
          <code className="rounded bg-background px-1 py-0.5 font-mono">docs/AGENT_API.md</code>.
        </p>
      </div>

      {loadError ? (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-xs font-medium text-destructive">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
          <span>{loadError}</span>
        </div>
      ) : null}

      <form action={action} className="grid gap-4">
        <FieldGroup className="grid gap-4 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="api-key-name">Nazwa klucza</FieldLabel>
            <Input
              id="api-key-name"
              name="name"
              required
              maxLength={120}
              placeholder="np. Agent AI — sprzedaż i zadania"
              autoComplete="off"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="api-key-owner">Działa w imieniu członka zespołu</FieldLabel>
            {isAdmin ? (
              <select
                id="api-key-owner"
                name="ownerUserId"
                defaultValue={viewerId}
                className={controlClassName}
              >
                {members.map((member) => (
                  <option key={member.userId} value={member.userId}>
                    {member.fullName}
                    {member.userId === viewerId ? " (Ty)" : ""}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <input type="hidden" name="ownerUserId" value={viewerId} />
                <Input
                  id="api-key-owner"
                  value={viewerMember ? `${viewerMember.fullName} (Ty)` : "Twoje konto"}
                  readOnly
                  disabled
                />
              </>
            )}
          </Field>

          <Field>
            <FieldLabel htmlFor="api-key-expires">Ważność klucza</FieldLabel>
            <select
              id="api-key-expires"
              name="expiresInDays"
              defaultValue="never"
              className={controlClassName}
            >
              <option value="never">Bezterminowo (do unieważnienia)</option>
              <option value="30">30 dni</option>
              <option value="90">90 dni</option>
              <option value="365">365 dni</option>
            </select>
          </Field>
        </FieldGroup>

        <FieldDescription className="text-xs">
          Pełna treść klucza jest wyświetlana tylko jeden raz w momencie utworzenia. W bazie zapisujemy
          wyłącznie bezpieczny skrót SHA-256.
        </FieldDescription>

        {state.error ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-xs font-medium text-destructive">
            {state.error}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? (
              <>
                <Spinner data-icon="inline-start" />
                Generowanie klucza...
              </>
            ) : (
              <>
                <KeyRoundIcon data-icon="inline-start" />
                Wygeneruj nowy klucz API
              </>
            )}
          </Button>
        </div>
      </form>

      {state.createdKey ? (
        <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-xs text-emerald-950">
          <div className="flex items-start gap-2">
            <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold">
                {state.notice ?? "Wygenerowano nowy klucz API."}
              </span>
              <span className="text-emerald-800">
                Nazwa: <strong>{state.createdKeyName}</strong> · Działa jako:{" "}
                <strong>{state.createdOwnerName}</strong>
                {state.createdExpiresAt
                  ? ` · Wygasa: ${formatDateTime(state.createdExpiresAt)}`
                  : " · Bezterminowy"}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2 font-mono text-xs text-foreground">
              <KeyRoundIcon className="size-3.5 shrink-0 text-emerald-600" />
              <input
                type="text"
                readOnly
                value={state.createdKey}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Wygenerowany klucz API"
                className="w-full min-w-0 bg-transparent outline-none"
              />
            </div>

            <Button
              type="button"
              size="lg"
              onClick={() => void copyText(state.createdKey!, "key")}
              className="shrink-0"
            >
              <CopyIcon data-icon="inline-start" />
              {copiedKey ? "Skopiowano!" : "Kopiuj klucz"}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2.5 border-t border-border/70 pt-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Aktywne klucze API ({activeKeys.length})
        </span>

        {activeKeys.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-4 text-xs text-muted-foreground">
            Brak aktywnych kluczy API. Wygeneruj pierwszy klucz powyżej, aby połączyć agenta z CRM.
          </p>
        ) : (
          <div className="grid gap-2.5">
            {activeKeys.map((item) => {
              const expired = item.expired
              const isConfirming = confirmRevokeId === item.id
              const isRevoking = revokingId === item.id

              return (
                <div
                  key={item.id}
                  className="flex flex-col justify-between gap-3 rounded-xl border border-border/80 bg-muted/15 px-4 py-3 text-xs sm:flex-row sm:items-center"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-foreground">{item.name}</span>
                      <code className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                        {item.keyPrefix}••••••••
                      </code>
                      <Badge variant="outline" className="gap-1 font-normal">
                        <UserIcon className="size-3 text-primary" />
                        {item.ownerName}
                        {item.ownerUserId === viewerId ? " (Ty)" : ""}
                      </Badge>
                      {expired ? (
                        <Badge variant="destructive" className="text-[11px]">
                          Wygasł
                        </Badge>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                      <span>Utworzono: {formatDateTime(item.createdAt)}</span>
                      <span>
                        Ostatnie użycie:{" "}
                        {item.lastUsedAt ? formatDateTime(item.lastUsedAt) : "nigdy"}
                      </span>
                      <span>Żądań: {item.requestCount}</span>
                      <span>
                        Ważność:{" "}
                        {item.expiresAt ? formatDateTime(item.expiresAt) : "bezterminowy"}
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {isConfirming ? (
                      <>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={isRevoking}
                          onClick={() => handleRevoke(item.id)}
                        >
                          {isRevoking ? (
                            <Spinner data-icon="inline-start" />
                          ) : (
                            <ShieldAlertIcon data-icon="inline-start" />
                          )}
                          Potwierdź unieważnienie
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isRevoking}
                          onClick={() => setConfirmRevokeId(null)}
                        >
                          Anuluj
                        </Button>
                      </>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmRevokeId(item.id)}
                      >
                        <Trash2Icon data-icon="inline-start" />
                        Unieważnij
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {revokedKeys.length > 0 ? (
        <details className="border-t border-border/70 pt-3 text-xs">
          <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
            Unieważnione klucze ({revokedKeys.length})
          </summary>
          <div className="mt-2.5 grid gap-2">
            {revokedKeys.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/10 px-3 py-2 text-muted-foreground"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="line-through">{item.name}</span>
                  <code className="font-mono text-[11px]">{item.keyPrefix}••••••••</code>
                  <span>· {item.ownerName}</span>
                </div>
                <span className="text-[11px]">
                  Unieważniono: {formatDateTime(item.revokedAt)} · Żądań: {item.requestCount}
                </span>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  )
}
