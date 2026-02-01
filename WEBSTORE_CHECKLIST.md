## Send& — Web Store checklist

### Extension packaging
- Run `npm run build` in `send-and/`.\n+- Run `npm run package` in `send-and/` to generate the upload zip.\n+- Verify the generated `build/chrome-mv3-prod/manifest.json`:\n+  - `content_scripts.matches` is only `https://mail.google.com/*`\n+  - `host_permissions` is only `https://sendandbackend.onrender.com/*`\n+
### Backend (Render) operational setup
- Web Service (API)\n+  - Set `RUN_SCHEDULER=false`\n+  - Deploy normally\n+- Background Worker (Scheduler)\n+  - Start command: `npm run start:worker`\n+  - Deploy and keep running 24/7\n+\n+### CORS / Allowed Origins (important)\n+Your backend must allow requests from:\n+- Gmail: `https://mail.google.com`\n+- Your extension origin: `chrome-extension://<YOUR_EXTENSION_ID>`\n+\n+Set `ALLOWED_ORIGINS` accordingly in Render.\n+
### Chrome Web Store assets\n+- Icon: 128x128.\n+- Screenshots (at least 1; recommended 3–5).\n+- Optional promo tile images.\n+
### Required policies\n+- Host a **Privacy Policy URL** publicly (you can start from `PRIVACY_POLICY_TEMPLATE.md`).\n+- Add support contact.\n+
### Final sanity checks\n+- Clean Chrome profile:\n+  - install the packaged extension\n+  - connect Gmail\n+  - schedule a 1-minute follow-up\n+  - confirm it sends exactly once\n+- Confirm worker is running and jobs progress to `sent`.\n+
