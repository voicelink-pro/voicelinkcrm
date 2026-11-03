import { NextResponse, type NextRequest } from "next/server"

import { getWorkspaceGate } from "@/lib/auth/access"
import { getMeeting } from "@/lib/crm/meeting-read"
import { fathomRecordingUrl } from "@/lib/integrations/fathom/urls"

function extractSharePath(shareUrl: string | null | undefined): string | null {
  const safe = fathomRecordingUrl(shareUrl)
  if (!safe) return null
  try {
    const parsed = new URL(safe)
    const match = /^\/share\/([A-Za-z0-9_-]+)/.exec(parsed.pathname)
    return match ? `/share/${match[1]}` : null
  } catch {
    return null
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> },
) {
  const gate = await getWorkspaceGate()
  if (gate.kind !== "member") {
    return NextResponse.json({ error: "Brak dostępu." }, { status: 403 })
  }

  const { meetingId } = await params
  const loaded = await getMeeting(meetingId)
  if (!loaded.meeting) {
    return NextResponse.json({ error: "Nie znaleziono spotkania." }, { status: 404 })
  }

  const sharePath = extractSharePath(loaded.meeting.share_url)
  const fallbackUrl =
    fathomRecordingUrl(loaded.meeting.share_url) ??
    fathomRecordingUrl(loaded.meeting.recording_url)

  const mode = request.nextUrl.searchParams.get("mode") ?? "info"

  if (mode === "info") {
    return NextResponse.json({
      hasStream: Boolean(sharePath),
      streamUrl: sharePath ? `/api/meetings/${meetingId}/video?mode=playlist` : null,
      externalUrl: fallbackUrl,
      title: loaded.meeting.title,
    })
  }

  if (!sharePath) {
    return NextResponse.json(
      { error: "Brak udostępnionego strumienia wideo dla tego nagrania." },
      { status: 404 },
    )
  }

  if (mode === "playlist") {
    const playlistUrl = `https://fathom.video${sharePath}/video.m3u8`
    const upstream = await fetch(playlistUrl, {
      headers: { Accept: "application/vnd.apple.mpegurl, text/plain, */*" },
    })

    if (!upstream.ok) {
      return NextResponse.json(
        { error: "Nie udało się pobrać listy strumienia z Fathom." },
        { status: 502 },
      )
    }

    const rawM3u8 = await upstream.text()
    const rewritten = rawM3u8
      .split(/\r?\n/)
      .map((line) => {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith("#")) {
          return line
        }
        const keyMatch = /[?&]key=([^&\s]+)/.exec(trimmed)
        if (keyMatch?.[1]) {
          return `/api/meetings/${meetingId}/video?mode=chunk&key=${encodeURIComponent(decodeURIComponent(keyMatch[1]))}`
        }
        return line
      })
      .join("\n")

    return new NextResponse(rewritten, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8",
        "Cache-Control": "private, max-age=60",
      },
    })
  }

  if (mode === "chunk") {
    const key = request.nextUrl.searchParams.get("key") ?? ""
    if (!key || !/^chunk\/[A-Za-z0-9_./-]+\.ts$/.test(key) || key.includes("..")) {
      return NextResponse.json({ error: "Nieprawidłowy fragment wideo." }, { status: 400 })
    }

    const chunkEndpoint = `https://fathom.video${sharePath}/video_chunk?key=${encodeURIComponent(key)}`
    const upstream = await fetch(chunkEndpoint, { redirect: "follow" })
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: "Nie udało się pobrać fragmentu nagrania." }, { status: 502 })
    }

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "video/mp2t",
        "Cache-Control": "private, max-age=300",
      },
    })
  }

  return NextResponse.json({ error: "Nieznany tryb." }, { status: 400 })
}
