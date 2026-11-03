import { previewSideEffectsAllowed } from "@/lib/runtime/deployment"
import { secretsMatch } from "@/lib/worker/secret"
import { runWorkerTick } from "@/lib/worker/tick"

export const dynamic = "force-dynamic"

function bearer(request: Request) {
  const header = request.headers.get("authorization") ?? ""
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length) : ""
}

export async function POST(request: Request) {
  const expected = process.env.JOB_WORKER_SECRET

  if (!expected) {
    return Response.json({ error: "Worker nie jest skonfigurowany." }, { status: 503 })
  }

  if (!secretsMatch(bearer(request), expected)) {
    return Response.json({ error: "Brak dostępu." }, { status: 401 })
  }

  if (!previewSideEffectsAllowed()) {
    return Response.json({ error: "Worker na preview jest wyłączony." }, { status: 503 })
  }

  if (process.env.ENABLE_BACKGROUND_JOBS !== "true") {
    return Response.json({ error: "Worker nie jest włączony." }, { status: 503 })
  }

  try {
    const result = await runWorkerTick()
    return Response.json({ ok: true, claimed: result.claimed })
  } catch {
    return Response.json({ error: "Tik workera nie doszedł do końca." }, { status: 500 })
  }
}
