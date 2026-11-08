import { useEffect, useRef, useState } from 'react';
import { useTabsStore } from '../store/tabs-store';
import { useDetachesActiveViewWhileOpen } from '../hooks/useDetachesActiveViewWhileOpen';
import { Logo } from './Logo';
import { TAB_GROUP_COLORS, type TabGroup, type TabGroupColor, type TabState } from '../../shared/ipc-channels';

const GROUP_HEX: Record<TabGroupColor, string> = {
  blue: '#5b8cff',
  red: '#ef5b5b',
  yellow: '#e5b93c',
  green: '#4fbf7f',
  pink: '#e86fb0',
  purple: '#a77bf0',
  cyan: '#3cc4d6',
  orange: '#f0894a',
};

const IS_MAC = navigator.platform.toLowerCase().includes('mac');

interface GroupMenuState {
  group: TabGroup;
  x: number;
  y: number;
}

interface ContextMenuState {
  tabId: string;
  x: number;
  y: number;
}

export function TabStrip() {
  const tabs = useTabsStore((s) => s.tabs);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const listRef = useRef<HTMLDivElement>(null);

  // Many tabs: keep the active one in view (the strip scrolls sideways instead of clipping).
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-active-tab="true"]');
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeTabId, tabs.length]);
  const switchTab = useTabsStore((s) => s.switchTab);
  const closeTab = useTabsStore((s) => s.closeTab);
  const createTab = useTabsStore((s) => s.createTab);
  const duplicateTab = useTabsStore((s) => s.duplicateTab);
  const togglePin = useTabsStore((s) => s.togglePin);
  const toggleMute = useTabsStore((s) => s.toggleMute);
  const reorderTabs = useTabsStore((s) => s.reorderTabs);

  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  useDetachesActiveViewWhileOpen(menu !== null);
  const [groupMenu, setGroupMenu] = useState<GroupMenuState | null>(null);
  useDetachesActiveViewWhileOpen(groupMenu !== null);
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
    <div
      className="flex items-center gap-1 h-10 pl-2 pt-1.5 app-drag select-none"
      // Leave room for the native window buttons (right on Windows/Linux, traffic lights on the left on macOS).
      style={{ paddingRight: IS_MAC ? 8 : 148, paddingLeft: IS_MAC ? 80 : 8 }}
    >
      <Logo size={18} className="mr-1.5 mb-0.5 text-text-secondary" />
      <div
        ref={listRef}
        className="flex items-center gap-0.5 min-w-0 flex-1 max-w-fit app-no-drag overflow-x-auto overflow-y-hidden no-scrollbar"
        onWheel={(e) => {
          // Mouse wheel scrolls the strip sideways (trackpads already scroll sideways natively).
          if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && listRef.current) listRef.current.scrollLeft += e.deltaY;
        }}
      >
        {tabs.map((tab, i) => {
          const g = tab.group;
          if (g && g.collapsed && tab.id !== activeTabId) {
            // Collapsed: show the chip once (on the first member) and hide the rest.
            const firstOfRun = tabs[i - 1]?.group?.id !== g.id;
            return firstOfRun ? (
              <GroupChip key={`g-${tab.id}`} group={g} onToggle={() => window.dash.tabs.updateGroup(g.id, { collapsed: false })} onMenu={(e) => { e.preventDefault(); setGroupMenu({ group: g, x: e.clientX, y: e.clientY }); }} count={tabs.filter((t) => t.group?.id === g.id).length} />
            ) : null;
          }
          const showChip = g && tabs[i - 1]?.group?.id !== g.id;
          return (
          <div key={tab.id} className="contents">
          {showChip && g && (
            <GroupChip group={g} onToggle={() => window.dash.tabs.updateGroup(g.id, { collapsed: true })} onMenu={(e) => { e.preventDefault(); setGroupMenu({ group: g, x: e.clientX, y: e.clientY }); }} />
          )}
          <TabChip
            tab={tab}
            isActive={tab.id === activeTabId}
            onClick={() => switchTab(tab.id)}
            onClose={() => closeTab(tab.id)}
            onContextMenu={(e) => openMenu(e, tab.id)}
            onDragStart={() => setDragId(tab.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(tab.id)}
          />
          </div>
          );
        })}
      </div>
      <button
        onClick={() => createTab()}
        className="app-no-drag shrink-0 h-7 w-7 flex items-center justify-center rounded-full text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
        aria-label="New tab"
        title="New tab (Ctrl/Cmd+T)"
      >
        +
      </button>
      <button
        onClick={() => createTab(true)}
        className="app-no-drag shrink-0 h-7 w-7 flex items-center justify-center rounded-full text-purple-300 hover:bg-surface-hover transition-colors"
        aria-label="New private tab"
        title="New private tab (Ctrl/Cmd+Shift+N)"
      >
        🕶
      </button>

      {groupMenu && <GroupMenu state={groupMenu} tabs={tabs} onClose={() => setGroupMenu(null)} />}

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
            {!menuTab.isPinned && !menuTab.group && (
              <MenuItem
                label="Add to new group"
                onClick={() => {
                  window.dash.tabs.setGroup(menu.tabId, 'new');
                  setMenu(null);
                }}
              />
            )}
            {!menuTab.isPinned &&
              groupsInUse(tabs)
                .filter((g) => g.id !== menuTab.group?.id)
                .map((g) => (
                  <MenuItem
                    key={g.id}
                    label={`Add to “${g.name || 'Unnamed group'}”`}
                    onClick={() => {
                      window.dash.tabs.setGroup(menu.tabId, g.id);
                      setMenu(null);
                    }}
                  />
                ))}
            {menuTab.group && (
              <MenuItem
                label="Remove from group"
                onClick={() => {
                  window.dash.tabs.setGroup(menu.tabId, null);
                  setMenu(null);
                }}
              />
            )}
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
  // A favicon URL that fails to load (e.g. the default /favicon.ico returns 404) must fall back to the placeholder, not leave a blank gap.
  const [brokenIcon, setBrokenIcon] = useState<string | null>(null);
  const iconOk = !!tab.favicon && tab.favicon !== brokenIcon;
  return (
    <div
      draggable
      data-active-tab={isActive ? 'true' : undefined}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`group flex items-center gap-2 h-8 px-3 rounded-t-lg cursor-pointer transition-colors duration-150
        ${tab.isPinned ? 'min-w-[40px] w-10 shrink-0 justify-center px-0' : `${isActive ? 'min-w-[120px]' : 'min-w-[36px]'} max-w-[220px] flex-1 basis-0`}
        ${isActive ? 'bg-surface-elevated text-text-primary' : 'bg-transparent text-text-secondary hover:bg-surface-hover'}
        ${tab.isPrivate ? 'ring-1 ring-inset ring-purple-500/30' : ''}
        ${tab.isSleeping ? 'opacity-60' : ''}`}
      title={tab.title || 'New Tab'}
      style={tab.group ? { boxShadow: `inset 0 2px 0 ${GROUP_HEX[tab.group.color]}` } : undefined}
    >
      {tab.isLoading ? (
        <span className="h-2.5 w-2.5 rounded-full border-[1.5px] border-accent border-t-transparent animate-spin shrink-0" />
      ) : tab.isSleeping ? (
        <span className="text-[10px] shrink-0" title="Sleeping — will reload on click">
          🌙
        </span>
      ) : iconOk ? (
        <img
          src={tab.favicon ?? undefined}
          alt=""
          className="h-3.5 w-3.5 rounded-sm shrink-0 object-cover"
          onError={() => setBrokenIcon(tab.favicon)}
        />
      ) : tab.isPrivate ? (
        <span className="h-2.5 w-2.5 rounded-full bg-purple-400 shrink-0" title="Private tab" />
      ) : (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-text-tertiary" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
          <circle cx="8" cy="8" r="6.2" />
          <path d="M1.8 8h12.4M8 1.8c2 1.8 2.9 3.9 2.9 6.2S10 12.4 8 14.2C6 12.4 5.1 10.3 5.1 8S6 3.6 8 1.8Z" />
        </svg>
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
          className={`${isActive ? 'opacity-100' : 'opacity-0'} group-hover:opacity-100 hover:bg-surface-hover rounded-full h-4 w-4 flex items-center justify-center text-xs shrink-0`}
          aria-label="Close tab"
        >
          ×
        </button>
      )}
    </div>
  );
}

