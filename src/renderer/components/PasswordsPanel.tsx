import { useEffect, useState } from 'react';
import { OverlayPanel } from './OverlayPanel';
import type { PasswordEntry } from '../../shared/ipc-channels';

export function PasswordsPanel({ onClose }: { onClose: () => void }) {
  const [passwords, setPasswords] = useState<PasswordEntry[]>([]);
  const [revealed, setRevealed] = useState<Record<number, string>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [origin, setOrigin] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = () => window.dash.passwords.list().then(setPasswords);

  useEffect(() => {
    load();
  }, []);

  const reveal = async (id: number) => {
    try {
      const plain = await window.dash.passwords.reveal(id);
      setRevealed((r) => ({ ...r, [id]: plain }));
    } catch {
      setError('Could not decrypt this password on this device.');
    }
  };

  const remove = async (id: number) => {
    await window.dash.passwords.remove(id);
    setRevealed((r) => {
      const next = { ...r };
      delete next[id];
      return next;
    });
    load();
  };

  const submitAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await window.dash.passwords.add(origin.trim(), username.trim(), password);
      setOrigin('');
      setUsername('');
      setPassword('');
      setShowAddForm(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save password.');
    }
  };

  return (
    <OverlayPanel
      title="Passwords"
      onClose={onClose}
      headerActions={
        <button
          onClick={() => setShowAddForm((v) => !v)}
          className="text-[11px] text-text-tertiary hover:text-text-primary px-2 py-1 rounded transition-colors"
        >
          {showAddForm ? 'Cancel' : '+ Add'}
        </button>
      }
    >
      {showAddForm && (
        <form onSubmit={submitAdd} className="p-3 border-b border-border space-y-2">
          <input
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            placeholder="https://example.com"
            required
            className="w-full h-8 px-3 rounded-lg bg-surface border border-border/60 outline-none text-[13px] text-text-primary placeholder:text-text-tertiary"
          />
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username or email"
            required
            className="w-full h-8 px-3 rounded-lg bg-surface border border-border/60 outline-none text-[13px] text-text-primary placeholder:text-text-tertiary"
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            type="password"
            required
            className="w-full h-8 px-3 rounded-lg bg-surface border border-border/60 outline-none text-[13px] text-text-primary placeholder:text-text-tertiary"
          />
          <button
            type="submit"
            className="w-full h-8 rounded-lg text-[12px] font-medium text-white bg-accent hover:opacity-90 transition-opacity"
          >
            Save
          </button>
        </form>
      )}

      {error && <div className="px-3 py-2 text-[12px] text-red-400">{error}</div>}

      {passwords.length === 0 && !showAddForm && (
        <div className="px-4 py-6 text-[13px] text-text-tertiary">
          No saved passwords yet. DASH will offer to save one automatically the next time you log into a site.
        </div>
      )}

      {passwords.map((p) => (
        <div key={p.id} className="px-4 py-2.5 border-b border-border/40">
          <div className="text-[13px] text-text-primary truncate">{p.origin}</div>
          <div className="flex items-center justify-between mt-0.5">
            <span className="text-[12px] text-text-secondary truncate">{p.username}</span>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[12px] text-text-tertiary font-mono">
                {revealed[p.id] ?? '••••••••'}
              </span>
              {!revealed[p.id] && (
                <button
                  onClick={() => reveal(p.id)}
                  className="text-[11px] text-accent hover:underline"
                >
                  Show
                </button>
              )}
              <button
                onClick={() => remove(p.id)}
                className="text-[11px] text-text-tertiary hover:text-text-primary"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ))}
    </OverlayPanel>
  );
}
