import { useEffect, useMemo, useState } from 'react';
import { useBookmarksStore } from '../store/bookmarks-store';

export function BookmarksPage({ tabId }: { tabId: string }) {
  const { bookmarks, load, remove } = useBookmarksStore();
  const [query, setQuery] = useState('');

  useEffect(() => {
    load();
  }, [load]);

  const navigate = (url: string) => {
    if (tabId) window.dash.tabs.navigate(tabId, url);
  };

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return bookmarks;
    return bookmarks.filter((b) => b.url.toLowerCase().includes(term) || b.title.toLowerCase().includes(term));
  }, [bookmarks, query]);

  const grouped = useMemo(() => {
    const groups = new Map<string, typeof filtered>();
    for (const b of filtered) {
      const key = b.folder || 'Bookmarks';
      const bucket = groups.get(key) ?? [];
      bucket.push(b);
      groups.set(key, bucket);
    }
    return Array.from(groups.entries());
  }, [filtered]);

  return (
    <div className="max-w-3xl mx-auto py-8 px-6">
      <h1 className="text-xl font-semibold text-text-primary mb-6">Bookmarks</h1>

      {bookmarks.length > 0 && (
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search bookmarks"
          className="w-full h-10 px-4 mb-6 rounded-lg bg-surface-elevated border border-border/60 outline-none
            text-[14px] text-text-primary placeholder:text-text-tertiary focus:border-accent/60"
        />
      )}

      {bookmarks.length === 0 && (
        <div className="text-[13px] text-text-tertiary">
          No bookmarks yet. Click the star in the address bar to save a page.
        </div>
      )}

      {bookmarks.length > 0 && filtered.length === 0 && (
        <div className="text-[13px] text-text-tertiary">No bookmarks match "{query}".</div>
      )}

      {grouped.map(([folder, items]) => (
        <div key={folder} className="mb-4">
          <div className="text-[12px] font-medium text-text-tertiary uppercase tracking-wide mb-1">{folder}</div>
          <div className="rounded-lg border border-border/60 overflow-hidden">
            {items.map((b) => (
              <div
                key={b.id}
                className="group flex items-center gap-3 px-3 py-2.5 hover:bg-surface-hover border-b border-border/30 last:border-b-0 cursor-pointer"
                onClick={() => navigate(b.url)}
              >
                {b.faviconUrl ? (
                  <img
                    src={b.faviconUrl}
                    alt=""
                    className="h-4 w-4 rounded-sm shrink-0 object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <span className="text-accent text-sm shrink-0">★</span>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-text-primary truncate">{b.title || b.url}</div>
                  <div className="text-[11px] text-text-tertiary truncate">{b.url}</div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(b.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 h-5 w-5 flex items-center justify-center rounded-full
                    text-text-tertiary hover:bg-surface hover:text-text-primary shrink-0 transition-opacity"
                  aria-label="Remove bookmark"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
