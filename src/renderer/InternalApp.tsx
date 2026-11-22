import { useEffect, useState } from 'react';
import { HistoryPage } from './pages/HistoryPage';
import { DownloadsPage } from './pages/DownloadsPage';
import { BookmarksPage } from './pages/BookmarksPage';
import { SettingsPage } from './pages/SettingsPage';
import { useTheme } from './hooks/useTheme';
import { useSettingsStore } from './store/settings-store';

type PageId = 'history' | 'downloads' | 'bookmarks' | 'settings';

const PAGE_TITLES: Record<PageId, string> = {
  history: 'History',
  downloads: 'Downloads',
  bookmarks: 'Bookmarks',
  settings: 'Settings',
};

const PAGE_ICONS: Record<PageId, string> = {
  history: '↺',
  downloads: '⬇',
  bookmarks: '★',
  settings: '⚙',
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
  const [{ page, tabId }] = useState(readParams);
  const settingsStore = useSettingsStore();

  useTheme(settingsStore.settings.theme);

  useEffect(() => {
    settingsStore.load();
    const unsubscribe = settingsStore.subscribe();
    document.title = `${PAGE_TITLES[page]} — DASH`;
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="h-screen w-screen flex bg-surface text-text-primary overflow-hidden">
      <nav className="w-52 shrink-0 border-r border-border bg-surface-elevated flex flex-col py-4">
        <div className="px-4 pb-4 text-[13px] font-semibold text-text-secondary tracking-wide">DASH</div>
        {(Object.keys(PAGE_TITLES) as PageId[]).map((id) => (
          <a
            key={id}
            href={`dash://${id}`}
            className={`flex items-center gap-3 mx-2 px-3 py-2 rounded-lg text-[13px] transition-colors ${
              id === page
                ? 'bg-accent/15 text-accent'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            <span className="w-4 text-center">{PAGE_ICONS[id]}</span>
            {PAGE_TITLES[id]}
          </a>
        ))}
      </nav>

      <main className="flex-1 overflow-y-auto">
        {page === 'history' && <HistoryPage tabId={tabId} />}
        {page === 'downloads' && <DownloadsPage />}
        {page === 'bookmarks' && <BookmarksPage tabId={tabId} />}
        {page === 'settings' && <SettingsPage />}
      </main>
    </div>
  );
}
