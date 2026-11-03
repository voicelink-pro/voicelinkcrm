import { MeetingDetail } from "@/components/crm/meeting-detail"
import { firstSearchParam, safeInternalPath } from "@/lib/auth/return-to"

export default async function MeetingModalPage({
  params,
  searchParams,
}: {
  params: Promise<{ meetingId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { meetingId: rawId } = await params
  const meetingId = rawId.replace(/^(?:\(\.\))+/, "")
  const back = safeInternalPath(firstSearchParam((await searchParams).returnTo), "/meetings")
  return <MeetingDetail meetingId={meetingId} presentation="sheet" backHref={back} />
}
