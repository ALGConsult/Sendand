export type CancelRule = "any_inbound" | "recipient_only"

export type JobType = "followup" | "reminder"

export type JobStatus = "scheduled" | "pending_thread" | "sent" | "cancelled" | "failed"

export type StoredAuth = {
  apiKey: string
  createdAt: string // ISO
  emailAddress: string
  refreshToken: string
  cancelRule: CancelRule
}

export type FollowupJob = {
  apiKey: string
  id: string
  type: "followup"
  status: JobStatus
  createdAt: string // ISO
  scheduledAt: string // ISO
  sentAt: string // ISO (when original email was sent)
  to: string[]
  cc?: string[]
  subject: string
  followUpHtml: string
  // resolved later
  threadId?: string
  originalMessageGmailId?: string
  originalInternalDateMs?: number
  originalRfcMessageId?: string
  originalReferences?: string
  originalFromHeader?: string
  originalToHeader?: string
  originalCcHeader?: string
  originalDateHeader?: string
  originalSubjectHeader?: string
  lastError?: string
}

export type ReminderJob = {
  apiKey: string
  id: string
  type: "reminder"
  status: JobStatus
  createdAt: string // ISO
  scheduledAt: string // ISO
  sentAt: string // ISO (time user clicked send)
  to: string[]
  cc?: string[]
  subject: string
  noteHtml: string
  threadId?: string
  originalMessageGmailId?: string
  originalInternalDateMs?: number
  originalRfcMessageId?: string
  originalReferences?: string
  originalFromHeader?: string
  originalToHeader?: string
  originalCcHeader?: string
  originalDateHeader?: string
  originalSubjectHeader?: string
  lastError?: string
}

export type Job = FollowupJob | ReminderJob

export type StoreShape = {
  authByApiKey: Record<string, StoredAuth>
  jobsById: Record<string, Job>
}

