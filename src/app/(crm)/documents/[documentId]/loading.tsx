import { Skeleton } from "@/components/ui/skeleton"

export default function DocumentLoading() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-96 w-full" />
    </div>
  )
}
