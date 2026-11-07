import { useState } from 'react';
import { useTabsStore } from '../store/tabs-store';
import type { TabState } from '../../shared/ipc-channels';

interface ContextMenuState {
  tabId: string;
  x: number;
  y: number;
}

export function TabStrip() {
  const tabs = useTabsStore((s) => s.tabs);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const switchTab = useTabsStore((s) => s.switchTab);
  const closeTab = useTabsStore((s) => s.closeTab);
  const createTab = useTabsStore((s) => s.createTab);
  const duplicateTab = useTabsStore((s) => s.duplicateTab);
  const togglePin = useTabsStore((s) => s.togglePin);
  const toggleMute = useTabsStore((s) => s.toggleMute);
  const reorderTabs = useTabsStore((s) => s.reorderTabs);

  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const openMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    setMenu({ tabId, x: e.clientX, y: e.clientY });
  };

  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const ids = tabs.map((t) => t.id);
    const fromIndex = ids.indexOf(dragId);
    const toIndex = ids.indexOf(targetId);
    if (fromIndex === -1 || toIndex === -1) return;
    ids.splice(fromIndex, 1);
    ids.splice(toIndex, 0, dragId);
    reorderTabs(ids);
    setDragId(null);
  };

  const menuTab = menu ? tabs.find((t) => t.id === menu.tabId) : undefined;

  return (
    <div className="flex items-center gap-1 h-10 px-2 pt-1.5 app-drag select-none">
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar app-no-drag">
        {tabs.map((tab) => (
          <TabChip
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            onClick={() => switchTab(tab.id)}
            onClose={() => closeTab(tab.id)}
            onContextMenu={(e) => openMenu(e, tab.id)}
            onDragStart={() => setDragId(tab.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(tab.id)}
          />
        ))}
      </div>
      <button
        onClick={() => createTab()}
        className="app-no-drag h-7 w-7 flex items-center justify-center rounded-full text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
        aria-label="New tab"
        title="New tab (Ctrl/Cmd+T)"
      >
        +
      </button>
      <button
        onClick={() => createTab(true)}
        className="app-no-drag h-7 w-7 flex items-center justify-center rounded-full text-purple-300 hover:bg-surface-hover transition-colors"
        aria-label="New private tab"
        title="New private tab (Ctrl/Cmd+Shift+N)"
      >
        🕶
      </button>

      {menu && menuTab && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
          <div
            className="fixed z-50 w-44 py-1 rounded-lg bg-surface-elevated border border-border shadow-2xl text-[13px]"
            style={{ left: menu.x, top: menu.y }}
          >
            <MenuItem
              label={menuTab.isPinned ? 'Unpin tab' : 'Pin tab'}
              onClick={() => {
                togglePin(menu.tabId);
                setMenu(null);
              }}
            />
            <MenuItem
              label={menuTab.isMuted ? 'Unmute tab' : 'Mute tab'}
              onClick={() => {
                toggleMute(menu.tabId);
                setMenu(null);
              }}
            />
            <MenuItem
              label="Duplicate tab"
              onClick={() => {
                duplicateTab(menu.tabId);
                setMenu(null);
              }}
            />
            <div className="h-px bg-border my-1" />
            <MenuItem
              label="Close tab"
              onClick={() => {
                closeTab(menu.tabId);
                setMenu(null);
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-1.5 text-text-primary hover:bg-surface-hover transition-colors"
    >
      {label}
    </button>
  );
}

interface TabChipProps {
  tab: TabState;
  isActive: boolean;
  onClick: () => void;
  onClose: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
}

function TabChip({ tab, isActive, onClick, onClose, onContextMenu, onDragStart, onDragOver, onDrop }: TabChipProps) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`group flex items-center gap-2 h-8 px-3 rounded-t-lg cursor-pointer transition-colors duration-150
        ${tab.isPinned ? 'min-w-[40px] w-10 justify-center px-0' : 'min-w-[160px] max-w-[220px]'}
        ${isActive ? 'bg-surface-elevated text-text-primary' : 'bg-transparent text-text-secondary hover:bg-surface-hover'}
        ${tab.isPrivate ? 'ring-1 ring-inset ring-purple-500/30' : ''}
        ${tab.isSleeping ? 'opacity-60' : ''}`}
      title={tab.title || 'New Tab'}
    >
      {tab.isLoading ? (
        <span className="h-2.5 w-2.5 rounded-full border-[1.5px] border-accent border-t-transparent animate-spin shrink-0" />
      ) : tab.isSleeping ? (
        <span className="text-[10px] shrink-0" title="Sleeping — will reload on click">
          🌙
        </span>
      ) : tab.favicon ? (
        <img
          src={tab.favicon}
          alt=""
          className="h-3.5 w-3.5 rounded-sm shrink-0 object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : tab.isPrivate ? (
        <span className="h-2.5 w-2.5 rounded-full bg-purple-400 shrink-0" title="Private tab" />
      ) : (
        <span className="h-2.5 w-2.5 rounded-full bg-text-tertiary/40 shrink-0" />
      )}

      {!tab.isPinned && <span className="truncate text-[13px] flex-1">{tab.title || 'New Tab'}</span>}

      {tab.isMuted && (
        <span className="text-[11px] shrink-0" title="Muted">
          🔇
        </span>
      )}

      {!tab.isPinned && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="opacity-0 group-hover:opacity-100 hover:bg-surface-hover rounded-full h-4 w-4 flex items-center justify-center text-xs shrink-0"
          aria-label="Close tab"
        >
          ×
        </button>
      )}
    </div>
  );
}
