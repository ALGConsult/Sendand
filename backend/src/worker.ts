import "dotenv/config"

import { ensureSchema } from "./schema.js"
import { startScheduler } from "./scheduler.js"

async function main() {
  await ensureSchema()
  startScheduler()
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error("[send-and-worker] fatal", e)
  process.exit(1)
})

