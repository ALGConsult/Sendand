import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import path from "node:path"

import { getConfig } from "./config"

// Legacy dev-only JSON store. The production backend uses Postgres.
// Keep this file compiling for local fallback/testing.
type StoreShape = {
  authByApiKey: Record<string, unknown>
  jobsById: Record<string, unknown>
}

function defaultStore(): StoreShape {
  return {
    authByApiKey: {},
    jobsById: {},
  }
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function getStorePath(): string {
  const cfg = getConfig()
  return cfg.storePath
}

async function ensureParentDir(filePath: string): Promise<void> {
  const dir = path.dirname(filePath)
  await mkdir(dir, { recursive: true })
}

export async function readStore(): Promise<StoreShape> {
  const p = getStorePath()
  try {
    const raw = await readFile(p, "utf8")
    const parsed = JSON.parse(raw) as StoreShape
    if (!parsed || typeof parsed !== "object") return defaultStore()
    return {
      authByApiKey: parsed.authByApiKey ?? {},
      jobsById: parsed.jobsById ?? {},
    }
  } catch (e: any) {
    if (e?.code === "ENOENT") return defaultStore()
    throw e
  }
}

export async function writeStore(store: StoreShape): Promise<void> {
  const p = getStorePath()
  await ensureParentDir(p)
  const tmp = `${p}.tmp`
  await writeFile(tmp, JSON.stringify(store, null, 2), "utf8")
  await rename(tmp, p)
}

let storeChain: Promise<void> = Promise.resolve()

export async function withReadStore<T>(fn: (store: StoreShape) => Promise<T> | T): Promise<T> {
  const store = await readStore()
  return await fn(store)
}

export async function withStore<T>(fn: (store: StoreShape) => Promise<T> | T): Promise<T> {
  // Serialize all read-modify-write operations to avoid concurrent tmp writes.
  let out!: T
  storeChain = storeChain.then(async () => {
    const store = await readStore()
    out = await fn(store)
    await writeStore(store)
  })
  await storeChain
  return out
}

