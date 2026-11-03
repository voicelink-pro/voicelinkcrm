import { DealCard } from "@/components/crm/deal-card"
import { firstSearchParam, safeInternalPath } from "@/lib/auth/return-to"

export default async function LeadWindowPage({
  params,
  searchParams,
}: {
  params: Promise<{ dealId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { dealId: rawId } = await params
  // Next dopisuje znacznik przechwycenia trasy do wartości parametru.
  const dealId = rawId.replace(/^(?:\(\.\))+/, "")
  const back = safeInternalPath(firstSearchParam((await searchParams).returnTo), "/leads")
  return <DealCard dealId={dealId} backHref={back} presentation="window" />
}
