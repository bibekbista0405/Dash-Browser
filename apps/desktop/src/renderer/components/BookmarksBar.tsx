import { useBookmarksStore } from '../store/bookmarks-store';
import { useTabsStore, activeTabOf } from '../store/tabs-store';

/** Single-row favorites bar. Click opens in the current tab, middle-click in a new tab, × removes. */
export function BookmarksBar() {
  const bookmarks = useBookmarksStore((s) => s.bookmarks);
  const remove = useBookmarksStore((s) => s.remove);
  const activeTab = useTabsStore(activeTabOf);
  const ordered = [...bookmarks].reverse();

  if (ordered.length === 0) {
    return (
      <div className="h-8 flex items-center px-3 text-xs text-text-secondary border-b border-border/40">
        Bookmark pages with Ctrl+D and they will appear here.
      </div>
    );
  }

  return (
    <div className="h-8 flex items-center gap-1 px-2 overflow-hidden border-b border-border/40">
      {ordered.map((b) => (
        <div key={b.id} className="group relative shrink-0">
          <button
            title={b.title}
            onClick={() => (activeTab ? window.dash.tabs.navigate(activeTab.id, b.url) : window.dash.tabs.create(b.url))}
            onAuxClick={(e) => {
              if (e.button === 1) window.dash.tabs.create(b.url);
            }}
            className="flex items-center gap-1.5 h-6 max-w-[150px] pl-2 pr-5 rounded-md text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary"
          >
            {b.faviconUrl ? (
              <img src={b.faviconUrl} alt="" className="w-3.5 h-3.5 rounded-sm" onError={(e) => (e.currentTarget.style.display = 'none')} />
            ) : null}
            <span className="truncate">{b.title || b.url}</span>
          </button>
          <button
            aria-label="Remove bookmark"
            onClick={() => remove(b.id)}
            className="hidden group-hover:flex absolute right-0.5 top-1/2 -translate-y-1/2 w-4 h-4 items-center justify-center rounded text-text-secondary hover:bg-surface-elevated"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
