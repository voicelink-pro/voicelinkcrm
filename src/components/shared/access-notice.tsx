import { logoutAction } from "@/lib/auth/actions"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Wordmark } from "@/components/shell/wordmark"

export function AccessNotice({
  title,
  description,
  email,
  correlationId,
}: {
  title: string
  description: string
  email?: string
  correlationId?: string
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <Wordmark />
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {email ? <p>Zalogowano jako {email}.</p> : null}
          {correlationId ? <p>Identyfikator zdarzenia: {correlationId}</p> : null}
        </CardContent>
        <CardFooter>
          <form action={logoutAction}>
            <Button type="submit" variant="outline">
              Wyloguj
            </Button>
          </form>
        </CardFooter>
      </Card>
    </main>
  )
}
