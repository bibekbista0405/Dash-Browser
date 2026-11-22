import { useState } from 'react';
import { CONTAINER_COLORS } from '../../shared/ipc-channels';
import { useContainers, CONTAINER_HEX } from '../hooks/useContainers';

/** Create, recolour, rename and delete containers. Deleting wipes everything that container stored. */
export function ContainersSettings() {
  const containers = useContainers();
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(CONTAINER_COLORS[0]);
  const [error, setError] = useState<string | null>(null);
  const clean = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?(DASH: )?/, '');
  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(clean(e));
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-text-tertiary leading-relaxed">
        A container is a separate browsing space: its own cookies, logins, site storage and cache, kept apart from normal tabs and from every other
        container. Open one from the ▾ next to + in the tab bar. Blocking, VPN, spell check and permissions apply as usual. DASH extensions load
        in normal tabs only.
      </p>
      {containers.length === 0 && <div className="text-[12px] text-text-tertiary">No containers yet.</div>}
      {containers.map((c) => (
        <div key={c.id} className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full shrink-0" style={{ background: CONTAINER_HEX[c.color] }} />
          <span className="flex-1 truncate text-[13px] text-text-primary">{c.name}</span>
          <select
            aria-label={`Colour for ${c.name}`}
            value={c.color}
            onChange={(e) => run(() => window.dash.containers.update(c.id, c.name, e.target.value))}
            className="h-7 rounded-md bg-surface border border-border/60 text-[12px] text-text-primary px-1"
          >
            {CONTAINER_COLORS.map((col) => (
              <option key={col} value={col}>
                {col}
              </option>
            ))}
          </select>
          <button
            className="h-7 px-2 rounded-md text-[12px] text-red-500 hover:bg-surface-hover"
            onClick={() => {
              if (window.confirm(`Delete "${c.name}"? Its open tabs close and all its cookies, logins and site data are erased.`)) void run(() => window.dash.containers.remove(c.id));
            }}
          >
            Delete
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={30}
          placeholder="New container name (e.g. Work)"
          aria-label="New container name"
          className="flex-1 min-w-0 h-8 px-3 rounded-lg bg-surface-elevated border border-border/60 outline-none text-[13px] text-text-primary placeholder:text-text-tertiary focus:border-accent/60"
        />
        <select
          aria-label="New container colour"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="h-8 rounded-md bg-surface border border-border/60 text-[12px] text-text-primary px-1 shrink-0"
        >
          {CONTAINER_COLORS.map((col) => (
            <option key={col} value={col}>
              {col}
            </option>
          ))}
        </select>
        <button
          disabled={!name.trim()}
          className="h-8 px-3 rounded-lg text-[13px] bg-accent text-white disabled:opacity-50 shrink-0"
          onClick={() =>
            run(async () => {
              await window.dash.containers.create(name, color);
              setName('');
            })
          }
        >
          Add
        </button>
      </div>
      {error && (
        <div role="status" className="text-[12px] text-red-500">
          {error}
        </div>
      )}
    </div>
  );
}
