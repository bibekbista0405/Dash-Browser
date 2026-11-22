import { create } from 'zustand';
import type { HistoryEntry } from '../../shared/ipc-channels';

interface HistoryStore {
  entries: HistoryEntry[];
  searchTerm: string;
  isLoading: boolean;
  search: (term: string) => Promise<void>;
  deleteEntry: (id: number) => Promise<void>;
  clearAll: () => Promise<void>;
}

export const useHistoryStore = create<HistoryStore>((set, get) => ({
  entries: [],
  searchTerm: '',
  isLoading: false,

  search: async (term: string) => {
    set({ isLoading: true, searchTerm: term });
    const entries = await window.dash.history.query(term);
    // Guard against out-of-order responses if the user typed again quickly.
    if (get().searchTerm === term) {
      set({ entries, isLoading: false });
    }
  },

  deleteEntry: async (id: number) => {
    await window.dash.history.delete(id);
    set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
  },

  clearAll: async () => {
    await window.dash.history.clear();
    set({ entries: [] });
  },
}));
