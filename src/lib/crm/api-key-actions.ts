"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { getWorkspaceGate } from "@/lib/auth/access"
import { generateApiKey } from "@/lib/api/keys"
import { createAdminClient } from "@/lib/supabase/admin"

export type ApiKeyListItem = {
  id: string
  name: string
  keyPrefix: string
  ownerUserId: string
  ownerName: string
  createdBy: string
  createdByName: string
  createdAt: string
  expiresAt: string | null
  expired: boolean
  lastUsedAt: string | null
  requestCount: number
  revokedAt: string | null
}

export type CreateApiKeyState = {
  error?: string
  notice?: string
  createdKey?: string
  createdKeyName?: string
  createdOwnerName?: string
  createdExpiresAt?: string | null
  savedAt?: number
}

const createKeySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Podaj nazwę klucza API (np. Agent sprzedaży).")
    .max(120, "Nazwa może mieć maksymalnie 120 znaków."),
  ownerUserId: z.string().uuid().optional().or(z.literal("")),
  expiresInDays: z.enum(["never", "30", "90", "365"]).default("never"),
})

export async function listApiKeysForSettings(
  workspaceId: string,
  viewerId: string,
  role: "admin" | "member",
): Promise<{ items: ApiKeyListItem[]; error: string | null }> {
  try {
    const admin = createAdminClient()
    let query = admin
      .from("api_keys")
      .select(
        "id, name, key_prefix, owner_user_id, created_by, created_at, expires_at, last_used_at, request_count, revoked_at",
      )
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(100)

    if (role !== "admin") {
      query = query.eq("owner_user_id", viewerId)
    }

    const [{ data: keys, error }, { data: profiles }] = await Promise.all([
      query,
      admin
        .from("profiles")
        .select("user_id, full_name")
        .eq("workspace_id", workspaceId),
    ])

    if (error) {
      return {
        items: [],
        error: "Nie udało się wczytać listy kluczy API. Sprawdź czy wdrożono najnowszą migrację bazy.",
      }
    }

    const nowMs = Date.now()
    const nameMap = new Map((profiles ?? []).map((p) => [p.user_id, p.full_name]))

    return {
      error: null,
      items: (keys ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        keyPrefix: row.key_prefix,
        ownerUserId: row.owner_user_id,
        ownerName: nameMap.get(row.owner_user_id) ?? "Członek zespołu",
        createdBy: row.created_by,
        createdByName: nameMap.get(row.created_by) ?? "Użytkownik",
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        expired: row.expires_at !== null && new Date(row.expires_at).getTime() <= nowMs,
        lastUsedAt: row.last_used_at,
        requestCount: row.request_count ?? 0,
        revokedAt: row.revoked_at,
      })),
    }
  } catch {
    return {
      items: [],
      error: "Nie udało się wczytać listy kluczy API.",
    }
  }
}

export async function createApiKeyAction(
  _prev: CreateApiKeyState,
  formData: FormData,
): Promise<CreateApiKeyState> {
  const gate = await getWorkspaceGate()
  if (gate.kind !== "member") {
    return { error: "Brak dostępu do tego obszaru roboczego." }
  }

  const parsed = createKeySchema.safeParse({
    name: formData.get("name"),
    ownerUserId: formData.get("ownerUserId") ?? "",
    expiresInDays: formData.get("expiresInDays") || "never",
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Sprawdź wprowadzone dane." }
  }

  const targetOwnerId =
    gate.role === "admin" && parsed.data.ownerUserId
      ? parsed.data.ownerUserId
      : gate.userId

  try {
    const admin = createAdminClient()

    const [{ data: member }, { data: profile }] = await Promise.all([
      admin
        .from("workspace_members")
        .select("user_id, active")
        .eq("workspace_id", gate.workspaceId)
        .eq("user_id", targetOwnerId)
        .maybeSingle(),
      admin
        .from("profiles")
        .select("full_name")
        .eq("workspace_id", gate.workspaceId)
        .eq("user_id", targetOwnerId)
        .maybeSingle(),
    ])

    if (!member || !member.active) {
      return {
        error: "Wybrany użytkownik nie jest aktywnym członkiem obszaru roboczego.",
      }
    }

    const expiresAt =
      parsed.data.expiresInDays === "never"
        ? null
        : new Date(
            Date.now() + Number(parsed.data.expiresInDays) * 24 * 60 * 60 * 1000,
          ).toISOString()

    const { rawKey, keyPrefix, keyHash } = generateApiKey()

    const { error: insertErr } = await admin.from("api_keys").insert({
      workspace_id: gate.workspaceId,
      owner_user_id: targetOwnerId,
      name: parsed.data.name,
      key_prefix: keyPrefix,
      key_hash: keyHash,
      expires_at: expiresAt,
      created_by: gate.userId,
    })

    if (insertErr) {
      return {
        error:
          "Nie udało się zapisać klucza API w bazie. Upewnij się, że migracja tabeli api_keys została wdrożona.",
      }
    }

    revalidatePath("/settings")

    return {
      savedAt: Date.now(),
      createdKey: rawKey,
      createdKeyName: parsed.data.name,
      createdOwnerName: profile?.full_name ?? "Członek zespołu",
      createdExpiresAt: expiresAt,
      notice:
        "Wygenerowano nowy klucz API. Skopiuj go teraz — ze względów bezpieczeństwa nie pokażemy go ponownie.",
    }
  } catch {
    return { error: "Wystąpił błąd podczas generowania klucza API." }
  }
}

export async function revokeApiKeyAction(
  keyId: string,
): Promise<{ ok: boolean; error?: string }> {
  const gate = await getWorkspaceGate()
  if (gate.kind !== "member") {
    return { ok: false, error: "Brak dostępu do tego obszaru roboczego." }
  }

  const trimmedId = keyId.trim()
  if (!/^[0-9a-f-]{36}$/i.test(trimmedId)) {
    return { ok: false, error: "Nieprawidłowy identyfikator klucza." }
  }

  try {
    const admin = createAdminClient()
    const { data: existing } = await admin
      .from("api_keys")
      .select("id, workspace_id, owner_user_id, revoked_at")
      .eq("id", trimmedId)
      .eq("workspace_id", gate.workspaceId)
      .maybeSingle()

    if (!existing) {
      return { ok: false, error: "Nie znaleziono takiego klucza API." }
    }

    if (gate.role !== "admin" && existing.owner_user_id !== gate.userId) {
      return { ok: false, error: "Możesz unieważniać wyłącznie własne klucze API." }
    }

    if (existing.revoked_at) {
      return { ok: true }
    }

    const { error } = await admin
      .from("api_keys")
      .update({
        revoked_at: new Date().toISOString(),
        revoked_by: gate.userId,
      })
      .eq("id", existing.id)
      .eq("workspace_id", gate.workspaceId)

    if (error) {
      return { ok: false, error: "Nie udało się unieważnić klucza API." }
    }

    revalidatePath("/settings")
    return { ok: true }
  } catch {
    return { ok: false, error: "Wystąpił błąd podczas unieważniania klucza." }
  }
}
