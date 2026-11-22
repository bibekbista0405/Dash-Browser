import { useEffect, useRef, useState } from 'react';
import { IconPrivate, IconMoon, IconMute } from './Icons';
import { useEscape } from '../hooks/useEscape';
import { useContainers, CONTAINER_HEX } from '../hooks/useContainers';
import { useTabsStore } from '../store/tabs-store';
import { useSettingsStore } from '../store/settings-store';
import { useDetachesActiveViewWhileOpen } from '../hooks/useDetachesActiveViewWhileOpen';
import { VERTICAL_TABS_WIDTH, VERTICAL_TABS_WIDTH_COLLAPSED, TAB_GROUP_COLORS, type TabGroup, type TabGroupColor, type TabState } from '../../shared/ipc-channels';

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
  // With many tabs each one gets narrow: inactive tabs then show only their icon (like Chrome) instead of one clipped letter.
  const [winW, setWinW] = useState(() => window.innerWidth);
  useEffect(() => {
    const on = () => setWinW(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);

  const vListRef = useRef<HTMLDivElement>(null);
  const vertical = useSettingsStore((s) => s.settings.verticalTabs);
  const collapsed = useSettingsStore((s) => s.settings.verticalTabsCollapsed);
  const setSetting = useSettingsStore((s) => s.set);

  // Many tabs: keep the active one in view (the strip scrolls sideways instead of clipping).
  useEffect(() => {
    const el = (vertical ? vListRef.current : listRef.current)?.querySelector<HTMLElement>('[data-active-tab="true"]');
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeTabId, tabs.length, vertical]);
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

  const containers = useContainers();
  const [profileName, setProfileName] = useState<string | null>(null);
  useEffect(() => {
    void window.dash.profiles.list().then((l) => {
      const cur = l.find((p) => p.isCurrent);
      setProfileName(cur && cur.id !== 'default' ? cur.name : null);
    });
  }, []);
  const [searchMenu, setSearchMenu] = useState<{ x: number; y: number } | null>(null);
  const [tabQuery, setTabQuery] = useState('');
  useEscape(() => setSearchMenu(null), !!searchMenu);
  useDetachesActiveViewWhileOpen(searchMenu !== null);
  const [containerMenu, setContainerMenu] = useState<{ x: number; y: number } | null>(null);
  useEscape(() => setMenu(null), !!menu);
  useEscape(() => setContainerMenu(null), !!containerMenu);
  useDetachesActiveViewWhileOpen(containerMenu !== null);
  const menuTab = menu ? tabs.find((t) => t.id === menu.tabId) : undefined;

  const tabItems = (
    <>
        {tabs.map((tab, i) => {
          const g = tab.group;
          if (g && g.collapsed && tab.id !== activeTabId) {
            // Collapsed: show the chip once (on the first member) and hide the rest.
            const firstOfRun = tabs[i - 1]?.group?.id !== g.id;
            return firstOfRun ? (
              <GroupChip key={`g-${tab.id}`} vertical={vertical} group={g} onToggle={() => window.dash.tabs.updateGroup(g.id, { collapsed: false })} onMenu={(e) => { e.preventDefault(); setGroupMenu({ group: g, x: e.clientX, y: e.clientY }); }} count={tabs.filter((t) => t.group?.id === g.id).length} />
            ) : null;
          }
          const showChip = g && tabs[i - 1]?.group?.id !== g.id;
          return (
          <div key={tab.id} className="contents">
          {showChip && g && (
            <GroupChip vertical={vertical} group={g} onToggle={() => window.dash.tabs.updateGroup(g.id, { collapsed: true })} onMenu={(e) => { e.preventDefault(); setGroupMenu({ group: g, x: e.clientX, y: e.clientY }); }} />
          )}
          <TabChip
            vertical={vertical}
            collapsed={collapsed}
            compact={!vertical && !tab.isPinned && Math.max(0, winW - 380) / Math.max(1, tabs.length) < 100}
            tab={tab}
            isActive={tab.id === activeTabId}
            splitSide={tab.inSplit && !vertical ? (tabs.filter((t) => t.inSplit)[0]?.id === tab.id ? 'first' : 'second') : undefined}
            onClick={() => switchTab(tab.id)}
            onClose={() => closeTab(tab.id)}
            onContextMenu={(e) => openMenu(e, tab.id)}
            onDragStart={() => setDragId(tab.id)}
            onDragEnd={(e) => {
              // Released outside this window's chrome: tear the tab off into its own window.
              const out = e.screenX < window.screenX - 4 || e.screenX > window.screenX + window.outerWidth + 4 || e.screenY < window.screenY - 4 || e.screenY > window.screenY + window.outerHeight + 4;
              if (out && e.dataTransfer.dropEffect === 'none') void window.dash.windowControls.moveTab(tab.id, e.screenX, e.screenY);
              setDragId(null);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(tab.id)}
          />
          </div>
          );
        })}
    </>
  );

  return (
    <>
    <div
      className="flex items-center gap-1 h-[40px] pl-2 pt-1 app-drag select-none"
      // Leave room for the native window buttons (right on Windows/Linux, traffic lights on the left on macOS).
      style={{ paddingRight: IS_MAC ? 8 : 148, paddingLeft: IS_MAC ? 80 : 8 }}
    >
      <button
        onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setSearchMenu({ x: r.left, y: r.bottom + 4 }); }}
        className="app-no-drag shrink-0 h-8 w-8 mb-0.5 mr-1 flex items-center justify-center rounded-md text-text-secondary hover:bg-surface-hover hover:text-text-primary active:scale-90 transition-[background-color,color,transform]"
        aria-label="Search tabs" title="Search tabs" aria-haspopup="menu"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 3.5l3 3 3-3" /></svg>
      </button>
      {profileName && (
        <span className="mr-1.5 mb-0.5 px-1.5 h-5 flex items-center rounded-md text-[10px] font-medium bg-accent/15 text-accent app-no-drag max-w-[90px] truncate" title={`Profile: ${profileName}`}>
          {profileName}
        </span>
      )}
      {vertical ? null : (
      <div
        ref={listRef}
        className="flex items-end gap-0.5 min-w-0 flex-[0_1_auto] app-no-drag overflow-x-auto overflow-y-hidden no-scrollbar h-[36px]"
        onWheel={(e) => {
          // Mouse wheel scrolls the strip sideways (trackpads already scroll sideways natively).
          if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && listRef.current) listRef.current.scrollLeft += e.deltaY;
        }}
      >
        {tabItems}
      </div>
      )}
      <button
        onClick={() => createTab()}
        className="app-no-drag shrink-0 h-8 w-8 ml-0.5 mb-0.5 flex items-center justify-center rounded-full text-text-secondary hover:bg-surface-hover hover:text-text-primary active:scale-90 transition-[background-color,color,transform]"
        aria-label="New tab"
        title="New tab (Ctrl/Cmd+T)"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M7 2v10M2 7h10" /></svg>
      </button>
      <button
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setContainerMenu({ x: r.left, y: r.bottom + 4 });
        }}
        className="app-no-drag shrink-0 h-7 w-5 -ml-1 flex items-center justify-center rounded-full text-text-tertiary hover:bg-surface-hover hover:text-text-primary transition-colors text-[10px]"
        aria-label="New container tab"
        title="New container tab"
        aria-haspopup="menu"
      >
        <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 3.5l3 3 3-3" /></svg>
      </button>
      <button
        onClick={() => createTab(true)}
        className="app-no-drag shrink-0 h-8 w-8 flex items-center justify-center rounded-full text-purple-700 dark:text-purple-300 hover:bg-surface-hover transition-colors"
        aria-label="New private tab"
        title="New private tab (Ctrl/Cmd+Shift+N)"
      >
        <IconPrivate />
      </button>
      {vertical && <div className="flex-1" />}

      {searchMenu && (() => {
        const close = () => { setSearchMenu(null); setTabQuery(''); };
        const q = tabQuery.trim().toLowerCase();
        const list = tabs.filter((t) => !q || (t.title || '').toLowerCase().includes(q) || t.url.toLowerCase().includes(q));
        return (
          <>
            <div className="fixed inset-0 z-40" onClick={close} onContextMenu={(e) => { e.preventDefault(); close(); }} />
            <div role="menu" aria-label="Search tabs" className="dash-pop fixed z-50 w-[320px] rounded-xl bg-surface-elevated border border-border shadow-2xl text-[13px] overflow-hidden" style={{ left: Math.max(4, searchMenu.x), top: searchMenu.y }}>
              <input autoFocus value={tabQuery} onChange={(e) => setTabQuery(e.target.value)} placeholder="Search tabs" className="w-full h-9 px-3 bg-transparent outline-none border-b border-border/60 text-text-primary placeholder:text-text-tertiary" />
              <div className="max-h-[320px] overflow-y-auto py-1">
                {list.length === 0 && <div className="px-3 py-3 text-text-tertiary">No matching tabs</div>}
                {list.map((t) => (
                  <button key={t.id} onClick={() => { close(); switchTab(t.id); }} className={`w-full flex items-center gap-2 px-3 h-8 text-left hover:bg-surface-hover ${t.id === activeTabId ? 'text-accent' : 'text-text-primary'}`}>
                    <span className="truncate flex-1">{t.title || 'New Tab'}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        );
      })()}

      {groupMenu && <GroupMenu state={groupMenu} tabs={tabs} onClose={() => setGroupMenu(null)} />}

      {menu && menuTab && (() => {
        const close = () => setMenu(null);
        const idx = tabs.findIndex((t) => t.id === menu.tabId);
        const others = tabs.filter((t) => t.id !== menu.tabId && !t.isPinned);
        const right = tabs.slice(idx + 1).filter((t) => !t.isPinned);
        const mod = IS_MAC ? '⌘' : 'Ctrl+';
        const H = 500;
        const top = Math.max(4, Math.min(menu.y, window.innerHeight - H - 8));
        const left = Math.max(4, Math.min(menu.x, window.innerWidth - 268));
        return (
          <>
            <div className="fixed inset-0 z-40" onClick={close} onContextMenu={(e) => { e.preventDefault(); close(); }} />
            <div role="menu" aria-label="Tab menu" className="dash-pop fixed z-50 w-[256px] py-1.5 rounded-xl bg-surface-elevated border border-border shadow-2xl text-[13px]" style={{ left, top }}>
              <MenuItem
                label="New tab to the right"
                onClick={() => {
                  close();
                  const before = tabs.map((t) => t.id);
                  void window.dash.tabs.create().then((nt) => {
                    before.splice(idx + 1, 0, nt.id);
                    reorderTabs(before);
                  });
                }}
              />
              <MenuItem
                label={menuTab.inSplit ? 'Close split view' : menuTab.id === activeTabId ? 'Split view with a new tab' : 'Move tab into split view'}
                onClick={() => {
                  close();
                  if (menuTab.inSplit) void window.dash.split.close();
                  else void window.dash.split.open(menuTab.id === activeTabId ? undefined : menuTab.id);
                }}
              />
              {!menuTab.isPinned && !menuTab.group && <MenuItem label="Add tab to new group" onClick={() => { close(); window.dash.tabs.setGroup(menu.tabId, 'new'); }} />}
              {!menuTab.isPinned && groupsInUse(tabs).filter((g) => g.id !== menuTab.group?.id).map((g) => (
                <MenuItem key={g.id} label={`Add tab to “${g.name || 'Unnamed group'}”`} onClick={() => { close(); window.dash.tabs.setGroup(menu.tabId, g.id); }} />
              ))}
              {menuTab.group && <MenuItem label="Remove tab from group" onClick={() => { close(); window.dash.tabs.setGroup(menu.tabId, null); }} />}
              <MenuItem label="Move tab to new window" disabled={tabs.length < 2} onClick={() => { close(); void window.dash.windowControls.moveTab(menu.tabId); }} />
              <MenuSep />
              <MenuItem label="Reload" hint={`${mod}R`} onClick={() => { close(); void window.dash.tabs.reload(menu.tabId); }} />
              <MenuItem label="Duplicate" onClick={() => { close(); duplicateTab(menu.tabId); }} />
              <MenuItem label={menuTab.isPinned ? 'Unpin' : 'Pin'} onClick={() => { close(); togglePin(menu.tabId); }} />
              <MenuItem label={menuTab.isMuted ? 'Unmute site' : 'Mute site'} onClick={() => { close(); toggleMute(menu.tabId); }} />
              <MenuSep />
              <MenuItem label={vertical ? 'Show tabs horizontally' : 'Show tabs vertically'} onClick={() => { close(); setSetting('verticalTabs', !vertical); }} />
              <MenuSep />
              <MenuItem label="Close" hint={`${mod}W`} onClick={() => { close(); closeTab(menu.tabId); }} />
              <MenuItem label="Close other tabs" disabled={others.length === 0} onClick={() => { close(); others.forEach((t) => closeTab(t.id)); }} />
              <MenuItem label="Close tabs to the right" disabled={right.length === 0} onClick={() => { close(); right.forEach((t) => closeTab(t.id)); }} />
            </div>
          </>
        );
      })()}
    </div>
    {containerMenu && (
      <>
        <div className="fixed inset-0 z-40" onClick={() => setContainerMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContainerMenu(null); }} />
        <div
          role="menu"
          aria-label="New container tab"
          className="fixed z-50 min-w-[190px] py-1 rounded-lg bg-surface-elevated border border-border/70 shadow-xl text-[13px]"
          style={{ left: containerMenu.x, top: containerMenu.y }}
        >
          {containers.length === 0 && <div className="px-3 py-2 text-text-tertiary text-[12px]">No containers yet</div>}
          {containers.map((c) => (
            <button
              key={c.id}
              role="menuitem"
              className="w-full flex items-center gap-2 px-3 h-8 text-left text-text-primary hover:bg-surface-hover"
              onClick={() => {
                setContainerMenu(null);
                void window.dash.tabs.create(undefined, false, c.id);
              }}
            >
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: CONTAINER_HEX[c.color] }} />
              <span className="truncate">{c.name}</span>
            </button>
          ))}
          <div className="my-1 border-t border-border/60" />
          <button
            role="menuitem"
            className="w-full px-3 h-8 text-left text-text-secondary hover:bg-surface-hover"
            onClick={() => {
              setContainerMenu(null);
              localStorage.setItem('dash-settings-category', 'privacy');
              void window.dash.tabs.create('dash://settings');
            }}
          >
            Manage containers…
          </button>
        </div>
      </>
    )}
    {vertical && (
      <aside
        aria-label="Tabs"
        className="absolute left-0 top-10 bottom-0 z-10 flex flex-col border-r border-border/60 bg-surface select-none"
        style={{ width: collapsed ? VERTICAL_TABS_WIDTH_COLLAPSED : VERTICAL_TABS_WIDTH }}
      >
        <div ref={vListRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden no-scrollbar p-1.5 flex flex-col gap-0.5">
          {tabItems}
        </div>
        <button
          onClick={() => setSetting('verticalTabsCollapsed', !collapsed)}
          className="m-1.5 h-7 flex items-center justify-center rounded-md text-text-secondary hover:bg-surface-hover hover:text-text-primary text-[12px] transition-colors"
          aria-label={collapsed ? 'Expand tab list' : 'Collapse tab list'}
          title={collapsed ? 'Expand tab list' : 'Collapse tab list'}
        >
          {collapsed ? '»' : '« Collapse'}
        </button>
      </aside>
    )}
    </>
  );
}

