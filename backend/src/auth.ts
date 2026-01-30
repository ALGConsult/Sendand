import type express from "express"

import { dbQuery } from "./db.js"
import type { StoredAuth } from "./types"

export type AuthedRequest = express.Request & { auth: StoredAuth }

export function requireApiKey(): express.RequestHandler {
  return async (req, res, next) => {
    const apiKey = String(req.header("X-API-Key") ?? "").trim()
    if (!apiKey) {
      res.status(401).json({ error: "missing_api_key" })
      return
    }

    try {
      const { rows } = await dbQuery<{
        id: string
        api_key: string
        created_at: string
        email_address: string
        refresh_token: string
        cancel_rule: "any_inbound" | "recipient_only"
      }>(
        `SELECT id, api_key, created_at, email_address, refresh_token, cancel_rule
         FROM users
         WHERE api_key = $1
         LIMIT 1`,
        [apiKey]
      )
      const row = rows[0]
      if (!row) {
        res.status(401).json({ error: "invalid_api_key" })
        return
      }
      const auth: StoredAuth = {
        userId: row.id,
        apiKey: row.api_key,
        createdAt: new Date(row.created_at).toISOString(),
        emailAddress: row.email_address,
        refreshToken: row.refresh_token,
        cancelRule: row.cancel_rule,
      }
      ;(req as AuthedRequest).auth = auth
      next()
    } catch (e) {
      next(e)
    }
  }
}

