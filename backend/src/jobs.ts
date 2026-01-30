import crypto from "node:crypto"

import type { Job, JobStatus } from "./types"
import { dbQuery } from "./db.js"

export type CreateFollowupBody = {
  type: "followup"
  scheduledAt: string
  sentAt: string
  to: string[]
  subject: string
  followUpHtml: string
}

export type CreateReminderBody = {
  type: "reminder"
  scheduledAt: string
  sentAt: string
  to: string[]
  subject: string
  noteHtml: string
}

export type CreateJobBody = CreateFollowupBody | CreateReminderBody

export function generateJobId(): string {
  return crypto.randomBytes(12).toString("base64url")
}

export function isValidIso(s: unknown): s is string {
  if (typeof s !== "string") return false
  const t = Date.parse(s)
  return Number.isFinite(t)
}

export function normalizeRecipients(to: unknown): string[] {
  if (!Array.isArray(to)) return []
  return to
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean)
    .slice(0, 50)
}

type JobRow = {
  id: string
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
  const base = {
    id: r.id,
    type: r.type,
    status: r.status as any,
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
  } as const

  if (r.type === "followup") {
    return { ...(base as any), type: "followup", followUpHtml: r.followup_html ?? "" } as any
  }
  return { ...(base as any), type: "reminder", noteHtml: r.note_html ?? "" } as any
}

export async function listJobsForUser(userId: string): Promise<Job[]> {
  const { rows } = await dbQuery<JobRow>(
    `SELECT *
     FROM jobs
     WHERE user_id = $1
     ORDER BY scheduled_at DESC`,
    [userId]
  )
  return rows.map(rowToJob)
}

export async function createJobForUser(userId: string, body: CreateJobBody): Promise<Job> {
  const id = generateJobId()
  const status: JobStatus = "scheduled"

  const scheduledAt = new Date(body.scheduledAt)
  const sentAt = new Date(body.sentAt)
  const to = body.to
  const cc: string[] | null = null
  const subject = body.subject
  const followupHtml = body.type === "followup" ? body.followUpHtml : null
  const noteHtml = body.type === "reminder" ? (body as any).noteHtml ?? "" : null

  const { rows } = await dbQuery<JobRow>(
    `INSERT INTO jobs (
       id, user_id, type, status, scheduled_at, sent_at, to_emails, cc_emails, subject, followup_html, note_html
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
     )
     RETURNING *`,
    [id, userId, body.type, status, scheduledAt.toISOString(), sentAt.toISOString(), to, cc, subject, followupHtml, noteHtml]
  )

  return rowToJob(rows[0]!)
}

export async function cancelJobForUser(userId: string, id: string): Promise<Job | null> {
  const { rows } = await dbQuery<JobRow>(
    `UPDATE jobs
     SET status = 'cancelled', last_error = NULL
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [id, userId]
  )
  return rows[0] ? rowToJob(rows[0]) : null
}

