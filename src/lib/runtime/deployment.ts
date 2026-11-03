export type DeploymentTarget = "development" | "preview" | "production"

type DeploymentEnv = {
  VERCEL_ENV?: string
  ENABLE_PREVIEW_SIDE_EFFECTS?: string
}

function readEnv(env?: DeploymentEnv): DeploymentEnv {
  return (
    env ?? {
      VERCEL_ENV: process.env.VERCEL_ENV,
      ENABLE_PREVIEW_SIDE_EFFECTS: process.env.ENABLE_PREVIEW_SIDE_EFFECTS,
    }
  )
}

export function deploymentTarget(env?: DeploymentEnv): DeploymentTarget {
  const source = readEnv(env)
  if (source.VERCEL_ENV === "production" || source.VERCEL_ENV === "preview" || source.VERCEL_ENV === "development") {
    return source.VERCEL_ENV
  }
  return "development"
}

export function previewSideEffectsAllowed(env?: DeploymentEnv) {
  const source = readEnv(env)
  if (deploymentTarget(source) !== "preview") {
    return true
  }
  return source.ENABLE_PREVIEW_SIDE_EFFECTS === "true"
}
