function stripLinks(text: string): string {
  // Zamienia [tekst](url) na sam tekst oraz **pogrubienie** na pogrubienie
  return text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1")
}

function renderFormattedInline(text: string) {
  const cleaned = stripLinks(text)
  const parts = cleaned.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      )
    }
    return <span key={idx}>{part}</span>
  })
}

export function MeetingSummary({ markdown }: { markdown: string }) {
  const lines = markdown.split(/\n/)

  return (
    <div className="flex flex-col gap-2.5 text-sm leading-relaxed text-foreground/90">
      {lines.map((line, index) => {
        const trimmed = line.trim()
        if (!trimmed) {
          return null
        }
        if (/^#{1,6}\s+/.test(trimmed)) {
          return (
            <h3
              key={index}
              className="mt-2 first:mt-0 text-sm font-semibold tracking-tight text-foreground"
            >
              {stripLinks(trimmed.replace(/^#{1,6}\s+/, ""))}
            </h3>
          )
        }
        if (/^[-*]\s+/.test(trimmed)) {
          return (
            <div key={index} className="flex items-start gap-2.5 pl-1">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
              <p className="flex-1">{renderFormattedInline(trimmed.replace(/^[-*]\s+/, ""))}</p>
            </div>
          )
        }
        return <p key={index}>{renderFormattedInline(trimmed)}</p>
      })}
    </div>
  )
}
