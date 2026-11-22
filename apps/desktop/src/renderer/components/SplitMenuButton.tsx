import { useState } from 'react';
import { useTabsStore, activeTabOf } from '../store/tabs-store';
import { PopMenu, MenuItem, MenuDivider, MenuHeading } from './PopMenu';

/** Shown only while the current tab is in a split view: swap, resize, change the other side, close either side. */
export function SplitMenuButton() {
  const store = useTabsStore();
  const active = activeTabOf(store);
  const [open, setOpen] = useState(false);
  if (!active?.inSplit) return null;

  const partner = store.tabs.find((t) => t.inSplit && t.id !== active.id);
  const others = store.tabs.filter((t) => t.id !== active.id && t.id !== partner?.id && !t.isPrivate === !active.isPrivate).slice(0, 8);
  const run = (fn: () => unknown) => () => {
    setOpen(false);
    void fn();
  };
  const name = (t: { title: string; url: string }) => (t.title || t.url || 'New tab').slice(0, 38);

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Manage split view"
        aria-label="Manage split view"
        aria-haspopup="menu"
        aria-expanded={open}
        className={`h-7 w-7 flex items-center justify-center rounded-md text-accent hover:bg-surface-hover transition-colors ${open ? 'bg-surface-hover' : ''}`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M12 4v16" />
        </svg>
      </button>
      {open && (
        <PopMenu label="Split view" onClose={() => setOpen(false)} width="w-72">
          <MenuHeading>Split view</MenuHeading>
          <MenuItem onClick={run(() => window.dash.split.swap())}>Swap sides</MenuItem>
          <MenuItem onClick={run(() => window.dash.split.reset())}>Make both sides equal</MenuItem>
          {others.length > 0 && (
            <>
              <MenuDivider />
              <MenuHeading>Show beside this tab instead</MenuHeading>
              {others.map((t) => (
                <MenuItem key={t.id} onClick={run(() => window.dash.split.open(t.id))}>
                  <span className="truncate">{name(t)}</span>
                </MenuItem>
              ))}
            </>
          )}
          <MenuDivider />
          <MenuItem onClick={run(() => window.dash.split.close())}>End split view (keep both tabs)</MenuItem>
          {partner && <MenuItem onClick={run(() => store.closeTab(partner.id))}>Close the other side: {name(partner)}</MenuItem>}
          <MenuItem danger onClick={run(() => store.closeTab(active.id))}>Close this side</MenuItem>
        </PopMenu>
      )}
    </div>
  );
}
