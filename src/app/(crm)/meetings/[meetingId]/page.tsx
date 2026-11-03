import type { Metadata } from "next"

import { MeetingDetail } from "@/components/crm/meeting-detail"
import { firstSearchParam, safeInternalPath } from "@/lib/auth/return-to"

export const metadata: Metadata = {
  title: "Spotkanie",
}

export default async function MeetingPage({
  params,
  searchParams,
}: {
  params: Promise<{ meetingId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { meetingId } = await params
  const back = safeInternalPath(firstSearchParam((await searchParams).returnTo), "/meetings")
  return <MeetingDetail meetingId={meetingId} presentation="page" backHref={back} />
}
