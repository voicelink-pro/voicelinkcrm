import { LeadDialog } from "@/components/crm/lead-dialog"
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export default function LeadWindowLoading() {
  return (
    <LeadDialog>
      <DialogHeader>
        <DialogTitle>Karta leada</DialogTitle>
        <DialogDescription>Wczytywanie karty.</DialogDescription>
      </DialogHeader>
    </LeadDialog>
  )
}
