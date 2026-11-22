/**
 * Single source of truth for IPC channel names — this file is intentionally
 * Electron-specific (IPC is a transport concept, not a browser-domain one)
 * and lives in apps/desktop rather than @dash/browser-core. Everything
 * else below is re-exported from the platform-independent package so every
 * existing import of "../../shared/ipc-channels" keeps working unchanged.
 */
export * from '@dash/browser-core';
import type { PermissionRecord } from '@dash/browser-core';

export const IPC = {
  ARCHIVE_SAVE: 'archive:save',
  ARCHIVE_LIST: 'archive:list',
  ARCHIVE_OPEN: 'archive:open',
  ARCHIVE_DELETE: 'archive:delete',
  ARCHIVE_CHANGED: 'archive:changed',
  NOTES_LIST: 'notes:list',
  NOTES_SAVE: 'notes:save',
  NOTES_DELETE: 'notes:delete',
  NOTES_CHANGED: 'notes:changed',
  UPDATE_STATUS: 'update:status',
  UPDATE_CHECK: 'update:check',
  UPDATE_INSTALL: 'update:install',
  UPDATE_CHANGED: 'update:changed',
  AI_STATUS: 'ai:status',
  AI_CHAT: 'ai:chat',
  AI_CANCEL: 'ai:cancel',
  AI_EVENT: 'ai:event',
  LAYOUT_DIVIDER: 'layout:divider',
  LAYOUT_DIVIDERS: 'layout:dividers',
  LAYOUT_SPLIT: 'layout:split',
  SPLIT_OPEN: 'split:open',
  SPLIT_CLOSE: 'split:close',
  SPLIT_SWAP: 'split:swap',
  WEBSITE_LOCK_CHANGED: 'website-lock:changed',
  APP_LOCK_STATUS: 'app-lock:status',
  APP_LOCK_ENABLE: 'app-lock:enable',
  APP_LOCK_DISABLE: 'app-lock:disable',
  APP_LOCK_CHANGE: 'app-lock:change',
  APP_LOCK_SET_IDLE: 'app-lock:set-idle',
  APP_LOCK_UNLOCK: 'app-lock:unlock',
  APP_LOCK_LOCK: 'app-lock:lock',
  APP_LOCK_ERASE: 'app-lock:erase',
  APP_LOCK_CHANGED: 'app-lock:changed',
  WEBSITE_LOCK_LIST: 'website-lock:list',
  WEBSITE_LOCK_CURRENT: 'website-lock:current',
  WEBSITE_LOCK_PENDING: 'website-lock:pending',
  WEBSITE_LOCK_UNLOCK_PENDING: 'website-lock:unlock-pending',
  WEBSITE_LOCK_ADD: 'website-lock:add',
  WEBSITE_LOCK_REMOVE: 'website-lock:remove',
  WEBSITE_LOCK_EDIT: 'website-lock:edit',
  WEBSITE_LOCK_ENABLE: 'website-lock:enable',
  WEBSITE_LOCK_CHANGE_PASSWORD: 'website-lock:change-password',
  WEBSITE_LOCK_LOCK: 'website-lock:lock',
  WEBSITE_LOCK_LOCK_ALL: 'website-lock:lock-all',
  WEBSITE_LOCK_RECOVERY_STATUS: 'website-lock:recovery-status',
  WEBSITE_LOCK_RECOVERY_BEGIN: 'website-lock:recovery-begin',
  WEBSITE_LOCK_RECOVERY_CONFIRM: 'website-lock:recovery-confirm',
  WEBSITE_LOCK_RECOVER_SITE: 'website-lock:recover-site',
  WEBSITE_LOCK_RECOVERY_REGENERATE: 'website-lock:recovery-regenerate',
  WEBSITE_LOCK_RESET_REQUEST: 'website-lock:reset-request',
  WEBSITE_LOCK_RESET_SITE: 'website-lock:reset-site',
  WEBSITE_LOCK_RESET_RECOVERY: 'website-lock:reset-recovery',
  WEBSITE_LOCK_SAVE_RECOVERY_KEY: 'website-lock:save-recovery-key',
  WEBSITE_LOCK_BACKUP_EXPORT: 'website-lock:backup-export',
  WEBSITE_LOCK_BACKUP_PREVIEW: 'website-lock:backup-preview',
  WEBSITE_LOCK_BACKUP_APPLY: 'website-lock:backup-apply',
  WEBSITE_LOCK_EVENTS: 'website-lock:events',
  SPLIT_RESET: 'split:reset',
  SIDEPANEL_TOGGLE: 'sidepanel:toggle',
  SIDEPANEL_CLOSE: 'sidepanel:close',
  PAGE_URL_ACTIVE: 'page:url-active',
  TAB_CREATE: 'tab:create',
  TAB_CLOSE: 'tab:close',
  TAB_SWITCH: 'tab:switch',
  TAB_NAVIGATE: 'tab:navigate',
  TAB_GO_BACK: 'tab:go-back',
  TAB_GO_FORWARD: 'tab:go-forward',
  TAB_GO_HOME: 'tab:go-home',
  TAB_RELOAD: 'tab:reload',
  TAB_STOP: 'tab:stop',
  TAB_STATE_CHANGED: 'tab:state-changed', // main -> renderer push
  TABS_SNAPSHOT: 'tabs:snapshot', // renderer requests full list

  HISTORY_QUERY: 'history:query',
  HISTORY_DELETE: 'history:delete',
  HISTORY_CLEAR: 'history:clear',

  BOOKMARK_ADD: 'bookmark:add',
  BOOKMARK_REMOVE: 'bookmark:remove',
  BOOKMARK_LIST: 'bookmark:list',

  DOWNLOAD_LIST: 'download:list',
  DOWNLOAD_CANCEL: 'download:cancel',
  DOWNLOAD_PAUSE: 'download:pause',
  DOWNLOAD_RESUME: 'download:resume',
  DOWNLOAD_REMOVE: 'download:remove',
  DOWNLOAD_OPEN_FILE: 'download:open-file',
  DOWNLOAD_SHOW_IN_FOLDER: 'download:show-in-folder',
  DOWNLOAD_START_DRAG: 'download:start-drag',
  DOWNLOAD_STATE_CHANGED: 'download:state-changed', // main -> renderer push

  SETTINGS_GET_ALL: 'settings:get-all',
  SETTINGS_SET: 'settings:set',
  SETTINGS_RESET: 'settings:reset',
  SETTINGS_STATE_CHANGED: 'settings:state-changed', // main -> renderer push

  BLOCK_STATS_GET: 'block-stats:get',
  BLOCK_STATS_RESET: 'block-stats:reset',

  PRIVACY_CLEAR_BROWSING_DATA: 'privacy:clear-browsing-data',

  EXTENSIONS_LOAD: 'extensions:load',
  EXTENSIONS_INSTALL_STORE: 'extensions:install-store',
  EXTENSIONS_LIST: 'extensions:list',
  EXTENSIONS_REMOVE: 'extensions:remove',
  EXTENSIONS_SET_PINNED: 'extensions:set-pinned',
  EXTENSIONS_OPEN: 'extensions:open',

  TASK_MANAGER_SNAPSHOT: 'task-manager:snapshot',
  TASK_MANAGER_END_PROCESS: 'task-manager:end-process',

  PASSWORD_ADD: 'password:add',
  PASSWORD_LIST: 'password:list',
  PASSWORD_REVEAL: 'password:reveal',
  PASSWORD_REMOVE: 'password:remove',
  PASSWORD_GENERATE: 'password:generate',
  PASSWORDS_IMPORT_CSV: 'passwords:import-csv',
  PASSWORD_SAVE_PROMPT: 'password:save-prompt', // main -> renderer push (detected login form)
  PASSWORD_SAVE_PROMPT_RESPOND: 'password:save-prompt-respond',

  PERMISSION_LIST: 'permission:list',
  PERMISSION_SET: 'permission:set',
  PERMISSION_REMOVE: 'permission:remove',
  PERMISSION_REQUEST_PROMPT: 'permission:request-prompt', // main -> renderer push
  PERMISSION_REQUEST_RESPOND: 'permission:request-respond',

  FIND_IN_PAGE_START: 'find:start',
  FIND_IN_PAGE_NEXT: 'find:next',
  FIND_IN_PAGE_PREV: 'find:prev',
  FIND_IN_PAGE_STOP: 'find:stop',
  FIND_IN_PAGE_RESULT: 'find:result', // main -> renderer push

  ZOOM_IN: 'zoom:in',
  ZOOM_OUT: 'zoom:out',
  ZOOM_RESET: 'zoom:reset',

  TAB_DUPLICATE: 'tab:duplicate',
  TAB_TOGGLE_PIN: 'tab:toggle-pin',
  TAB_SET_GROUP: 'tab:set-group',
  GROUP_UPDATE: 'group:update',
  GROUP_CLOSE: 'group:close',
  TABS_ORDER: 'tabs:order',
  TAB_TOGGLE_MUTE: 'tab:toggle-mute',
  TAB_REOPEN_CLOSED: 'tab:reopen-closed',
  TAB_REORDER: 'tab:reorder',

  PAGE_PRINT: 'page:print',
  PAGE_TRANSLATE: 'page:translate',
  PAGE_PRINT_PREVIEW: 'page:print-preview',
  PAGE_SAVE: 'page:save',
  PAGE_SAVE_PDF: 'page:save-pdf',
  VPN_GET_STATE: 'vpn:get-state',
  VPN_SET_CONFIG: 'vpn:set-config',
  VPN_CONNECT: 'vpn:connect',
  VPN_DISCONNECT: 'vpn:disconnect',
  VPN_TEST: 'vpn:test',
  VPN_CHECK_IP: 'vpn:check-ip',
  VPN_STATE_CHANGED: 'vpn:state-changed',
  TABS_SLEEP_STATS: 'tabs:sleep-stats',
  SPELLCHECK_LANGUAGES: 'spellcheck:languages',
  SITE_INFO: 'site:info',
  SITE_SET_PROTECTION: 'site:set-protection',
  SITE_CLEAR_DATA: 'site:clear-data',
  SITE_ZOOM_LIST: 'site:zoom-list',
  SITE_ZOOM_RESET: 'site:zoom-reset',
  DEVTOOLS_TOGGLE: 'devtools:toggle',
  PAGE_READER: 'page:reader',

  BACKUP_EXPORT: 'backup:export',
  BACKUP_IMPORT: 'backup:import',
  BOOKMARKS_EXPORT: 'bookmarks:export',
  BOOKMARKS_IMPORT: 'bookmarks:import',
  BOOKMARK_SET_FOLDER: 'bookmark:set-folder',
  BOOKMARK_MOVE: 'bookmark:move',
  BOOKMARKS_CHANGED: 'bookmarks:changed', // main -> all windows/internal pages
  IMPORT_DETECT: 'import:detect',
  IMPORT_RUN: 'import:run',

  SUGGESTIONS_QUERY: 'suggestions:query',
  SUGGESTIONS_WEB: 'suggestions:web',

  PROFILES_LIST: 'profiles:list',
  PROFILE_CREATE: 'profiles:create',
  PROFILE_RENAME: 'profiles:rename',
  PROFILE_DELETE: 'profiles:delete',
  PROFILE_OPEN: 'profiles:open',
  CONTAINERS_LIST: 'containers:list',
  CONTAINER_CREATE: 'containers:create',
  CONTAINER_UPDATE: 'containers:update',
  CONTAINER_DELETE: 'containers:delete',
  CONTAINERS_CHANGED: 'containers:changed',
  WINDOW_NEW: 'window:new',
  WINDOW_MOVE_TAB: 'window:move-tab',
  OVERLAY_PUSH: 'overlay:push',
  OVERLAY_POP: 'overlay:pop',
  WEBAPP_INSTALL: 'webapp:install',
  WEBAPP_LIST: 'webapp:list',
  WEBAPP_LAUNCH: 'webapp:launch',
  WEBAPP_UNINSTALL: 'webapp:uninstall',
  OVERLAY_COMMIT: 'overlay:commit',
  OVERLAY_FRAME: 'overlay:frame',
  INTERNAL_PAGE_CHANGED: 'internal:page-changed',
  SHORTCUT_KEY: 'shortcut:key', // main -> renderer: key combo pressed while a web page had focus
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_MAXIMIZE: 'window:maximize',
  WINDOW_CLOSE: 'window:close',
} as const;


