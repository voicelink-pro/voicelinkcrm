import Link from "next/link"
import type { ReactNode } from "react"

export const dynamic = "force-dynamic"

import { Wordmark } from "@/components/shell/wordmark"

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="flex w-full max-w-md flex-col gap-6">
        <Link href="/login" className="w-fit rounded-md focus-visible:ring-2 focus-visible:ring-ring">
          <Wordmark />
        </Link>
        {children}
      </div>
    </main>
  )
}
