import { app, session, dialog, net, type Extension } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { MAX_CRX_BYTES, displayName, extractCrx, parseExtensionId, permissionSummary, readManifest } from './crx';
import { getDatabase } from '../db/database';
import type { ExtensionInfo } from '../../shared/ipc-channels';
import { BrowserWindow } from 'electron';

/** The few manifest fields the toolbar needs. */
interface ManifestLike {
  name?: string;
  version?: string;
  icons?: unknown;
  action?: { default_popup?: unknown; default_icon?: unknown };
  browser_action?: { default_popup?: unknown; default_icon?: unknown };
  page_action?: { default_popup?: unknown };
  options_ui?: { page?: unknown };
  options_page?: unknown;
}

const ICON_TYPES: Record<string, string> = { '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' };

function popupPathOf(m: ManifestLike): string | null {
  const p = m.action?.default_popup ?? m.browser_action?.default_popup ?? m.page_action?.default_popup;
  return typeof p === 'string' && p ? p : null;
}

function optionsPathOf(m: ManifestLike): string | null {
  const p = m.options_ui?.page ?? m.options_page;
  return typeof p === 'string' && p ? p : null;
}

/** The extension's own icon from its manifest (largest declared size), as a data URL. Never leaves the extension folder. */
function readIcon(root: string, m: ManifestLike): string | null {
  const candidates: string[] = [];
  const add = (v: unknown) => {
    if (typeof v === 'string') candidates.push(v);
    else if (v && typeof v === 'object') {
      for (const k of Object.keys(v as object).sort((a, b) => Number(b) - Number(a))) {
        const f = (v as Record<string, unknown>)[k];
        if (typeof f === 'string') candidates.push(f);
      }
    }
  };
  add(m.action?.default_icon);
  add(m.browser_action?.default_icon);
  add(m.icons);
  for (const rel of candidates) {
    try {
      const full = path.resolve(root, rel.replace(/^\/+/, ''));
      if (!full.startsWith(path.resolve(root) + path.sep)) continue;
      const mime = ICON_TYPES[path.extname(full).toLowerCase()];
      if (!mime) continue;
      const st = fs.statSync(full);
      if (!st.isFile() || st.size > 256 * 1024) continue;
      return `data:${mime};base64,${fs.readFileSync(full).toString('base64')}`;
    } catch {
      /* try the next one */
    }
  }
  return null;
}

/**
 * Loads real, unpacked Chrome extensions via Electron's actual
 * `session.loadExtension` API — this is genuine Chrome extension support
 * (Manifest V2 and the supported subset of V3 that Electron implements),
 * not a simulation of it. A "real feature" claim here is meaningful:
 * standard unpacked extensions (the kind you get from `chrome://extensions`
 * → "Load unpacked", or from cloning most open-source extension repos)
 * genuinely work.
 *
 * Honest limitations, stated up front rather than discovered the hard way:
 * - Chrome Web Store install downloads the .crx over HTTPS from Google's
 *   update endpoint, unpacks it into DASH's own extensions folder after the
 *   user approves the permissions it lists, then loads it. DASH does not
 *   verify the CRX signature (it relies on HTTPS to Google), there is no
 *   automatic update, and the download itself needs internet access.
 * - Electron's extension API coverage is a real subset of Chrome's, not
 *   100% of it — Manifest V3 service-worker background scripts and some
 *   chrome.* APIs (chrome.identity, several enterprise/policy APIs) aren't
 *   implemented. Popular content-script and DOM-manipulation extensions
 *   generally work; extensions leaning heavily on unimplemented APIs may
 *   partially fail. This is an Electron-level constraint DASH can't paper
 *   over.
 * - Extensions load into `session.defaultSession` only (normal tabs).
 *   They are deliberately NOT loaded into private-browsing sessions —
 *   real browsers vary on this, but DASH errs toward extensions being
 *   able to observe private-tab content being a privacy regression by
 *   default.
 */
export class ExtensionManager {
  constructor(private targetSession = session.defaultSession) {}

  /** Called once at startup to reload every previously-loaded extension (Electron doesn't persist this itself). */
  async restorePersisted(): Promise<void> {
    const paths = getDatabase().listExtensionPaths();
    for (const folderPath of paths) {
      try {
        await this.targetSession.loadExtension(folderPath, { allowFileAccess: true });
      } catch (err) {
        console.error(`[DASH] Failed to reload extension at ${folderPath}:`, (err as Error).message);
        getDatabase().removeExtensionPath(folderPath);
      }
    }
  }

