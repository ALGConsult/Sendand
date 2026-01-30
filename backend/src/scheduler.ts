import type { CancelRule, Job, StoredAuth } from "./types"
import { dbQuery } from "./db.js"
import { getAccessToken, getMessageBodyHtml, getMessageMetadata, getThreadMetadata, searchSentMessage, sendReminderEmail, sendReplyInThread, threadHasInboundReply } from "./gmail"

function nowIso(): string {
  return new Date().toISOString()
}

type UserRow = {
  id: string
  email_address: string
  refresh_token: string
  cancel_rule: CancelRule
  created_at: string
  api_key: string
}

type JobRow = {
  id: string
  user_id: string
  type: "followup" | "reminder"
  status: string
  created_at: string
  scheduled_at: string
  sent_at: string
  to_emails: string[]
  cc_emails: string[] | null
  subject: string
  followup_html: string | null
  note_html: string | null
  thread_id: string | null
  original_message_gmail_id: string | null
  original_internal_date_ms: string | null
  original_rfc_message_id: string | null
  original_references: string | null
  original_from_header: string | null
  original_to_header: string | null
  original_cc_header: string | null
  original_date_header: string | null
  original_subject_header: string | null
  last_error: string | null
}

function rowToJob(r: JobRow): Job {
  const base: any = {
    id: r.id,
    type: r.type,
    status: r.status,
    createdAt: new Date(r.created_at).toISOString(),
    scheduledAt: new Date(r.scheduled_at).toISOString(),
    sentAt: new Date(r.sent_at).toISOString(),
    to: r.to_emails ?? [],
    cc: r.cc_emails ?? undefined,
    subject: r.subject,
    threadId: r.thread_id ?? undefined,
    originalMessageGmailId: r.original_message_gmail_id ?? undefined,
    originalInternalDateMs: r.original_internal_date_ms ? Number(r.original_internal_date_ms) : undefined,
    originalRfcMessageId: r.original_rfc_message_id ?? undefined,
    originalReferences: r.original_references ?? undefined,
    originalFromHeader: r.original_from_header ?? undefined,
    originalToHeader: r.original_to_header ?? undefined,
    originalCcHeader: r.original_cc_header ?? undefined,
    originalDateHeader: r.original_date_header ?? undefined,
    originalSubjectHeader: r.original_subject_header ?? undefined,
    lastError: r.last_error ?? undefined,
  }

  if (r.type === "followup") {
    base.followUpHtml = r.followup_html ?? ""
  } else {
    base.noteHtml = r.note_html ?? ""
  }
  return base as Job
}

async function persistJob(userId: string, job: Job): Promise<void> {
  const followupHtml = job.type === "followup" ? job.followUpHtml : null
  const noteHtml = job.type === "reminder" ? job.noteHtml : null

  await dbQuery(
    `UPDATE jobs SET
      status = $3,
      to_emails = $4,
      cc_emails = $5,
      followup_html = $6,
      note_html = $7,
      thread_id = $8,
      original_message_gmail_id = $9,
      original_internal_date_ms = $10,
      original_rfc_message_id = $11,
      original_references = $12,
      original_from_header = $13,
      original_to_header = $14,
      original_cc_header = $15,
      original_date_header = $16,
      original_subject_header = $17,
      last_error = $18
     WHERE id = $1 AND user_id = $2`,
    [
      job.id,
      userId,
      job.status,
      job.to,
      job.cc ?? null,
      followupHtml,
      noteHtml,
      job.threadId ?? null,
      job.originalMessageGmailId ?? null,
      job.originalInternalDateMs ?? null,
      job.originalRfcMessageId ?? null,
      job.originalReferences ?? null,
      job.originalFromHeader ?? null,
      job.originalToHeader ?? null,
      job.originalCcHeader ?? null,
      job.originalDateHeader ?? null,
      job.originalSubjectHeader ?? null,
      job.lastError ?? null,
    ]
  )
}

function isDue(job: Job, nowMs: number): boolean {
  if (job.status === "cancelled" || job.status === "sent") return false
  const t = Date.parse(job.scheduledAt)
  return Number.isFinite(t) && t <= nowMs
}

function shouldResolveThread(job: Job): boolean {
  if (job.type !== "followup") return false
  if (job.threadId) return false
  if (job.status === "cancelled" || job.status === "sent") return false
  return true
}

function uniqLower(items: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const it of items) {
    const key = it.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(it)
  }
  return out
}

function filterSelf(items: string[], selfEmail: string): string[] {
  const self = selfEmail.toLowerCase()
  return items.filter((e) => e.toLowerCase() !== self)
}

function computeReplyAllRecipients(opts: { originalTo: string[]; originalCc: string[]; fallbackTo: string[]; selfEmail: string }): { to: string[]; cc: string[] } {
  const baseTo = opts.originalTo.length > 0 ? opts.originalTo : opts.fallbackTo
  const baseCc = opts.originalCc

  const to = uniqLower(filterSelf(baseTo, opts.selfEmail))
  const cc = uniqLower(filterSelf(baseCc, opts.selfEmail)).filter((e) => !to.some((t) => t.toLowerCase() === e.toLowerCase()))
  return { to, cc }
}

