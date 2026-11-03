import { Skeleton } from "@/components/ui/skeleton"

export default function LeadsLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-8 w-40" />
        <div className="flex gap-2">
          <Skeleton className="h-11 w-28" />
          <Skeleton className="h-11 w-32" />
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-11 w-full rounded-none" />
        ))}
      </div>
    </div>
  )
}
