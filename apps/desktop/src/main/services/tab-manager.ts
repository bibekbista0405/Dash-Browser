import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  app,
  BrowserWindow,
  Menu,
  dialog,
  nativeTheme,
  WebContentsView,
  clipboard,
  net,
  session,
  type Session,
  type Rectangle,
} from 'electron';
import { randomUUID } from 'node:crypto';
import type {
  TabState,
  DashSettings,
  TabGroup,
  TabGroupColor,
  ContainerInfo,
  SidePanelKind,
  LayoutDivider,
  SplitLayout,
  OverlaySnapshot,
} from '../../shared/ipc-channels';
import { IPC } from '../../shared/ipc-channels';
import {
  TAB_GROUP_COLORS,
  SLEEP_THRESHOLD_MINUTES,
  resolveAddressBarInput,
  NEW_TAB_URL,
  BOOKMARKS_BAR_HEIGHT,
  VERTICAL_TABS_WIDTH,
  VERTICAL_TABS_WIDTH_COLLAPSED,
  parseHostList,
  hostInList,
} from '../../shared/ipc-channels';
import { getDatabase } from '../db/database';
import { buildReaderScript } from './reader-mode';
import type { BlockedCountTracker } from './blocked-count-tracker';
import { isBrowserShortcut } from './shortcut-filter';
import type { SessionLayout } from '../db/database';
import {
  buildNewTabHtml,
  buildPrivateNewTabHtml,
  buildSplitPickerHtml,
  NEWTAB_ACTION_PREFIX,
  NEWTAB_SUGGEST_PREFIX,
} from './new-tab-page';
import { fetchWebSuggestions } from './search-suggestions';
import { getWebsiteLock } from './website-lock';
import type { PrivateVpnOutcome } from './new-tab-page';
import { dismissRecoverable, recoverableCount, takeRecoverable } from './session-recovery';
import { appLog } from './app-log';
import { LOGO_FAVICON_DATA_URI } from './logo-data';
import {
  detectWebApp,
  installedIdFor,
  installWebApp,
  type WebAppDetails,
  type InstallResult,
} from './web-apps';
import {
  buildErrorPageDataUrl,
  failedUrlFromErrorPage,
  RETRY_PREFIX,
  PROXYFIX_PREFIX,
  buildCrashPageDataUrl,
} from './error-page';

let directNetworkHook: () => Promise<void> = async () => undefined;
export function setDirectNetworkHook(fn: () => Promise<void>): void {
  directNetworkHook = fn;
}

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
  welcome: 'dash://welcome',
  notes: 'dash://notes',
  archive: 'dash://archive',
  ai: 'dash://ai',
  lock: 'dash://lock',
  websitelock: 'dash://website-lock',
} as const;
export type InternalPageId = keyof typeof INTERNAL_PAGE_URLS;
const INTERNAL_URL_TO_PAGE: Record<string, InternalPageId> = Object.fromEntries(
  Object.entries(INTERNAL_PAGE_URLS).map(([id, url]) => [url, id])
) as Record<string, InternalPageId>;

let appLockProbe: () => boolean = () => false;
/** App Lock's "is DASH locked right now?", set once at startup. */
export function setAppLockProbe(fn: () => boolean): void {
  appLockProbe = fn;
}

const SPLIT_GAP = 14; // space between the two panes of a split view
const SPLIT_PAD = 8; // frame space around the panes
const SPLIT_FOOT = 36; // strip under the panes for each pane's tab chip
const SPLIT_RADIUS = 10;
const PANE_GAP = 6; // draggable strip between page and side panel / DevTools
const DEFAULT_PANEL_SHARE = 0.32;
const DEFAULT_DEVTOOLS_SHARE = 0.4; // px between the two panes of a split view
const TOOLBAR_HEIGHT = 84; // px reserved at top of window for tab strip + address bar
const SLEEP_CHECK_INTERVAL_MS = 60_000;

