export {}

// Hard gate: this script must only run on Gmail.
// (Even if content script matching is misconfigured, we do nothing elsewhere.)
if (location.hostname !== "mail.google.com") {
  // No badge, no observers, no UI on non-Gmail pages.
  // eslint-disable-next-line no-console
  console.debug("[Send&] inactive (not Gmail)", { host: location.hostname })
} else {
const existing = document.getElementById("sendand-badge")
if (!existing) {
  const badge = document.createElement("div")
  badge.id = "sendand-badge"
  badge.textContent = "Send& running"
  badge.style.position = "fixed"
  badge.style.bottom = "12px"
  badge.style.right = "12px"
  badge.style.zIndex = "999999"
  badge.style.padding = "6px 10px"
  badge.style.background = "black"
  badge.style.color = "white"
  badge.style.fontSize = "12px"
  badge.style.borderRadius = "8px"
  badge.style.opacity = "0.85"
  document.body.appendChild(badge)
}

// Also used as a global "we are alive" marker.
document.documentElement?.setAttribute("data-sendand", "1")

const LOG_PREFIX = "Send&"
const log = (event: string, details?: unknown) => {
  if (details !== undefined) console.log(`[${LOG_PREFIX}] ${event}`, details)
  else console.log(`[${LOG_PREFIX}] ${event}`)
}

type ExtensionSettings = {
  backendUrl: string
  apiKey: string
}

function getExtensionSettings(): Promise<ExtensionSettings> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      {
        backendUrl: "https://sendandbackend.onrender.com",
        apiKey: "",
      },
      (items) => resolve(items as ExtensionSettings)
    )
  })
}

async function apiPost(path: string, apiKey: string, backendUrl: string, body: unknown): Promise<any> {
  const base = backendUrl.replace(/\/+$/, "")
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`HTTP ${res.status} ${res.statusText}${text ? ` - ${text}` : ""}`)
  }
  return await res.json()
}

const getLogoUrl = () => {
  // Use optimized logo as data URL to bypass CSP restrictions
  // This is a 200px wide optimized version of sendand-logo.png
  return "data:image/png;base64,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"
}

// -----------------------------
// MVP Compose + Send button wiring
// -----------------------------

const DATA_COMPOSE = "data-sendand-compose"
const DATA_INJECTED = "data-sendand-injected"
const DATA_SENTINEL = "data-sendand-sentinel"

type ComposeContext = {
  composeRoot: HTMLElement
  nativeSendButton: HTMLElement
  sendAndButton: HTMLButtonElement
}

const composeByRoot = new WeakMap<HTMLElement, ComposeContext>()

function isElement(node: unknown): node is Element {
  return !!node && typeof node === "object" && (node as Element).nodeType === 1
}

