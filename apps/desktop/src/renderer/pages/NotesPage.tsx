import { useCallback, useEffect, useState } from 'react';
import { NOTE_MAX_LENGTH, type NoteEntry } from '../../shared/ipc-channels';

function when(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** Quick notes: stored only in this profile's local database, searchable, optionally linked to the page you were on. */
export function NotesPage({ compact = false }: { compact?: boolean }) {
  const [notes, setNotes] = useState<NoteEntry[]>([]);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const [attach, setAttach] = useState(false);
  const [editing, setEditing] = useState<{ id: number; body: string } | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => setNotes(await window.dash.notes.list(search)), [search]);

  useEffect(() => {
    void load();
    return window.dash.notes.onChanged(() => void load());
  }, [load]);

  useEffect(() => {
    void window.dash.sidePanel.activeUrl().then(setPageUrl).catch(() => setPageUrl(null));
  }, []);

  const add = async () => {
    const body = draft.trim();
    if (!body) return;
    try {
      await window.dash.notes.save(null, body, attach && pageUrl ? pageUrl : null);
      setDraft('');
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the note');
    }
  };

  const saveEdit = async () => {
    if (!editing) return;
    const body = editing.body.trim();
    if (!body) return;
    try {
      await window.dash.notes.save(editing.id, body, null);
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the note');
    }
  };

  const field = 'w-full rounded-lg bg-surface border border-border/70 text-[13px] text-text-primary px-3 py-2 outline-none focus:border-accent';

  return (
    <div className={`h-full flex flex-col ${compact ? 'p-3' : 'p-8 max-w-2xl mx-auto'}`}>
      {!compact && <h1 className="text-[22px] font-semibold mb-4">Notes</h1>}
      <div className="space-y-2">
        <textarea
          aria-label="New note"
          value={draft}
          maxLength={NOTE_MAX_LENGTH}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void add();
            }
          }}
          placeholder="Write a note… (Ctrl+Enter to save)"
          rows={compact ? 3 : 4}
          className={`${field} resize-none`}
        />
        <div className="flex items-center justify-between gap-2">
          <label className={`flex items-center gap-1.5 text-[12px] ${pageUrl ? 'text-text-secondary' : 'text-text-tertiary'}`} title={pageUrl ?? 'Open a web page to link a note to it'}>
            <input type="checkbox" disabled={!pageUrl} checked={attach && !!pageUrl} onChange={(e) => setAttach(e.target.checked)} />
            Link to current page
          </label>
          <button
            onClick={() => void add()}
            disabled={!draft.trim()}
            className="h-8 px-4 rounded-full bg-accent text-white text-[12px] font-medium disabled:opacity-40"
          >
            Save note
          </button>
        </div>
        {error && <p className="text-[12px] text-red-500">{error}</p>}
      </div>

      <input
        aria-label="Search notes"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search notes"
        className={`${field} mt-4`}
      />

      <div className="mt-3 flex-1 overflow-y-auto space-y-2 pr-0.5">
        {notes.length === 0 && (
          <p className="text-[12px] text-text-tertiary py-6 text-center">{search ? 'No notes match.' : 'No notes yet. Everything you write here stays on this device.'}</p>
        )}
        {notes.map((n) => (
          <div key={n.id} className="rounded-lg border border-border/70 bg-surface-elevated p-3">
            {editing?.id === n.id ? (
              <>
                <textarea
                  aria-label="Edit note"
                  autoFocus
                  value={editing.body}
                  maxLength={NOTE_MAX_LENGTH}
                  onChange={(e) => setEditing({ id: n.id, body: e.target.value })}
                  rows={4}
                  className={`${field} resize-none`}
                />
                <div className="mt-2 flex gap-2 justify-end">
                  <button className="text-[12px] text-text-secondary px-2" onClick={() => setEditing(null)}>Cancel</button>
                  <button className="text-[12px] text-accent px-2" onClick={() => void saveEdit()}>Save</button>
                </div>
              </>
            ) : (
              <>
                <p className="text-[13px] text-text-primary whitespace-pre-wrap break-words">{n.body}</p>
                {n.url && (
                  <a href={n.url} className="mt-1 block text-[11px] text-accent truncate" title={n.url}>
                    {n.url}
                  </a>
                )}
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[11px] text-text-tertiary">{when(n.updatedAt)}</span>
                  <span className="flex gap-3 text-[12px]">
                    <button className="text-text-secondary hover:text-text-primary" onClick={() => navigator.clipboard.writeText(n.body).catch(() => undefined)}>Copy</button>
                    <button className="text-text-secondary hover:text-text-primary" onClick={() => setEditing({ id: n.id, body: n.body })}>Edit</button>
                    {confirmId === n.id ? (
                      <button className="text-red-500" onClick={() => { setConfirmId(null); void window.dash.notes.delete(n.id); }}>Confirm delete</button>
                    ) : (
                      <button className="text-text-secondary hover:text-red-500" onClick={() => setConfirmId(n.id)}>Delete</button>
                    )}
                  </span>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
