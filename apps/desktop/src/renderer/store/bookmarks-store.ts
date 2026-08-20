import { create } from 'zustand';
import type { BookmarkEntry } from '../../shared/ipc-channels';

interface BookmarksStore {
  bookmarks: BookmarkEntry[];
  load: () => Promise<void>;
  add: (url: string, title: string, faviconUrl?: string | null) => Promise<void>;
  remove: (id: number) => Promise<void>;
  isBookmarked: (url: string) => boolean;
  findByUrl: (url: string) => BookmarkEntry | undefined;
}

export const useBookmarksStore = create<BookmarksStore>((set, get) => ({
  bookmarks: [],

  load: async () => {
    const bookmarks = await window.dash.bookmarks.list();
    set({ bookmarks });
  },

  add: async (url: string, title: string, faviconUrl?: string | null) => {
    const entry = await window.dash.bookmarks.add(url, title, faviconUrl);
    set((s) => ({ bookmarks: [entry, ...s.bookmarks] }));
  },

  remove: async (id: number) => {
    await window.dash.bookmarks.remove(id);
    set((s) => ({ bookmarks: s.bookmarks.filter((b) => b.id !== id) }));
  },

  isBookmarked: (url: string) => get().bookmarks.some((b) => b.url === url),

  findByUrl: (url: string) => get().bookmarks.find((b) => b.url === url),
}));
