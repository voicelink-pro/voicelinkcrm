"use client"

import { useState } from "react"

import { controlClassName } from "@/components/crm/control-styles"

type Segment = {
  id: string
  speaker_name: string | null
  speaker_email: string | null
  offset_ms: number | null
  segment_text: string
}

export function MeetingTranscript({ segments }: { segments: Segment[] }) {
  const [query, setQuery] = useState("")
  const needle = query.trim().toLowerCase()
  const visible = needle
    ? segments.filter((segment) => {
        const speaker = `${segment.speaker_name ?? ""} ${segment.speaker_email ?? ""}`.toLowerCase()
        return speaker.includes(needle) || segment.segment_text.toLowerCase().includes(needle)
      })
    : segments

  return (
    <div className="flex flex-col gap-3">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Szukaj w transkrypcji"
        className={controlClassName}
      />
      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">Brak fragmentów dla tego szukania.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {visible.map((segment) => (
            <li key={segment.id} className="rounded-xl border bg-card p-3 text-sm">
              <p className="font-medium">
                {segment.speaker_name || "Mówca"}
                {segment.speaker_email ? ` · ${segment.speaker_email}` : ""}
                {segment.offset_ms != null ? ` · ${formatOffset(segment.offset_ms)}` : ""}
              </p>
              <p className="whitespace-pre-wrap">{segment.segment_text}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function formatOffset(offsetMs: number) {
  const total = Math.floor(offsetMs / 1000)
  const hours = String(Math.floor(total / 3600)).padStart(2, "0")
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, "0")
  const seconds = String(total % 60).padStart(2, "0")
  return `${hours}:${minutes}:${seconds}`
}
