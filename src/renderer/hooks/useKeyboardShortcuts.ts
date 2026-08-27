import { useEffect } from 'react';
import { useTabsStore, activeTabOf } from '../store/tabs-store';

interface ShortcutHandlers {
  onFocusAddressBar: () => void;
  onToggleHistoryPanel: () => void;
  onToggleBookmarksPanel: () => void;
  onToggleCurrentBookmark: () => void;
  onToggleDownloadsPanel: () => void;
  onNewPrivateTab: () => void;
  onNewWindow: () => void;
  onToggleFindBar: () => void;
  onToggleTabSearch: () => void;
  onToggleTaskManager: () => void;
}

/**
 * Standard browser keyboard shortcuts (Cmd on macOS, Ctrl elsewhere).
 * Bound once at the App root; never intercepts keys typed inside the
 * address bar input itself (browser-native undo/redo etc. still work there).
 */
export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  const store = useTabsStore();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

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
          const active = activeTabOf(store);
          if (active) store.closeTab(active.id);
          break;
        }
        case 'l':
          e.preventDefault();
          handlers.onFocusAddressBar();
          break;
        case 'r': {
          e.preventDefault();
          const active = activeTabOf(store);
          if (active) store.reload(active.id);
          break;
        }
        case 'h':
          e.preventDefault();
          handlers.onToggleHistoryPanel();
          break;
        case 'j':
          e.preventDefault();
          handlers.onToggleDownloadsPanel();
          break;
        case 'd':
          e.preventDefault();
          handlers.onToggleCurrentBookmark();
          break;
        case 'o':
          if (e.shiftKey) {
            e.preventDefault();
            handlers.onToggleBookmarksPanel();
          }
          break;
        case 'f':
          e.preventDefault();
          handlers.onToggleFindBar();
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
        case '-': {
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
    return () => document.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
