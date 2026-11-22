#!/usr/bin/env node
/**
 * dist:win / dist:portable temporarily swap in a Windows-targeted native
 * binary for better-sqlite3 so the packaged app works on a real Windows
 * machine. That would leave a Windows DLL sitting in this developer's own
 * (non-Windows) node_modules afterward, silently breaking `npm run dev`.
 * This restores the binary that matches whatever machine is actually
 * running this script.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(__dirname, '../../..');
const betterSqlite3Dir = path.join(monorepoRoot, 'node_modules', 'better-sqlite3');
const electronPkg = JSON.parse(readFileSync(path.join(monorepoRoot, 'node_modules/electron/package.json'), 'utf-8'));

console.log(`[DASH] Restoring better-sqlite3 native binary for local dev (Electron ${electronPkg.version})...`);

execFileSync(
  'npx',
  ['prebuild-install', `--target=${electronPkg.version}`, '--runtime=electron', '--verbose'],
  { cwd: betterSqlite3Dir, stdio: 'inherit', shell: true }
);

console.log('[DASH] Local dev binary restored.');
