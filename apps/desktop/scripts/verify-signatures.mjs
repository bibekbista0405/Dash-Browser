#!/usr/bin/env node
/**
 * Runs scripts/verify-signatures.ps1 without tripping over PowerShell's execution policy.
 *
 * Windows' default policy (RemoteSigned/AllSigned) refuses to run an unsigned .ps1 that came from a download or zip.
 * This wrapper starts PowerShell with `-ExecutionPolicy Bypass` for that one process only; it changes no system or
 * user setting, and the script it runs is the one in this repository.
 *
 *   npm run verify:signatures -- -AllowUnsigned           (checks release\*.exe)
 *   npm run verify:signatures -- "path\to\file.exe"       (strict: must be validly signed)
 *   npm run verify:signatures -- -ExpectedSigner "SignPath Foundation" "signed\*.exe"
 *
 * Relative paths are resolved from the folder you ran npm in. Exit code is the PowerShell script's (0 ok, 1 missing,
 * 2 unsigned, 3 invalid).
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(scriptsDir, '..');
const callerDir = process.env.INIT_CWD || process.cwd();

if (process.platform !== 'win32') {
  console.error('[DASH] Authenticode signatures can only be checked on Windows (Get-AuthenticodeSignature).');
  process.exit(1);
}

const raw = process.argv.slice(2);
const valueFlags = new Set(['-expectedsigner']);
const args = [];
let sawPath = false;
for (let i = 0; i < raw.length; i++) {
  const a = raw[i];
  if (a.startsWith('-')) {
    args.push(a);
    if (valueFlags.has(a.toLowerCase()) && i + 1 < raw.length) args.push(raw[++i]);
  } else {
    sawPath = true;
    args.push(path.resolve(callerDir, a));
  }
}
if (!sawPath) args.push(path.join(desktopDir, 'release', '*.exe'));

const ps = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(scriptsDir, 'verify-signatures.ps1'), ...args];
if (process.env.DASH_DRY_RUN === '1') {
  console.log('powershell ' + ps.map((x) => JSON.stringify(x)).join(' '));
  process.exit(0);
}
const r = spawnSync('powershell.exe', ps, { stdio: 'inherit' });
process.exit(r.status ?? 1);
