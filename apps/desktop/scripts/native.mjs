/**
 * Shared helper for fetching better-sqlite3's prebuilt native binary.
 *
 * Runs prebuild-install's own entry point with the current Node binary
 * directly — no `npx`, no shell — which is faster, works the same on
 * Windows/macOS/Linux and cannot trigger a surprise package download.
 * A larger heap is allowed in case the machine is short on memory.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const monorepoRoot = path.resolve(__dirname, '../../..');
export const desktopDir = path.resolve(__dirname, '..');
export const betterSqlite3Dir = path.join(monorepoRoot, 'node_modules', 'better-sqlite3');

export function electronVersion() {
  const require = createRequire(import.meta.url);
  try {
    return require(path.join(monorepoRoot, 'node_modules/electron/package.json')).version;
  } catch {
    return null;
  }
}

/** @returns {{ ok: boolean, reason?: string }} */
export function installPrebuilt({ platform, arch, target, attempts = 3 }) {
  if (!existsSync(betterSqlite3Dir)) return { ok: false, reason: 'better-sqlite3 is not installed yet' };
  const require = createRequire(path.join(betterSqlite3Dir, 'package.json'));
  let bin;
  try {
    bin = require.resolve('prebuild-install/bin.js');
  } catch {
    return { ok: false, reason: 'prebuild-install was not found next to better-sqlite3' };
  }
  const args = [bin, `--target=${target}`, '--runtime=electron'];
  if (platform) args.push(`--platform=${platform}`);
  if (arch) args.push(`--arch=${arch}`);

  let lastStatus = null;
  for (let i = 1; i <= attempts; i++) {
    const r = spawnSync(process.execPath, args, {
      cwd: betterSqlite3Dir,
      stdio: 'inherit',
      env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=4096' },
    });
    if (r.status === 0) return { ok: true };
    lastStatus = r.status ?? r.signal;
    if (i < attempts) console.warn(`[DASH] prebuild-install failed (${lastStatus}), retrying (${i}/${attempts - 1})...`);
  }
  return { ok: false, reason: `prebuild-install exited with ${lastStatus}` };
}
