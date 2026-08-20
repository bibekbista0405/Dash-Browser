import type { BrowserWindow } from 'electron';
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
 * webContents.id (not any tab's webContents — those never have our
 * preload attached and can't call ipcRenderer.invoke in the first place).
 */
const contexts = new Map<number, WindowContext>();

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
