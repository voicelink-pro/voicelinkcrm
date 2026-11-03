import { cn } from "cn"

export function Wordmark({
  tone = "brand",
  className,
}: {
  tone?: "brand" | "inverse"
  className?: string
}) {
  return (
    <span
      className={cn(
        "text-base font-semibold tracking-tight",
        tone === "inverse" ? "text-sidebar-foreground" : "text-primary",
        className,
      )}
    >
      VoiceLink
    </span>
  )
}
