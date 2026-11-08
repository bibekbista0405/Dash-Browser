import fs from 'node:fs';
import { app, BrowserWindow, Menu, dialog, nativeTheme, WebContentsView, clipboard, session, type Session } from 'electron';
import { randomUUID } from 'node:crypto';
import type { TabState, DashSettings, TabGroup, TabGroupColor } from '../../shared/ipc-channels';
import { IPC } from '../../shared/ipc-channels';
import { TAB_GROUP_COLORS, SLEEP_THRESHOLD_MINUTES, resolveAddressBarInput, NEW_TAB_URL, BOOKMARKS_BAR_HEIGHT, parseHostList, hostInList } from '../../shared/ipc-channels';
import { getDatabase } from '../db/database';
import { buildReaderScript } from './reader-mode';
import type { BlockedCountTracker } from './blocked-count-tracker';
import { isBrowserShortcut } from './shortcut-filter';
import { buildNewTabHtml, NEWTAB_ACTION_PREFIX } from './new-tab-page';
import { dismissRecoverable, recoverableCount, takeRecoverable } from './session-recovery';
import { appLog } from './app-log';
import { LOGO_FAVICON_DATA_URI } from './logo-data';
import { buildErrorPageDataUrl, failedUrlFromErrorPage, RETRY_PREFIX, buildCrashPageDataUrl } from './error-page';

/** Sentinel URL representing DASH's own New Tab Page — never a real network address. */
/**
 * Real internal pages backed by the second Vite entry (internal.html) and
 * the SAME preload used by the chrome window itself — unlike ordinary web
 * content, these get real `window.dash` access, which is what makes them
 * genuine interactive tabs (search, delete, live updates) instead of
 * static documents like the New Tab Page.
 */
export const INTERNAL_PAGE_URLS = {
  history: 'dash://history',
  downloads: 'dash://downloads',
  bookmarks: 'dash://bookmarks',
  settings: 'dash://settings',
} as const;
export type InternalPageId = keyof typeof INTERNAL_PAGE_URLS;
const INTERNAL_URL_TO_PAGE: Record<string, InternalPageId> = Object.fromEntries(
  Object.entries(INTERNAL_PAGE_URLS).map(([id, url]) => [url, id])
) as Record<string, InternalPageId>;

const TOOLBAR_HEIGHT = 88; // px reserved at top of window for tab strip + address bar
const SLEEP_CHECK_INTERVAL_MS = 60_000;

interface Tab {
  id: string;
  /** Null while the tab is asleep — its renderer process has been torn down. */
  view: WebContentsView | null;
  isActive: boolean;
  isPrivate: boolean;
  isSleeping: boolean;
  /** Cached so the tab strip can still show title/url while the view is torn down. */
  lastKnownUrl: string;
  lastKnownTitle: string;
  /** Timestamp this tab last stopped being the active tab — used for the sleep timer. */
  lastActiveAt: number;
  isPinned: boolean;
  isMuted: boolean;
  groupId: string | null;
  zoomFactor: number;
  /** True while showing DASH's own New Tab Page (a data: URL under the hood — this flag is what lets the UI show the clean sentinel instead). */
  isNewTabPage: boolean;
  /** Recent renderer-crash times, used to stop an endless reload loop. */
  crashTimes?: number[];
  /** Which real internal page (history/downloads/bookmarks/settings) this tab is showing, if any. */
  internalPage: InternalPageId | null;
  /** Captured straight from the page's own <link rel="icon"> via page-favicon-updated — never a third-party favicon service. */
  faviconUrl: string | null;
}

/**
 * Owns the lifecycle of every real Chromium view (tab) inside a DASH window.
 * Each tab is a genuine WebContentsView with its own isolated webContents —
 * this is real multi-process browsing, not a simulation. Background tabs
 * that go untouched long enough have their renderer process actually torn
 * down (real memory reclaimed, not a fake "sleeping" badge) and are
 * transparently recreated the moment the user switches back to them.
 */
export class TabManager {
  private tabs: Map<string, Tab> = new Map();
  private tabOrder: string[] = []; // insertion order, used for session persistence
  private activeTabId: string | null = null;
  // WebContentsViews are native layers that paint above the chrome window's
  // DOM regardless of CSS z-index. While any chrome overlay (menu, dropdown)
  // is open we detach the active view so the overlay is visible.
  private overlayDepth = 0;
  private overlaySnapshot: string | null = null;
  private onStateChange: (state: TabState) => void;
  private getSettings: () => DashSettings;
  private freedKb = 0;
  private sleepTimer: ReturnType<typeof setInterval>;
  /** Most-recently-closed first. Private tabs are never pushed here — closing one should leave no trace. */
  private groups: Map<string, TabGroup> = new Map();
  private closedTabs: { url: string; title: string; isPinned: boolean }[] = [];

  /**
   * One shared in-memory session for ALL private tabs in this window — mirrors
   * how real browsers isolate a private "profile" from the normal one while
   * still letting private tabs share cookies with each other during the
   * session. Because the partition name has no "persist:" prefix, Electron
   * never writes it to disk.
   */
  private privateSession = session.fromPartition(`private-${randomUUID()}`, { cache: false });

  constructor(
    private win: BrowserWindow,
    onStateChange: (state: TabState) => void,
    getSettings: () => DashSettings,
    private notifyTabsChanged: () => void,
    private tracker: BlockedCountTracker,
    private internalPagePreloadPath: string,
    private loadInternalPage: (view: WebContentsView, page: InternalPageId, tabId: string) => Promise<void>,
    private trustInternalPage: (wc: WebContentsView['webContents']) => void,
    private untrustInternalPage: (webContentsId: number) => void,
    private findCredentials: (origin: string) => { username: string; password: string } | null = () => null,
    private findAllCredentials: (origin: string) => { username: string; password: string }[] = () => [],
    private generatePassword: () => string = () => ''
  ) {
    this.onStateChange = onStateChange;
    this.getSettings = getSettings;
    this.win.on('resize', () => this.layoutActiveView());
    this.sleepTimer = setInterval(() => this.sleepEligibleTabs(), SLEEP_CHECK_INTERVAL_MS);
  }

  getPrivateSession(): Session {
    return this.privateSession;
  }

  dispose(): void {
    clearInterval(this.sleepTimer);
  }

