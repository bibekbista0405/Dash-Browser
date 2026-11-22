import extract from 'extract-zip';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const MAX_CRX_BYTES = 80 * 1024 * 1024;

/** Chrome Web Store extension ids are 32 letters a–p. Accepts a bare id or any Web Store URL containing one. */
export function parseExtensionId(input: string): string | null {
  const text = input.trim();
  if (/^[a-p]{32}$/.test(text)) return text;
  try {
    const url = new URL(text);
    if (!/(^|\.)(chromewebstore\.google\.com|chrome\.google\.com)$/.test(url.hostname)) return null;
    const m = url.pathname.split('/').find((seg) => /^[a-p]{32}$/.test(seg));
    return m ?? null;
  } catch {
    return null;
  }
}

/** Strips the CRX2/CRX3 header and returns the ZIP payload. Signatures are not checked (see ExtensionManager notes). */
export function crxToZip(crx: Buffer): Buffer {
  if (crx.length < 16 || crx.toString('latin1', 0, 4) !== 'Cr24') throw new Error('That download is not a Chrome extension (.crx) file');
  const version = crx.readUInt32LE(4);
  let start: number;
  if (version === 3) {
    start = 12 + crx.readUInt32LE(8);
  } else if (version === 2) {
    start = 16 + crx.readUInt32LE(8) + crx.readUInt32LE(12);
  } else {
    throw new Error(`Unsupported extension package version ${version}`);
  }
  if (start >= crx.length) throw new Error('The extension package is damaged');
  return crx.subarray(start);
}

/** Unpacks a CRX into `destDir` (created fresh). extract-zip refuses entries that would escape the folder. */
export async function extractCrx(crx: Buffer, destDir: string): Promise<void> {
  const zip = crxToZip(crx);
  const tmp = path.join(os.tmpdir(), `dash-crx-${process.pid}-${Date.now()}.zip`);
  fs.writeFileSync(tmp, zip);
  try {
    fs.rmSync(destDir, { recursive: true, force: true });
    fs.mkdirSync(destDir, { recursive: true });
    await extract(tmp, { dir: path.resolve(destDir) });
  } catch (e) {
    fs.rmSync(destDir, { recursive: true, force: true });
    throw new Error(`Could not unpack the extension: ${(e as Error).message}`);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
  if (!fs.existsSync(path.join(destDir, 'manifest.json'))) {
    fs.rmSync(destDir, { recursive: true, force: true });
    throw new Error('The package has no manifest.json');
  }
}

export interface ExtensionManifest {
  name?: string;
  version?: string;
  description?: string;
  permissions?: unknown[];
  host_permissions?: unknown[];
  optional_permissions?: unknown[];
  content_scripts?: { matches?: string[] }[];
  default_locale?: string;
}

export function readManifest(dir: string): ExtensionManifest {
  return JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf-8').replace(/^\uFEFF/, '')) as ExtensionManifest;
}

/** Resolves "__MSG_key__" names from the extension's default locale so the prompt shows a readable name. */
export function displayName(dir: string, manifest: ExtensionManifest, fallback: string): string {
  const raw = manifest.name ?? fallback;
  const m = /^__MSG_(.+)__$/.exec(raw);
  if (!m) return raw;
  try {
    const loc = manifest.default_locale ?? 'en';
    const msgs = JSON.parse(fs.readFileSync(path.join(dir, '_locales', loc, 'messages.json'), 'utf-8')) as Record<string, { message?: string }>;
    const key = Object.keys(msgs).find((k) => k.toLowerCase() === m[1].toLowerCase());
    return (key && msgs[key].message) || fallback;
  } catch {
    return fallback;
  }
}

const PERMISSION_HINTS: Record<string, string> = {
  tabs: 'See the addresses and titles of your open tabs',
  history: 'Read and change your browsing history',
  bookmarks: 'Read and change your bookmarks',
  cookies: 'Read and change cookies',
  webRequest: 'Observe network requests',
  webRequestBlocking: 'Block or modify network requests',
  declarativeNetRequest: 'Block or modify network requests',
  downloads: 'Manage downloads',
  clipboardRead: 'Read what you copied',
  clipboardWrite: 'Write to the clipboard',
  storage: 'Store its own data',
  notifications: 'Show notifications',
  nativeMessaging: 'Talk to programs on this computer',
  management: 'See and manage other extensions',
  geolocation: 'Use your location',
  scripting: 'Run code in pages',
  activeTab: 'Access the page you click it on',
};

/** Human-readable lines for the install prompt: broad site access first, then notable API permissions. */
export function permissionSummary(manifest: ExtensionManifest): string[] {
  const hosts = new Set<string>();
  for (const h of manifest.host_permissions ?? []) if (typeof h === 'string') hosts.add(h);
  for (const p of manifest.permissions ?? []) if (typeof p === 'string' && (p.includes('://') || p === '<all_urls>')) hosts.add(p);
  for (const cs of manifest.content_scripts ?? []) for (const m of cs.matches ?? []) hosts.add(m);
  const lines: string[] = [];
  const all = [...hosts].some((h) => h === '<all_urls>' || /^(\*|https?|http\*?):\/\/\*\/\*$/.test(h) || h === '*://*/*');
  if (all) lines.push('Read and change your data on ALL websites');
  else if (hosts.size) lines.push(`Read and change your data on: ${[...hosts].slice(0, 6).join(', ')}${hosts.size > 6 ? ` and ${hosts.size - 6} more` : ''}`);
  for (const p of manifest.permissions ?? []) if (typeof p === 'string' && PERMISSION_HINTS[p]) lines.push(PERMISSION_HINTS[p]);
  return [...new Set(lines)];
}
