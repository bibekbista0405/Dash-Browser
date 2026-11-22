import { useEffect, useState } from 'react';
import type { WebsiteLockSite } from '../../shared/ipc-channels';
import { Logo } from '../components/Logo';
import { LockGlyph, PasswordField, failText, useCountdown } from '../components/website-lock/glass';
import { useSettingsStore } from '../store/settings-store';
import { useTheme } from '../hooks/useTheme';

type Pending = { host: string | null; site: WebsiteLockSite };

/**
 * The lock screen. It is one of DASH's own pages (dash://lock, with the trusted bridge), shown in place of the website:
 * the website itself has not been requested, so there is nothing behind this screen to reveal.
 */
export function LockScreen() {
  const settings = useSettingsStore();
  useTheme(settings.settings.theme, settings.isLoaded);
  const [pending, setPending] = useState<Pending | null | undefined>(undefined);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [shake, setShake] = useState(0);
  const [busy, setBusy] = useState(false);
  const [until, setUntil] = useState<number | null>(null);
  const [opening, setOpening] = useState(false);
  const [forgot, setForgot] = useState(false);
  const wait = useCountdown(until);

  useEffect(() => {
    void settings.load();
    document.title = 'Locked — DASH';
    void window.dash.websiteLock.pending().then((r) => setPending(r.ok ? r.value : null));
    return window.dash.websiteLock.onChanged(() => {
      // Unlocked elsewhere: the main process moves this tab on by itself. If the lock was removed, look again.
      void window.dash.websiteLock.pending().then((r) => r.ok && setPending(r.value));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    if (!password || busy || wait > 0) return;
    setBusy(true);
    const r = await window.dash.websiteLock.unlockPending(password);
    setBusy(false);
    if (r.ok) {
      setOpening(true); // the tab continues to the website on its own
      return;
    }
    setError(failText(r));
    setUntil(r.retryAfterMs ? Date.now() + r.retryAfterMs : null);
    setShake((n) => n + 1);
    setPassword('');
  };

  const name = pending?.site.displayName || pending?.host || '';

  return (
    <div className="wl-root h-screen w-screen flex flex-col items-center justify-center overflow-hidden p-6">
      <div className="absolute top-5 left-6 flex items-center gap-2 text-[12px] font-semibold tracking-[0.2em] wl-muted">
        <Logo size={20} /> DASH · WEBSITE LOCK
      </div>

      {pending === undefined ? null : pending === null ? (
        <div className="wl-glass wl-pop p-8 max-w-sm text-center">
          <div className="text-[15px] font-semibold mb-1">Nothing is locked here</div>
          <p className="text-[13px] wl-muted">This tab has no locked website waiting. Open a new tab to continue.</p>
        </div>
      ) : (
        <div key={shake} className={`wl-glass wl-pop w-full max-w-[400px] p-8 text-center ${shake ? 'wl-shake' : ''}`}>
          <div className="wl-float flex justify-center mb-4">
            <LockGlyph open={opening} />
          </div>
          <h1 className="text-[20px] font-semibold">{name} is locked</h1>
          <p className="text-[13px] wl-muted mt-1 mb-5">
            <span className="font-mono">{pending.host}</span> has not been opened. Enter its password to continue.
          </p>

          {!forgot ? (
            <div className="space-y-3 text-left">
              <PasswordField value={password} onChange={(v) => { setPassword(v); setError(''); }} placeholder="Password for this website" label="Password" autoFocus onEnter={submit} />
              <div role="alert" aria-live="assertive" className="min-h-[18px] text-[12px] wl-bad">
                {wait > 0 ? `Too many wrong tries. Try again in ${wait}s.` : error}
              </div>
              <button className="wl-btn wl-btn-primary w-full" disabled={!password || busy || wait > 0} onClick={submit}>
                {busy ? 'Checking…' : opening ? 'Opening…' : 'Unlock'}
              </button>
              <button className="w-full text-[12px] wl-muted hover:text-[var(--wl-text)] underline underline-offset-2" onClick={() => setForgot(true)}>
                Forgot password?
              </button>
            </div>
          ) : (
            <ForgotPassword site={pending.site} onBack={() => setForgot(false)} onDone={() => setForgot(false)} />
          )}
        </div>
      )}
      <p className="absolute bottom-5 text-[11px] wl-muted">Locked websites stay locked until you quit DASH or lock them again.</p>
    </div>
  );
}

function ForgotPassword({ site, onBack, onDone }: { site: WebsiteLockSite; onBack: () => void; onDone: () => void }) {
  const [key, setKey] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const go = async () => {
    setBusy(true);
    const r = await window.dash.websiteLock.recoverSite(site.id, key, pw, pw2);
    setBusy(false);
    if (r.ok) {
      setDone(true);
      return;
    }
    setError(failText(r));
  };

  if (done) {
    return (
      <div className="space-y-3 text-left">
        <p className="text-[13px]">New password saved for <b>{site.hostname}</b>. Your other websites were not changed.</p>
        <button className="wl-btn wl-btn-primary w-full" onClick={onDone}>Back to unlock</button>
      </div>
    );
  }
  return (
    <div className="space-y-3 text-left">
      <p className="text-[12px] wl-muted">Enter your DASH recovery key and choose a new password for {site.hostname} only. This works offline.</p>
      <input className="wl-input font-mono" placeholder="XXXX-XXXX-XXXX-XXXX-…" aria-label="Recovery key" value={key} onChange={(e) => { setKey(e.target.value); setError(''); }} autoFocus spellCheck={false} />
      <PasswordField value={pw} onChange={setPw} placeholder="New password (8+ characters)" label="New password" />
      <PasswordField value={pw2} onChange={setPw2} placeholder="Repeat new password" label="Repeat new password" onEnter={go} />
      <div role="alert" aria-live="assertive" className="min-h-[18px] text-[12px] wl-bad">{error}</div>
      <div className="flex gap-2">
        <button className="wl-btn flex-1" onClick={onBack}>Back</button>
        <button className="wl-btn wl-btn-primary flex-1" disabled={busy || !key || !pw || !pw2} onClick={go}>{busy ? 'Checking…' : 'Set new password'}</button>
      </div>
      <p className="text-[11px] wl-muted">Lost the recovery key too? Open Website Lock from the extensions menu: it has a clearly labelled local reset.</p>
    </div>
  );
}