/** A browser profile on this computer that DASH can import from. */
/** What the lock-icon panel shows about the page in a tab. Everything here is read live, nothing is estimated. */
export interface ArchiveEntry {
  id: number;
  url: string;
  title: string;
  size: number;
  savedAt: number;
}

export interface AiStatus {
  available: boolean;
  models: string[];
  reason?: string;
}

export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiEvent {
  id: string;
  delta?: string;
  done?: boolean;
  stopped?: boolean;
  error?: string;
}

export interface UpdateStatus {
  state: 'off' | 'idle' | 'checking' | 'none' | 'downloading' | 'ready' | 'error';
  /** The version found (downloading/ready), or the current one otherwise. */
  version?: string;
  percent?: number;
  message?: string;
}

/** A draggable strip between two native views (page | side panel, page | DevTools, split panes), in window coordinates. */
/** Where the two split-view panes sit, so the window UI can draw their frames and tab chips around them. */
export interface SplitLayout {
  area: { x: number; y: number; width: number; height: number };
  panes: { tabId: string; x: number; y: number; width: number; height: number }[];
  activeTabId: string;
}

export interface LayoutDivider {
  id: 'split' | 'panel' | 'devtools';
  axis: 'x' | 'y';
  x: number;
  y: number;
  width: number;
  height: number;
  /** Start and length, along `axis`, of the area the divider moves within. */
  areaStart: number;
  areaSize: number;
  /** Fraction a double-click resets the divider to. */
  resetTo: number;
}

