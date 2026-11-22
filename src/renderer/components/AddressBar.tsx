import { useEffect, useRef, useState } from 'react';
import { useTabsStore, activeTabOf } from '../store/tabs-store';
import { useBookmarksStore } from '../store/bookmarks-store';
import type { AddressSuggestion } from '../../shared/ipc-channels';
import { NEW_TAB_URL } from '../../shared/ipc-channels';

interface AddressBarProps {
  onOpenHistory: () => void;
  onOpenBookmarks: () => void;
  onOpenDownloads: () => void;
  onOpenSettings: () => void;
  hasActiveDownload: boolean;
  addressInputRef?: React.RefObject<HTMLInputElement>;
}

export function AddressBar({
  onOpenHistory,
  onOpenBookmarks,
  onOpenDownloads,
  onOpenSettings,
  hasActiveDownload,
  addressInputRef,
}: AddressBarProps) {
  const store = useTabsStore();
  const activeTab = activeTabOf(store);
  const [draft, setDraft] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const { isBookmarked, findByUrl, add: addBookmark, remove: removeBookmark } = useBookmarksStore();

  useEffect(() => {
    if (!isEditing) setDraft(activeTab?.url === NEW_TAB_URL ? '' : activeTab?.url ?? '');
  }, [activeTab?.url, isEditing]);

  useEffect(() => {
    if (!isEditing || !draft.trim()) {
      setSuggestions([]);
      return;
    }
    const timeout = setTimeout(() => {
      window.dash.suggestions.query(draft.trim()).then(setSuggestions);
    }, 120);
    return () => clearTimeout(timeout);
  }, [draft, isEditing]);

  if (!activeTab) return <div className="h-12" />;

  const navigateTo = (url: string) => {
    store.navigate(activeTab.id, url);
    setIsEditing(false);
    setSuggestions([]);
    (document.activeElement as HTMLElement)?.blur();
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (draft.trim()) navigateTo(draft.trim());
  };

  const bookmarked = isBookmarked(activeTab.url);

  const toggleBookmark = () => {
    if (bookmarked) {
      const existing = findByUrl(activeTab.url);
      if (existing) removeBookmark(existing.id);
    } else {
      addBookmark(activeTab.url, activeTab.title, activeTab.favicon);
    }
  };

  return (
    <div className="app-no-drag relative flex items-center gap-2 h-12 px-3">
      <NavButton disabled={!activeTab.canGoBack} onClick={() => store.goBack(activeTab.id)} label="Back">
        ‹
      </NavButton>
      <NavButton disabled={!activeTab.canGoForward} onClick={() => store.goForward(activeTab.id)} label="Forward">
        ›
      </NavButton>
      <NavButton
        onClick={() => (activeTab.isLoading ? store.stop(activeTab.id) : store.reload(activeTab.id))}
        label={activeTab.isLoading ? 'Stop' : 'Reload'}
      >
        {activeTab.isLoading ? '×' : '↻'}
      </NavButton>
      <NavButton onClick={() => store.goHome(activeTab.id)} label="Home">
        <span className="text-[15px]">⌂</span>
      </NavButton>

      <form onSubmit={submit} className="flex-1 relative">
        <div className="flex items-center gap-2 h-9 px-4 rounded-full bg-surface-elevated border border-border/60 focus-within:border-accent/60 transition-colors">
          {activeTab.isPrivate && (
            <span className="text-[10px] font-medium text-purple-300 bg-purple-500/15 px-1.5 py-0.5 rounded shrink-0">
              Private
            </span>
          )}
          {activeTab.blockedCount > 0 && (
            <span
              className="flex items-center gap-1 text-[10px] font-medium text-accent bg-accent/15 px-1.5 py-0.5 rounded shrink-0"
              title={`${activeTab.blockedCount} ad/tracker request${activeTab.blockedCount === 1 ? '' : 's'} blocked on this page`}
            >
              🛡 {activeTab.blockedCount}
            </span>
          )}
          {!activeTab.url.startsWith('http://') && activeTab.url.length > 0 && (
            <span className="text-accent text-xs" title="Secure connection">
              🔒
            </span>
          )}
          <input
            ref={addressInputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={(e) => {
              setIsEditing(true);
              e.target.select();
            }}
            onBlur={() => setTimeout(() => setIsEditing(false), 120)}
            placeholder="Search or enter address"
            className="flex-1 bg-transparent outline-none text-[13px] text-text-primary placeholder:text-text-tertiary"
            spellCheck={false}
          />
        </div>

        {isEditing && suggestions.length > 0 && (
          <div className="absolute top-11 left-0 right-0 z-40 py-1 rounded-lg bg-surface-elevated border border-border shadow-2xl overflow-hidden">
            {suggestions.map((s) => (
              <button
                key={s.url}
                onMouseDown={(e) => {
                  e.preventDefault();
                  navigateTo(s.url);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-surface-hover text-left"
              >
                <span className="text-[11px] shrink-0">{s.type === 'bookmark' ? '★' : '↺'}</span>
                <span className="text-[13px] text-text-primary truncate">{s.title || s.url}</span>
                <span className="text-[11px] text-text-tertiary truncate ml-auto">{s.url}</span>
              </button>
            ))}
          </div>
        )}
      </form>

      {activeTab.zoomPercent !== 100 && (
        <button
          onClick={() => window.dash.zoom.reset(activeTab.id)}
          className="text-[11px] text-text-secondary hover:text-text-primary px-1.5 shrink-0"
          title="Reset zoom"
        >
          {activeTab.zoomPercent}%
        </button>
      )}

      <NavButton onClick={toggleBookmark} label={bookmarked ? 'Remove bookmark' : 'Bookmark this page'}>
        <span className={bookmarked ? 'text-accent' : ''}>{bookmarked ? '★' : '☆'}</span>
      </NavButton>
      <NavButton onClick={onOpenDownloads} label="Show downloads">
        <span className="relative text-[13px]">
          ⬇
          {hasActiveDownload && (
            <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
          )}
        </span>
      </NavButton>
      <NavButton onClick={onOpenBookmarks} label="Show bookmarks">
        <span className="text-[13px]">▤</span>
      </NavButton>
      <NavButton onClick={onOpenHistory} label="Show history">
        <span className="text-[13px]">↺</span>
      </NavButton>
      <NavButton onClick={onOpenSettings} label="Settings">
        <span className="text-[13px]">⚙</span>
      </NavButton>

      <div className="relative">
        <NavButton onClick={() => setShowMoreMenu((v) => !v)} label="More actions">
          <span className="text-[13px]">⋮</span>
        </NavButton>
        {showMoreMenu && (
          <MoreMenu
            tabId={activeTab.id}
            onClose={() => setShowMoreMenu(false)}
            onOpenHistory={onOpenHistory}
            onOpenBookmarks={onOpenBookmarks}
            onOpenDownloads={onOpenDownloads}
            onOpenSettings={onOpenSettings}
          />
        )}
      </div>
    </div>
  );
}

function MoreMenu({
  tabId,
  onClose,
  onOpenHistory,
  onOpenBookmarks,
  onOpenDownloads,
  onOpenSettings,
}: {
  tabId: string;
  onClose: () => void;
  onOpenHistory: () => void;
  onOpenBookmarks: () => void;
  onOpenDownloads: () => void;
  onOpenSettings: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isMac = navigator.platform.toLowerCase().includes('mac');
  const mod = isMac ? '⌘' : 'Ctrl';

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [onClose]);

  const item = (label: string, onClick: () => void, shortcut?: string) => (
    <button
      onClick={() => {
        onClick();
        onClose();
      }}
      className="w-full flex items-center justify-between px-3 py-1.5 text-[13px] text-text-primary hover:bg-surface-hover transition-colors"
    >
      <span>{label}</span>
      {shortcut && <span className="text-[11px] text-text-tertiary">{shortcut}</span>}
    </button>
  );

  const divider = <div className="h-px bg-border my-1" />;

  return (
    <div
      ref={ref}
      className="absolute right-0 top-9 z-50 w-64 py-1 rounded-lg bg-surface-elevated border border-border shadow-2xl"
    >
      {item('New tab', () => useTabsStore.getState().createTab(), `${mod}+T`)}
      {item('New window', () => window.dash.windowControls.new(), `${mod}+N`)}
      {item('New private tab', () => useTabsStore.getState().createTab(true), `${mod}+Shift+N`)}
      {divider}
      {item('History', onOpenHistory, `${mod}+H`)}
      {item('Downloads', onOpenDownloads, `${mod}+J`)}
      {item('Bookmarks', onOpenBookmarks, `${mod}+Shift+O`)}
      {divider}
      <div className="flex items-center justify-between px-3 py-1.5">
        <span className="text-[13px] text-text-primary">Zoom</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => window.dash.zoom.out(tabId)}
            className="h-6 w-6 flex items-center justify-center rounded hover:bg-surface text-text-secondary"
          >
            −
          </button>
          <button
            onClick={() => window.dash.zoom.reset(tabId)}
            className="h-6 w-6 flex items-center justify-center rounded hover:bg-surface text-text-secondary text-[11px]"
            title="Reset zoom"
          >
            ⟲
          </button>
          <button
            onClick={() => window.dash.zoom.in(tabId)}
            className="h-6 w-6 flex items-center justify-center rounded hover:bg-surface text-text-secondary"
          >
            +
          </button>
        </div>
      </div>
      {divider}
      {item('Print…', () => window.dash.page.print(tabId), `${mod}+P`)}
      {item('Save page as…', () => window.dash.page.save(tabId), `${mod}+S`)}
      {item('Find in page…', () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: !isMac, metaKey: isMac })), `${mod}+F`)}
      {divider}
      {item('Developer tools', () => window.dash.page.toggleDevTools(tabId), 'F12')}
      {item('Settings', onOpenSettings)}
    </div>
  );
}

function NavButton({
  children,
  onClick,
  disabled,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="h-7 w-7 flex items-center justify-center rounded-full text-lg leading-none
        text-text-secondary hover:text-text-primary hover:bg-surface-hover
        disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
    >
      {children}
    </button>
  );
}
