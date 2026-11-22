# DASH project repair notes

This source snapshot includes a focused repair for the startup failures visible in the uploaded terminal output.

## Changes

1. **Deterministic Vite dev server** — binds to `127.0.0.1:5173` with `strictPort`, so the Electron renderer and Vite use one predictable endpoint.
2. **Development URL normalization** — the main process normalizes stale loopback `https://localhost:5173` / `https://127.0.0.1:5173` values to plain HTTP and pins loopback aliases to `127.0.0.1`. The main window and internal pages use the same resolved URL.
3. **Internal-page trust check** — `TabManager.ownsInternalPage()` uses the same normalized URL, avoiding a mismatch between the page origin and the security check.
4. **Extension manifest preflight** — persisted, unpacked, and Web Store extensions are checked before Electron loads them. A Manifest V3 extension containing the Manifest V2-only `background.scripts` field is rejected with a clear message. A persisted incompatible extension is unregistered from DASH but its files are not deleted.
5. **Startup logging** — the resolved development URL and renderer load failures are written to DASH's local startup log.

## Apply this project

- Close every DASH/Electron process.
- Back up your current `dash-monorepo` folder.
- Extract this archive and use the included `dash-monorepo` folder as the project folder (or copy its contents over the existing project).
- In PowerShell, run `npm ci`, then `npm run dev` from the project root.
- If `npm ci` completes but the native SQLite module is not ready, run `npm run native:electron`, then `npm run dev` again.

Do not delete `%APPDATA%\DASH` as a troubleshooting step; it contains browser profile data.

## Important limitation

This archive is based on the source ZIP uploaded before the previous patch. It repairs the startup causes supported by that snapshot and the supplied log. It has not been possible to run a full dependency install, typecheck, or Electron launch in this environment, so it is not represented as a fully runtime-verified release. If the issue continues, run `DIAGNOSE-DASH.ps1` and share its output together with the complete fresh `npm run dev` terminal output.
