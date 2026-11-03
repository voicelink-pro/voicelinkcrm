import { Skeleton } from "@/components/ui/skeleton"

export default function NewTaskLoading() {
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-96 w-full" />
    </div>
  )
}