  createTab(url?: string, isPrivate = false): TabState {
    const id = randomUUID();
    // Ctrl/Cmd+T opens DASH's own New Tab Page — "homepage" is a separate
    // setting, now only used by the explicit Home button, matching how
    // Chrome/Firefox distinguish the two.
    const targetUrl = url ?? NEW_TAB_URL;

    // Like Chrome's chrome:// pages: opening History/Downloads/Bookmarks/Settings again
    // jumps to the tab that already shows it instead of piling up duplicates.
    if (!isPrivate && targetUrl in INTERNAL_URL_TO_PAGE) {
      const wanted = INTERNAL_URL_TO_PAGE[targetUrl];
      for (const existing of this.tabs.values()) {
        if (!existing.isPrivate && existing.internalPage === wanted) {
          this.switchTab(existing.id);
          return this.getTabState(existing);
        }
      }
    }

    const tab: Tab = {
      id,
      view: null,
      isActive: false,
      isPrivate,
      isSleeping: false,
      lastKnownUrl: targetUrl,
      lastKnownTitle: 'New Tab',
      lastActiveAt: Date.now(),
      isPinned: false,
      isMuted: false,
      groupId: null,
      zoomFactor: 1,
      isNewTabPage: targetUrl === NEW_TAB_URL,
      internalPage: INTERNAL_URL_TO_PAGE[targetUrl] ?? null,
      faviconUrl: null,
    };
    this.tabs.set(id, tab);
    this.tabOrder.push(id);

    this.materialize(tab, targetUrl);
    this.switchTab(id);
    this.notifyTabsChanged();
    return this.getTabState(tab);
  }

  closeTab(id: string): void {
    const tab = this.tabs.get(id);
    if (!tab) return;

    if (!tab.isPrivate) {
      this.closedTabs.unshift({ url: tab.lastKnownUrl, title: tab.lastKnownTitle, isPinned: tab.isPinned });
      if (this.closedTabs.length > 20) this.closedTabs.pop();
    }

    if (tab.view) {
      if (tab.internalPage) this.untrustInternalPage(tab.view.webContents.id);
      this.win.contentView.removeChildView(tab.view);
      tab.view.webContents.close();
    }
    this.tabs.delete(id);
    this.tabOrder = this.tabOrder.filter((t) => t !== id);
    if (tab.groupId) {
      this.dropIfEmpty(tab.groupId);
      this.emitGroup(tab.groupId);
    }

    if (this.activeTabId === id) {
      this.activeTabId = null;
      const remaining = this.tabOrder;
      if (remaining.length > 0) {
        this.switchTab(remaining[remaining.length - 1]);
      }
    }
    this.notifyTabsChanged();
  }

  /** Ctrl/Cmd+Shift+T — reopens the most recently closed tab, restoring its pinned state. */
  reopenClosedTab(): TabState | null {
    const last = this.closedTabs.shift();
    if (!last) return null;
    const state = this.createTab(last.url);
    if (last.isPinned) this.togglePin(state.id);
    return this.getTabState(this.tabs.get(state.id)!);
  }

  duplicateTab(id: string): TabState | null {
    const tab = this.tabs.get(id);
    if (!tab) return null;
    return this.createTab(tab.lastKnownUrl, tab.isPrivate);
  }

  togglePin(id: string): void {
    const tab = this.tabs.get(id);
    if (!tab) return;
    tab.isPinned = !tab.isPinned;
    if (tab.isPinned && tab.groupId) this.setTabGroup(id, null);
    // Pinned tabs move to the front, mirroring standard browser behavior.
    if (tab.isPinned) {
      this.tabOrder = [id, ...this.tabOrder.filter((t) => t !== id)];
    }
    this.onStateChange(this.getTabState(tab));
    this.notifyTabsChanged();
  }

  toggleMute(id: string): void {
    const tab = this.tabs.get(id);
    if (!tab?.view) return;
    tab.isMuted = !tab.isMuted;
    tab.view.webContents.setAudioMuted(tab.isMuted);
    this.onStateChange(this.getTabState(tab));
  }

  reorderTabs(orderedIds: string[]): void {
    // Defensive: only accept a permutation of tabs we actually know about.
    const known = new Set(this.tabOrder);
    const filtered = orderedIds.filter((id) => known.has(id));
    if (filtered.length !== this.tabOrder.length) return;
    this.tabOrder = filtered;
    this.notifyTabsChanged();
  }

  // ---- Find in page ----
  findInPage(id: string, text: string, forward: boolean, onResult: (matches: number, activeMatchOrdinal: number) => void): void {
    const tab = this.tabs.get(id);
    if (!tab?.view || !text) return;
    const wc = tab.view.webContents;
    wc.removeAllListeners('found-in-page');
    wc.on('found-in-page', (_e, result) => onResult(result.matches, result.activeMatchOrdinal));
    wc.findInPage(text, { forward, findNext: false });
  }

  findNext(id: string, forward: boolean): void {
    const tab = this.tabs.get(id);
    tab?.view?.webContents.findInPage('', { forward, findNext: true });
  }

  stopFindInPage(id: string): void {
    const tab = this.tabs.get(id);
    tab?.view?.webContents.stopFindInPage('clearSelection');
  }

  // ---- Zoom ----
  zoomIn(id: string): void {
    this.setZoom(id, (factor) => Math.min(Math.round((factor + 0.1) * 100) / 100, 3));
  }
  zoomOut(id: string): void {
    this.setZoom(id, (factor) => Math.max(Math.round((factor - 0.1) * 100) / 100, 0.5));
  }
  zoomReset(id: string): void {
    this.setZoom(id, () => 1);
  }
  private setZoom(id: string, next: (current: number) => number): void {
    const tab = this.tabs.get(id);
    if (!tab?.view) return;
    tab.zoomFactor = next(tab.zoomFactor);
    tab.view.webContents.setZoomFactor(tab.zoomFactor);
    // Remember the level for this site (never from private tabs, never for DASH's own pages).
    const host = this.zoomHostOf(tab);
    if (host) getDatabase().setSiteZoom(host, tab.zoomFactor);
    this.onStateChange(this.getTabState(tab));
  }

  /** Re-reads each open tab's saved zoom (used after a site's zoom is reset from Settings). */
  applySavedZoomToOpenTabs(): void {
    for (const tab of this.tabs.values()) {
      const host = this.zoomHostOf(tab);
      if (!host || !tab.view) continue;
      const saved = getDatabase().getSiteZoom(host) ?? 1;
      tab.zoomFactor = saved;
      tab.view.webContents.setZoomFactor(saved);
      this.onStateChange(this.getTabState(tab));
    }
  }

