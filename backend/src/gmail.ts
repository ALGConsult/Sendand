import { refreshAccessToken } from "./google"
import type { StoredAuth } from "./types"

type GmailListResponse = {
  messages?: Array<{ id: string; threadId: string }>
  nextPageToken?: string
  resultSizeEstimate?: number
}

type GmailMessage = {
  id: string
  threadId: string
  internalDate?: string
  payload?: {
    headers?: Array<{ name: string; value: string }>
    mimeType?: string
    body?: { data?: string }
    parts?: Array<{
      mimeType?: string
      body?: { data?: string }
      parts?: any[]
    }>
  }
}

type GmailThread = {
  id: string
  messages?: GmailMessage[]
}

function base64UrlEncodeUtf8(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url")
}

function base64UrlDecodeToUtf8(s: string): string {
  // Gmail API uses base64url without padding.
  return Buffer.from(s, "base64url").toString("utf8")
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function findPart(msg: GmailMessage, mimeType: string): string | null {
  const walk = (p: any): string | null => {
    if (!p) return null
    if (String(p.mimeType ?? "").toLowerCase() === mimeType.toLowerCase()) {
      const data = p.body?.data
      if (typeof data === "string" && data.length > 0) return data
    }
    const parts: any[] = Array.isArray(p.parts) ? p.parts : []
    for (const child of parts) {
      const found = walk(child)
      if (found) return found
    }
    return null
  }
  return walk(msg.payload)
}

export async function getMessageBodyHtml(accessToken: string, messageId: string): Promise<string> {
  const msg = await gmailFetch<GmailMessage>(accessToken, `messages/${encodeURIComponent(messageId)}?format=full`)

  const htmlData = findPart(msg, "text/html")
  if (htmlData) return base64UrlDecodeToUtf8(htmlData)

  const textData = findPart(msg, "text/plain")
  if (textData) {
    const text = base64UrlDecodeToUtf8(textData)
    return `<div style="white-space:pre-wrap;font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;">${escapeHtml(text)}</div>`
  }

  return ""
}

function headerValue(msg: GmailMessage, name: string): string {
  const headers = msg.payload?.headers ?? []
  const found = headers.find((h) => h.name.toLowerCase() === name.toLowerCase())
  return found?.value ?? ""
}

function extractEmails(s: string): string[] {
  const re = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
  return (s.match(re) ?? []).map((m) => m.trim()).filter(Boolean)
}

async function gmailFetch<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/${path.replace(/^\/+/, "")}`
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Gmail API error ${res.status}: ${text}`)
  }
  return (await res.json()) as T
}

export async function getAccessToken(auth: StoredAuth): Promise<string> {
  const tokens = await refreshAccessToken(auth.refreshToken)
  if (!tokens.access_token) throw new Error("No access_token from refresh")
  return tokens.access_token
}

export async function searchSentMessage(
  accessToken: string,
  opts: { to: string[]; subject: string; sentAtIso: string }
): Promise<{ messageId: string; threadId: string } | null> {
  const sentAtMs = Date.parse(opts.sentAtIso)
  const after = Math.floor((sentAtMs - 10 * 60_000) / 1000)
  const before = Math.floor((sentAtMs + 10 * 60_000) / 1000)

  const toPart = opts.to[0] ? `to:${JSON.stringify(opts.to[0])}` : ""
  const subjPart = opts.subject ? `subject:${JSON.stringify(opts.subject)}` : ""

  const q = ["in:sent", toPart, subjPart, `after:${after}`, `before:${before}`].filter(Boolean).join(" ")

  const params = new URLSearchParams({
    q,
    maxResults: "5",
  })

  const data = await gmailFetch<GmailListResponse>(accessToken, `messages?${params.toString()}`)
  const first = data.messages?.[0]
  if (!first) return null
  return { messageId: first.id, threadId: first.threadId }
}

