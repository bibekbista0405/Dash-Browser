#!/usr/bin/env node
/**
 * electron-builder's automatic native-module rebuild (`npmRebuild`) cannot
 * actually cross-compile better-sqlite3's C++ addon for Windows when running
 * on Linux/macOS — it silently reuses the host platform's binary, which
 * crashes at runtime on the target machine. This was caught during real
 * packaging verification, not assumed away.
 *
 * The fix: fetch the real prebuilt Windows binary directly via
 * better-sqlite3's own `prebuild-install` mechanism, then tell
 * electron-builder NOT to rebuild it (see `build.npmRebuild: false` in
 * package.json, which disables electron-builder's broken auto-rebuild
 * globally so this manually-fetched binary is never clobbered).
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ELECTRON_VERSION = '32.3.3'; // must match build.electronVersion in package.json

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(__dirname, '../../..');
const betterSqlite3Dir = path.join(monorepoRoot, 'node_modules', 'better-sqlite3');

console.log(`[DASH] Fetching Windows x64 prebuilt binary for better-sqlite3 (Electron ${ELECTRON_VERSION})...`);

execFileSync(
  'npx',
  [
    'prebuild-install',
    '--platform=win32',
    '--arch=x64',
    `--target=${ELECTRON_VERSION}`,
    '--runtime=electron',
    '--verbose',
  ],
  { cwd: betterSqlite3Dir, stdio: 'inherit', shell: true }
);

console.log('[DASH] Windows native binary ready.');
