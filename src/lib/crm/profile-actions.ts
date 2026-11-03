"use server"

import { revalidatePath } from "next/cache"

import { getWorkspaceGate } from "@/lib/auth/access"
import { createAdminClient } from "@/lib/supabase/admin"

export type ProfileAvatarState = {
  ok?: boolean
  error?: string
  notice?: string
  updatedAt?: string
}

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
])

const maxAvatarBytes = 2 * 1024 * 1024 // 2 MB

function revalidateAvatarViews() {
  revalidatePath("/", "layout")
  revalidatePath("/settings")
  revalidatePath("/calendar")
  revalidatePath("/tasks")
  revalidatePath("/leads")
  revalidatePath("/clients")
}

export async function updateMemberAvatarAction(
  _prev: ProfileAvatarState,
  formData: FormData,
): Promise<ProfileAvatarState> {
  const gate = await getWorkspaceGate()
  if (gate.kind !== "member") {
    return { error: "Brak dostępu do obszaru roboczego." }
  }

  const targetUserId = String(formData.get("userId") ?? "").trim()
  if (!targetUserId) {
    return { error: "Wybierz użytkownika." }
  }

  const avatarDataUrlRaw = String(formData.get("avatarDataUrl") ?? "").trim()
  const file = formData.get("avatarFile")

  let nextAvatarUrl: string | null = null

  if (avatarDataUrlRaw.startsWith("data:image/")) {
    if (avatarDataUrlRaw.length > 1_500_000) {
      return { error: "Zdjęcie profilowe jest za duże. Wybierz mniejszy plik." }
    }
    nextAvatarUrl = avatarDataUrlRaw
  } else if (file instanceof File && file.size > 0) {
    if (!allowedMimeTypes.has(file.type)) {
      return {
        error: "Dozwolone są tylko obrazy JPG, PNG, WEBP lub GIF.",
      }
    }
    if (file.size > maxAvatarBytes) {
      return {
        error: "Plik zdjęcia przekracza 2 MB. Wybierz mniejszy obraz.",
      }
    }
    const bytes = Buffer.from(await file.arrayBuffer())
    nextAvatarUrl = `data:${file.type};base64,${bytes.toString("base64")}`
  } else {
    return { error: "Wybierz plik ze zdjęciem profilowym." }
  }

  const admin = createAdminClient()
  const { data: profile, error: findErr } = await admin
    .from("profiles")
    .select("id, full_name, version")
    .eq("workspace_id", gate.workspaceId)
    .eq("user_id", targetUserId)
    .maybeSingle()

  if (findErr || !profile) {
    return { error: "Nie znaleziono profilu wybranego użytkownika." }
  }

  const { error: updateErr } = await admin
    .from("profiles")
    .update({
      avatar_url: nextAvatarUrl,
      updated_by: gate.userId,
      version: (profile.version ?? 1) + 1,
    })
    .eq("id", profile.id)
    .eq("workspace_id", gate.workspaceId)

  if (updateErr) {
    return { error: "Nie udało się zapisać zdjęcia profilowego." }
  }

  revalidateAvatarViews()
  return {
    ok: true,
    notice: `Zaktualizowano zdjęcie profilowe (${profile.full_name}).`,
    updatedAt: new Date().toISOString(),
  }
}

export async function removeMemberAvatarAction(targetUserId: string): Promise<{
  ok: boolean
  error?: string
}> {
  const gate = await getWorkspaceGate()
  if (gate.kind !== "member") {
    return { ok: false, error: "Brak dostępu." }
  }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from("profiles")
    .select("id, version")
    .eq("workspace_id", gate.workspaceId)
    .eq("user_id", targetUserId)
    .maybeSingle()

  if (!profile) {
    return { ok: false, error: "Nie znaleziono profilu użytkownika." }
  }

  const { error } = await admin
    .from("profiles")
    .update({
      avatar_url: null,
      updated_by: gate.userId,
      version: (profile.version ?? 1) + 1,
    })
    .eq("id", profile.id)
    .eq("workspace_id", gate.workspaceId)

  if (error) {
    return { ok: false, error: "Nie udało się usunąć zdjęcia." }
  }

  revalidateAvatarViews()
  return { ok: true }
}