export async function getMessageMetadata(
  accessToken: string,
  messageId: string
): Promise<{
  threadId: string
  internalDateMs: number
  rfcMessageId: string
  references: string
  from: string
  subject: string
  date: string
  toHeader: string
  ccHeader: string
  to: string[]
  cc: string[]
}> {
  // Note: URLSearchParams w/ duplicate keys needs manual build; easiest is to append.
  const p = new URLSearchParams({ format: "metadata" })
  ;["Message-ID", "References", "In-Reply-To", "From", "To", "Cc", "Subject", "Date"].forEach((h) =>
    p.append("metadataHeaders", h)
  )

  const msg = await gmailFetch<GmailMessage>(accessToken, `messages/${encodeURIComponent(messageId)}?${p.toString()}`)
  const internalDateMs = Number(msg.internalDate ?? "0")
  const rfcMessageId = headerValue(msg, "Message-ID")
  const references = headerValue(msg, "References")
  const from = headerValue(msg, "From")
  const subject = headerValue(msg, "Subject")
  const date = headerValue(msg, "Date")
  const toHeader = headerValue(msg, "To")
  const ccHeader = headerValue(msg, "Cc")
  const to = extractEmails(toHeader)
  const cc = extractEmails(ccHeader)
  if (!msg.threadId) throw new Error("Missing threadId on message")
  return {
    threadId: msg.threadId,
    internalDateMs,
    rfcMessageId,
    references,
    from,
    subject,
    date,
    toHeader,
    ccHeader,
    to,
    cc,
  }
}

export async function getThreadMetadata(accessToken: string, threadId: string): Promise<GmailThread> {
  const p = new URLSearchParams({ format: "metadata" })
  ;["Message-ID", "References", "In-Reply-To", "From", "To", "Cc", "Subject", "Date"].forEach((h) =>
    p.append("metadataHeaders", h)
  )
  return await gmailFetch<GmailThread>(accessToken, `threads/${encodeURIComponent(threadId)}?${p.toString()}`)
}

export function threadHasInboundReply(opts: {
  thread: GmailThread
  originalInternalDateMs: number
  senderEmail: string
  recipients: string[]
  cancelRule: "any_inbound" | "recipient_only"
}): boolean {
  const sender = opts.senderEmail.toLowerCase()
  const recipients = new Set(opts.recipients.map((e) => e.toLowerCase()))
  const msgs = opts.thread.messages ?? []

  for (const m of msgs) {
    const internalDateMs = Number(m.internalDate ?? "0")
    if (!Number.isFinite(internalDateMs) || internalDateMs <= opts.originalInternalDateMs) continue

    const fromHeader = headerValue(m, "From")
    const fromEmails = extractEmails(fromHeader).map((e) => e.toLowerCase())
    const fromIsSender = fromEmails.includes(sender)

    if (fromIsSender) continue // ignore our own outgoing messages

    if (opts.cancelRule === "any_inbound") return true

    // recipient_only: only cancel if the inbound sender is one of the original recipients
    for (const e of fromEmails) {
      if (recipients.has(e)) return true
    }
  }

  return false
}

export async function sendReplyInThread(opts: {
  accessToken: string
  threadId: string
  to: string[]
  cc?: string[]
  originalSubject: string
  htmlBody: string
  inReplyToMessageId: string
  references: string
}): Promise<void> {
  const toLine = opts.to.join(", ")
  const ccLine = (opts.cc ?? []).join(", ")
  const subj = opts.originalSubject.toLowerCase().startsWith("re:") ? opts.originalSubject : `Re: ${opts.originalSubject}`
  const refs = [opts.references, opts.inReplyToMessageId].filter(Boolean).join(" ").trim()

  // IMPORTANT: MIME requires a blank line between headers and body.
  // Do NOT filter out empty strings after adding the separator.
  const headers = [
    `To: ${toLine}`,
    `Subject: ${subj}`,
    ...(ccLine ? [`Cc: ${ccLine}`] : []),
    ...(opts.inReplyToMessageId ? [`In-Reply-To: ${opts.inReplyToMessageId}`] : []),
    ...(refs ? [`References: ${refs}`] : []),
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
  ]

  const mime = `${headers.join("\r\n")}\r\n\r\n${opts.htmlBody ?? ""}`

  const raw = base64UrlEncodeUtf8(mime)

  await gmailFetch(opts.accessToken, "messages/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      threadId: opts.threadId,
      raw,
    }),
  })
}

export async function sendReminderEmail(opts: {
  accessToken: string
  toEmail: string
  subject: string
  htmlBody: string
}): Promise<void> {
  const mime = [
    `To: ${opts.toEmail}`,
    `Subject: ${opts.subject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "",
    opts.htmlBody,
  ].join("\r\n")

  const raw = base64UrlEncodeUtf8(mime)

  await gmailFetch(opts.accessToken, "messages/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  })
}

