import { useEffect, useMemo, useState } from "react"

type CancelRule = "any_inbound" | "recipient_only"

type JobStatus = "scheduled" | "pending_thread" | "sent" | "cancelled" | "failed"

type Job = {
  id: string
  type: "followup" | "reminder"
  status: JobStatus
  scheduledAt: string // ISO
  createdAt: string // ISO
  to?: string[]
  subject?: string
  lastError?: string
}

type BackendSettings = {
  cancelRule: CancelRule
}

type SettingsPanelMode = "options" | "popup"

const DEFAULT_BACKEND_URL = "https://sendandbackend.onrender.com"

function norm(s: string): string {
  return (s ?? "").trim()
}

async function storageGet<T>(keysWithDefaults: T): Promise<T> {
  return await new Promise((resolve) => {
    chrome.storage.sync.get(keysWithDefaults as any, (items) => resolve(items as T))
  })
}

async function storageSet(items: Record<string, unknown>): Promise<void> {
  return await new Promise((resolve) => {
    chrome.storage.sync.set(items, () => resolve())
  })
}

async function apiFetch<T>(
  backendUrl: string,
  apiKey: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const url = `${backendUrl.replace(/\/+$/, "")}${path}`
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
      ...(init?.headers ?? {}),
    },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`HTTP ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`)
  }

  return (await res.json()) as T
}

