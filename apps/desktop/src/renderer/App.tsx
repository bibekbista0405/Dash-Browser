import { VERTICAL_TABS_WIDTH, VERTICAL_TABS_WIDTH_COLLAPSED } from '../shared/ipc-channels';
import { useEffect, useRef, useState } from 'react';
import { ShortcutsHelp } from './components/ShortcutsHelp';
import { TabStrip } from './components/TabStrip';
import { AddressBar } from './components/AddressBar';
import { FindBar } from './components/FindBar';
import { BookmarksBar } from './components/BookmarksBar';
import { TabSearch } from './components/TabSearch';
import { TaskManager } from './components/TaskManager';
import { PasswordSavePrompt } from './components/PasswordSavePrompt';
import { PermissionPrompt } from './components/PermissionPrompt';
import { useOverlayStore } from './store/overlay-store';
import { useTabsStore, activeTabOf } from './store/tabs-store';
import { LayoutDividers } from './components/SplitDivider';
import { SplitFrames } from './components/SplitFrames';
import { AppLockGate } from './components/AppLockGate';
import { useBookmarksStore } from './store/bookmarks-store';
import { useDownloadsStore } from './store/downloads-store';
import { useSettingsStore } from './store/settings-store';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useAppCustomCss } from './hooks/useAppCustomCss';
import { useAccessibility } from './hooks/useAccessibility';
import { useTheme } from './hooks/useTheme';

const INTERNAL_PAGE_URLS = {
  history: 'dash://history',
  downloads: 'dash://downloads',
  bookmarks: 'dash://bookmarks',
  settings: 'dash://settings',
} as const;

/**
 * The React tree only ever renders the browser CHROME (tab strip, address
 * bar, and transient overlays like Find/Task Manager/Tab Search). History,
 * Downloads, Bookmarks, and Settings are real TABS now (dash://history
 * etc.), not overlay panels — each is a real WebContentsView loaded from
 * the internal-pages build with genuine window.dash access, positioned by
 * the main process below this UI exactly like any other tab.
 */