function buildOriginalHeaderBlockHtml(opts: { from?: string; date?: string; subject?: string; to?: string; cc?: string }): string {
  const fromLine = opts.from ? `From: ${opts.from}` : ""
  const dateLine = opts.date ? `Date: ${opts.date}` : ""
  const subjLine = opts.subject ? `Subject: ${opts.subject}` : ""
  const toLine = opts.to ? `To: ${opts.to}` : ""
  const ccLine = opts.cc ? `Cc: ${opts.cc}` : ""

  const headerBlock = ["----- Original Message -----", fromLine, dateLine, subjLine, toLine, ccLine]
    .filter((l) => l && l.trim().length > 0)
    .map((l) => `<div>${l}</div>`)
    .join("")

  return `<div style="margin-top:16px;color:rgba(0,0,0,.70);font-size:12px;">${headerBlock}</div>`
}

async function resolveOriginalForReminderIfNeeded(job: Job, accessToken: string): Promise<Job> {
  if (job.type !== "reminder") return job
  if (job.originalMessageGmailId && job.originalInternalDateMs) return job

  const found = await searchSentMessage(accessToken, { to: job.to, subject: job.subject, sentAtIso: job.sentAt })
  if (!found) {
    job.status = "pending_thread"
    job.lastError = "Could not find original sent message yet (will retry)."
    return job
  }

  const meta = await getMessageMetadata(accessToken, found.messageId)
  job.threadId = meta.threadId
  job.originalMessageGmailId = found.messageId
  job.originalInternalDateMs = meta.internalDateMs
  job.originalRfcMessageId = meta.rfcMessageId
  job.originalReferences = meta.references
  job.originalFromHeader = meta.from
  job.originalToHeader = meta.toHeader
  job.originalCcHeader = meta.ccHeader
  job.originalDateHeader = meta.date
  job.originalSubjectHeader = meta.subject
  job.status = "scheduled"
  job.lastError = undefined
  return job
}

async function resolveThreadIfNeeded(job: Job, accessToken: string, authEmail: string): Promise<Job> {
  if (job.type !== "followup") return job
  if (job.threadId && job.originalMessageGmailId && job.originalInternalDateMs) return job

  const found = await searchSentMessage(accessToken, { to: job.to, subject: job.subject, sentAtIso: job.sentAt })
  if (!found) {
    job.status = "pending_thread"
    job.lastError = "Could not find original sent message yet (will retry)."
    return job
  }

  const meta = await getMessageMetadata(accessToken, found.messageId)
  job.threadId = meta.threadId
  job.originalMessageGmailId = found.messageId
  job.originalInternalDateMs = meta.internalDateMs
  job.originalRfcMessageId = meta.rfcMessageId
  job.originalReferences = meta.references
  job.originalFromHeader = meta.from
  job.originalToHeader = meta.toHeader
  job.originalCcHeader = meta.ccHeader
  job.originalDateHeader = meta.date
  job.originalSubjectHeader = meta.subject
  // Use the actual To/Cc from the original sent message so follow-ups can "reply all".
  // Exclude our own address.
  const rcpt = computeReplyAllRecipients({
    originalTo: meta.to ?? [],
    originalCc: meta.cc ?? [],
    fallbackTo: job.to,
    selfEmail: authEmail,
  })
  job.to = rcpt.to.length > 0 ? rcpt.to : job.to
  job.cc = rcpt.cc.length > 0 ? rcpt.cc : undefined
  job.status = "scheduled"
  job.lastError = undefined
  return job
}

