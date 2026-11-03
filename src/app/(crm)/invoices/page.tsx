import type { Metadata } from "next"
import { ReceiptTextIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"

export const metadata: Metadata = {
  title: "Faktury",
}

export default function InvoicesPage() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold">Faktury</h1>
            <Badge variant="secondary">W przygotowaniu</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Moduł rozliczeń i faktur firmowych w sekcji Firma.
          </p>
        </div>
      </div>

      <Empty className="rounded-2xl border border-border bg-card py-16 shadow-2xs">
        <EmptyHeader>
          <div className="mx-auto mb-2 flex size-11 items-center justify-center rounded-xl border border-border/80 bg-secondary text-primary">
            <ReceiptTextIcon className="size-5" />
          </div>
          <EmptyTitle>Narzędzie Faktury jest gotowe w nawigacji</EmptyTitle>
          <EmptyDescription>
            Przycisk został dodany do sekcji Firma na sidebarze. W kolejnym kroku możemy rozpocząć implementację listy faktur, statusów płatności i powiązań z klientami.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  )
}
