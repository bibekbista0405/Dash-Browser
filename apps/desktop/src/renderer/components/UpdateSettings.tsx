import { useEffect, useState } from 'react';
import type { UpdateStatus } from '../../shared/ipc-channels';
import { useSettingsStore } from '../store/settings-store';

/** Opt-in updates from an address you provide. Off by default; nothing is contacted until you enable it. */
export function UpdateSettings() {
  const { settings, set } = useSettingsStore();
  const [url, setUrl] = useState(settings.updateFeedUrl);
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void window.dash.updates.status().then(setStatus);
    return window.dash.updates.onChanged(setStatus);
  }, []);
  useEffect(() => setUrl(settings.updateFeedUrl), [settings.updateFeedUrl]);

  const saveUrl = async () => {
    try {
      await set('updateFeedUrl', url.trim());
      setErr(null);
      setStatus(await window.dash.updates.status());
    } catch (e) {
      setErr((e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?(DASH: )?/, ''));
    }
  };

  const busy = status?.state === 'checking' || status?.state === 'downloading';
  const btn = 'h-8 px-4 rounded-lg text-[12px] bg-surface-elevated border border-border/60 text-text-secondary hover:bg-surface-hover disabled:opacity-50';

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-text-tertiary leading-relaxed">
        DASH never checks for updates by itself. If you host releases (the latest.yml and installers that the build produces) at an https address, enter it here
        and DASH will contact only that address. Updates install when you restart.
      </p>
      <label className="flex items-center justify-between gap-3 text-[13px]">
        <span>Check for updates when DASH starts</span>
        <input type="checkbox" role="switch" checked={settings.autoUpdate} onChange={(e) => void set('autoUpdate', e.target.checked)} />
      </label>
      <div className="flex gap-2">
        <input
          aria-label="Update address"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={() => url.trim() !== settings.updateFeedUrl && void saveUrl()}
          onKeyDown={(e) => e.key === 'Enter' && void saveUrl()}
          placeholder="https://example.com/dash/releases"
          className="flex-1 h-8 rounded-lg bg-surface border border-border/60 text-[12px] text-text-primary px-2 outline-none focus:border-accent"
        />
        <button
          className={btn}
          disabled={busy || !settings.updateFeedUrl}
          onClick={async () => {
            await saveUrl();
            setStatus(await window.dash.updates.check());
          }}
        >
          Check now
        </button>
      </div>
      {err && <p className="text-[12px] text-red-500">{err}</p>}
      {status && status.state !== 'idle' && (
        <p className="text-[12px] text-text-secondary" aria-live="polite">
          {status.state === 'checking' && 'Checking…'}
          {status.state === 'none' && `You have the latest version (${status.version}).`}
          {status.state === 'downloading' && `Downloading ${status.version}… ${status.percent ?? 0}%`}
          {status.state === 'ready' && `Version ${status.version} is ready.`}
          {(status.state === 'error' || status.state === 'off') && status.message}
        </p>
      )}
      {status?.state === 'ready' && (
        <button className={btn} onClick={() => void window.dash.updates.install()}>
          Restart to install
        </button>
      )}
    </div>
  );
}
