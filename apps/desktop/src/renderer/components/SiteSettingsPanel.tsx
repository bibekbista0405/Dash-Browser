import { useCallback, useEffect, useMemo, useState } from 'react';
import { OverlayPanel } from './OverlayPanel';
import { parseHostList } from '../../shared/ipc-channels';
import type { DashSettings, PermissionRecord } from '../../shared/ipc-channels';

const PERMISSION_LABEL: Record<string, string> = {
  notifications: 'Notifications',
  geolocation: 'Location',
  camera: 'Camera',
  microphone: 'Microphone',
  'clipboard-read': 'Clipboard',
};

interface SiteRow {
  host: string;
  permissions: PermissionRecord[];
  zoom: number | null;
  blockingOff: boolean;
  keepData: boolean;
  neverSleep: boolean;
}

const bare = (h: string): string => h.toLowerCase().replace(/^www\./, '');

/** Everything DASH remembers about each site in one place, each item removable. */
export function SiteSettingsPanel({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<SiteRow[]>([]);
  const [settings, setSettings] = useState<DashSettings | null>(null);
  const [query, setQuery] = useState('');
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [perms, zooms, s] = await Promise.all([window.dash.permissions.list(), window.dash.tabs.siteZoomList(), window.dash.settings.getAll()]);
    const map = new Map<string, SiteRow>();
    const row = (host: string): SiteRow => {
      let r = map.get(host);
      if (!r) {
        r = { host, permissions: [], zoom: null, blockingOff: false, keepData: false, neverSleep: false };
        map.set(host, r);
      }
      return r;
    };
    for (const p of perms) {
      try {
        row(bare(new URL(p.origin).hostname)).permissions.push(p);
      } catch {
        /* skip a malformed origin */
      }
    }
    for (const z of zooms) row(z.host).zoom = z.factor;
    for (const h of parseHostList(s.blockingOffHosts)) row(h).blockingOff = true;
    for (const h of parseHostList(s.keepSiteDataHosts)) row(h).keepData = true;
    for (const h of parseHostList(s.neverSleepHosts)) row(h).neverSleep = true;
    setRows([...map.values()].sort((a, b) => a.host.localeCompare(b.host)));
    setSettings(s);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const removeFromList = async (key: 'blockingOffHosts' | 'keepSiteDataHosts' | 'neverSleepHosts', host: string) => {
    if (!settings) return;
    await window.dash.settings.set(key, parseHostList(settings[key]).filter((h) => h !== host).join('\n'));
    await load();
  };

  const forgetAll = async (r: SiteRow) => {
    for (const p of r.permissions) await window.dash.permissions.remove(p.id);
    if (r.zoom !== null) await window.dash.tabs.resetSiteZoom(r.host);
    if (r.blockingOff) await removeFromList('blockingOffHosts', r.host);
    if (r.keepData) await removeFromList('keepSiteDataHosts', r.host);
    if (r.neverSleep) await removeFromList('neverSleepHosts', r.host);
    await load();
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rows.filter((r) => r.host.includes(q)) : rows;
  }, [rows, query]);

  const chip = 'inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded bg-surface text-text-secondary';
  const x = 'text-text-tertiary hover:text-text-primary';

  return (
    <OverlayPanel title="Site settings" onClose={onClose}>
      <div className="px-4 pt-3 pb-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search sites"
          aria-label="Search sites"
          className="w-full h-9 px-3 rounded-lg bg-surface border border-border/60 outline-none text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-accent/60"
        />
      </div>
      {loaded && rows.length === 0 && (
        <div className="px-4 py-6 text-[13px] text-text-tertiary">
          Nothing saved yet. Permission choices, page zoom levels, and sites where you turned blocking off or chose to keep data or never sleep will be listed here.
        </div>
      )}
      {loaded && rows.length > 0 && visible.length === 0 && <div className="px-4 py-4 text-[13px] text-text-tertiary">No saved sites match "{query}".</div>}
      {visible.map((r) => (
        <div key={r.host} className="px-4 py-3 border-b border-border/40" data-testid="site-row">
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0 text-[13px] font-medium text-text-primary truncate">{r.host}</div>
            <button onClick={() => void forgetAll(r)} className="text-[11px] text-text-tertiary hover:text-text-primary shrink-0">
              Forget all
            </button>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {r.permissions.map((p) => (
              <span key={p.id} className={chip}>
                {PERMISSION_LABEL[p.permission] ?? p.permission}: {p.decision === 'granted' ? 'Allowed' : 'Blocked'}
                <button aria-label={`Reset ${p.permission} for ${r.host}`} className={x} onClick={() => void window.dash.permissions.remove(p.id).then(load)}>×</button>
              </span>
            ))}
            {r.zoom !== null && (
              <span className={chip}>
                Zoom {Math.round(r.zoom * 100)}%
                <button aria-label={`Reset zoom for ${r.host}`} className={x} onClick={() => void window.dash.tabs.resetSiteZoom(r.host).then(load)}>×</button>
              </span>
            )}
            {r.blockingOff && (
              <span className={chip}>
                Blocking off
                <button aria-label={`Turn blocking back on for ${r.host}`} className={x} onClick={() => void removeFromList('blockingOffHosts', r.host)}>×</button>
              </span>
            )}
            {r.keepData && (
              <span className={chip}>
                Kept on exit
                <button aria-label={`Stop keeping data for ${r.host}`} className={x} onClick={() => void removeFromList('keepSiteDataHosts', r.host)}>×</button>
              </span>
            )}
            {r.neverSleep && (
              <span className={chip}>
                Never sleeps
                <button aria-label={`Allow ${r.host} to sleep`} className={x} onClick={() => void removeFromList('neverSleepHosts', r.host)}>×</button>
              </span>
            )}
          </div>
        </div>
      ))}
    </OverlayPanel>
  );
}
