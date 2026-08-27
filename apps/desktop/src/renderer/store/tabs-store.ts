import { create } from 'zustand';
import type { TabState } from '../../shared/ipc-channels';

interface TabsStore {
  tabs: TabState[];
  activeTabId: string | null;
  initialize: () => Promise<void>;
  createTab: (isPrivate?: boolean) => Promise<void>;
  closeTab: (id: string) => Promise<void>;
  switchTab: (id: string) => Promise<void>;
  navigate: (id: string, url: string) => Promise<void>;
  goBack: (id: string) => Promise<void>;
  goForward: (id: string) => Promise<void>;
  goHome: (id: string) => Promise<void>;
  reload: (id: string) => Promise<void>;
  stop: (id: string) => Promise<void>;
  duplicateTab: (id: string) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
  toggleMute: (id: string) => Promise<void>;
  reopenClosedTab: () => Promise<void>;
  reorderTabs: (orderedIds: string[]) => Promise<void>;
}

export const useTabsStore = create<TabsStore>((set) => ({
  tabs: [],
  activeTabId: null,

  initialize: async () => {
    const snapshot = await window.dash.tabs.snapshot();
    set({
      tabs: snapshot,
      activeTabId: snapshot.find((t) => t.isActive)?.id ?? null,
    });

    window.dash.tabs.onStateChanged((incoming) => {
      set((s) => {
        const exists = s.tabs.some((t) => t.id === incoming.id);
        const tabs = exists
          ? s.tabs.map((t) => (t.id === incoming.id ? incoming : incoming.isActive ? { ...t, isActive: false } : t))
          : [...s.tabs, incoming];
        return {
          tabs,
          activeTabId: incoming.isActive ? incoming.id : s.activeTabId,
        };
      });
    });
  },

  createTab: async (isPrivate?: boolean) => {
    await window.dash.tabs.create(undefined, isPrivate);
  },

  closeTab: async (id: string) => {
    await window.dash.tabs.close(id);
    set((s) => ({ tabs: s.tabs.filter((t) => t.id !== id) }));
  },

  switchTab: async (id: string) => {
    await window.dash.tabs.switch(id);
  },

  navigate: async (id: string, url: string) => {
    await window.dash.tabs.navigate(id, url);
  },

  goBack: async (id: string) => {
    await window.dash.tabs.goBack(id);
  },

  goForward: async (id: string) => {
    await window.dash.tabs.goForward(id);
  },

  goHome: async (id: string) => {
    await window.dash.tabs.goHome(id);
  },

  reload: async (id: string) => {
    await window.dash.tabs.reload(id);
  },

  stop: async (id: string) => {
    await window.dash.tabs.stop(id);
  },

  duplicateTab: async (id: string) => {
    await window.dash.tabs.duplicate(id);
  },

  togglePin: async (id: string) => {
    await window.dash.tabs.togglePin(id);
  },

  toggleMute: async (id: string) => {
    await window.dash.tabs.toggleMute(id);
  },

  reopenClosedTab: async () => {
    await window.dash.tabs.reopenClosed();
  },

  reorderTabs: async (orderedIds: string[]) => {
    set((s) => {
      const byId = new Map(s.tabs.map((t) => [t.id, t]));
      const reordered = orderedIds.map((id) => byId.get(id)).filter((t): t is TabState => !!t);
      return { tabs: reordered };
    });
    await window.dash.tabs.reorder(orderedIds);
  },
}));

export function activeTabOf(state: { tabs: TabState[]; activeTabId: string | null }): TabState | undefined {
  return state.tabs.find((t) => t.id === state.activeTabId);
}
