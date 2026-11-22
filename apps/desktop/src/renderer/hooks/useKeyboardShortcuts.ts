import { isAppLockedNow } from '../components/AppLockGate';
import { useEffect, useRef } from 'react';
import { useTabsStore, activeTabOf } from '../store/tabs-store';

interface ShortcutHandlers {
  onFocusAddressBar: () => void;
  onToggleHistoryPanel: () => void;
  onToggleBookmarksPanel: () => void;
  onToggleCurrentBookmark: () => void;
  onToggleDownloadsPanel: () => void;
  onNewPrivateTab: () => void;
  onNewWindow: () => void;
  onToggleTabSearch: () => void;
  onToggleTaskManager: () => void;
  onToggleBookmarksBar: () => void;
  onOpenFind: () => void;
  onFindNext: (forward: boolean) => void;
  onOpenClearData: () => void;
}

/**
 * Standard browser keyboard shortcuts (Cmd on macOS, Ctrl elsewhere).
 * Bound once at the App root; never intercepts keys typed inside the
 * address bar input itself (browser-native undo/redo etc. still work there).
 */
interface ShortcutKey {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  preventDefault: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  // Handlers change every render; keep the latest in a ref. The tab store is
  // read fresh via getState() on every key press — capturing it once at
  // mount would freeze the tab list at its initial (empty) value and break
  // close/reload/zoom/print/Ctrl+1-9 and similar.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const onKeyDown = (e: ShortcutKey) => {
      const handlers = handlersRef.current;
      const store = useTabsStore.getState();
      const mod = e.metaKey || e.ctrlKey;

      if (isAppLockedNow()) return; // locked: only the lock screen takes input
      if (mod && e.altKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        void window.dash.appLock.lock();
        return;
      }

      if (e.key === 'F5') {
        e.preventDefault();
        const active = activeTabOf(store);
        if (active) store.reload(active.id);
        return;
      }


      if (e.key === 'F6' || (e.altKey && !mod && e.key.toLowerCase() === 'd')) {
        e.preventDefault();
        handlers.onFocusAddressBar();
        return;
      }

      if (e.key === 'F3') {
        e.preventDefault();
        handlers.onFindNext(!e.shiftKey);
        return;
      }

      if (e.altKey && !mod && e.key === 'Home') {
        e.preventDefault();
        const active = activeTabOf(store);
        if (active) void window.dash.tabs.goHome(active.id);
        return;
      }

      if (e.key === 'F12') {
        e.preventDefault();
        const active = activeTabOf(store);
        if (active) window.dash.page.toggleDevTools(active.id);
        return;
      }

      if (e.key === 'Escape' && e.shiftKey) {
        e.preventDefault();
        handlers.onToggleTaskManager();
        return;
      }

