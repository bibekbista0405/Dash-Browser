import { useEffect, useState } from 'react';
import { OverlayPanel } from './OverlayPanel';
import type { ExtensionInfo } from '../../shared/ipc-channels';

export function ExtensionsPanel({ onClose }: { onClose: () => void }) {
  const [extensions, setExtensions] = useState<ExtensionInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
        Loads real Chrome extensions from a folder (Manifest V2, and the parts of V3 Electron
        supports) — the same "Load unpacked" flow as Chrome's developer mode. No Chrome Web Store
        integration. Extensions never run in private tabs.
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
