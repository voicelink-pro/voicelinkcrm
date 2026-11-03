"use client"

import { useEffect, useRef, useState } from "react"
import Hls from "hls.js"
import { ExternalLinkIcon, PlayCircleIcon, VideoIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"

export function MeetingVideoPlayer({
  meetingId,
  title,
  fallbackUrl,
}: {
  meetingId: string
  title: string
  fallbackUrl: string | null
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [state, setState] = useState<"idle" | "loading" | "ready" | "error">("idle")
  const [streamUrl, setStreamUrl] = useState<string | null>(null)
  const [externalUrl, setExternalUrl] = useState<string | null>(fallbackUrl)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function loadRecording() {
    setState("loading")
    setErrorMessage(null)

    try {
      const response = await fetch(`/api/meetings/${meetingId}/video?mode=info`)
      if (!response.ok) {
        setState("error")
        setErrorMessage("Nie udało się pobrać informacji o nagraniu z API.")
        return
      }
      const data = (await response.json()) as {
        hasStream?: boolean
        streamUrl?: string | null
        externalUrl?: string | null
      }

      if (data.externalUrl) {
        setExternalUrl(data.externalUrl)
      }

      if (!data.hasStream || !data.streamUrl) {
        setState("error")
        setErrorMessage(
          data.externalUrl
            ? "Bezpośredni strumień wideo nie jest dostępny dla tego nagrania. Możesz otworzyć nagranie bezpośrednio w Fathom."
            : "Fathom nie udostępnił jeszcze nagrania wideo dla tego spotkania.",
        )
        return
      }

      setStreamUrl(data.streamUrl)
      setState("ready")
    } catch {
      setState("error")
      setErrorMessage("Wystąpił błąd podczas łączenia z API nagrania.")
    }
  }

  useEffect(() => {
    if (state !== "ready" || !streamUrl || !videoRef.current) return
    const video = videoRef.current

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
      })
      hls.loadSource(streamUrl)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        void video.play().catch(() => undefined)
      })
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setState("error")
          setErrorMessage("Nie udało się odtworzyć strumienia wideo.")
        }
      })
      return () => {
        hls.destroy()
      }
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = streamUrl
      void video.play().catch(() => undefined)
    }
  }, [state, streamUrl])

  return (
    <div className="flex flex-col gap-3">
      {state === "idle" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/80 bg-muted/30 p-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <VideoIcon className="size-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-foreground">Nagranie spotkania</span>
              <span className="text-xs text-muted-foreground">
                Pobierz strumień wideo przez API, aby obejrzeć nagranie bezpośrednio w panelu.
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => void loadRecording()}>
              <PlayCircleIcon data-icon="inline-start" />
              Pobierz nagranie i obejrzyj
            </Button>
            {externalUrl ? (
              <Button
                variant="outline"
                nativeButton={false}
                render={<a href={externalUrl} target="_blank" rel="noreferrer" />}
              >
                <ExternalLinkIcon data-icon="inline-start" />
                Fathom
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {state === "loading" ? (
        <div className="flex h-56 flex-col items-center justify-center gap-2 rounded-xl border border-border/80 bg-muted/30 p-6 text-center">
          <Spinner className="size-6 text-primary" />
          <p className="text-sm font-medium text-foreground">Pobieranie nagrania przez API...</p>
          <p className="text-xs text-muted-foreground">Przygotowujemy odtwarzacz wideo</p>
        </div>
      ) : null}

      {state === "ready" ? (
        <div className="overflow-hidden rounded-xl border border-border bg-black shadow-sm">
          <video
            ref={videoRef}
            controls
            playsInline
            aria-label={`Nagranie spotkania: ${title}`}
            className="aspect-video w-full bg-black"
          />
          {externalUrl ? (
            <div className="flex items-center justify-between border-t border-white/10 bg-zinc-950 px-3.5 py-2 text-xs text-zinc-400">
              <span className="truncate">{title}</span>
              <a
                href={externalUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-1 font-medium text-zinc-200 hover:underline"
              >
                Otwórz w Fathom
                <ExternalLinkIcon className="size-3" />
              </a>
            </div>
          ) : null}
        </div>
      ) : null}

      {state === "error" ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border/80 bg-muted/30 p-4 text-sm">
          <p className="text-muted-foreground">{errorMessage}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void loadRecording()}>
              Spróbuj ponownie
            </Button>
            {externalUrl ? (
              <Button
                variant="default"
                size="sm"
                nativeButton={false}
                render={<a href={externalUrl} target="_blank" rel="noreferrer" />}
              >
                <ExternalLinkIcon data-icon="inline-start" />
                Otwórz nagranie w Fathom
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
