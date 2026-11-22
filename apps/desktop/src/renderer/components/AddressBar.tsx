import { IconLock, IconBack, IconForward, IconReload, IconStop, IconHome, IconStar, IconDownload, IconBookmarks, IconHistory, IconSettings, IconMore, IconShield } from './Icons';
import { VpnToolbarButton } from './VpnToolbarButton';
import { SplitMenuButton } from './SplitMenuButton';
import { ExtensionsToolbar } from './ExtensionsToolbar';
import { SitePanel } from './SitePanel';
import { Logo } from './Logo';
import { useEscape } from '../hooks/useEscape';
import { useEffect, useRef, useState } from 'react';
import { useTabsStore, activeTabOf } from '../store/tabs-store';
import { lockDashNow } from './AppLockSettings';
import { useBookmarksStore } from '../store/bookmarks-store';
import type { AddressSuggestion } from '../../shared/ipc-channels';
import { NEW_TAB_URL, SEARCH_ENGINES } from '../../shared/ipc-channels';
import { useDetachesActiveViewWhileOpen } from '../hooks/useDetachesActiveViewWhileOpen';
import { useSettingsStore } from '../store/settings-store';

interface AddressBarProps {
  onOpenHistory: () => void;
  onOpenBookmarks: () => void;
  onOpenDownloads: () => void;
  onOpenSettings: () => void;
  hasActiveDownload: boolean;
  addressInputRef?: React.RefObject<HTMLInputElement>;
}

