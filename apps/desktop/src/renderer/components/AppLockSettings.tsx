import { useState } from 'react';
import { Modal, PasswordField, failText } from './website-lock/glass';
import { useAppLockStatus } from './AppLockGate';
import { useDetachesActiveViewWhileOpen } from '../hooks/useDetachesActiveViewWhileOpen';

const IDLE_LABELS: [number, string][] = [[0, 'Never'], [1, '1 minute'], [5, '5 minutes'], [15, '15 minutes'], [30, '30 minutes'], [60, '1 hour']];
const idleLabel = (m: number): string => IDLE_LABELS.find(([n]) => n === m)?.[1] ?? 'Never';

type Dlg = 'enable' | 'change' | 'idle' | 'disable' | null;

/** Settings → Privacy & Security → App Lock. */
export function AppLockSettings() {
  const status = useAppLockStatus();
  const [dlg, setDlg] = useState<Dlg>(null);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [pw3, setPw3] = useState('');
  const [idle, setIdle] = useState(15);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const open = (d: Dlg) => { setDlg(d); setPw(''); setPw2(''); setPw3(''); setErr(''); setIdle(status.idleMinutes || 15); };
  const close = () => setDlg(null);
  const run = async (p: Promise<{ ok: true } | { ok: false; code: string; message: string; retryAfterMs?: number; attemptsLeft?: number }>) => {
    setBusy(true);
    const r = await p;
    setBusy(false);
    if (r.ok) close(); else setErr(failText(r));
  };

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-text-secondary leading-relaxed">
        Lock the whole browser with one password. DASH always starts locked, and can lock itself when the computer is not used. While locked, pages are hidden and muted.
        This keeps people out of DASH on this computer; it does not encrypt your files, so also use Windows sign-in and disk encryption.
      </p>
      {!status.enabled ? (
        <button className="wl-btn wl-btn-primary" onClick={() => open('enable')}>Turn on App Lock…</button>
      ) : (
        <div className="space-y-2">
          <div className="text-[13px]"><span className="wl-ok">● On</span> · auto-lock: <b>{idleLabel(status.idleMinutes)}</b> without computer use</div>
          <div className="flex flex-wrap gap-2">
            <button className="wl-btn wl-btn-primary" onClick={() => void window.dash.appLock.lock()}>Lock DASH now <span className="wl-muted ml-1">Ctrl+Alt+L</span></button>
            <button className="wl-btn" onClick={() => open('change')}>Change password…</button>
            <button className="wl-btn" onClick={() => open('idle')}>Auto-lock time…</button>
            <button className="wl-btn wl-btn-danger" onClick={() => open('disable')}>Turn off…</button>
          </div>
        </div>
      )}

      {dlg && (
        <Modal title={dlg === 'enable' ? 'Turn on App Lock' : dlg === 'change' ? 'Change password' : dlg === 'idle' ? 'Auto-lock time' : 'Turn off App Lock'} onClose={close}>
          <div className="space-y-3">
            {dlg === 'enable' && (
              <>
                <PasswordField value={pw} onChange={setPw} placeholder="New password (8+ characters)" label="New password" autoFocus />
                <PasswordField value={pw2} onChange={setPw2} placeholder="Repeat password" label="Repeat password" />
                <p className="text-[12px] wl-bad">There is no way to recover this password. If you forget it, the only way in is to erase your DASH data.</p>
              </>
            )}
            {dlg === 'change' && (
              <>
                <PasswordField value={pw} onChange={setPw} placeholder="Current password" label="Current password" autoFocus />
                <PasswordField value={pw2} onChange={setPw2} placeholder="New password (8+ characters)" label="New password" />
                <PasswordField value={pw3} onChange={setPw3} placeholder="Repeat new password" label="Repeat new password" />
              </>
            )}
            {(dlg === 'idle' || dlg === 'enable') && (
              <label className="block text-[13px]">
                <span className="wl-muted text-[12px]">Lock after no keyboard or mouse use for</span>
                <select className="wl-input mt-1" value={idle} onChange={(e) => setIdle(Number(e.target.value))} aria-label="Auto-lock time">
                  {IDLE_LABELS.map(([n, l]) => <option key={n} value={n}>{l}</option>)}
                </select>
              </label>
            )}
            {(dlg === 'idle' || dlg === 'disable') && (
              <PasswordField value={pw} onChange={setPw} placeholder="Current password" label="Current password" autoFocus />
            )}
            <div role="alert" className="min-h-[16px] text-[12px] wl-bad">{err}</div>
            <button
              className={`wl-btn w-full ${dlg === 'disable' ? 'wl-btn-danger' : 'wl-btn-primary'}`}
              disabled={busy || !pw}
              onClick={() => {
                setErr('');
                if (dlg === 'enable') void run(window.dash.appLock.enable(pw, pw2, idle));
                else if (dlg === 'change') void run(window.dash.appLock.change(pw, pw2, pw3));
                else if (dlg === 'idle') void run(window.dash.appLock.setIdle(pw, idle));
                else void run(window.dash.appLock.disable(pw));
              }}
            >
              {dlg === 'enable' ? 'Turn on' : dlg === 'change' ? 'Save new password' : dlg === 'idle' ? 'Save' : 'Turn off App Lock'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/** The "choose a password" dialog on its own, so it can open from anywhere (menu, toolbar, Settings). */
export function AppLockEnableDialog({ onClose }: { onClose: () => void }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [idle, setIdle] = useState(15);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useDetachesActiveViewWhileOpen(true);
  const submit = async () => {
    setBusy(true);
    setErr('');
    const r = await window.dash.appLock.enable(pw, pw2, idle);
    setBusy(false);
    if (r.ok) onClose(); else setErr(failText(r));
  };
  return (
    <div className="wl-scope">
    <Modal title="Lock DASH with a password" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-[13px] wl-muted leading-relaxed">Choose one password for the whole browser. DASH will ask for it every time it opens and whenever you lock it.</p>
        <PasswordField value={pw} onChange={setPw} placeholder="New password (8+ characters)" label="New password" autoFocus />
        <PasswordField value={pw2} onChange={setPw2} placeholder="Repeat password" label="Repeat password" onEnter={() => pw && pw2 && void submit()} />
        <label className="block text-[13px]">
          <span className="wl-muted text-[12px]">Also lock after no keyboard or mouse use for</span>
          <select className="wl-input mt-1" value={idle} onChange={(e) => setIdle(Number(e.target.value))} aria-label="Auto-lock time">
            {IDLE_LABELS.map(([n, l]) => <option key={n} value={n}>{l}</option>)}
          </select>
        </label>
        <p className="text-[12px] wl-bad">There is no way to recover this password. If you forget it, the only way in is to erase your DASH data.</p>
        <div role="alert" className="min-h-[16px] text-[12px] wl-bad">{err}</div>
        <button className="wl-btn wl-btn-primary w-full" disabled={busy || !pw || !pw2} onClick={() => void submit()}>Turn on and lock</button>
      </div>
    </Modal>
    </div>
  );
}

/** Locks DASH now, or opens the password dialog first if App Lock is not on yet. */
export async function lockDashNow(): Promise<void> {
  const s = await window.dash.appLock.status();
  if (s.enabled) await window.dash.appLock.lock();
  else window.dispatchEvent(new Event('dash:app-lock-setup'));
}
