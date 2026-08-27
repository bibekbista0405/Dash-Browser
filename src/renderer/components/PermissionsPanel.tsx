import { useEffect, useState } from 'react';
import { OverlayPanel } from './OverlayPanel';
import type { PermissionRecord } from '../../shared/ipc-channels';

export function PermissionsPanel({ onClose }: { onClose: () => void }) {
  const [permissions, setPermissions] = useState<PermissionRecord[]>([]);

  const load = () => window.dash.permissions.list().then(setPermissions);

  useEffect(() => {
    load();
  }, []);

  const remove = async (id: number) => {
    await window.dash.permissions.remove(id);
    load();
  };

  return (
    <OverlayPanel title="Site Permissions" onClose={onClose}>
      {permissions.length === 0 && (
        <div className="px-4 py-6 text-[13px] text-text-tertiary">
          No permission decisions yet. Sites that ask for your camera, microphone, location, or
          notifications will show up here once you respond to a prompt.
        </div>
      )}

      {permissions.map((p) => (
        <div key={p.id} className="flex items-center gap-2 px-4 py-2.5 border-b border-border/40">
          <div className="flex-1 min-w-0">
            <div className="text-[13px] text-text-primary truncate">{p.origin}</div>
            <div className="text-[12px] text-text-tertiary capitalize">{p.permission}</div>
          </div>
          <span
            className={`text-[11px] font-medium px-2 py-0.5 rounded shrink-0 ${
              p.decision === 'granted' ? 'text-accent bg-accent/15' : 'text-text-tertiary bg-surface'
            }`}
          >
            {p.decision === 'granted' ? 'Allowed' : 'Blocked'}
          </span>
          <button
            onClick={() => remove(p.id)}
            className="text-[11px] text-text-tertiary hover:text-text-primary shrink-0"
          >
            Forget
          </button>
        </div>
      ))}
    </OverlayPanel>
  );
}
