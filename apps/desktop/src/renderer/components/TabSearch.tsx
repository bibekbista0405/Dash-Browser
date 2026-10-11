import { useEffect, useMemo, useRef, useState } from 'react';
import { useTabsStore } from '../store/tabs-store';

export function TabSearch({ onClose }: { onClose: () => void }) {
  const tabs = useTabsStore((s) => s.tabs);
  const switchTab = useTabsStore((s) => s.switchTab);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return tabs;
    return tabs.filter((t) => t.title.toLowerCase().includes(term) || t.url.toLowerCase().includes(term));
  }, [tabs, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const activate = (id: string) => {
    switchTab(id);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = matches[selectedIndex];
      if (target) activate(target.id);
    }
  };

  return (
    <div className="app-no-drag absolute inset-0 z-50 flex items-start justify-center pt-24" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-[420px] max-h-[60vh] flex flex-col rounded-xl bg-surface-elevated border border-border shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search open tabs"
          className="h-11 px-4 bg-transparent outline-none text-[14px] text-text-primary placeholder:text-text-tertiary border-b border-border shrink-0"
          spellCheck={false}
        />
        <div className="overflow-y-auto">
          {matches.length === 0 && (
            <div className="px-4 py-6 text-[13px] text-text-tertiary">No open tabs match "{query}".</div>
          )}
          {matches.map((tab, i) => (
            <button
              key={tab.id}
              onClick={() => activate(tab.id)}
              onMouseEnter={() => setSelectedIndex(i)}
              className={`w-full flex items-center gap-2 px-4 py-2.5 text-left transition-colors ${
                i === selectedIndex ? 'bg-surface-hover' : ''
              }`}
            >
              {tab.isLoading ? (
                <span className="h-2 w-2 rounded-full border-[1.5px] border-accent border-t-transparent animate-spin shrink-0" />
              ) : tab.isPrivate ? (
                <span className="h-2 w-2 rounded-full bg-purple-400 shrink-0" />
              ) : (
                <span className="h-2 w-2 rounded-full bg-text-tertiary/40 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-text-primary truncate">{tab.title || 'New Tab'}</div>
                <div className="text-[11px] text-text-tertiary truncate">{tab.url}</div>
              </div>
            </button>
          ))}
        </div>
        <div className="px-4 py-1.5 text-[10px] text-text-tertiary border-t border-border shrink-0">
          ↑↓ to navigate · Enter to switch · Esc to close
        </div>
      </div>
    </div>
  );
}
