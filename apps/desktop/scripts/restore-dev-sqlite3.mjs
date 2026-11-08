#!/usr/bin/env node
/**
 * Puts the Electron-ABI build of better-sqlite3 in place so `npm run dev`
 * works. Runs automatically after `npm install` and after dist:win/portable
 * (which temporarily swap in a Windows binary).
 *
 * It is deliberately NON-FATAL: a native-binary hiccup (offline, antivirus
 * locking files, low memory) must never make `npm install` fail. If it can't
 * finish, it says exactly how to retry:  npm run native:electron
 */
import { installPrebuilt, electronVersion } from './native.mjs';

if (process.env.DASH_SKIP_NATIVE === '1') {
  console.log('[DASH] DASH_SKIP_NATIVE=1 — skipping native binary step.');
  process.exit(0);
}

const target = electronVersion();
if (!target) {
  console.log('[DASH] Electron is not installed yet — skipping native binary step (run `npm run native:electron` later).');
  process.exit(0);
}

console.log(`[DASH] Restoring better-sqlite3 native binary for local dev (Electron ${target})...`);
const result = installPrebuilt({ target });
if (result.ok) {
  console.log('[DASH] Local dev binary restored.');
} else {
  console.warn(`\n[DASH] Could not fetch the native binary automatically (${result.reason}).`);
  console.warn('[DASH] Install itself is fine. Before `npm run dev`, run:  npm run native:electron');
  console.warn('[DASH] (needs internet access; close antivirus/OneDrive sync on this folder if it keeps failing)\n');
}
process.exit(0);
