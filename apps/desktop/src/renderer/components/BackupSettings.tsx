import { useState } from 'react';

const BTN =
  'flex-1 h-9 rounded-lg text-[13px] bg-surface-elevated border border-border/60 text-text-secondary hover:bg-surface-hover transition-colors disabled:opacity-50';

/** Encrypted backup/restore. The passphrase never leaves this window except to be used to encrypt/decrypt locally. */
export function BackupSettings() {
  const [pass, setPass] = useState('');
  const [withPasswords, setWithPasswords] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const tooShort = pass.length < 8;

  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true);
    setMsg(null);
    try {
      const text = await fn();
      if (text) setMsg({ ok: true, text });
    } catch (e) {
      setMsg({ ok: false, text: (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-text-tertiary leading-relaxed">
        Save your settings, bookmarks, per-site zoom, shortcuts and permissions (and, if you choose, saved passwords) to one file sealed with a
        passphrase. Nothing is uploaded. To keep two computers in step, put the file in a folder you already sync yourself and import it on the
        other computer. History and downloads are not included. If you lose the passphrase the file cannot be opened.
      </p>
      <input
        type="password"
        value={pass}
        onChange={(e) => setPass(e.target.value)}
        placeholder="Backup passphrase (8+ characters)"
        aria-label="Backup passphrase"
        autoComplete="off"
        className="w-full h-9 px-3 rounded-lg bg-surface-elevated border border-border/60 outline-none text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-accent/60"
      />
      <label className="flex items-center gap-2 text-[13px] text-text-secondary">
        <input type="checkbox" checked={withPasswords} onChange={(e) => setWithPasswords(e.target.checked)} />
        Include saved passwords (readable by anyone who has the file and passphrase)
      </label>
      <div className="flex gap-2">
        <button
          className={BTN}
          disabled={busy || tooShort}
          onClick={() =>
            run(async () => {
              const r = await window.dash.backup.export(pass, withPasswords);
              return r ? `Backup saved: ${r.items} items${withPasswords ? `, ${r.passwords} passwords` : ''}.` : null;
            })
          }
        >
          Export backup…
        </button>
        <button
          className={BTN}
          disabled={busy || tooShort}
          onClick={() =>
            run(async () => {
              const r = await window.dash.backup.import(pass);
              if (!r) return null;
              const c = r.counts;
              return `Restored: ${c.settings} settings, ${c.bookmarks} new bookmarks, ${c.siteZoom} zoom levels, ${c.shortcuts} shortcuts, ${c.permissions} permissions${r.passwords ? `, ${r.passwords} new passwords` : ''}.${r.passwordsSkipped ? ' ' + r.passwordsSkipped : ''}`;
            })
          }
        >
          Import backup…
        </button>
      </div>
      {msg && (
        <div role="status" className={`text-[12px] ${msg.ok ? 'text-text-secondary' : 'text-red-500'}`}>
          {msg.text}
        </div>
      )}
    </div>
  );
}