export default function SettingsPanel(props: { mode?: SettingsPanelMode }) {
  const mode: SettingsPanelMode = props.mode ?? "options"

  const [apiKey, setApiKey] = useState("")

  const [cancelRule, setCancelRule] = useState<CancelRule>("any_inbound")

  const [jobs, setJobs] = useState<Job[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const canCallApi = useMemo(() => norm(apiKey).length > 0, [apiKey])

  useEffect(() => {
    ;(async () => {
      const items = await storageGet({
        apiKey: "",
      })
      setApiKey(items.apiKey || "")
    })()
  }, [])

  const saveBackend = async () => {
    setError(null)
    setNotice(null)
    await storageSet({ apiKey: norm(apiKey) })
    setNotice("Saved.")
  }

  const connectGmail = async () => {
    setError(null)
    setNotice(null)
    const url = `${DEFAULT_BACKEND_URL.replace(/\/+$/, "")}/auth/google/start`
    chrome.tabs.create({ url })
    setNotice("Opened Google sign-in in a new tab. After finishing, paste the API key here.")
  }

  const refresh = async () => {
    if (!canCallApi) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const [settings, jobList] = await Promise.all([
        apiFetch<BackendSettings>(DEFAULT_BACKEND_URL, apiKey, "/settings"),
        apiFetch<{ jobs: Job[] }>(DEFAULT_BACKEND_URL, apiKey, "/jobs"),
      ])
      setCancelRule(settings.cancelRule)
      setJobs(jobList.jobs)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const updateCancelRule = async (next: CancelRule) => {
    setCancelRule(next)
    if (!canCallApi) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await apiFetch<BackendSettings>(DEFAULT_BACKEND_URL, apiKey, "/settings", {
        method: "PUT",
        body: JSON.stringify({ cancelRule: next }),
      })
      setNotice("Cancel rule updated.")
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const cancelJob = async (id: string) => {
    if (!canCallApi) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await apiFetch(DEFAULT_BACKEND_URL, apiKey, `/jobs/${encodeURIComponent(id)}/cancel`, { method: "POST" })
      await refresh()
      setNotice("Cancelled.")
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!canCallApi) return
    // Initial load once we have credentials.
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canCallApi])

  const outerStyle: React.CSSProperties =
    mode === "popup"
      ? {
          fontFamily: "system-ui, Segoe UI, Roboto, Arial, sans-serif",
          padding: 12,
          width: 420,
          maxWidth: 420,
          maxHeight: 600,
          overflowY: "auto",
        }
      : { fontFamily: "system-ui, Segoe UI, Roboto, Arial, sans-serif", padding: 16, maxWidth: 820 }

  return (
    <div style={outerStyle}>
      <h2 style={{ margin: "0 0 12px 0" }}>Send& Settings</h2>

      <div style={{ display: "grid", gap: 10, border: "1px solid rgba(0,0,0,.12)", borderRadius: 12, padding: 12 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <label style={{ fontWeight: 700 }}>API key</label>
          <input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="Paste from the OAuth completion page"
            style={{ padding: 8, borderRadius: 8, border: "1px solid rgba(0,0,0,.2)" }}
          />
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={saveBackend} style={{ padding: "8px 12px", borderRadius: 8 }}>
            Save
          </button>
          <button onClick={connectGmail} style={{ padding: "8px 12px", borderRadius: 8 }}>
            Connect Gmail
          </button>
          <button disabled={!canCallApi || busy} onClick={refresh} style={{ padding: "8px 12px", borderRadius: 8 }}>
            Refresh
          </button>
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <label style={{ fontWeight: 700 }}>Cancel follow-up when</label>
          <select
            value={cancelRule}
            onChange={(e) => updateCancelRule(e.target.value as CancelRule)}
            disabled={!canCallApi || busy}
            style={{ padding: 8, borderRadius: 8, border: "1px solid rgba(0,0,0,.2)", width: "min(420px, 100%)" }}>
            <option value="any_inbound">Any inbound reply arrives in the thread</option>
            <option value="recipient_only">Only the original recipient replies</option>
          </select>
        </div>

        {error ? (
          <div style={{ background: "rgba(255,0,0,.06)", border: "1px solid rgba(255,0,0,.22)", padding: 10, borderRadius: 10 }}>
            <div style={{ fontWeight: 800, marginBottom: 4 }}>Error</div>
            <div style={{ whiteSpace: "pre-wrap" }}>{error}</div>
          </div>
        ) : null}
        {notice ? (
          <div style={{ background: "rgba(0,128,0,.06)", border: "1px solid rgba(0,128,0,.22)", padding: 10, borderRadius: 10 }}>
            {notice}
          </div>
        ) : null}
      </div>

      <h3 style={{ margin: "16px 0 10px 0" }}>Scheduled</h3>
      <div style={{ border: "1px solid rgba(0,0,0,.12)", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ background: "rgba(0,0,0,.04)" }}>
            <tr>
              <th style={{ textAlign: "left", padding: 10 }}>Type</th>
              <th style={{ textAlign: "left", padding: 10 }}>When</th>
              <th style={{ textAlign: "left", padding: 10 }}>Status</th>
              <th style={{ textAlign: "left", padding: 10 }}>To</th>
              <th style={{ textAlign: "left", padding: 10 }}>Subject</th>
              <th style={{ textAlign: "right", padding: 10 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 12, color: "rgba(0,0,0,.65)" }}>
                  {canCallApi ? "No jobs." : "Enter API key, then Refresh."}
                </td>
              </tr>
            ) : (
              jobs.map((j) => (
                <tr key={j.id} style={{ borderTop: "1px solid rgba(0,0,0,.08)" }}>
                  <td style={{ padding: 10 }}>{j.type}</td>
                  <td style={{ padding: 10 }}>{new Date(j.scheduledAt).toLocaleString()}</td>
                  <td style={{ padding: 10 }}>
                    {j.status}
                    {j.lastError ? <div style={{ color: "rgba(0,0,0,.65)" }}>{j.lastError}</div> : null}
                  </td>
                  <td style={{ padding: 10 }}>{(j.to ?? []).join(", ")}</td>
                  <td style={{ padding: 10 }}>{j.subject ?? ""}</td>
                  <td style={{ padding: 10, textAlign: "right" }}>
                    <button
                      disabled={!canCallApi || busy || j.status === "sent" || j.status === "cancelled"}
                      onClick={() => cancelJob(j.id)}
                      style={{ padding: "6px 10px", borderRadius: 8 }}>
                      Cancel
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

