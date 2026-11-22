import { useCallback, useEffect, useState } from 'react';

/** Web apps installed from the address bar ("Install app"): open or remove them. */
export function InstalledApps() {
  const [apps, setApps] = useState<{ id: string; name: string; startUrl: string }[] | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const load = useCallback(() => { void window.dash.webApps.list().then(setApps).catch(() => setApps([])); }, []);
  useEffect(load, [load]);

  if (apps === null) return null;
  if (apps.length === 0) {
    return <p className="text-[12px] text-text-tertiary leading-relaxed">No installed apps yet. When a site can be installed, an Install button appears in the address bar.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {apps.map((a) => {
        let host = '';
        try { host = new URL(a.startUrl).host; } catch { /* ignore */ }
        return (
          <li key={a.id} className="flex items-center gap-3 rounded-lg bg-surface-elevated border border-border/60 px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] text-text-primary truncate">{a.name}</div>
              <div className="text-[11px] text-text-tertiary truncate">{host}</div>
            </div>
            <button className="h-7 px-3 rounded-md text-[12px] text-text-secondary hover:bg-surface-hover" onClick={() => void window.dash.webApps.launch(a.id)}>Open</button>
            {confirm === a.id ? (
              <>
                <button className="h-7 px-3 rounded-md text-[12px] bg-red-500/90 text-white hover:bg-red-500" onClick={() => { void window.dash.webApps.uninstall(a.id).then(() => { setConfirm(null); load(); }); }}>Remove</button>
                <button className="h-7 px-2 rounded-md text-[12px] text-text-secondary hover:bg-surface-hover" onClick={() => setConfirm(null)}>Cancel</button>
              </>
            ) : (
              <button className="h-7 px-3 rounded-md text-[12px] text-text-secondary hover:bg-surface-hover" onClick={() => setConfirm(a.id)}>Uninstall</button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
