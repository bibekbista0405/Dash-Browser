import { app, BrowserWindow, nativeImage, session, shell, type NativeImage, type Session, type WebContents } from 'electron';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { WebAppOffer } from '@dash/browser-core';

/** An installed web app (a site that shipped a manifest and was installed from the address bar). */
export interface InstalledWebApp {
  id: string;
  name: string;
  startUrl: string;
  scope: string;
  installedAt: number;
}

interface Manifest {
  name?: unknown;
  short_name?: unknown;
  start_url?: unknown;
  scope?: unknown;
  display?: unknown;
  icons?: unknown;
}

export interface WebAppDetails extends Omit<WebAppOffer, 'installedId'> {
  scope: string;
  iconImage: NativeImage;
}

const MAX_MANIFEST_BYTES = 256 * 1024;
const DISPLAY_OK = new Set(['standalone', 'fullscreen', 'minimal-ui']);

const dir = (): string => path.join(app.getPath('userData'), 'web-apps');
const file = (): string => path.join(dir(), 'apps.json');
const idFor = (startUrl: string): string => createHash('sha256').update(startUrl).digest('hex').slice(0, 16);

function isSecure(u: URL): boolean {
  return u.protocol === 'https:' || (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1'));
}

export function listWebApps(): InstalledWebApp[] {
  try {
    const raw = JSON.parse(fs.readFileSync(file(), 'utf8')) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw.filter((a): a is InstalledWebApp => !!a && typeof (a as InstalledWebApp).id === 'string' && typeof (a as InstalledWebApp).startUrl === 'string');
  } catch {
    return [];
  }
}

function save(apps: InstalledWebApp[]): void {
  fs.mkdirSync(dir(), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(apps, null, 2));
}

async function fetchBytes(ses: Session, url: string, limit: number): Promise<Buffer | null> {
  try {
    const res = await ses.fetch(url, { redirect: 'follow' });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > 0 && buf.length <= limit ? buf : null;
  } catch {
    return null;
  }
}

/**
 * Looks at the page the way Chrome decides "installable": a manifest link, a name, a start URL on the same site, a
 * display mode other than a plain browser tab, a usable PNG icon, and a secure (https) page. Returns null when any of
 * those is missing, so the Install button only shows when installing really works.
 */
export async function detectWebApp(wc: WebContents, ses: Session): Promise<WebAppDetails | null> {
  try {
    const pageUrl = new URL(wc.getURL());
    if (!isSecure(pageUrl)) return null;
    const href = (await wc.executeJavaScript(`(() => { const l = document.querySelector('link[rel~="manifest" i]'); return l ? l.href : null; })()`, true)) as string | null;
    if (!href) return null;
    const manifestUrl = new URL(href, pageUrl);
    if (!isSecure(manifestUrl)) return null;
    const bytes = await fetchBytes(ses, manifestUrl.href, MAX_MANIFEST_BYTES);
    if (!bytes) return null;
    const m = JSON.parse(bytes.toString('utf8')) as Manifest;
    const name = typeof m.name === 'string' && m.name.trim() ? m.name.trim() : typeof m.short_name === 'string' ? m.short_name.trim() : '';
    if (!name) return null;
    if (typeof m.display !== 'string' || !DISPLAY_OK.has(m.display)) return null;
    const start = new URL(typeof m.start_url === 'string' && m.start_url ? m.start_url : pageUrl.href, manifestUrl);
    if (start.origin !== pageUrl.origin) return null;
    const scope = new URL(typeof m.scope === 'string' && m.scope ? m.scope : './', manifestUrl);
    if (scope.origin !== pageUrl.origin) return null;
    // Biggest PNG icon wins (an SVG or ICO icon can't be turned into a shortcut icon here).
    const icons = Array.isArray(m.icons) ? (m.icons as { src?: unknown; sizes?: unknown; type?: unknown }[]) : [];
    const ranked = icons
      .filter((i) => typeof i.src === 'string' && (i.type === 'image/png' || /\.png(\?|$)/i.test(i.src as string)))
      .map((i) => ({ src: new URL(i.src as string, manifestUrl).href, size: Math.max(0, ...String(i.sizes ?? '').split(/\s+/).map((s) => parseInt(s, 10) || 0)) }))
      .sort((a, b) => b.size - a.size);
    for (const icon of ranked.slice(0, 3)) {
      const buf = await fetchBytes(ses, icon.src, 2 * 1024 * 1024);
      if (!buf) continue;
      const img = nativeImage.createFromBuffer(buf);
      if (img.isEmpty()) continue;
      const { width, height } = img.getSize();
      if (width < 96 || height < 96) continue;
      const png = img.resize({ width: 256, height: 256, quality: 'best' });
      return { name: name.slice(0, 60), startUrl: start.href, scope: scope.href, icon: png.toDataURL(), iconImage: png };
    }
    return null;
  } catch {
    return null;
  }
}

export function installedIdFor(startUrl: string): string | null {
  const id = idFor(startUrl);
  return listWebApps().some((a) => a.id === id) ? id : null;
}

/** A Windows .ico can carry a PNG as-is: a 22-byte header around the PNG bytes. */
function icoFromPng(png: Buffer): Buffer {
  const head = Buffer.alloc(22);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
  head[6] = 0; head[7] = 0; // 0 = 256 px
  head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12);
  head.writeUInt32LE(png.length, 14); head.writeUInt32LE(22, 18);
  return Buffer.concat([head, png]);
}

