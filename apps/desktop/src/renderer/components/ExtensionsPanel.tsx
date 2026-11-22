import { useEffect, useState } from 'react';
import { OverlayPanel } from './OverlayPanel';
import type { ExtensionInfo } from '../../shared/ipc-channels';

export function ExtensionsPanel({ onClose }: { onClose: () => void }) {
  const [extensions, setExtensions] = useState<ExtensionInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [storeInput, setStoreInput] = useState('');
  const [installing, setInstalling] = useState(false);
  const installFromStore = async () => {
    setError(null);
    setInstalling(true);
    try {
      const r = await window.dash.extensions.installFromStore(storeInput);
      if (r) {
        setStoreInput('');
        load();
      }
    } catch (err) {
      setError((err instanceof Error ? err.message : String(err)).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
    } finally {
      setInstalling(false);
    }
  };

  const load = () => window.dash.extensions.list().then(setExtensions);

  useEffect(() => {
    load();
  }, []);

  const loadExtension = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await window.dash.extensions.loadFromPicker();
      if (result) load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not load this extension. Make sure the folder contains a valid manifest.json.'
      );
    } finally {
      setLoading(false);
    }
  };

  const remove = async (id: string) => {
    await window.dash.extensions.remove(id);
    load();
  };

  return (
    <OverlayPanel
      title="Extensions"
      onClose={onClose}
      headerActions={
        <button
          onClick={loadExtension}
          disabled={loading}
          className="text-[11px] text-text-tertiary hover:text-text-primary px-2 py-1 rounded transition-colors disabled:opacity-50"
        >
          {loading ? 'Loading…' : '+ Load unpacked'}
        </button>
      }
    >
      <div className="px-4 pt-3 pb-2 text-[11px] text-text-tertiary leading-relaxed">
        Install from the Chrome Web Store (paste a link or extension id; you approve its permissions first) or load an
        unpacked folder. Electron supports only part of Chrome&apos;s extension API, so some extensions will not fully work.
        DASH does not check Web Store signatures or update extensions automatically. Extensions run in normal tabs only
        (never private tabs or containers).
      </div>
      <div className="px-4 pb-2 flex gap-2">
        <input
          value={storeInput}
          onChange={(e) => setStoreInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && storeInput.trim() && !installing && void installFromStore()}
          placeholder="Chrome Web Store link or extension id"
          aria-label="Chrome Web Store link or extension id"
          className="flex-1 min-w-0 h-8 px-3 rounded-lg bg-surface-elevated border border-border/60 outline-none text-[12px] text-text-primary placeholder:text-text-tertiary focus:border-accent/60"
        />
        <button
          disabled={!storeInput.trim() || installing}
          onClick={() => void installFromStore()}
          className="h-8 px-3 rounded-lg text-[12px] bg-accent text-white disabled:opacity-50 shrink-0"
        >
          {installing ? 'Installing…' : 'Install'}
        </button>
      </div>

      {error && <div className="px-4 py-2 text-[12px] text-red-400">{error}</div>}

      {extensions.length === 0 && (
        <div className="px-4 py-6 text-[13px] text-text-tertiary">No extensions loaded yet.</div>
      )}

      {extensions.map((ext) => (
        <div key={ext.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-border/40">
          <div className="flex-1 min-w-0">
            <div className="text-[13px] text-text-primary truncate">{ext.name}</div>
            <div className="text-[11px] text-text-tertiary truncate">
              v{ext.version || '—'} · {ext.folderPath}
            </div>
          </div>
          <button
            onClick={() => remove(ext.id)}
            className="text-[11px] text-text-tertiary hover:text-text-primary shrink-0"
          >
            Remove
          </button>
        </div>
      ))}
    </OverlayPanel>
  );
}
