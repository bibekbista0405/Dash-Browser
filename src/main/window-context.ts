import type { BrowserWindow, WebContents } from 'electron';
import type { TabManager } from './services/tab-manager';

export interface WindowContext {
  win: BrowserWindow;
  tabManager: TabManager;
}

/**
 * ipcMain.handle registers a channel GLOBALLY, once, for the whole app —
 * not per-window. So with multiple windows, handlers can't just close over
 * "the" window/TabManager; they have to look up which window sent this
 * particular request and dispatch to that window's own TabManager. This
 * registry is what makes that possible, keyed by each window's own chrome
 * webContents.id.
 */
const contexts = new Map<number, WindowContext>();

/**
 * Internal pages (dash://history, dash://downloads, dash://bookmarks,
 * dash://settings) are real tabs with the chrome preload attached, so they
 * ALSO need to be trusted senders for IPC — this was the actual root cause
 * of every "settings:get-all"/"history:query"/etc. call being rejected
 * with "unrecognized window" once these became real tabs instead of
 * overlay panels. Kept in a separate map from `contexts` (rather than
 * merged in) so it's easy to reason about and to also use for broadcasting
 * live updates (download progress, settings changes) to these tabs, which
 * `win.webContents.send()` alone never reaches — that only reaches the
 * chrome shell, not any tab living inside it.
 */
const internalPages = new Map<number, { webContents: WebContents; context: WindowContext }>();

export function registerWindowContext(context: WindowContext): void {
  contexts.set(context.win.webContents.id, context);
}

export function unregisterWindowContext(webContentsId: number): void {
  contexts.delete(webContentsId);
}

export function getWindowContext(webContentsId: number): WindowContext | undefined {
  return contexts.get(webContentsId);
}

export function getAllWindowContexts(): WindowContext[] {
  return Array.from(contexts.values());
}

export function registerInternalPage(webContents: WebContents, context: WindowContext): void {
  internalPages.set(webContents.id, { webContents, context });
}

export function unregisterInternalPage(webContentsId: number): void {
  internalPages.delete(webContentsId);
}

/** Used by every IPC handler's trust check — resolves either a chrome window OR a trusted internal-page tab. */
export function getContextForSender(webContentsId: number): WindowContext | undefined {
  return contexts.get(webContentsId) ?? internalPages.get(webContentsId)?.context;
}

/** Everywhere we currently broadcast to `win.webContents` also needs to reach these, or live updates never arrive. */
export function getAllInternalPageWebContents(): WebContents[] {
  return Array.from(internalPages.values())
    .map((entry) => entry.webContents)
    .filter((wc) => !wc.isDestroyed());
}
