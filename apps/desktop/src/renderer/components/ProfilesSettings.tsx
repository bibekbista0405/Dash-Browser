import { useCallback, useEffect, useState } from 'react';

interface Profile {
  id: string;
  name: string;
  isCurrent: boolean;
}

/** Manage profiles: separate history, bookmarks, passwords, cookies and settings, each in its own DASH window. */
export function ProfilesSettings() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => void window.dash.profiles.list().then(setProfiles), []);
  useEffect(load, [load]);
  const clean = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?(DASH: )?/, '');
  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
      load();
    } catch (e) {
      setError(clean(e));
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-text-tertiary leading-relaxed">
        A profile is a completely separate copy of DASH&apos;s data: its own history, bookmarks, saved passwords, cookies, settings and containers.
        Each profile opens in its own window and process, so you can keep Work and Personal side by side. Nothing is shared between them, and
        deleting a profile erases all of its data.
      </p>
      {profiles.map((p) => (
        <div key={p.id} className="flex items-center gap-2">
          <span className="flex-1 truncate text-[13px] text-text-primary">
            {p.name}
            {p.isCurrent && <span className="ml-2 text-[11px] text-accent">this window</span>}
          </span>
          {!p.isCurrent && (
            <button className="h-7 px-2 rounded-md text-[12px] text-text-secondary hover:bg-surface-hover" onClick={() => run(() => window.dash.profiles.open(p.id))}>
              Open
            </button>
          )}
          {p.id !== 'default' && (
            <>
              <button
                className="h-7 px-2 rounded-md text-[12px] text-text-secondary hover:bg-surface-hover"
                onClick={() => {
                  const next = window.prompt('Rename profile', p.name);
                  if (next) void run(() => window.dash.profiles.rename(p.id, next));
                }}
              >
                Rename
              </button>
              {!p.isCurrent && (
                <button
                  className="h-7 px-2 rounded-md text-[12px] text-red-500 hover:bg-surface-hover"
                  onClick={() => {
                    if (window.confirm(`Delete profile "${p.name}" and ALL its history, bookmarks, passwords and cookies? This cannot be undone.`)) void run(() => window.dash.profiles.remove(p.id));
                  }}
                >
                  Delete
                </button>
              )}
            </>
          )}
        </div>
      ))}
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={30}
          placeholder="New profile name (e.g. Work)"
          aria-label="New profile name"
          className="flex-1 min-w-0 h-8 px-3 rounded-lg bg-surface-elevated border border-border/60 outline-none text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-accent/60"
        />
        <button
          disabled={!name.trim()}
          className="h-8 px-3 rounded-lg text-[13px] bg-accent text-white disabled:opacity-50 shrink-0"
          onClick={() =>
            run(async () => {
              await window.dash.profiles.create(name);
              setName('');
            })
          }
        >
          Add
        </button>
      </div>
      {error && (
        <div role="status" className="text-[12px] text-red-500">
          {error}
        </div>
      )}
    </div>
  );
}
