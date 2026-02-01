## Send& backend (Render + Postgres)

This backend is required for:
- Google OAuth (Gmail access)
- Scheduling (follow-ups + reminders)
- Reply tracking/cancel rules

### Required environment variables

Set these in Render (Web Service → Environment):

- **`BASE_URL`**: your public Render URL (e.g. `https://your-service.onrender.com`)
- **`DATABASE_URL`**: Render Postgres connection string (prefer the **Internal** URL when running on Render)
- **`GOOGLE_CLIENT_ID`** / **`GOOGLE_CLIENT_SECRET`**: from Google Cloud OAuth client
- **`ALLOWED_ORIGINS`**: comma-separated list including your extension origin, e.g. `chrome-extension://<id>`

Optional:
- **`PGSSLMODE`**: `require` (default for Render external), `disable` for local Postgres

### Google OAuth redirect URI

In Google Cloud Console → OAuth client → **Authorized redirect URIs**, add:

- `${BASE_URL}/auth/google/callback`

Example:
- `https://your-service.onrender.com/auth/google/callback`

### Running locally

1. Copy `.env.example` → `.env` and fill values
2. Install + start:

```bash
npm install
npm run dev
```

### Render deployment (recommended split)

- **Web Service (API)**:
  - Root directory: `backend`
  - Build: `npm run render-build`
  - Start: `npm run start`
  - Env: set **`RUN_SCHEDULER=false`** (scheduler runs in the worker)

- **Background Worker (Scheduler)**:
  - Root directory: `backend`
  - Build: `npm run render-build`
  - Start: `npm run start:worker`
  - Env: leave `RUN_SCHEDULER` unset or set to `true`

### Notes
- This backend runs `ensureSchema()` on startup to create the required tables if missing.
- If you rotate your Postgres credentials, update `DATABASE_URL` in Render.

