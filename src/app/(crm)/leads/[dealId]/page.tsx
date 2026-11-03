import type { Metadata } from "next"

import { DealCard } from "@/components/crm/deal-card"
import { firstSearchParam, safeInternalPath } from "@/lib/auth/return-to"

export const metadata: Metadata = {
  title: "Karta leada",
}

export default async function DealPage({
  params,
  searchParams,
}: {
  params: Promise<{ dealId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { dealId } = await params
  const back = safeInternalPath(firstSearchParam((await searchParams).returnTo), "/leads")
  return <DealCard dealId={dealId} backHref={back} />
}