export default function App() {
  const tabsStore = useTabsStore();
  const bookmarksStore = useBookmarksStore();
  const downloadsStore = useDownloadsStore();
  const settingsStore = useSettingsStore();
  const [findBarOpen, setFindBarOpen] = useState(false);
  const [tabSearchOpen, setTabSearchOpen] = useState(false);
  const [taskManagerOpen, setTaskManagerOpen] = useState(false);
  const addressInputRef = useRef<HTMLInputElement>(null);

  useTheme(settingsStore.settings.theme, settingsStore.isLoaded);
  useAppCustomCss(settingsStore.settings);
  useAccessibility(settingsStore.settings);

  useEffect(() => {
    tabsStore.initialize();
    bookmarksStore.load();
    downloadsStore.load();
    settingsStore.load();
    const unsubscribeDownloads = downloadsStore.subscribe();
    const unsubscribeSettings = settingsStore.subscribe();
    const unsubscribeBookmarks = bookmarksStore.subscribe();
    return () => {
      unsubscribeBookmarks();
      unsubscribeDownloads();
      unsubscribeSettings();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Chrome-like singleton behavior: reuse an already-open internal page tab rather than piling up duplicates. */
  const openOrFocusInternalPage = (url: string) => {
    const existing = tabsStore.tabs.find((t) => t.url === url);
    if (existing) {
      tabsStore.switchTab(existing.id);
    } else {
      window.dash.tabs.create(url);
    }
  };

  const toggleCurrentBookmark = () => {
    const active = activeTabOf(tabsStore);
    if (!active) return;
    const existing = bookmarksStore.findByUrl(active.url);
    if (existing) {
      bookmarksStore.remove(existing.id);
    } else {
      bookmarksStore.add(active.url, active.title, active.favicon);
    }
  };

  useKeyboardShortcuts({
    onFocusAddressBar: () => addressInputRef.current?.focus(),
    onToggleHistoryPanel: () => openOrFocusInternalPage(INTERNAL_PAGE_URLS.history),
    onToggleBookmarksPanel: () => openOrFocusInternalPage(INTERNAL_PAGE_URLS.bookmarks),
    onToggleCurrentBookmark: toggleCurrentBookmark,
    onToggleDownloadsPanel: () => openOrFocusInternalPage(INTERNAL_PAGE_URLS.downloads),
    onNewPrivateTab: () => tabsStore.createTab(true),
    onNewWindow: () => window.dash.windowControls.new(),
    onOpenFind: () => {
      if (findBarOpen) window.dispatchEvent(new Event('dash:focus-find'));
      else setFindBarOpen(true);
    },
    onFindNext: (forward) => {
      const active = activeTabOf(useTabsStore.getState());
      if (!findBarOpen) setFindBarOpen(true);
      else if (active) void window.dash.find.next(active.id, forward);
    },
    onOpenClearData: () => openOrFocusInternalPage(INTERNAL_PAGE_URLS.settings),
    onToggleTabSearch: () => setTabSearchOpen((v) => !v),
    onToggleTaskManager: () => setTaskManagerOpen((v) => !v),
    onToggleBookmarksBar: () => settingsStore.set('showBookmarksBar', !settingsStore.settings.showBookmarksBar),
  });

  const activeTab = activeTabOf(tabsStore);
  // Leaving the first-run welcome: the tab strip and toolbar ease in instead of popping into view.
  const onWelcome = activeTab?.url === 'dash://welcome';
  const wasWelcome = useRef(false);
  const [chromeIn, setChromeIn] = useState(false);
  useEffect(() => {
    if (wasWelcome.current && !onWelcome) {
      setChromeIn(true);
      const t = setTimeout(() => setChromeIn(false), 700);
      wasWelcome.current = onWelcome;
      return () => clearTimeout(t);
    }
    wasWelcome.current = onWelcome;
    return undefined;
  }, [onWelcome]);
  const sideWidth = settingsStore.settings.verticalTabs
    ? settingsStore.settings.verticalTabsCollapsed ? VERTICAL_TABS_WIDTH_COLLAPSED : VERTICAL_TABS_WIDTH
    : 0;
  const overlaySnapshot = useOverlayStore((s) => s.snapshot);
  const overlayImg = useRef<HTMLImageElement | null>(null);
  // Live frames of the page while a menu is open (so a video keeps moving behind it).
  useEffect(() => window.dash.overlay.onFrame((image) => { if (overlayImg.current) overlayImg.current.src = image; }), []);

  return (
    <div
      className={`relative h-screen w-screen flex flex-col text-text-primary overflow-hidden ${chromeIn ? 'dash-chrome-in' : ''}
        ${activeTab?.isPrivate ? 'bg-[#efe8fa] dark:bg-[#1a1025]' : 'bg-surface'}`}
    >
      <TabStrip />
      <div style={{ paddingLeft: sideWidth }} className="bg-surface-elevated border-b border-border/50">
      <AddressBar
        addressInputRef={addressInputRef}
        onOpenHistory={() => openOrFocusInternalPage(INTERNAL_PAGE_URLS.history)}
        onOpenBookmarks={() => openOrFocusInternalPage(INTERNAL_PAGE_URLS.bookmarks)}
        onOpenDownloads={() => openOrFocusInternalPage(INTERNAL_PAGE_URLS.downloads)}
        onOpenSettings={() => openOrFocusInternalPage(INTERNAL_PAGE_URLS.settings)}
        hasActiveDownload={downloadsStore.hasActive}
      />
      {settingsStore.settings.showBookmarksBar && <BookmarksBar />}
      </div>
      {overlaySnapshot && (
        <img
          ref={overlayImg}
          src={overlaySnapshot.image}
          alt=""
          draggable={false}
          className="absolute pointer-events-none select-none"
          style={{ left: overlaySnapshot.x, top: overlaySnapshot.y, width: overlaySnapshot.width, height: overlaySnapshot.height }}
        />
      )}
      <SplitFrames />
      <ShortcutsHelp />
      <AppLockGate />
      <LayoutDividers />
      {/* Backdrop under the native page view: white while a website is active
          so a dark theme never flashes through between page loads. */}
      <div
        aria-hidden
        className="flex-1"
        style={{ background: activeTab && !activeTab.isPrivate && /^https?:|^file:/i.test(activeTab.url) ? '#ffffff' : 'transparent' }}
      />
      {/* Remaining space below is intentionally empty — the active
          WebContentsView (including internal pages) is layered here by
          the main process. */}

      {findBarOpen && <FindBar onClose={() => setFindBarOpen(false)} />}
      {tabSearchOpen && <TabSearch onClose={() => setTabSearchOpen(false)} />}
      {taskManagerOpen && <TaskManager onClose={() => setTaskManagerOpen(false)} />}
      <PasswordSavePrompt />
      <PermissionPrompt />
    </div>
  );
}
