#!/usr/bin/env node
/**
 * electron-builder's automatic native rebuild can't cross-compile
 * better-sqlite3 for Windows from another OS, so we fetch the real prebuilt
 * Windows x64 binary directly and set `build.npmRebuild: false`.
 * On a Windows machine this is the same binary the dev setup uses, fetched
 * explicitly so packaging never depends on what dev last left behind.
 * Fatal on failure: shipping without the right binary would crash at runtime.
 */
import { installPrebuilt } from './native.mjs';

const ELECTRON_VERSION = '32.3.3'; // must match build.electronVersion in package.json

console.log(`[DASH] Fetching Windows x64 prebuilt binary for better-sqlite3 (Electron ${ELECTRON_VERSION})...`);
const result = installPrebuilt({ platform: 'win32', arch: 'x64', target: ELECTRON_VERSION });
if (!result.ok) {
  console.error(`[DASH] Could not fetch the Windows binary: ${result.reason}`);
  process.exit(1);
}
console.log('[DASH] Windows native binary ready.');