/** "Private" plus whether the VPN is actually on right now, so a private tab never silently looks safer than it is. */
function PrivateBadge() {
  const [status, setStatus] = useState<string>('off');
  useEffect(() => {
    let live = true;
    window.dash.vpn.getState().then((s) => live && setStatus(s.status));
    const off = window.dash.vpn.onChanged((s) => setStatus(s.status));
    return () => {
      live = false;
      off();
    };
  }, []);
  const on = status === 'on';
  const busy = status === 'connecting';
  return (
    <span
      className="flex items-center gap-1 text-[10px] font-medium text-purple-700 dark:text-purple-300 bg-purple-500/15 px-1.5 py-0.5 rounded shrink-0"
      title={on ? 'Private tab. Your VPN is on.' : busy ? 'Private tab. Connecting your VPN…' : 'Private tab. No VPN is on, so websites and your network can see your address.'}
    >
      Private
      <span className="opacity-60">·</span>
      <span className={on ? 'text-green-600 dark:text-green-400' : busy ? 'text-accent' : 'text-amber-600 dark:text-amber-400'}>
        {on ? 'VPN on' : busy ? 'VPN…' : 'No VPN'}
      </span>
    </span>
  );
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
  const [webSuggestions, setWebSuggestions] = useState<string[]>([]);
  const [touched, setTouched] = useState(false); // suggestions only appear once you type, not when you just click the bar
  const [active, setActive] = useState(-1); // keyboard-highlighted row
  const engineId = useSettingsStore((s) => s.settings.searchEngine);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showZoom, setShowZoom] = useState(false);
  const [showSite, setShowSite] = useState(false);
  useDetachesActiveViewWhileOpen(showSite);
  useEffect(() => setShowSite(false), [activeTab?.id]);
  useDetachesActiveViewWhileOpen(isEditing && touched && draft.trim().length > 0);

  const { isBookmarked, findByUrl, add: addBookmark, remove: removeBookmark } = useBookmarksStore();

  useEffect(() => {
    if (!isEditing) setDraft(activeTab?.url === NEW_TAB_URL ? '' : activeTab?.url ?? '');
  }, [activeTab?.url, isEditing]);

  // Switching tabs must show that tab's own address: drop what was typed for the previous one, close its suggestions,
  // and hand the keyboard back to the page (a fresh empty tab keeps the address bar focused, ready to type).
  useEffect(() => {
    const url = activeTab?.url ?? '';
    const empty = url === '' || url === NEW_TAB_URL;
    setDraft(empty ? '' : url);
    setSuggestions([]);
    setWebSuggestions([]);
    const el = addressInputRef?.current;
    if (el && document.activeElement === el && !empty) {
      el.blur();
      setIsEditing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab?.id]);

  useEffect(() => {
    if (!isEditing || !touched || !draft.trim()) {
      setSuggestions([]);
      setWebSuggestions([]);
      return;
    }
    let live = true;
    const term = draft.trim();
    const timeout = setTimeout(() => {
      window.dash.suggestions.query(term).then((r) => live && setSuggestions(r));
      // Typing a full address is not a search: skip the engine for those.
      if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(term) && !/^\S+\.\S{2,}(\/|$)/.test(term)) {
        window.dash.suggestions.web(term, activeTab?.isPrivate ?? false).then((r) => live && setWebSuggestions(r));
      } else setWebSuggestions([]);
    }, 120);
    return () => { live = false; clearTimeout(timeout); };
  }, [draft, isEditing, touched, activeTab?.isPrivate]);

  useEffect(() => setActive(-1), [draft, suggestions, webSuggestions]);

  const term = draft.trim();
  const looksLikeAddress = /^[a-z][a-z0-9+.-]*:\/\//i.test(term) || (!/\s/.test(term) && /^(localhost|\d{1,3}(\.\d{1,3}){3}|([a-z0-9-]+\.)+[a-z]{2,})(:\d+)?([/?#]|$)/i.test(term));
  type Item = { key: string; kind: 'go' | 'search' | 'bookmark' | 'history' | 'web'; label: string; detail?: string; target: string };
  const items: Item[] = [];
  if (isEditing && touched && term) {
    items.push({ key: 'literal', kind: looksLikeAddress ? 'go' : 'search', label: term, detail: looksLikeAddress ? 'Go to this address' : `Search ${SEARCH_ENGINES[engineId]?.label ?? 'the web'}`, target: term });
    for (const s of suggestions.slice(0, 4)) items.push({ key: `l:${s.url}`, kind: s.type === 'bookmark' ? 'bookmark' : 'history', label: s.title || s.url, detail: s.url, target: s.url });
    const seen = new Set(items.map((i) => i.label.toLowerCase()));
    for (const w of webSuggestions) {
      if (items.length >= 10) break;
      if (seen.has(w.toLowerCase())) continue;
      seen.add(w.toLowerCase());
      items.push({ key: `w:${w}`, kind: 'web', label: w, target: w });
    }
  }
  const listOpen = items.length > 0;

  if (!activeTab) return <div className="h-[44px]" />;

  const navigateTo = (url: string) => {
    store.navigate(activeTab.id, url);
    setIsEditing(false);
    setSuggestions([]);
    setWebSuggestions([]);
    (document.activeElement as HTMLElement)?.blur();
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const picked = active >= 0 ? items[active] : undefined;
    if (picked) navigateTo(picked.target);
    else if (draft.trim()) navigateTo(draft.trim());
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && listOpen) {
      e.preventDefault();
      setActive((i) => (i + 1) % items.length);
    } else if (e.key === 'ArrowUp' && listOpen) {
      e.preventDefault();
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (e.key === 'Escape') {
      // first Escape closes the list, the next gives the bar back its address and leaves it
      if (listOpen) { setTouched(false); setActive(-1); }
      else { setDraft(activeTab?.url === NEW_TAB_URL ? '' : activeTab?.url ?? ''); e.currentTarget.blur(); }
    }
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
    <div className="app-no-drag relative flex items-center gap-1.5 h-[44px] px-3">
      <NavButton disabled={!activeTab.canGoBack} onClick={() => store.goBack(activeTab.id)} label="Back">
        <IconBack />
      </NavButton>
      <NavButton disabled={!activeTab.canGoForward} onClick={() => store.goForward(activeTab.id)} label="Forward">
        <IconForward />
      </NavButton>
      <NavButton
        onClick={() => (activeTab.isLoading ? store.stop(activeTab.id) : store.reload(activeTab.id))}
        label={activeTab.isLoading ? 'Stop' : 'Reload'}
      >
        {activeTab.isLoading ? <IconStop /> : <IconReload />}
      </NavButton>
      <NavButton onClick={() => store.goHome(activeTab.id)} label="Home">
        <IconHome />
      </NavButton>

      <form onSubmit={submit} className="flex-1 relative">
        <div className="flex items-center gap-2 h-[34px] px-4 rounded-full bg-surface border border-transparent hover:border-border/60 focus-within:border-border transition-colors">
          {activeTab.isPrivate && <PrivateBadge />}
          {activeTab.blockedCount > 0 && (
            <span
              className="flex items-center gap-1 text-[10px] font-medium text-accent bg-accent/15 px-1.5 py-0.5 rounded shrink-0"
              title={`${activeTab.blockedCount} ad/tracker request${activeTab.blockedCount === 1 ? '' : 's'} blocked on this page`}
            >
              <IconShield /> {activeTab.blockedCount}
            </span>
          )}
          <SecurityBadge url={activeTab.url} onClick={() => setShowSite((v) => !v)} expanded={showSite} />
          <input
            ref={addressInputRef}
            value={draft}
            onChange={(e) => { setDraft(e.target.value); setTouched(true); }}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded={listOpen}
            aria-controls="address-suggestions"
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `address-opt-${active}` : undefined}
            onFocus={(e) => {
              setIsEditing(true);
              setTouched(false);
              e.target.select();
            }}
            onBlur={() => setTimeout(() => setIsEditing(false), 120)}
            placeholder="Search or enter address"
            className="flex-1 bg-transparent outline-none text-[13px] text-text-primary placeholder:text-text-tertiary"
            spellCheck={false}
          />
        </div>
        {showSite && activeTab && <SitePanel tab={activeTab} onClose={() => setShowSite(false)} />}

        {listOpen && (
          <div id="address-suggestions" role="listbox" className="absolute top-11 left-0 right-0 z-40 py-1 rounded-lg bg-surface-elevated border border-border shadow-2xl overflow-hidden">
            {items.map((it, i) => (
              <button
                key={it.key}
                id={`address-opt-${i}`}
                role="option"
                aria-selected={i === active}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  navigateTo(it.target);
                }}
                onMouseEnter={() => setActive(i)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left ${i === active ? 'bg-surface-hover' : ''}`}
              >
                <span className="text-[11px] shrink-0 w-4 flex justify-center text-text-tertiary" aria-hidden>
                  {it.kind === 'bookmark' ? <IconStar filled /> : it.kind === 'history' ? <IconHistory /> : it.kind === 'go' ? '↗' : '🔍'}
                </span>
                <span className="text-[13px] text-text-primary truncate">{it.label}</span>
                {it.detail && <span className="text-[11px] text-text-tertiary truncate ml-auto">{it.detail}</span>}
              </button>
            ))}
          </div>
        )}
      </form>

      {activeTab.webApp && <InstallAppButton tabId={activeTab.id} offer={activeTab.webApp} />}

      {(activeTab.zoomPercent !== 100 || showZoom) && (
        <div className="relative shrink-0">
          <button
            onClick={() => setShowZoom((v) => !v)}
            className="text-[11px] text-text-secondary hover:text-text-primary px-1.5 h-7 rounded hover:bg-surface-hover"
            title="Page zoom"
            aria-label={`Page zoom ${activeTab.zoomPercent}%`}
          >
            🔍 {activeTab.zoomPercent}%
          </button>
          {showZoom && <ZoomPopover tabId={activeTab.id} percent={activeTab.zoomPercent} onClose={() => setShowZoom(false)} />}
        </div>
      )}

      <NavButton onClick={toggleBookmark} label={bookmarked ? 'Remove bookmark' : 'Bookmark this page'}>
        <span className={bookmarked ? 'text-accent' : ''}><IconStar filled={bookmarked} /></span>
      </NavButton>
      <NavButton onClick={onOpenDownloads} label="Show downloads">
        <span className="relative">
          <IconDownload />
          {hasActiveDownload && (
            <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
          )}
        </span>
      </NavButton>
      <NavButton onClick={onOpenBookmarks} label="Show bookmarks">
        <IconBookmarks />
      </NavButton>
      <NavButton onClick={onOpenHistory} label="Show history">
        <IconHistory />
      </NavButton>
      <SplitMenuButton />
      <ExtensionsToolbar onManage={onOpenSettings} />
      <VpnToolbarButton onOpenSettings={onOpenSettings} />
      <NavButton onClick={onOpenSettings} label="Settings">
        <IconSettings />
      </NavButton>

      <div className="relative">
        <NavButton onClick={() => setShowMoreMenu((v) => !v)} label="More actions">
          <IconMore />
        </NavButton>
        {showMoreMenu && (
          <MoreMenu
            tabId={activeTab.id}
            percent={activeTab.zoomPercent}
            splitOn={activeTab.inSplit}
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
  percent,
  splitOn,
  onClose,
  onOpenHistory,
  onOpenBookmarks,
  onOpenDownloads,
  onOpenSettings,
}: {
  tabId: string;
  percent: number;
  splitOn: boolean;
  onClose: () => void;
  onOpenHistory: () => void;
  onOpenBookmarks: () => void;
  onOpenDownloads: () => void;
  onOpenSettings: () => void;
}) {
  useEscape(onClose);
  useDetachesActiveViewWhileOpen(true);
  const ref = useRef<HTMLDivElement>(null);
  const isMac = navigator.platform.toLowerCase().includes('mac');
  const mod = isMac ? '⌘' : 'Ctrl';
  const [apps, setApps] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => { void window.dash.webApps.list().then(setApps).catch(() => undefined); }, []);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [onClose]);

  // Keyboard: focus the first item on open, arrows/Home/End move, Tab is kept inside until Esc/selection.
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
  }, []);
  const onMenuKey = (e: React.KeyboardEvent) => {
    const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    if (items.length === 0) return;
    const i = items.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (e.key === 'ArrowDown') next = (i + 1) % items.length;
    else if (e.key === 'ArrowUp') next = (i - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    else if (e.key === 'Tab') next = e.shiftKey ? (i - 1 + items.length) % items.length : (i + 1) % items.length;
    if (next >= 0) { e.preventDefault(); items[next].focus(); }
  };

  const item = (label: string, onClick: () => void, shortcut?: string) => (
    <button
      role="menuitem"
      onClick={() => {
        onClick();
        onClose();
      }}
      className="w-full flex items-center justify-between px-4 h-9 text-[13.5px] text-text-primary hover:bg-surface-hover transition-colors"
    >
      <span>{label}</span>
      {shortcut && <span className="text-[11px] text-text-tertiary">{shortcut}</span>}
    </button>
  );

  const divider = <div className="h-px bg-border my-1" />;

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="More actions"
      onKeyDown={onMenuKey}
      className="absolute right-0 top-9 z-50 w-64 max-h-[calc(100vh-64px)] overflow-y-auto py-1 rounded-lg bg-surface-elevated border border-border shadow-2xl"
    >
      {item('New tab', () => useTabsStore.getState().createTab(), `${mod}+T`)}
      {item('New window', () => window.dash.windowControls.new(), `${mod}+N`)}
      {item('New private tab', () => useTabsStore.getState().createTab(true), `${mod}+Shift+N`)}
      {divider}
      {item('Lock DASH…', () => void lockDashNow(), `${mod}+Alt+L`)}
      {apps.length > 0 && divider}
      {apps.map((a) => item(`App: ${a.name}`, () => void window.dash.webApps.launch(a.id)))}
      {item('Keyboard shortcuts', () => window.dispatchEvent(new Event('dash:shortcuts-help')), `${mod}+/`)}
      {divider}
      {item('History', onOpenHistory, `${mod}+H`)}
      {item('Downloads', onOpenDownloads, `${mod}+J`)}
      {item('Bookmarks', onOpenBookmarks, `${mod}+Shift+O`)}
      {divider}
      <div className="flex items-center justify-between px-3 py-1.5">
        <span className="text-[13px] text-text-primary">Zoom</span>
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-text-tertiary w-9 text-right">{percent}%</span>
          <button
            role="menuitem"
            aria-label="Zoom out"
            onClick={() => window.dash.zoom.out(tabId)}
            className="h-6 w-6 flex items-center justify-center rounded hover:bg-surface text-text-secondary"
          >
            −
          </button>
          <button
            role="menuitem"
            aria-label="Reset zoom"
            onClick={() => window.dash.zoom.reset(tabId)}
            className="h-6 w-6 flex items-center justify-center rounded hover:bg-surface text-text-secondary text-[11px]"
            title="Reset zoom"
          >
            ⟲
          </button>
          <button
            role="menuitem"
            aria-label="Zoom in"
            onClick={() => window.dash.zoom.in(tabId)}
            className="h-6 w-6 flex items-center justify-center rounded hover:bg-surface text-text-secondary"
          >
            +
          </button>
        </div>
      </div>
      {divider}
      {item('Print…', () => window.dash.page.print(tabId), `${mod}+P`)}
      {item('Translate page…', () => window.dash.page.translate(tabId))}
      {item('Print preview', () => window.dash.page.printPreview(tabId))}
      {item('Save as PDF…', () => window.dash.page.savePdf(tabId))}
      {item('Save for offline', () => { void window.dash.archive.save(tabId).catch((e: unknown) => window.alert(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'Could not save the page')); })}
      {item('Saved pages', () => window.dash.tabs.create('dash://archive'))}
      {item('Save page as…', () => window.dash.page.save(tabId), `${mod}+S`)}
      {item('Find in page…', () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: !isMac, metaKey: isMac })), `${mod}+F`)}
      {divider}
      {item(splitOn ? 'Close split view' : 'Split view', () => { if (splitOn) void window.dash.split.close(); else void window.dash.split.open(); })}
      {splitOn && item('Swap panes', () => { void window.dash.split.swap(); })}
      {item('AI helper', () => window.dash.sidePanel.toggle('ai'))}
      {item('Quick notes', () => window.dash.sidePanel.toggle('notes'))}
      {item('Reading mode', () => window.dash.page.toggleReader(tabId), `${mod}+Shift+R`)}
      {item('Developer tools', () => window.dash.page.toggleDevTools(tabId), 'F12')}
      {item('Settings', onOpenSettings)}
    </div>
  );
}

function InstallAppButton({ tabId, offer }: { tabId: string; offer: NonNullable<ReturnType<typeof activeTabOf>>['webApp'] & object }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEscape(() => setOpen(false));
  useDetachesActiveViewWhileOpen(open);
  useEffect(() => { setOpen(false); setNote(''); }, [tabId]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  const installed = !!offer.installedId;
  const install = async () => {
    setBusy(true);
    const r = await window.dash.webApps.install(tabId);
    setBusy(false);
    if (!r.ok) { setNote(r.error ?? 'Could not install this app.'); return; }
    setOpen(false);
    if (r.id) void window.dash.webApps.launch(r.id);
  };
  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={installed ? `Open ${offer.name} as an app` : `Install ${offer.name}`}
        title={installed ? `Open ${offer.name} as an app` : `Install ${offer.name}`}
        aria-expanded={open}
        className="dash-tab-enter h-8 w-8 flex items-center justify-center rounded-md text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="4" width="18" height="13" rx="2.5" /><path d="M8 21h8M12 17v4" /><path d="M12 7.5v5M9.8 10.5 12 12.7l2.2-2.2" />
        </svg>
      </button>
      {open && (
        <div role="dialog" aria-label="Install app" className="dash-pop absolute right-0 top-10 z-50 w-[300px] p-4 rounded-xl bg-surface-elevated border border-border shadow-2xl">
          <div className="flex items-center gap-3">
            <img src={offer.icon} alt="" className="h-12 w-12 rounded-xl object-cover bg-surface" />
            <div className="min-w-0">
              <div className="text-[14px] font-semibold text-text-primary truncate">{installed ? 'Open as app' : 'Install app?'}</div>
              <div className="text-[12px] text-text-secondary truncate">{offer.name}</div>
              <div className="text-[11px] text-text-tertiary truncate">{(() => { try { return new URL(offer.startUrl).host; } catch { return ''; } })()}</div>
            </div>
          </div>
          <p className="mt-3 text-[12px] text-text-secondary leading-relaxed">
            {installed
              ? 'This site is installed. It opens in its own window, without tabs or the address bar.'
              : 'It opens in its own window, without tabs or the address bar, and gets Start Menu and Desktop shortcuts on Windows.'}
          </p>
          {note && <p role="alert" className="mt-2 text-[12px] text-red-500">{note}</p>}
          <div className="mt-3 flex justify-end gap-2">
            <button className="h-8 px-3 rounded-lg text-[13px] text-text-secondary hover:bg-surface-hover" onClick={() => setOpen(false)}>Cancel</button>
            <button
              disabled={busy}
              className="h-8 px-4 rounded-lg text-[13px] font-medium bg-accent text-surface hover:opacity-90 disabled:opacity-50"
              onClick={() => (installed ? (void window.dash.webApps.launch(offer.installedId!), setOpen(false)) : void install())}
            >
              {busy ? 'Installing…' : installed ? 'Open' : 'Install'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ZoomPopover({ tabId, percent, onClose }: { tabId: string; percent: number; onClose: () => void }) {
  useEscape(onClose);
  useDetachesActiveViewWhileOpen(true);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.parentElement?.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);
  const btn = 'h-7 min-w-7 px-2 flex items-center justify-center rounded hover:bg-surface text-text-secondary text-[13px]';
  return (
    <div ref={ref} className="absolute right-0 top-9 z-50 flex items-center gap-1 p-1.5 rounded-lg bg-surface-elevated border border-border shadow-2xl">
      <button aria-label="Zoom out" className={btn} onClick={() => window.dash.zoom.out(tabId)}>−</button>
      <span className="text-[12px] text-text-primary w-11 text-center tabular-nums">{percent}%</span>
      <button aria-label="Zoom in" className={btn} onClick={() => window.dash.zoom.in(tabId)}>+</button>
      <button className={`${btn} text-[11px]`} onClick={() => window.dash.zoom.reset(tabId)}>Reset</button>
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
      title={label}
      className="h-[34px] w-[34px] flex items-center justify-center rounded-full text-lg leading-none
        text-text-secondary hover:text-text-primary hover:bg-surface-hover
        disabled:opacity-30 disabled:hover:bg-transparent transition-[background-color,color,opacity,transform] active:scale-90 disabled:active:scale-100"
    >
      {children}
    </button>
  );
}

/** Honest connection indicator: a lock only for https, a warning for http, our logo for DASH's own pages. */
function SecurityBadge({ url, onClick, expanded }: { url: string; onClick: () => void; expanded: boolean }) {
  const inner = <SecurityBadgeIcon url={url} />;
  if (!inner) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Site information"
      aria-expanded={expanded}
      className="shrink-0 rounded hover:bg-surface-hover px-0.5 -mx-0.5 flex items-center"
    >
      {inner}
    </button>
  );
}

function SecurityBadgeIcon({ url }: { url: string }) {
  if (url.startsWith('https://')) {
    return (
      <span className="text-accent text-xs shrink-0" title="Secure connection (HTTPS)">
        <IconLock />
      </span>
    );
  }
  if (url.startsWith('http://')) {
    return (
      <span
        className="text-[10px] font-medium text-amber-500 bg-amber-500/15 px-1.5 py-0.5 rounded shrink-0"
        title="This connection is not encrypted. Don't enter passwords or personal details."
      >
        Not secure
      </span>
    );
  }
  if (url.startsWith('dash://')) {
    return <Logo size={14} className="text-text-secondary" />;
  }
  if (url.startsWith('file://')) {
    return <span className="text-[10px] text-text-tertiary shrink-0">File</span>;
  }
  return null;
}