function MenuItem({ label, onClick, hint, disabled }: { label: string; onClick: () => void; hint?: string; disabled?: boolean }) {
  return (
    <button
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className="w-full flex items-center justify-between gap-6 text-left px-4 h-9 text-[13.5px] text-text-primary hover:bg-surface-hover disabled:opacity-40 disabled:hover:bg-transparent transition-colors"
    >
      <span>{label}</span>
      {hint && <span className="text-[11.5px] text-text-tertiary">{hint}</span>}
    </button>
  );
}

function MenuSep() {
  return <div role="separator" className="h-px bg-border/70 my-1.5" />;
}

interface TabChipProps {
  /** Inactive tab too narrow for a title: icon only. */
  compact?: boolean;
  tab: TabState;
  isActive: boolean;
  onClick: () => void;
  onClose: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDragStart: () => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  vertical?: boolean;
  collapsed?: boolean;
  /** Which half of a split-view pair this tab is (the two are drawn as one joined pill). */
  splitSide?: 'first' | 'second';
}

function TabChip({ vertical, collapsed, compact, splitSide, tab, isActive, onClick, onClose, onContextMenu, onDragStart, onDragEnd, onDragOver, onDrop }: TabChipProps) {
  // A favicon URL that fails to load (e.g. the default /favicon.ico returns 404) must fall back to the placeholder, not leave a blank gap.
  const [brokenIcon, setBrokenIcon] = useState<string | null>(null);
  const iconOk = !!tab.favicon && tab.favicon !== brokenIcon;
  return (
    <div
      draggable
      data-active-tab={isActive ? 'true' : undefined}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      // Switch on press (not on release), like Chrome, so the tab feels instant; middle-click closes it.
      onMouseDown={(e) => { if (e.button === 0 && !(e.target as HTMLElement).closest('button')) onClick(); }}
      onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); onClose(); } }}
      onClick={(e) => { if (e.detail === 0) onClick(); }}
      onContextMenu={onContextMenu}
      className={`group relative overflow-hidden flex items-center gap-2.5 h-[36px] px-3.5 cursor-pointer transition-[background-color,color,opacity,transform] duration-150 active:scale-[0.985] ${vertical ? 'rounded-lg w-full shrink-0' : splitSide === 'first' ? 'rounded-l-xl rounded-r-none' : splitSide === 'second' ? 'rounded-r-xl rounded-l-none' : 'rounded-t-lg'}
        ${vertical ? (collapsed ? 'justify-center px-0' : '') : tab.isPinned ? 'min-w-[40px] w-10 shrink-0 justify-center px-0' : `${isActive ? 'min-w-[140px]' : compact ? 'min-w-[34px] justify-center px-0' : 'min-w-[54px]'} max-w-[260px] flex-[1_1_240px]`}
        ${splitSide ? `${isActive ? 'bg-surface-hover text-text-primary' : 'bg-surface-elevated text-text-secondary hover:text-text-primary'} border-y border-accent/40 ${splitSide === 'first' ? 'border-l mr-0' : 'border-r border-l-0 -ml-px'}` : isActive ? 'bg-surface-elevated text-text-primary' : 'bg-transparent text-text-secondary hover:bg-surface-hover'}
        dash-tab-enter ${tab.isPrivate ? 'ring-1 ring-inset ring-purple-500/30' : ''}
        ${tab.isSleeping ? 'opacity-60' : ''}`}
      title={`${tab.title || 'New Tab'}${tab.container ? ` — container: ${tab.container.name}` : ''}`}
      style={
        tab.group || tab.container
          ? {
              boxShadow: [
                tab.group ? (vertical ? `inset 3px 0 0 ${GROUP_HEX[tab.group.color]}` : `inset 0 2px 0 ${GROUP_HEX[tab.group.color]}`) : null,
                tab.container ? (vertical ? `inset -3px 0 0 ${CONTAINER_HEX[tab.container.color]}` : `inset 0 -2px 0 ${CONTAINER_HEX[tab.container.color]}`) : null,
              ]
                .filter(Boolean)
                .join(', '),
            }
          : undefined
      }
    >
      {!vertical && !splitSide && !isActive && <span aria-hidden="true" className="absolute right-0 top-1/2 -translate-y-1/2 h-3.5 w-px bg-border group-hover:opacity-0 transition-opacity" />}
      {tab.isLoading ? (
        <span className="h-2.5 w-2.5 rounded-full border-[1.5px] border-accent border-t-transparent animate-spin shrink-0" />
      ) : tab.isSleeping ? (
        <span className="text-[10px] shrink-0" title="Sleeping — will reload on click">
          <IconMoon />
        </span>
      ) : iconOk ? (
        <img
          src={tab.favicon ?? undefined}
          alt=""
          className="h-4 w-4 rounded-sm shrink-0 object-cover"
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

      {(vertical ? !collapsed : !tab.isPinned && !(compact && !isActive)) && (
        <span className="truncate text-[13.5px] flex-1 min-w-0 text-left">
          {tab.title || 'New Tab'}
        </span>
      )}

      {tab.isAudible && !tab.isMuted && !collapsed && !tab.isPinned && (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-text-secondary" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-label="Playing sound">
          <path d="M2.5 6v4h2.5l3 2.5v-9L5 6z" fill="currentColor" stroke="none" /><path d="M10.5 5.5a3.5 3.5 0 0 1 0 5M12 3.8a6 6 0 0 1 0 8.4" />
        </svg>
      )}
      {tab.isMuted && !collapsed && (
        <span className="text-[11px] shrink-0" title="Muted">
          <IconMute />
        </span>
      )}

      {!collapsed && (vertical || !tab.isPinned) && !(compact && !isActive) && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className={`${isActive ? 'opacity-100' : 'opacity-0'} group-hover:opacity-100 hover:bg-text-primary/10 active:bg-text-primary/15 rounded-full h-[18px] w-[18px] flex items-center justify-center shrink-0 text-text-secondary hover:text-text-primary transition-[opacity,background-color]`}
          aria-label="Close tab"
        >
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" /></svg>
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
  vertical,
}: {
  vertical?: boolean;
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
      className={`shrink-0 h-6 px-2 rounded-md text-[11px] font-medium text-[#0b0d10] truncate ${vertical ? 'w-full text-left mt-1' : 'mr-0.5 max-w-[120px]'}`}
      style={{ background: hex }}
    >
      {group.name || (group.collapsed ? 'Group' : '')}
      {group.collapsed && count ? ` · ${count}` : ''}
      {!group.name && !group.collapsed ? '\u00A0' : ''}
    </button>
  );
}

function GroupMenu({ state, tabs, onClose }: { state: GroupMenuState; tabs: TabState[]; onClose: () => void }) {
  useEscape(onClose);
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
