import { useEffect, useState } from 'react';
import type { ImportSource } from '../../shared/ipc-channels';
import { useSettingsStore } from '../store/settings-store';
import { SEARCH_ENGINES, DOH_PROVIDERS, type SearchEngineId, type ThemeMode } from '../../shared/ipc-channels';
import { PasswordsPanel } from '../components/PasswordsPanel';
import { PermissionsPanel } from '../components/PermissionsPanel';
import { NewTabAppearance } from '../components/NewTabAppearance';
import { AppThemeAppearance } from '../components/AppThemeAppearance';
import { VpnSettings } from '../components/VpnSettings';
import { SiteListField } from '../components/SiteListField';
import { Logo } from '../components/Logo';
import { PrivacyReportPanel } from '../components/PrivacyReportPanel';
import { ExtensionsPanel } from '../components/ExtensionsPanel';

type SubPage = 'none' | 'passwords' | 'permissions' | 'extensions' | 'report';

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
  if (subPage === 'report') return <PrivacyReportPanel onClose={() => setSubPage('none')} />;
  if (subPage === 'extensions') return <ExtensionsPanel onClose={() => setSubPage('none')} />;

  return (
    <div className="max-w-3xl mx-auto py-8 px-6 space-y-8">
      <div className="flex items-center gap-3">
        <Logo size={34} className="text-text-primary" />
        <div>
          <h1 className="text-xl font-semibold text-text-primary leading-tight">Settings</h1>
          <div className="text-[12px] text-text-tertiary">DASH · Privacy First. Built for You.</div>
        </div>
      </div>

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

      <Section title="VPN">
        <VpnSettings />
      </Section>

      <Section title="Browser Theme">
        <AppThemeAppearance />
      </Section>

      <Section title="Home Page Theme">
        <NewTabAppearance />
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

      <Section title="Toolbar">
        <ToggleRow
          label="Show bookmarks bar (Ctrl+Shift+B)"
          checked={settings.showBookmarksBar}
          onChange={() => set('showBookmarksBar', !settings.showBookmarksBar)}
        />
      </Section>

      <Section title="Performance">
        <ToggleRow
          label="Sleep inactive tabs"
          checked={settings.sleepingTabsEnabled}
          onChange={() => set('sleepingTabsEnabled', !settings.sleepingTabsEnabled)}
        />
        <SiteListField
          label="Never sleep these sites (one per line)"
          placeholder={'music.youtube.com\nmeet.google.com'}
          value={settings.neverSleepHosts}
          onSave={(v) => set('neverSleepHosts', v)}
        />
        <SleepStats />
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
        <div className="h-2" />
        <ToggleRow
          label="Send Do Not Track and Global Privacy Control signals"
          checked={settings.sendPrivacySignals}
          onChange={() => set('sendPrivacySignals', !settings.sendPrivacySignals)}
        />
        <div className="h-2" />
        <ToggleRow
          label="Remove tracking parameters from links (utm_*, fbclid, gclid…)"
          checked={settings.stripTrackingParams}
          onChange={() => set('stripTrackingParams', !settings.stripTrackingParams)}
        />
        <div className="h-2" />
        <ToggleRow
          label="Clear browsing history when DASH quits"
          checked={settings.clearHistoryOnExit}
          onChange={() => set('clearHistoryOnExit', !settings.clearHistoryOnExit)}
        />
        <div className="h-2" />
        <ToggleRow
          label="Clear cookies, site data and cache when DASH quits"
          checked={settings.clearSiteDataOnExit}
          onChange={() => set('clearSiteDataOnExit', !settings.clearSiteDataOnExit)}
        />
        {settings.clearSiteDataOnExit && (
          <SiteListField
            label="Keep cookies and data for these sites (one per line)"
            placeholder={'github.com\nmail.example.com'}
            value={settings.keepSiteDataHosts}
            onSave={(v) => set('keepSiteDataHosts', v)}
          />
        )}
        <div className="h-2" />
        <ToggleRow
          label="Fingerprint protection (canvas, audio, hardware details)"
          checked={settings.fingerprintProtection}
          onChange={() => set('fingerprintProtection', !settings.fingerprintProtection)}
        />
        <div className="h-2" />
        <ToggleRow
          label="Block third-party cookies"
          checked={settings.blockThirdPartyCookies}
          onChange={() => set('blockThirdPartyCookies', !settings.blockThirdPartyCookies)}
        />
        <p className="mt-1.5 text-[12px] text-text-tertiary">
          Third-party cookie blocking can stop some "Sign in with…" buttons and embedded logins from working. Turn it off
          if a login breaks.
        </p>
        <div className="mt-3 rounded-lg bg-surface-elevated border border-border/60 p-3 space-y-2">
          <div className="text-[13px] text-text-primary">Secure DNS (DNS-over-HTTPS)</div>
          <div className="flex gap-2">
            <select
              aria-label="Secure DNS mode"
              value={settings.dohMode}
              onChange={(e) => set('dohMode', e.target.value as typeof settings.dohMode)}
              className="h-8 flex-1 rounded-md bg-surface border border-border/60 text-[12px] text-text-primary px-2"
            >
              <option value="off">Off — use my operating system's DNS</option>
              <option value="automatic">Automatic — try secure DNS, fall back if it fails</option>
              <option value="secure">Always — never fall back (sites won't load if blocked)</option>
            </select>
            <select
              aria-label="Secure DNS provider"
              value={settings.dohProvider}
              disabled={settings.dohMode === 'off'}
              onChange={(e) => set('dohProvider', e.target.value as typeof settings.dohProvider)}
              className="h-8 w-36 rounded-md bg-surface border border-border/60 text-[12px] text-text-primary px-2 disabled:opacity-50"
            >
              {Object.entries(DOH_PROVIDERS).map(([id, p]) => (
                <option key={id} value={id}>{p.name}</option>
              ))}
            </select>
          </div>
          <p className="text-[12px] text-text-tertiary">
            When on, the website names you visit are sent encrypted to the provider you choose, instead of to your
            ISP's DNS. DASH never turns this on by itself.
          </p>
        </div>
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

      <Section title="Privacy Report">
        <button
          onClick={() => setSubPage('report')}
          className="w-full flex items-center justify-between h-10 px-3 rounded-lg bg-surface-elevated border border-border/60 text-[13px] text-text-primary hover:bg-surface-hover transition-colors"
        >
          Blocked ads &amp; trackers
          <span className="text-text-tertiary">›</span>
        </button>
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

      <ImportSection />

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

function ImportSection() {
  const [sources, setSources] = useState<ImportSource[] | null>(null);
  const [choices, setChoices] = useState<Record<string, { bookmarks: boolean; history: boolean }>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const scan = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const found = await window.dash.browserImport.detect();
      setSources(found);
      setChoices(Object.fromEntries(found.map((f) => [f.id, { bookmarks: true, history: true }])));
    } catch (err) {
      setMessage(`Could not scan for browsers: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const run = async (source: ImportSource) => {
    const choice = choices[source.id];
    setBusy(true);
    setMessage(null);
    try {
      const result = await window.dash.browserImport.run(source.id, choice);
      setMessage(`Imported ${result.bookmarks} bookmarks and ${result.history} history entries from ${source.name}.`);
    } catch (err) {
      setMessage(`Import failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Import from another browser">
      <div className="rounded-lg bg-surface-elevated border border-border/60 p-3 space-y-3">
        <p className="text-[12px] text-text-tertiary">
          Reads Chrome, Edge, Brave, Chromium and Firefox profiles on this computer. Nothing leaves your device.
          Passwords are not imported — they are encrypted with the other browser's keys.
        </p>
        <button
          onClick={() => void scan()}
          disabled={busy}
          className="h-8 px-3 rounded-lg text-[12px] font-medium text-white bg-accent hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Working…' : sources ? 'Scan again' : 'Find browsers'}
        </button>
        {sources && sources.length === 0 && (
          <div className="text-[12px] text-text-tertiary">No other browser profiles with data were found.</div>
        )}
        {sources?.map((s) => (
          <div key={s.id} data-testid="import-source" className="flex items-center gap-3 border-t border-border/40 pt-3">
            <div className="flex-1 min-w-0">
              <div className="text-[13px] text-text-primary truncate">{s.name}</div>
              <div className="text-[11px] text-text-tertiary">
                {s.bookmarkCount} bookmarks · {s.historyCount} history entries
              </div>
            </div>
            <CheckRow
              label="Bookmarks"
              checked={choices[s.id]?.bookmarks ?? false}
              onChange={(v) => setChoices((c) => ({ ...c, [s.id]: { ...c[s.id], bookmarks: v } }))}
            />
            <CheckRow
              label="History"
              checked={choices[s.id]?.history ?? false}
              onChange={(v) => setChoices((c) => ({ ...c, [s.id]: { ...c[s.id], history: v } }))}
            />
            <button
              onClick={() => void run(s)}
              disabled={busy || (!choices[s.id]?.bookmarks && !choices[s.id]?.history)}
              className="h-8 px-3 rounded-lg text-[12px] font-medium text-white bg-accent hover:opacity-90 disabled:opacity-50"
            >
              Import
            </button>
          </div>
        ))}
        {message && <div data-testid="import-message" className="text-[12px] text-text-secondary">{message}</div>}
      </div>
    </Section>
  );
}

/** Live sleeping-tab numbers. The memory figure is an estimate taken when each tab was put to sleep. */
function SleepStats() {
  const [stats, setStats] = useState<{ sleeping: number; freedMb: number } | null>(null);
  useEffect(() => {
    const load = () => window.dash.tabs.sleepStats().then(setStats).catch(() => undefined);
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);
  if (!stats) return null;
  return (
    <div className="mt-2 text-[12px] text-text-tertiary">
      {stats.sleeping} tab{stats.sleeping === 1 ? '' : 's'} asleep now · about {stats.freedMb} MB released since DASH started (estimate)
    </div>
  );
}
