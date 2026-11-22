import { useEffect, useRef, useState } from 'react';
import { TabStrip } from './components/TabStrip';
import { AddressBar } from './components/AddressBar';
import { FindBar } from './components/FindBar';
import { TabSearch } from './components/TabSearch';
import { TaskManager } from './components/TaskManager';
import { PasswordSavePrompt } from './components/PasswordSavePrompt';
import { PermissionPrompt } from './components/PermissionPrompt';
import { useTabsStore, activeTabOf } from './store/tabs-store';
import { useBookmarksStore } from './store/bookmarks-store';
import { useDownloadsStore } from './store/downloads-store';
import { useSettingsStore } from './store/settings-store';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
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

  useTheme(settingsStore.settings.theme);

  useEffect(() => {
    tabsStore.initialize();
    bookmarksStore.load();
    downloadsStore.load();
    settingsStore.load();
    const unsubscribeDownloads = downloadsStore.subscribe();
    const unsubscribeSettings = settingsStore.subscribe();
    return () => {
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
    onToggleFindBar: () => setFindBarOpen((v) => !v),
    onToggleTabSearch: () => setTabSearchOpen((v) => !v),
    onToggleTaskManager: () => setTaskManagerOpen((v) => !v),
  });

  const activeTab = activeTabOf(tabsStore);

  return (
    <div
      className={`relative h-screen w-screen flex flex-col text-text-primary overflow-hidden
        ${activeTab?.isPrivate ? 'bg-[#1a1025]' : 'bg-surface'}`}
    >
      <TabStrip />
      <AddressBar
        addressInputRef={addressInputRef}
        onOpenHistory={() => openOrFocusInternalPage(INTERNAL_PAGE_URLS.history)}
        onOpenBookmarks={() => openOrFocusInternalPage(INTERNAL_PAGE_URLS.bookmarks)}
        onOpenDownloads={() => openOrFocusInternalPage(INTERNAL_PAGE_URLS.downloads)}
        onOpenSettings={() => openOrFocusInternalPage(INTERNAL_PAGE_URLS.settings)}
        hasActiveDownload={downloadsStore.hasActive}
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
