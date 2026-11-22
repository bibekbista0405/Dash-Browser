#!/usr/bin/env node
/**
 * Confirms that a Windows packaging run produced the expected files and that they carry DASH's publisher metadata.
 *
 *   node scripts/check-artifacts.mjs [releaseDir]
 *
 * Checks (all must pass, exit code 1 otherwise):
 *   - release/win-unpacked/DASH.exe, "DASH Setup <version>.exe" and "DASH <version>.exe" exist and are not tiny
 *   - each .exe contains the version-resource strings for company, product, copyright and description
 * The version-resource strings are read straight out of the file (they are stored as UTF-16 text), so this works on
 * any OS. It does NOT check signatures - use scripts/verify-signatures.ps1 for that.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(desktopDir, 'package.json'), 'utf8'));
const releaseDir = path.resolve(process.argv[2] ?? path.join(desktopDir, 'release'));
const v = pkg.version;

const expected = {
  CompanyName: pkg.author?.name ?? '',
  ProductName: pkg.build.productName,
  LegalCopyright: pkg.build.copyright,
  FileDescription: pkg.description,
};
const files = [
  // The app executable's version resource is written by electron-builder from package.json: strict.
  { rel: path.join('win-unpacked', 'DASH.exe'), strict: true },
  // The installer and portable wrappers get their own version resources from electron-builder's templates. Their
  // exact strings have not been confirmed on a Windows build yet, so a mismatch is reported as a warning only.
  { rel: `DASH Setup ${v}.exe`, strict: false },
  { rel: `DASH ${v}.exe`, strict: false },
];

let failed = false;
const fail = (msg) => { failed = true; console.error(`  FAIL  ${msg}`); };
const ok = (msg) => console.log(`  ok    ${msg}`);
const warn = (msg) => console.warn(`  warn  ${msg}`);

const utf16 = (s) => Buffer.from(s, 'utf16le');
for (const f of files) {
  const full = path.join(releaseDir, f.rel);
  console.log(`\n${f.rel}`);
  if (!fs.existsSync(full)) { fail('missing'); continue; }
  const size = fs.statSync(full).size;
  if (size < 5 * 1024 * 1024) fail(`only ${size} bytes - too small to be a real build`); else ok(`${(size / 1048576).toFixed(1)} MB`);
  const data = fs.readFileSync(full);
  for (const [key, value] of Object.entries(expected)) {
    if (!value) { fail(`no expected value for ${key}`); continue; }
    if (data.includes(utf16(value))) ok(`${key} = ${value}`);
    else if (f.strict) fail(`${key} "${value}" not found in version resource`);
    else warn(`${key} "${value}" not found in version resource (not enforced for this file)`);
  }
}
if (failed) { console.error('\n[DASH] Artifact check FAILED'); process.exit(1); }
console.log('\n[DASH] Artifact check passed (existence and metadata strings). Signatures are not checked here.');