      // Alt+Left/Right — back/forward. Real Chrome default, separate from
      // the Ctrl-based shortcuts below.
      if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        const active = activeTabOf(store);
        if (active) {
          if (e.key === 'ArrowLeft' && active.canGoBack) store.goBack(active.id);
          if (e.key === 'ArrowRight' && active.canGoForward) store.goForward(active.id);
        }
        return;
      }

      if (!mod) return;

      // Ctrl/Cmd+Tab and Ctrl/Cmd+Shift+Tab — cycle to next/previous tab.
      if (e.key === 'PageUp' || e.key === 'PageDown') {
        e.preventDefault();
        const tabs = store.tabs;
        if (tabs.length < 2) return;
        const currentIndex = tabs.findIndex((t) => t.isActive);
        const delta = e.key === 'PageUp' ? -1 : 1;
        store.switchTab(tabs[(currentIndex + delta + tabs.length) % tabs.length].id);
        return;
      }

      if (e.shiftKey && e.key === 'Delete') {
        e.preventDefault();
        handlers.onOpenClearData();
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        const tabs = store.tabs;
        if (tabs.length < 2) return;
        const currentIndex = tabs.findIndex((t) => t.isActive);
        const delta = e.shiftKey ? -1 : 1;
        const nextIndex = (currentIndex + delta + tabs.length) % tabs.length;
        store.switchTab(tabs[nextIndex].id);
        return;
      }

      // Ctrl/Cmd+1 through 8 jump to that tab position; 9 always jumps to
      // the last tab — this is Chrome's exact behavior, not "tab 9".
      if (/^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const tabs = store.tabs;
        if (tabs.length === 0) return;
        const index = e.key === '9' ? tabs.length - 1 : Number(e.key) - 1;
        if (tabs[index]) store.switchTab(tabs[index].id);
        return;
      }

      switch (e.key.toLowerCase()) {
        case '/':
          e.preventDefault();
          window.dispatchEvent(new Event('dash:shortcuts-help'));
          break;
        case 'n':
          e.preventDefault();
          if (e.shiftKey) handlers.onNewPrivateTab();
          else handlers.onNewWindow();
          break;
        case 't':
          e.preventDefault();
          if (e.shiftKey) store.reopenClosedTab();
          else store.createTab();
          break;
        case 'w': {
          e.preventDefault();
          if (e.shiftKey) {
            void window.dash.windowControls.close();
            break;
          }
          const active = activeTabOf(store);
          if (active) store.closeTab(active.id);
          break;
        }
        case 'l':
        case 'k':
        case 'e':
          e.preventDefault();
          handlers.onFocusAddressBar();
          break;
        case 'g':
          e.preventDefault();
          handlers.onFindNext(!e.shiftKey);
          break;
        case 'r': {
          e.preventDefault();
          const active = activeTabOf(store);
          if (!active) break;
          if (e.shiftKey) window.dash.page.toggleReader(active.id);
          else store.reload(active.id);
          break;
        }
        case 'h':
          e.preventDefault();
          handlers.onToggleHistoryPanel();
          break;
        case 'd':
          e.preventDefault();
          handlers.onToggleCurrentBookmark();
          break;
        case 'b':
          if (e.shiftKey) {
            e.preventDefault();
            handlers.onToggleBookmarksBar();
          }
          break;
        case 'o':
          if (e.shiftKey) {
            e.preventDefault();
            handlers.onToggleBookmarksPanel();
          }
          break;
        case 'f':
          e.preventDefault();
          handlers.onOpenFind();
          break;
        case 'a':
          if (e.shiftKey) {
            e.preventDefault();
            handlers.onToggleTabSearch();
          }
          break;
        case 'p': {
          e.preventDefault();
          const active = activeTabOf(store);
          if (active) window.dash.page.print(active.id);
          break;
        }
        case 's': {
          e.preventDefault();
          const active = activeTabOf(store);
          if (active) window.dash.page.save(active.id);
          break;
        }
        case 'j':
          if (e.shiftKey) {
            e.preventDefault();
            const active = activeTabOf(store);
            if (active) window.dash.page.toggleDevTools(active.id);
            break;
          }
          e.preventDefault();
          handlers.onToggleDownloadsPanel();
          break;
        case 'i':
          if (e.shiftKey) {
            e.preventDefault();
            const active = activeTabOf(store);
            if (active) window.dash.page.toggleDevTools(active.id);
          }
          break;
        case '=':
        case '+': {
          e.preventDefault();
          const active = activeTabOf(store);
          if (active) window.dash.zoom.in(active.id);
          break;
        }
        case '-':
        case '_': {
          e.preventDefault();
          const active = activeTabOf(store);
          if (active) window.dash.zoom.out(active.id);
          break;
        }
        case '0': {
          e.preventDefault();
          const active = activeTabOf(store);
          if (active) window.dash.zoom.reset(active.id);
          break;
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    // Keys pressed while a web page has focus are intercepted in the main process and forwarded here.
    const offForwarded = window.dash.shortcuts.onKey((k) => onKeyDown({ ...k, preventDefault: () => undefined }));
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      offForwarded();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
