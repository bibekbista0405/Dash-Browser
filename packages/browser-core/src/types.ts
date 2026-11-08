/**
 * The shape of a browser tab, independent of how any given platform renders
 * or hosts it (Electron WebContentsView today; a native WebView on
 * Android/iOS later). Platform layers translate their own native state into
 * this shape.
 */
export const TAB_GROUP_COLORS = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'] as const;
export type TabGroupColor = (typeof TAB_GROUP_COLORS)[number];

export interface TabGroup {
  id: string;
  name: string;
  color: TabGroupColor;
  collapsed: boolean;
}

export interface TabState {
  /** The group this tab belongs to, or null. Groups live for the session only. */
  group: TabGroup | null;
  id: string;
  title: string;
  url: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  favicon: string | null;
  isActive: boolean;
  isPrivate: boolean;
  isSleeping: boolean;
  blockedCount: number;
  isPinned: boolean;
  isMuted: boolean;
  zoomPercent: number;
}

export interface HistoryEntry {
  id: number;
  url: string;
  title: string;
  /** Captured straight from the page's own <link rel="icon"> — never a third-party favicon service. */
  faviconUrl: string | null;
  visitedAt: number; // epoch ms
}

export interface BookmarkEntry {
  id: number;
  url: string;
  title: string;
  faviconUrl: string | null;
  createdAt: number;
  folder: string | null;
}

export type DownloadState = 'progressing' | 'paused' | 'completed' | 'cancelled' | 'interrupted';

export interface DownloadEntry {
  id: number;
  filename: string;
  url: string;
  savePath: string;
  totalBytes: number;
  receivedBytes: number;
  state: DownloadState;
  startedAt: number;
  canPause: boolean;
  canResume: boolean;
}

export interface BlockedHostStat {
  host: string;
  category: 'ad' | 'tracker';
  count: number;
  lastAt: number;
}

export interface BlockStats {
  lifetimeTotal: number;
  /** Per-category totals recorded since the per-host report began (normal tabs only). */
  byCategory: { ad: number; tracker: number };
  /** Most-blocked hosts, highest count first. Private-tab blocks are never recorded here. */
  topHosts: BlockedHostStat[];
}

export interface PasswordEntry {
  id: number;
  origin: string;
  username: string;
  /** Never sent to the renderer except on an explicit user-initiated reveal/copy. */
  password?: string;
  createdAt: number;
}

export type PermissionName = 'notifications' | 'geolocation' | 'camera' | 'microphone' | 'clipboard-read';
export type PermissionDecision = 'granted' | 'denied';

export interface PermissionRecord {
  id: number;
  origin: string;
  permission: PermissionName;
  decision: PermissionDecision;
  updatedAt: number;
}

export interface ClosedTabRecord {
  url: string;
  title: string;
  closedAt: number;
}

export interface AddressSuggestion {
  type: 'history' | 'bookmark';
  url: string;
  title: string;
  faviconUrl: string | null;
}

export interface FindResult {
  activeMatchOrdinal: number;
  matches: number;
}

export interface ExtensionInfo {
  id: string;
  name: string;
  version: string;
  folderPath: string;
}

export interface TaskProcessInfo {
  pid: number;
  type: string;
  /** Human label — the tab title for a renderer process, or a generic description for browser/GPU/utility processes. */
  label: string;
  memoryMB: number;
  cpuPercent: number;
}