interface Tab {
  id: string;
  /** Set while the loaded page is an installable web app. */
  webApp?: WebAppDetails | null;
  /** Null while the tab is asleep — its renderer process has been torn down. */
  view: WebContentsView | null;
  isActive: boolean;
  isPrivate: boolean;
  /** Container (separate cookie jar) this tab runs in; null = normal profile. */
  containerId: string | null;
  isSleeping: boolean;
  /** Cached so the tab strip can still show title/url while the view is torn down. */
  lastKnownUrl: string;
  /** Website Lock: the page this tab is waiting to open once its website is unlocked. Kept in memory only. */
  lockPending?: { url: string };
  lastKnownTitle: string;
  /** Timestamp this tab last stopped being the active tab — used for the sleep timer. */
  lastActiveAt: number;
  isPinned: boolean;
  isMuted: boolean;
  groupId: string | null;
  zoomFactor: number;
  /** True while showing DASH's own New Tab Page (a data: URL under the hood — this flag is what lets the UI show the clean sentinel instead). */
  isNewTabPage: boolean;
  /** Key of the stylesheet that rounds this page's corners while it sits in a split pane. */
  splitCssKey?: string;
  /** True for the empty pane of a new split: it shows the chooser instead of the New Tab page. */
  splitPicker?: boolean;
  /** Recent renderer-crash times, used to stop an endless reload loop. */
  crashTimes?: number[];
  /** Which real internal page (history/downloads/bookmarks/settings) this tab is showing, if any. */
  internalPage: InternalPageId | null;
  /** Captured straight from the page's own <link rel="icon"> via page-favicon-updated — never a third-party favicon service. */
  faviconUrl: string | null;
  /** Private tabs: what the automatic VPN did for this tab (shown on its New Tab page). */
  privateVpn?: PrivateVpnOutcome;
  /** Private tab held back because the VPN could not connect; loaded only if the person chooses to go without it. */
  heldUrl?: string;
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
  private overlaySnapshot: OverlaySnapshot | null = null;
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
  private privateSession = (() => {
    const s = session.fromPartition(`private-${randomUUID()}`, { cache: false });
    // Same browser string for every private user: no Electron / app-name tokens to single you out.
    s.setUserAgent(s.getUserAgent().replace(/\s(?:Electron|dash)[^\s]*/gi, ''), 'en-US,en');
    return s;
  })();

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
    private generatePassword: () => string = () => '',
    private getContainerSession: (id: string) => Session | null = () => null,
    private getContainer: (id: string) => ContainerInfo | null = () => null
  ) {
    this.onStateChange = onStateChange;
    this.getSettings = getSettings;
    this.win.on('resize', () => this.layoutActiveView());
    this.sleepTimer = setInterval(() => this.sleepEligibleTabs(), SLEEP_CHECK_INTERVAL_MS);
  }

  /** Set by the app: connects the VPN for private tabs and stops it again when the last one closes. */
  vpnForPrivate: {
    ensure: () => Promise<'connected' | 'not-configured' | 'failed'>;
    changed: () => void;
  } | null = null;

  privateTabCount(): number {
    let n = 0;
    for (const t of this.tabs.values()) if (t.isPrivate) n++;
    return n;
  }

  getPrivateSession(): Session {
    return this.privateSession;
  }

  dispose(): void {
    clearInterval(this.sleepTimer);
    if (this.spareTimer) clearTimeout(this.spareTimer);
    try {
      if (this.spareView && !this.spareView.webContents.isDestroyed()) this.spareView.webContents.close();
    } catch {
      /* gone */
    }
    this.spareView = null;
  }

  createTab(url?: string, isPrivate = false, containerId: string | null = null): TabState {
    const id = randomUUID();
    const targetIsInternal = (url ?? NEW_TAB_URL) in INTERNAL_URL_TO_PAGE;
    // Private tabs and DASH's own pages never run in a container.
    const container = isPrivate || targetIsInternal ? null : containerId;
    if (container && !this.getContainerSession(container))
      throw new Error('DASH: that container no longer exists');
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
      containerId: container,
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
    if (this.htmlFsTabId === id) this.leaveHtmlFullScreen();
    const tab = this.tabs.get(id);
    if (!tab) return;

    if (!tab.isPrivate) {
      this.closedTabs.unshift({
        url: tab.lockPending?.url ?? tab.lastKnownUrl,
        title: tab.lastKnownTitle,
        isPinned: tab.isPinned,
      });
      if (this.closedTabs.length > 20) this.closedTabs.pop();
    }

    const splitOther = this.partnerOf(id);
    if (splitOther) this.splitPair = null;
    this.closeDevtools(tab);
    if (tab.view) {
      if (tab.internalPage) this.untrustInternalPage(tab.view.webContents.id);
      this.win.contentView.removeChildView(tab.view);
      tab.view.webContents.close();
    }
    this.tabs.delete(id);
    if (tab.isPrivate) {
      this.vpnForPrivate?.changed();
      // Nothing from private browsing outlives its last tab: cookies, storage, cache and logins are wiped now.
      if (this.privateTabCount() === 0) {
        const ps = this.privateSession;
        void ps.clearStorageData().catch(() => undefined);
        void ps.clearCache().catch(() => undefined);
        void ps.clearAuthCache().catch(() => undefined);
        void ps.clearHostResolverCache().catch(() => undefined);
      }
    }
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
    if (splitOther && splitOther !== this.activeTabId) {
      const o = this.tabs.get(splitOther);
      if (o?.view) {
        try {
          this.win.contentView.removeChildView(o.view);
        } catch {
          /* gone */
        }
      }
    }
    if (splitOther) {
      this.layoutActiveView();
      this.emitSplitStates([splitOther]);
    }
    // Tell the tab strip which tabs remain: a tab closed from inside DASH (not by a click on its ×) must vanish too.
    if (!this.win.isDestroyed()) this.win.webContents.send(IPC.TABS_ORDER, this.tabOrder);
    this.notifyTabsChanged();
    // Closing the last tab closes the window, like Chrome (the app quits with its last window).
    if (this.tabs.size === 0 && !this.keepWindowOpen && !this.win.isDestroyed())
      setImmediate(() => {
        if (!this.win.isDestroyed() && this.tabs.size === 0) this.win.close();
      });
  }

  /** Set while tabs are being closed as part of a larger operation that opens a replacement itself. */
  private keepWindowOpen = false;

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
    return this.createTab(tab.lockPending?.url ?? tab.lastKnownUrl, tab.isPrivate, tab.containerId);
  }

  /** What a tab needs to be re-opened elsewhere, or null when it can't be moved (private, or the window's only tab). */
  movableTab(id: string): { url: string; container: string | null } | null {
    const tab = this.tabs.get(id);
    if (!tab || tab.isPrivate || this.tabs.size < 2) return null;
    return { url: tab.lockPending?.url ?? tab.lastKnownUrl, container: tab.containerId };
  }

  /** Closes every tab running in a container (used before the container is deleted). */
  closeContainerTabs(containerId: string): void {
    this.keepWindowOpen = true;
    try {
      for (const t of [...this.tabs.values()]) if (t.containerId === containerId) this.closeTab(t.id);
    } finally {
      this.keepWindowOpen = false;
    }
    if (this.tabs.size === 0) this.createTab();
  }

  /** Re-sends state for the tabs of a renamed/recoloured container so the tab strip updates. */
  refreshContainerLabels(containerId: string): void {
    for (const t of this.tabs.values())
      if (t.containerId === containerId) this.onStateChange(this.getTabState(t));
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
  findInPage(
    id: string,
    text: string,
    forward: boolean,
    onResult: (matches: number, activeMatchOrdinal: number) => void
  ): void {
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
    this.setZoom(id, () => this.defaultZoomFactor());
  }
  private setZoom(id: string, next: (current: number) => number): void {
    const tab = this.tabs.get(id);
    if (!tab?.view) return;
    tab.zoomFactor = next(tab.zoomFactor);
    tab.view.webContents.setZoomFactor(tab.zoomFactor);
    // Remember the level for this site (never from private tabs, never for DASH's own pages).
    const host = this.zoomHostOf(tab);
    if (host) getDatabase().setSiteZoom(host, tab.zoomFactor, this.defaultZoomFactor());
    this.onStateChange(this.getTabState(tab));
  }

  /** Re-reads each open tab's saved zoom (used after a site's zoom is reset from Settings). */
  applySavedZoomToOpenTabs(): void {
    for (const tab of this.tabs.values()) {
      if (!tab.view || tab.view.webContents.isDestroyed()) continue;
      const wanted = this.desiredZoomFor(tab);
      if (wanted === tab.zoomFactor) continue;
      tab.zoomFactor = wanted;
      tab.view.webContents.setZoomFactor(wanted);
      this.onStateChange(this.getTabState(tab));
    }
  }

  /** What zoom a tab's current page should have: saved for its site, else the default; DASH's own pages stay at 100%. */
  private desiredZoomFor(tab: Tab): number {
    if (!tab.view || tab.internalPage || tab.isNewTabPage) return 1;
    let host: string;
    try {
      const u = new URL(tab.view.webContents.getURL());
      if (u.protocol !== 'https:' && u.protocol !== 'http:') return 1;
      host = u.hostname.replace(/^www\./, '');
    } catch {
      return 1;
    }
    if (tab.isPrivate) return this.defaultZoomFactor(); // private tabs never read or write saved site zoom
    return getDatabase().getSiteZoom(host) ?? this.defaultZoomFactor();
  }

  /** The zoom a page starts at when no zoom has been saved for its site (Settings → Accessibility). */
  private defaultZoomFactor(): number {
    return getDatabase().getAllSettings().defaultPageZoom / 100;
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
  /**
   * Translate page: there is no offline translation engine in DASH, so this opens the page in the chosen online
   * translation service. That sends the page's ADDRESS to the service (which then fetches the page itself), so it
   * asks first, every time, and only ever works on public http(s) pages.
   */
  async translatePage(id: string): Promise<boolean> {
    const tab = this.tabs.get(id);
    const wc = tab?.view?.webContents;
    if (!tab || !wc || wc.isDestroyed() || tab.internalPage) return false;
    const pageUrl = wc.getURL();
    if (!/^https?:\/\//i.test(pageUrl)) return false;
    const provider = this.getSettings().translateProvider;
    const service = provider === 'bing' ? 'Microsoft Translator' : 'Google Translate';
    const lang = (app.getLocale() || 'en').split('-')[0].toLowerCase();
    const answer = await dialog.showMessageBox(this.win, {
      type: 'question',
      title: 'Translate this page',
      message: `Open this page in ${service}?`,
      detail: `DASH can't translate on your device. This sends the page address to ${service} (${pageUrl.slice(0, 120)}) and ${service} loads the page itself. Pages that need a login won't translate. You can change the service in Settings.`,
      buttons: [`Translate with ${service}`, 'Cancel'],
      defaultId: 1,
      cancelId: 1,
    });
    if (answer.response !== 0) return false;
    const target =
      provider === 'bing'
        ? `https://www.translatetheweb.com/?to=${encodeURIComponent(lang)}&a=${encodeURIComponent(pageUrl)}`
        : `https://translate.google.com/translate?sl=auto&tl=${encodeURIComponent(lang)}&u=${encodeURIComponent(pageUrl)}`;
    this.createTab(target, tab.isPrivate, tab.containerId);
    return true;
  }

  /**
   * Print preview: renders the page to a PDF in a temp folder and opens it in a new tab, where Chromium's PDF
   * viewer shows the real paginated output and has its own Print/Download buttons. Previews older than an hour
   * are deleted on the next preview; the folder is private to DASH's temp area.
   */
  async printPreview(id: string): Promise<boolean> {
    const tab = this.tabs.get(id);
    const wc = tab?.view?.webContents;
    if (!tab || !wc || wc.isDestroyed() || tab.internalPage || !/^(https?|file|data):/i.test(wc.getURL()))
      return false;
    try {
      const dir = path.join(os.tmpdir(), 'dash-print-preview');
      await fs.promises.mkdir(dir, { recursive: true });
      for (const f of await fs.promises.readdir(dir)) {
        const full = path.join(dir, f);
        const st = await fs.promises.stat(full).catch(() => null);
        if (st && Date.now() - st.mtimeMs > 3_600_000) await fs.promises.unlink(full).catch(() => undefined);
      }
      const data = await wc.printToPDF({ printBackground: true, preferCSSPageSize: true });
      const file = path.join(dir, `${randomUUID()}.pdf`);
      await fs.promises.writeFile(file, data);
      this.createTab(pathToFileURL(file).href, tab.isPrivate);
      return true;
    } catch (err) {
      appLog(`print preview failed: ${String(err)}`);
      return false;
    }
  }

  private async promptSavePage(id: string): Promise<void> {
    const tab = this.tabs.get(id);
    if (!tab?.view) return;
    const title = (tab.view.webContents.getTitle() || 'page').replace(/[\\/:*?"<>|]/g, '_');
    const result = await dialog.showSaveDialog(this.win, {
      defaultPath: `${title}.html`,
      filters: [{ name: 'Web page', extensions: ['html'] }],
    });
    if (!result.canceled && result.filePath) await this.savePage(id, result.filePath);
  }

  private async savePdfDialog(id: string): Promise<void> {
    const wc = this.tabs.get(id)?.view?.webContents;
    if (!wc) return;
    const title = (wc.getTitle() || 'page').replace(/[\\/:*?"<>|]/g, '_');
    const result = await dialog.showSaveDialog(this.win, {
      defaultPath: `${title}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
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
    const tab = [...this.tabs.values()].find(
      (t) => t.view && !t.view.webContents.isDestroyed() && t.view.webContents.id === webContentsId
    );
    if (!tab || !tab.view) return false;
    if (details.reason === 'clean-exit') return true;
    const wc = tab.view.webContents;
    appLog(
      `Tab process gone: reason=${details.reason} url=${tab.isPrivate ? '(private)' : wc.getURL().slice(0, 200)}`
    );
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
      wc.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(this.newTabHtml())}`).catch(
        () => undefined
      );
    } else {
      const lastUrl = failedUrlFromErrorPage(wc.getURL()) ?? (tab.isPrivate ? '' : wc.getURL());
      const target =
        tab.internalPage || tab.isNewTabPage || !/^https?:/i.test(lastUrl) ? 'about:blank' : lastUrl;
      wc.loadURL(buildCrashPageDataUrl(target, details.reason, nativeTheme.shouldUseDarkColors)).catch(
        () => undefined
      );
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

  /** The page's webContents and privacy flag, for features that act on the live page (archive). */
  pageForArchive(id: string): { wc: Electron.WebContents; isPrivate: boolean } | null {
    const tab = this.tabs.get(id);
    return tab?.view ? { wc: tab.view.webContents, isPrivate: tab.isPrivate } : null;
  }

  async savePage(id: string, savePath: string): Promise<void> {
    await this.tabs.get(id)?.view?.webContents.savePage(savePath, 'HTMLComplete');
  }
  private newTabHtml(tab?: Tab): string {
    const db = getDatabase();
    if (tab?.splitPicker && !tab.isPrivate && this.splitPair) {
      const left = this.splitPair.left;
      const open = [...this.tabs.values()]
        .filter(
          (t) =>
            t.id !== tab.id &&
            t.id !== left &&
            !t.isPrivate &&
            !t.isNewTabPage &&
            t.internalPage !== 'welcome' &&
            t.internalPage !== 'lock'
        )
        .map((t) => ({
          id: t.id,
          title: this.getTabState(t).title,
          url: t.internalPage ? `dash://${t.internalPage}` : this.tabUrl(t),
          faviconUrl: t.internalPage ? '' : (t.faviconUrl ?? ''),
        }));
      return buildSplitPickerHtml(open, db.getAllSettings().searchEngine, nativeTheme.shouldUseDarkColors);
    }
    if (tab?.isPrivate)
      return buildPrivateNewTabHtml(
        tab.privateVpn ?? 'disabled',
        nativeTheme.shouldUseDarkColors,
        db.getAllSettings().searchEngine
      );
    // Read from the database, not the cached copy: this also runs while a settings change is being applied.
    const settings = db.getAllSettings();
    return buildNewTabHtml(
      db.getShortcutSites(9),
      settings.searchEngine,
      0,
      nativeTheme.shouldUseDarkColors,
      settings.newTabCustomCssEnabled ? settings.newTabCustomCss : '',
      settings.newTabCustomCss.trim().length > 0,
      recoverableCount(),
      this.tracker.getLifetimeTotal()
    );
  }

  /**
   * Paints DASH's own pages (New Tab, History, Settings…) in the theme's surface colour so there is no white
   * flash while they load. Ordinary web pages keep the default white: sites assume it when they set no background.
   */
  applyThemeBackground(): void {
    const colour = nativeTheme.shouldUseDarkColors ? '#0b0d10' : '#ffffff';
    for (const tab of this.tabs.values()) {
      try {
        tab.view?.setBackgroundColor(tab.isNewTabPage || tab.internalPage ? colour : '#ffffff');
      } catch {
        /* view may be gone */
      }
    }
  }

  /** Re-renders every open New Tab Page (e.g. after the custom CSS changed). */
  refreshNewTabPages(): void {
    for (const tab of this.tabs.values()) {
      const wc = tab.view?.webContents;
      if (tab.isNewTabPage && wc && !wc.isDestroyed() && wc.getURL().startsWith('data:')) {
        wc.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(this.newTabHtml())}`).catch(
          () => undefined
        );
      }
    }
  }

  /** Toggles reading mode on a normal web page. Returns 'opened' | 'closed' | 'unreadable' | 'unsupported'. */
  async toggleReader(id: string): Promise<'opened' | 'closed' | 'unreadable' | 'unsupported'> {
    const tab = this.tabs.get(id);
    const wc = tab?.view?.webContents;
    if (!tab || !wc || tab.internalPage || !/^https?:/i.test(wc.getURL())) return 'unsupported';
    try {
      return (await wc.executeJavaScript(buildReaderScript(nativeTheme.shouldUseDarkColors), true)) as
        'opened' | 'closed' | 'unreadable';
    } catch {
      return 'unreadable';
    }
  }

  toggleDevTools(id: string): void {
    const wc = this.tabs.get(id)?.view?.webContents;
    if (!wc) return;
    const tab = this.tabs.get(id)!;
    if (this.devtoolsViews.has(id)) {
      this.closeDevtools(tab);
      return;
    }
    if (wc.isDevToolsOpened()) {
      wc.closeDevTools();
      return;
    }
    if (this.getSettings().devToolsDock === 'window') {
      wc.openDevTools({ mode: 'detach' });
      return;
    }
    // Host the DevTools frontend in a native view of THIS window instead of a separate OS window.
    const dt = new WebContentsView({
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    wc.setDevToolsWebContents(dt.webContents);
    wc.openDevTools({ mode: 'detach' });
    this.devtoolsViews.set(id, dt);
    wc.once('devtools-closed', () => {
      if (this.devtoolsViews.get(id) === dt) this.closeDevtools(tab);
    });
    if (this.activeTabId === id) this.attachActiveViewIfAllowed();
    this.layoutActiveView();
  }

  switchTab(id: string): void {
    if (this.htmlFsTabId && this.htmlFsTabId !== id) this.leaveHtmlFullScreen(true);
    const tab = this.tabs.get(id);
    if (!tab) return;

    // Start the previous tab's sleep clock, but keep its view attached until
    // the new one is in place so the window background never shows through.
    let prevView: WebContentsView | null = null;
    if (this.activeTabId && this.activeTabId !== id) {
      const prev = this.tabs.get(this.activeTabId);
      if (prev) {
        prev.isActive = false;
        prev.lastActiveAt = Date.now();
        // Moving between the two panes of a split keeps both on screen.
        prevView = this.partnerOf(id) === prev.id ? null : prev.view;
        this.hideDevtools(prev);
      }
    }

    if (tab.isSleeping) this.wake(tab);

    this.activeTabId = id;
    tab.isActive = true;
    this.layoutActiveView();
    this.revealView(tab, prevView && prevView !== tab.view ? prevView : null);
    this.onStateChange(this.getTabState(tab));
  }

  navigate(id: string, url: string): void {
    const tab = this.tabs.get(id);
    if (!tab) return;
    const normalized = this.normalizeUrl(url);

    // Website Lock: a locked website never loads. This tab shows the lock screen and remembers where it was going.
    if (normalized !== INTERNAL_PAGE_URLS.lock) {
      if (this.divertIfLocked(tab, normalized)) return;
      tab.lockPending = undefined;
    }

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
      const oldView = tab.view;
      this.closeDevtools(tab);
      if (oldView) {
        if (tab.internalPage) this.untrustInternalPage(oldView.webContents.id);
        tab.view = null;
      }
      this.materialize(tab, normalized);
      this.layoutActiveView();
      if (tab.isActive || this.partnerOf(tab.id) === this.activeTabId) {
        this.revealView(tab, oldView, true);
      } else if (oldView) {
        this.win.contentView.removeChildView(oldView);
        oldView.webContents.close();
      }
      return;
    }

    tab.view?.webContents.loadURL(normalized).catch((err) => {
      console.error(`[DASH] Navigation failed for ${normalized}:`, err.message);
    });
  }

  /**
   * True when `wc` is one of THIS window's own bundled internal pages (History, Settings, side panel...), judged
   * from the live tab state rather than a separately maintained list, so a page can never end up rejected just
   * because a bookkeeping call ran in a different order. The page must still be showing our own internal.html.
   */
  ownsInternalPage(wc: Electron.WebContents): boolean {
    if (wc.isDestroyed()) return false;
    const mine =
      (this.sidePanel && this.sidePanel.view.webContents === wc) ||
      [...this.tabs.values()].some((t) => t.internalPage && t.view && t.view.webContents === wc);
    if (!mine) return false;
    try {
      const u = new URL(wc.getURL());
      if (!u.pathname.endsWith('/internal.html')) return false;
      const dev = process.env.VITE_DEV_SERVER_URL;
      return u.protocol === 'file:' || (!!dev && u.origin === new URL(dev).origin);
    } catch {
      return false;
    }
  }

  private isInternalUrl(url: string): boolean {
    return url === NEW_TAB_URL || url in INTERNAL_URL_TO_PAGE;
  }

  /** The Home button — deliberately separate from "new tab", matching Chrome/Firefox's own distinction. */
  goHome(id: string): void {
    this.navigate(id, this.getSettings().homepage);
  }

  /** Website Lock: true when `url` is locked, in which case this tab now shows the lock screen for it. */
  private divertIfLocked(tab: Tab, url: string): boolean {
    if (!/^https?:/i.test(url) || !getWebsiteLock().blockingSite(url)) return false;
    this.showLock(tab, url);
    return true;
  }

  /** URL of the tab in front: where it is going if it is on the lock screen. Used to answer "is this page locked?". */
  getActiveUrl(): string | null {
    const tab = this.activeTabId ? this.tabs.get(this.activeTabId) : undefined;
    if (!tab) return null;
    return (
      tab.lockPending?.url ?? (tab.view && !tab.isSleeping ? tab.view.webContents.getURL() : tab.lastKnownUrl)
    );
  }

  /**
   * Resolves once the tab in front has its first content (or after `timeoutMs`). Used at start-up so the window is
   * shown once, with the page already in it, instead of in pieces.
   */
  whenActiveTabReady(timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      const wc = this.activeTabId ? this.tabs.get(this.activeTabId)?.view?.webContents : undefined;
      if (!wc || wc.isDestroyed()) return resolve();
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        // One more frame so the content has actually been painted, not just parsed.
        setTimeout(resolve, 50);
      };
      const timer = setTimeout(finish, timeoutMs);
      if (!wc.isLoading()) finish();
      else wc.once('did-stop-loading', finish);
    });
  }

  showLock(tab: Tab, url: string): void {
    tab.lockPending = { url };
    this.navigate(tab.id, INTERNAL_PAGE_URLS.lock);
  }

  /** What the lock screen in the tab behind `wc` is waiting to open, for the lock screen only. */
  getLockPending(wc: Electron.WebContents): { url: string; tabId: string } | null {
    for (const t of this.tabs.values()) {
      if (t.view?.webContents === wc && t.lockPending) return { url: t.lockPending.url, tabId: t.id };
    }
    return null;
  }

  /**
   * Called whenever any lock changes. Open tabs on a website that is locked now go to the lock screen; lock screens
   * whose website has been unlocked (here or in another tab) continue to the page they were waiting for.
   */
  enforceLocks(): void {
    const engine = getWebsiteLock();
    for (const tab of [...this.tabs.values()]) {
      if (tab.lockPending) {
        if (!engine.blockingSite(tab.lockPending.url)) {
          const url = tab.lockPending.url;
          tab.lockPending = undefined;
          this.navigate(tab.id, url);
        }
        continue;
      }
      if (!tab.view || tab.isSleeping || tab.internalPage) continue;
      const current = tab.view.webContents.getURL();
      if (/^https?:/i.test(current) && engine.blockingSite(current)) this.showLock(tab, current);
    }
  }

  /** Network safety net: a main-frame request for a locked website was cancelled; show the lock screen in that tab. */
  lockedByNetwork(webContentsId: number, url: string): boolean {
    for (const tab of this.tabs.values()) {
      if (tab.view?.webContents.id === webContentsId) {
        setImmediate(() => {
          if (this.tabs.has(tab.id) && getWebsiteLock().blockingSite(url)) this.showLock(tab, url);
        });
        return true;
      }
    }
    return false;
  }

  goBack(id: string): void {
    const tab = this.tabs.get(id);
    const nh = tab?.view?.webContents.navigationHistory;
    if (tab && nh?.canGoBack()) {
      // Back/forward do not raise will-navigate, so the page we would return to is checked here.
      const target = nh.getEntryAtIndex(nh.getActiveIndex() - 1);
      if (target && this.divertIfLocked(tab, target.url)) return;
      nh.goBack();
    }
  }

  goForward(id: string): void {
    const tab = this.tabs.get(id);
    const nh = tab?.view?.webContents.navigationHistory;
    if (tab && nh?.canGoForward()) {
      const target = nh.getEntryAtIndex(nh.getActiveIndex() + 1);
      if (target && this.divertIfLocked(tab, target.url)) return;
      nh.goForward();
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
      .map((t) => t.lockPending?.url ?? t.lastKnownUrl);
  }

  /** Pin and group layout for the tabs returned by getRestorableUrls(), same order. */
  getRestorableLayout(): SessionLayout {
    const tabs = this.tabOrder.map((id) => this.tabs.get(id)!).filter((t) => !t.isPrivate);
    const groupIds: string[] = [];
    for (const t of tabs) if (t.groupId && !groupIds.includes(t.groupId)) groupIds.push(t.groupId);
    const sp = this.splitPair;
    const li = sp ? tabs.findIndex((t) => t.id === sp.left) : -1;
    const ri = sp ? tabs.findIndex((t) => t.id === sp.right) : -1;
    return {
      split: li >= 0 && ri >= 0 ? { left: li, right: ri, ratio: this.splitRatio } : null,
      tabs: tabs.map((t) => ({
        pinned: t.isPinned,
        group: t.groupId ? groupIds.indexOf(t.groupId) : null,
        container: t.containerId,
      })),
      groups: groupIds.map((gid) => {
        const g = this.groups.get(gid)!;
        return { name: g.name, color: g.color, collapsed: g.collapsed };
      }),
    };
  }

  /** Re-applies pins and groups to freshly restored tabs (`ids` in the same order as the saved URLs). */
  applyRestoredLayout(ids: string[], layout: SessionLayout): void {
    const realGroup = new Map<number, string>();
    ids.forEach((id, i) => {
      const t = layout.tabs[i];
      if (!t) return;
      if (t.pinned) {
        this.togglePin(id);
        return;
      }
      if (t.group === null || t.group === undefined) return;
      const meta = layout.groups[t.group];
      if (!meta) return;
      let gid = realGroup.get(t.group);
      this.setTabGroup(id, gid ?? 'new');
      gid = this.tabs.get(id)?.groupId ?? undefined;
      if (gid && !realGroup.has(t.group)) {
        realGroup.set(t.group, gid);
        this.updateGroup(gid, { name: meta.name, color: meta.color, collapsed: false });
      }
    });
    // Collapse only after every member exists, so a collapsed group never hides the active tab mid-restore.
    for (const [idx, gid] of realGroup)
      if (layout.groups[idx]?.collapsed) this.updateGroup(gid, { collapsed: true });
    // Split view: show the saved pair again, left pane active.
    const sp = layout.split;
    if (sp && ids[sp.left] && ids[sp.right] && sp.left !== sp.right) {
      this.switchTab(ids[sp.left]);
      this.openSplit(ids[sp.right]);
      this.setDividerFraction('split', Number.isFinite(sp.ratio) ? sp.ratio : 0.5);
      this.switchTab(ids[sp.left]);
    }
  }

  /**
   * Opens a chrome overlay. The native page view always paints above the
   * toolbar's DOM, so it has to be detached for the menu to be visible; to
   * keep the page from "vanishing", a snapshot is captured first and
   * returned so the toolbar can paint it in the page's place.
   */
  async pushOverlay(): Promise<OverlaySnapshot | null> {
    this.overlayDepth += 1;
    if (this.overlayDepth > 1) return this.overlaySnapshot;
    const tab = this.activeTabId ? this.tabs.get(this.activeTabId) : undefined;
    let snapshot: OverlaySnapshot | null = null;
    const composite = !!this.splitPair || !!this.sidePanel || (tab ? this.devtoolsViews.has(tab.id) : false);
    if (tab?.view && !composite) {
      try {
        // A capture that never returns (GPU stall, throttled view) must not leave the menu waiting forever.
        const image = await Promise.race([
          tab.view.webContents.capturePage(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 250)),
        ]);
        if (image && !image.isEmpty()) {
          const b = tab.view.getBounds(); // exact placement: the snapshot must sit where the page is
          snapshot = {
            image: `data:image/jpeg;base64,${image.toJPEG(70).toString('base64')}`,
            x: b.x,
            y: b.y,
            width: b.width,
            height: b.height,
          };
        }
      } catch {
        snapshot = null;
      }
    }
    this.overlaySnapshot = snapshot;
    return snapshot;
  }

  /**
   * Second half of opening an overlay: the toolbar has painted the snapshot, so now the page views can be hidden
   * without a blank frame in between. Hidden (not detached) views keep their last frame and their GPU surface.
   */
  commitOverlay(): void {
    if (this.overlayDepth === 0 || this.overlayHidden.length > 0 || this.overlayParked) return;
    const tab = this.activeTabId ? this.tabs.get(this.activeTabId) : undefined;
    if (!tab?.view) return;
    // A plain single page: park the live view just off-screen instead of hiding it. It keeps playing, and a few
    // times a second its picture is sent to the toolbar, so a video behind a menu keeps moving instead of freezing.
    if (this.overlaySnapshot) {
      const b = tab.view.getBounds();
      this.overlayParked = tab.view;
      this.safeBounds(tab.view, { ...b, x: -(b.width + 400) });
      // Live frames start only after the menu has finished opening, so they never compete with its first paint.
      setTimeout(() => {
        if (this.overlayParked === tab.view) this.startOverlayFrames(tab);
      }, 280);
      return;
    }
    const hide = [
      tab.view,
      this.devtoolsViews.get(tab.id),
      this.visiblePartner()?.view,
      this.sidePanel?.view,
    ];
    for (const v of hide) {
      if (!v) continue;
      try {
        v.setVisible(false);
        this.overlayHidden.push(v);
      } catch {
        /* view gone */
      }
    }
  }

  private overlayParked: WebContentsView | null = null;
  private overlayFrameTimer: NodeJS.Timeout | null = null;

  private startOverlayFrames(tab: Tab): void {
    this.stopOverlayFrames();
    let busy = false;
    this.overlayFrameTimer = setInterval(() => {
      const view = tab.view;
      if (
        busy ||
        !view ||
        this.overlayParked !== view ||
        view.webContents.isDestroyed() ||
        this.win.isDestroyed()
      )
        return;
      busy = true;
      view.webContents
        .capturePage()
        .then((image) => {
          if (!image.isEmpty() && this.overlayParked === view && !this.win.isDestroyed()) {
            this.win.webContents.send(
              IPC.OVERLAY_FRAME,
              `data:image/jpeg;base64,${image.toJPEG(50).toString('base64')}`
            );
          }
        })
        .catch(() => undefined)
        .finally(() => {
          busy = false;
        });
    }, 150);
  }

  private stopOverlayFrames(): void {
    if (this.overlayFrameTimer) {
      clearInterval(this.overlayFrameTimer);
      this.overlayFrameTimer = null;
    }
  }

  private overlayHidden: WebContentsView[] = [];
  private lockHidden = new Set<WebContentsView>();

  /** App Lock on: page views are hidden and muted so the lock screen is all anyone sees. Off: they come back untouched. */
  setAppLocked(locked: boolean): void {
    if (locked) {
      this.hideAllForLock();
      return;
    }
    // The lock screen fades out (~300 ms) in the window; native page views sit above it, so reveal them once it is gone.
    setTimeout(() => {
      if (this.win.isDestroyed() || appLockProbe()) return;
      for (const v of this.lockHidden) {
        try {
          v.setVisible(true);
        } catch {
          /* view gone */
        }
      }
      this.lockHidden.clear();
      for (const t of this.tabs.values()) {
        if (t.view && !t.view.webContents.isDestroyed()) t.view.webContents.setAudioMuted(t.isMuted);
      }
      this.attachActiveViewIfAllowed();
      this.syncSplitViews();
      this.layoutActiveView();
    }, 300);
  }

  private hideAllForLock(): void {
    if (this.htmlFsTabId) this.leaveHtmlFullScreen(true);
    const active = this.activeTabId ? this.tabs.get(this.activeTabId) : undefined;
    const views = [
      active?.view,
      active ? this.devtoolsViews.get(active.id) : undefined,
      this.visiblePartner()?.view,
      this.sidePanel?.view,
    ];
    for (const v of views) {
      if (!v || this.lockHidden.has(v)) continue;
      try {
        v.setVisible(false);
        this.lockHidden.add(v);
      } catch {
        /* view gone */
      }
    }
    for (const t of this.tabs.values()) {
      if (t.view && !t.view.webContents.isDestroyed()) t.view.webContents.setAudioMuted(true);
    }
  }

  popOverlay(): void {
    this.overlayDepth = Math.max(0, this.overlayDepth - 1);
    if (this.overlayDepth === 0) {
      this.overlaySnapshot = null;
      this.stopOverlayFrames();
      this.overlayParked = null;
      for (const v of this.overlayHidden) {
        try {
          v.setVisible(true);
        } catch {
          /* view gone */
        }
      }
      this.overlayHidden = [];
      this.attachActiveViewIfAllowed();
      this.syncSplitViews();
      this.layoutActiveView();
    }
  }

  /**
   * An internal page (History, Settings...) switched to another section in place. The page view stays; only the tab's
   * identity changes, so reload, session restore and the address bar all follow the section now showing.
   */
  internalPageChanged(sender: Electron.WebContents, page: InternalPageId): void {
    const tab = [...this.tabs.values()].find(
      (t) => t.internalPage && t.view && t.view.webContents === sender
    );
    if (!tab || tab.internalPage === 'welcome' || tab.internalPage === page) return;
    tab.internalPage = page;
    this.onStateChange(this.getTabState(tab));
    this.notifyTabsChanged();
  }

  /** Views that exist but have not yet painted their first frame. */
  private unpainted = new WeakSet<WebContentsView>();

  /**
   * Shows the tab's view only once it has painted, keeping the previous view
   * on screen until then, so the window background never flashes between two
   * pages. Falls back after 800 ms so a slow page still appears.
   */
  private revealView(tab: Tab, oldView: WebContentsView | null, closeOld = false): void {
    const view = tab.view;
    let finished = false;
    const finish = (): void => {
      if (finished) return;
      finished = true;
      if (tab.view === view && this.activeTabId === tab.id) this.attachActiveViewIfAllowed();
      else if (
        tab.view === view &&
        this.overlayDepth === 0 &&
        this.partnerOf(tab.id) === this.activeTabId &&
        view
      )
        this.win.contentView.addChildView(view);
      if (oldView) {
        // Keep the previous page on top of the incoming one for a few frames. A view that was detached (or whose
        // GPU surface was evicted) can show a black frame until its compositor delivers the first frame after
        // re-attaching; with the old page still above it that frame is never visible.
        const incoming = tab.view === view && view && this.win.contentView.children.includes(view);
        if (incoming) {
          try {
            this.win.contentView.addChildView(oldView); // re-adding moves it to the top
            const dt = this.devtoolsViews.get(tab.id);
            if (dt) this.win.contentView.addChildView(dt);
            if (this.sidePanel) this.win.contentView.addChildView(this.sidePanel.view);
          } catch {
            /* old view already gone */
          }
        }
        const removeOld = (): void => {
          // The user may have switched straight back to this page within the delay; then it must stay.
          const stillShown =
            !closeOld &&
            [...this.tabs.values()].some(
              (t) =>
                t.view === oldView && (t.id === this.activeTabId || this.partnerOf(t.id) === this.activeTabId)
            );
          if (stillShown) return;
          try {
            this.win.contentView.removeChildView(oldView);
          } catch {
            /* already gone */
          }
          if (closeOld && !oldView.webContents.isDestroyed()) oldView.webContents.close();
        };
        if (incoming) setTimeout(removeOld, 50);
        else removeOld();
      }
    };
    const done = (): void => {
      finish();
      this.syncSplitViews();
    };
    if (!view || !this.unpainted.has(view)) {
      done();
      return;
    }
    view.webContents.once('dom-ready', () => setTimeout(done, 40));
    setTimeout(done, 800);
  }

  private attachActiveViewIfAllowed(): void {
    if (this.overlayDepth > 0 || !this.activeTabId) return;
    const tab = this.tabs.get(this.activeTabId);
    if (tab?.view) this.win.contentView.addChildView(tab.view);
    const dt = tab ? this.devtoolsViews.get(tab.id) : undefined;
    if (dt) this.win.contentView.addChildView(dt);
    if (this.sidePanel) this.win.contentView.addChildView(this.sidePanel.view);
  }

  // ---- Split view: two tabs side by side ----
  private splitPair: { left: string; right: string } | null = null;
  private splitRatio = 0.5;
  private panelShare = DEFAULT_PANEL_SHARE;
  private devtoolsShare = DEFAULT_DEVTOOLS_SHARE;
  /** Called with every draggable divider whenever the layout changes. */
  onLayoutDividers: (d: LayoutDivider[]) => void = () => undefined;
  onLayoutSplit: (s: SplitLayout | null) => void = () => undefined;

  /** `fraction` is where the divider's centre sits within its area (0 = start, 1 = end). */
  setDividerFraction(id: LayoutDivider['id'], fraction: number): void {
    if (!Number.isFinite(fraction)) return;
    const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
    if (id === 'split') this.splitRatio = clamp(fraction, 0.2, 0.8);
    else if (id === 'panel') this.panelShare = clamp(1 - fraction, 0.2, 0.6);
    else this.devtoolsShare = clamp(1 - fraction, 0.2, 0.8);
    this.layoutActiveView();
  }

  private partnerOf(id: string): string | null {
    const p = this.splitPair;
    if (!p) return null;
    return p.left === id ? p.right : p.right === id ? p.left : null;
  }

  /** The other pane's tab while the active tab is part of a split. */
  private visiblePartner(): Tab | undefined {
    if (!this.activeTabId) return undefined;
    const other = this.partnerOf(this.activeTabId);
    return other ? this.tabs.get(other) : undefined;
  }

  /** Makes the on-screen set of views match the split: both panes while one of them is active, neither otherwise. */
  private syncSplitViews(): void {
    const p = this.splitPair;
    if (!p) return;
    for (const id of [p.left, p.right]) {
      if (id === this.activeTabId) continue;
      const t = this.tabs.get(id);
      if (!t) continue;
      if (this.partnerOf(id) === this.activeTabId) {
        if (t.isSleeping) this.wake(t);
        if (t.view && this.overlayDepth === 0) this.win.contentView.addChildView(t.view);
      } else if (t.view) {
        try {
          this.win.contentView.removeChildView(t.view);
        } catch {
          /* gone */
        }
      }
    }
    this.layoutActiveView();
  }

  /**
   * Shows `partnerId` beside the active tab (active on the left). When the chosen tab is the active one, a new tab
   * opens on the right instead. Replaces any existing split.
   */
  openSplit(partnerId?: string): void {
    const activeId = this.activeTabId;
    if (!activeId) return;
    const before = this.splitPair ? [this.splitPair.left, this.splitPair.right] : [];
    if (this.splitPair) this.closeSplit();
    let right = partnerId && partnerId !== activeId && this.tabs.has(partnerId) ? partnerId : null;
    if (!right) {
      const active = this.tabs.get(activeId);
      const created = this.createTab(undefined, active?.isPrivate ?? false, active?.containerId ?? null);
      const ct = this.tabs.get(created.id);
      if (ct) ct.splitPicker = true;
      right = created.id; // createTab activates the new tab, which is what we want: type in the right pane
    }
    this.splitPair = { left: activeId, right };
    // Like Chrome, the two tabs of a split sit side by side in the tab strip.
    const order = this.tabOrder.filter((t) => t !== right);
    order.splice(order.indexOf(activeId) + 1, 0, right);
    this.tabOrder = order;
    if (!this.win.isDestroyed()) this.win.webContents.send(IPC.TABS_ORDER, this.tabOrder);
    if (this.activeTabId !== right) this.switchTab(right);
    const rt = this.tabs.get(right);
    if (rt?.splitPicker && rt.view && !rt.isPrivate) {
      rt.view.webContents
        .loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(this.newTabHtml(rt))}`)
        .catch(() => undefined);
    }
    this.syncSplitViews();
    for (const id of [activeId, right]) {
      const st = this.tabs.get(id);
      if (st) void this.applySplitStyle(st);
    }
    this.notifyTabsChanged();
    this.emitSplitStates([...before, activeId, right]);
  }

  closeSplit(): void {
    const p = this.splitPair;
    if (!p) return;
    this.splitPair = null;
    for (const id of [p.left, p.right]) {
      const st = this.tabs.get(id);
      if (st) {
        st.splitPicker = false;
        void this.applySplitStyle(st);
      }
      if (id === this.activeTabId) continue;
      const t = this.tabs.get(id);
      if (t?.view) {
        try {
          this.win.contentView.removeChildView(t.view);
        } catch {
          /* gone */
        }
      }
    }
    this.layoutActiveView();
    this.notifyTabsChanged();
    this.emitSplitStates([p.left, p.right]);
  }

  /** The address a tab is showing, as the person would see it. */
  private tabUrl(t: Tab): string {
    return t.view?.webContents.getURL() || t.heldUrl || t.lastKnownUrl || '';
  }

  /** The person chose an open tab for the empty pane: that tab moves into the split and the empty one goes away. */
  private pickIntoSplit(pickerId: string, chosenId: string): void {
    const p = this.splitPair;
    if (!p || p.right !== pickerId || !this.tabs.has(chosenId) || chosenId === p.left) return;
    const left = p.left;
    this.closeSplit();
    this.switchTab(left);
    this.openSplit(chosenId);
    // Not inside the picker page's own navigation event: closing a page from within its own event is fragile.
    setTimeout(() => this.closeTab(pickerId), 0);
  }

  /** Rounds the page's corners and lets the window show through them, only while the tab is in a split pane. */
  async applySplitStyle(tab: Tab): Promise<void> {
    const view = tab.view;
    const wc = view?.webContents;
    if (!view || !wc || wc.isDestroyed()) return;
    const want = !!this.splitPair && (this.splitPair.left === tab.id || this.splitPair.right === tab.id);
    try {
      if (tab.splitCssKey) {
        const key = tab.splitCssKey;
        tab.splitCssKey = undefined;
        await wc.removeInsertedCSS(key).catch(() => undefined);
      }
      if (want) {
        tab.splitCssKey = await wc.insertCSS(
          `:where(html){background-color:Canvas}html{clip-path:inset(0 round ${SPLIT_RADIUS}px)!important}`
        );
        view.setBackgroundColor('#00000000');
      } else {
        const own = tab.internalPage || tab.isNewTabPage || /^(data:text\/html|dash:)/i.test(wc.getURL());
        view.setBackgroundColor(own && nativeTheme.shouldUseDarkColors ? '#0b0d10' : '#ffffff');
      }
    } catch {
      /* the page went away */
    }
  }

  swapSplit(): void {
    const p = this.splitPair;
    if (!p) return;
    this.splitPair = { left: p.right, right: p.left };
    this.splitRatio = 1 - this.splitRatio;
    this.layoutActiveView();
  }

  /** Both panes back to the same width. */
  resetSplit(): void {
    if (!this.splitPair) return;
    this.splitRatio = 0.5;
    this.layoutActiveView();
  }

  /** Re-sends the state of tabs whose split membership changed (the strip shows a marker on them). */
  private emitSplitStates(ids: (string | undefined | null)[]): void {
    for (const id of ids) {
      const t = id ? this.tabs.get(id) : undefined;
      if (t) this.onStateChange(this.getTabState(t));
    }
  }

  isSplit(): boolean {
    return this.splitPair !== null;
  }

  // ---- Side panel (Quick notes / AI helper), docked to the right of the page area ----
  private sidePanel: { kind: SidePanelKind; view: WebContentsView } | null = null;

  /** Where the page and the panel meet; the panel keeps this width regardless of the window size (within limits). */

  toggleSidePanel(kind: SidePanelKind): void {
    if (this.sidePanel?.kind === kind) {
      this.closeSidePanel();
      return;
    }
    this.closeSidePanel();
    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: this.internalPagePreloadPath,
      },
    });
    view.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#0b0d10' : '#ffffff');
    this.trustInternalPage(view.webContents);
    this.sidePanel = { kind, view };
    this.loadInternalPage(view, kind, 'panel').catch((err) =>
      console.error(`[DASH] Failed to load ${kind} panel:`, err.message)
    );
    if (this.overlayDepth === 0) this.win.contentView.addChildView(view);
    this.layoutActiveView();
  }

  closeSidePanel(): void {
    const panel = this.sidePanel;
    if (!panel) return;
    this.sidePanel = null;
    try {
      this.win.contentView.removeChildView(panel.view);
    } catch {
      /* already gone */
    }
    if (!panel.view.webContents.isDestroyed()) {
      this.untrustInternalPage(panel.view.webContents.id);
      panel.view.webContents.close();
    }
    this.layoutActiveView();
  }

  /** The active web page for the AI helper (ordinary http/https pages only). */
  activePageForAi(): { wc: Electron.WebContents; url: string; title: string } | null {
    const tab = this.activeTabId ? this.tabs.get(this.activeTabId) : undefined;
    const wc = tab?.view?.webContents;
    if (!wc || wc.isDestroyed() || !/^https?:/i.test(wc.getURL())) return null;
    return { wc, url: wc.getURL(), title: wc.getTitle() };
  }

  /** The address of the active tab if it is an ordinary web page (used to link notes and for the AI helper). */
  activeUrl(): string | null {
    const tab = this.activeTabId ? this.tabs.get(this.activeTabId) : undefined;
    const url = tab?.view?.webContents.getURL() ?? '';
    return /^https?:/i.test(url) ? url : null;
  }

  // ---- Docked Developer tools ----
  /** Per-tab DevTools frontends hosted as native views inside this window. */
  private devtoolsViews = new Map<string, WebContentsView>();

  private hideDevtools(tab: Tab): void {
    const dt = this.devtoolsViews.get(tab.id);
    if (dt) {
      try {
        this.win.contentView.removeChildView(dt);
      } catch {
        /* already gone */
      }
    }
  }

  private closeDevtools(tab: Tab): void {
    const dt = this.devtoolsViews.get(tab.id);
    if (!dt) return;
    this.devtoolsViews.delete(tab.id);
    try {
      this.win.contentView.removeChildView(dt);
    } catch {
      /* already gone */
    }
    try {
      if (tab.view && !tab.view.webContents.isDestroyed() && tab.view.webContents.isDevToolsOpened())
        tab.view.webContents.closeDevTools();
    } catch {
      /* page already gone */
    }
    if (!dt.webContents.isDestroyed()) dt.webContents.close();
    this.layoutActiveView();
  }

  private async answerNewTabSuggest(tab: Tab, wc: Electron.WebContents, raw: string): Promise<void> {
    const q = raw.trim().slice(0, 120);
    const send = (items: { kind: 'search' | 'site'; text: string; url?: string }[]) => {
      if (wc.isDestroyed() || !tab.isNewTabPage) return;
      wc.executeJavaScript(
        `window.__dashSuggest&&window.__dashSuggest(${JSON.stringify({ q, items })})`
      ).catch(() => undefined);
    };
    if (!q) return send([]);
    const settings = this.getSettings();
    const local = getDatabase()
      .querySuggestions(q, 3)
      .map((s) => ({ kind: 'site' as const, text: s.title || s.url, url: s.url }));
    // Show what is on this device straight away, then add the engine's suggestions when they arrive.
    if (local.length) send(local);
    if (!settings.searchSuggestions || tab.isPrivate) return;
    const web = await fetchWebSuggestions(settings.searchEngine, q);
    send([...web.map((text) => ({ kind: 'search' as const, text })), ...local]);
  }

  /** F11: real full screen. Works from the page and from the toolbar. */
  toggleFullScreen(): void {
    if (this.win.isDestroyed()) return;
    if (this.htmlFsTabId) {
      this.leaveHtmlFullScreen(true);
      return;
    }
    this.win.setFullScreen(!this.win.isFullScreen());
  }

  private lastWindowBg = '';

  /** Tab whose page is in HTML fullscreen (a YouTube video, say). Its view then fills the whole window. */
  private htmlFsTabId: string | null = null;
  private htmlFsWasWindowFullScreen = false;
  private htmlFsHidden: WebContentsView[] = [];

  private enterHtmlFullScreen(tab: Tab): void {
    if (this.win.isDestroyed() || appLockProbe()) return;
    if (this.htmlFsTabId === tab.id) return;
    if (this.htmlFsTabId) this.leaveHtmlFullScreen(true);
    this.htmlFsTabId = tab.id;
    this.htmlFsWasWindowFullScreen = this.win.isFullScreen();
    // Other native views (split partner, side panel, devtools) must not sit on top of the video.
    const others = [this.visiblePartner()?.view, this.sidePanel?.view, this.devtoolsViews.get(tab.id)];
    for (const v of others) {
      if (!v) continue;
      try {
        v.setVisible(false);
        this.htmlFsHidden.push(v);
      } catch {
        /* view gone */
      }
    }
    if (!this.htmlFsWasWindowFullScreen) this.win.setFullScreen(true);
    this.layoutActiveView();
    // The OS needs a moment to resize the window; lay out again once it has.
    setTimeout(() => this.layoutActiveView(), 250);
  }

  /** Leaves HTML fullscreen. exitPage also tells the page to drop its fullscreen element (tab switch, close, lock). */
  private leaveHtmlFullScreen(exitPage = false): void {
    const id = this.htmlFsTabId;
    if (!id) return;
    this.htmlFsTabId = null;
    const tab = this.tabs.get(id);
    if (exitPage && tab?.view && !tab.view.webContents.isDestroyed()) {
      try {
        void tab.view.webContents
          .executeJavaScript('document.fullscreenElement && document.exitFullscreen()', true)
          .catch(() => {});
      } catch {
        /* gone */
      }
    }
    for (const v of this.htmlFsHidden) {
      try {
        v.setVisible(true);
      } catch {
        /* view gone */
      }
    }
    this.htmlFsHidden = [];
    if (!this.win.isDestroyed()) {
      if (!this.htmlFsWasWindowFullScreen && this.win.isFullScreen()) this.win.setFullScreen(false);
      this.layoutActiveView();
      setTimeout(() => this.layoutActiveView(), 250);
    }
  }

  /** setBounds on a view whose page or window is already gone throws "Object has been destroyed"; skip those. */
  private safeBounds(view: WebContentsView | null | undefined, b: Rectangle): void {
    if (!view) return;
    try {
      if (view.webContents.isDestroyed()) return;
      view.setBounds(b);
    } catch {
      /* closing */
    }
  }

  layoutActiveView(): void {
    if (this.win.isDestroyed()) return;
    if (!this.activeTabId) return;
    const tab = this.tabs.get(this.activeTabId);
    if (!tab?.view) return;
    if (appLockProbe()) {
      this.hideAllForLock();
      return;
    }
    if (this.overlayParked && this.overlayParked === tab.view) return; // parked behind an open menu; popOverlay re-lays out
    // Behind a website the window itself should be white, so any gap between two views (resize, maximise, GPU
    // surface re-creation) shows the page colour instead of the dark theme surface.
    try {
      const onSite = !tab.internalPage && !tab.isNewTabPage;
      const bg = onSite || !nativeTheme.shouldUseDarkColors ? '#ffffff' : '#0b0d10';
      if (this.lastWindowBg !== bg) {
        this.lastWindowBg = bg;
        this.win.setBackgroundColor(bg);
      }
    } catch {
      /* window closing */
    }
    const bounds = this.win.getContentBounds();
    if (this.htmlFsTabId === tab.id) {
      this.safeBounds(tab.view, { x: 0, y: 0, width: bounds.width, height: bounds.height });
      this.onLayoutDividers([]);
      this.onLayoutSplit(null);
      return;
    }
    // The first-run welcome fills the whole window (no tab strip or toolbar), like an installer's first screen.
    const fullWindow = tab.internalPage === 'welcome';
    const top = fullWindow
      ? 0
      : TOOLBAR_HEIGHT + (this.getSettings().showBookmarksBar ? BOOKMARKS_BAR_HEIGHT : 0);
    const s = this.getSettings();
    const left = fullWindow
      ? 0
      : s.verticalTabs
        ? s.verticalTabsCollapsed
          ? VERTICAL_TABS_WIDTH_COLLAPSED
          : VERTICAL_TABS_WIDTH
        : 0;
    const full = {
      x: left,
      y: top,
      width: Math.max(0, bounds.width - left),
      height: Math.max(0, bounds.height - top),
    };
    const dividers: LayoutDivider[] = [];
    let splitLayout: SplitLayout | null = null;
    let area = full;

    // Side panel on the right of everything.
    if (this.sidePanel) {
      const pw = Math.round((full.width - PANE_GAP) * this.panelShare);
      const pageW = full.width - PANE_GAP - pw;
      this.safeBounds(this.sidePanel.view, {
        x: full.x + pageW + PANE_GAP,
        y: full.y,
        width: pw,
        height: full.height,
      });
      dividers.push({
        id: 'panel',
        axis: 'x',
        x: full.x + pageW,
        y: full.y,
        width: PANE_GAP,
        height: full.height,
        areaStart: full.x,
        areaSize: full.width,
        resetTo: 1 - DEFAULT_PANEL_SHARE,
      });
      area = { ...full, width: Math.max(0, pageW) };
    }

    // Split view: two tabs side by side.
    const partner = this.visiblePartner();
    if (partner?.view) {
      const outer = area;
      const inner = {
        x: area.x + SPLIT_PAD,
        y: area.y + SPLIT_PAD,
        width: Math.max(0, area.width - SPLIT_PAD * 2),
        height: Math.max(0, area.height - SPLIT_PAD - SPLIT_FOOT),
      };
      const half = Math.floor((inner.width - SPLIT_GAP) * this.splitRatio);
      const leftB = { x: inner.x, y: inner.y, width: half, height: inner.height };
      const rightB = {
        x: inner.x + half + SPLIT_GAP,
        y: inner.y,
        width: inner.width - half - SPLIT_GAP,
        height: inner.height,
      };
      const activeIsLeft = this.splitPair?.left === tab.id;
      this.safeBounds(partner.view, activeIsLeft ? rightB : leftB);
      dividers.push({
        id: 'split',
        axis: 'x',
        x: inner.x + half,
        y: inner.y,
        width: SPLIT_GAP,
        height: inner.height,
        areaStart: inner.x,
        areaSize: inner.width,
        resetTo: 0.5,
      });
      area = activeIsLeft ? leftB : rightB;
      splitLayout = {
        area: outer,
        panes: [
          { tabId: this.splitPair!.left, ...leftB },
          { tabId: this.splitPair!.right, ...rightB },
        ],
        activeTabId: tab.id,
      };
    }

    // Developer tools inside the active pane.
    const dt = this.devtoolsViews.get(tab.id);
    if (!dt) {
      this.safeBounds(tab.view, area);
    } else if (s.devToolsDock === 'bottom') {
      const h = Math.round((area.height - PANE_GAP) * this.devtoolsShare);
      const pageH = area.height - PANE_GAP - h;
      this.safeBounds(tab.view, { ...area, height: pageH });
      this.safeBounds(dt, { x: area.x, y: area.y + pageH + PANE_GAP, width: area.width, height: h });
      dividers.push({
        id: 'devtools',
        axis: 'y',
        x: area.x,
        y: area.y + pageH,
        width: area.width,
        height: PANE_GAP,
        areaStart: area.y,
        areaSize: area.height,
        resetTo: 1 - DEFAULT_DEVTOOLS_SHARE,
      });
    } else {
      const w = Math.round((area.width - PANE_GAP) * this.devtoolsShare);
      const pageW = area.width - PANE_GAP - w;
      this.safeBounds(tab.view, { ...area, width: pageW });
      this.safeBounds(dt, { x: area.x + pageW + PANE_GAP, y: area.y, width: w, height: area.height });
      dividers.push({
        id: 'devtools',
        axis: 'x',
        x: area.x + pageW,
        y: area.y,
        width: PANE_GAP,
        height: area.height,
        areaStart: area.x,
        areaSize: area.width,
        resetTo: 1 - DEFAULT_DEVTOOLS_SHARE,
      });
    }
    this.onLayoutDividers(dividers);
    this.onLayoutSplit(splitLayout);
  }

  /** Tears down a background tab's renderer process to reclaim real memory. Never sleeps the active tab. */
  private sleepEligibleTabs(): void {
    if (!this.getSettings().sleepingTabsEnabled) return;
    const thresholdMs = SLEEP_THRESHOLD_MINUTES * 60_000;
    const now = Date.now();

    for (const tab of this.tabs.values()) {
      if (tab.isActive || tab.isSleeping || !tab.view) continue;
      if (this.partnerOf(tab.id) === this.activeTabId) continue; // visible beside the active tab
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
      tab.lastKnownUrl =
        failedUrlFromErrorPage(tab.view.webContents.getURL()) ??
        (tab.view.webContents.getURL() || tab.lastKnownUrl);
      tab.lastKnownTitle = tab.view.webContents.getTitle() || tab.lastKnownTitle;
    }

    if (tab.internalPage) this.untrustInternalPage(tab.view.webContents.id);
    try {
      const pid = tab.view.webContents.getOSProcessId();
      // Only count memory that really goes away: skip if another live tab shares this renderer process.
      const shared = [...this.tabs.values()].some(
        (t) =>
          t !== tab &&
          t.view &&
          !t.view.webContents.isDestroyed() &&
          t.view.webContents.getOSProcessId() === pid
      );
      const m = shared ? undefined : app.getAppMetrics().find((x) => x.pid === pid);
      if (m) this.freedKb += m.memory.workingSetSize;
    } catch {
      /* metrics unavailable: skip the estimate */
    }
    this.closeDevtools(tab);
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

  /** Installs the web app the tab is showing (the address bar's Install button). */
  installWebApp(tabId: string): InstallResult {
    const d = this.tabs.get(tabId)?.webApp;
    if (!d) return { ok: false, error: 'This page can no longer be installed.' };
    const r = installWebApp(d);
    const tab = this.tabs.get(tabId);
    if (tab) this.onStateChange(this.getTabState(tab));
    return r;
  }

  private spareView: WebContentsView | null = null;
  private spareTimer: NodeJS.Timeout | null = null;

  /** Starts an empty internal-page renderer in the background, ready for the next Settings / History / ... tab. */
  prewarmInternalPage(): void {
    if (this.spareView || this.win.isDestroyed() || process.env.DASH_NOSPARE) return;
    const v = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        plugins: true,
        session: session.defaultSession,
        preload: this.internalPagePreloadPath,
      },
    });
    this.spareView = v;
    v.webContents.loadURL('about:blank').catch(() => undefined);
  }

  private takeSpare(): WebContentsView | null {
    const v = this.spareView;
    this.spareView = null;
    // Start the next spare once the page that took this one has had time to open.
    if (this.spareTimer) clearTimeout(this.spareTimer);
    this.spareTimer = setTimeout(() => this.prewarmInternalPage(), 1500);
    return v && !v.webContents.isDestroyed() ? v : null;
  }

  private materialize(tab: Tab, requestedUrl: string): void {
    // Every way a tab gets a page (new tab, restored session, waking from sleep, a link) ends up here, so a locked
    // website is held back at this one point as well.
    let url = requestedUrl;
    if (!(url in INTERNAL_URL_TO_PAGE) && getWebsiteLock().blockingSite(url)) {
      tab.lockPending = { url };
      url = INTERNAL_PAGE_URLS.lock;
    }
    const internalPage = INTERNAL_URL_TO_PAGE[url] ?? null;

    // Internal pages (Settings, History...) take a pre-started spare renderer when there is one: starting a
    // renderer process is the slow part of opening them, and it can be done in advance, in the background.
    const spare = internalPage && !tab.isPrivate && !tab.containerId ? this.takeSpare() : null;
    const view =
      spare ??
      new WebContentsView({
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          // Enables Chromium's built-in PDF viewer.
          plugins: true,
          // Private tabs get a dedicated in-memory session that shares nothing
          // with the normal profile; normal tabs use the persistent default.
          session: tab.isPrivate
            ? this.privateSession
            : (tab.containerId && this.getContainerSession(tab.containerId)) || session.defaultSession,
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
    if (tab.isPrivate) {
      // Never let WebRTC reveal a local/real IP from a private tab (only proxied UDP is allowed).
      view.webContents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp');
    }
    this.unpainted.add(view);
    view.webContents.once('dom-ready', () => this.unpainted.delete(view));
    tab.isNewTabPage = url === NEW_TAB_URL;
    tab.internalPage = internalPage;
    this.applyThemeBackground();
    this.wireEvents(tab);
    view.webContents.setZoomFactor(tab.zoomFactor);
    view.webContents.setAudioMuted(tab.isMuted);
    this.wirePopupHandling(view, tab);
    this.wireLockGuard(view, tab);
    this.wireContextMenu(view, tab);

    if (
      tab.isPrivate &&
      !internalPage &&
      tab.privateVpn === undefined &&
      this.getSettings().privateAutoVpn &&
      this.vpnForPrivate
    ) {
      // Bring the VPN up first, so a private tab's first request never leaves from the real address.
      tab.privateVpn = 'connecting';
      tab.heldUrl = url;
      view.webContents
        .loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(this.newTabHtml(tab))}`)
        .catch(() => undefined);
      void this.vpnForPrivate.ensure().then((outcome) => {
        if (!this.tabs.has(tab.id) || view.webContents.isDestroyed()) return;
        tab.privateVpn = outcome;
        if (outcome === 'failed') {
          // Stay on the notice page; the person decides (retry, or browse without the VPN).
          view.webContents
            .loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(this.newTabHtml(tab))}`)
            .catch(() => undefined);
          return;
        }
        this.continuePrivateLoad(tab, view);
      });
      return;
    }

    this.loadTabContent(tab, view, url);
  }

  /** The VPN is ready (or the person chose to go without it): load what the private tab was opened for. */
  private continuePrivateLoad(tab: Tab, view: WebContentsView): void {
    const url = tab.heldUrl ?? NEW_TAB_URL;
    tab.heldUrl = undefined;
    if (!this.tabs.has(tab.id) || view.webContents.isDestroyed()) return;
    this.loadTabContent(tab, view, url);
  }

  private loadTabContent(tab: Tab, view: WebContentsView, url: string): void {
    const internalPage = tab.internalPage;
    if (tab.isNewTabPage) {
      // Real top sites, computed fresh every time the New Tab Page opens —
      // never stale placeholder data. No preload/IPC bridge needed at all:
      // it's a self-contained document with real <a href> links and a real
      // <form> for search, so ordinary navigation handles everything.
      const html = this.newTabHtml(tab);
      view.webContents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch((err) => {
        if (!/ERR_ABORTED/.test(String(err.message)))
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
  /**
   * Website Lock, first line of defence: top-level navigations and redirects to a locked website are stopped before
   * a request is made. (The session's request hook is the second line and catches whatever these events do not.)
   */
  private wireLockGuard(view: WebContentsView, tab: Tab): void {
    const wc = view.webContents;
    const guard = (
      event: Electron.Event<
        Electron.WebContentsWillNavigateEventParams | Electron.WebContentsWillRedirectEventParams
      >,
      url: string
    ) => {
      if (event.isMainFrame === false || !/^https?:/i.test(url) || !getWebsiteLock().blockingSite(url))
        return;
      event.preventDefault();
      setImmediate(() => {
        if (this.tabs.has(tab.id)) this.showLock(tab, url);
      });
    };
    wc.on('will-navigate', guard);
    wc.on('will-redirect', guard);
  }

  private wirePopupHandling(view: WebContentsView, tab: Tab): void {
    view.webContents.setWindowOpenHandler((details) => {
      // A popup to a locked website would open a bare window with nothing to unlock it: make it a tab with the lock screen.
      if (/^https?:/i.test(details.url) && getWebsiteLock().blockingSite(details.url)) {
        setImmediate(() => this.createTab(details.url, tab.isPrivate));
        return { action: 'deny' };
      }
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
    return {
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
    };
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
  private fillLogin(
    wc: Electron.WebContents,
    cred: { username: string; password: string },
    force: boolean
  ): void {
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
            items.push({
              label: `Fill login: ${l.username || '(no username)'}`,
              click: () => this.fillLogin(wc, l, true),
            });
          }
          items.push(
            { label: 'Use a strong password', click: () => this.fillGenerated(wc, this.generatePassword()) },
            { type: 'separator' }
          );
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
          {
            label: 'Back',
            enabled: wc.navigationHistory.canGoBack(),
            click: () => wc.navigationHistory.goBack(),
          },
          {
            label: 'Forward',
            enabled: wc.navigationHistory.canGoForward(),
            click: () => wc.navigationHistory.goForward(),
          },
          { label: 'Reload', click: () => wc.reload() },
          { type: 'separator' },
          {
            label: 'Save page as…',
            click: () => {
              void this.promptSavePage(tab.id);
            },
          },
          { label: 'Print…', click: () => this.print(tab.id) },
          {
            label: 'Translate page…',
            enabled: /^https?:/i.test(wc.getURL()),
            click: () => {
              void this.translatePage(tab.id);
            },
          },
          {
            label: 'Print preview',
            click: () => {
              void this.printPreview(tab.id);
            },
          },
          {
            label: 'Save as PDF…',
            click: () => {
              void this.savePdfDialog(tab.id);
            },
          }
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

    // The New Tab page is a plain page with no bridge to the app. It reports what is typed in its search box as a
    // console line; the answer (suggestions) is pushed back into the page. Only that page, only short text.
    wc.on('console-message', (_e, _level, message) => {
      if (!tab.isNewTabPage || !message.startsWith(NEWTAB_SUGGEST_PREFIX)) return;
      void this.answerNewTabSuggest(tab, wc, message.slice(NEWTAB_SUGGEST_PREFIX.length));
    });

    wc.on('audio-state-changed', push);

    // Real HTML fullscreen (YouTube's button, F in the player): the page fills the whole window, Esc brings it back.
    wc.on('enter-html-full-screen', () => this.enterHtmlFullScreen(tab));
    wc.on('leave-html-full-screen', () => {
      if (this.htmlFsTabId === tab.id) this.leaveHtmlFullScreen();
    });

    // Browser shortcuts must work while the page has focus.
    wc.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && input.key === 'Escape' && this.htmlFsTabId === tab.id) {
        this.leaveHtmlFullScreen(true);
        return;
      }
      if (input.type === 'keyDown' && input.key === 'F11') {
        event.preventDefault();
        this.toggleFullScreen();
        return;
      }
      if (appLockProbe()) return; // locked: no browser shortcuts
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

    // The native view shows its own background until the new page paints its first frame. Pick the colour for where
    // the tab is GOING: DASH's own pages (data: New Tab/error pages) use the theme surface, websites use white (what
    // sites assume). Without this a tab that started as the New Tab flashed dark when navigating to a website.
    wc.on('did-start-navigation', (_e, navUrl, isInPlace, isMainFrame) => {
      if (!isMainFrame || isInPlace || !tab.view) return;
      if (this.splitPair && (this.splitPair.left === tab.id || this.splitPair.right === tab.id)) return;
      const own = tab.internalPage || /^data:text\/html/i.test(navUrl) || /^dash:/i.test(navUrl);
      try {
        tab.view.setBackgroundColor(
          own ? (nativeTheme.shouldUseDarkColors ? '#0b0d10' : '#ffffff') : '#ffffff'
        );
      } catch {
        /* view destroyed */
      }
    });

    // A cross-document navigation can swap in a fresh render widget whose default background follows the OS theme
    // (dark), so re-assert the colour at every stage of the navigation, not just its start.
    const reassertBackground = (): void => {
      if (!tab.view) return;
      if (this.splitPair && (this.splitPair.left === tab.id || this.splitPair.right === tab.id)) return;
      const url = wc.getURL();
      const own = tab.internalPage || /^data:text\/html/i.test(url) || /^dash:/i.test(url);
      try {
        tab.view.setBackgroundColor(
          own ? (nativeTheme.shouldUseDarkColors ? '#0b0d10' : '#ffffff') : '#ffffff'
        );
      } catch {
        /* view destroyed */
      }
    };
    wc.on('dom-ready', () => {
      if (this.splitPair && (this.splitPair.left === tab.id || this.splitPair.right === tab.id))
        void this.applySplitStyle(tab);
    });
    for (const ev of [
      'did-start-loading',
      'did-redirect-navigation',
      'did-navigate',
      'did-frame-navigate',
      'dom-ready',
    ] as const) {
      wc.on(ev as 'dom-ready', reassertBackground);
    }

    // Dark theme only: Chromium paints the incoming document's widget in the OS-theme colour before the page has
    // drawn anything, which shows as a dark flash on white sites. Hide the view for that gap (the white backdrop in
    // the chrome shows instead) and bring it back once the new document is ready.
    let hiddenForNav = false;
    const showAgain = (): void => {
      if (!hiddenForNav) return;
      hiddenForNav = false;
      try {
        tab.view?.setVisible(true);
      } catch {
        /* view destroyed */
      }
    };
    wc.on('did-start-navigation', (_e, navUrl, isInPlace, isMainFrame) => {
      if (!isMainFrame || isInPlace || !tab.view || !nativeTheme.shouldUseDarkColors) return;
      if (tab.isNewTabPage || tab.internalPage || !/^https?:/i.test(navUrl)) return;
      hiddenForNav = true;
      try {
        tab.view.setVisible(false);
      } catch {
        /* view destroyed */
      }
      setTimeout(showAgain, 1500);
    });
    wc.on('dom-ready', () => setTimeout(showAgain, 80));
    wc.on('did-fail-load', showAgain);

    // Ctrl+wheel and trackpad pinch (Chromium reports both as ctrl+wheel). Electron doesn't zoom by itself.
    wc.setVisualZoomLevelLimits(1, 1).catch(() => undefined);
    wc.on('zoom-changed', (_e, direction) => {
      if (tab.internalPage || tab.isNewTabPage) return;
      if (direction === 'in') this.zoomIn(tab.id);
      else this.zoomOut(tab.id);
    });

    // Clicking into the other pane of a split makes that tab the active one (address bar, shortcuts follow it).
    wc.on('focus', () => {
      if (this.splitPair && this.activeTabId !== tab.id && this.partnerOf(tab.id) === this.activeTabId)
        this.switchTab(tab.id);
    });

    wc.on('unresponsive', () => {
      void this.promptUnresponsive(tab.id);
    });
    wc.on('will-navigate', (event, targetUrl) => {
      if ((tab.isNewTabPage || tab.heldUrl !== undefined) && targetUrl.startsWith(NEWTAB_ACTION_PREFIX)) {
        event.preventDefault();
        let reload = true;
        try {
          const u = new URL(targetUrl);
          const db = getDatabase();
          if (u.pathname === '/open-settings') {
            reload = false;
            this.createTab('dash://settings');
          } else if (u.pathname === '/split-pick') {
            reload = false;
            this.pickIntoSplit(tab.id, u.searchParams.get('tab') ?? '');
          } else if (tab.isPrivate && u.pathname === '/retry-vpn') {
            reload = false;
            tab.privateVpn = 'connecting';
            const v = tab.view;
            if (v)
              v.webContents
                .loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(this.newTabHtml(tab))}`)
                .catch(() => undefined);
            if (v && this.vpnForPrivate) {
              void this.vpnForPrivate.ensure().then((outcome) => {
                if (!this.tabs.has(tab.id) || v.webContents.isDestroyed()) return;
                tab.privateVpn = outcome;
                if (outcome === 'failed')
                  v.webContents
                    .loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(this.newTabHtml(tab))}`)
                    .catch(() => undefined);
                else this.continuePrivateLoad(tab, v);
              });
            }
          } else if (tab.isPrivate && u.pathname === '/browse-without-vpn') {
            reload = false;
            tab.privateVpn = 'bypassed';
            if (tab.view) this.continuePrivateLoad(tab, tab.view);
          } else if (tab.isPrivate) {
            /* a private tab never changes the saved shortcuts */
          } else if (u.pathname === '/remove') {
            const host = u.searchParams.get('host');
            if (host && host.length < 256) {
              // Gone for good (no restore): a custom shortcut is deleted, and an automatic one never comes back.
              db.removeCustomShortcut(host);
              db.hideSite(host);
            }
            reload = false; // the page already removed the tile itself; reloading would flash the whole home page
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
        if (!reload) return;
        setImmediate(() => {
          const html = this.newTabHtml(tab);
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
      // -20 is a request DASH itself cancelled; for a locked website the lock screen is already on its way.
      if (errorCode === -20 && getWebsiteLock().blockingSite(validatedURL)) return;
      if (!/^https?:|^ftp:/i.test(validatedURL)) return;
      // Connection-type failures: remember them so the page loads by itself when the network comes back.
      retryWhenOnline =
        [-106, -105, -109, -21, -118, -7, -100, -101, -102].includes(errorCode) &&
        /^https?:/i.test(validatedURL)
          ? validatedURL
          : null;
      wc.loadURL(
        buildErrorPageDataUrl(validatedURL, errorCode, errorDescription, nativeTheme.shouldUseDarkColors)
      ).catch(() => undefined);
    });
    // "You're offline" pages retry on their own once Windows reports a connection again (checked every 3 s, only while such a page is up).
    let retryWhenOnline: string | null = null;
    let wasOnline = net.isOnline();
    const onlineTimer = setInterval(() => {
      if (wc.isDestroyed()) {
        clearInterval(onlineTimer);
        return;
      }
      const now = net.isOnline();
      const url = retryWhenOnline;
      if (now && !wasOnline && url && failedUrlFromErrorPage(wc.getURL()) === url) {
        retryWhenOnline = null;
        this.navigate(tab.id, url);
      }
      wasOnline = now;
    }, 3000);
    wc.on('did-finish-load', () => {
      if (!wc.getURL().startsWith('data:')) retryWhenOnline = null;
    });
    wc.once('destroyed', () => clearInterval(onlineTimer));
    wc.on('will-navigate', (event, targetUrl) => {
      if (targetUrl === NEW_TAB_URL && failedUrlFromErrorPage(wc.getURL())) {
        event.preventDefault();
        this.navigate(tab.id, NEW_TAB_URL);
        return;
      }
      if (targetUrl.startsWith(PROXYFIX_PREFIX)) {
        event.preventDefault();
        let retryUrl = '';
        try {
          retryUrl = new URL(targetUrl).searchParams.get('url') ?? '';
        } catch {
          /* ignore */
        }
        void directNetworkHook().then(() => {
          if (/^https?:/i.test(retryUrl)) this.navigate(tab.id, retryUrl);
        });
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
    // Is this page an installable web app? Checked once it has loaded; never for private tabs or DASH's own pages.
    wc.on('did-finish-load', () => {
      if (tab.isPrivate || tab.internalPage || tab.isNewTabPage || wc.isDestroyed()) return;
      const url = wc.getURL();
      void detectWebApp(wc, wc.session).then((d) => {
        if (wc.isDestroyed() || wc.getURL() !== url) return;
        tab.webApp = d;
        push();
      });
    });
    wc.on('did-start-navigation', (_e, _url, isInPlace, isMainFrame) => {
      if (isMainFrame && !isInPlace && tab.webApp) {
        tab.webApp = null;
        push();
      }
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
      // Apply the zoom saved for this site (or the default) so it survives restarts and new tabs.
      const wanted = this.desiredZoomFor(tab);
      if (wanted !== tab.zoomFactor) {
        tab.zoomFactor = wanted;
        wc.setZoomFactor(wanted);
      }
      push();
    });
    wc.on('did-navigate-in-page', push);
  }

  private getTabState(tab: Tab): TabState {
    return {
      ...this.getTabStateBase(tab),
      inSplit: this.splitPair !== null && (this.splitPair.left === tab.id || this.splitPair.right === tab.id),
    };
  }

  private getTabStateBase(tab: Tab): Omit<TabState, 'inSplit'> {
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
        isAudible: false,
        zoomPercent: Math.round(tab.zoomFactor * 100),
        group: this.groupOf(tab),
        container: tab.containerId ? this.getContainer(tab.containerId) : null,
      };
    }
    if (tab.internalPage) {
      const titles: Record<InternalPageId, string> = {
        history: 'History',
        downloads: 'Downloads',
        bookmarks: 'Bookmarks',
        settings: 'Settings',
        welcome: 'Welcome to DASH',
        notes: 'Notes',
        archive: 'Saved pages',
        ai: 'AI helper',
        lock: 'Locked',
        websitelock: 'Website Lock',
      };
      return {
        id: tab.id,
        title: tab.lockPending
          ? `Locked · ${new URL(tab.lockPending.url).hostname}`
          : titles[tab.internalPage],
        // On the lock screen the address bar shows the page being unlocked, so it is clear what is waiting.
        url: tab.lockPending?.url ?? INTERNAL_PAGE_URLS[tab.internalPage],
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
        isAudible: false,
        zoomPercent: Math.round(tab.zoomFactor * 100),
        group: this.groupOf(tab),
        container: null,
      };
    }
    const failedUrl = wc ? failedUrlFromErrorPage(wc.getURL()) : null;
    return {
      id: tab.id,
      title: wc ? wc.getTitle() || wc.getURL() || 'New Tab' : tab.lastKnownTitle,
      url: tab.lockPending?.url ?? failedUrl ?? (wc ? wc.getURL() : tab.lastKnownUrl),
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
      isAudible: !!wc && !wc.isDestroyed() && wc.isCurrentlyAudible(),
      zoomPercent: Math.round(tab.zoomFactor * 100),
      webApp: tab.webApp
        ? {
            name: tab.webApp.name,
            startUrl: tab.webApp.startUrl,
            icon: tab.webApp.icon,
            installedId: installedIdFor(tab.webApp.startUrl),
          }
        : null,
      group: this.groupOf(tab),
      container: tab.containerId ? this.getContainer(tab.containerId) : null,
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