export interface InstallResult { ok: boolean; id?: string; shortcuts?: string[]; error?: string }

export function installWebApp(d: WebAppDetails): InstallResult {
  try {
    const id = idFor(d.startUrl);
    fs.mkdirSync(dir(), { recursive: true });
    const png = d.iconImage.toPNG();
    fs.writeFileSync(path.join(dir(), `${id}.png`), png);
    const apps = listWebApps().filter((a) => a.id !== id);
    apps.push({ id, name: d.name, startUrl: d.startUrl, scope: d.scope, installedAt: Date.now() });
    save(apps);
    const shortcuts: string[] = [];
    if (process.platform === 'win32') {
      const ico = path.join(dir(), `${id}.ico`);
      fs.writeFileSync(ico, icoFromPng(png));
      const safe = d.name.replace(/[\\/:*?"<>|]/g, '').trim() || 'App';
      const targets = [
        path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', `${safe}.lnk`),
        path.join(app.getPath('desktop'), `${safe}.lnk`),
      ];
      for (const t of targets) {
        const ok = shell.writeShortcutLink(t, 'create', {
          target: process.execPath,
          args: `--dash-app=${id}`,
          icon: ico,
          iconIndex: 0,
          description: d.name,
          appUserModelId: `com.bibekbista.dash.app.${id}`,
        });
        if (ok) shortcuts.push(t);
      }
    }
    return { ok: true, id, shortcuts };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export function uninstallWebApp(id: string): void {
  const apps = listWebApps();
  const found = apps.find((a) => a.id === id);
  if (!found) return;
  save(apps.filter((a) => a.id !== id));
  for (const ext of ['png', 'ico']) fs.rmSync(path.join(dir(), `${id}.${ext}`), { force: true });
  if (process.platform === 'win32') {
    const safe = found.name.replace(/[\\/:*?"<>|]/g, '').trim() || 'App';
    for (const t of [
      path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', `${safe}.lnk`),
      path.join(app.getPath('desktop'), `${safe}.lnk`),
    ]) fs.rmSync(t, { force: true });
  }
  for (const w of appWindows.get(id) ?? []) if (!w.isDestroyed()) w.close();
}

const appWindows = new Map<string, Set<BrowserWindow>>();
export const isWebAppWindow = (win: BrowserWindow): boolean => [...appWindows.values()].some((s) => s.has(win));

/** Opens (or focuses) the app's own window: no tab strip, no address bar, just the site, with its name and icon. */
export function launchWebApp(id: string): boolean {
  const found = listWebApps().find((a) => a.id === id);
  if (!found) return false;
  const existing = [...(appWindows.get(id) ?? [])].find((w) => !w.isDestroyed());
  if (existing) {
    if (existing.isMinimized()) existing.restore();
    existing.show();
    existing.focus();
    return true;
  }
  const iconPath = path.join(dir(), `${id}.png`);
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 420,
    minHeight: 320,
    title: found.name,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, session: session.defaultSession },
  });
  win.removeMenu();
  let set = appWindows.get(id);
  if (!set) { set = new Set(); appWindows.set(id, set); }
  set.add(win);
  win.on('closed', () => set?.delete(win));

  const scope = found.scope;
  const inScope = (u: string): boolean => u.startsWith(scope);
  const wc = win.webContents;
  wc.setWindowOpenHandler(({ url }) => {
    if (inScope(url)) { void wc.loadURL(url); }
    else if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (e, url) => {
    if (inScope(url) || !/^https?:/i.test(url)) return; // same site stays here
    e.preventDefault();
    void shell.openExternal(url); // anything else opens in the normal browser
  });
  // Esc leaves HTML fullscreen (video) in the app window too, F11 toggles window fullscreen.
  wc.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') win.setFullScreen(!win.isFullScreen());
  });
  void wc.loadURL(found.startUrl);
  return true;
}