  private zoomHostOf(tab: Tab): string | null {
    if (tab.isPrivate || tab.internalPage || tab.isNewTabPage || !tab.view) return null;
    try {
      const u = new URL(tab.view.webContents.getURL());
      return u.protocol === 'https:' || u.protocol === 'http:' ? u.hostname.replace(/^www\./, '') : null;
    } catch {
      return null;
    }
  }

  // ---- Page actions ----
  print(id: string): void {
    this.tabs.get(id)?.view?.webContents.print();
  }
  private async promptSavePage(id: string): Promise<void> {
    const tab = this.tabs.get(id);
    if (!tab?.view) return;
    const title = (tab.view.webContents.getTitle() || 'page').replace(/[\\/:*?"<>|]/g, '_');
    const result = await dialog.showSaveDialog(this.win, { defaultPath: `${title}.html`, filters: [{ name: 'Web page', extensions: ['html'] }] });
    if (!result.canceled && result.filePath) await this.savePage(id, result.filePath);
  }

  private async savePdfDialog(id: string): Promise<void> {
    const wc = this.tabs.get(id)?.view?.webContents;
    if (!wc) return;
    const title = (wc.getTitle() || 'page').replace(/[\\/:*?"<>|]/g, '_');
    const result = await dialog.showSaveDialog(this.win, { defaultPath: `${title}.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }] });
    if (!result.canceled && result.filePath) await this.savePdf(id, result.filePath);
  }

  async savePdf(id: string, savePath: string): Promise<void> {
    const wc = this.tabs.get(id)?.view?.webContents;
    if (!wc) return;
    const data = await wc.printToPDF({ printBackground: true });
    await fs.promises.writeFile(savePath, data);
  }

  /** The page, session and privacy mode of a tab, for the site panel. Null when the tab has no live page. */
  getSiteContext(id: string): { url: string; session: Session; isPrivate: boolean } | null {
    const tab = this.tabs.get(id);
    if (!tab?.view || tab.view.webContents.isDestroyed()) return null;
    return {
      url: failedUrlFromErrorPage(tab.view.webContents.getURL()) ?? tab.view.webContents.getURL(),
      session: tab.view.webContents.session,
      isPrivate: tab.isPrivate,
    };
  }

  /** Sleeping-tab numbers for Settings. freedKb is the renderer memory those tabs held at the moment they were put to sleep (an estimate: tabs of one site can share a process). */
  getSleepStats(): { sleeping: number; freedKb: number } {
    let sleeping = 0;
    for (const t of this.tabs.values()) if (t.isSleeping) sleeping++;
    return { sleeping, freedKb: this.freedKb };
  }

  /**
   * A tab's page process died (crash, out of memory, killed). Show a clear page with Try again instead of a blank view.
   * Returns false when the process did not belong to one of this window's tabs.
   */
  handleRenderProcessGone(webContentsId: number, details: { reason: string }): boolean {
    const tab = [...this.tabs.values()].find((t) => t.view && !t.view.webContents.isDestroyed() && t.view.webContents.id === webContentsId);
    if (!tab || !tab.view) return false;
    if (details.reason === 'clean-exit') return true;
    const wc = tab.view.webContents;
    appLog(`Tab process gone: reason=${details.reason} url=${tab.isPrivate ? '(private)' : wc.getURL().slice(0, 200)}`);
    const now = Date.now();
    tab.crashTimes = (tab.crashTimes ?? []).filter((t) => now - t < 30_000);
    tab.crashTimes.push(now);
    const looping = tab.crashTimes.length > 2;
    if (tab.crashTimes.length > 6) {
      appLog('Tab keeps crashing; not reloading it again');
      return true;
    }
    if (tab.internalPage && !looping) {
      this.loadInternalPage(tab.view, tab.internalPage, tab.id).catch(() => undefined);
    } else if (tab.isNewTabPage && !looping) {
      wc.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(this.newTabHtml())}`).catch(() => undefined);
    } else {
      const lastUrl = failedUrlFromErrorPage(wc.getURL()) ?? (tab.isPrivate ? '' : wc.getURL());
      const target = tab.internalPage || tab.isNewTabPage || !/^https?:/i.test(lastUrl) ? 'about:blank' : lastUrl;
      wc.loadURL(buildCrashPageDataUrl(target, details.reason, nativeTheme.shouldUseDarkColors)).catch(() => undefined);
    }
    return true;
  }

  private promptingUnresponsive = false;
  private async promptUnresponsive(tabId: string): Promise<void> {
    if (this.promptingUnresponsive) return;
    this.promptingUnresponsive = true;
    try {
      const { response } = await dialog.showMessageBox(this.win, {
        type: 'warning',
        message: 'This page is not responding',
        detail: 'You can wait for it to recover, or close the page.',
        buttons: ['Wait', 'Close page'],
        defaultId: 0,
        cancelId: 0,
      });
      if (response === 1) this.closeTab(tabId);
    } finally {
      this.promptingUnresponsive = false;
    }
  }

  async savePage(id: string, savePath: string): Promise<void> {
    await this.tabs.get(id)?.view?.webContents.savePage(savePath, 'HTMLComplete');
  }
  private newTabHtml(): string {
    const db = getDatabase();
    // Read from the database, not the cached copy: this also runs while a settings change is being applied.
    const settings = db.getAllSettings();
    return buildNewTabHtml(
      db.getShortcutSites(8),
      settings.searchEngine,
      db.countHiddenSites(),
      nativeTheme.shouldUseDarkColors,
      settings.newTabCustomCssEnabled ? settings.newTabCustomCss : '',
      settings.newTabCustomCss.trim().length > 0,
      recoverableCount()
    );
  }

  /** Re-renders every open New Tab Page (e.g. after the custom CSS changed). */
  refreshNewTabPages(): void {
    for (const tab of this.tabs.values()) {
      const wc = tab.view?.webContents;
      if (tab.isNewTabPage && wc && !wc.isDestroyed() && wc.getURL().startsWith('data:')) {
        wc.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(this.newTabHtml())}`).catch(() => undefined);
      }
    }
  }

  /** Toggles reading mode on a normal web page. Returns 'opened' | 'closed' | 'unreadable' | 'unsupported'. */
  async toggleReader(id: string): Promise<'opened' | 'closed' | 'unreadable' | 'unsupported'> {
    const tab = this.tabs.get(id);
    const wc = tab?.view?.webContents;
    if (!tab || !wc || tab.internalPage || !/^https?:/i.test(wc.getURL())) return 'unsupported';
    try {
      return (await wc.executeJavaScript(buildReaderScript(nativeTheme.shouldUseDarkColors), true)) as 'opened' | 'closed' | 'unreadable';
    } catch {
      return 'unreadable';
    }
  }

  toggleDevTools(id: string): void {
    const wc = this.tabs.get(id)?.view?.webContents;
    if (!wc) return;
    if (wc.isDevToolsOpened()) wc.closeDevTools();
    else wc.openDevTools({ mode: 'right' });
  }

  switchTab(id: string): void {
    const tab = this.tabs.get(id);
    if (!tab) return;

    // Detach previous view from the window and start its sleep clock.
    if (this.activeTabId && this.activeTabId !== id) {
      const prev = this.tabs.get(this.activeTabId);
      if (prev) {
        prev.isActive = false;
        prev.lastActiveAt = Date.now();
        if (prev.view) this.win.contentView.removeChildView(prev.view);
      }
    }

    if (tab.isSleeping) this.wake(tab);

    this.activeTabId = id;
    tab.isActive = true;
    this.attachActiveViewIfAllowed();
    this.layoutActiveView();
    this.onStateChange(this.getTabState(tab));
  }

  navigate(id: string, url: string): void {
    const tab = this.tabs.get(id);
    if (!tab) return;
    const normalized = this.normalizeUrl(url);

    if (tab.isSleeping) {
      this.wake(tab, normalized);
      return;
    }

    const targetNeedsFreshView = this.isInternalUrl(normalized);
    const currentlyHasPrivilegedPreload = tab.internalPage !== null;

    if (targetNeedsFreshView || currentlyHasPrivilegedPreload) {
      // Preload attachment only happens at WebContentsView construction
      // time, so any transition into OR out of an internal page needs a
      // fresh view. This matters in both directions: a plain loadURL can't
      // retroactively grant window.dash access when entering an internal
      // page, but — more importantly — it also can't retroactively REVOKE
      // that access when leaving one. Without this check, a tab that had
      // shown dash://history and then navigated to a real website would
      // keep the chrome preload attached to that untrusted page, handing
      // it genuine window.dash access (read saved passwords, close tabs,
      // etc.). This was a real bug, not a hypothetical one.
      if (tab.view) {
        if (tab.internalPage) this.untrustInternalPage(tab.view.webContents.id);
        this.win.contentView.removeChildView(tab.view);
        tab.view.webContents.close();
        tab.view = null;
      }
      this.materialize(tab, normalized);
      if (tab.isActive) this.attachActiveViewIfAllowed();
      this.layoutActiveView();
      return;
    }

    tab.view?.webContents.loadURL(normalized).catch((err) => {
      console.error(`[DASH] Navigation failed for ${normalized}:`, err.message);
    });
  }

  private isInternalUrl(url: string): boolean {
    return url === NEW_TAB_URL || url in INTERNAL_URL_TO_PAGE;
  }

  /** The Home button — deliberately separate from "new tab", matching Chrome/Firefox's own distinction. */
  goHome(id: string): void {
    this.navigate(id, this.getSettings().homepage);
  }

  goBack(id: string): void {
    const tab = this.tabs.get(id);
    if (tab?.view?.webContents.navigationHistory.canGoBack()) {
      tab.view.webContents.navigationHistory.goBack();
    }
  }

  goForward(id: string): void {
    const tab = this.tabs.get(id);
    if (tab?.view?.webContents.navigationHistory.canGoForward()) {
      tab.view.webContents.navigationHistory.goForward();
    }
  }

  reload(id: string): void {
    const tab = this.tabs.get(id);
    if (!tab) return;
    if (tab.isSleeping) this.wake(tab);
    else {
      const wc = tab.view?.webContents;
      const failed = wc ? failedUrlFromErrorPage(wc.getURL()) : null;
      if (failed) this.navigate(id, failed);
      else wc?.reload();
    }
  }

  stop(id: string): void {
    this.tabs.get(id)?.view?.webContents.stop();
  }

  getAllTabStates(): TabState[] {
    return this.tabOrder.map((id) => this.getTabState(this.tabs.get(id)!));
  }

  /** Reverse-lookup used to route a detected login (reported by Electron's webContentsId) back to our own tab id. */
  findTabIdByWebContentsId(webContentsId: number): string | null {
    for (const tab of this.tabs.values()) {
      if (tab.view?.webContents.id === webContentsId) return tab.id;
    }
    return null;
  }

  getTabTitle(id: string): string | null {
    const tab = this.tabs.get(id);
    if (!tab) return null;
    return tab.isNewTabPage ? 'New Tab' : tab.view?.webContents.getTitle() || tab.lastKnownTitle;
  }

  /** URLs of all non-private tabs, in tab order — used by main/index.ts for session persistence. */
  getRestorableUrls(): string[] {
    return this.tabOrder
      .map((id) => this.tabs.get(id)!)
      .filter((t) => !t.isPrivate)
      .map((t) => t.lastKnownUrl);
  }

  /**
   * Opens a chrome overlay. The native page view always paints above the
   * toolbar's DOM, so it has to be detached for the menu to be visible; to
   * keep the page from "vanishing", a snapshot is captured first and
   * returned so the toolbar can paint it in the page's place.
   */
  async pushOverlay(): Promise<string | null> {
    this.overlayDepth += 1;
    if (this.overlayDepth > 1) return this.overlaySnapshot;
    const tab = this.activeTabId ? this.tabs.get(this.activeTabId) : undefined;
    let snapshot: string | null = null;
    if (tab?.view) {
      try {
        const image = await tab.view.webContents.capturePage();
        if (!image.isEmpty()) snapshot = `data:image/jpeg;base64,${image.toJPEG(80).toString('base64')}`;
      } catch {
        snapshot = null;
      }
      if (this.overlayDepth > 0 && tab.view) this.win.contentView.removeChildView(tab.view);
    }
    this.overlaySnapshot = snapshot;
    return snapshot;
  }

  popOverlay(): void {
    this.overlayDepth = Math.max(0, this.overlayDepth - 1);
    if (this.overlayDepth === 0) {
      this.overlaySnapshot = null;
      this.attachActiveViewIfAllowed();
      this.layoutActiveView();
    }
  }

  private attachActiveViewIfAllowed(): void {
    if (this.overlayDepth > 0 || !this.activeTabId) return;
    const tab = this.tabs.get(this.activeTabId);
    if (tab?.view) this.win.contentView.addChildView(tab.view);
  }

  layoutActiveView(): void {
    if (!this.activeTabId) return;
    const tab = this.tabs.get(this.activeTabId);
    if (!tab?.view) return;
    const bounds = this.win.getContentBounds();
    const top = TOOLBAR_HEIGHT + (this.getSettings().showBookmarksBar ? BOOKMARKS_BAR_HEIGHT : 0);
    tab.view.setBounds({
      x: 0,
      y: top,
      width: bounds.width,
      height: Math.max(0, bounds.height - top),
    });
  }

  /** Tears down a background tab's renderer process to reclaim real memory. Never sleeps the active tab. */
  private sleepEligibleTabs(): void {
    if (!this.getSettings().sleepingTabsEnabled) return;
    const thresholdMs = SLEEP_THRESHOLD_MINUTES * 60_000;
    const now = Date.now();

    for (const tab of this.tabs.values()) {
      if (tab.isActive || tab.isSleeping || !tab.view) continue;
      if (now - tab.lastActiveAt < thresholdMs) continue;
      const never = parseHostList(this.getSettings().neverSleepHosts);
      if (never.length > 0) {
        let host = '';
        try {
          host = new URL(tab.lastKnownUrl || tab.view.webContents.getURL()).hostname;
        } catch {
          /* internal page */
        }
        if (host && hostInList(host, never)) continue;
      }
      this.sleep(tab);
    }
  }

  private sleep(tab: Tab): void {
    if (!tab.view) return;
    // Cache what the tab strip needs before we destroy the renderer. Never
    // overwrite with the raw data: URL or the internal file:// path — keep
    // the clean sentinel so waking this tab later regenerates a fresh page
    // instead of trying to reload a meaningless internal file path.
    if (!tab.isNewTabPage && !tab.internalPage) {
      tab.lastKnownUrl = failedUrlFromErrorPage(tab.view.webContents.getURL()) ?? (tab.view.webContents.getURL() || tab.lastKnownUrl);
      tab.lastKnownTitle = tab.view.webContents.getTitle() || tab.lastKnownTitle;
    }

    if (tab.internalPage) this.untrustInternalPage(tab.view.webContents.id);
    try {
      const pid = tab.view.webContents.getOSProcessId();
      // Only count memory that really goes away: skip if another live tab shares this renderer process.
      const shared = [...this.tabs.values()].some((t) => t !== tab && t.view && !t.view.webContents.isDestroyed() && t.view.webContents.getOSProcessId() === pid);
      const m = shared ? undefined : app.getAppMetrics().find((x) => x.pid === pid);
      if (m) this.freedKb += m.memory.workingSetSize;
    } catch {
      /* metrics unavailable: skip the estimate */
    }
    this.win.contentView.removeChildView(tab.view);
    tab.view.webContents.close();
    tab.view = null;
    tab.isSleeping = true;
    this.onStateChange(this.getTabState(tab));
  }

  /** Recreates a sleeping tab's real WebContentsView on demand, restoring its last URL. */
  private wake(tab: Tab, overrideUrl?: string): void {
    const url = overrideUrl ?? tab.lastKnownUrl;
    this.materialize(tab, url);
    tab.isSleeping = false;
    tab.lastActiveAt = Date.now();
  }

  private materialize(tab: Tab, url: string): void {
    const internalPage = INTERNAL_URL_TO_PAGE[url] ?? null;

    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        // Enables Chromium's built-in PDF viewer.
        plugins: true,
        // Private tabs get a dedicated in-memory session that shares nothing
        // with the normal profile; normal tabs use the persistent default.
        session: tab.isPrivate ? this.privateSession : session.defaultSession,
        // Internal pages (History/Downloads/Bookmarks/Settings) are our own
        // bundled, trusted content — same preload as the chrome window
        // itself, so they get real window.dash access. Ordinary web
        // content NEVER gets a preload at all; this is the one deliberate
        // exception, and it's scoped to exactly four known sentinel URLs,
        // never to anything a page could redirect itself into.
        ...(internalPage ? { preload: this.internalPagePreloadPath } : {}),
      },
    });
    tab.view = view;
    tab.isNewTabPage = url === NEW_TAB_URL;
    tab.internalPage = internalPage;
    this.wireEvents(tab);
    view.webContents.setZoomFactor(tab.zoomFactor);
    view.webContents.setAudioMuted(tab.isMuted);
    this.wirePopupHandling(view, tab);
    this.wireContextMenu(view, tab);

    if (tab.isNewTabPage) {
      // Real top sites, computed fresh every time the New Tab Page opens —
      // never stale placeholder data. No preload/IPC bridge needed at all:
      // it's a self-contained document with real <a href> links and a real
      // <form> for search, so ordinary navigation handles everything.
      const html = this.newTabHtml();
      view.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch((err) => {
        console.error('[DASH] Failed to load New Tab Page:', err.message);
      });
      return;
    }

    if (internalPage) {
      this.trustInternalPage(view.webContents);
      this.loadInternalPage(view, internalPage, tab.id).catch((err) => {
        console.error(`[DASH] Failed to load internal page ${internalPage}:`, err.message);
      });
      return;
    }

    view.webContents.loadURL(url).catch((err) => {
      console.error(`[DASH] Failed to load ${url}:`, err.message);
    });
  }

  /**
   * Lets real popup-based flows (OAuth logins like "Continue with
   * Facebook" or Google Sign-In, print previews, etc.) actually work.
   * Electron denies every window.open() call by default unless a handler
   * explicitly allows it — with no handler at all, clicking "Login with
   * Facebook" does genuinely nothing, which is exactly the bug this fixes.
   *
   * The popup gets the SAME session as its opening tab (critical: a
   * Facebook login popup needs to see the same cookies as the Facebook
   * session the user is already logged into in this browser, and a
   * private tab's popup must stay in that private tab's isolated session,
   * never leak into the normal one).
   *
   * Honest limitation: this allows ALL popups, the same way a browser with
   * its popup blocker turned off would. Reliably distinguishing a
   * legitimate auth flow from a spammy ad popup needs knowing whether the
   * request came from a real user gesture, which Electron doesn't expose
   * here strongly enough to build a trustworthy heuristic without risking
   * breaking real logins again. In practice the domain-level ad/tracker
   * blocklist (RequestBlocker) stops most junk popups already, since their
   * triggering scripts get blocked before they can even call window.open().
   */
  private wirePopupHandling(view: WebContentsView, tab: Tab): void {
    view.webContents.setWindowOpenHandler((details) => {
      // Ordinary target=_blank links and Ctrl/middle-click open as real tabs.
      // window.open() with features (OAuth sign-in etc.) stays a popup that
      // shares this tab's session.
      if (
        (details.disposition === 'foreground-tab' || details.disposition === 'background-tab') &&
        /^https?:/i.test(details.url)
      ) {
        const previous = this.activeTabId;
        setImmediate(() => {
          this.createTab(details.url, tab.isPrivate);
          if (details.disposition === 'background-tab' && previous && this.tabs.has(previous)) {
            this.switchTab(previous);
          }
        });
        return { action: 'deny' };
      }
      return this.popupWindowOptions(view);
    });

    view.webContents.on('did-create-window', (childWindow) => {
      childWindow.setMenuBarVisibility(false);
    });
  }

  private popupWindowOptions(view: WebContentsView): {
    action: 'allow';
    overrideBrowserWindowOptions: Electron.BrowserWindowConstructorOptions;
  } {
    return ({
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: 500,
        height: 650,
        autoHideMenuBar: true,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          session: view.webContents.session,
        },
      },
    });
  }

  /**
   * Fills a saved login into the page's top-level frame only (never iframes),
   * and only for a credential saved for this exact origin. Needs a visible
   * password field; the username goes into the closest preceding text/email
   * field. Runs after load and again after in-page route changes via the
   * same did-stop-loading hook. The page's own scripts can read what we fill,
   * the same exposure as Chrome/Firefox autofill.
   */
  private tryAutofill(wc: Electron.WebContents): void {
    let origin: string;
    try {
      origin = new URL(wc.getURL()).origin;
    } catch {
      return;
    }
    if (!/^https?:\/\//i.test(origin)) return;
    const cred = this.findCredentials(origin);
    if (!cred) return;
    this.fillLogin(wc, cred, false);
  }

  /** Fills a login form. `force` also overwrites a field that already has text (an explicit pick from the menu). */
  private fillLogin(wc: Electron.WebContents, cred: { username: string; password: string }, force: boolean): void {
    const script = `(() => {
      const cred = ${JSON.stringify(cred)};
      const force = ${force ? 'true' : 'false'};
      const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
      const active = document.activeElement;
      const pw = (active && active.type === 'password' && visible(active) ? active : null)
        || Array.from(document.querySelectorAll('input[type=password]')).find((el) => visible(el) && (force || !el.value));
      if (!pw) return false;
      const set = (el, v) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const scope = pw.form || document;
      const fields = Array.from(scope.querySelectorAll('input')).filter((el) => visible(el) && ['text', 'email', 'tel', ''].includes(el.type));
      let user = null;
      for (const f of fields) { if (f.compareDocumentPosition(pw) & Node.DOCUMENT_POSITION_FOLLOWING) user = f; }
      if (user && (force || !user.value)) set(user, cred.username);
      set(pw, cred.password);
      return true;
    })()`;
    wc.executeJavaScript(script, false).catch(() => undefined);
  }

  /** Puts a generated password in the focused password field and in empty password fields beside it (a "confirm" box). */
  private fillGenerated(wc: Electron.WebContents, password: string): void {
    const script = `(() => {
      const pwd = ${JSON.stringify(password)};
      const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
      const set = (el, v) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const active = document.activeElement;
      if (!active || active.type !== 'password') return false;
      set(active, pwd);
      const scope = active.form || document;
      for (const el of scope.querySelectorAll('input[type=password]')) if (el !== active && visible(el) && !el.value) set(el, pwd);
      return true;
    })()`;
    wc.executeJavaScript(script, false).catch(() => undefined);
  }

  /** Right-click menu for web pages: link, image, selection, editing and page actions. */
  private wireContextMenu(view: WebContentsView, tab: Tab): void {
    const wc = view.webContents;
    wc.on('context-menu', (_event, params) => {
      if (tab.internalPage) return;
      const items: Electron.MenuItemConstructorOptions[] = [];
      const open = (url: string): void => {
        if (/^https?:/i.test(url)) this.createTab(url, tab.isPrivate);
      };

      // Password field: pick a saved login (never in private tabs) or fill a strong generated password.
      if (params.formControlType === 'input-password' && !tab.isPrivate) {
        let pageOrigin = '';
        try {
          pageOrigin = new URL(wc.getURL()).origin;
        } catch {
          /* no page origin */
        }
        if (/^https?:/i.test(pageOrigin)) {
          const logins = this.findAllCredentials(pageOrigin);
          for (const l of logins) {
            items.push({ label: `Fill login: ${l.username || '(no username)'}`, click: () => this.fillLogin(wc, l, true) });
          }
          items.push({ label: 'Use a strong password', click: () => this.fillGenerated(wc, this.generatePassword()) }, { type: 'separator' });
        }
      }

      if (params.linkURL) {
        items.push(
          { label: 'Open link in new tab', click: () => open(params.linkURL) },
          { label: 'Copy link address', click: () => clipboard.writeText(params.linkURL) },
          { type: 'separator' }
        );
      }
      if (params.mediaType === 'image' && params.srcURL) {
        items.push(
          { label: 'Open image in new tab', click: () => open(params.srcURL) },
          { label: 'Copy image address', click: () => clipboard.writeText(params.srcURL) },
          { label: 'Save image as…', click: () => wc.downloadURL(params.srcURL) },
          { type: 'separator' }
        );
      }
      if (params.misspelledWord) {
        for (const s of params.dictionarySuggestions.slice(0, 5)) {
          items.push({ label: s, click: () => wc.replaceMisspelling(s) });
        }
        if (params.dictionarySuggestions.length) items.push({ type: 'separator' });
      }
      if (params.isEditable) {
        items.push(
          { label: 'Undo', role: 'undo' },
          { label: 'Redo', role: 'redo' },
          { type: 'separator' },
          { label: 'Cut', role: 'cut' },
          { label: 'Copy', role: 'copy' },
          { label: 'Paste', role: 'paste' },
          { label: 'Select all', role: 'selectAll' }
        );
      } else if (params.selectionText) {
        const q = params.selectionText.trim();
        const short = q.length > 24 ? q.slice(0, 23) + '…' : q;
        items.push(
          { label: 'Copy', role: 'copy' },
          { label: `Search for “${short}”`, click: () => open(this.normalizeUrl(q)) }
        );
      } else if (!params.linkURL && params.mediaType !== 'image') {
        items.push(
          { label: 'Back', enabled: wc.navigationHistory.canGoBack(), click: () => wc.navigationHistory.goBack() },
          { label: 'Forward', enabled: wc.navigationHistory.canGoForward(), click: () => wc.navigationHistory.goForward() },
          { label: 'Reload', click: () => wc.reload() },
          { type: 'separator' },
          { label: 'Save page as…', click: () => { void this.promptSavePage(tab.id); } },
          { label: 'Print…', click: () => this.print(tab.id) },
          { label: 'Save as PDF…', click: () => { void this.savePdfDialog(tab.id); } }
        );
      }
      items.push(
        { type: 'separator' },
        { label: 'Inspect', click: () => wc.inspectElement(params.x, params.y) }
      );
      Menu.buildFromTemplate(items).popup({ window: this.win });
    });
  }

  /** Delegates to the platform-independent resolver in @dash/browser-core — Electron owns none of this logic. */
  private normalizeUrl(input: string): string {
    return resolveAddressBarInput(input, this.getSettings().searchEngine);
  }

  private wireEvents(tab: Tab): void {
    const wc = tab.view!.webContents;

    const push = () => this.onStateChange(this.getTabState(tab));

    // Browser shortcuts must work while the page has focus.
    wc.on('before-input-event', (event, input) => {
      if (!isBrowserShortcut(input)) return;
      event.preventDefault();
      this.win.webContents.send(IPC.SHORTCUT_KEY, {
        key: input.key,
        ctrlKey: input.control,
        metaKey: input.meta,
        shiftKey: input.shift,
        altKey: input.alt,
      });
    });

    wc.on('unresponsive', () => {
      void this.promptUnresponsive(tab.id);
    });
    wc.on('will-navigate', (event, targetUrl) => {
      if (tab.isNewTabPage && targetUrl.startsWith(NEWTAB_ACTION_PREFIX)) {
        event.preventDefault();
        try {
          const u = new URL(targetUrl);
          const db = getDatabase();
          if (u.pathname === '/remove') {
            const host = u.searchParams.get('host');
            if (host && host.length < 256) {
              db.removeCustomShortcut(host);
              db.hideSite(host);
            }
          } else if (u.pathname === '/add') {
            const url = u.searchParams.get('url') ?? '';
            if (url.length < 2048) db.addCustomShortcut(url, u.searchParams.get('title') ?? '');
          } else if (u.pathname === '/restore') {
            db.restoreHiddenSites();
          } else if (u.pathname === '/restore-session') {
            for (const url of takeRecoverable()) this.createTab(url);
          } else if (u.pathname === '/dismiss-session') {
            dismissRecoverable();
          } else if (u.pathname === '/theme') {
            // Classic / Custom switch on the home page itself.
            db.setSetting('newTabCustomCssEnabled', u.searchParams.get('mode') === 'custom');
          }
        } catch {
          /* malformed action URL: ignore */
        }
        setImmediate(() => {
          const html = this.newTabHtml();
          wc.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch(() => undefined);
        });
        return;
      }
      if (this.isInternalUrl(targetUrl)) {
        event.preventDefault();
        // Deferred: navigate() may tear down and replace this exact
        // webContents (needed to attach the internal-page preload), which
        // is unsafe to do synchronously from within one of that same
        // webContents' own event handlers.
        setImmediate(() => this.navigate(tab.id, targetUrl));
      }
    });

    wc.on('did-start-loading', () => {
      this.tracker.resetTabCount(wc.id);
      push();
    });
    wc.on('did-stop-loading', () => {
      push();
      if (!tab.isPrivate && !tab.internalPage && !tab.isNewTabPage) this.tryAutofill(wc);
      // Record real history — but NEVER for private tabs. This is a hard
      // privacy rule, not a UI toggle: private browsing must leave no trace.
      if (!tab.isPrivate && !tab.internalPage) {
        const url = wc.getURL();
        const title = wc.getTitle();
        if (url && !url.startsWith('data:')) getDatabase().addHistoryEntry(url, title || url, tab.faviconUrl);
      }
    });
    wc.on('page-title-updated', push);

    // A failed top-level load would otherwise leave a blank white page.
    wc.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame || errorCode === -3 /* ERR_ABORTED: user stop, download, redirect */) return;
      if (!/^https?:|^ftp:/i.test(validatedURL)) return;
      wc.loadURL(buildErrorPageDataUrl(validatedURL, errorCode, errorDescription, nativeTheme.shouldUseDarkColors)).catch(() => undefined);
    });
    wc.on('will-navigate', (event, targetUrl) => {
      if (targetUrl === NEW_TAB_URL && failedUrlFromErrorPage(wc.getURL())) {
        event.preventDefault();
        this.navigate(tab.id, NEW_TAB_URL);
        return;
      }
      if (!targetUrl.startsWith(RETRY_PREFIX)) return;
      event.preventDefault();
      try {
        const retryUrl = new URL(targetUrl).searchParams.get('url') ?? '';
        if (/^https?:/i.test(retryUrl)) this.navigate(tab.id, retryUrl);
      } catch {
        /* malformed retry link: ignore */
      }
    });
    wc.on('page-favicon-updated', (_e, favicons) => {
      // Straight from the page's own <link rel="icon"> — same-origin, no
      // third-party favicon service involved, unlike Chrome's default
      // favicon fetcher (which leaks your browsing to Google's servers).
      tab.faviconUrl = favicons[0] ?? null;
      if (tab.faviconUrl && !tab.isPrivate && !tab.internalPage && !tab.isNewTabPage) {
        const pageUrl = wc.getURL();
        if (pageUrl) getDatabase().setLatestHistoryFavicon(pageUrl, tab.faviconUrl);
      }
      push();
    });
    wc.on('did-navigate', (_e, navigatedUrl) => {
      // A real navigation away from the New Tab Page (clicked a top site,
      // submitted the search form) — stop treating this tab as the New Tab
      // Page from here on, same way any other tab behaves. (No equivalent
      // check is needed for internal pages: materialize() already sets
      // tab.internalPage correctly on every real transition, since
      // navigate() now always tears down and rebuilds the view whenever
      // switching into or out of one — see navigate()'s comments.)
      if (tab.isNewTabPage && !navigatedUrl.startsWith('data:')) tab.isNewTabPage = false;
      tab.faviconUrl = null; // clear the old site's icon until the new page reports its own
      // Apply the zoom saved for this site (or 1 when none) so it survives restarts and new tabs.
      const host = this.zoomHostOf(tab);
      if (host) {
        const saved = getDatabase().getSiteZoom(host) ?? 1;
        if (saved !== tab.zoomFactor) {
          tab.zoomFactor = saved;
          wc.setZoomFactor(saved);
        }
      }
      push();
    });
    wc.on('did-navigate-in-page', push);
  }

  private getTabState(tab: Tab): TabState {
    const wc = tab.view?.webContents;
    if (tab.isNewTabPage) {
      return {
        id: tab.id,
        title: 'New Tab',
        url: NEW_TAB_URL,
        isLoading: false,
        canGoBack: wc ? wc.navigationHistory.canGoBack() : false,
        canGoForward: false,
        favicon: LOGO_FAVICON_DATA_URI,
        isActive: tab.isActive,
        isPrivate: tab.isPrivate,
        isSleeping: tab.isSleeping,
        blockedCount: 0,
        isPinned: tab.isPinned,
        isMuted: tab.isMuted,
        zoomPercent: Math.round(tab.zoomFactor * 100),
        group: this.groupOf(tab),
      };
    }
    if (tab.internalPage) {
      const titles: Record<InternalPageId, string> = {
        history: 'History',
        downloads: 'Downloads',
        bookmarks: 'Bookmarks',
        settings: 'Settings',
      };
      return {
        id: tab.id,
        title: titles[tab.internalPage],
        url: INTERNAL_PAGE_URLS[tab.internalPage],
        isLoading: wc ? wc.isLoading() : false,
        canGoBack: wc ? wc.navigationHistory.canGoBack() : false,
        canGoForward: wc ? wc.navigationHistory.canGoForward() : false,
        favicon: LOGO_FAVICON_DATA_URI,
        isActive: tab.isActive,
        isPrivate: tab.isPrivate,
        isSleeping: tab.isSleeping,
        blockedCount: 0,
        isPinned: tab.isPinned,
        isMuted: tab.isMuted,
        zoomPercent: Math.round(tab.zoomFactor * 100),
        group: this.groupOf(tab),
      };
    }
    const failedUrl = wc ? failedUrlFromErrorPage(wc.getURL()) : null;
    return {
      id: tab.id,
      title: wc ? wc.getTitle() || wc.getURL() || 'New Tab' : tab.lastKnownTitle,
      url: failedUrl ?? (wc ? wc.getURL() : tab.lastKnownUrl),
      isLoading: wc ? wc.isLoading() : false,
      canGoBack: wc ? wc.navigationHistory.canGoBack() : false,
      canGoForward: wc ? wc.navigationHistory.canGoForward() : false,
      favicon: tab.faviconUrl ?? (tab.isNewTabPage || tab.internalPage ? LOGO_FAVICON_DATA_URI : null),
      isActive: tab.isActive,
      isPrivate: tab.isPrivate,
      isSleeping: tab.isSleeping,
      blockedCount: wc ? this.tracker.getTabCount(wc.id) : 0,
      isPinned: tab.isPinned,
      isMuted: tab.isMuted,
      zoomPercent: Math.round(tab.zoomFactor * 100),
      group: this.groupOf(tab),
    };
  }

  // ---- Tab groups (session-only) ----
  private groupOf(tab: Tab): TabGroup | null {
    return tab.groupId ? (this.groups.get(tab.groupId) ?? null) : null;
  }

  private emitGroup(groupId: string | null): void {
    for (const t of this.tabs.values()) {
      if (groupId && t.groupId === groupId) this.onStateChange(this.getTabState(t));
    }
    this.win.webContents.send(IPC.TABS_ORDER, this.tabOrder);
    this.notifyTabsChanged();
  }

  /** target: 'new' makes a fresh group, a group id joins it, null removes the tab from its group. */
  setTabGroup(id: string, target: string | null): void {
    const tab = this.tabs.get(id);
    if (!tab) return;
    const previous = tab.groupId;
    if (target === null) {
      tab.groupId = null;
    } else {
      if (tab.isPinned) return; // pinned tabs stay out of groups
      let gid = target;
      if (target === 'new') {
        gid = randomUUID();
        const color = TAB_GROUP_COLORS[this.groups.size % TAB_GROUP_COLORS.length];
        this.groups.set(gid, { id: gid, name: '', color, collapsed: false });
      } else if (!this.groups.has(gid)) {
        return;
      }
      tab.groupId = gid;
      // Keep a group's tabs contiguous: park this tab right after the group's last member.
      const others = this.tabOrder.filter((t) => t !== id);
      let last = -1;
      others.forEach((t, i) => {
        if (this.tabs.get(t)?.groupId === gid) last = i;
      });
      if (last >= 0) {
        others.splice(last + 1, 0, id);
        this.tabOrder = others;
      }
    }
    this.onStateChange(this.getTabState(tab));
    this.dropIfEmpty(previous);
    this.emitGroup(tab.groupId);
    if (previous && previous !== tab.groupId) this.emitGroup(previous);
  }

  private dropIfEmpty(groupId: string | null): void {
    if (!groupId) return;
    for (const t of this.tabs.values()) if (t.groupId === groupId) return;
    this.groups.delete(groupId);
  }

  updateGroup(groupId: string, patch: { name?: string; color?: string; collapsed?: boolean }): void {
    const g = this.groups.get(groupId);
    if (!g) return;
    if (patch.name !== undefined) g.name = patch.name.slice(0, 40);
    if (patch.color !== undefined && (TAB_GROUP_COLORS as readonly string[]).includes(patch.color)) {
      g.color = patch.color as TabGroupColor;
    }
    if (patch.collapsed !== undefined) g.collapsed = patch.collapsed;
    this.emitGroup(groupId);
  }

  closeGroup(groupId: string): void {
    const ids = [...this.tabs.values()].filter((t) => t.groupId === groupId).map((t) => t.id);
    for (const id of ids) this.closeTab(id);
  }
}
