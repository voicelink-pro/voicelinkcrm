"use client"

import { useActionState, useState } from "react"
import {
  CheckCircle2Icon,
  CopyIcon,
  KeyRoundIcon,
  LinkIcon,
  ShieldCheckIcon,
  UserPlusIcon,
} from "lucide-react"
import { toast } from "sonner"

import { controlClassName } from "@/components/crm/control-styles"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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
  generateMemberInviteLinkAction,
  type InviteMemberState,
  type TeamMemberAdminRow,
} from "@/lib/crm/team-invite-actions"

const initialState: InviteMemberState = {}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return `${parts[0]!.slice(0, 1)}${parts[parts.length - 1]!.slice(0, 1)}`.toUpperCase()
}

export function TeamInviteSettings({
  viewerId,
  members,
}: {
  viewerId: string
  members: TeamMemberAdminRow[]
}) {
  const [state, action, pending] = useActionState(
    generateMemberInviteLinkAction,
    initialState,
  )
  const [copied, setCopied] = useState(false)

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success("Skopiowano link zaproszenia do schowka.")
      setTimeout(() => setCopied(false), 2500)
    } catch {
      toast.error("Nie udało się skopiować linku.")
    }
  }

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5 shadow-2xs">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 pb-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
            <UserPlusIcon className="size-5" />
          </span>
          <div className="flex flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">
                Zaproszenia i dostęp użytkowników
              </h2>
              <Badge variant="secondary" className="gap-1">
                <ShieldCheckIcon className="size-3.5 text-primary" />
                Panel administratora
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Wpisz e-mail (będzie loginem tej osoby) oraz imię i nazwisko.
              System utworzy konto i wygeneruje jednorazowy link do ustawienia
              własnego hasła.
            </p>
          </div>
        </div>
      </div>

      <form action={action} className="grid gap-4">
        <FieldGroup className="grid gap-4 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="invite-email">
              Login (adres e-mail)
            </FieldLabel>
            <Input
              id="invite-email"
              name="email"
              type="email"
              required
              placeholder="np. jan.kowalski@voicelink.pl"
              autoComplete="off"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="invite-name">Imię i nazwisko</FieldLabel>
            <Input
              id="invite-name"
              name="fullName"
              required
              placeholder="np. Jan Kowalski"
              autoComplete="off"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="invite-role">Uprawnienia</FieldLabel>
            <select
              id="invite-role"
              name="role"
              defaultValue="member"
              className={controlClassName}
            >
              <option value="member">Członek zespołu</option>
              <option value="admin">Administrator</option>
            </select>
          </Field>
        </FieldGroup>

        <FieldDescription className="text-xs">
          Jeśli konto o tym adresie już istnieje, wygenerujesz dla niego świeży
          link do ustawienia nowego hasła.
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
                Generowanie linku...
              </>
            ) : (
              <>
                <KeyRoundIcon data-icon="inline-start" />
                Utwórz konto i wygeneruj link zaproszenia
              </>
            )}
          </Button>
        </div>
      </form>

      {state.inviteLink ? (
        <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-xs text-emerald-950">
          <div className="flex items-start gap-2">
            <CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-emerald-600" />
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold">
                {state.notice ?? "Wygenerowano link zaproszenia."}
              </span>
              <span className="text-emerald-800">
                Login: <strong>{state.invitedEmail}</strong> · Link jest ważny przez <strong>48 godzin</strong> i można w niego wchodzić wielokrotnie — wygasa dopiero, gdy użytkownik zapisze hasło.
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2 font-mono text-xs text-foreground">
              <LinkIcon className="size-3.5 shrink-0 text-emerald-600" />
              <input
                type="text"
                readOnly
                value={state.inviteLink}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Wygenerowany link zaproszenia"
                className="w-full min-w-0 bg-transparent outline-none"
              />
            </div>

            <Button
              type="button"
              size="lg"
              onClick={() => void copyLink(state.inviteLink!)}
              className="shrink-0"
            >
              <CopyIcon data-icon="inline-start" />
              {copied ? "Skopiowano!" : "Kopiuj link"}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2.5 border-t border-border/70 pt-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Konta w obszarze roboczym ({members.length})
        </span>
        <div className="grid gap-2 sm:grid-cols-2">
          {members.map((member) => {
            const isMe = member.userId === viewerId
            return (
              <div
                key={member.userId}
                className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-muted/15 px-3.5 py-2.5 text-xs"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar className="size-8 shrink-0">
                    {member.avatarUrl ? (
                      <AvatarImage
                        src={member.avatarUrl}
                        alt={member.fullName}
                        className="object-cover"
                      />
                    ) : null}
                    <AvatarFallback className="bg-secondary text-xs font-semibold text-primary">
                      {initials(member.fullName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-semibold text-foreground">
                      {member.fullName}
                      {isMe ? " (Ty)" : ""}
                    </span>
                    <span className="truncate text-muted-foreground">
                      {member.email || "Brak adresu e-mail"}
                    </span>
                  </div>
                </div>

                <Badge
                  variant={member.role === "admin" ? "default" : "outline"}
                  className="shrink-0"
                >
                  {member.role === "admin" ? "Admin" : "Członek"}
                </Badge>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
