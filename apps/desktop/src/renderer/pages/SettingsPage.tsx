import { useEffect, useState } from 'react';
import { useSettingsStore } from '../store/settings-store';
import { SEARCH_ENGINES, type SearchEngineId, type ThemeMode } from '../../shared/ipc-channels';
import { PasswordsPanel } from '../components/PasswordsPanel';
import { PermissionsPanel } from '../components/PermissionsPanel';
import { ExtensionsPanel } from '../components/ExtensionsPanel';

type SubPage = 'none' | 'passwords' | 'permissions' | 'extensions';

export function SettingsPage() {
  const { settings, load, subscribe, set, reset } = useSettingsStore();
  const [homepageDraft, setHomepageDraft] = useState(settings.homepage);
  const [lifetimeBlocked, setLifetimeBlocked] = useState<number | null>(null);
  const [subPage, setSubPage] = useState<SubPage>('none');

  const [clearOptions, setClearOptions] = useState({ history: true, cookies: true, cache: true, downloads: false });
  const [clearing, setClearing] = useState(false);
  const [clearedMessage, setClearedMessage] = useState<string | null>(null);

  useEffect(() => {
    load();
    const unsubscribe = subscribe();
    window.dash.blockStats.get().then((stats) => setLifetimeBlocked(stats.lifetimeTotal));
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setHomepageDraft(settings.homepage);
  }, [settings.homepage]);

  const commitHomepage = () => {
    const trimmed = homepageDraft.trim();
    if (trimmed && trimmed !== settings.homepage) {
      set('homepage', trimmed);
    } else {
      setHomepageDraft(settings.homepage);
    }
  };

  const runClearBrowsingData = async () => {
    setClearing(true);
    setClearedMessage(null);
    try {
      await window.dash.privacy.clearBrowsingData(clearOptions);
      setClearedMessage('Done.');
      setTimeout(() => setClearedMessage(null), 3000);
    } finally {
      setClearing(false);
    }
  };

  if (subPage === 'passwords') return <PasswordsPanel onClose={() => setSubPage('none')} />;
  if (subPage === 'permissions') return <PermissionsPanel onClose={() => setSubPage('none')} />;
  if (subPage === 'extensions') return <ExtensionsPanel onClose={() => setSubPage('none')} />;

  return (
    <div className="max-w-2xl mx-auto py-8 px-6 space-y-8">
      <h1 className="text-xl font-semibold text-text-primary">Settings</h1>

      <Section title="Appearance">
        <div className="flex gap-2">
          {(['dark', 'light', 'system'] as ThemeMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => set('theme', mode)}
              className={`flex-1 h-9 rounded-lg text-[13px] capitalize transition-colors border
                ${
                  settings.theme === mode
                    ? 'bg-accent/15 border-accent/50 text-accent'
                    : 'bg-surface-elevated border-border/60 text-text-secondary hover:bg-surface-hover'
                }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Search Engine">
        <div className="space-y-1 rounded-lg border border-border/60 overflow-hidden">
          {(Object.entries(SEARCH_ENGINES) as [SearchEngineId, (typeof SEARCH_ENGINES)[SearchEngineId]][]).map(
            ([id, engine]) => (
              <button
                key={id}
                onClick={() => set('searchEngine', id)}
                className={`w-full flex items-center justify-between h-10 px-3 text-[13px] transition-colors
                  ${settings.searchEngine === id ? 'bg-surface-hover text-text-primary' : 'text-text-secondary hover:bg-surface-hover'}`}
              >
                {engine.label}
                {settings.searchEngine === id && <span className="text-accent">✓</span>}
              </button>
            )
          )}
        </div>
      </Section>

      <Section title="Homepage">
        <input
          value={homepageDraft}
          onChange={(e) => setHomepageDraft(e.target.value)}
          onBlur={commitHomepage}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          placeholder="https://example.com"
          className="w-full h-10 px-3 rounded-lg bg-surface-elevated border border-border/60 outline-none
            text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-accent/60"
          spellCheck={false}
        />
        <p className="mt-1.5 text-[12px] text-text-tertiary">
          What the Home button (⌂) goes to. A new tab (Ctrl/Cmd+T) always opens DASH's New Tab
          Page instead — the same distinction Chrome and Firefox make.
        </p>
      </Section>

      <Section title="Startup">
        <div className="flex gap-2">
          <button
            onClick={() => set('startupBehavior', 'homepage')}
            className={`flex-1 h-9 rounded-lg text-[13px] transition-colors border
              ${settings.startupBehavior === 'homepage' ? 'bg-accent/15 border-accent/50 text-accent' : 'bg-surface-elevated border-border/60 text-text-secondary hover:bg-surface-hover'}`}
          >
            Open homepage
          </button>
          <button
            onClick={() => set('startupBehavior', 'restore')}
            className={`flex-1 h-9 rounded-lg text-[13px] transition-colors border
              ${settings.startupBehavior === 'restore' ? 'bg-accent/15 border-accent/50 text-accent' : 'bg-surface-elevated border-border/60 text-text-secondary hover:bg-surface-hover'}`}
          >
            Restore previous tabs
          </button>
        </div>
      </Section>

      <Section title="Performance">
        <ToggleRow
          label="Sleep inactive tabs"
          checked={settings.sleepingTabsEnabled}
          onChange={() => set('sleepingTabsEnabled', !settings.sleepingTabsEnabled)}
        />
      </Section>

      <Section title="Blocking">
        <ToggleRow
          label="Block ads"
          checked={settings.adBlockingEnabled}
          onChange={() => set('adBlockingEnabled', !settings.adBlockingEnabled)}
        />
        <div className="h-2" />
        <ToggleRow
          label="Block trackers"
          checked={settings.trackerBlockingEnabled}
          onChange={() => set('trackerBlockingEnabled', !settings.trackerBlockingEnabled)}
        />
        <p className="mt-1.5 text-[12px] text-text-tertiary">
          {lifetimeBlocked === null
            ? 'Loading stats…'
            : `DASH has blocked ${lifetimeBlocked.toLocaleString()} ad/tracker request${lifetimeBlocked === 1 ? '' : 's'} since install.`}
        </p>
      </Section>

      <Section title="Privacy">
        <ToggleRow
          label="HTTPS-Only Mode"
          checked={settings.httpsOnlyMode}
          onChange={() => set('httpsOnlyMode', !settings.httpsOnlyMode)}
        />
      </Section>

      <Section title="Clear browsing data">
        <div className="rounded-lg border border-border/60 divide-y divide-border/40">
          <CheckRow
            label="Browsing history"
            checked={clearOptions.history}
            onChange={(v) => setClearOptions((o) => ({ ...o, history: v }))}
          />
          <CheckRow
            label="Cookies and site data"
            checked={clearOptions.cookies}
            onChange={(v) => setClearOptions((o) => ({ ...o, cookies: v }))}
          />
          <CheckRow
            label="Cached files"
            checked={clearOptions.cache}
            onChange={(v) => setClearOptions((o) => ({ ...o, cache: v }))}
          />
          <CheckRow
            label="Download history (just the list — not the files)"
            checked={clearOptions.downloads}
            onChange={(v) => setClearOptions((o) => ({ ...o, downloads: v }))}
          />
        </div>
        <p className="mt-2 text-[12px] text-text-tertiary">
          "Cached files" is also the fix if pages start behaving oddly or you see cache errors in
          the logs — a corrupted disk cache (often from the disk running low on space) is cleared
          and rebuilt, not just hidden.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={runClearBrowsingData}
            disabled={clearing || !Object.values(clearOptions).some(Boolean)}
            className="h-9 px-4 rounded-lg text-[13px] font-medium text-white bg-accent hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {clearing ? 'Clearing…' : 'Clear data'}
          </button>
          {clearedMessage && <span className="text-[12px] text-accent">{clearedMessage}</span>}
        </div>
      </Section>

      <Section title="Passwords & Permissions">
        <button
          onClick={() => setSubPage('passwords')}
          className="w-full flex items-center justify-between h-10 px-3 rounded-lg bg-surface-elevated border border-border/60 text-[13px] text-text-primary hover:bg-surface-hover transition-colors"
        >
          Saved passwords
          <span className="text-text-tertiary">›</span>
        </button>
        <div className="h-2" />
        <button
          onClick={() => setSubPage('permissions')}
          className="w-full flex items-center justify-between h-10 px-3 rounded-lg bg-surface-elevated border border-border/60 text-[13px] text-text-primary hover:bg-surface-hover transition-colors"
        >
          Site permissions
          <span className="text-text-tertiary">›</span>
        </button>
      </Section>

      <Section title="Extensions">
        <button
          onClick={() => setSubPage('extensions')}
          className="w-full flex items-center justify-between h-10 px-3 rounded-lg bg-surface-elevated border border-border/60 text-[13px] text-text-primary hover:bg-surface-hover transition-colors"
        >
          Manage extensions
          <span className="text-text-tertiary">›</span>
        </button>
      </Section>

      <Section title="Bookmarks">
        <div className="flex gap-2">
          <button
            onClick={() => window.dash.bookmarks.export()}
            className="flex-1 h-9 rounded-lg text-[13px] bg-surface-elevated border border-border/60 text-text-secondary hover:bg-surface-hover transition-colors"
          >
            Export…
          </button>
          <button
            onClick={() => window.dash.bookmarks.import()}
            className="flex-1 h-9 rounded-lg text-[13px] bg-surface-elevated border border-border/60 text-text-secondary hover:bg-surface-hover transition-colors"
          >
            Import…
          </button>
        </div>
      </Section>

      <button
        onClick={() => {
          if (confirm('Reset all settings to defaults?')) reset();
        }}
        className="w-full h-9 rounded-lg text-[13px] text-text-tertiary hover:text-text-primary hover:bg-surface-hover transition-colors border border-border/60"
      >
        Reset to defaults
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[12px] font-medium text-text-tertiary uppercase tracking-wide mb-2">{title}</h3>
      {children}
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      className="w-full flex items-center justify-between h-10 px-3 rounded-lg bg-surface-elevated border border-border/60"
    >
      <span className="text-[13px] text-text-primary">{label}</span>
      <span className={`h-5 w-9 rounded-full relative transition-colors ${checked ? 'bg-accent' : 'bg-border'}`}>
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}

function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-3 px-3 py-2.5 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="text-[13px] text-text-primary">{label}</span>
    </label>
  );
}
