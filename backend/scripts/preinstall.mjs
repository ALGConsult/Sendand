import fs from "node:fs"
import path from "node:path"

const root = process.cwd()

function exists(p) {
  try {
    fs.accessSync(p, fs.constants.F_OK)
    return true
  } catch {
    return false
  }
}

function rmrf(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true })
    // eslint-disable-next-line no-console
    console.log(`[preinstall] removed ${p}`)
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[preinstall] failed to remove ${p}:`, e?.message ?? e)
  }
}

// Render sometimes restores a cached node_modules. If that cache is corrupted/incomplete,
// pg may crash at runtime with "Cannot find pg-protocol/dist/index.js".
// Force a clean re-install of pg-protocol (and pg) if the dist entrypoint is missing.
const pgProtocolDir = path.join(root, "node_modules", "pg-protocol")
const pgProtocolDistIndex = path.join(pgProtocolDir, "dist", "index.js")
const pgDir = path.join(root, "node_modules", "pg")

if (exists(pgProtocolDir) && !exists(pgProtocolDistIndex)) {
  rmrf(pgProtocolDir)
  // Also remove pg to force npm to re-resolve dependencies cleanly.
  if (exists(pgDir)) rmrf(pgDir)
}

