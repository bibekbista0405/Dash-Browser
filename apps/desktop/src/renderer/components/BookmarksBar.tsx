import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { BookmarkEntry } from '../../shared/ipc-channels';
import { useBookmarksStore } from '../store/bookmarks-store';
import { useTabsStore, activeTabOf } from '../store/tabs-store';
import { useDetachesActiveViewWhileOpen } from '../hooks/useDetachesActiveViewWhileOpen';

type Entry = { kind: 'bookmark'; bookmark: BookmarkEntry } | { kind: 'folder'; name: string; items: BookmarkEntry[] };

const DRAG_TYPE = 'application/x-dash-bookmark';

/** Folder names use "/" for nesting ("Work/Docs"); the bar shows the top level and the menu shows the rest. */
const topFolder = (name: string): string => name.split('/')[0].trim() || name;

const OVERFLOW_BUTTON_WIDTH = 36;
const ITEM_GAP = 4;

/** Builds the bar's entries in saved order: loose bookmarks inline, each folder as one button. */
function buildEntries(bookmarks: BookmarkEntry[]): Entry[] {
  const entries: Entry[] = [];
  const folders = new Map<string, Extract<Entry, { kind: 'folder' }>>();
  for (const b of bookmarks) {
    if (!b.folder) {
      entries.push({ kind: 'bookmark', bookmark: b });
      continue;
    }
    const top = topFolder(b.folder);
    let folder = folders.get(top);
    if (!folder) {
      folder = { kind: 'folder', name: top, items: [] };
      folders.set(top, folder);
      entries.push(folder);
    }
    folder.items.push(b);
  }
  return entries;
}

/** Direct bookmarks first, then one labelled section per sub-folder ("Work/Docs" under "Work" shows as "Docs"). */
function folderMenuEntries(folder: Extract<Entry, { kind: 'folder' }>): Entry[] {
  const out: Entry[] = [];
  const subs = new Map<string, BookmarkEntry[]>();
  for (const b of folder.items) {
    const rest = (b.folder ?? '').split('/').slice(1).map((x) => x.trim()).filter(Boolean).join(' / ');
    if (!rest) out.push({ kind: 'bookmark', bookmark: b });
    else subs.set(rest, [...(subs.get(rest) ?? []), b]);
  }
  for (const [name, items] of [...subs.entries()].sort(([a], [b]) => a.localeCompare(b))) out.push({ kind: 'folder', name, items });
  return out;
}

