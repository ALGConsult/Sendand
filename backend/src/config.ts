export type AppConfig = {
  port: number
  baseUrl: string
  googleClientId: string | null
  googleClientSecret: string | null
  allowedOrigins: string
  storePath: string
}

function env(key: string): string | undefined {
  const v = process.env[key]
  return v === undefined ? undefined : String(v)
}

export function getConfig(): AppConfig {
  const port = Number(env("PORT") ?? "8787")
  const baseUrl = env("BASE_URL") ?? `http://localhost:${Number.isFinite(port) ? port : 8787}`

  return {
    port: Number.isFinite(port) ? port : 8787,
    baseUrl,
    googleClientId: env("GOOGLE_CLIENT_ID") ?? null,
    googleClientSecret: env("GOOGLE_CLIENT_SECRET") ?? null,
    allowedOrigins: env("ALLOWED_ORIGINS") ?? "*",
    storePath: env("STORE_PATH") ?? "./data/store.json",
  }
}