async function executeDueJob(authEmail: string, cancelRule: "any_inbound" | "recipient_only", job: Job, accessToken: string): Promise<Job> {
  const nowMs = Date.now()
  if (!isDue(job, nowMs)) return job
  if (job.status === "cancelled" || job.status === "sent") return job

  try {
    if (job.type === "followup") {
      const followup = job
      if (!job.threadId || !job.originalMessageGmailId || !job.originalInternalDateMs) {
        job = await resolveThreadIfNeeded(job, accessToken, authEmail)
        if (!job.threadId || !job.originalMessageGmailId || !job.originalInternalDateMs) return job
      }

      const thread = await getThreadMetadata(accessToken, job.threadId)
      const hasReply = threadHasInboundReply({
        thread,
        originalInternalDateMs: job.originalInternalDateMs!,
        senderEmail: authEmail,
        recipients: [...job.to, ...(job.cc ?? [])],
        cancelRule,
      })

      if (hasReply) {
        job.status = "cancelled"
        job.lastError = "Cancelled: inbound reply detected in thread."
        return job
      }

      await sendReplyInThread({
        accessToken,
        threadId: job.threadId,
        to: job.to,
        cc: job.cc,
        originalSubject: job.subject,
        htmlBody: await (async () => {
          // Include quoted original message so the follow-up contains the prior chain context.
          const originalHtml = job.originalMessageGmailId ? await getMessageBodyHtml(accessToken, job.originalMessageGmailId) : ""
          if (!originalHtml) return followup.followUpHtml

          const quoted = `
            ${buildOriginalHeaderBlockHtml({
              from: job.originalFromHeader,
              date: job.originalDateHeader,
              subject: job.originalSubjectHeader ?? job.subject,
              to: job.originalToHeader,
              cc: job.originalCcHeader,
            })}
            <blockquote style="margin:8px 0 0 0;padding-left:12px;border-left:2px solid rgba(0,0,0,.20);">
              ${originalHtml}
            </blockquote>
          `.trim()

          return `${followup.followUpHtml}<br/><br/>${quoted}`
        })(),
        inReplyToMessageId: job.originalRfcMessageId ?? "",
        references: job.originalReferences ?? "",
      })

      job.status = "sent"
      job.lastError = undefined
      return job
    }

    // reminder: send an email to the authenticated user
    job = await resolveOriginalForReminderIfNeeded(job, accessToken)
    if (job.type !== "reminder") return job
    if (!job.originalMessageGmailId) return job

    const subject = job.subject ? `Reminder: ${job.subject}` : "Reminder"
    const note = job.noteHtml?.trim() ? job.noteHtml : "<p><i>(No note)</i></p>"
    const originalHtml = await getMessageBodyHtml(accessToken, job.originalMessageGmailId)
    const header = buildOriginalHeaderBlockHtml({
      from: job.originalFromHeader,
      date: job.originalDateHeader,
      subject: job.originalSubjectHeader ?? job.subject,
      to: job.originalToHeader,
      cc: job.originalCcHeader,
    })
    const body = `${note}<br/><br/>${header}<blockquote style="margin:8px 0 0 0;padding-left:12px;border-left:2px solid rgba(0,0,0,.20);">${originalHtml}</blockquote>`
    await sendReminderEmail({
      accessToken,
      toEmail: authEmail,
      subject,
      htmlBody: body,
    })
    job.status = "sent"
    job.lastError = undefined
    return job
  } catch (e: any) {
    job.status = "failed"
    job.lastError = e?.message ?? "Execution failed"
    return job
  }
}

export async function schedulerTick(): Promise<void> {
  const nowMs = Date.now()

  const { rows: users } = await dbQuery<UserRow>(
    `SELECT id, email_address, refresh_token, cancel_rule, created_at, api_key
     FROM users`
  )

  for (const u of users) {
    const auth: StoredAuth = {
      userId: u.id,
      apiKey: u.api_key,
      createdAt: new Date(u.created_at).toISOString(),
      emailAddress: u.email_address,
      refreshToken: u.refresh_token,
      cancelRule: u.cancel_rule,
    }

    const { rows: jobRows } = await dbQuery<JobRow>(
      `SELECT *
       FROM jobs
       WHERE user_id = $1 AND status NOT IN ('sent','cancelled')
       ORDER BY scheduled_at ASC`,
      [u.id]
    )

    if (jobRows.length === 0) continue

    let accessToken: string
    try {
      accessToken = await getAccessToken(auth)
    } catch (e: any) {
      // Mark due jobs as failed with auth error.
      const msg = `Auth error: ${e?.message ?? "token refresh failed"}`
      for (const r of jobRows) {
        const job = rowToJob(r)
        if (isDue(job, nowMs) && job.status !== "sent" && job.status !== "cancelled") {
          job.status = "failed"
          job.lastError = msg
          await persistJob(u.id, job)
        }
      }
      continue
    }

    // Pre-resolve followups for reply-all + metadata.
    for (const r of jobRows) {
      let job = rowToJob(r)

      if (shouldResolveThread(job)) {
        try {
          job = await resolveThreadIfNeeded(job, accessToken, auth.emailAddress)
        } catch (e: any) {
          job.status = "pending_thread"
          job.lastError = e?.message ?? "Thread resolution failed"
        }
        await persistJob(u.id, job)
      }
    }

    // Execute due jobs
    for (const r of jobRows) {
      let job = rowToJob(r)
      const updated = await executeDueJob(auth.emailAddress, auth.cancelRule, job, accessToken)
      if (updated !== job || updated.status !== job.status || updated.lastError !== job.lastError) {
        await persistJob(u.id, updated)
      } else if (isDue(job, nowMs)) {
        // still persist to capture any resolution side-effects (e.g. reminder/followup resolution)
        await persistJob(u.id, updated)
      }
    }
  }
}

export function startScheduler(pollMs = 10_000): void {
  // eslint-disable-next-line no-console
  console.log(`[send-and-backend] scheduler started (${pollMs}ms) @ ${nowIso()}`)

  let running = false
  const run = async () => {
    if (running) return
    running = true
    try {
      await schedulerTick()
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[send-and-backend] scheduler tick failed", e)
    } finally {
      running = false
    }
  }

  // Kick immediately then interval.
  void run()
  setInterval(run, pollMs)
}