function isVisible(el: HTMLElement): boolean {
  const style = window.getComputedStyle(el)
  if (style.display === "none" || style.visibility === "hidden") return false
  const rect = el.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

function norm(s: string | null | undefined): string {
  return (s ?? "").trim()
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi

function extractEmailsFromString(s: string): string[] {
  const matches = s.match(EMAIL_RE) ?? []
  return matches.map((m) => m.trim()).filter(Boolean)
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

function extractComposeRecipients(composeRoot: HTMLElement): string[] {
  const emails: string[] = []

  // 1) Gmail recipient chips often contain email-like attributes.
  // - data-hovercard-id is commonly the email address.
  // - some variants expose an `email` attribute.
  const chipCandidates = composeRoot.querySelectorAll<HTMLElement>("[data-hovercard-id],[email]")
  chipCandidates.forEach((el) => {
    const hover = norm(el.getAttribute("data-hovercard-id"))
    const direct = norm(el.getAttribute("email"))
    const src = `${hover} ${direct} ${norm(el.textContent)}`
    emails.push(...extractEmailsFromString(src))
  })

  // 2) To: input fields (varies by Gmail variants/localization).
  const toInputs = composeRoot.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    [
      'textarea[name="to"]',
      'input[name="to"]',
      'textarea[aria-label*="To"]',
      'input[aria-label*="To"]',
      'textarea[aria-label*="Recipients"]',
      'input[aria-label*="Recipients"]',
    ].join(",")
  )
  toInputs.forEach((el) => {
    const value = "value" in el ? (el.value ?? "") : ""
    if (value) emails.push(...extractEmailsFromString(value))
  })

  // 3) Fallback: sometimes the recipient row is contenteditable. Look for small header-ish
  // regions that include “To” and contain emails, but avoid scanning the whole compose body.
  const headerish = composeRoot.querySelectorAll<HTMLElement>(
    '[aria-label*="To"],[title*="To"],[data-tooltip*="To"]'
  )
  headerish.forEach((el) => {
    const text = norm(el.textContent)
    if (text) emails.push(...extractEmailsFromString(text))
  })

  return uniqLower(emails)
}

function extractComposeSubject(composeRoot: HTMLElement): string {
  const candidates: Array<HTMLInputElement | HTMLTextAreaElement> = []

  const byName = composeRoot.querySelector<HTMLInputElement>('input[name="subjectbox"]')
  if (byName) candidates.push(byName)

  // Backup variants
  composeRoot
    .querySelectorAll<HTMLInputElement>('input[aria-label="Subject"],input[aria-label*="Subject"],input[placeholder*="Subject"]')
    .forEach((el) => candidates.push(el))

  for (const el of candidates) {
    const value = norm(el.value)
    if (value) return value
  }

  return ""
}

function looksLikeSendButton(el: HTMLElement): boolean {
  // Prefer aria-label and tooltip-like attributes. Fall back to text.
  const aria = norm(el.getAttribute("aria-label")).toLowerCase()
  const tooltip =
    norm(el.getAttribute("data-tooltip")).toLowerCase() ||
    norm(el.getAttribute("data-tooltip-delay")).toLowerCase()
  const title = norm(el.getAttribute("title")).toLowerCase()
  const text = norm(el.textContent).toLowerCase()

  // Be defensive: Gmail sometimes has "Send" plus shortcut text (e.g., Ctrl+Enter)
  const haystack = `${aria} ${tooltip} ${title}`.trim()
  const sendRe = /\bsend\b/i

  if (sendRe.test(haystack)) return true

  // Text fallback (more brittle but needed in some cases)
  // Only consider short-ish labels to avoid matching quoted content.
  if (text.length > 0 && text.length <= 30 && sendRe.test(text)) return true

  return false
}

function findNativeSendButtonWithin(scope: Element): HTMLElement | null {
  // Stage 1: aria/tooltip/title matches on button-like elements
  const buttonLikes = scope.querySelectorAll<HTMLElement>(
    'button,[role="button"],div[role="button"]'
  )

  let best: HTMLElement | null = null
  for (const el of buttonLikes) {
    if (!isVisible(el)) continue
    if (!looksLikeSendButton(el)) continue

    // Avoid matching our own injected button.
    if (el.getAttribute(DATA_SENTINEL) === "1") continue

    best = el
    break
  }

  if (best) return best

  // Stage 2: textContent fallback, but only for visible button-likes
  for (const el of buttonLikes) {
    if (!isVisible(el)) continue
    if (el.getAttribute(DATA_SENTINEL) === "1") continue
    const text = norm(el.textContent).toLowerCase()
    if (text === "send" || text.startsWith("send ")) return el
  }

  return null
}

function findComposeRootFromSendButton(sendBtn: HTMLElement): HTMLElement {
  // Prefer Gmail dialogs; fall back to closest stable container.
  const dialog = sendBtn.closest<HTMLElement>('[role="dialog"]')
  if (dialog) return dialog

  // Inline compose sometimes lives under a region-like container.
  const region =
    sendBtn.closest<HTMLElement>('[role="region"]') ||
    sendBtn.closest<HTMLElement>('[role="main"]')
  if (region) return region

  return sendBtn.closest<HTMLElement>("div") ?? (document.body as HTMLElement)
}

function ensureStylesOnce(): void {
  const id = "sendand-styles"
  if (document.getElementById(id)) return

  const style = document.createElement("style")
  style.id = id
  style.textContent = `
    html[data-sendand-popover-open="1"] .sendand-btn[${DATA_SENTINEL}="1"] {
      opacity: 0 !important;
      visibility: hidden !important;
      pointer-events: none !important;
    }

    .sendand-btn {
      height: 36px;
      min-height: 36px;
      padding: 0 12px;
      border-radius: 18px;
      border: 1px solid rgba(60,64,67,.2);
      background: #fff;
      color: #1f1f1f;
      font: 500 14px/36px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
      cursor: pointer;
      user-select: none;
      margin-left: 8px;
      box-sizing: border-box;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .sendand-btn:hover { background: rgba(60,64,67,.06); }
    .sendand-btn:active { background: rgba(60,64,67,.10); }
    .sendand-btn:focus { outline: 2px solid rgba(26,115,232,.35); outline-offset: 2px; }

    .sendand-popover {
      position: fixed;
      z-index: 2147483647;
      width: 340px;
      background: #fff;
      border: 1px solid rgba(60,64,67,.2);
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,.18);
      padding: 12px;
      box-sizing: border-box;
    }
    .sendand-popover-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 8px;
      overflow: visible;
    }
    .sendand-logo {
      display: block;
      max-height: 40px;
      width: auto;
      height: auto;
      object-fit: contain;
      object-position: top left;
    }
    .sendand-logo-btn {
      height: 18px;
      width: auto;
      display: block;
    }
    .sendand-popover h4 {
      margin: 0 0 10px 0;
      font: 600 13px/16px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
      color: #202124;
    }
    .sendand-close {
      width: 24px;
      height: 24px;
      border: 1px solid rgba(60,64,67,.18);
      border-radius: 6px;
      background: #fff;
      cursor: pointer;
      line-height: 22px;
      text-align: center;
      font: 700 14px/22px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
      color: #3c4043;
    }
    .sendand-close:hover { background: rgba(60,64,67,.06); }

    .sendand-tabs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      border: 1px solid rgba(60,64,67,.2);
      border-radius: 8px;
      overflow: hidden;
      margin: 8px 0 10px 0;
    }
    .sendand-tab {
      height: 30px;
      background: rgba(60,64,67,.06);
      border: 0;
      cursor: pointer;
      font: 600 12px/30px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
      color: #202124;
      padding: 0;
    }
    .sendand-tab[aria-selected="true"] {
      background: #fff;
    }
    .sendand-tab + .sendand-tab {
      border-left: 1px solid rgba(60,64,67,.2);
    }

    .sendand-row { display: flex; gap: 8px; align-items: center; margin: 8px 0; }
    .sendand-row label { font: 500 12px/14px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color: #3c4043; }
    .sendand-input, .sendand-textarea {
      width: 100%;
      border: 1px solid rgba(60,64,67,.2);
      border-radius: 8px;
      padding: 8px;
      font: 400 13px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
      box-sizing: border-box;
    }
    .sendand-textarea { min-height: 72px; resize: vertical; }

    .sendand-editor {
      width: 100%;
      min-height: 110px;
      border: 1px solid rgba(60,64,67,.2);
      border-radius: 8px;
      padding: 8px;
      font: 400 13px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
      box-sizing: border-box;
      background: #fff;
      overflow: auto;
    }
    /* Inline (tab) editor should never stretch popover */
    .sendand-inline-editor {
      min-height: 110px;
      max-height: 170px;
      overflow: auto;
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    /* Prevent big font sizes from overlapping due to fixed line-height. */
    .sendand-editor, .sendand-editor * { line-height: normal; }
    .sendand-editor { line-height: 1.4; }
    .sendand-editor:focus { outline: 2px solid rgba(26,115,232,.18); outline-offset: 1px; }
    .sendand-editor[data-placeholder]:empty:before {
      content: attr(data-placeholder);
      color: rgba(95,99,104,.75);
    }

    .sendand-expand {
      position: absolute;
      right: 8px;
      bottom: 8px;
      width: 28px;
      height: 28px;
      border-radius: 8px;
      border: 1px solid rgba(60,64,67,.18);
      background: #fff;
      cursor: pointer;
      display: grid;
      place-items: center;
      padding: 0;
      opacity: 0.9;
    }
    .sendand-expand:hover { background: rgba(60,64,67,.06); opacity: 1; }
    .sendand-expand svg { width: 16px; height: 16px; fill: #5f6368; }

    .sendand-modal-overlay {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      background: rgba(32,33,36,.45);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      box-sizing: border-box;
    }
    .sendand-modal {
      width: min(720px, 92vw);
      height: min(520px, 82vh);
      background: #fff;
      border: 1px solid rgba(60,64,67,.2);
      border-radius: 12px;
      box-shadow: 0 12px 32px rgba(0,0,0,.28);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .sendand-modal-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px;
      border-bottom: 1px solid rgba(60,64,67,.12);
    }
    .sendand-toolbar {
      display: flex;
      gap: 6px;
      padding: 8px 12px;
      border-bottom: 1px solid rgba(60,64,67,.12);
      background: #fff;
      flex-wrap: wrap;
    }
    .sendand-select {
      height: 30px;
      border-radius: 8px;
      border: 1px solid rgba(60,64,67,.18);
      background: #fff;
      cursor: pointer;
      font: 600 12px/28px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
      color: #3c4043;
      padding: 0 8px;
    }
    .sendand-toolbtn {
      height: 30px;
      min-width: 30px;
      padding: 0 10px;
      border-radius: 8px;
      border: 1px solid rgba(60,64,67,.18);
      background: #fff;
      cursor: pointer;
      font: 700 12px/28px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
      color: #3c4043;
    }
    .sendand-toolbtn:hover { background: rgba(60,64,67,.06); }
    .sendand-modal-editor {
      flex: 1;
      padding: 12px;
      overflow: auto;
    }
    .sendand-modal-editor .sendand-editor {
      min-height: 100%;
      height: 100%;
    }
    .sendand-modal-actions {
      display: flex;
      gap: 8px;
      padding: 10px 12px;
      border-top: 1px solid rgba(60,64,67,.12);
      justify-content: flex-end;
    }
    .sendand-modal-actions button {
      height: 32px;
      border-radius: 16px;
      border: 1px solid rgba(60,64,67,.2);
      background: #fff;
      cursor: pointer;
      font: 600 13px/32px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
      padding: 0 12px;
      color: #1f1f1f;
    }
    .sendand-modal-actions .sendand-save {
      background: rgba(26,115,232,.10);
      border-color: rgba(26,115,232,.35);
      color: #174ea6;
    }

    .sendand-quicklinks {
      display: flex;
      gap: 10px;
      margin: 6px 0 8px 0;
      padding-left: 52px; /* visually aligns under the date input like mock */
      flex-wrap: wrap;
    }
    .sendand-quicklinks button {
      border: 0;
      background: transparent;
      cursor: pointer;
      padding: 0;
      color: #1a73e8;
      font: 600 12px/14px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
    }
    .sendand-quicklinks button:hover { text-decoration: underline; }

    /* Align action button with the message editor column (label + gap) */
    .sendand-actions { display: flex; gap: 8px; margin-top: 10px; padding-left: 80px; }
    .sendand-actions > .sendand-primary { width: 100%; }
    .sendand-primary, .sendand-secondary {
      flex: 1;
      height: 32px;
      border-radius: 16px;
      border: 1px solid rgba(60,64,67,.2);
      background: #fff;
      cursor: pointer;
      font: 600 13px/32px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
      padding: 0 10px;
      color: #1f1f1f;
    }
    .sendand-primary {
      background: rgba(26,115,232,.10);
      border-color: rgba(26,115,232,.35);
      color: #174ea6;
    }
    .sendand-primary:hover { background: rgba(26,115,232,.14); }
    .sendand-secondary:hover { background: rgba(60,64,67,.06); }

    .sendand-toast {
      position: fixed;
      z-index: 2147483647;
      left: 50%;
      bottom: 24px;
      transform: translateX(-50%);
      background: #202124;
      color: #fff;
      padding: 10px 12px;
      border-radius: 10px;
      font: 500 13px/16px system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
      box-shadow: 0 6px 18px rgba(0,0,0,.25);
      opacity: 0.95;
    }
  `.trim()
  document.head.appendChild(style)
}

function showToast(message: string, ms = 2400): void {
  const id = "sendand-toast"
  document.getElementById(id)?.remove()

  const toast = document.createElement("div")
  toast.id = id
  toast.className = "sendand-toast"
  toast.textContent = message
  document.body.appendChild(toast)

  window.setTimeout(() => toast.remove(), ms)
}

function positionPopover(popover: HTMLElement, anchor: HTMLElement): void {
  const a = anchor.getBoundingClientRect()
  positionPopoverFromRect(popover, a)
}

function positionPopoverFromRect(popover: HTMLElement, a: DOMRect): void {
  const margin = 8
  const width = 340
  const height = popover.getBoundingClientRect().height || 260

  let left = Math.min(window.innerWidth - width - margin, Math.max(margin, a.left))
  let top = a.bottom + margin

  // If we would go off-screen, place above.
  if (top + height + margin > window.innerHeight) {
    top = Math.max(margin, a.top - height - margin)
  }

  popover.style.left = `${left}px`
  popover.style.top = `${top}px`
}

function closePopover(popover: HTMLElement | null): void {
  if (!popover) return
  try {
    ;(popover as any)._sendandRestoreAnchor?.()
  } catch {
    // ignore
  }
  document.documentElement?.removeAttribute("data-sendand-popover-open")
  popover.remove()
  window.removeEventListener("resize", (popover as any)._sendandOnResize)
  document.removeEventListener("mousedown", (popover as any)._sendandOnDocDown, true)
  document.removeEventListener("keydown", (popover as any)._sendandOnKeyDown, true)
}

function openPopover(ctx: ComposeContext): void {
  ensureStylesOnce()

  // Close any existing popover first (single at a time is fine for MVP).
  closePopover(document.getElementById("sendand-popover") as HTMLElement | null)

  document.documentElement?.setAttribute("data-sendand-popover-open", "1")

  // Capture anchor rect BEFORE any hiding (otherwise it measures at 0,0 and the popover jumps).
  const anchorRect = ctx.sendAndButton.getBoundingClientRect()

  // Hide injected Send& buttons while popover is open so none appear as an "extra"
  // action near/behind the popover due to Gmail's layout.
  // Use opacity (not display) so layout/rects remain stable.
  const hiddenButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>(`.sendand-btn[${DATA_SENTINEL}="1"]`)
  )
  const restoreStates = hiddenButtons.map((b) => ({
    el: b,
    opacity: b.style.opacity,
    visibility: b.style.visibility,
    pointerEvents: b.style.pointerEvents,
  }))
  for (const b of hiddenButtons) {
    b.style.opacity = "0"
    b.style.visibility = "hidden"
    b.style.pointerEvents = "none"
  }

  const pop = document.createElement("div")
  pop.id = "sendand-popover"
  pop.className = "sendand-popover"
  pop.setAttribute(DATA_SENTINEL, "1")
  pop.setAttribute("role", "dialog")
  pop.setAttribute("aria-label", "Send& options")
  ;(pop as any)._sendandRestoreAnchor = () => {
    for (const s of restoreStates) {
      s.el.style.opacity = s.opacity
      s.el.style.visibility = s.visibility
      s.el.style.pointerEvents = s.pointerEvents
    }
  }
  pop.innerHTML = `
    <div class="sendand-popover-header">
      <div style="flex: 1; width: 0; overflow: visible; min-width: 0;">
        <h4 style="margin:0;">Send&</h4>
      </div>
      <button class="sendand-close" id="sendand-close" aria-label="Close" style="flex-shrink: 0;">×</button>
    </div>

    <div class="sendand-tabs" role="tablist" aria-label="Send& actions">
      <button class="sendand-tab" id="sendand-tab-followup" role="tab" aria-selected="true">Follow Up</button>
      <button class="sendand-tab" id="sendand-tab-remind" role="tab" aria-selected="false">Remind Me</button>
    </div>

    <div class="sendand-row" style="margin-top: 0;">
      <label style="min-width: 44px;">Date</label>
      <input class="sendand-input" id="sendand-date" type="datetime-local" />
    </div>
    <div class="sendand-quicklinks" aria-label="Quick date picks">
      <button type="button" id="sendand-quick-1m">In 1 minute</button>
      <button type="button" id="sendand-quick-tomorrow">Tomorrow</button>
      <button type="button" id="sendand-quick-3">In 3 days</button>
      <button type="button" id="sendand-quick-7">In 7 days</button>
    </div>

    <div class="sendand-row" style="align-items: flex-start; margin-top: 6px;">
      <label id="sendand-msg-label" style="min-width: 72px; padding-top: 8px;">Message</label>
      <div style="width:100%; position:relative;">
        <div class="sendand-editor sendand-inline-editor" id="sendand-message" contenteditable="true" data-placeholder="Type your follow up message here"></div>
        <button type="button" class="sendand-expand" id="sendand-expand" aria-label="Expand editor">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7z"></path>
            <path d="M14 3v2h3.59L10 12.59 11.41 14 19 6.41V10h2V3h-7z"></path>
          </svg>
        </button>
      </div>
    </div>

    <div class="sendand-actions">
      <button class="sendand-primary" id="sendand-do-primary">Send & Follow Up</button>
    </div>
  `.trim()

  document.body.appendChild(pop)
  positionPopoverFromRect(pop, anchorRect)

  const onResize = () => positionPopover(pop, ctx.sendAndButton)
  ;(pop as any)._sendandOnResize = onResize
  window.addEventListener("resize", onResize)

  const onDocDown = (ev: MouseEvent) => {
    const t = ev.target as Node | null
    if (!t) return
    // If the rich editor modal is open, don't treat clicks inside it as outside-clicks.
    if (isElement(t) && (t as Element).closest(".sendand-modal-overlay")) return
    if (pop.contains(t)) return
    if (ctx.sendAndButton.contains(t as Node)) return
    closePopover(pop)
  }
  ;(pop as any)._sendandOnDocDown = onDocDown
  document.addEventListener("mousedown", onDocDown, true)

  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.key === "Escape") closePopover(pop)
  }
  ;(pop as any)._sendandOnKeyDown = onKeyDown
  document.addEventListener("keydown", onKeyDown, true)

  const clickSend = () => {
    // Trigger native send without reading/storing any content.
    try {
      ctx.nativeSendButton.click()
      return true
    } catch {
      return false
    }
  }

  // Tabbed UI state (preserve values per tab for nicer UX).
  type Tab = "followup" | "remind"
  let activeTab: Tab = "followup"
  let followupDate = ""
  let remindDate = ""
  let followupHtml = ""
  let remindHtml = ""

  const $tabFollow = pop.querySelector<HTMLButtonElement>("#sendand-tab-followup")!
  const $tabRemind = pop.querySelector<HTMLButtonElement>("#sendand-tab-remind")!
  const $date = pop.querySelector<HTMLInputElement>("#sendand-date")!
  const $msg = pop.querySelector<HTMLElement>("#sendand-message")!
  const $msgLabel = pop.querySelector<HTMLElement>("#sendand-msg-label")!
  const $primary = pop.querySelector<HTMLButtonElement>("#sendand-do-primary")!
  const $expand = pop.querySelector<HTMLButtonElement>("#sendand-expand")!

  const extractText = (html: string) => {
    const tmp = document.createElement("div")
    tmp.innerHTML = html
    return norm(tmp.textContent)
  }

  const isMeaningful = (html: string) => extractText(html).length > 0

  const saveCurrent = () => {
    if (activeTab === "followup") {
      followupDate = $date.value
      followupHtml = $msg.innerHTML
    } else {
      remindDate = $date.value
      remindHtml = $msg.innerHTML
    }
  }

  const render = () => {
    $tabFollow.setAttribute("aria-selected", activeTab === "followup" ? "true" : "false")
    $tabRemind.setAttribute("aria-selected", activeTab === "remind" ? "true" : "false")

    if (activeTab === "followup") {
      $date.value = followupDate
      $msgLabel.textContent = "Message"
      $msg.setAttribute("data-placeholder", "Type your follow up message here")
      $msg.innerHTML = followupHtml
      $primary.textContent = "Send & Follow Up"
    } else {
      $date.value = remindDate
      $msgLabel.textContent = "Reminder"
      $msg.setAttribute("data-placeholder", "Note to self (optional)")
      $msg.innerHTML = remindHtml
      $primary.textContent = "Send & Remind Me"
    }

    // Re-position in case height changed.
    positionPopover(pop, ctx.sendAndButton)
  }

  const setTab = (tab: Tab) => {
    if (tab === activeTab) return
    saveCurrent()
    activeTab = tab
    render()
  }

  const formatForDatetimeLocal = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
      d.getMinutes()
    )}`
  }

  const parseTimeFromDatetimeLocal = (value: string): { h: number; m: number } | null => {
    // datetime-local value should be "YYYY-MM-DDTHH:MM" (seconds optional).
    const v = norm(value)
    const parts = v.split("T")
    if (parts.length !== 2) return null
    const time = parts[1]
    const hm = time.split(":")
    if (hm.length < 2) return null
    const h = Number(hm[0])
    const m = Number(hm[1])
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null
    if (h < 0 || h > 23 || m < 0 || m > 59) return null
    return { h, m }
  }

  const setRelativeDaysFromToday = (days: number) => {
    // Always compute from TODAY (local), not cumulative and not via Date string parsing.
    const clickedNow = new Date()
    const base = new Date(clickedNow.getFullYear(), clickedNow.getMonth(), clickedNow.getDate(), 0, 0, 0, 0)
    base.setDate(base.getDate() + days)

    // Include time: prefer existing selected time; otherwise keep current local time.
    const t =
      parseTimeFromDatetimeLocal($date.value) ?? { h: clickedNow.getHours(), m: clickedNow.getMinutes() }
    base.setHours(t.h, t.m, 0, 0)

    $date.value = formatForDatetimeLocal(base)
    saveCurrent()
  }

  const setRelativeMinutesFromNow = (minutes: number) => {
    const now = new Date()
    const d = new Date(now.getTime() + minutes * 60_000)
    d.setSeconds(0, 0)
    $date.value = formatForDatetimeLocal(d)
    saveCurrent()
  }

  pop.querySelector<HTMLButtonElement>("#sendand-close")?.addEventListener("click", () => closePopover(pop))

  $tabFollow.addEventListener("click", () => setTab("followup"))
  $tabRemind.addEventListener("click", () => setTab("remind"))

  pop.querySelector<HTMLButtonElement>("#sendand-quick-1m")?.addEventListener("click", () => setRelativeMinutesFromNow(1))
  pop
    .querySelector<HTMLButtonElement>("#sendand-quick-tomorrow")
    ?.addEventListener("click", () => setRelativeDaysFromToday(1))
  pop.querySelector<HTMLButtonElement>("#sendand-quick-3")?.addEventListener("click", () => setRelativeDaysFromToday(3))
  pop.querySelector<HTMLButtonElement>("#sendand-quick-7")?.addEventListener("click", () => setRelativeDaysFromToday(7))

  $date.addEventListener("change", saveCurrent)
  $msg.addEventListener("input", saveCurrent)

  const openRichEditor = () => {
    saveCurrent()

    const overlay = document.createElement("div")
    overlay.className = "sendand-modal-overlay"
    overlay.setAttribute(DATA_SENTINEL, "1")
    overlay.setAttribute("role", "dialog")
    overlay.setAttribute("aria-label", "Send& rich editor")

    const title = activeTab === "followup" ? "Follow Up message" : "Reminder note"
    const currentHtml = activeTab === "followup" ? followupHtml : remindHtml

    overlay.innerHTML = `
      <div class="sendand-modal">
        <div class="sendand-modal-top">
          <div style="font: 700 13px/16px system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color:#202124;">${title}</div>
          <button class="sendand-close" id="sendand-modal-close" aria-label="Close">×</button>
        </div>
        <div class="sendand-toolbar" aria-label="Formatting toolbar">
          <select class="sendand-select" id="sendand-font-family" aria-label="Font">
            <option value="Arial, sans-serif">Sans Serif</option>
            <option value="Georgia, serif">Serif</option>
            <option value="&quot;Courier New&quot;, monospace">Monospace</option>
          </select>
          <select class="sendand-select" id="sendand-font-size" aria-label="Font size (pt)">
            ${Array.from({ length: 33 }, (_, i) => 8 + i * 2)
              .map((pt) => `<option value="${pt}">${pt}</option>`)
              .join("")}
          </select>
          <button type="button" class="sendand-toolbtn" data-cmd="bold"><b>B</b></button>
          <button type="button" class="sendand-toolbtn" data-cmd="italic"><i>I</i></button>
          <button type="button" class="sendand-toolbtn" data-cmd="underline"><u>U</u></button>
          <button type="button" class="sendand-toolbtn" data-cmd="insertUnorderedList">• List</button>
          <button type="button" class="sendand-toolbtn" data-cmd="createLink">Link</button>
          <button type="button" class="sendand-toolbtn" data-cmd="removeFormat">Clear</button>
        </div>
        <div class="sendand-modal-editor">
          <div class="sendand-editor" id="sendand-modal-editor" contenteditable="true" data-placeholder="Type here..."></div>
        </div>
        <div class="sendand-modal-actions">
          <button type="button" id="sendand-modal-cancel">Cancel</button>
          <button type="button" class="sendand-save" id="sendand-modal-save">Save</button>
        </div>
      </div>
    `.trim()

    document.body.appendChild(overlay)

    const modal = overlay.querySelector<HTMLElement>(".sendand-modal")!
    const editor = overlay.querySelector<HTMLElement>("#sendand-modal-editor")!
    editor.innerHTML = currentHtml
    editor.focus()
    document.execCommand("styleWithCSS", false, "true")

    const closeModal = () => overlay.remove()

    overlay.querySelector<HTMLButtonElement>("#sendand-modal-close")?.addEventListener("click", closeModal)
    overlay.querySelector<HTMLButtonElement>("#sendand-modal-cancel")?.addEventListener("click", closeModal)

    overlay.addEventListener("mousedown", (e) => {
      if (e.target === overlay) closeModal()
    })

    overlay.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal()
    })

    overlay.querySelectorAll<HTMLButtonElement>(".sendand-toolbtn").forEach((b) => {
      b.addEventListener("click", () => {
        const cmd = b.getAttribute("data-cmd")
        if (!cmd) return
        editor.focus()

        // execCommand is deprecated but still widely supported and fine for MVP.
        if (cmd === "createLink") {
          const url = window.prompt("Enter link URL")
          if (!url) return
          document.execCommand("createLink", false, url)
          return
        }

        document.execCommand(cmd, false)
      })
    })

    const normalizeFontTagsToPt = (pt: number) => {
      // execCommand('fontSize') creates <font size="..."> in many browsers; normalize to inline style.
      const fonts = editor.querySelectorAll<HTMLFontElement>("font[size]")
      fonts.forEach((f) => {
        const span = document.createElement("span")
        span.style.fontSize = `${pt}pt`
        span.innerHTML = f.innerHTML
        f.replaceWith(span)
      })
    }

    const $fontFamily = overlay.querySelector<HTMLSelectElement>("#sendand-font-family")!
    const $fontSize = overlay.querySelector<HTMLSelectElement>("#sendand-font-size")!

    // Set reasonable defaults matching Gmail-ish look.
    $fontFamily.value = "Arial, sans-serif"
    $fontSize.value = "12"

    $fontFamily.addEventListener("change", () => {
      editor.focus()
      document.execCommand("fontName", false, $fontFamily.value)
    })

    $fontSize.addEventListener("change", () => {
      const pt = Number($fontSize.value)
      if (!Number.isFinite(pt)) return
      editor.focus()
      // Use fontSize then normalize; this keeps selection behavior simple for MVP.
      document.execCommand("fontSize", false, "7")
      normalizeFontTagsToPt(pt)
    })

    overlay.querySelector<HTMLButtonElement>("#sendand-modal-save")?.addEventListener("click", () => {
      const html = editor.innerHTML
      if (activeTab === "followup") followupHtml = html
      else remindHtml = html

      // Re-render the inline editor without closing the popover/tabs.
      render()
      saveCurrent()
      closeModal()
    })

    // prevent the modal from triggering popover outside-click close
    modal.addEventListener("mousedown", (e) => e.stopPropagation())
  }

  $expand.addEventListener("click", openRichEditor)

  $primary.addEventListener("click", () => {
    // Keep this handler synchronous-ish (it triggers Gmail send), but schedule work async.
    saveCurrent()

    const to = extractComposeRecipients(ctx.composeRoot)
    const subject = extractComposeSubject(ctx.composeRoot)
    log("compose extracted", { to, subject })

    const sent = clickSend()
    if (!sent) {
      showToast("Could not trigger Send.")
      closePopover(pop)
      return
    }

    const sentAtIso = new Date().toISOString()

    const schedule = async () => {
      const settings = await getExtensionSettings()
      const backendUrl = norm(settings.backendUrl)
      const apiKey = norm(settings.apiKey)
      if (!backendUrl || !apiKey) {
        showToast("Sent. Configure backend URL + API key in Send& Settings.")
        return
      }

      const whenValue = activeTab === "followup" ? followupDate : remindDate
      if (!whenValue) {
        showToast("Sent. Pick a date/time for scheduling.")
        return
      }

      // datetime-local is local time; Date(...) treats it as local and converts to ISO.
      const scheduledAtIso = new Date(whenValue).toISOString()

      if (activeTab === "followup") {
        log("action chosen: send+followup", { when: followupDate, hasMessage: isMeaningful(followupHtml) })
        await apiPost("/jobs/followup", apiKey, backendUrl, {
          scheduledAt: scheduledAtIso,
          sentAt: sentAtIso,
          to,
          subject,
          followUpHtml: followupHtml,
        })
        showToast("Sent. Follow-up scheduled.")
      } else {
        log("action chosen: send+remind", { when: remindDate, hasMessage: isMeaningful(remindHtml) })
        await apiPost("/jobs/reminder", apiKey, backendUrl, {
          scheduledAt: scheduledAtIso,
          sentAt: sentAtIso,
          to,
          subject,
          noteHtml: remindHtml,
        })
        showToast("Sent. Reminder scheduled.")
      }
    }

    schedule().catch((e) => {
      // eslint-disable-next-line no-console
      console.error("[Send&] schedule failed", e)
      showToast("Sent. Scheduling failed (check Settings/API key).")
    })

    closePopover(pop)
  })

  render()
}

function injectSendAndButton(composeRoot: HTMLElement, nativeSendButton: HTMLElement): void {
  ensureStylesOnce()

  // Idempotency: if already injected for this compose, bail.
  if (composeRoot.getAttribute(DATA_INJECTED) === "1") return

  // Anchor near the native send button, and mark the area to avoid duplicates.
  const anchorParent = nativeSendButton.parentElement
  if (!anchorParent) return

  // If Gmail rerenders and keeps our composeRoot but replaces buttons, we still avoid duplicates
  // by checking for an existing injected button next to the send button area.
  if (anchorParent.querySelector(`[${DATA_SENTINEL}="1"]`)) {
    composeRoot.setAttribute(DATA_INJECTED, "1")
    return
  }

  const btn = document.createElement("button")
  btn.type = "button"
  btn.className = "sendand-btn"
  btn.setAttribute(DATA_SENTINEL, "1")
  btn.setAttribute("aria-label", "Send& options")
  btn.textContent = "Send&"

  btn.addEventListener("click", (ev) => {
    ev.preventDefault()
    ev.stopPropagation()
    log("send& clicked")

    const ctx: ComposeContext = {
      composeRoot,
      nativeSendButton,
      sendAndButton: btn,
    }
    openPopover(ctx)
  })

  // Insert right next to the Send button.
  if (nativeSendButton.nextSibling) anchorParent.insertBefore(btn, nativeSendButton.nextSibling)
  else anchorParent.appendChild(btn)

  composeRoot.setAttribute(DATA_INJECTED, "1")
  composeRoot.setAttribute(DATA_COMPOSE, "1")
  composeByRoot.set(composeRoot, { composeRoot, nativeSendButton, sendAndButton: btn })

  log("send& injected", {
    composeRootRole: composeRoot.getAttribute("role"),
  })
}

function processPotentialCompose(scope: Element | Document): void {
  // Primary approach: find send buttons, derive a compose root, then inject.
  const sendCandidates = (scope as Element).querySelectorAll
    ? (scope as Element).querySelectorAll<HTMLElement>('button,[role="button"],div[role="button"]')
    : document.querySelectorAll<HTMLElement>('button,[role="button"],div[role="button"]')

  for (const el of sendCandidates) {
    if (!isVisible(el)) continue
    if (!looksLikeSendButton(el)) continue
    if (el.getAttribute(DATA_SENTINEL) === "1") continue

    const composeRoot = findComposeRootFromSendButton(el)
    if (!composeRoot || composeRoot === document.body) continue

    // If this "compose root" already injected, skip.
    if (composeRoot.getAttribute(DATA_INJECTED) === "1") continue

    // Confirm within that composeRoot we still see a native Send button (scoped query).
    const nativeSend = findNativeSendButtonWithin(composeRoot)
    if (!nativeSend) continue

    log("compose detected", {
      role: composeRoot.getAttribute("role"),
    })
    log("send button found")
    injectSendAndButton(composeRoot, nativeSend)
  }
}

function cleanupOrphans(): void {
  // Remove any Send& buttons whose compose root is gone.
  // (We use a conservative approach: just ensure injected buttons still have a close dialog ancestor.)
  const injected = document.querySelectorAll<HTMLElement>(`[${DATA_SENTINEL}="1"].sendand-btn`)
  for (const btn of injected) {
    const root = btn.closest<HTMLElement>(`[${DATA_COMPOSE}="1"]`) ?? btn.closest<HTMLElement>('[role="dialog"]')
    if (!root || !document.contains(root)) btn.remove()
  }

  // Close popover if its anchor disappeared.
  const pop = document.getElementById("sendand-popover")
  if (pop && !document.contains(pop)) pop.remove()
}

function startObserver(): void {
  // Initial scan (Gmail can already have reply boxes open, etc.)
  processPotentialCompose(document)

  const observer = new MutationObserver((mutations) => {
    let shouldRescan = false

    for (const m of mutations) {
      // If nodes are added, process within those subtrees.
      for (const n of Array.from(m.addedNodes)) {
        if (!isElement(n)) continue
        shouldRescan = true
        processPotentialCompose(n)
      }

      // If the subtree changed (e.g., attributes), do a light rescan on the target.
      if (m.type === "attributes" && isElement(m.target)) {
        shouldRescan = true
        processPotentialCompose(m.target as Element)
      }
    }

    if (shouldRescan) cleanupOrphans()
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-label", "data-tooltip", "title", "class", "role"],
  })

  log("ready – observing Gmail for compose")
}

startObserver()
}
