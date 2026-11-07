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
  type PermissionName,
  type PermissionDecision,
  type AddressSuggestion,
  type FindResult,
  type ExtensionInfo,
  type TaskProcessInfo,
} from '../shared/ipc-channels';

/**
 * The renderer NEVER gets direct access to ipcRenderer, Node, or fs.
 * Everything it can do is explicitly whitelisted here.
 */
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
  blockStats: {
    get: (): Promise<BlockStats> => ipcRenderer.invoke(IPC.BLOCK_STATS_GET),
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
  windowControls: {
    new: (): Promise<void> => ipcRenderer.invoke(IPC.WINDOW_NEW),
    minimize: (): Promise<void> => ipcRenderer.invoke(IPC.WINDOW_MINIMIZE),
    maximize: (): Promise<void> => ipcRenderer.invoke(IPC.WINDOW_MAXIMIZE),
    close: (): Promise<void> => ipcRenderer.invoke(IPC.WINDOW_CLOSE),
  },
};

contextBridge.exposeInMainWorld('dash', dashApi);

export type DashApi = typeof dashApi;
