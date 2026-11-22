import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExtensionInfo, WebsiteLockStatus } from '../../shared/ipc-channels';
import { PopMenu, MenuItem, MenuDivider, MenuHeading } from './PopMenu';
import { useTabsStore } from '../store/tabs-store';
import { PasswordField, failText } from './website-lock/glass';
import { lockDashNow } from './AppLockSettings';
import { RecoveryKeyView } from './website-lock/RecoveryKeyView';

const PuzzleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M10 4a2 2 0 1 1 4 0v1h3a1 1 0 0 1 1 1v3h1a2 2 0 1 1 0 4h-1v3a1 1 0 0 1-1 1h-3v-1a2 2 0 1 0-4 0v1H7a1 1 0 0 1-1-1v-3H5a2 2 0 1 1 0-4h1V6a1 1 0 0 1 1-1h3V4z" />
  </svg>
);

function ExtIcon({ ext, size = 18 }: { ext: ExtensionInfo; size?: number }) {
  if (ext.iconDataUrl) return <img src={ext.iconDataUrl} width={size} height={size} alt="" className="rounded-[4px] object-contain" />;
  return (
    <span
      className="rounded-[5px] bg-accent/20 text-accent font-semibold flex items-center justify-center"
      style={{ width: size, height: size, fontSize: size * 0.6 }}
      aria-hidden
    >
      {ext.name.charAt(0).toUpperCase()}
    </span>
  );
}

/** Pinned extensions as toolbar icons, plus the puzzle-piece menu to pin, unpin and manage them. */
export function ExtensionsToolbar({ onManage }: { onManage: () => void }) {
  const [list, setList] = useState<ExtensionInfo[]>([]);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const activeIsPrivate = useTabsStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.isPrivate ?? false);
  const noteTimer = useRef<ReturnType<typeof setTimeout>>();

  const load = useCallback(() => window.dash.extensions.list().then(setList).catch(() => setList([])), []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const say = (text: string) => {
    setNote(text);
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), 3500);
  };

  const launch = async (ext: ExtensionInfo, el: HTMLElement) => {
    if (activeIsPrivate) return say('Extensions do not run in private tabs.');
    const r = el.getBoundingClientRect();
    const result = await window.dash.extensions.open(ext.id, { x: r.left, y: r.top, width: r.width, height: r.height });
    if (result === 'none') say(`${ext.name} has no toolbar popup. It works on pages in the background.`);
  };

  const togglePin = async (ext: ExtensionInfo) => {
    await window.dash.extensions.setPinned(ext.id, !ext.pinned);
    await load();
  };

  const pinned = list.filter((e) => e.pinned);

  return (
    <>
      <WebsiteLockButton />
      {pinned.map((ext) => (
        <button
          key={ext.id}
          onClick={(e) => void launch(ext, e.currentTarget)}
          title={ext.hasPopup ? ext.name : `${ext.name} (no popup)`}
          aria-label={ext.name}
          className="h-7 w-7 shrink-0 flex items-center justify-center rounded-md hover:bg-surface-hover transition-colors"
        >
          <ExtIcon ext={ext} />
        </button>
      ))}
      <div className="relative shrink-0">
        <button
          onClick={() => setOpen((v) => !v)}
          title="Extensions"
          aria-label="Extensions"
          aria-haspopup="menu"
          aria-expanded={open}
          className={`h-7 w-7 flex items-center justify-center rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors ${open ? 'bg-surface-hover' : ''}`}
        >
          <PuzzleIcon />
        </button>
        {open && (
          <PopMenu label="Extensions" onClose={() => setOpen(false)} width="w-80">
            <MenuHeading>Extensions</MenuHeading>
            {list.length === 0 && <div className="px-3 py-2 text-[12px] text-text-tertiary">No extensions installed yet.</div>}
            {list.map((ext) => (
              <div key={ext.id} className="flex items-center gap-1 pr-1.5 hover:bg-surface-hover">
                <button
                  role="menuitem"
                  onClick={(e) => {
                    const el = e.currentTarget;
                    setOpen(false);
                    void launch(ext, el);
                  }}
                  className="flex-1 min-w-0 flex items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-text-primary"
                >
                  <ExtIcon ext={ext} />
                  <span className="truncate">{ext.name}</span>
                </button>
                <button
                  role="menuitem"
                  onClick={() => void togglePin(ext)}
                  title={ext.pinned ? 'Unpin from toolbar' : 'Pin to toolbar'}
                  aria-label={ext.pinned ? `Unpin ${ext.name}` : `Pin ${ext.name}`}
                  aria-pressed={ext.pinned}
                  className={`h-7 w-7 shrink-0 flex items-center justify-center rounded-md hover:bg-surface ${ext.pinned ? 'text-accent' : 'text-text-tertiary'}`}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill={ext.pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden>
                    <path d="M15 4l5 5-3 1-3 3 .5 4.5-1.5 1.5-3-4.5L5 20l-1-1 4-4.5L3.5 11.5 5 10l4.5.5 3-3L13.5 6z" />
                  </svg>
                </button>
              </div>
            ))}
            <MenuDivider />
            <MenuItem
              onClick={() => {
                setOpen(false);
                onManage();
              }}
            >
              Manage extensions
            </MenuItem>
          </PopMenu>
        )}
        {note && (
          <div role="status" className="absolute right-0 top-9 z-50 w-64 rounded-lg bg-surface-elevated border border-border shadow-2xl px-3 py-2 text-[12px] text-text-secondary">
            {note}
          </div>
        )}
      </div>
    </>
  );
}