export function BookmarksBar() {
  const bookmarks = useBookmarksStore((s) => s.bookmarks);
  const remove = useBookmarksStore((s) => s.remove);
  const move = useBookmarksStore((s) => s.move);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const activeTab = useTabsStore(activeTabOf);
  const entries = useMemo(() => buildEntries(bookmarks), [bookmarks]);

  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(entries.length);
  const [menu, setMenu] = useState<{ x: number; y: number; entries: Entry[]; title?: string } | null>(null);

  // Work out how many entries fit; the rest go behind the » button.
  useLayoutEffect(() => {
    const compute = () => {
      const container = containerRef.current;
      const measure = measureRef.current;
      if (!container || !measure) return;
      const widths = Array.from(measure.children).map((c) => (c as HTMLElement).offsetWidth + ITEM_GAP);
      const available = container.clientWidth - 16;
      const total = widths.reduce((a, b) => a + b, 0);
      if (total <= available) {
        setVisibleCount(entries.length);
        return;
      }
      let used = OVERFLOW_BUTTON_WIDTH;
      let count = 0;
      for (const w of widths) {
        if (used + w > available) break;
        used += w;
        count += 1;
      }
      setVisibleCount(count);
    };
    compute();
    const observer = new ResizeObserver(compute);
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [entries]);

  const open = (b: BookmarkEntry, newTab: boolean) => {
    setMenu(null);
    if (newTab || !activeTab) void window.dash.tabs.create(b.url);
    else void window.dash.tabs.navigate(activeTab.id, b.url);
  };

  if (entries.length === 0) {
    return (
      <div className="h-8 flex items-center px-3 text-xs text-text-secondary border-b border-border/40">
        Bookmark pages with Ctrl+D and they will appear here.
      </div>
    );
  }

  const visible = entries.slice(0, visibleCount);
  const hidden = entries.slice(visibleCount);

  const openMenu = (el: HTMLElement, items: Entry[], title?: string) => {
    const r = el.getBoundingClientRect();
    setMenu({ x: Math.min(r.left, window.innerWidth - 260), y: r.bottom + 2, entries: items, title });
  };

  const renderButton = (entry: Entry, key: string, interactive: boolean) => {
    if (entry.kind === 'folder') {
      return (
        <button
          key={key}
          tabIndex={interactive ? 0 : -1}
          onClick={(e) => interactive && openMenu(e.currentTarget, folderMenuEntries(entry), entry.name)}
          className="shrink-0 flex items-center gap-1.5 h-6 max-w-[160px] px-2 rounded-md text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary"
          title={entry.name}
          onDragOver={(e) => {
            if (!interactive || !e.dataTransfer.types.includes(DRAG_TYPE)) return;
            e.preventDefault();
            setDropTarget(`f:${entry.name}`);
          }}
          onDragLeave={() => setDropTarget(null)}
          onDrop={(e) => {
            if (!interactive) return;
            e.preventDefault();
            setDropTarget(null);
            const id = Number(e.dataTransfer.getData(DRAG_TYPE));
            if (id) void move(id, null, entry.name);
          }}
        >
          <span aria-hidden>📁</span>
          <span className="truncate">{entry.name}</span>
        </button>
      );
    }
    const b = entry.bookmark;
    return (
      <div
        key={key}
        className={`group relative shrink-0 ${dropTarget === `b:${b.id}` ? 'border-l-2 border-accent' : ''}`}
        draggable={interactive}
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_TYPE, String(b.id));
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragEnd={() => setDropTarget(null)}
        onDragOver={(e) => {
          if (!interactive || !e.dataTransfer.types.includes(DRAG_TYPE)) return;
          e.preventDefault();
          setDropTarget(`b:${b.id}`);
        }}
        onDragLeave={() => setDropTarget(null)}
        onDrop={(e) => {
          if (!interactive) return;
          e.preventDefault();
          setDropTarget(null);
          const id = Number(e.dataTransfer.getData(DRAG_TYPE));
          if (id && id !== b.id) void move(id, b.id, null);
        }}
      >
        <button
          title={b.title}
          tabIndex={interactive ? 0 : -1}
          onClick={() => interactive && open(b, false)}
          onAuxClick={(e) => interactive && e.button === 1 && open(b, true)}
          className="flex items-center gap-1.5 h-6 max-w-[150px] pl-2 pr-5 rounded-md text-xs text-text-secondary hover:bg-surface-hover hover:text-text-primary"
        >
          {b.faviconUrl ? (
            <img src={b.faviconUrl} alt="" className="w-3.5 h-3.5 rounded-sm" onError={(e) => (e.currentTarget.style.display = 'none')} />
          ) : null}
          <span className="truncate">{b.title || b.url}</span>
        </button>
        {interactive && (
          <button
            aria-label="Remove bookmark"
            onClick={() => void remove(b.id)}
            className="hidden group-hover:flex absolute right-0.5 top-1/2 -translate-y-1/2 w-4 h-4 items-center justify-center rounded text-text-secondary hover:bg-surface-elevated"
          >
            ×
          </button>
        )}
      </div>
    );
  };

  return (
    <div ref={containerRef} className="relative h-8 flex items-center gap-1 px-2 overflow-hidden border-b border-border/40" data-testid="bookmarks-bar">
      {/* Invisible row used only to measure each entry's natural width. */}
      <div ref={measureRef} aria-hidden className="absolute left-0 top-0 flex gap-1 px-2 invisible pointer-events-none h-0 overflow-hidden whitespace-nowrap">
        {entries.map((e, i) => renderButton(e, `m${i}`, false))}
      </div>
      {visible.map((e, i) => renderButton(e, `v${i}`, true))}
      {hidden.length > 0 && (
        <button
          aria-label="More bookmarks"
          data-testid="bookmarks-overflow"
          onClick={(e) => openMenu(e.currentTarget, hidden)}
          className="ml-auto shrink-0 h-6 w-7 rounded-md text-sm text-text-secondary hover:bg-surface-hover"
        >
          »
        </button>
      )}
      {menu && <BarMenu {...menu} onOpen={open} onClose={() => setMenu(null)} />}
    </div>
  );
}

function BarMenu({
  x,
  y,
  entries,
  title,
  onOpen,
  onClose,
}: {
  x: number;
  y: number;
  entries: Entry[];
  title?: string;
  onOpen: (b: BookmarkEntry, newTab: boolean) => void;
  onClose: () => void;
}) {
  useDetachesActiveViewWhileOpen(true);
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const row = (b: BookmarkEntry) => (
    <button
      key={b.id}
      title={b.url}
      onClick={() => onOpen(b, false)}
      onAuxClick={(e) => e.button === 1 && onOpen(b, true)}
      className="w-full flex items-center gap-2 px-3 h-8 text-left text-[13px] text-text-primary hover:bg-surface-hover"
    >
      {b.faviconUrl ? <img src={b.faviconUrl} alt="" className="w-4 h-4 rounded-sm shrink-0" onError={(e) => (e.currentTarget.style.display = 'none')} /> : <span className="w-4 shrink-0" />}
      <span className="truncate">{b.title || b.url}</span>
    </button>
  );

  return (
    <div
      ref={ref}
      data-testid="bookmarks-menu"
      style={{ position: 'fixed', left: x, top: y }}
      className="z-50 w-64 max-h-[60vh] overflow-y-auto py-1 rounded-lg bg-surface-elevated border border-border shadow-2xl"
    >
      {title && <div className="px-3 py-1 text-[11px] uppercase tracking-wide text-text-tertiary truncate">{title}</div>}
      {entries.map((e) =>
        e.kind === 'bookmark' ? (
          row(e.bookmark)
        ) : (
          <div key={e.name}>
            <div className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide text-text-tertiary truncate">📁 {e.name}</div>
            {e.items.map(row)}
          </div>
        )
      )}
    </div>
  );
}
