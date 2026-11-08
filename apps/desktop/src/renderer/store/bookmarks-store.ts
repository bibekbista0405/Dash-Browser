import { create } from 'zustand';
import type { BookmarkEntry } from '../../shared/ipc-channels';

interface BookmarksStore {
  bookmarks: BookmarkEntry[];
  load: () => Promise<void>;
  subscribe: () => () => void;
  add: (url: string, title: string, faviconUrl?: string | null) => Promise<void>;
  remove: (id: number) => Promise<void>;
  setFolder: (id: number, folder: string | null) => Promise<void>;
  isBookmarked: (url: string) => boolean;
  findByUrl: (url: string) => BookmarkEntry | undefined;
}

export const useBookmarksStore = create<BookmarksStore>((set, get) => ({
  bookmarks: [],

  load: async () => {
    const bookmarks = await window.dash.bookmarks.list();
    set({ bookmarks });
  },

  /** Main broadcasts a change whenever bookmarks are added/removed/moved/imported from ANY window or page. */
  subscribe: () => window.dash.bookmarks.onChanged(() => void get().load()),

  add: async (url, title, faviconUrl) => {
    await window.dash.bookmarks.add(url, title, faviconUrl);
    await get().load();
  },

  remove: async (id) => {
    await window.dash.bookmarks.remove(id);
    await get().load();
  },

  setFolder: async (id, folder) => {
    await window.dash.bookmarks.setFolder(id, folder);
    await get().load();
  },

  isBookmarked: (url) => get().bookmarks.some((b) => b.url === url),

  findByUrl: (url) => get().bookmarks.find((b) => b.url === url),
}));
