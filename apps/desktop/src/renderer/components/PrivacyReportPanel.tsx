import { useEffect, useState } from 'react';
import type { BlockStats } from '../../shared/ipc-channels';
import { OverlayPanel } from './OverlayPanel';

export function PrivacyReportPanel({ onClose }: { onClose: () => void }) {
  const [stats, setStats] = useState<BlockStats | null>(null);
  const load = () => window.dash.blockStats.get().then(setStats);
  useEffect(() => {
    load();
  }, []);

  const reset = async () => {
    await window.dash.blockStats.reset();
    load();
  };

  const max = Math.max(1, ...(stats?.topHosts.map((h) => h.count) ?? [1]));

  return (
    <OverlayPanel title="Privacy Report" onClose={onClose}>
      {!stats && <div className="px-4 py-6 text-[13px] text-text-tertiary">Loading…</div>}
      {stats && (
        <>
          <div className="grid grid-cols-3 gap-2 px-4 py-4 border-b border-border/40">
            <Stat label="Total blocked" value={stats.lifetimeTotal} />
            <Stat label="Ads" value={stats.byCategory.ad} />
            <Stat label="Trackers" value={stats.byCategory.tracker} />
          </div>
          <div className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wide text-text-tertiary">
            Most blocked hosts
          </div>
          {stats.topHosts.length === 0 && (
            <div className="px-4 py-4 text-[13px] text-text-tertiary">
              Nothing recorded yet. Hosts DASH blocks in normal tabs will appear here. Private tabs are never
              recorded. All of this stays on this device.
            </div>
          )}
          {stats.topHosts.map((h) => (
            <div key={h.host + h.category} className="px-4 py-2 border-b border-border/40">
              <div className="flex items-center gap-2">
                <span className="flex-1 min-w-0 truncate text-[13px] text-text-primary">{h.host}</span>
                <span className="text-[11px] text-text-tertiary capitalize shrink-0">{h.category}</span>
                <span className="text-[12px] text-text-primary tabular-nums shrink-0">{h.count.toLocaleString()}</span>
              </div>
              <div className="mt-1.5 h-1 rounded bg-surface">
                <div className="h-1 rounded bg-accent" style={{ width: `${(h.count / max) * 100}%` }} />
              </div>
            </div>
          ))}
          <div className="px-4 py-3">
            <button onClick={reset} className="text-[12px] text-text-tertiary hover:text-text-primary">
              Reset report
            </button>
          </div>
        </>
      )}
    </OverlayPanel>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-surface-elevated border border-border/60 px-3 py-2">
      <div className="text-[18px] font-semibold text-text-primary tabular-nums">{value.toLocaleString()}</div>
      <div className="text-[11px] text-text-tertiary">{label}</div>
    </div>
  );
}
