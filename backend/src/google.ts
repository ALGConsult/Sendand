import crypto from "node:crypto"

import { getConfig } from "./config"

export type GoogleTokens = {
  access_token: string
  expires_in: number
  refresh_token?: string
  scope?: string
  token_type: "Bearer"
  id_token?: string
}

export function generateApiKey(): string {
  // 192-bit random, URL-safe.
  return crypto.randomBytes(24).toString("base64url")
}

export function generateState(): string {
  return crypto.randomBytes(16).toString("base64url")
}

export function getGoogleRedirectUri(): string {
  const cfg = getConfig()
  return `${cfg.baseUrl.replace(/\/+$/, "")}/auth/google/callback`
}

export function getGoogleAuthUrl(state: string): string {
  const cfg = getConfig()
  if (!cfg.googleClientId) throw new Error("Missing GOOGLE_CLIENT_ID")

  const params = new URLSearchParams({
    client_id: cfg.googleClientId,
    redirect_uri: getGoogleRedirectUri(),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    scope: [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
    ].join(" "),
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
  const cfg = getConfig()
  if (!cfg.googleClientId || !cfg.googleClientSecret) {
    throw new Error("Missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET")
  }

  const params = new URLSearchParams({
    code,
    client_id: cfg.googleClientId,
    client_secret: cfg.googleClientSecret,
    redirect_uri: getGoogleRedirectUri(),
    grant_type: "authorization_code",
  })

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Token exchange failed (${res.status}): ${text}`)
  }

  return (await res.json()) as GoogleTokens
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
  const cfg = getConfig()
  if (!cfg.googleClientId || !cfg.googleClientSecret) {
    throw new Error("Missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET")
  }

  const params = new URLSearchParams({
    client_id: cfg.googleClientId,
    client_secret: cfg.googleClientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  })

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Refresh failed (${res.status}): ${text}`)
  }

  return (await res.json()) as GoogleTokens
}

export async function getGoogleUserEmail(accessToken: string): Promise<string> {
  // Use OIDC userinfo endpoint.
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`userinfo failed (${res.status}): ${text}`)
  }
  const data = (await res.json()) as any
  const email = typeof data?.email === "string" ? data.email : ""
  if (!email) throw new Error("Could not determine email from userinfo")
  return email
}

