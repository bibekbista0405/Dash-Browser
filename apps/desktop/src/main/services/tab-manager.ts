import { BrowserWindow, WebContentsView, session, type Session } from 'electron';
import { randomUUID } from 'node:crypto';
import type { TabState, DashSettings } from '../../shared/ipc-channels';
import { SLEEP_THRESHOLD_MINUTES, resolveAddressBarInput } from '../../shared/ipc-channels';
import { getDatabase } from '../db/database';
import type { BlockedCountTracker } from './blocked-count-tracker';
import { buildNewTabHtml } from './new-tab-page';

/** Sentinel URL representing DASH's own New Tab Page — never a real network address. */
export const NEW_TAB_URL = 'dash://newtab';

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
  zoomFactor: number;
  /** True while showing DASH's own New Tab Page (a data: URL under the hood — this flag is what lets the UI show the clean sentinel instead). */
  isNewTabPage: boolean;
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
  private onStateChange: (state: TabState) => void;
  private getSettings: () => DashSettings;
  private sleepTimer: ReturnType<typeof setInterval>;
  /** Most-recently-closed first. Private tabs are never pushed here — closing one should leave no trace. */
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
    private loadInternalPage: (view: WebContentsView, page: InternalPageId, tabId: string) => Promise<void>
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
      this.win.contentView.removeChildView(tab.view);
      tab.view.webContents.close();
    }
    this.tabs.delete(id);
    this.tabOrder = this.tabOrder.filter((t) => t !== id);

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
    this.onStateChange(this.getTabState(tab));
  }

  // ---- Page actions ----
  print(id: string): void {
    this.tabs.get(id)?.view?.webContents.print();
  }
  async savePage(id: string, savePath: string): Promise<void> {
    await this.tabs.get(id)?.view?.webContents.savePage(savePath, 'HTMLComplete');
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
    if (tab.view) this.win.contentView.addChildView(tab.view);
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

    if (this.isInternalUrl(normalized)) {
      // Preload attachment only happens at WebContentsView construction
      // time, so switching into (or between) internal pages needs a fresh
      // view — a plain loadURL can't retroactively grant window.dash
      // access, and "dash://…" isn't a real registered protocol a plain
      // loadURL could resolve anyway.
      if (tab.view) {
        this.win.contentView.removeChildView(tab.view);
        tab.view.webContents.close();
        tab.view = null;
      }
      this.materialize(tab, normalized);
      if (tab.isActive && tab.view) this.win.contentView.addChildView(tab.view);
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
    else tab.view?.webContents.reload();
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

  layoutActiveView(): void {
    if (!this.activeTabId) return;
    const tab = this.tabs.get(this.activeTabId);
    if (!tab?.view) return;
    const bounds = this.win.getContentBounds();
    tab.view.setBounds({
      x: 0,
      y: TOOLBAR_HEIGHT,
      width: bounds.width,
      height: bounds.height - TOOLBAR_HEIGHT,
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
      tab.lastKnownUrl = tab.view.webContents.getURL() || tab.lastKnownUrl;
      tab.lastKnownTitle = tab.view.webContents.getTitle() || tab.lastKnownTitle;
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
    this.wirePopupHandling(view);

    if (tab.isNewTabPage) {
      // Real top sites, computed fresh every time the New Tab Page opens —
      // never stale placeholder data. No preload/IPC bridge needed at all:
      // it's a self-contained document with real <a href> links and a real
      // <form> for search, so ordinary navigation handles everything.
      const topSites = getDatabase().getTopSites(8);
      const html = buildNewTabHtml(topSites, this.getSettings().searchEngine);
      view.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch((err) => {
        console.error('[DASH] Failed to load New Tab Page:', err.message);
      });
      return;
    }

    if (internalPage) {
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
  private wirePopupHandling(view: WebContentsView): void {
    view.webContents.setWindowOpenHandler(() => ({
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
    }));

    view.webContents.on('did-create-window', (childWindow) => {
      childWindow.setMenuBarVisibility(false);
    });
  }

  /** Delegates to the platform-independent resolver in @dash/browser-core — Electron owns none of this logic. */
  private normalizeUrl(input: string): string {
    return resolveAddressBarInput(input, this.getSettings().searchEngine);
  }

  private wireEvents(tab: Tab): void {
    const wc = tab.view!.webContents;

    const push = () => this.onStateChange(this.getTabState(tab));

    wc.on('will-navigate', (event, targetUrl) => {
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
      // Record real history — but NEVER for private tabs. This is a hard
      // privacy rule, not a UI toggle: private browsing must leave no trace.
      if (!tab.isPrivate) {
        const url = wc.getURL();
        const title = wc.getTitle();
        if (url) getDatabase().addHistoryEntry(url, title || url, tab.faviconUrl);
      }
    });
    wc.on('page-title-updated', push);
    wc.on('page-favicon-updated', (_e, favicons) => {
      // Straight from the page's own <link rel="icon"> — same-origin, no
      // third-party favicon service involved, unlike Chrome's default
      // favicon fetcher (which leaks your browsing to Google's servers).
      tab.faviconUrl = favicons[0] ?? null;
      push();
    });
    wc.on('did-navigate', (_e, navigatedUrl) => {
      // A real navigation away from the New Tab Page (clicked a top site,
      // submitted the search form) — stop treating this tab as the New Tab
      // Page from here on, same way any other tab behaves.
      if (tab.isNewTabPage && !navigatedUrl.startsWith('data:')) tab.isNewTabPage = false;
      // Same idea for internal pages reached via a fresh materialize() —
      // real ones are file:// loads, so anything else means the user
      // navigated away (typed a URL, clicked an actual external link).
      if (tab.internalPage && !navigatedUrl.startsWith('file://')) tab.internalPage = null;
      tab.faviconUrl = null; // clear the old site's icon until the new page reports its own
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
        favicon: null, // deliberately no favicon on our own New Tab Page
        isActive: tab.isActive,
        isPrivate: tab.isPrivate,
        isSleeping: tab.isSleeping,
        blockedCount: 0,
        isPinned: tab.isPinned,
        isMuted: tab.isMuted,
        zoomPercent: Math.round(tab.zoomFactor * 100),
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
        favicon: null,
        isActive: tab.isActive,
        isPrivate: tab.isPrivate,
        isSleeping: tab.isSleeping,
        blockedCount: 0,
        isPinned: tab.isPinned,
        isMuted: tab.isMuted,
        zoomPercent: Math.round(tab.zoomFactor * 100),
      };
    }
    return {
      id: tab.id,
      title: wc ? wc.getTitle() || wc.getURL() || 'New Tab' : tab.lastKnownTitle,
      url: wc ? wc.getURL() : tab.lastKnownUrl,
      isLoading: wc ? wc.isLoading() : false,
      canGoBack: wc ? wc.navigationHistory.canGoBack() : false,
      canGoForward: wc ? wc.navigationHistory.canGoForward() : false,
      favicon: tab.faviconUrl,
      isActive: tab.isActive,
      isPrivate: tab.isPrivate,
      isSleeping: tab.isSleeping,
      blockedCount: wc ? this.tracker.getTabCount(wc.id) : 0,
      isPinned: tab.isPinned,
      isMuted: tab.isMuted,
      zoomPercent: Math.round(tab.zoomFactor * 100),
    };
  }
}
