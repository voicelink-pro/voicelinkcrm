import { Skeleton } from "@/components/ui/skeleton"

export default function LoadingCalendar() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-9 w-80" />
      </div>
      <Skeleton className="h-[34rem] w-full rounded-2xl" />
    </div>
  )
}
