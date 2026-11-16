"use server"

import { createHash, randomBytes } from "node:crypto"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { z } from "zod"

import { getWorkspaceGate } from "@/lib/auth/access"
import { createAdminClient } from "@/lib/supabase/admin"
import { getAppOrigin } from "@/lib/supabase/env"
import { createClient } from "@/lib/supabase/server"
import {
  fieldErrorsFromZod,
  newPasswordSchema,
  type AuthFormState,
} from "@/lib/validation/auth"

export type TeamMemberAdminRow = {
  userId: string
  fullName: string
  email: string
  role: "admin" | "member"
  active: boolean
  avatarUrl: string | null
  createdAt: string
}

export type InviteMemberState = {
  error?: string
  notice?: string
  inviteLink?: string
  invitedEmail?: string
  invitedName?: string
  expiresAt?: string
  savedAt?: number
}

export type ActiveInviteInfo = {
  email: string
  fullName: string
  expiresAt: string
}

const INVITE_TTL_MS = 48 * 60 * 60 * 1000 // 48 godzin

const inviteSchema = z.object({
  email: z.string().trim().email("Podaj prawidłowy adres e-mail.").max(254),
  fullName: z.string().trim().min(1, "Podaj imię i nazwisko.").max(120),
  role: z.enum(["member", "admin"]).optional().default("member"),
})

function hashInviteToken(rawToken: string): string {
  return createHash("sha256").update(rawToken.trim()).digest("hex")
}

async function resolvePublicOrigin(): Promise<string> {
  const h = await headers()
  const proto = h.get("x-forwarded-proto") || "https"
  const host = h.get("x-forwarded-host") || h.get("host")
  if (host) {
    return `${proto}://${host}`
  }
  return getAppOrigin() ?? "https://voicelinkcrm.vercel.app"
}

export async function listWorkspaceMembersForAdmin(
  workspaceId: string,
): Promise<TeamMemberAdminRow[]> {
  try {
    const admin = createAdminClient()
    const [{ data: members }, { data: profiles }, usersRes] = await Promise.all([
      admin
        .from("workspace_members")
        .select("user_id, role, active, created_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: true }),
      admin
        .from("profiles")
        .select("user_id, full_name, avatar_url")
        .eq("workspace_id", workspaceId),
      admin.auth.admin.listUsers({ page: 1, perPage: 200 }),
    ])

    const profileMap = new Map(
      (profiles ?? []).map((p) => [
        p.user_id,
        { fullName: p.full_name, avatarUrl: p.avatar_url ?? null },
      ]),
    )
    const emailMap = new Map(
      (usersRes.data?.users ?? []).map((u) => [u.id, u.email ?? ""]),
    )

    return (members ?? []).map((m) => {
      const prof = profileMap.get(m.user_id)
      const email = emailMap.get(m.user_id) ?? ""
      return {
        userId: m.user_id,
        fullName: prof?.fullName || email.split("@")[0] || "Użytkownik",
        email,
        role: m.role === "admin" ? "admin" : "member",
        active: m.active,
        avatarUrl: prof?.avatarUrl ?? null,
        createdAt: m.created_at,
      }
    })
  } catch {
    return []
  }
}

export async function generateMemberInviteLinkAction(
  _prev: InviteMemberState,
  formData: FormData,
): Promise<InviteMemberState> {
  const gate = await getWorkspaceGate()
  if (gate.kind !== "member" || gate.role !== "admin") {
    return { error: "Tylko administrator może generować zaproszenia." }
  }

  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    fullName: formData.get("fullName"),
    role: formData.get("role") || "member",
  })

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return { error: firstIssue?.message ?? "Sprawdź wprowadzone dane." }
  }

  const email = parsed.data.email.toLowerCase()
  const fullName = parsed.data.fullName
  const role = parsed.data.role

  try {
    const admin = createAdminClient()

    // 1. Sprawdź czy użytkownik o tym e-mailu już istnieje w Auth
    const listRes = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
    let authUser = (listRes.data?.users ?? []).find(
      (u) => (u.email ?? "").toLowerCase() === email,
    )

    if (!authUser) {
      const randomPassword = `${randomBytes(18).toString("base64url")}Aa1!`
      const createdRes = await admin.auth.admin.createUser({
        email,
        password: randomPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      })

      if (createdRes.error || !createdRes.data?.user) {
        return {
          error:
            createdRes.error?.message ??
            "Nie udało się utworzyć konta użytkownika w Supabase Auth.",
        }
      }
      authUser = createdRes.data.user
    }

    // 2. Dodaj lub uaktywnij członkostwo w workspace_members
    const { data: existingMember } = await admin
      .from("workspace_members")
      .select("id, role")
      .eq("workspace_id", gate.workspaceId)
      .eq("user_id", authUser.id)
      .maybeSingle()

    if (existingMember) {
      await admin
        .from("workspace_members")
        .update({
          active: true,
          role: existingMember.role === "admin" ? "admin" : role,
          updated_by: gate.userId,
        })
        .eq("id", existingMember.id)
    } else {
      const { error: memberErr } = await admin.from("workspace_members").insert({
        workspace_id: gate.workspaceId,
        user_id: authUser.id,
        role,
        active: true,
        created_by: gate.userId,
        updated_by: gate.userId,
      })
      if (memberErr) {
        return { error: "Nie udało się dodać użytkownika do obszaru roboczego." }
      }
    }

    // 3. Dodaj lub zaktualizuj profil w public.profiles
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("workspace_id", gate.workspaceId)
      .eq("user_id", authUser.id)
      .maybeSingle()

    if (existingProfile) {
      await admin
        .from("profiles")
        .update({
          full_name: fullName,
          updated_by: gate.userId,
        })
        .eq("id", existingProfile.id)
    } else {
      const { error: profileErr } = await admin.from("profiles").insert({
        workspace_id: gate.workspaceId,
        user_id: authUser.id,
        full_name: fullName,
        created_by: gate.userId,
        updated_by: gate.userId,
      })
      if (profileErr) {
        return { error: "Nie udało się zapisać profilu użytkownika." }
      }
    }

    // 4. Unieważnij wcześniejsze nieużyte zaproszenia tej osoby i wygeneruj nowy link ważny 48h,
    // który można otwierać dowolną liczbę razy aż do momentu zapisania hasła.
    const nowIso = new Date().toISOString()
    await admin
      .from("workspace_invites")
      .update({ used_at: nowIso })
      .eq("user_id", authUser.id)
      .is("used_at", null)

    const rawToken = randomBytes(24).toString("base64url")
    const tokenHash = hashInviteToken(rawToken)
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString()

    const { error: inviteErr } = await admin.from("workspace_invites").insert({
      workspace_id: gate.workspaceId,
      user_id: authUser.id,
      email,
      full_name: fullName,
      role,
      token_hash: tokenHash,
      expires_at: expiresAt,
      created_by: gate.userId,
    })

    if (inviteErr) {
      return {
        error: "Nie udało się zapisać linku zaproszenia w bazie.",
      }
    }

    const origin = await resolvePublicOrigin()
    const inviteLink = `${origin}/invite/${rawToken}`

    revalidatePath("/settings")
    revalidatePath("/leads")
    revalidatePath("/tasks")
    revalidatePath("/calendar")

    return {
      savedAt: Date.now(),
      invitedEmail: email,
      invitedName: fullName,
      expiresAt,
      inviteLink,
      notice: `Konto dla ${fullName} (${email}) jest gotowe. Link jest ważny przez 48 godzin i można go otwierać wielokrotnie — wygasa dopiero po ustawieniu hasła.`,
    }
  } catch {
    return { error: "Wystąpił błąd podczas generowania zaproszenia." }
  }
}

