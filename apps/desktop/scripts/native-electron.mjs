#!/usr/bin/env node
/** Manual, loud version of the postinstall step:  npm run native:electron */
import { installPrebuilt, electronVersion } from './native.mjs';

const target = electronVersion();
if (!target) {
  console.error('[DASH] Electron is not installed. Run `npm install` first.');
  process.exit(1);
}
console.log(`[DASH] Fetching better-sqlite3 binary for Electron ${target} (${process.platform}-${process.arch})...`);
const result = installPrebuilt({ target });
if (!result.ok) {
  console.error(`[DASH] Failed: ${result.reason}`);
  console.error('[DASH] Check your internet connection / proxy, then run this again.');
  process.exit(1);
}
console.log('[DASH] Done. You can now run `npm run dev`.');
