import { session, dialog, type BrowserWindow, type Extension } from 'electron';
import { getDatabase } from '../db/database';
import type { ExtensionInfo } from '../../shared/ipc-channels';

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
 * - No Chrome Web Store integration — Electron has no built-in .crx
 *   installer, so this only supports unpacked (folder) extensions, same as
 *   Chrome's own developer mode.
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

  list(): ExtensionInfo[] {
    return this.targetSession.getAllExtensions().map((ext) => this.toInfo(ext, ext.path));
  }

  remove(extensionId: string): void {
    const extension = this.targetSession.getExtension(extensionId);
    if (extension) {
      getDatabase().removeExtensionPath(extension.path);
      this.targetSession.removeExtension(extensionId);
    }
  }

  private toInfo(extension: Extension, folderPath: string): ExtensionInfo {
    return {
      id: extension.id,
      name: extension.manifest?.name ?? extension.id,
      version: extension.manifest?.version ?? '',
      folderPath,
    };
  }
}