export type SidePanelKind = 'notes' | 'ai';

export interface NoteEntry {
  id: number;
  body: string;
  /** Page the note was taken on (optional). */
  url: string | null;
  createdAt: number;
  updatedAt: number;
}

export const NOTE_MAX_LENGTH = 20000;

export interface SiteInfo {
  /** Host without "www.", or '' for pages that are not on the web. */
  host: string;
  scheme: 'https' | 'http' | 'internal' | 'file' | 'other';
  isPrivate: boolean;
  /** Cookies this page can currently send (its own and its parent domains'). */
  cookieCount: number;
  /** Ad/tracker blocking is switched off for this site. */
  blockingOff: boolean;
  /** Camera/mic/location/notification decisions saved for this origin. */
  permissions: PermissionRecord[];
}

export interface ImportSource {
  id: string;
  name: string;
  bookmarkCount: number;
  historyCount: number;
}

export interface ImportResult {
  bookmarks: number;
  history: number;
}

/** A picture of the page painted by the toolbar while a dropdown hides the native page view; bounds are in DIPs. */
export interface OverlaySnapshot {
  image: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// ---- Website Lock (shared shapes; nothing here ever carries a password hash or recovery verifier) ----

export interface WebsiteLockSite {
  id: string;
  hostname: string;
  displayName: string;
  includeSubdomains: boolean;
  enabled: boolean;
  unlocked: boolean;
  createdAt: number;
}

export interface WebsiteLockStatus {
  protected: boolean;
  unlocked: boolean;
  site: WebsiteLockSite | null;
  /** Host of the page being asked about (for display only). */
  host: string | null;
}

/** App Lock: one password for the whole browser. */
export interface AppLockStatus {
  enabled: boolean;
  locked: boolean;
  idleMinutes: 0 | 1 | 5 | 15 | 30 | 60;
}

/** Every Website Lock call answers with this, so a wrong password is a normal result, not an exception. */
export type WebsiteLockResult<T = null> =
  | { ok: true; value: T }
  | { ok: false; code: string; message: string; retryAfterMs?: number; attemptsLeft?: number };
