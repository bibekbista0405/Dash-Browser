import { useEffect, useState } from 'react';
import { HistoryPage } from './pages/HistoryPage';
import { DownloadsPage } from './pages/DownloadsPage';
import { BookmarksPage } from './pages/BookmarksPage';
import { SettingsPage } from './pages/SettingsPage';
import { WelcomePage } from './pages/WelcomePage';
import { NotesPage } from './pages/NotesPage';
import { ArchivePage } from './pages/ArchivePage';
import { AiPage } from './pages/AiPage';
import { LockScreen } from './pages/LockScreen';
import { WebsiteLockPage } from './pages/WebsiteLockPage';
import { Logo } from './components/Logo';
import { useAppCustomCss } from './hooks/useAppCustomCss';
import { useAccessibility } from './hooks/useAccessibility';
import { useTheme } from './hooks/useTheme';
import { useSettingsStore } from './store/settings-store';

type PageId = 'history' | 'downloads' | 'bookmarks' | 'settings' | 'welcome' | 'notes' | 'ai' | 'archive' | 'lock' | 'websitelock';

const PAGE_TITLES: Record<PageId, string> = {
  history: 'History',
  downloads: 'Downloads',
  bookmarks: 'Bookmarks',
  settings: 'Settings',
  welcome: 'Welcome',
  notes: 'Notes',
  ai: 'AI helper',
  archive: 'Saved pages',
  lock: 'Locked',
  websitelock: 'Website Lock',
};

const PAGE_ICONS: Record<PageId, string> = {
  history: '↺',
  downloads: '⬇',
  bookmarks: '★',
  settings: '⚙',
  welcome: '',
  notes: '✎',
  ai: '✦',
  archive: '⤓',
  lock: '',
  websitelock: '⛨',
};

function readParams(): { page: PageId; tabId: string } {
  const params = new URLSearchParams(window.location.search);
  const page = (params.get('page') as PageId) || 'history';
  const tabId = params.get('tabId') || '';
  return { page, tabId };
}

/**
 * The shell every internal page (dash://history, dash://downloads,
 * dash://bookmarks, dash://settings) renders inside. This is a REAL tab —
 * loaded via loadFile with a real preload attached, so it has genuine
 * window.dash access, not a simulated one. Switching sections uses real
 * navigation (an actual dash:// link click, intercepted by TabManager),
 * which is why each sidebar item is a plain <a>, not client-side routing.
 */
export default function InternalApp() {
  const [{ page: initialPage, tabId }] = useState(readParams);
  const [page, setPage] = useState<PageId>(initialPage);
  const settingsStore = useSettingsStore();

  useTheme(settingsStore.settings.theme, settingsStore.isLoaded);
  useAppCustomCss(settingsStore.settings);
  useAccessibility(settingsStore.settings);

  useEffect(() => {
    settingsStore.load();
    const unsubscribe = settingsStore.subscribe();
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.title = `${PAGE_TITLES[page]} — DASH`;
  }, [page]);

  // Switching sections happens in place: no new page load, so it is instant. The address in the URL is kept in step
  // (a reload stays on this section) and the main process is told so the tab title and address bar follow.
  const goTo = (id: PageId) => {
    if (id === page) return;
    setPage(id);
    try {
      const params = new URLSearchParams(window.location.search);
      params.set('page', id);
      window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}${window.location.hash}`);
    } catch {
      /* the URL is only a convenience */
    }
    void window.dash.internal.pageChanged(id).catch(() => undefined);
  };

  if (page === 'welcome') return <WelcomePage />;
  if (page === 'lock') return <LockScreen />;

  // Docked side panel: same page, no sidebar, with a header and close button.
  if (tabId === 'panel') {
    return (
      <div className="h-screen w-screen flex flex-col bg-surface text-text-primary overflow-hidden border-l border-border">
        <div className="h-10 shrink-0 flex items-center justify-between px-3 border-b border-border">
          <span className="text-[13px] font-medium">{PAGE_TITLES[page]}</span>
          <button aria-label="Close panel" className="h-7 w-7 rounded hover:bg-surface-hover text-text-secondary" onClick={() => void window.dash.sidePanel.close()}>
            ✕
          </button>
        </div>
        <div className="flex-1 min-h-0">
          {page === 'notes' && <NotesPage compact />}
          {page === 'ai' && <AiPage compact />}
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex bg-surface text-text-primary overflow-hidden">
      <nav className="w-14 md:w-52 shrink-0 border-r border-border bg-surface-elevated flex flex-col py-4">
        <div className="px-4 md:px-4 pb-4 flex items-center justify-center md:justify-start gap-2 text-[13px] font-semibold text-text-primary tracking-[0.18em]">
          <Logo size={22} />
          <span className="hidden md:inline">DASH</span>
        </div>
        {(Object.keys(PAGE_TITLES) as PageId[]).filter((id) => id !== 'welcome' && id !== 'lock').map((id) => (
          <a
            key={id}
            href={`dash://${id}`}
            title={PAGE_TITLES[id]}
            aria-current={id === page ? 'page' : undefined}
            onClick={(e) => {
              // Plain left click switches in place; modified clicks keep the link behaviour (open in a new tab).
              if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
              e.preventDefault();
              goTo(id);
            }}
            className={`flex items-center justify-center md:justify-start gap-3 mx-2 px-3 h-9 rounded-full text-[13px] transition-colors ${
              id === page
                ? 'bg-accent/15 text-accent font-medium'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            <span className="w-4 text-center">{PAGE_ICONS[id]}</span>
            <span className="hidden md:inline">{PAGE_TITLES[id]}</span>
          </a>
        ))}
      </nav>

      <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden">
        <div key={page} className="dash-page-enter min-h-full">
        {page === 'history' && <HistoryPage tabId={tabId} />}
        {page === 'downloads' && <DownloadsPage />}
        {page === 'bookmarks' && <BookmarksPage tabId={tabId} />}
        {page === 'settings' && <SettingsPage />}
        {page === 'notes' && <NotesPage />}
        {page === 'archive' && <ArchivePage />}
        {page === 'ai' && <AiPage />}
        {page === 'websitelock' && <WebsiteLockPage />}
        </div>
      </main>
    </div>
  );
}
