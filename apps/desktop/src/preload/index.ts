import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC,
  type TabState,
  type ContainerInfo,
  type HistoryEntry,
  type BookmarkEntry,
  type DownloadEntry,
  type DashSettings,
  type BlockStats,
  type PasswordEntry,
  type PermissionRecord,
  type SiteInfo,
  type PermissionName,
  type PermissionDecision,
  type AddressSuggestion,
  type FindResult,
  type ExtensionInfo,
  type WebsiteLockResult,
  type WebsiteLockSite,
  type WebsiteLockStatus,
  type TaskProcessInfo,
  type ImportSource,
  type ImportResult,
  type VpnState,
  type VpnConfig,
  type NoteEntry,
  type ArchiveEntry,
  type AiStatus,
  type UpdateStatus,
  type LayoutDivider,
  type SplitLayout,
  type AppLockStatus,
  type OverlaySnapshot,
  type AiChatMessage,
  type AiEvent,
  type SidePanelKind,
} from '../shared/ipc-channels';

/**
 * The renderer NEVER gets direct access to ipcRenderer, Node, or fs.
 * Everything it can do is explicitly whitelisted here.
 */
export interface ForwardedKey {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

const dashApi = {
  tabs: {
    create: (url?: string, isPrivate?: boolean, containerId?: string | null): Promise<TabState> =>
      ipcRenderer.invoke(IPC.TAB_CREATE, url, isPrivate, containerId),
    close: (id: string): Promise<void> => ipcRenderer.invoke(IPC.TAB_CLOSE, id),
    switch: (id: string): Promise<void> => ipcRenderer.invoke(IPC.TAB_SWITCH, id),
    navigate: (id: string, url: string): Promise<void> => ipcRenderer.invoke(IPC.TAB_NAVIGATE, id, url),
    goBack: (id: string): Promise<void> => ipcRenderer.invoke(IPC.TAB_GO_BACK, id),
    goForward: (id: string): Promise<void> => ipcRenderer.invoke(IPC.TAB_GO_FORWARD, id),
    goHome: (id: string): Promise<void> => ipcRenderer.invoke(IPC.TAB_GO_HOME, id),
    reload: (id: string): Promise<void> => ipcRenderer.invoke(IPC.TAB_RELOAD, id),
    stop: (id: string): Promise<void> => ipcRenderer.invoke(IPC.TAB_STOP, id),
    snapshot: (): Promise<TabState[]> => ipcRenderer.invoke(IPC.TABS_SNAPSHOT),
    duplicate: (id: string): Promise<TabState | null> => ipcRenderer.invoke(IPC.TAB_DUPLICATE, id),
    togglePin: (id: string): Promise<void> => ipcRenderer.invoke(IPC.TAB_TOGGLE_PIN, id),
    setGroup: (id: string, target: string | null): Promise<void> => ipcRenderer.invoke(IPC.TAB_SET_GROUP, id, target),
    updateGroup: (groupId: string, patch: { name?: string; color?: string; collapsed?: boolean }): Promise<void> =>
      ipcRenderer.invoke(IPC.GROUP_UPDATE, groupId, patch),
    closeGroup: (groupId: string): Promise<void> => ipcRenderer.invoke(IPC.GROUP_CLOSE, groupId),
    sleepStats: (): Promise<{ sleeping: number; freedMb: number }> => ipcRenderer.invoke(IPC.TABS_SLEEP_STATS),
    siteZoomList: (): Promise<{ host: string; factor: number }[]> => ipcRenderer.invoke(IPC.SITE_ZOOM_LIST),
    resetSiteZoom: (host: string): Promise<void> => ipcRenderer.invoke(IPC.SITE_ZOOM_RESET, host),
    spellCheckLanguages: (): Promise<string[]> => ipcRenderer.invoke(IPC.SPELLCHECK_LANGUAGES),
    siteInfo: (id: string): Promise<SiteInfo | null> => ipcRenderer.invoke(IPC.SITE_INFO, id),
    setSiteProtection: (host: string, off: boolean): Promise<void> => ipcRenderer.invoke(IPC.SITE_SET_PROTECTION, host, off),
    clearSiteData: (id: string): Promise<number> => ipcRenderer.invoke(IPC.SITE_CLEAR_DATA, id),
    onOrder: (cb: (ids: string[]) => void): (() => void) => {
      const listener = (_e: unknown, ids: string[]) => cb(ids);
      ipcRenderer.on(IPC.TABS_ORDER, listener);
      return () => ipcRenderer.removeListener(IPC.TABS_ORDER, listener);
    },
    toggleMute: (id: string): Promise<void> => ipcRenderer.invoke(IPC.TAB_TOGGLE_MUTE, id),
    reopenClosed: (): Promise<TabState | null> => ipcRenderer.invoke(IPC.TAB_REOPEN_CLOSED),
    reorder: (orderedIds: string[]): Promise<void> => ipcRenderer.invoke(IPC.TAB_REORDER, orderedIds),
    onStateChanged: (cb: (state: TabState) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, state: TabState) => cb(state);
      ipcRenderer.on(IPC.TAB_STATE_CHANGED, listener);
      return () => ipcRenderer.removeListener(IPC.TAB_STATE_CHANGED, listener);
    },
  },
  history: {
    query: (term: string): Promise<HistoryEntry[]> => ipcRenderer.invoke(IPC.HISTORY_QUERY, term),
    delete: (id: number): Promise<void> => ipcRenderer.invoke(IPC.HISTORY_DELETE, id),
    clear: (): Promise<void> => ipcRenderer.invoke(IPC.HISTORY_CLEAR),
  },
  profiles: {
    list: (): Promise<{ id: string; name: string; isCurrent: boolean }[]> => ipcRenderer.invoke(IPC.PROFILES_LIST),
    create: (name: string): Promise<{ id: string; name: string; isCurrent: boolean }> => ipcRenderer.invoke(IPC.PROFILE_CREATE, name),
    rename: (id: string, name: string): Promise<void> => ipcRenderer.invoke(IPC.PROFILE_RENAME, id, name),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IPC.PROFILE_DELETE, id),
    open: (id: string): Promise<void> => ipcRenderer.invoke(IPC.PROFILE_OPEN, id),
  },
  containers: {
    list: (): Promise<ContainerInfo[]> => ipcRenderer.invoke(IPC.CONTAINERS_LIST),
    create: (name: string, color: string): Promise<ContainerInfo> => ipcRenderer.invoke(IPC.CONTAINER_CREATE, name, color),
    update: (id: string, name: string, color: string): Promise<void> => ipcRenderer.invoke(IPC.CONTAINER_UPDATE, id, name, color),
    remove: (id: string): Promise<void> => ipcRenderer.invoke(IPC.CONTAINER_DELETE, id),
    onChanged: (cb: () => void) => {
      const listener = () => cb();
      ipcRenderer.on(IPC.CONTAINERS_CHANGED, listener);
      return () => ipcRenderer.removeListener(IPC.CONTAINERS_CHANGED, listener);
    },
  },
  backup: {
    export: (passphrase: string, includePasswords: boolean): Promise<{ items: number; passwords: number } | null> =>
      ipcRenderer.invoke(IPC.BACKUP_EXPORT, passphrase, includePasswords),
    import: (passphrase: string): Promise<{ counts: Record<string, number>; passwords: number; passwordsSkipped: string | null } | null> =>
      ipcRenderer.invoke(IPC.BACKUP_IMPORT, passphrase),
  },
  bookmarks: {
    add: (url: string, title: string, faviconUrl?: string | null): Promise<BookmarkEntry> =>
      ipcRenderer.invoke(IPC.BOOKMARK_ADD, url, title, faviconUrl),
    remove: (id: number): Promise<void> => ipcRenderer.invoke(IPC.BOOKMARK_REMOVE, id),
    list: (): Promise<BookmarkEntry[]> => ipcRenderer.invoke(IPC.BOOKMARK_LIST),
    export: (): Promise<{ exported: number } | null> => ipcRenderer.invoke(IPC.BOOKMARKS_EXPORT),
    import: (): Promise<{ imported: number } | null> => ipcRenderer.invoke(IPC.BOOKMARKS_IMPORT),
    setFolder: (id: number, folder: string | null): Promise<void> => ipcRenderer.invoke(IPC.BOOKMARK_SET_FOLDER, id, folder),
    move: (id: number, beforeId: number | null, folder?: string | null): Promise<void> => ipcRenderer.invoke(IPC.BOOKMARK_MOVE, id, beforeId, folder),
    onChanged: (cb: () => void): (() => void) => {
      const listener = () => cb();
      ipcRenderer.on(IPC.BOOKMARKS_CHANGED, listener);
      return () => ipcRenderer.removeListener(IPC.BOOKMARKS_CHANGED, listener);
    },
  },
  browserImport: {
    detect: (): Promise<ImportSource[]> => ipcRenderer.invoke(IPC.IMPORT_DETECT),
    run: (sourceId: string, options: { bookmarks: boolean; history: boolean }): Promise<ImportResult> =>
      ipcRenderer.invoke(IPC.IMPORT_RUN, sourceId, options),
  },
  downloads: {
    list: (): Promise<DownloadEntry[]> => ipcRenderer.invoke(IPC.DOWNLOAD_LIST),
    cancel: (id: number): Promise<void> => ipcRenderer.invoke(IPC.DOWNLOAD_CANCEL, id),
    pause: (id: number): Promise<void> => ipcRenderer.invoke(IPC.DOWNLOAD_PAUSE, id),
    resume: (id: number): Promise<void> => ipcRenderer.invoke(IPC.DOWNLOAD_RESUME, id),
    remove: (id: number): Promise<void> => ipcRenderer.invoke(IPC.DOWNLOAD_REMOVE, id),
    openFile: (savePath: string): Promise<void> => ipcRenderer.invoke(IPC.DOWNLOAD_OPEN_FILE, savePath),
    showInFolder: (savePath: string): Promise<void> => ipcRenderer.invoke(IPC.DOWNLOAD_SHOW_IN_FOLDER, savePath),
    startDrag: (savePath: string): Promise<void> => ipcRenderer.invoke(IPC.DOWNLOAD_START_DRAG, savePath),
    onStateChanged: (cb: (entry: DownloadEntry) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, entry: DownloadEntry) => cb(entry);
      ipcRenderer.on(IPC.DOWNLOAD_STATE_CHANGED, listener);
      return () => ipcRenderer.removeListener(IPC.DOWNLOAD_STATE_CHANGED, listener);
    },
  },
  settings: {
    getAll: (): Promise<DashSettings> => ipcRenderer.invoke(IPC.SETTINGS_GET_ALL),
    set: <K extends keyof DashSettings>(key: K, value: DashSettings[K]): Promise<void> =>
      ipcRenderer.invoke(IPC.SETTINGS_SET, key, String(value)),
    reset: (): Promise<void> => ipcRenderer.invoke(IPC.SETTINGS_RESET),
    onChanged: (cb: (settings: DashSettings) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, settings: DashSettings) => cb(settings);
      ipcRenderer.on(IPC.SETTINGS_STATE_CHANGED, listener);
      return () => ipcRenderer.removeListener(IPC.SETTINGS_STATE_CHANGED, listener);
    },
  },
  vpn: {
    getState: (): Promise<VpnState> => ipcRenderer.invoke(IPC.VPN_GET_STATE),
    setConfig: (config: VpnConfig, password?: string): Promise<VpnState> => ipcRenderer.invoke(IPC.VPN_SET_CONFIG, config, password),
    connect: (): Promise<VpnState> => ipcRenderer.invoke(IPC.VPN_CONNECT),
    disconnect: (): Promise<VpnState> => ipcRenderer.invoke(IPC.VPN_DISCONNECT),
    test: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke(IPC.VPN_TEST),
    checkIp: (): Promise<{ viaVpn?: string; direct?: string; error?: string }> => ipcRenderer.invoke(IPC.VPN_CHECK_IP),
    onChanged: (cb: (state: VpnState) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, state: VpnState) => cb(state);
      ipcRenderer.on(IPC.VPN_STATE_CHANGED, listener);
      return () => ipcRenderer.removeListener(IPC.VPN_STATE_CHANGED, listener);
    },
  },
  blockStats: {
    get: (): Promise<BlockStats> => ipcRenderer.invoke(IPC.BLOCK_STATS_GET),
    reset: (): Promise<void> => ipcRenderer.invoke(IPC.BLOCK_STATS_RESET),
  },
  privacy: {
    clearBrowsingData: (options: {
      history?: boolean;
      cache?: boolean;
      cookies?: boolean;
      downloads?: boolean;
    }): Promise<void> => ipcRenderer.invoke(IPC.PRIVACY_CLEAR_BROWSING_DATA, options),
  },
  passwords: {
    add: (origin: string, username: string, password: string): Promise<PasswordEntry> =>
      ipcRenderer.invoke(IPC.PASSWORD_ADD, origin, username, password),
    list: (): Promise<PasswordEntry[]> => ipcRenderer.invoke(IPC.PASSWORD_LIST),
    reveal: (id: number): Promise<string> => ipcRenderer.invoke(IPC.PASSWORD_REVEAL, id),
    remove: (id: number): Promise<void> => ipcRenderer.invoke(IPC.PASSWORD_REMOVE, id),
    generate: (length?: number): Promise<string> => ipcRenderer.invoke(IPC.PASSWORD_GENERATE, length),
    importCsv: (): Promise<{ imported: number; alreadySaved: number; invalid: number } | null> => ipcRenderer.invoke(IPC.PASSWORDS_IMPORT_CSV),
    respondToSavePrompt: (promptId: string, save: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC.PASSWORD_SAVE_PROMPT_RESPOND, promptId, save),
    onSavePrompt: (cb: (payload: { promptId: string; origin: string; username: string; isUpdate: boolean }) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: { promptId: string; origin: string; username: string; isUpdate: boolean }) =>
        cb(payload);
      ipcRenderer.on(IPC.PASSWORD_SAVE_PROMPT, listener);
      return () => ipcRenderer.removeListener(IPC.PASSWORD_SAVE_PROMPT, listener);
    },
  },
  permissions: {
    list: (): Promise<PermissionRecord[]> => ipcRenderer.invoke(IPC.PERMISSION_LIST),
    set: (origin: string, permission: PermissionName, decision: PermissionDecision): Promise<void> =>
      ipcRenderer.invoke(IPC.PERMISSION_SET, origin, permission, decision),
    remove: (id: number): Promise<void> => ipcRenderer.invoke(IPC.PERMISSION_REMOVE, id),
    respondToRequest: (requestId: string, decision: PermissionDecision): Promise<void> =>
      ipcRenderer.invoke(IPC.PERMISSION_REQUEST_RESPOND, requestId, decision),
    onRequest: (
      cb: (payload: { requestId: string; origin: string; permission: PermissionName }) => void
    ): (() => void) => {
      const listener = (
        _e: Electron.IpcRendererEvent,
        payload: { requestId: string; origin: string; permission: PermissionName }
      ) => cb(payload);
      ipcRenderer.on(IPC.PERMISSION_REQUEST_PROMPT, listener);
      return () => ipcRenderer.removeListener(IPC.PERMISSION_REQUEST_PROMPT, listener);
    },
  },
  find: {
    start: (id: string, text: string, forward: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC.FIND_IN_PAGE_START, id, text, forward),
    next: (id: string, forward: boolean): Promise<void> => ipcRenderer.invoke(IPC.FIND_IN_PAGE_NEXT, id, forward),
    stop: (id: string): Promise<void> => ipcRenderer.invoke(IPC.FIND_IN_PAGE_STOP, id),
    onResult: (cb: (result: FindResult) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, result: FindResult) => cb(result);
      ipcRenderer.on(IPC.FIND_IN_PAGE_RESULT, listener);
      return () => ipcRenderer.removeListener(IPC.FIND_IN_PAGE_RESULT, listener);
    },
  },
  zoom: {
    in: (id: string): Promise<void> => ipcRenderer.invoke(IPC.ZOOM_IN, id),
    out: (id: string): Promise<void> => ipcRenderer.invoke(IPC.ZOOM_OUT, id),
    reset: (id: string): Promise<void> => ipcRenderer.invoke(IPC.ZOOM_RESET, id),
  },
  page: {
    print: (id: string): Promise<void> => ipcRenderer.invoke(IPC.PAGE_PRINT, id),
    translate: (id: string): Promise<boolean> => ipcRenderer.invoke(IPC.PAGE_TRANSLATE, id),
    printPreview: (id: string): Promise<boolean> => ipcRenderer.invoke(IPC.PAGE_PRINT_PREVIEW, id),
    save: (id: string): Promise<void> => ipcRenderer.invoke(IPC.PAGE_SAVE, id),
    savePdf: (id: string): Promise<void> => ipcRenderer.invoke(IPC.PAGE_SAVE_PDF, id),
    toggleReader: (id: string): Promise<'opened' | 'closed' | 'unreadable' | 'unsupported'> =>
      ipcRenderer.invoke(IPC.PAGE_READER, id),
    toggleDevTools: (id: string): Promise<void> => ipcRenderer.invoke(IPC.DEVTOOLS_TOGGLE, id),
  },
  suggestions: {
    query: (term: string): Promise<AddressSuggestion[]> => ipcRenderer.invoke(IPC.SUGGESTIONS_QUERY, term),
    /** Search-engine suggestions for the typed text; empty when switched off or in a private tab. */
    web: (term: string, isPrivate: boolean): Promise<string[]> => ipcRenderer.invoke(IPC.SUGGESTIONS_WEB, term, isPrivate),
  },
  extensions: {
    installFromStore: (input: string): Promise<ExtensionInfo | null> => ipcRenderer.invoke(IPC.EXTENSIONS_INSTALL_STORE, input),
    loadFromPicker: (): Promise<ExtensionInfo | null> => ipcRenderer.invoke(IPC.EXTENSIONS_LOAD),
    list: (): Promise<ExtensionInfo[]> => ipcRenderer.invoke(IPC.EXTENSIONS_LIST),
    remove: (extensionId: string): Promise<void> => ipcRenderer.invoke(IPC.EXTENSIONS_REMOVE, extensionId),
    setPinned: (extensionId: string, pinned: boolean): Promise<void> => ipcRenderer.invoke(IPC.EXTENSIONS_SET_PINNED, extensionId, pinned),
    /** Opens the extension's popup under the toolbar button at `anchor` (window coordinates), else its options page. */
    open: (extensionId: string, anchor: { x: number; y: number; width: number; height: number }): Promise<'popup' | 'options' | 'none'> =>
      ipcRenderer.invoke(IPC.EXTENSIONS_OPEN, extensionId, anchor),
  },
  taskManager: {
    snapshot: (): Promise<TaskProcessInfo[]> => ipcRenderer.invoke(IPC.TASK_MANAGER_SNAPSHOT),
    endProcess: (pid: number): Promise<void> => ipcRenderer.invoke(IPC.TASK_MANAGER_END_PROCESS, pid),
  },
  internal: {
    /** An internal page switched sections in place (no reload); lets the tab's title and address follow. */
    pageChanged: (page: string): Promise<void> => ipcRenderer.invoke(IPC.INTERNAL_PAGE_CHANGED, page),
  },
  webApps: {
    install: (tabId: string): Promise<{ ok: boolean; id?: string; shortcuts?: string[]; error?: string }> => ipcRenderer.invoke(IPC.WEBAPP_INSTALL, tabId),
    list: (): Promise<{ id: string; name: string; startUrl: string; installedAt: number }[]> => ipcRenderer.invoke(IPC.WEBAPP_LIST),
    launch: (id: string): Promise<boolean> => ipcRenderer.invoke(IPC.WEBAPP_LAUNCH, id),
    uninstall: (id: string): Promise<void> => ipcRenderer.invoke(IPC.WEBAPP_UNINSTALL, id),
  },
  overlay: {
    /** Resolves to a JPEG data URL snapshot of the page (or null) to show while the native view is detached. */
    push: (): Promise<OverlaySnapshot | null> => ipcRenderer.invoke(IPC.OVERLAY_PUSH),
    commit: (): Promise<void> => ipcRenderer.invoke(IPC.OVERLAY_COMMIT),
    pop: (): Promise<void> => ipcRenderer.invoke(IPC.OVERLAY_POP),
    onFrame: (cb: (image: string) => void): (() => void) => {
      const h = (_e: unknown, image: string) => { if (typeof image === 'string') cb(image); };
      ipcRenderer.on(IPC.OVERLAY_FRAME, h);
      return () => ipcRenderer.removeListener(IPC.OVERLAY_FRAME, h);
    },
  },
  shortcuts: {
    onKey: (cb: (key: ForwardedKey) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, key: ForwardedKey) => cb(key);
      ipcRenderer.on(IPC.SHORTCUT_KEY, listener);
      return () => ipcRenderer.removeListener(IPC.SHORTCUT_KEY, listener);
    },
  },
  archive: {
    save: (tabId: string): Promise<ArchiveEntry> => ipcRenderer.invoke(IPC.ARCHIVE_SAVE, tabId),
    list: (search = ''): Promise<ArchiveEntry[]> => ipcRenderer.invoke(IPC.ARCHIVE_LIST, search),
    open: (id: number): Promise<void> => ipcRenderer.invoke(IPC.ARCHIVE_OPEN, id),
    delete: (id: number): Promise<void> => ipcRenderer.invoke(IPC.ARCHIVE_DELETE, id),
    onChanged: (cb: () => void): (() => void) => {
      const listener = () => cb();
      ipcRenderer.on(IPC.ARCHIVE_CHANGED, listener);
      return () => ipcRenderer.removeListener(IPC.ARCHIVE_CHANGED, listener);
    },
  },
  notes: {
    list: (search = ''): Promise<NoteEntry[]> => ipcRenderer.invoke(IPC.NOTES_LIST, search),
    save: (id: number | null, body: string, url: string | null): Promise<NoteEntry> => ipcRenderer.invoke(IPC.NOTES_SAVE, id, body, url),
    delete: (id: number): Promise<void> => ipcRenderer.invoke(IPC.NOTES_DELETE, id),
    onChanged: (cb: () => void): (() => void) => {
      const listener = () => cb();
      ipcRenderer.on(IPC.NOTES_CHANGED, listener);
      return () => ipcRenderer.removeListener(IPC.NOTES_CHANGED, listener);
    },
  },
  updates: {
    status: (): Promise<UpdateStatus> => ipcRenderer.invoke(IPC.UPDATE_STATUS),
    check: (): Promise<UpdateStatus> => ipcRenderer.invoke(IPC.UPDATE_CHECK),
    install: (): Promise<void> => ipcRenderer.invoke(IPC.UPDATE_INSTALL),
    onChanged: (cb: (s: UpdateStatus) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, s: UpdateStatus) => cb(s);
      ipcRenderer.on(IPC.UPDATE_CHANGED, listener);
      return () => ipcRenderer.removeListener(IPC.UPDATE_CHANGED, listener);
    },
  },
  ai: {
    status: (): Promise<AiStatus> => ipcRenderer.invoke(IPC.AI_STATUS),
    chat: (id: string, model: string, messages: AiChatMessage[], usePage: boolean): Promise<{ usedPage: boolean }> =>
      ipcRenderer.invoke(IPC.AI_CHAT, id, model, messages, usePage),
    cancel: (id: string): Promise<void> => ipcRenderer.invoke(IPC.AI_CANCEL, id),
    onEvent: (cb: (e: AiEvent) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, ev: AiEvent) => cb(ev);
      ipcRenderer.on(IPC.AI_EVENT, listener);
      return () => ipcRenderer.removeListener(IPC.AI_EVENT, listener);
    },
  },
  layout: {
    onSplit: (cb: (s: SplitLayout | null) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, s: SplitLayout | null) => cb(s);
      ipcRenderer.on(IPC.LAYOUT_SPLIT, listener);
      return () => ipcRenderer.removeListener(IPC.LAYOUT_SPLIT, listener);
    },
    setDivider: (id: LayoutDivider['id'], fraction: number): Promise<void> => ipcRenderer.invoke(IPC.LAYOUT_DIVIDER, id, fraction),
    onDividers: (cb: (d: LayoutDivider[]) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, d: LayoutDivider[]) => cb(d);
      ipcRenderer.on(IPC.LAYOUT_DIVIDERS, listener);
      return () => ipcRenderer.removeListener(IPC.LAYOUT_DIVIDERS, listener);
    },
  },
  /** Website Lock. Every call is checked again in the main process; none of them can return a password hash. */
  appLock: {
    startsLocked: process.argv.includes('--dash-locked=1'),
    status: (): Promise<AppLockStatus> => ipcRenderer.invoke(IPC.APP_LOCK_STATUS),
    enable: (password: string, confirm: string, idleMinutes: number): Promise<WebsiteLockResult> => ipcRenderer.invoke(IPC.APP_LOCK_ENABLE, password, confirm, idleMinutes),
    disable: (password: string): Promise<WebsiteLockResult> => ipcRenderer.invoke(IPC.APP_LOCK_DISABLE, password),
    change: (current: string, next: string, confirm: string): Promise<WebsiteLockResult> => ipcRenderer.invoke(IPC.APP_LOCK_CHANGE, current, next, confirm),
    setIdle: (password: string, minutes: number): Promise<WebsiteLockResult> => ipcRenderer.invoke(IPC.APP_LOCK_SET_IDLE, password, minutes),
    unlock: (password: string): Promise<WebsiteLockResult> => ipcRenderer.invoke(IPC.APP_LOCK_UNLOCK, password),
    lock: (): Promise<WebsiteLockResult<boolean>> => ipcRenderer.invoke(IPC.APP_LOCK_LOCK),
    erase: (typed: string): Promise<WebsiteLockResult> => ipcRenderer.invoke(IPC.APP_LOCK_ERASE, typed),
    onChanged: (cb: (s: AppLockStatus) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, s: AppLockStatus) => cb(s);
      ipcRenderer.on(IPC.APP_LOCK_CHANGED, listener);
      return () => ipcRenderer.removeListener(IPC.APP_LOCK_CHANGED, listener);
    },
  },
  websiteLock: {
    list: (): Promise<WebsiteLockResult<WebsiteLockSite[]>> => ipcRenderer.invoke(IPC.WEBSITE_LOCK_LIST),
    current: (): Promise<WebsiteLockResult<WebsiteLockStatus>> => ipcRenderer.invoke(IPC.WEBSITE_LOCK_CURRENT),
    pending: (): Promise<WebsiteLockResult<{ host: string | null; site: WebsiteLockSite } | null>> => ipcRenderer.invoke(IPC.WEBSITE_LOCK_PENDING),
    unlockPending: (password: string): Promise<WebsiteLockResult> => ipcRenderer.invoke(IPC.WEBSITE_LOCK_UNLOCK_PENDING, password),
    add: (input: { url: string; displayName?: string; password: string; confirmPassword: string; includeSubdomains: boolean }): Promise<WebsiteLockResult<WebsiteLockSite>> =>
      ipcRenderer.invoke(IPC.WEBSITE_LOCK_ADD, input),
    remove: (id: string, password: string): Promise<WebsiteLockResult> => ipcRenderer.invoke(IPC.WEBSITE_LOCK_REMOVE, id, password),
    edit: (id: string, password: string, changes: { displayName?: string; includeSubdomains?: boolean; enabled?: boolean }): Promise<WebsiteLockResult<WebsiteLockSite>> =>
      ipcRenderer.invoke(IPC.WEBSITE_LOCK_EDIT, id, password, changes),
    enable: (id: string): Promise<WebsiteLockResult<WebsiteLockSite>> => ipcRenderer.invoke(IPC.WEBSITE_LOCK_ENABLE, id),
    changePassword: (id: string, current: string, next: string, confirm: string): Promise<WebsiteLockResult> =>
      ipcRenderer.invoke(IPC.WEBSITE_LOCK_CHANGE_PASSWORD, id, current, next, confirm),
    lock: (id: string): Promise<WebsiteLockResult> => ipcRenderer.invoke(IPC.WEBSITE_LOCK_LOCK, id),
    lockAll: (): Promise<WebsiteLockResult> => ipcRenderer.invoke(IPC.WEBSITE_LOCK_LOCK_ALL),
    recoveryStatus: (): Promise<WebsiteLockResult<{ configured: boolean }>> => ipcRenderer.invoke(IPC.WEBSITE_LOCK_RECOVERY_STATUS),
    recoveryBegin: (): Promise<WebsiteLockResult<{ key: string }>> => ipcRenderer.invoke(IPC.WEBSITE_LOCK_RECOVERY_BEGIN),
    recoveryConfirm: (saved: boolean): Promise<WebsiteLockResult> => ipcRenderer.invoke(IPC.WEBSITE_LOCK_RECOVERY_CONFIRM, saved),
    recoverSite: (id: string, key: string, next: string, confirm: string): Promise<WebsiteLockResult> =>
      ipcRenderer.invoke(IPC.WEBSITE_LOCK_RECOVER_SITE, id, key, next, confirm),
    recoveryRegenerate: (currentKey: string): Promise<WebsiteLockResult<{ key: string }>> => ipcRenderer.invoke(IPC.WEBSITE_LOCK_RECOVERY_REGENERATE, currentKey),
    resetRequest: (scope: string): Promise<WebsiteLockResult<{ readyAt: number }>> => ipcRenderer.invoke(IPC.WEBSITE_LOCK_RESET_REQUEST, scope),
    resetSite: (id: string, typed: string, next: string, confirm: string): Promise<WebsiteLockResult> =>
      ipcRenderer.invoke(IPC.WEBSITE_LOCK_RESET_SITE, id, typed, next, confirm),
    resetRecovery: (typed: string): Promise<WebsiteLockResult<{ key: string }>> => ipcRenderer.invoke(IPC.WEBSITE_LOCK_RESET_RECOVERY, typed),
    saveRecoveryKey: (key: string): Promise<WebsiteLockResult<{ saved: boolean }>> => ipcRenderer.invoke(IPC.WEBSITE_LOCK_SAVE_RECOVERY_KEY, key),
    backupExport: (backupPassword: string): Promise<WebsiteLockResult<{ saved: boolean }>> => ipcRenderer.invoke(IPC.WEBSITE_LOCK_BACKUP_EXPORT, backupPassword),
    backupPreview: (
      backupPassword: string
    ): Promise<WebsiteLockResult<{ token: string; sites: { hostname: string; displayName: string; exists: boolean }[]; hasRecoveryKey: boolean } | null>> =>
      ipcRenderer.invoke(IPC.WEBSITE_LOCK_BACKUP_PREVIEW, backupPassword),
    backupApply: (token: string, replaceExisting: boolean): Promise<WebsiteLockResult<{ added: number; replaced: number; skipped: number; recoveryRestored: boolean }>> =>
      ipcRenderer.invoke(IPC.WEBSITE_LOCK_BACKUP_APPLY, token, replaceExisting),
    events: (): Promise<WebsiteLockResult<{ type: string; hostname: string | null; at: number }[]>> => ipcRenderer.invoke(IPC.WEBSITE_LOCK_EVENTS),
    onChanged: (callback: () => void): (() => void) => {
      const listener = () => callback();
      ipcRenderer.on(IPC.WEBSITE_LOCK_CHANGED, listener);
      return () => ipcRenderer.removeListener(IPC.WEBSITE_LOCK_CHANGED, listener);
    },
  },
  split: {
    open: (partnerId?: string): Promise<void> => ipcRenderer.invoke(IPC.SPLIT_OPEN, partnerId ?? null),
    close: (): Promise<void> => ipcRenderer.invoke(IPC.SPLIT_CLOSE),
    swap: (): Promise<void> => ipcRenderer.invoke(IPC.SPLIT_SWAP),
    reset: (): Promise<void> => ipcRenderer.invoke(IPC.SPLIT_RESET),
  },
  sidePanel: {
    toggle: (kind: SidePanelKind): Promise<void> => ipcRenderer.invoke(IPC.SIDEPANEL_TOGGLE, kind),
    close: (): Promise<void> => ipcRenderer.invoke(IPC.SIDEPANEL_CLOSE),
    activeUrl: (): Promise<string | null> => ipcRenderer.invoke(IPC.PAGE_URL_ACTIVE),
  },
  windowControls: {
    new: (): Promise<void> => ipcRenderer.invoke(IPC.WINDOW_NEW),
    moveTab: (id: string, x?: number, y?: number): Promise<boolean> => ipcRenderer.invoke(IPC.WINDOW_MOVE_TAB, id, x, y),
    minimize: (): Promise<void> => ipcRenderer.invoke(IPC.WINDOW_MINIMIZE),
    maximize: (): Promise<void> => ipcRenderer.invoke(IPC.WINDOW_MAXIMIZE),
    close: (): Promise<void> => ipcRenderer.invoke(IPC.WINDOW_CLOSE),
  },
};

contextBridge.exposeInMainWorld('dash', dashApi);

export type DashApi = typeof dashApi;
