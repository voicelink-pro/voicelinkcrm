const accounts = {
  "fathom/account-1": {
    apiKeys: ["FATHOM_ACCOUNT_1_API_KEY", "FATHOM_API_KEY", "FATHOM_SITE_ID"] as const,
    webhookSecret: "FATHOM_ACCOUNT_1_WEBHOOK_SECRET",
  },
  "fathom/account-2": {
    apiKeys: ["FATHOM_ACCOUNT_2_API_KEY"] as const,
    webhookSecret: "FATHOM_ACCOUNT_2_WEBHOOK_SECRET",
  },
} as const

export type FathomSecretRef = keyof typeof accounts

export function isFathomSecretRef(value: string): value is FathomSecretRef {
  return value in accounts
}

export function fathomApiKey(secretRef: string) {
  if (!isFathomSecretRef(secretRef)) {
    return null
  }

  for (const envName of accounts[secretRef].apiKeys) {
    const value = process.env[envName]?.trim()
    if (value) {
      return value
    }
  }

  return null
}

export function fathomWebhookSecret(secretRef: string) {
  if (!isFathomSecretRef(secretRef)) {
    return null
  }

  const value = process.env[accounts[secretRef].webhookSecret]?.trim()
  return value || null
}

export function fathomSecretConfigured(secretRef: string) {
  return {
    apiKey: Boolean(fathomApiKey(secretRef)),
    webhookSecret: Boolean(fathomWebhookSecret(secretRef)),
  }
}
