import { useEffect, useState } from 'react';
import { useHistoryStore } from '../store/history-store';
import type { HistoryEntry } from '../../shared/ipc-channels';

function groupByDay(entries: HistoryEntry[]): Map<string, HistoryEntry[]> {
  const groups = new Map<string, HistoryEntry[]>();
  for (const entry of entries) {
    const key = new Date(entry.visitedAt).toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
    const bucket = groups.get(key) ?? [];
    bucket.push(entry);
    groups.set(key, bucket);
  }
  return groups;
}

export function HistoryPage({ tabId }: { tabId: string }) {
  const { entries, isLoading, search, deleteEntry, clearAll } = useHistoryStore();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    search('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => search(query), 150);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const navigate = (url: string) => {
    if (tabId) window.dash.tabs.navigate(tabId, url);
  };

  const toggleSelect = (id: number) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deleteSelected = async () => {
    await Promise.all(Array.from(selected).map((id) => deleteEntry(id)));
    setSelected(new Set());
  };

  const grouped = groupByDay(entries);

  return (
    <div className="max-w-3xl mx-auto py-8 px-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-text-primary">History</h1>
        <div className="flex items-center gap-3">
          {selected.size > 0 && (
            <button
              onClick={deleteSelected}
              className="text-[12px] text-red-400 hover:text-red-300 transition-colors"
            >
              Delete {selected.size} selected
            </button>
          )}
          {entries.length > 0 && (
            <button
              onClick={() => {
                if (confirm('Clear all browsing history? This cannot be undone.')) clearAll();
              }}
              className="text-[12px] text-text-tertiary hover:text-text-primary px-3 py-1.5 rounded-lg border border-border/60 transition-colors"
            >
              Clear browsing data…
            </button>
          )}
        </div>
      </div>

      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search history"
        className="w-full h-10 px-4 mb-6 rounded-lg bg-surface-elevated border border-border/60 outline-none
          text-[14px] text-text-primary placeholder:text-text-tertiary focus:border-accent/60"
      />

      {isLoading && entries.length === 0 && <div className="text-[13px] text-text-tertiary">Loading…</div>}

      {!isLoading && entries.length === 0 && (
        <div className="text-[13px] text-text-tertiary">
          {query ? 'No matching history.' : 'No browsing history yet.'}
        </div>
      )}

      {Array.from(grouped.entries()).map(([day, dayEntries]) => (
        <div key={day} className="mb-4">
          <div className="text-[12px] font-medium text-text-tertiary uppercase tracking-wide mb-1">{day}</div>
          <div className="rounded-lg border border-border/60 overflow-hidden">
            {dayEntries.map((entry) => (
              <div
                key={entry.id}
                className="group flex items-center gap-3 px-3 py-2.5 hover:bg-surface-hover border-b border-border/30 last:border-b-0 cursor-pointer"
                onClick={() => navigate(entry.url)}
              >
                <input
                  type="checkbox"
                  checked={selected.has(entry.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleSelect(entry.id)}
                  className="shrink-0"
                />
                {entry.faviconUrl ? (
                  <img
                    src={entry.faviconUrl}
                    alt=""
                    className="h-4 w-4 rounded-sm shrink-0 object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <span className="h-4 w-4 rounded-sm bg-text-tertiary/20 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-text-primary truncate">{entry.title || entry.url}</div>
                  <div className="text-[11px] text-text-tertiary truncate">{entry.url}</div>
                </div>
                <span className="text-[11px] text-text-tertiary shrink-0">
                  {new Date(entry.visitedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteEntry(entry.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 h-5 w-5 flex items-center justify-center rounded-full
                    text-text-tertiary hover:bg-surface hover:text-text-primary shrink-0 transition-opacity"
                  aria-label="Remove from history"
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
