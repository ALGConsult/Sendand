import type express from "express"

import { withReadStore } from "./store"
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
      const auth = await withReadStore((store) => store.authByApiKey[apiKey])
      if (!auth) {
        res.status(401).json({ error: "invalid_api_key" })
        return
      }
      ;(req as AuthedRequest).auth = auth
      next()
    } catch (e) {
      next(e)
    }
  }
}

