import { useCallback, useEffect, useMemo, useState } from 'react';
import type { WebsiteLockResult, WebsiteLockSite } from '../../shared/ipc-channels';
import { Avatar, LockGlyph, Modal, PasswordField, failText, useCountdown } from '../components/website-lock/glass';
import { RecoveryKeyView } from '../components/website-lock/RecoveryKeyView';

type Dialog =
  | { kind: 'add' }
  | { kind: 'recovery-setup' }
  | { kind: 'password'; site: WebsiteLockSite }
  | { kind: 'edit'; site: WebsiteLockSite }
  | { kind: 'remove'; site: WebsiteLockSite }
  | { kind: 'forgot'; site: WebsiteLockSite }
  | { kind: 'regenerate' }
  | { kind: 'lost'; site: WebsiteLockSite | null }
  | { kind: 'export' }
  | { kind: 'import' };

const EVENT_LABELS: Record<string, string> = {
  unlocked: 'Unlocked',
  locked: 'Locked',
  password_failed: 'Wrong password',
  password_changed: 'Password changed',
  password_recovered: 'Password reset with recovery key',
  recovery_created: 'Recovery key created',
  recovery_regenerated: 'Recovery key regenerated',
  recovery_failed: 'Wrong recovery key',
  admin_reset_site: 'Local reset of a password',
  admin_reset_recovery: 'Local reset of the recovery key',
  site_added: 'Website protected',
  site_removed: 'Protection removed',
  site_edited: 'Settings changed',
  protection_disabled: 'Protection turned off',
  protection_enabled: 'Protection turned on',
  backup_exported: 'Backup saved',
  backup_restored: 'Backup restored',
};

/** Handles a result: shows the message on failure, runs `then` on success. */
function useAction() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(p: Promise<WebsiteLockResult<T>>, then: (v: T) => void) => {
    setBusy(true);
    setError('');
    const r = await p;
    setBusy(false);
    if (r.ok) then(r.value);
    else setError(failText(r));
  }, []);
  return { error, busy, run, setError };
}

const Err = ({ text }: { text: string }) => (
  <div role="alert" aria-live="assertive" className="min-h-[18px] text-[12px] wl-bad">{text}</div>
);

