import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

export const documentBucket = "documents"
export const signedUrlSeconds = 120

export async function createUploadUrl(path: string, upsert: boolean) {
  const admin = createAdminClient()
  const { data, error } = await admin.storage
    .from(documentBucket)
    .createSignedUploadUrl(path, { upsert })

  if (error || !data.signedUrl) {
    return null
  }

  return data.signedUrl
}

export async function createDownloadUrl(path: string, downloadName?: string) {
  const admin = createAdminClient()
  const { data, error } = await admin.storage.from(documentBucket).createSignedUrl(
    path,
    signedUrlSeconds,
    downloadName ? { download: downloadName } : undefined,
  )

  if (error || !data.signedUrl) {
    return null
  }

  return data.signedUrl
}

export async function readObjectInfo(path: string) {
  const admin = createAdminClient()
  const { data, error } = await admin.storage.from(documentBucket).info(path)

  if (error || data.size == null) {
    return null
  }

  return {
    size: data.size,
    contentType: data.contentType ?? "",
  }
}

export async function readObjectPrefix(path: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY

  if (!url || !key) {
    return null
  }

  const response = await fetch(
    `${url}/storage/v1/object/${documentBucket}/${path.split("/").map(encodeURIComponent).join("/")}`,
    {
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key,
        Range: "bytes=0-511",
      },
    },
  )

  if (!response.ok || !response.body) {
    return null
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  while (total < 512) {
    const step = await reader.read()
    if (step.done) break
    chunks.push(step.value)
    total += step.value.length
  }

  await reader.cancel()

  const prefix = new Uint8Array(Math.min(total, 512))
  let offset = 0
  for (const chunk of chunks) {
    const slice = chunk.subarray(0, prefix.length - offset)
    prefix.set(slice, offset)
    offset += slice.length
    if (offset >= prefix.length) break
  }

  return prefix
}

export async function removeObject(path: string) {
  const admin = createAdminClient()
  const removed = await admin.storage.from(documentBucket).remove([path])

  if (!removed.error) {
    return true
  }

  const info = await admin.storage.from(documentBucket).info(path)
  return Boolean(info.error)
}