/** Toolbar entry for Website Lock: shows the current page's status with quick actions. */
function WebsiteLockButton() {
  const [open, setOpen] = useState(false);
  const [st, setSt] = useState<WebsiteLockStatus | null>(null);
  const activeId = useTabsStore((x) => x.activeTabId);
  const activeUrl = useTabsStore((x) => x.tabs.find((t) => t.id === x.activeTabId)?.url);
  const load = useCallback(async () => {
    const r = await window.dash.websiteLock.current();
    if (r.ok) setSt(r.value);
  }, []);
  useEffect(() => {
    void load();
    return window.dash.websiteLock.onChanged(() => void load());
  }, [load, activeId, activeUrl]);
  const [mode, setMode] = useState<'menu' | 'recovery' | 'form'>('menu');
  const [recKey, setRecKey] = useState('');
  const [recSaved, setRecSaved] = useState(false);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [sub, setSub] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const reset = () => { setMode('menu'); setPw(''); setPw2(''); setRecKey(''); setRecSaved(false); setErr(''); setSub(false); };
  const close = () => { setOpen(false); reset(); };
  const manage = () => { close(); void window.dash.tabs.create('dash://website-lock'); };
  const startLock = async () => {
    setErr('');
    const r = await window.dash.websiteLock.recoveryStatus();
    if (r.ok && r.value.configured) { setMode('form'); return; }
    const b = await window.dash.websiteLock.recoveryBegin();
    if (b.ok) { setRecKey(b.value.key); setMode('recovery'); } else setErr(b.message);
  };
  const confirmRecovery = async () => {
    setBusy(true);
    const r = await window.dash.websiteLock.recoveryConfirm(true);
    setBusy(false);
    if (r.ok) setMode('form'); else setErr(failText(r));
  };
  const lockThis = async () => {
    if (!st?.host) return;
    setBusy(true);
    const r = await window.dash.websiteLock.add({ url: st.host, password: pw, confirmPassword: pw2, includeSubdomains: sub });
    setBusy(false);
    if (r.ok) close(); else setErr(failText(r));
  };
  const locked = !!st?.protected && !st.unlocked;
  return (
    <div className="relative shrink-0">
      <button
        onClick={() => { void load(); if (open) close(); else setOpen(true); }}
        title="Website Lock"
        aria-label="Website Lock"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`h-7 w-7 flex items-center justify-center rounded-md hover:bg-surface-hover transition-colors ${open ? 'bg-surface-hover' : ''} ${st?.protected ? (locked ? 'text-red-400' : 'text-green-400') : 'text-text-secondary hover:text-text-primary'}`}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="5" y="11" width="14" height="9" rx="2.5" />
          <path d={st?.protected && st.unlocked ? 'M8 11V8a4 4 0 0 1 7.5-2' : 'M8 11V8a4 4 0 0 1 8 0v3'} />
        </svg>
      </button>
      {open && (
        <PopMenu label="Website Lock" onClose={close} width="w-80">
          <MenuHeading>Website Lock</MenuHeading>
          {mode === 'recovery' && (
            <div className="px-3 pb-3 space-y-3 max-h-[70vh] overflow-y-auto">
              <p className="text-[12px] text-text-secondary">Before your first lock, save your recovery key. It is how you reset a forgotten password.</p>
              <RecoveryKeyView keyText={recKey} onSavedChange={setRecSaved} />
              {err && <div role="alert" className="text-[12px] text-red-400">{err}</div>}
              <button className="w-full h-8 rounded-md bg-accent text-white text-[13px] font-medium disabled:opacity-40" disabled={!recSaved || busy} onClick={() => void confirmRecovery()}>Continue</button>
            </div>
          )}
          {mode === 'form' && (
            <div className="px-3 pb-3 space-y-2">
              <p className="text-[12px] text-text-secondary">Choose a password for <b className="text-text-primary">{st?.host}</b>. It will be locked straight away.</p>
              <PasswordField value={pw} onChange={setPw} placeholder="Password (8+ characters)" label="Password" autoFocus />
              <PasswordField value={pw2} onChange={setPw2} placeholder="Repeat password" label="Repeat password" onEnter={() => pw && pw2 && void lockThis()} />
              <label className="flex items-center gap-2 text-[12px] text-text-secondary"><input type="checkbox" checked={sub} onChange={(e) => setSub(e.target.checked)} /> Also lock its subdomains</label>
              <div role="alert" className="min-h-[16px] text-[12px] text-red-400">{err}</div>
              <button className="w-full h-8 rounded-md bg-accent text-white text-[13px] font-medium disabled:opacity-40" disabled={!pw || !pw2 || busy} onClick={() => void lockThis()}>Lock {st?.host}</button>
              <button className="w-full text-[12px] text-text-tertiary hover:text-text-primary" onClick={reset}>Cancel</button>
            </div>
          )}
          {mode === 'menu' && (<>
          <div className="px-3 pb-2 text-[12px] text-text-secondary">
            {st?.host
              ? st.protected
                ? <><b className="text-text-primary">{st.host}</b> is protected and {st.unlocked ? 'unlocked for this session.' : 'locked.'}</>
                : <><b className="text-text-primary">{st.host}</b> is not protected.</>
              : 'Open a website to see its status.'}
          </div>
          {st?.host && !st.protected && <MenuItem onClick={() => void startLock()}>Lock this website…</MenuItem>}
          {err && mode === 'menu' && <div role="alert" className="px-3 py-1 text-[12px] text-red-400">{err}</div>}
          {st?.protected && st.unlocked && st.site && (
            <MenuItem onClick={() => { setOpen(false); void window.dash.websiteLock.lock(st.site!.id); }}>Lock this website now</MenuItem>
          )}
          <MenuItem onClick={() => { setOpen(false); void window.dash.websiteLock.lockAll(); }}>Lock all websites</MenuItem>
          <MenuDivider />
          <MenuHeading>Whole browser</MenuHeading>
          <MenuItem onClick={() => { close(); void lockDashNow(); }}>Lock DASH with a password…</MenuItem>
          <MenuItem onClick={manage}>Manage Website Lock…</MenuItem>
          </>)}
        </PopMenu>
      )}
    </div>
  );
}
