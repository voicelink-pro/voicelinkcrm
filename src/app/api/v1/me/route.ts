import { apiOk, authenticateApiRequest } from "@/lib/api/auth"
import {
  INTEGRATION_DOCS_STATUS_CODES,
  TASK_PRIORITY_CODES,
  TASK_STATUS_CODES,
} from "@/lib/api/schemas"
import { dealStages, implementationStages, productTypes } from "@/lib/crm/labels"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const result = await authenticateApiRequest(request)
  if (!result.ok) return result.response

  const { auth, correlationId } = result

  return apiOk(
    {
      key: {
        id: auth.keyId,
        name: auth.keyName,
        prefix: auth.keyPrefix,
      },
      actor: {
        user_id: auth.actorUserId,
        full_name: auth.actorName,
        role: auth.actorRole,
      },
      workspace_id: auth.workspaceId,
      dictionaries: {
        deal_stages: dealStages.map(([code, label]) => ({ code, label })),
        implementation_stages: implementationStages.map(([code, label]) => ({ code, label })),
        product_types: productTypes.map(([code, label]) => ({ code, label })),
        task_statuses: [...TASK_STATUS_CODES],
        task_priorities: [...TASK_PRIORITY_CODES],
        integration_docs_statuses: [...INTEGRATION_DOCS_STATUS_CODES],
      },
    },
    correlationId,
  )
}