export async function getActiveInviteByToken(
  rawToken: string,
): Promise<ActiveInviteInfo | null> {
  const cleaned = rawToken.trim()
  if (!cleaned || cleaned.length < 16) return null

  try {
    const admin = createAdminClient()
    const tokenHash = hashInviteToken(cleaned)
    const { data } = await admin
      .from("workspace_invites")
      .select("email, full_name, expires_at, used_at")
      .eq("token_hash", tokenHash)
      .maybeSingle()

    if (!data || data.used_at) return null
    if (new Date(data.expires_at).getTime() <= Date.now()) return null

    return {
      email: data.email,
      fullName: data.full_name,
      expiresAt: data.expires_at,
    }
  } catch {
    return null
  }
}

export async function acceptInviteAndSetPasswordAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const rawToken = String(formData.get("token") ?? "").trim()
  if (!rawToken) {
    return { error: "Brak identyfikatora zaproszenia." }
  }

  const parsed = newPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  })

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFromZod(parsed.error) }
  }

  try {
    const admin = createAdminClient()
    const tokenHash = hashInviteToken(rawToken)
    const { data: invite } = await admin
      .from("workspace_invites")
      .select("id, user_id, email, expires_at, used_at")
      .eq("token_hash", tokenHash)
      .maybeSingle()

    if (!invite || invite.used_at) {
      return {
        error:
          "To zaproszenie zostało już wykorzystane do ustawienia hasła. Zaloguj się swoim e-mailem i hasłem.",
      }
    }

    if (new Date(invite.expires_at).getTime() <= Date.now()) {
      return {
        error:
          "Link zaproszenia wygasł (minęło 48 godzin). Poproś administratora o wygenerowanie nowego linku w Ustawieniach.",
      }
    }

    // 1. Ustaw docelowe hasło użytkownika przez Admin API (bez jednorazowego tokenu sesji)
    const updateRes = await admin.auth.admin.updateUserById(invite.user_id, {
      password: parsed.data.password,
      email_confirm: true,
    })

    if (updateRes.error) {
      return {
        error:
          "Nie udało się zapisać nowego hasła. Sprawdź wymagania i spróbuj ponownie.",
      }
    }

    // 2. Oznacz zaproszenie jako wykorzystane dopiero po udanym zapisie hasła
    await admin
      .from("workspace_invites")
      .update({ used_at: new Date().toISOString() })
      .eq("id", invite.id)

    // 3. Zaloguj od razu użytkownika nowo ustawionym hasłem
    const supabase = await createClient()
    await supabase.auth
      .signInWithPassword({
        email: invite.email,
        password: parsed.data.password,
      })
      .catch(() => undefined)
  } catch {
    return { error: "Nie udało się dokończyć aktywacji konta. Spróbuj ponownie." }
  }

  redirect("/")
}
