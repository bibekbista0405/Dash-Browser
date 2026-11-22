import { useCallback, useEffect, useState } from 'react';
import type { ArchiveEntry } from '../../shared/ipc-channels';

function size(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Pages saved for offline reading. Files and their searchable text live only in this profile's data folder. */
export function ArchivePage() {
  const [items, setItems] = useState<ArchiveEntry[]>([]);
  const [search, setSearch] = useState('');
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => setItems(await window.dash.archive.list(search)), [search]);
  useEffect(() => {
    void load();
    return window.dash.archive.onChanged(() => void load());
  }, [load]);

  const open = async (id: number) => {
    try {
      await window.dash.archive.open(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the saved page');
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-[22px] font-semibold">Saved pages</h1>
      <p className="mt-1 text-[12px] text-text-tertiary leading-relaxed">
        Pages you save for offline reading (More menu → Save for offline). They are stored on this device only and open without a connection. Scripts in a saved page may still run when it is opened.
      </p>
      <input
        aria-label="Search saved pages"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search titles, addresses and page text"
        className="mt-4 w-full rounded-lg bg-surface border border-border/70 text-[13px] text-text-primary px-3 py-2 outline-none focus:border-accent"
      />
      {error && <p className="mt-2 text-[12px] text-red-500">{error}</p>}
      <div className="mt-4 space-y-2">
        {items.length === 0 && (
          <p className="text-[13px] text-text-tertiary py-10 text-center">{search ? 'Nothing matches.' : 'No saved pages yet.'}</p>
        )}
        {items.map((a) => (
          <div key={a.id} className="rounded-lg border border-border/70 bg-surface-elevated p-3 flex items-center gap-3">
            <button className="flex-1 min-w-0 text-left" onClick={() => void open(a.id)}>
              <div className="text-[14px] text-text-primary truncate">{a.title}</div>
              <div className="text-[11px] text-text-tertiary truncate">{a.url}</div>
              <div className="text-[11px] text-text-tertiary mt-0.5">
                {new Date(a.savedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} · {size(a.size)}
              </div>
            </button>
            {confirmId === a.id ? (
              <button className="text-[12px] text-red-500" onClick={() => { setConfirmId(null); void window.dash.archive.delete(a.id); }}>
                Confirm delete
              </button>
            ) : (
              <button className="text-[12px] text-text-secondary hover:text-red-500" onClick={() => setConfirmId(a.id)}>
                Delete
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
