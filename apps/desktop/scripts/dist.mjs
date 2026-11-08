#!/usr/bin/env node
/**
 * Cross-platform packaging driver (replaces shell one-liners that relied on
 * POSIX `VAR=1 cmd` and `;` — neither works in Windows cmd.exe).
 *
 *   node scripts/dist.mjs            -> installers for the current OS
 *   node scripts/dist.mjs win        -> Windows NSIS installer
 *   node scripts/dist.mjs portable   -> Windows portable .exe
 *
 * Always restores the local-dev native binary afterwards, even on failure.
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { desktopDir } from './native.mjs';

const mode = process.argv[2] ?? 'default';
const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/** Locates a package's file even when its `exports` map hides it from require.resolve. */
function pkgFile(pkg, rel) {
  const pkgJson = require.resolve(`${pkg}/package.json`, { paths: [desktopDir] });
  return path.join(path.dirname(pkgJson), rel);
}

function run(label, command, args, env = {}) {
  console.log(`\n[DASH] ${label}`);
  const r = spawnSync(command, args, { cwd: desktopDir, stdio: 'inherit', env: { ...process.env, ...env } });
  if (r.status !== 0) throw new Error(`${label} failed (${r.status ?? r.signal ?? r.error?.message})`);
}

let failed = null;
try {
  const viteBin = pkgFile('vite', 'bin/vite.js');
  run('Building app (vite)', process.execPath, [viteBin, 'build']);

  const builderCli = pkgFile('electron-builder', 'cli.js');
  const builderArgs = [builderCli];
  const env = {};
  if (mode === 'win' || mode === 'portable') {
    run('Fetching Windows native binary', process.execPath, [path.join(scriptsDir, 'prebuild-win-sqlite3.mjs')]);
    env.CSC_IDENTITY_AUTO_DISCOVERY = 'false'; // unsigned build; no code-signing cert required
    builderArgs.push('--win');
    if (mode === 'portable') builderArgs.push('portable');
  }
  run('Packaging (electron-builder)', process.execPath, builderArgs, env);
} catch (err) {
  failed = err;
  console.error(`\n[DASH] ${err.message}`);
} finally {
  if (mode === 'win' || mode === 'portable') {
    spawnSync(process.execPath, [path.join(scriptsDir, 'restore-dev-sqlite3.mjs')], { cwd: desktopDir, stdio: 'inherit' });
  }
}
process.exit(failed ? 1 : 0);
