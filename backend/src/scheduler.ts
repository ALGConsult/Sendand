import type { Job } from "./types"
import { nowIso, withStore } from "./store"
import { getAccessToken, getMessageBodyHtml, getMessageMetadata, getThreadMetadata, searchSentMessage, sendReminderEmail, sendReplyInThread, threadHasInboundReply } from "./gmail"

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

async function resolveThreadIfNeeded(apiKey: string, job: Job, accessToken: string, authEmail: string): Promise<Job> {
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
      if (!job.threadId || !job.originalMessageGmailId || !job.originalInternalDateMs) {
        job = await resolveThreadIfNeeded(job.apiKey, job, accessToken, authEmail)
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
          if (!originalHtml) return job.followUpHtml ?? ""

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

          return `${job.followUpHtml}<br/><br/>${quoted}`
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
  await withStore(async (store) => {
    const nowMs = Date.now()

    // Process per API key to reuse tokens.
    const apiKeys = Object.keys(store.authByApiKey)
    for (const apiKey of apiKeys) {
      const auth = store.authByApiKey[apiKey]
      if (!auth) continue

      // Find jobs for this apiKey
      const jobs = Object.values(store.jobsById).filter((j) => j.apiKey === apiKey)
      if (jobs.length === 0) continue

      let accessToken: string
      try {
        accessToken = await getAccessToken(auth)
      } catch (e: any) {
        // Mark all due jobs as failed with auth error.
        for (const j of jobs) {
          if (isDue(j, nowMs) && j.status !== "sent" && j.status !== "cancelled") {
            j.status = "failed"
            j.lastError = `Auth error: ${e?.message ?? "token refresh failed"}`
          }
        }
        continue
      }

      // Resolve thread IDs early for followups (even if not due) to make matching reliable.
      for (const j of jobs) {
        if (!shouldResolveThread(j)) continue
        try {
          await resolveThreadIfNeeded(apiKey, j, accessToken, auth.emailAddress)
        } catch (e: any) {
          j.status = "pending_thread"
          j.lastError = e?.message ?? "Thread resolution failed"
        }
      }

      // Execute due jobs
      for (const j of jobs) {
        const updated = await executeDueJob(auth.emailAddress, auth.cancelRule, j, accessToken)
        store.jobsById[updated.id] = updated
      }
    }

    // update a heartbeat time? (not persisted for now)
  })
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

