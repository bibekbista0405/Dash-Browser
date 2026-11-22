import { useEffect, useRef, useState } from 'react';
import { activeTabOf, useTabsStore } from '../store/tabs-store';

export function FindBar({ onClose }: { onClose: () => void }) {
  const tabsStore = useTabsStore();
  const activeTab = activeTabOf(tabsStore);
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<{ matches: number; activeMatchOrdinal: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const unsubscribe = window.dash.find.onResult((r) => setResult(r));
    return () => {
      unsubscribe();
      if (activeTab) window.dash.find.stop(activeTab.id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeTab) return;
    if (!query) {
      setResult(null);
      window.dash.find.stop(activeTab.id);
      return;
    }
    const timeout = setTimeout(() => window.dash.find.start(activeTab.id, query, true), 150);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  if (!activeTab) return null;

  const next = (forward: boolean) => {
    if (!query) return;
    window.dash.find.next(activeTab.id, forward);
  };

  return (
    <div className="app-no-drag absolute top-14 right-3 z-40 flex items-center gap-2 h-10 px-3 rounded-lg bg-surface-elevated border border-border shadow-2xl">
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') next(!e.shiftKey);
          if (e.key === 'Escape') onClose();
        }}
        placeholder="Find in page"
        className="w-48 bg-transparent outline-none text-[13px] text-text-primary placeholder:text-text-tertiary"
        spellCheck={false}
      />
      <span className="text-[11px] text-text-tertiary whitespace-nowrap">
        {result ? (result.matches > 0 ? `${result.activeMatchOrdinal}/${result.matches}` : '0/0') : ''}
      </span>
      <button
        onClick={() => next(false)}
        className="h-6 w-6 flex items-center justify-center rounded text-text-secondary hover:bg-surface-hover hover:text-text-primary"
        aria-label="Previous match"
      >
        ‹
      </button>
      <button
        onClick={() => next(true)}
        className="h-6 w-6 flex items-center justify-center rounded text-text-secondary hover:bg-surface-hover hover:text-text-primary"
        aria-label="Next match"
      >
        ›
      </button>
      <button
        onClick={onClose}
        className="h-6 w-6 flex items-center justify-center rounded text-text-secondary hover:bg-surface-hover hover:text-text-primary"
        aria-label="Close find bar"
      >
        ×
      </button>
    </div>
  );
}
