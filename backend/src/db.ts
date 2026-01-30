import pg from "pg"
import type { Pool as PgPool } from "pg"

import { getConfig } from "./config.js"

const { Pool } = pg

let pool: PgPool | null = null

function shouldUseSsl(connectionString: string): boolean {
  const mode = String(process.env.PGSSLMODE ?? "").toLowerCase()
  if (mode === "disable") return false
  if (mode === "require") return true

  try {
    const host = new URL(connectionString).hostname.toLowerCase()
    // Render external Postgres typically requires SSL.
    if (host.endsWith("render.com")) return true
  } catch {
    // ignore
  }

  return String(process.env.NODE_ENV ?? "").toLowerCase() === "production"
}

export function getPool(): PgPool {
  if (pool) return pool

  const cfg = getConfig()
  if (!cfg.databaseUrl) {
    throw new Error("DATABASE_URL is required for Postgres mode")
  }

  pool = new Pool({
    connectionString: cfg.databaseUrl,
    ssl: shouldUseSsl(cfg.databaseUrl) ? { rejectUnauthorized: false } : undefined,
    max: 10,
  })

  return pool
}

export async function dbQuery<T = any>(text: string, params: any[] = []): Promise<{ rows: T[] }> {
  const p = getPool()
  const res = await p.query(text, params)
  return { rows: res.rows as T[] }
}

