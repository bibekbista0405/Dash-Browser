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

      if (!mod) return;

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
          if (e.shiftKey) handlers.onToggleBookmarksPanel();
          else handlers.onToggleCurrentBookmark();
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