function groupsInUse(tabs: TabState[]): TabGroup[] {
  const seen = new Map<string, TabGroup>();
  for (const t of tabs) if (t.group && !seen.has(t.group.id)) seen.set(t.group.id, t.group);
  return [...seen.values()];
}

function GroupChip({
  group,
  onToggle,
  onMenu,
  count,
}: {
  group: TabGroup;
  onToggle: () => void;
  onMenu: (e: React.MouseEvent) => void;
  count?: number;
}) {
  const hex = GROUP_HEX[group.color];
  return (
    <button
      onClick={onToggle}
      onContextMenu={onMenu}
      title={group.collapsed ? 'Expand group' : 'Collapse group'}
      className="shrink-0 h-6 px-2 mr-0.5 rounded-md text-[11px] font-medium text-[#0b0d10] max-w-[120px] truncate"
      style={{ background: hex }}
    >
      {group.name || (group.collapsed ? 'Group' : '')}
      {group.collapsed && count ? ` · ${count}` : ''}
      {!group.name && !group.collapsed ? '\u00A0' : ''}
    </button>
  );
}

function GroupMenu({ state, tabs, onClose }: { state: GroupMenuState; tabs: TabState[]; onClose: () => void }) {
  const { group } = state;
  const [name, setName] = useState(group.name);
  const members = tabs.filter((t) => t.group?.id === group.id);
  const commit = () => {
    if (name !== group.name) window.dash.tabs.updateGroup(group.id, { name });
  };
  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={() => {
          commit();
          onClose();
        }}
      />
      <div
        className="fixed z-50 w-52 p-2 rounded-lg bg-surface-elevated border border-border shadow-2xl text-[13px]"
        style={{ left: state.x, top: state.y }}
      >
        <input
          autoFocus
          value={name}
          maxLength={40}
          placeholder="Group name"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commit();
              onClose();
            }
          }}
          className="w-full h-8 px-2 mb-2 rounded-md bg-surface border border-border/60 text-text-primary outline-none focus:border-accent"
        />
        <div className="flex gap-1.5 mb-2 flex-wrap">
          {TAB_GROUP_COLORS.map((c) => (
            <button
              key={c}
              aria-label={c}
              title={c}
              onClick={() => window.dash.tabs.updateGroup(group.id, { color: c })}
              className={`h-5 w-5 rounded-full ${group.color === c ? 'ring-2 ring-text-primary' : ''}`}
              style={{ background: GROUP_HEX[c] }}
            />
          ))}
        </div>
        <MenuItem
          label="Ungroup"
          onClick={() => {
            members.forEach((t) => window.dash.tabs.setGroup(t.id, null));
            onClose();
          }}
        />
        <MenuItem
          label={`Close group (${members.length})`}
          onClick={() => {
            window.dash.tabs.closeGroup(group.id);
            onClose();
          }}
        />
      </div>
    </>
  );
}
