import "dotenv/config"

import crypto from "node:crypto"
import express from "express"

import { getConfig } from "./config.js"
import { requireApiKey } from "./auth.js"
import { exchangeCodeForTokens, generateApiKey, generateState, getGoogleAuthUrl, getGoogleUserEmail } from "./google.js"
import { dbQuery } from "./db.js"
import { ensureSchema } from "./schema.js"
import { cancelJobForUser, createJobForUser, isValidIso, listJobsForUser, normalizeRecipients } from "./jobs.js"
import { startScheduler } from "./scheduler.js"

function allowCors(allowedOriginsRaw: string) {
  const allowed = allowedOriginsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)

  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const origin = String(req.headers.origin ?? "")

    // Development-friendly default: allow all.
    if (allowed.includes("*")) {
      res.setHeader("Access-Control-Allow-Origin", origin || "*")
    } else if (origin && allowed.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin)
    }

    res.setHeader("Vary", "Origin")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-API-Key")
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")

    if (req.method === "OPTIONS") {
      res.status(204).end()
      return
    }

    next()
  }
}

async function main() {
  const cfg = getConfig()
  await ensureSchema()

  const app = express()
  app.use(allowCors(cfg.allowedOrigins))
  app.use(express.json({ limit: "1mb" }))

  app.get("/health", (_req, res) => {
    res.json({ ok: true })
  })

  // -----------------------------
  // OAuth: connect Gmail
  // -----------------------------
  const oauthStateIssuedAt = new Map<string, { issuedAt: number; extOrigin?: string }>()

  const isChromeExtensionId = (s: string): boolean => /^[a-p]{32}$/.test(s)

  app.get("/auth/google/start", (req, res) => {
    try {
      const state = generateState()
      const extId = String(req.query.extId ?? "").trim()
      const extOrigin = isChromeExtensionId(extId) ? `chrome-extension://${extId}` : undefined

      oauthStateIssuedAt.set(state, { issuedAt: Date.now(), extOrigin })
      // prune a bit
      for (const [k, meta] of oauthStateIssuedAt.entries()) {
        if (Date.now() - meta.issuedAt > 10 * 60_000) oauthStateIssuedAt.delete(k)
      }
      res.redirect(getGoogleAuthUrl(state))
    } catch (e: any) {
      res.status(500).type("text/plain").send(e?.message ?? "Failed to start Google OAuth")
    }
  })

  app.get("/auth/google/callback", async (req, res) => {
    try {
      const code = String(req.query.code ?? "")
      const state = String(req.query.state ?? "")
      const err = String(req.query.error ?? "")

      if (err) {
        res.status(400).type("text/plain").send(`Google OAuth error: ${err}`)
        return
      }
      if (!code || !state) {
        res.status(400).type("text/plain").send("Missing code/state")
        return
      }
      const meta = oauthStateIssuedAt.get(state)
      if (!meta || Date.now() - meta.issuedAt > 10 * 60_000) {
        res.status(400).type("text/plain").send("Invalid/expired state. Try again.")
        return
      }
      oauthStateIssuedAt.delete(state)

      const tokens = await exchangeCodeForTokens(code)
      if (!tokens.refresh_token) {
        res
          .status(400)
          .type("text/plain")
          .send("No refresh token returned. Remove app access and retry (prompt=consent), or ensure this is the first consent.")
        return
      }

      const emailAddress = await getGoogleUserEmail(tokens.access_token)
      const apiKey = generateApiKey()

      const userId = crypto.randomUUID()
      await dbQuery(
        `INSERT INTO users (id, email_address, api_key, refresh_token, cancel_rule)
         VALUES ($1,$2,$3,$4,'any_inbound')
         ON CONFLICT (email_address) DO UPDATE
           SET api_key = EXCLUDED.api_key,
               refresh_token = EXCLUDED.refresh_token,
               updated_at = NOW()
        `,
        [userId, emailAddress, apiKey, tokens.refresh_token!]
      )

      res
        .status(200)
        .type("text/html")
        .send(
          `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Send& connected</title>
    <style>
      body { font-family: system-ui, Segoe UI, Roboto, Arial, sans-serif; padding: 24px; max-width: 860px; margin: 0 auto; }
      .card { border: 1px solid rgba(0,0,0,.12); border-radius: 12px; padding: 16px; }
      code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
      .key { font-size: 14px; padding: 10px; background: rgba(0,0,0,.04); border-radius: 10px; overflow-wrap: anywhere; }
      .muted { color: rgba(0,0,0,.65); }
    </style>
  </head>
  <body>
    <h2>Gmail connected</h2>
    <div class="card">
      <div id="sendand-auto" class="muted" style="display:none; margin-bottom: 10px;">
        Returning to the extension…
      </div>
      <div class="muted">Signed in as</div>
      <div style="font-weight: 700; margin-bottom: 12px;">${emailAddress}</div>
      <div class="muted">API key (paste into the extension Settings page)</div>
      <div class="key"><code>${apiKey}</code></div>
      <p class="muted" style="margin-top: 12px;">
        Keep this API key private. Anyone with it can schedule follow-ups from your account via this backend.
      </p>
    </div>

    <script>
      (function () {
        try {
          var extOrigin = ${JSON.stringify(meta.extOrigin ?? "")};
          if (!extOrigin) return;
          if (!window.opener || window.opener.closed) return;
          var payload = { type: "sendand_api_key", apiKey: ${JSON.stringify(apiKey)}, email: ${JSON.stringify(emailAddress)} };
          // Send only to the extension origin (prevents leaking to random openers).
          window.opener.postMessage(payload, extOrigin);
          var el = document.getElementById("sendand-auto");
          if (el) el.style.display = "block";
          window.setTimeout(function () { window.close(); }, 600);
        } catch (e) {
          // ignore and fall back to manual copy/paste
        }
      })();
    </script>
  </body>
</html>`
        )
    } catch (e: any) {
      res.status(500).type("text/plain").send(e?.message ?? "OAuth callback failed")
    }
  })

  // -----------------------------
  // Settings API (requires API key)
  // -----------------------------
  app.get("/settings", requireApiKey(), async (req, res) => {
    const auth = (req as any).auth
    res.json({ cancelRule: auth.cancelRule })
  })

  app.put("/settings", requireApiKey(), async (req, res) => {
    const cancelRule = String((req.body ?? {}).cancelRule ?? "")
    if (cancelRule !== "any_inbound" && cancelRule !== "recipient_only") {
      res.status(400).json({ error: "invalid_cancel_rule" })
      return
    }
    const auth = (req as any).auth
    await dbQuery(`UPDATE users SET cancel_rule = $1, updated_at = NOW() WHERE id = $2`, [cancelRule, auth.userId])
    res.json({ cancelRule })
  })

  // -----------------------------
  // Jobs API (requires API key)
  // -----------------------------
  app.get("/jobs", requireApiKey(), async (req, res, next) => {
    try {
      const auth = (req as any).auth
      const jobs = await listJobsForUser(auth.userId)
      res.json({ jobs })
    } catch (e) {
      next(e)
    }
  })

  const createJobHandler: express.RequestHandler = async (req, res, next) => {
    try {
      const auth = (req as any).auth
      const body = req.body ?? {}

      const type = String(body.type ?? "")
      const scheduledAt = String(body.scheduledAt ?? "")
      const sentAt = String(body.sentAt ?? "")
      const to = normalizeRecipients(body.to)
      const subject = String(body.subject ?? "")

      if (type !== "followup" && type !== "reminder") {
        res.status(400).json({ error: "invalid_type" })
        return
      }
      if (!isValidIso(scheduledAt) || !isValidIso(sentAt)) {
        res.status(400).json({ error: "invalid_timestamp" })
        return
      }
      if (to.length === 0) {
        res.status(400).json({ error: "missing_recipients" })
        return
      }
      if (typeof subject !== "string") {
        res.status(400).json({ error: "invalid_subject" })
        return
      }

      if (type === "followup") {
        const followUpHtml = String(body.followUpHtml ?? "")
        if (followUpHtml.length === 0) {
          res.status(400).json({ error: "missing_followup_html" })
          return
        }
        const job = await createJobForUser(auth.userId, {
          type: "followup",
          scheduledAt,
          sentAt,
          to,
          subject,
          followUpHtml,
        })
        res.status(201).json({ job })
        return
      }

      const noteHtml = String(body.noteHtml ?? "")
      const job = await createJobForUser(auth.userId, {
        type: "reminder",
        scheduledAt,
        sentAt,
        to,
        subject,
        noteHtml,
      })
      res.status(201).json({ job })
    } catch (e) {
      next(e)
    }
  }

  app.post("/jobs", requireApiKey(), createJobHandler)
  app.post("/jobs/followup", requireApiKey(), (req, _res, next) => {
    // allow old client shape (server will validate)
    req.body = { ...(req.body ?? {}), type: "followup" }
    next()
  }, createJobHandler)
  app.post("/jobs/reminder", requireApiKey(), (req, _res, next) => {
    req.body = { ...(req.body ?? {}), type: "reminder" }
    next()
  }, createJobHandler)

  app.post("/jobs/:id/cancel", requireApiKey(), async (req, res, next) => {
    try {
      const auth = (req as any).auth
      const id = String(req.params.id ?? "")
      const job = await cancelJobForUser(auth.userId, id)
      if (!job) {
        res.status(404).json({ error: "not_found" })
        return
      }
      res.json({ job })
    } catch (e) {
      next(e)
    }
  })

  app.get("/", (_req, res) => {
    res
      .status(200)
      .type("text/plain")
      .send("Send& backend running. Visit /auth/google/start to connect Gmail (once configured).")
  })

  app.listen(cfg.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[send-and-backend] listening on ${cfg.baseUrl} (port ${cfg.port})`)
  })

  // In production, run the scheduler in a dedicated worker if possible.
  // Set RUN_SCHEDULER=false on the web service to disable.
  if (String(process.env.RUN_SCHEDULER ?? "true").toLowerCase() !== "false") {
    startScheduler()
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("[send-and-backend] fatal", e)
  process.exit(1)
})