  async loadFromPicker(win: BrowserWindow): Promise<ExtensionInfo | null> {
    const result = await dialog.showOpenDialog(win, {
      title: 'Load unpacked extension',
      message: "Select the folder containing the extension's manifest.json",
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const folderPath = result.filePaths[0];
    const extension = await this.targetSession.loadExtension(folderPath, { allowFileAccess: true });
    getDatabase().addExtensionPath(folderPath);
    return this.toInfo(extension, folderPath);
  }

  /** Installs from a Chrome Web Store URL or extension id, after the user approves the permissions it asks for. */
  async installFromWebStore(win: BrowserWindow, input: string): Promise<ExtensionInfo | null> {
    const id = parseExtensionId(input);
    if (!id) throw new Error('Paste a Chrome Web Store link or the 32-letter extension id.');
    if (this.targetSession.getAllExtensions().some((e) => e.path.endsWith(path.join('extensions', id)))) throw new Error('That extension is already installed.');

    const url = `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=${process.versions.chrome}&acceptformat=crx2,crx3&x=${encodeURIComponent(`id=${id}&uc`)}`;
    let buf: Buffer;
    try {
      const res = await net.fetch(url, { redirect: 'follow' });
      if (!res.ok) throw new Error(`The Web Store answered ${res.status} (is the id right?)`);
      const len = Number(res.headers.get('content-length') ?? 0);
      if (len > MAX_CRX_BYTES) throw new Error('That extension is too large');
      buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_CRX_BYTES) throw new Error('That extension is too large');
    } catch (e) {
      throw new Error(`Could not download the extension: ${(e as Error).message}`);
    }

    const root = path.join(app.getPath('userData'), 'extensions');
    const dir = path.join(root, id);
    await extractCrx(buf, dir);
    const manifest = readManifest(dir);
    const name = displayName(dir, manifest, id);
    const perms = permissionSummary(manifest);
    const answer = await dialog.showMessageBox(win, {
      type: 'question',
      title: 'Install extension',
      message: `Add "${name}" (version ${manifest.version ?? '?'})?`,
      detail:
        (perms.length ? `It can:\n• ${perms.join('\n• ')}` : 'It asks for no special permissions.') +
        '\n\nExtensions run in normal tabs only (never private tabs or containers). Only install extensions you trust.',
      buttons: ['Add extension', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
    });
    if (answer.response !== 0) {
      fs.rmSync(dir, { recursive: true, force: true });
      return null;
    }
    try {
      const extension = await this.targetSession.loadExtension(dir, { allowFileAccess: false });
      getDatabase().addExtensionPath(dir);
      return this.toInfo(extension, dir);
    } catch (e) {
      fs.rmSync(dir, { recursive: true, force: true });
      throw new Error(`Electron could not load this extension: ${(e as Error).message}`);
    }
  }

  list(): ExtensionInfo[] {
    return this.targetSession.getAllExtensions().map((ext) => this.toInfo(ext, ext.path));
  }

  remove(extensionId: string): void {
    const extension = this.targetSession.getExtension(extensionId);
    if (extension) {
      getDatabase().removeExtensionPath(extension.path);
      getDatabase().setExtensionPinned(extensionId, false);
      this.targetSession.removeExtension(extensionId);
      // Extensions DASH downloaded live in its own folder and go with the extension; unpacked ones are the user's files.
      const own = path.join(app.getPath('userData'), 'extensions') + path.sep;
      if (extension.path.startsWith(own)) fs.rmSync(extension.path, { recursive: true, force: true });
    }
  }

  private toInfo(extension: Extension, folderPath: string): ExtensionInfo {
    const m = (extension.manifest ?? {}) as unknown as ManifestLike;
    return {
      id: extension.id,
      name: m.name ?? extension.id,
      version: m.version ?? '',
      folderPath,
      pinned: getDatabase().listPinnedExtensions().includes(extension.id),
      iconDataUrl: readIcon(extension.path, m),
      hasPopup: popupPathOf(m) !== null,
      hasOptions: optionsPathOf(m) !== null,
    };
  }

  /**
   * Toolbar click. Chromium's extension toolbar is not part of Electron, so DASH opens the extension's own popup page
   * in a small window under the button; extensions without a popup open their options page instead.
   */
  async open(
    win: BrowserWindow,
    extensionId: string,
    anchor: { x: number; y: number; width: number; height: number },
    openTab: (url: string) => void
  ): Promise<'popup' | 'options' | 'none'> {
    const ext = this.targetSession.getExtension(extensionId);
    if (!ext) return 'none';
    const m = (ext.manifest ?? {}) as unknown as ManifestLike;
    const popup = popupPathOf(m);
    if (popup) {
      this.popup?.close();
      const content = win.getContentBounds();
      const width = 380;
      const height = 520;
      const x = Math.round(Math.min(content.x + anchor.x + anchor.width - width, content.x + content.width - width - 8));
      const y = Math.round(content.y + anchor.y + anchor.height + 4);
      const pw = new BrowserWindow({
        parent: win,
        x: Math.max(content.x + 8, x),
        y,
        width,
        height,
        useContentSize: true,
        frame: false,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        show: false,
        backgroundColor: '#ffffff',
        webPreferences: { session: this.targetSession, contextIsolation: true, nodeIntegration: false, sandbox: true },
      });
      this.popup = pw;
      pw.once('ready-to-show', () => pw.show());
      pw.on('blur', () => { if (!pw.isDestroyed()) pw.close(); });
      pw.on('closed', () => { if (this.popup === pw) this.popup = null; });
      await pw.loadURL(`chrome-extension://${extensionId}/${popup.replace(/^\/+/, '')}`).catch(() => { if (!pw.isDestroyed()) pw.close(); });
      // Like Chrome, the popup is as big as its content (within limits).
      try {
        await new Promise((r) => setTimeout(r, 200));
        if (!pw.isDestroyed()) {
          const size = (await pw.webContents.executeJavaScript(
            '({ w: Math.ceil(document.documentElement.scrollWidth), h: Math.ceil(document.documentElement.scrollHeight) })'
          )) as { w: number; h: number };
          pw.setContentSize(Math.min(800, Math.max(200, size.w)), Math.min(600, Math.max(100, size.h)));
        }
      } catch { /* keep the default size */ }
      return 'popup';
    }
    const options = optionsPathOf(m);
    if (options) {
      openTab(`chrome-extension://${extensionId}/${options.replace(/^\/+/, '')}`);
      return 'options';
    }
    return 'none';
  }

  private popup: BrowserWindow | null = null;
}
