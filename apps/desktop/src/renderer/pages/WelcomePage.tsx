import { useEffect, useState } from 'react';
import { SEARCH_ENGINES, type DashSettings } from '../../shared/ipc-channels';
import { Logo } from '../components/Logo';
import { useSettingsStore } from '../store/settings-store';

type Theme = DashSettings['theme'];

const STEPS = ['hello', 'theme', 'search', 'privacy', 'done'] as const;

const THEMES: { id: Theme; label: string; sub: string; swatch: string; ink: string }[] = [
  { id: 'dark', label: 'Dark', sub: 'Easy on the eyes', swatch: '#0b0d10', ink: '#e8eaed' },
  { id: 'light', label: 'Light', sub: 'Bright and clean', swatch: '#ffffff', ink: '#14161a' },
  { id: 'system', label: 'System', sub: 'Follow your device', swatch: 'linear-gradient(135deg,#0b0d10 50%,#ffffff 50%)', ink: '#8a909a' },
];

/**
 * First-run welcome: a few skippable steps that write the same real settings
 * the Settings page edits. Shown once on a fresh profile; nothing is sent
 * anywhere and nothing here is a placeholder.
 */
export function WelcomePage() {
  const { settings, set, load, subscribe, isLoaded } = useSettingsStore();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd');
  const [imported, setImported] = useState<string | null>(null);

  useEffect(() => {
    void load();
    document.title = 'Welcome to DASH';
    return subscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Remember explicitly that the welcome is still pending, so quitting half-way shows it again next time.
  useEffect(() => {
    if (isLoaded && !settings.onboardingDone) void window.dash.settings.set('onboardingDone', false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  const go = (n: number) => {
    setDir(n >= step ? 'fwd' : 'back');
    setStep(Math.max(0, Math.min(STEPS.length - 1, n)));
  };
  const [leaving, setLeaving] = useState(false);
  const finish = async () => {
    if (leaving) return;
    setLeaving(true); // content fades out first, so the home page never replaces it with a jump
    await set('onboardingDone', true);
    await new Promise((r) => setTimeout(r, 320));
    window.location.href = 'dash://newtab';
  };

  const id = STEPS[step];
  const btnPrimary =
    'welcome-shine h-10 px-6 rounded-full bg-accent text-white text-[14px] font-medium hover:brightness-110 active:scale-[0.97] transition';
  const btnGhost = 'h-10 px-4 rounded-full text-[13px] text-text-secondary hover:text-text-primary hover:bg-surface-hover transition';

  return (
    <div className="welcome-root relative h-screen w-screen overflow-hidden bg-surface text-text-primary flex flex-col items-center justify-center">
      <div className="welcome-glow" aria-hidden />
      <div className="welcome-orb welcome-orb-a" aria-hidden />
      <div className="welcome-orb welcome-orb-b" aria-hidden />
      {/* The window has no tab strip here, so this strip lets the window be dragged; it stops short of the window buttons. */}
      <div className="app-drag absolute top-0 left-0 right-0 h-[34px]" aria-hidden />

      <button onClick={finish} className={`${btnGhost} app-no-drag absolute top-12 right-6`}>
        Skip
      </button>

      <div key={id} className={`welcome-step ${leaving ? 'welcome-out' : dir === 'fwd' ? 'welcome-in-fwd' : 'welcome-in-back'} w-[min(640px,92vw)] flex flex-col items-center text-center px-4`}>
        {id === 'hello' && (
          <>
            <div className="welcome-logo text-accent"><Logo size={88} /></div>
            <h1 className="mt-7 text-[38px] leading-tight font-semibold tracking-tight" aria-label="Welcome to DASH">
              {['Welcome', 'to', 'DASH'].map((w, i) => (
                <span key={w} aria-hidden="true" className="welcome-word" style={{ animationDelay: `${160 + i * 130}ms` }}>{w}{i < 2 ? '\u00a0' : ''}</span>
              ))}
            </h1>
            <p className="welcome-rise mt-3 text-[15px] text-text-secondary max-w-md" style={{ animationDelay: '220ms' }}>
              A fast browser that keeps what you do on your own device. No account, no tracking, no telemetry.
            </p>
            <button onClick={() => go(1)} className={`${btnPrimary} welcome-rise mt-9`} style={{ animationDelay: '340ms' }}>
              Get started
            </button>
          </>
        )}

        {id === 'theme' && (
          <>
            <h2 className="text-[28px] font-semibold tracking-tight">Pick a look</h2>
            <p className="mt-2 text-[14px] text-text-secondary">Changes apply right away. You can switch any time in Settings.</p>
            <div className="mt-8 grid grid-cols-3 gap-4 w-full">
              {THEMES.map((t, i) => (
                <button
                  key={t.id}
                  onClick={() => void set('theme', t.id)}
                  aria-pressed={settings.theme === t.id}
                  className={`welcome-rise rounded-2xl border p-3 text-left transition hover:-translate-y-0.5 ${
                    settings.theme === t.id ? 'border-transparent bg-accent/15' : 'border-border hover:border-text-tertiary'
                  }`}
                  style={{ animationDelay: `${80 + i * 80}ms` }}
                >
                  <div className="h-20 rounded-lg border border-border/60 flex items-end p-2" style={{ background: t.swatch }}>
                    <span className="h-1.5 w-10 rounded-full" style={{ background: t.ink, opacity: 0.7 }} />
                  </div>
                  <div className="mt-3 text-[14px] font-medium">{t.label}</div>
                  <div className="text-[12px] text-text-tertiary">{t.sub}</div>
                </button>
              ))}
            </div>
          </>
        )}

        {id === 'search' && (
          <>
            <h2 className="text-[28px] font-semibold tracking-tight">Choose your search engine</h2>
            <p className="mt-2 text-[14px] text-text-secondary">Used when you type a search in the address bar.</p>
            <div className="mt-8 grid grid-cols-2 gap-3 w-full">
              {(Object.keys(SEARCH_ENGINES) as (keyof typeof SEARCH_ENGINES)[]).map((k, i) => (
                <button
                  key={k}
                  onClick={() => void set('searchEngine', k)}
                  aria-pressed={settings.searchEngine === k}
                  className={`welcome-rise h-14 rounded-xl border px-4 flex items-center justify-between text-[14px] transition hover:-translate-y-0.5 ${
                    settings.searchEngine === k ? 'border-transparent bg-accent/15' : 'border-border hover:border-text-tertiary'
                  }`}
                  style={{ animationDelay: `${60 + i * 70}ms` }}
                >
                  <span>{SEARCH_ENGINES[k].label}</span>
                  {settings.searchEngine === k && <span className="text-accent">✓</span>}
                </button>
              ))}
            </div>
          </>
        )}

        {id === 'privacy' && (
          <>
            <h2 className="text-[28px] font-semibold tracking-tight">Privacy, your way</h2>
            <p className="mt-2 text-[14px] text-text-secondary">These work on your device. DASH never sends your browsing anywhere.</p>
            <div className="mt-8 w-full space-y-3 text-left">
              {(
                [
                  ['adBlockingEnabled', 'Block ads', 'Stops ad requests before they load.'],
                  ['trackerBlockingEnabled', 'Block trackers', 'Stops known tracking requests.'],
                  ['httpsOnlyMode', 'HTTPS-only mode', 'Warns before opening sites without encryption.'],
                ] as const
              ).map(([key, title, sub], i) => (
                <label
                  key={key}
                  className="welcome-rise flex items-center justify-between gap-4 rounded-xl border border-border px-4 py-3 cursor-pointer hover:border-text-tertiary transition"
                  style={{ animationDelay: `${60 + i * 80}ms` }}
                >
                  <span>
                    <span className="block text-[14px] font-medium">{title}</span>
                    <span className="block text-[12px] text-text-tertiary">{sub}</span>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={settings[key]}
                    onChange={(e) => void set(key, e.target.checked)}
                    className="h-5 w-5 accent-[rgb(var(--color-accent))]"
                  />
                </label>
              ))}
            </div>
          </>
        )}

        {id === 'done' && (
          <>
            <svg className="welcome-check" width="88" height="88" viewBox="0 0 88 88" fill="none" aria-hidden>
              <circle className="welcome-check-ring" cx="44" cy="44" r="38" stroke="rgb(var(--color-accent))" strokeWidth="4" />
              <path className="welcome-check-tick" d="M27 45l12 12 22-26" stroke="rgb(var(--color-accent))" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <h2 className="welcome-rise mt-6 text-[30px] font-semibold tracking-tight" style={{ animationDelay: '500ms' }}>You&apos;re all set</h2>
            <p className="welcome-rise mt-2 text-[14px] text-text-secondary max-w-md" style={{ animationDelay: '580ms' }}>
              Everything you chose can be changed in Settings. Bring your bookmarks along if you have them.
            </p>
            <div className="welcome-rise mt-8 flex flex-col items-center gap-3" style={{ animationDelay: '660ms' }}>
              <button onClick={finish} className={btnPrimary}>Start browsing</button>
              <button
                className={btnGhost}
                onClick={async () => {
                  const r = await window.dash.bookmarks.import();
                  if (r) setImported(`Imported ${r.imported} bookmark${r.imported === 1 ? '' : 's'}.`);
                }}
              >
                Import bookmarks from a file…
              </button>
              {imported && <span className="text-[12px] text-text-tertiary">{imported}</span>}
            </div>
          </>
        )}
      </div>

      <div className="absolute bottom-8 flex flex-col items-center gap-5">
        {step > 0 && step < STEPS.length - 1 && (
          <div className="flex items-center gap-3">
            <button onClick={() => go(step - 1)} className={btnGhost}>Back</button>
            <button onClick={() => go(step + 1)} className={btnPrimary}>Continue</button>
          </div>
        )}
        <div className="flex gap-2" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
          {STEPS.map((s, i) => (
            <span key={s} className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? 'w-6 bg-accent' : 'w-1.5 bg-border'}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
