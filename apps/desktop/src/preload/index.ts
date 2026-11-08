import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC,
  type TabState,
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
  type TaskProcessInfo,
  type ImportSource,
  type ImportResult,
  type VpnState,
  type VpnConfig,
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
    create: (url?: string, isPrivate?: boolean): Promise<TabState> => ipcRenderer.invoke(IPC.TAB_CREATE, url, isPrivate),
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
  bookmarks: {
    add: (url: string, title: string, faviconUrl?: string | null): Promise<BookmarkEntry> =>
      ipcRenderer.invoke(IPC.BOOKMARK_ADD, url, title, faviconUrl),
    remove: (id: number): Promise<void> => ipcRenderer.invoke(IPC.BOOKMARK_REMOVE, id),
    list: (): Promise<BookmarkEntry[]> => ipcRenderer.invoke(IPC.BOOKMARK_LIST),
    export: (): Promise<{ exported: number } | null> => ipcRenderer.invoke(IPC.BOOKMARKS_EXPORT),
    import: (): Promise<{ imported: number } | null> => ipcRenderer.invoke(IPC.BOOKMARKS_IMPORT),
    setFolder: (id: number, folder: string | null): Promise<void> => ipcRenderer.invoke(IPC.BOOKMARK_SET_FOLDER, id, folder),
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
    respondToSavePrompt: (promptId: string, save: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC.PASSWORD_SAVE_PROMPT_RESPOND, promptId, save),
    onSavePrompt: (cb: (payload: { promptId: string; origin: string; username: string }) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: { promptId: string; origin: string; username: string }) =>
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
    save: (id: string): Promise<void> => ipcRenderer.invoke(IPC.PAGE_SAVE, id),
    savePdf: (id: string): Promise<void> => ipcRenderer.invoke(IPC.PAGE_SAVE_PDF, id),
    toggleReader: (id: string): Promise<'opened' | 'closed' | 'unreadable' | 'unsupported'> =>
      ipcRenderer.invoke(IPC.PAGE_READER, id),
    toggleDevTools: (id: string): Promise<void> => ipcRenderer.invoke(IPC.DEVTOOLS_TOGGLE, id),
  },
  suggestions: {
    query: (term: string): Promise<AddressSuggestion[]> => ipcRenderer.invoke(IPC.SUGGESTIONS_QUERY, term),
  },
  extensions: {
    loadFromPicker: (): Promise<ExtensionInfo | null> => ipcRenderer.invoke(IPC.EXTENSIONS_LOAD),
    list: (): Promise<ExtensionInfo[]> => ipcRenderer.invoke(IPC.EXTENSIONS_LIST),
    remove: (extensionId: string): Promise<void> => ipcRenderer.invoke(IPC.EXTENSIONS_REMOVE, extensionId),
  },
  taskManager: {
    snapshot: (): Promise<TaskProcessInfo[]> => ipcRenderer.invoke(IPC.TASK_MANAGER_SNAPSHOT),
    endProcess: (pid: number): Promise<void> => ipcRenderer.invoke(IPC.TASK_MANAGER_END_PROCESS, pid),
  },
  overlay: {
    /** Resolves to a JPEG data URL snapshot of the page (or null) to show while the native view is detached. */
    push: (): Promise<string | null> => ipcRenderer.invoke(IPC.OVERLAY_PUSH),
    pop: (): Promise<void> => ipcRenderer.invoke(IPC.OVERLAY_POP),
  },
  shortcuts: {
    onKey: (cb: (key: ForwardedKey) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, key: ForwardedKey) => cb(key);
      ipcRenderer.on(IPC.SHORTCUT_KEY, listener);
      return () => ipcRenderer.removeListener(IPC.SHORTCUT_KEY, listener);
    },
  },
  windowControls: {
    new: (): Promise<void> => ipcRenderer.invoke(IPC.WINDOW_NEW),
    minimize: (): Promise<void> => ipcRenderer.invoke(IPC.WINDOW_MINIMIZE),
    maximize: (): Promise<void> => ipcRenderer.invoke(IPC.WINDOW_MAXIMIZE),
    close: (): Promise<void> => ipcRenderer.invoke(IPC.WINDOW_CLOSE),
  },
};

contextBridge.exposeInMainWorld('dash', dashApi);

export type DashApi = typeof dashApi;