export function WebsiteLockPage() {
  const [sites, setSites] = useState<WebsiteLockSite[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [events, setEvents] = useState<{ type: string; hostname: string | null; at: number }[]>([]);
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    const [l, r, e] = await Promise.all([window.dash.websiteLock.list(), window.dash.websiteLock.recoveryStatus(), window.dash.websiteLock.events()]);
    if (l.ok) setSites(l.value);
    if (r.ok) setConfigured(r.value.configured);
    if (e.ok) setEvents(e.value);
  }, []);

  useEffect(() => {
    void refresh();
    document.title = 'Website Lock — DASH';
    return window.dash.websiteLock.onChanged(() => void refresh());
  }, [refresh]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? sites.filter((s) => s.hostname.includes(q) || s.displayName.toLowerCase().includes(q)) : sites;
  }, [sites, query]);

  const say = (t: string) => {
    setNotice(t);
    setTimeout(() => setNotice(''), 4000);
  };
  const close = () => {
    setDialog(null);
    void refresh();
  };
  const startAdd = () => setDialog(configured ? { kind: 'add' } : { kind: 'recovery-setup' });

  return (
    <div className="wl-root">
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <header className="flex items-center gap-4">
          <div className="wl-float shrink-0"><LockGlyph size={54} /></div>
          <div className="flex-1 min-w-0">
            <h1 className="text-[22px] font-semibold">Website Lock</h1>
            <p className="text-[13px] wl-muted">Every protected website has its own password. They all start locked each time DASH opens.</p>
          </div>
          <button className="wl-btn" disabled={!sites.some((s) => s.unlocked)} onClick={() => void window.dash.websiteLock.lockAll().then(() => say('Everything is locked.'))}>
            Lock all now
          </button>
          <button className="wl-btn wl-btn-primary" onClick={startAdd}>Add website</button>
        </header>

        {configured === false && (
          <div className="wl-glass p-4 flex items-center gap-4">
            <div className="flex-1 text-[13px]">
              <b>Set up your recovery key first.</b> <span className="wl-muted">It is how you reset a forgotten website password. You will need it before adding a website.</span>
            </div>
            <button className="wl-btn wl-btn-primary" onClick={() => setDialog({ kind: 'recovery-setup' })}>Set up</button>
          </div>
        )}

        <div className="wl-glass p-4 flex items-center gap-4">
          <div className="flex-1 text-[13px]"><b>Lock the whole browser instead?</b> <span className="wl-muted">App Lock asks for one password when DASH opens or when you lock it (Ctrl+Alt+L).</span></div>
          <button className="wl-btn" onClick={() => void window.dash.tabs.create('dash://settings')}>Open App Lock settings</button>
        </div>

        <input className="wl-input" placeholder="Search protected websites" aria-label="Search protected websites" value={query} onChange={(e) => setQuery(e.target.value)} />

        <section aria-label="Protected websites" className="space-y-3">
          {shown.length === 0 && (
            <div className="wl-glass p-10 text-center">
              <div className="text-[15px] font-semibold mb-1">{sites.length === 0 ? 'No protected websites yet' : 'No match'}</div>
              <p className="text-[13px] wl-muted mb-4">{sites.length === 0 ? 'Add a website and DASH will ask for its password before it loads.' : 'Try a different search.'}</p>
              {sites.length === 0 && <button className="wl-btn wl-btn-primary" onClick={startAdd}>Add your first website</button>}
            </div>
          )}
          {shown.map((s) => (
            <SiteRow key={s.id} site={s} onDialog={setDialog} onChanged={refresh} />
          ))}
        </section>

        <section className="wl-glass p-5 space-y-4" aria-label="Security">
          <h2 className="text-[15px] font-semibold">Security</h2>
          <div className="grid sm:grid-cols-2 gap-3 text-[13px]">
            <div className="wl-glass p-4 space-y-2">
              <div className="font-semibold">Recovery key</div>
              <div className={configured ? 'wl-ok' : 'wl-warn'}>{configured === null ? '…' : configured ? '● Set up' : '● Not set up'}</div>
              <div className="flex flex-wrap gap-2">
                <button className="wl-btn" disabled={!configured} onClick={() => setDialog({ kind: 'regenerate' })}>Regenerate…</button>
                <button className="wl-btn wl-btn-danger" onClick={() => setDialog({ kind: 'lost', site: null })}>I lost my key…</button>
              </div>
            </div>
            <div className="wl-glass p-4 space-y-2">
              <div className="font-semibold">Encrypted backup</div>
              <p className="wl-muted text-[12px]">Move your protections to another computer. Locked with a backup password, never plain text.</p>
              <div className="flex gap-2">
                <button className="wl-btn" disabled={sites.length === 0} onClick={() => setDialog({ kind: 'export' })}>Export…</button>
                <button className="wl-btn" onClick={() => setDialog({ kind: 'import' })}>Import…</button>
              </div>
            </div>
          </div>
          <p className="text-[12px] wl-muted leading-relaxed">
            Wrong-password protection: after 5 wrong tries in a row, further tries are refused for 30 seconds, doubling each time up to 15 minutes. This continues even if DASH is restarted.
            Unlocked websites are remembered only in memory while DASH runs; quitting or crashing locks everything. Website Lock keeps other people out of your sites inside DASH on this
            device. It does not encrypt your computer: someone with full access to your files and Windows account can still change DASH itself.
          </p>
        </section>

        <section className="wl-glass p-5" aria-label="Recent activity">
          <h2 className="text-[15px] font-semibold mb-3">Recent activity</h2>
          {events.length === 0 ? (
            <p className="text-[13px] wl-muted">Nothing yet.</p>
          ) : (
            <ul className="space-y-1.5 text-[12.5px] max-h-56 overflow-y-auto">
              {events.slice(0, 30).map((e, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span>{EVENT_LABELS[e.type] ?? e.type}{e.hostname ? <span className="wl-muted"> · {e.hostname}</span> : null}</span>
                  <span className="wl-muted shrink-0">{new Date(e.at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {notice && <div role="status" className="fixed bottom-6 left-1/2 -translate-x-1/2 wl-glass wl-pop px-4 py-2 text-[13px]">{notice}</div>}
      {dialog?.kind === 'recovery-setup' && <RecoverySetup onClose={close} onDone={() => { setConfigured(true); setDialog({ kind: 'add' }); }} />}
      {dialog?.kind === 'add' && <AddSite onClose={close} />}
      {dialog?.kind === 'password' && <ChangePassword site={dialog.site} onClose={close} onSaved={() => say('Password changed.')} />}
      {dialog?.kind === 'edit' && <EditSite site={dialog.site} onClose={close} />}
      {dialog?.kind === 'remove' && <RemoveSite site={dialog.site} onClose={close} />}
      {dialog?.kind === 'forgot' && <Forgot site={dialog.site} onClose={close} onLost={() => setDialog({ kind: 'lost', site: dialog.site })} />}
      {dialog?.kind === 'regenerate' && <Regenerate onClose={close} />}
      {dialog?.kind === 'lost' && <LostKey site={dialog.site} sites={sites} onClose={close} />}
      {dialog?.kind === 'export' && <ExportBackup onClose={close} onSaved={() => say('Backup saved.')} />}
      {dialog?.kind === 'import' && <ImportBackup onClose={close} onDone={(t) => say(t)} />}
    </div>
  );
}

function SiteRow({ site, onDialog, onChanged }: { site: WebsiteLockSite; onDialog: (d: Dialog) => void; onChanged: () => Promise<void> }) {
  const state = !site.enabled ? { t: 'Protection off', c: 'wl-warn' } : site.unlocked ? { t: 'Unlocked this session', c: 'wl-ok' } : { t: 'Locked', c: 'wl-bad' };
  return (
    <div className="wl-glass p-4 flex items-center gap-4 flex-wrap">
      <Avatar name={site.displayName} />
      <div className="flex-1 min-w-[180px]">
        <div className="text-[14px] font-semibold truncate">{site.displayName}</div>
        <div className="text-[12px] wl-muted font-mono truncate">
          {site.hostname}
          {site.includeSubdomains ? ' + subdomains' : ''}
        </div>
      </div>
      <span className={`wl-chip ${state.c}`}><span className="wl-dot" />{state.t}</span>
      <div className="flex flex-wrap gap-2">
        {site.enabled ? (
          <button className="wl-btn" disabled={!site.unlocked} onClick={() => void window.dash.websiteLock.lock(site.id).then(onChanged)}>Lock now</button>
        ) : (
          <button className="wl-btn" onClick={() => void window.dash.websiteLock.enable(site.id).then(onChanged)}>Turn on</button>
        )}
        <button className="wl-btn" onClick={() => onDialog({ kind: 'password', site })}>Password</button>
        <button className="wl-btn" onClick={() => onDialog({ kind: 'edit', site })}>Edit</button>
        <button className="wl-btn" onClick={() => onDialog({ kind: 'forgot', site })}>Forgot?</button>
        <button className="wl-btn wl-btn-danger" onClick={() => onDialog({ kind: 'remove', site })}>Remove</button>
      </div>
    </div>
  );
}

function RecoverySetup({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [key, setKey] = useState('');
  const [saved, setSaved] = useState(false);
  const { error, busy, run } = useAction();
  useEffect(() => {
    void window.dash.websiteLock.recoveryBegin().then((r) => r.ok && setKey(r.value.key));
  }, []);
  return (
    <Modal title="Your recovery key" onClose={onClose}>
      {key ? <RecoveryKeyView keyText={key} onSavedChange={setSaved} /> : <p className="wl-muted text-[13px]">Making a key…</p>}
      <div className="mt-4"><Err text={error} /></div>
      <button className="wl-btn wl-btn-primary w-full mt-2" disabled={!saved || busy} onClick={() => void run(window.dash.websiteLock.recoveryConfirm(true), onDone)}>
        Continue
      </button>
    </Modal>
  );
}

function AddSite({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [sub, setSub] = useState(false);
  const { error, busy, run } = useAction();
  useEffect(() => {
    // Offer the page you are on, worked out by DASH itself.
    void window.dash.websiteLock.current().then((r) => r.ok && r.value.host && !r.value.protected && setUrl(r.value.host));
  }, []);
  return (
    <Modal title="Protect a website" onClose={onClose}>
      <div className="space-y-3">
        <input className="wl-input" placeholder="Website, for example instagram.com" aria-label="Website address" value={url} onChange={(e) => setUrl(e.target.value)} autoFocus />
        <PasswordField value={pw} onChange={setPw} placeholder="Password for this website (8+ characters)" label="Password" />
        <PasswordField value={pw2} onChange={setPw2} placeholder="Repeat password" label="Repeat password" />
        <label className="flex items-start gap-2 text-[13px] cursor-pointer">
          <input type="checkbox" className="mt-0.5" checked={sub} onChange={(e) => setSub(e.target.checked)} />
          <span>Also protect its subdomains <span className="wl-muted">(for example mail.example.com)</span></span>
        </label>
        <Err text={error} />
        <button
          className="wl-btn wl-btn-primary w-full"
          disabled={busy || !url || !pw || !pw2}
          onClick={() => void run(window.dash.websiteLock.add({ url, password: pw, confirmPassword: pw2, includeSubdomains: sub }), onClose)}
        >
          {busy ? 'Saving…' : 'Protect website'}
        </button>
      </div>
    </Modal>
  );
}

function ChangePassword({ site, onClose, onSaved }: { site: WebsiteLockSite; onClose: () => void; onSaved: () => void }) {
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const { error, busy, run } = useAction();
  return (
    <Modal title={`Change password · ${site.hostname}`} onClose={onClose}>
      <div className="space-y-3">
        <PasswordField value={cur} onChange={setCur} placeholder="Current password" label="Current password" autoFocus />
        <PasswordField value={pw} onChange={setPw} placeholder="New password (8+ characters)" label="New password" />
        <PasswordField value={pw2} onChange={setPw2} placeholder="Repeat new password" label="Repeat new password" />
        <Err text={error} />
        <button className="wl-btn wl-btn-primary w-full" disabled={busy || !cur || !pw || !pw2} onClick={() => void run(window.dash.websiteLock.changePassword(site.id, cur, pw, pw2), () => { onSaved(); onClose(); })}>
          Save new password
        </button>
      </div>
    </Modal>
  );
}

function EditSite({ site, onClose }: { site: WebsiteLockSite; onClose: () => void }) {
  const [name, setName] = useState(site.displayName);
  const [sub, setSub] = useState(site.includeSubdomains);
  const [enabled, setEnabled] = useState(site.enabled);
  const [pw, setPw] = useState('');
  const { error, busy, run } = useAction();
  return (
    <Modal title={`Edit · ${site.hostname}`} onClose={onClose}>
      <div className="space-y-3">
        <input className="wl-input" aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={sub} onChange={(e) => setSub(e.target.checked)} /> Also protect subdomains</label>
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Protection is on</label>
        <p className="text-[12px] wl-muted">Changing protection needs this website's password.</p>
        <PasswordField value={pw} onChange={setPw} placeholder="Password for this website" label="Password" />
        <Err text={error} />
        <button className="wl-btn wl-btn-primary w-full" disabled={busy || !pw} onClick={() => void run(window.dash.websiteLock.edit(site.id, pw, { displayName: name, includeSubdomains: sub, enabled }), onClose)}>
          Save
        </button>
      </div>
    </Modal>
  );
}

function RemoveSite({ site, onClose }: { site: WebsiteLockSite; onClose: () => void }) {
  const [pw, setPw] = useState('');
  const { error, busy, run } = useAction();
  return (
    <Modal title={`Remove protection · ${site.hostname}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-[13px] wl-muted">{site.hostname} will open without a password. Enter its password to confirm.</p>
        <PasswordField value={pw} onChange={setPw} placeholder="Password for this website" label="Password" autoFocus onEnter={() => pw && void run(window.dash.websiteLock.remove(site.id, pw), onClose)} />
        <Err text={error} />
        <button className="wl-btn wl-btn-danger w-full" disabled={busy || !pw} onClick={() => void run(window.dash.websiteLock.remove(site.id, pw), onClose)}>Remove protection</button>
      </div>
    </Modal>
  );
}

function Forgot({ site, onClose, onLost }: { site: WebsiteLockSite; onClose: () => void; onLost: () => void }) {
  const [key, setKey] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const { error, busy, run } = useAction();
  return (
    <Modal title={`Forgot password · ${site.hostname}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-[13px] wl-muted">Enter your DASH recovery key, then choose a new password for this website. Other websites are not touched.</p>
        <input className="wl-input font-mono" placeholder="Recovery key" aria-label="Recovery key" value={key} onChange={(e) => setKey(e.target.value)} autoFocus spellCheck={false} />
        <PasswordField value={pw} onChange={setPw} placeholder="New password (8+ characters)" label="New password" />
        <PasswordField value={pw2} onChange={setPw2} placeholder="Repeat new password" label="Repeat new password" />
        <Err text={error} />
        <button className="wl-btn wl-btn-primary w-full" disabled={busy || !key || !pw || !pw2} onClick={() => void run(window.dash.websiteLock.recoverSite(site.id, key, pw, pw2), onClose)}>Set new password</button>
        <button className="w-full text-[12px] wl-muted underline" onClick={onLost}>I do not have the recovery key</button>
      </div>
    </Modal>
  );
}

function Regenerate({ onClose }: { onClose: () => void }) {
  const [cur, setCur] = useState('');
  const [fresh, setFresh] = useState('');
  const [saved, setSaved] = useState(false);
  const { error, busy, run } = useAction();
  return (
    <Modal title="Regenerate recovery key" onClose={fresh && !saved ? () => undefined : onClose}>
      {!fresh ? (
        <div className="space-y-3">
          <p className="text-[13px] wl-muted">Enter your current recovery key. A new one will replace it and the old key stops working immediately.</p>
          <input className="wl-input font-mono" placeholder="Current recovery key" aria-label="Current recovery key" value={cur} onChange={(e) => setCur(e.target.value)} autoFocus spellCheck={false} />
          <Err text={error} />
          <button className="wl-btn wl-btn-primary w-full" disabled={busy || !cur} onClick={() => void run(window.dash.websiteLock.recoveryRegenerate(cur), (v) => setFresh(v.key))}>Make a new key</button>
        </div>
      ) : (
        <div className="space-y-3">
          <RecoveryKeyView keyText={fresh} onSavedChange={setSaved} />
          <button className="wl-btn wl-btn-primary w-full" disabled={!saved} onClick={onClose}>Done</button>
        </div>
      )}
    </Modal>
  );
}

/** The local reset for a lost key or password. Says plainly what it does, and waits before it can be used. */
function LostKey({ site, sites, onClose }: { site: WebsiteLockSite | null; sites: WebsiteLockSite[]; onClose: () => void }) {
  const [scope, setScope] = useState<string>(site?.id ?? 'recovery');
  const [readyAt, setReadyAt] = useState<number | null>(null);
  const [typed, setTyped] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [fresh, setFresh] = useState('');
  const [saved, setSaved] = useState(false);
  const { error, busy, run } = useAction();
  const wait = useCountdown(readyAt);
  const target = sites.find((s) => s.id === scope);

  if (fresh) {
    return (
      <Modal title="New recovery key" onClose={saved ? onClose : () => undefined}>
        <RecoveryKeyView keyText={fresh} onSavedChange={setSaved} />
        <button className="wl-btn wl-btn-primary w-full mt-3" disabled={!saved} onClick={onClose}>Done</button>
      </Modal>
    );
  }
  return (
    <Modal title="Lost your key or password" onClose={onClose} wide>
      <div className="space-y-3 text-[13px]">
        <div className="wl-glass p-3 leading-relaxed">
          <b className="wl-warn">Read this first.</b> The old password and the old recovery key <b>cannot be recovered by anyone</b>, including DASH. This local reset removes the old protection and lets you
          set a new one. It does <b>not</b> prove who you are: anyone using DASH on this computer could do the same, so only do this on a device that is yours. The reset is written to the activity list.
        </div>
        <label className="block">
          <span className="wl-muted text-[12px]">What do you want to reset?</span>
          <select className="wl-input mt-1" value={scope} onChange={(e) => { setScope(e.target.value); setReadyAt(null); }} aria-label="What to reset">
            <option value="recovery">The recovery key</option>
            {sites.map((s) => (<option key={s.id} value={s.id}>Password for {s.hostname}</option>))}
          </select>
        </label>
        {readyAt === null ? (
          <button className="wl-btn wl-btn-danger w-full" onClick={() => void run(window.dash.websiteLock.resetRequest(scope), (v) => setReadyAt(v.readyAt))}>I understand, start the reset</button>
        ) : wait > 0 ? (
          <div className="wl-muted text-center py-2">Please wait {wait}s, then confirm below.</div>
        ) : (
          <div className="space-y-3">
            <input className="wl-input" placeholder={scope === 'recovery' ? 'Type RESET to confirm' : `Type ${target?.hostname ?? ''} to confirm`} aria-label="Confirmation" value={typed} onChange={(e) => setTyped(e.target.value)} />
            {scope !== 'recovery' && (
              <>
                <PasswordField value={pw} onChange={setPw} placeholder="New password (8+ characters)" label="New password" />
                <PasswordField value={pw2} onChange={setPw2} placeholder="Repeat new password" label="Repeat new password" />
              </>
            )}
            <Err text={error} />
            <button
              className="wl-btn wl-btn-danger w-full"
              disabled={busy || !typed || (scope !== 'recovery' && (!pw || !pw2))}
              onClick={() =>
                scope === 'recovery'
                  ? void run(window.dash.websiteLock.resetRecovery(typed), (v) => setFresh(v.key))
                  : void run(window.dash.websiteLock.resetSite(scope, typed, pw, pw2), onClose)
              }
            >
              Reset now
            </button>
          </div>
        )}
        <Err text={readyAt === null ? error : ''} />
      </div>
    </Modal>
  );
}

function ExportBackup({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const { error, busy, run, setError } = useAction();
  return (
    <Modal title="Export encrypted backup" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-[13px] wl-muted">
          The file holds your websites and their password checks, encrypted with a backup password you choose now. It never contains your passwords or recovery key in plain text. The backup password is
          separate from your recovery key and cannot be recovered.
        </p>
        <PasswordField value={pw} onChange={setPw} placeholder="Backup password (8+ characters)" label="Backup password" autoFocus />
        <PasswordField value={pw2} onChange={setPw2} placeholder="Repeat backup password" label="Repeat backup password" />
        <Err text={error} />
        <button
          className="wl-btn wl-btn-primary w-full"
          disabled={busy || !pw || !pw2}
          onClick={() => (pw !== pw2 ? setError('The two passwords do not match.') : void run(window.dash.websiteLock.backupExport(pw), (v) => { if (v.saved) { onSaved(); onClose(); } }))}
        >
          Choose where to save…
        </button>
      </div>
    </Modal>
  );
}

function ImportBackup({ onClose, onDone }: { onClose: () => void; onDone: (text: string) => void }) {
  const [pw, setPw] = useState('');
  const [preview, setPreview] = useState<{ token: string; sites: { hostname: string; displayName: string; exists: boolean }[]; hasRecoveryKey: boolean } | null>(null);
  const [replace, setReplace] = useState(false);
  const { error, busy, run } = useAction();
  return (
    <Modal title="Restore from backup" onClose={onClose}>
      {!preview ? (
        <div className="space-y-3">
          <p className="text-[13px] wl-muted">Choose a backup file and enter its backup password. Nothing changes until you confirm on the next step.</p>
          <PasswordField value={pw} onChange={setPw} placeholder="Backup password" label="Backup password" autoFocus />
          <Err text={error} />
          <button className="wl-btn wl-btn-primary w-full" disabled={busy || !pw} onClick={() => void run(window.dash.websiteLock.backupPreview(pw), (v) => v && setPreview(v))}>Choose file…</button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[13px]">This backup holds {preview.sites.length} website{preview.sites.length === 1 ? '' : 's'}. Restored websites start locked.</p>
          <ul className="wl-glass p-3 space-y-1 text-[13px] max-h-40 overflow-y-auto">
            {preview.sites.map((s) => (
              <li key={s.hostname} className="flex justify-between"><span className="font-mono">{s.hostname}</span><span className={s.exists ? 'wl-warn' : 'wl-ok'}>{s.exists ? 'already protected' : 'new'}</span></li>
            ))}
          </ul>
          {preview.sites.some((s) => s.exists) && (
            <label className="flex items-start gap-2 text-[13px]"><input type="checkbox" className="mt-0.5" checked={replace} onChange={(e) => setReplace(e.target.checked)} /><span>Replace the websites that are already protected here with the backup's version. Otherwise they are kept as they are.</span></label>
          )}
          <Err text={error} />
          <button
            className="wl-btn wl-btn-primary w-full"
            disabled={busy}
            onClick={() => void run(window.dash.websiteLock.backupApply(preview.token, replace), (v) => { onDone(`Restored: ${v.added} added, ${v.replaced} replaced, ${v.skipped} kept.`); onClose(); })}
          >
            Restore
          </button>
        </div>
      )}
    </Modal>
  );
}
