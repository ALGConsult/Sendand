## Send&

Send& is a Chrome extension that adds a “Send&” button inside Gmail to help you:
- **Send & Follow Up**: schedule a follow-up email for a chosen date/time (cancelled if a reply is detected in the thread).
- **Send & Remind Me**: schedule a reminder email back to yourself at a chosen date/time.

This project includes:
- **Chrome Extension** (Plasmo/React/TypeScript)
- **Backend service** (Node.js/TypeScript) hosted on Render, required for scheduling and Gmail API access

## How it works (high level)

1. You send an email in Gmail and choose **Send & Follow Up** (or **Send & Remind Me**).
2. The extension creates a scheduled job on the backend.
3. The backend scheduler runs in the background:
   - checks if a follow-up is due
   - checks the Gmail thread for replies (to decide whether to cancel)
   - sends the follow-up/reminder via the Gmail API

## Connect Gmail 

1. Click the Send& extension icon
2. You’ll see a **Connected / Disconnected** status.
3. Click **Connect Gmail** and complete Google sign-in.
4. When finished, the extension should show **Connected** automatically.

If the popup is blocked, allow popups and try again.

## Use it in Gmail

1. Open `https://mail.google.com`
2. Compose an email
3. Click the **Send&** button near Gmail’s Send button
4. Pick:
   - **Follow Up** → choose a time (includes an “In 1 minute” quick option for testing)
   - or **Remind Me**
5. Click **Send & Follow Up** (or **Send & Remind Me**)

## View / cancel scheduled jobs

1. Click the Send& extension icon
2. Press **Refresh**
3. You’ll see scheduled jobs and can **Cancel** any pending job

## Privacy & data usage

Send& requires Gmail API access to:
- send scheduled messages
- read thread metadata to detect replies

The backend stores:
- OAuth refresh token (to access Gmail with your permission)
- a connection token used by the extension
- scheduled job data (recipients, subject, message content, timestamps, and Gmail thread/message identifiers)

Privacy policy:
https://github.com/ALGConsult/Sendand/wiki/Privacy-Policy

## Troubleshooting

- **“Disconnected” won’t change to “Connected”**
  - Allow popups, then try Connect Gmail again.

- **“Failed to fetch” / no jobs show**
  - Confirm you’re connected (green dot).

- **Follow-up sends multiple times**
  - Ensure only one scheduler is running (prefer a single Render worker) and the service is deployed to the latest version.

## Support

- Support: john@algconsult.co.uk
