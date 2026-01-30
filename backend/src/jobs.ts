import crypto from "node:crypto"

import type { Job, JobStatus } from "./types"
import { nowIso, withReadStore, withStore } from "./store"

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

export function getJobSafe(job: Job): Job {
  // Strip internal fields (apiKey should never be returned to the client).
  const { apiKey: _apiKey, ...safe } = job as any
  return safe as Job
}

export async function listJobsForApiKey(apiKey: string): Promise<Job[]> {
  return await withReadStore((store) => {
    const all = Object.values(store.jobsById)
    return all.filter((j) => (j as any).apiKey === apiKey).map(getJobSafe)
  })
}

export async function createJobForApiKey(apiKey: string, body: CreateJobBody): Promise<Job> {
  const id = generateJobId()
  const createdAt = nowIso()
  const status: JobStatus = "scheduled"

  const base = {
    apiKey,
    id,
    status,
    createdAt,
    scheduledAt: body.scheduledAt,
    sentAt: body.sentAt,
    to: body.to,
    subject: body.subject,
  } as const

  const job: Job =
    body.type === "followup"
      ? ({
          ...base,
          type: "followup",
          followUpHtml: body.followUpHtml,
        } as any)
      : ({
          ...base,
          type: "reminder",
          noteHtml: (body as any).noteHtml ?? "",
        } as any)

  await withStore((store) => {
    store.jobsById[id] = job
  })

  return getJobSafe(job)
}

export async function cancelJobForApiKey(apiKey: string, id: string): Promise<Job | null> {
  return await withStore((store) => {
    const job = store.jobsById[id] as any
    if (!job) return null
    if (job.apiKey !== apiKey) return null
    if (job.status === "sent" || job.status === "cancelled") return getJobSafe(job)
    job.status = "cancelled"
    job.lastError = undefined
    return getJobSafe(job)
  })
}

