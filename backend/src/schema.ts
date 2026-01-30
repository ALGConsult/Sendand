import { dbQuery } from "./db.js"

export async function ensureSchema(): Promise<void> {
  // Keep this idempotent; safe to run on every startup.
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email_address TEXT NOT NULL UNIQUE,
      api_key TEXT NOT NULL UNIQUE,
      refresh_token TEXT NOT NULL,
      cancel_rule TEXT NOT NULL DEFAULT 'any_inbound',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `)

  await dbQuery(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      scheduled_at TIMESTAMPTZ NOT NULL,
      sent_at TIMESTAMPTZ NOT NULL,
      to_emails TEXT[] NOT NULL,
      cc_emails TEXT[] NULL,
      subject TEXT NOT NULL,
      followup_html TEXT NULL,
      note_html TEXT NULL,
      thread_id TEXT NULL,
      original_message_gmail_id TEXT NULL,
      original_internal_date_ms BIGINT NULL,
      original_rfc_message_id TEXT NULL,
      original_references TEXT NULL,
      original_from_header TEXT NULL,
      original_to_header TEXT NULL,
      original_cc_header TEXT NULL,
      original_date_header TEXT NULL,
      original_subject_header TEXT NULL,
      last_error TEXT NULL
    );
  `)

  await dbQuery(`CREATE INDEX IF NOT EXISTS jobs_user_id_idx ON jobs(user_id);`)
  await dbQuery(`CREATE INDEX IF NOT EXISTS jobs_status_scheduled_at_idx ON jobs(status, scheduled_at);`)
  await dbQuery(`CREATE INDEX IF NOT EXISTS jobs_scheduled_at_idx ON jobs(scheduled_at);`)
}

