import { useEffect, useState } from 'react';
import type { SplitLayout } from '../../shared/ipc-channels';
import { useTabsStore } from '../store/tabs-store';

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') || url; } catch { return url; }
}

/**
 * Draws the frame around each split-view pane and a small tab chip under it. The pages themselves are native views
 * drawn on top of this layer, so only the frame, the gap and the chip strip are visible here.
 */
export function SplitFrames() {
  const [layout, setLayout] = useState<SplitLayout | null>(null);
  const tabs = useTabsStore((s) => s.tabs);
  const switchTab = useTabsStore((s) => s.switchTab);

  useEffect(() => window.dash.layout.onSplit(setLayout), []);
  if (!layout) return null;

  return (
    <>
      <div
        aria-hidden
        className="fixed z-0 bg-surface-elevated pointer-events-none"
        style={{ left: layout.area.x, top: layout.area.y, width: layout.area.width, height: layout.area.height }}
      />
      {layout.panes.map((p, i) => {
        const tab = tabs.find((t) => t.id === p.tabId);
        const active = p.tabId === layout.activeTabId;
        const empty = !tab || tab.url === '' || tab.title === 'New Tab';
        const label = empty ? 'New tab' : tab.title || hostOf(tab.url);
        return (
          <div key={p.tabId}>
            <div
              aria-hidden
              className={`fixed z-0 pointer-events-none rounded-[13px] border-2 transition-colors ${active ? 'border-accent' : 'border-border'}`}
              style={{ left: p.x - 3, top: p.y - 3, width: p.width + 6, height: p.height + 6 }}
            />
            <div
              className="fixed z-30 flex items-center justify-center"
              style={{ left: p.x, top: p.y + p.height + 6, width: p.width, height: 26 }}
            >
              <div
                className={`flex items-center gap-2 h-[26px] max-w-full pl-2 pr-1 rounded-full border text-[12px] ${active ? 'border-accent text-text-primary bg-surface' : 'border-border text-text-secondary bg-surface hover:text-text-primary'}`}
              >
                <button
                  type="button"
                  className="flex items-center gap-1.5 min-w-0"
                  aria-label={`Switch to ${label}`}
                  onClick={() => void switchTab(p.tabId)}
                >
                  {tab?.favicon ? <img src={tab.favicon} alt="" className="w-3.5 h-3.5 rounded-sm shrink-0" /> : <span className="w-3.5 h-3.5 rounded-sm bg-border shrink-0" />}
                  <span className="truncate max-w-[220px]">{label}</span>
                </button>
                <button
                  type="button"
                  className="w-5 h-5 rounded-full flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-surface-hover shrink-0"
                  aria-label={`Close ${i === 0 ? 'left' : 'right'} pane`}
                  title="Close split view"
                  onClick={() => void window.dash.split.close()}
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
