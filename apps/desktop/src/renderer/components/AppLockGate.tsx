import { useCallback, useEffect, useState } from 'react';
import type { AppLockStatus } from '../../shared/ipc-channels';
import { failText, useCountdown } from './website-lock/glass';
import { Logo } from './Logo';
import { AppLockEnableDialog } from './AppLockSettings';

const UNLOCKED: AppLockStatus = window.dash.appLock.startsLocked
  ? { enabled: true, locked: true, idleMinutes: 0 } // DASH was started locked: no unlocked frame, not even for a moment
  : { enabled: false, locked: false, idleMinutes: 0 };

/** Tracks App Lock. Other parts of the window read `locked` to ignore shortcuts while DASH is locked. */
export function useAppLockStatus(): AppLockStatus {
  const [s, setS] = useState<AppLockStatus>(UNLOCKED);
  useEffect(() => {
    void window.dash.appLock.status().then(setS).catch(() => undefined);
    return window.dash.appLock.onChanged(setS);
  }, []);
  return s;
}

let lockedNow = false;
export const isAppLockedNow = (): boolean => lockedNow;

/** Full-window lock screen. It sits above the whole toolbar; the page views themselves are hidden by the main process. */
export function AppLockGate() {
  const status = useAppLockStatus();
  lockedNow = status.locked;
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [until, setUntil] = useState<number | null>(null);
  const [forgot, setForgot] = useState(false);
  const [typed, setTyped] = useState('');
  const wait = useCountdown(until);
  const [setupOpen, setSetupOpen] = useState(false);
  const [show, setShow] = useState(false);
  const [shake, setShake] = useState(0);
  const [mounted, setMounted] = useState(status.locked);
  const [leaving, setLeaving] = useState(false);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (status.locked) { setMounted(true); setLeaving(false); return; }
    if (!mounted) return;
    setLeaving(true); // unlocked: let the screen play its exit before it goes
    const t = setTimeout(() => { setMounted(false); setLeaving(false); setPw(''); setErr(''); setForgot(false); setTyped(''); setUntil(null); setShow(false); }, 340);
    return () => clearTimeout(t);
  }, [status.locked, mounted]);
  useEffect(() => {
    if (!status.locked) return;
    const t = setInterval(() => setNow(new Date()), 15_000);
    setNow(new Date());
    return () => clearInterval(t);
  }, [status.locked]);
  useEffect(() => {
    const open = () => setSetupOpen(true);
    window.addEventListener('dash:app-lock-setup', open);
    return () => window.removeEventListener('dash:app-lock-setup', open);
  }, []);

  const unlock = useCallback(async () => {
    if (!pw || busy) return;
    setBusy(true);
    const r = await window.dash.appLock.unlock(pw);
    setBusy(false);
    if (r.ok) return;
    setPw('');
    if (r.retryAfterMs) setUntil(Date.now() + r.retryAfterMs);
    setErr(failText(r));
    setShake((n) => n + 1);
  }, [pw, busy]);

  const erase = async () => {
    setBusy(true);
    const r = await window.dash.appLock.erase(typed);
    setBusy(false);
    if (!r.ok) setErr(failText(r));
  };

  if (!mounted) return setupOpen ? <AppLockEnableDialog onClose={() => setSetupOpen(false)} /> : null;
  const time = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const date = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const waiting = wait > 0;
  return (
    <div className={`fixed inset-0 z-[1000] bg-surface ${leaving ? 'lk-leave' : ''}`} role="dialog" aria-modal="true" aria-label="DASH is locked">
      <div className="wl-root lk-stage h-full w-full">
        <div className="lk-aura" aria-hidden="true" />
        <div className="lk-clock" aria-hidden="true">
          <div className="lk-time">{time}</div>
          <div className="lk-date">{date}</div>
        </div>
        <div className="lk-center">
          <div className={`lk-mark ${leaving ? 'lk-mark-done' : ''}`}>
            <span className="lk-ring lk-ring-a" aria-hidden="true" />
            <span className="lk-ring lk-ring-b" aria-hidden="true" />
            <div className="lk-tile text-accent"><Logo size={54} /></div>
            <span className="lk-badge" aria-hidden="true">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" fill="currentColor" stroke="none" />
                <path className="lk-shackle" d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
              </svg>
            </span>
          </div>
          {!forgot ? (
            <>
              <h1 className="lk-title lk-rise" style={{ animationDelay: '80ms' }}>DASH is locked</h1>
              <p className="lk-sub lk-rise" style={{ animationDelay: '140ms' }}>Enter your password to continue.</p>
              <div key={shake} className={`lk-field lk-rise ${shake ? 'lk-shake' : ''} ${err || waiting ? 'lk-field-bad' : ''}`} style={{ animationDelay: '200ms' }}>
                <input
                  className="lk-input"
                  type={show ? 'text' : 'password'}
                  value={pw}
                  placeholder="Password"
                  aria-label="DASH password"
                  autoComplete="off"
                  autoFocus
                  spellCheck={false}
                  disabled={leaving}
                  onChange={(e) => { setPw(e.target.value); if (err) setErr(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') void unlock(); }}
                />
                <button type="button" className="lk-icon-btn" aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} onClick={() => setShow((v) => !v)}>
                  {show ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l18 18M10.6 6.2A9.8 9.8 0 0 1 12 6c5 0 8.5 4 9.5 6a12 12 0 0 1-2.7 3.4M6.5 7.6A12.4 12.4 0 0 0 2.5 12c1 2 4.5 6 9.5 6 1.5 0 2.8-.4 4-.9M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></svg>
                  )}
                </button>
                <button type="button" className="lk-go" aria-label="Unlock" disabled={!pw || busy || waiting || leaving} onClick={() => void unlock()}>
                  {busy ? <span className="lk-spin" aria-hidden="true" /> : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                  )}
                </button>
              </div>
              <div role="alert" aria-live="assertive" className="lk-msg">{waiting ? `Too many wrong tries. Try again in ${wait}s.` : err}</div>
              <button className="lk-link lk-rise" style={{ animationDelay: '260ms' }} onClick={() => { setForgot(true); setErr(''); }}>Forgot the password?</button>
            </>
          ) : (
            <div className="lk-forgot lk-rise">
              <h1 className="lk-title">Erase and reset DASH</h1>
              <p className="lk-sub lk-sub-left">
                Nobody, including DASH, can recover the password. The only way back in is to <b className="wl-bad">permanently erase</b> your history, bookmarks, saved
                passwords, cookies, downloads list, notes, saved pages and open tabs from this DASH. Website Lock settings are kept. Then the lock is removed.
              </p>
              <input className="lk-input lk-input-box" aria-label="Type ERASE to confirm" placeholder="Type ERASE to confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
              <div role="alert" className="lk-msg">{err}</div>
              <button className="lk-danger" disabled={busy || typed !== 'ERASE'} onClick={() => void erase()}>{busy ? 'Erasing…' : 'Erase and reset'}</button>
              <button className="lk-link" onClick={() => { setForgot(false); setErr(''); setTyped(''); }}>Back</button>
            </div>
          )}
        </div>
        <div className="lk-foot" aria-hidden="true">Everything stays on this device · Ctrl+Alt+L locks DASH any time</div>
      </div>
    </div>
  );
}
