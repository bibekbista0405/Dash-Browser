import { ipcMain, WebContents, dialog, nativeImage, app, webContents as electronWebContents, session } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IPC, type DashSettings, type PermissionDecision, SEARCH_ENGINES } from '../../shared/ipc-channels';
import type { DownloadManager } from '../services/download-manager';
import type { BlockedCountTracker } from '../services/blocked-count-tracker';
import type { PasswordManager } from '../services/password-manager';
import type { PermissionManager } from '../services/permission-manager';
import type { ExtensionManager } from '../services/extension-manager';
import { BookmarksIO } from '../services/bookmarks-io';
import { getDatabase } from '../db/database';
import { getContextForSender, getAllWindowContexts } from '../window-context';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dragIconPath = path.join(__dirname, '../../resources/drag-file-icon.png');

function assertString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 8192) {
    throw new Error(`DASH: invalid value for "${field}"`);
  }
}

function assertNumber(value: unknown, field: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`DASH: invalid value for "${field}"`);
  }
}

/** Every handler needs a valid sender — either the chrome window itself, or a trusted internal-page tab (dash://history etc). Never an ordinary content tab. */
function requireContext(sender: WebContents) {
  const context = getContextForSender(sender.id);
  if (!context) throw new Error('DASH: rejected IPC call from an unrecognized window');
  return context;
}

export interface IpcServices {
  downloadManager: DownloadManager;
  tracker: BlockedCountTracker;
  passwordManager: PasswordManager;
  permissionManager: PermissionManager;
  extensionManager: ExtensionManager;
  onSettingsChanged: (settings: DashSettings) => void;
  createWindow: () => void;
  respondToLoginSavePrompt: (promptId: string, save: boolean) => void;
}

/**
 * Registered exactly ONCE for the whole app's lifetime — ipcMain.handle
 * channels are global, not per-window. Every handler resolves "which
 * window is this for" from the sender via requireContext(), so this
 * correctly supports any number of open windows.
 */
export function registerIpcHandlers(services: IpcServices): void {
  const {
    downloadManager,
    tracker,
    passwordManager,
    permissionManager,
    extensionManager,
    onSettingsChanged,
    createWindow,
    respondToLoginSavePrompt,
  } = services;

  // ---- Tabs ----
  ipcMain.handle(IPC.TAB_CREATE, (e, url?: unknown, isPrivate?: unknown) => {
    const { tabManager } = requireContext(e.sender);
    if (url !== undefined) assertString(url, 'url');
    if (isPrivate !== undefined && typeof isPrivate !== 'boolean') {
      throw new Error('DASH: invalid value for "isPrivate"');
    }
    return tabManager.createTab(url as string | undefined, isPrivate as boolean | undefined);
  });

  ipcMain.handle(IPC.TAB_CLOSE, (e, id: unknown) => {
    const { tabManager } = requireContext(e.sender);
    assertString(id, 'id');
    tabManager.closeTab(id);
  });

  ipcMain.handle(IPC.TAB_SWITCH, (e, id: unknown) => {
    const { tabManager } = requireContext(e.sender);
    assertString(id, 'id');
    tabManager.switchTab(id);
  });

  ipcMain.handle(IPC.TAB_NAVIGATE, (e, id: unknown, url: unknown) => {
    const { tabManager } = requireContext(e.sender);
    assertString(id, 'id');
    assertString(url, 'url');
    tabManager.navigate(id, url);
  });

  ipcMain.handle(IPC.TAB_GO_BACK, (e, id: unknown) => {
    const { tabManager } = requireContext(e.sender);
    assertString(id, 'id');
    tabManager.goBack(id);
  });

  ipcMain.handle(IPC.TAB_GO_FORWARD, (e, id: unknown) => {
    const { tabManager } = requireContext(e.sender);
    assertString(id, 'id');
    tabManager.goForward(id);
  });

  ipcMain.handle(IPC.TAB_GO_HOME, (e, id: unknown) => {
    const { tabManager } = requireContext(e.sender);
    assertString(id, 'id');
    tabManager.goHome(id);
  });

  ipcMain.handle(IPC.TAB_RELOAD, (e, id: unknown) => {
    const { tabManager } = requireContext(e.sender);
    assertString(id, 'id');
    tabManager.reload(id);
  });

  ipcMain.handle(IPC.TAB_STOP, (e, id: unknown) => {
    const { tabManager } = requireContext(e.sender);
    assertString(id, 'id');
    tabManager.stop(id);
  });

  ipcMain.handle(IPC.TABS_SNAPSHOT, (e) => {
    const { tabManager } = requireContext(e.sender);
    return tabManager.getAllTabStates();
  });

  ipcMain.handle(IPC.TAB_DUPLICATE, (e, id: unknown) => {
    const { tabManager } = requireContext(e.sender);
    assertString(id, 'id');
    return tabManager.duplicateTab(id);
  });

  ipcMain.handle(IPC.TAB_TOGGLE_PIN, (e, id: unknown) => {
    const { tabManager } = requireContext(e.sender);
    assertString(id, 'id');
    tabManager.togglePin(id);
  });

  ipcMain.handle(IPC.TAB_TOGGLE_MUTE, (e, id: unknown) => {
    const { tabManager } = requireContext(e.sender);
    assertString(id, 'id');
    tabManager.toggleMute(id);
  });

  ipcMain.handle(IPC.TAB_REOPEN_CLOSED, (e) => {
    const { tabManager } = requireContext(e.sender);
    return tabManager.reopenClosedTab();
  });

  ipcMain.handle(IPC.TAB_REORDER, (e, orderedIds: unknown) => {
    const { tabManager } = requireContext(e.sender);
    if (!Array.isArray(orderedIds) || !orderedIds.every((id) => typeof id === 'string')) {
      throw new Error('DASH: invalid tab order payload');
    }
    tabManager.reorderTabs(orderedIds);
  });

  // ---- Find in page ----
  ipcMain.handle(IPC.FIND_IN_PAGE_START, (e, id: unknown, text: unknown, forward: unknown) => {
    const { tabManager, win } = requireContext(e.sender);
    assertString(id, 'id');
    assertString(text, 'text');
    tabManager.findInPage(id, text, forward !== false, (matches: number, activeMatchOrdinal: number) => {
      win.webContents.send(IPC.FIND_IN_PAGE_RESULT, { matches, activeMatchOrdinal });
    });
  });

  ipcMain.handle(IPC.FIND_IN_PAGE_NEXT, (e, id: unknown, forward: unknown) => {
    const { tabManager } = requireContext(e.sender);
    assertString(id, 'id');
    tabManager.findNext(id, forward !== false);
  });

  ipcMain.handle(IPC.FIND_IN_PAGE_STOP, (e, id: unknown) => {
    const { tabManager } = requireContext(e.sender);
    assertString(id, 'id');
    tabManager.stopFindInPage(id);
  });

  // ---- Zoom ----
  ipcMain.handle(IPC.ZOOM_IN, (e, id: unknown) => {
    const { tabManager } = requireContext(e.sender);
    assertString(id, 'id');
    tabManager.zoomIn(id);
  });
  ipcMain.handle(IPC.ZOOM_OUT, (e, id: unknown) => {
    const { tabManager } = requireContext(e.sender);
    assertString(id, 'id');
    tabManager.zoomOut(id);
  });
  ipcMain.handle(IPC.ZOOM_RESET, (e, id: unknown) => {
    const { tabManager } = requireContext(e.sender);
    assertString(id, 'id');
    tabManager.zoomReset(id);
  });

  // ---- Page actions ----
  ipcMain.handle(IPC.PAGE_PRINT, (e, id: unknown) => {
    const { tabManager } = requireContext(e.sender);
    assertString(id, 'id');
    tabManager.print(id);
  });

  ipcMain.handle(IPC.PAGE_SAVE, async (e, id: unknown) => {
    const { tabManager, win } = requireContext(e.sender);
    assertString(id, 'id');
    const result = await dialog.showSaveDialog(win, {
      title: 'Save Page',
      defaultPath: 'page.html',
      filters: [{ name: 'Web Page', extensions: ['html'] }],
    });
    if (result.canceled || !result.filePath) return;
    await tabManager.savePage(id, result.filePath);
  });

  ipcMain.handle(IPC.DEVTOOLS_TOGGLE, (e, id: unknown) => {
    const { tabManager } = requireContext(e.sender);
    assertString(id, 'id');
    tabManager.toggleDevTools(id);
  });

  // ---- History ----
  ipcMain.handle(IPC.HISTORY_QUERY, (e, term: unknown) => {
    requireContext(e.sender);
    const search = typeof term === 'string' ? term : '';
    return getDatabase().queryHistory(search);
  });

  ipcMain.handle(IPC.HISTORY_DELETE, (e, id: unknown) => {
    requireContext(e.sender);
    assertNumber(id, 'id');
    getDatabase().deleteHistoryEntry(id);
  });

  ipcMain.handle(IPC.HISTORY_CLEAR, (e) => {
    requireContext(e.sender);
    getDatabase().clearHistory();
  });

  // ---- Bookmarks ----
  ipcMain.handle(IPC.BOOKMARK_ADD, (e, url: unknown, title: unknown, faviconUrl?: unknown) => {
    requireContext(e.sender);
    assertString(url, 'url');
    assertString(title, 'title');
    if (faviconUrl !== undefined && faviconUrl !== null) assertString(faviconUrl, 'faviconUrl');
    return getDatabase().addBookmark(url, title, null, (faviconUrl as string | undefined) ?? null);
  });

  ipcMain.handle(IPC.BOOKMARK_REMOVE, (e, id: unknown) => {
    requireContext(e.sender);
    assertNumber(id, 'id');
    getDatabase().removeBookmark(id);
  });

  ipcMain.handle(IPC.BOOKMARK_LIST, (e) => {
    requireContext(e.sender);
    return getDatabase().listBookmarks();
  });

  const bookmarksIO = new BookmarksIO();

  ipcMain.handle(IPC.BOOKMARKS_EXPORT, async (e) => {
    const { win } = requireContext(e.sender);
    return bookmarksIO.export(win);
  });

  ipcMain.handle(IPC.BOOKMARKS_IMPORT, async (e) => {
    const { win } = requireContext(e.sender);
    return bookmarksIO.import(win);
  });

  // ---- Suggestions ----
  ipcMain.handle(IPC.SUGGESTIONS_QUERY, (e, term: unknown) => {
    requireContext(e.sender);
    const search = typeof term === 'string' ? term : '';
    return getDatabase().querySuggestions(search);
  });

  // ---- Downloads ----
  ipcMain.handle(IPC.DOWNLOAD_LIST, (e) => {
    requireContext(e.sender);
    return getDatabase().listDownloads();
  });

  ipcMain.handle(IPC.DOWNLOAD_CANCEL, (e, id: unknown) => {
    requireContext(e.sender);
    assertNumber(id, 'id');
    downloadManager.cancel(id);
  });

  ipcMain.handle(IPC.DOWNLOAD_PAUSE, (e, id: unknown) => {
    requireContext(e.sender);
    assertNumber(id, 'id');
    downloadManager.pause(id);
  });

  ipcMain.handle(IPC.DOWNLOAD_RESUME, (e, id: unknown) => {
    requireContext(e.sender);
    assertNumber(id, 'id');
    downloadManager.resume(id);
  });

  ipcMain.handle(IPC.DOWNLOAD_REMOVE, (e, id: unknown) => {
    requireContext(e.sender);
    assertNumber(id, 'id');
    getDatabase().removeDownloadRecord(id);
  });

  ipcMain.handle(IPC.DOWNLOAD_OPEN_FILE, (e, savePath: unknown) => {
    requireContext(e.sender);
    assertString(savePath, 'savePath');
    downloadManager.openFile(savePath);
  });

  ipcMain.handle(IPC.DOWNLOAD_SHOW_IN_FOLDER, (e, savePath: unknown) => {
    requireContext(e.sender);
    assertString(savePath, 'savePath');
    downloadManager.showInFolder(savePath);
  });

  ipcMain.handle(IPC.DOWNLOAD_START_DRAG, (e, savePath: unknown) => {
    requireContext(e.sender);
    assertString(savePath, 'savePath');
    // Real OS-level drag-out: lets the user drag a completed download
    // straight from the panel onto the desktop or another app, exactly
    // like dragging a file out of Chrome's or Finder's download tray.
    e.sender.startDrag({ file: savePath, icon: nativeImage.createFromPath(dragIconPath) });
  });

  // ---- Passwords ----
  ipcMain.handle(IPC.PASSWORD_ADD, (e, origin: unknown, username: unknown, password: unknown) => {
    requireContext(e.sender);
    assertString(origin, 'origin');
    assertString(username, 'username');
    assertString(password, 'password');
    return passwordManager.add(origin, username, password);
  });

  ipcMain.handle(IPC.PASSWORD_LIST, (e) => {
    requireContext(e.sender);
    return passwordManager.list();
  });

  ipcMain.handle(IPC.PASSWORD_REVEAL, (e, id: unknown) => {
    requireContext(e.sender);
    assertNumber(id, 'id');
    return passwordManager.reveal(id);
  });

  ipcMain.handle(IPC.PASSWORD_REMOVE, (e, id: unknown) => {
    requireContext(e.sender);
    assertNumber(id, 'id');
    passwordManager.remove(id);
  });

  ipcMain.handle(IPC.PASSWORD_SAVE_PROMPT_RESPOND, (e, promptId: unknown, save: unknown) => {
    requireContext(e.sender);
    assertString(promptId, 'promptId');
    if (typeof save !== 'boolean') throw new Error('DASH: invalid value for "save"');
    respondToLoginSavePrompt(promptId, save);
  });

  // ---- Permissions ----
  ipcMain.handle(IPC.PERMISSION_LIST, (e) => {
    requireContext(e.sender);
    return getDatabase().listPermissions();
  });

  const KNOWN_PERMISSIONS = ['notifications', 'geolocation', 'camera', 'microphone', 'clipboard-read'] as const;

  ipcMain.handle(IPC.PERMISSION_SET, (e, origin: unknown, permission: unknown, decision: unknown) => {
    requireContext(e.sender);
    assertString(origin, 'origin');
    assertString(permission, 'permission');
    if (!(KNOWN_PERMISSIONS as readonly string[]).includes(permission)) {
      throw new Error(`DASH: unknown permission "${permission}"`);
    }
    if (decision !== 'granted' && decision !== 'denied') throw new Error('DASH: invalid permission decision');
    getDatabase().setPermissionDecision(origin, permission as (typeof KNOWN_PERMISSIONS)[number], decision as PermissionDecision);
  });

  ipcMain.handle(IPC.PERMISSION_REMOVE, (e, id: unknown) => {
    requireContext(e.sender);
    assertNumber(id, 'id');
    getDatabase().removePermission(id);
  });

  ipcMain.handle(IPC.PERMISSION_REQUEST_RESPOND, (e, requestId: unknown, decision: unknown) => {
    requireContext(e.sender);
    assertString(requestId, 'requestId');
    if (decision !== 'granted' && decision !== 'denied') throw new Error('DASH: invalid permission decision');
    permissionManager.respond(requestId, decision as PermissionDecision);
  });

  // ---- Settings ----
  ipcMain.handle(IPC.SETTINGS_GET_ALL, (e) => {
    requireContext(e.sender);
    return getDatabase().getAllSettings();
  });

  ipcMain.handle(IPC.SETTINGS_SET, (e, key: unknown, value: unknown) => {
    requireContext(e.sender);
    assertString(key, 'key');
    if (typeof value !== 'string') throw new Error('DASH: invalid setting value');

    switch (key as keyof DashSettings) {
      case 'searchEngine':
        if (!(value in SEARCH_ENGINES)) throw new Error(`DASH: unknown search engine "${value}"`);
        getDatabase().setSetting('searchEngine', value as DashSettings['searchEngine']);
        break;
      case 'theme':
        if (!['dark', 'light', 'system'].includes(value)) throw new Error(`DASH: unknown theme "${value}"`);
        getDatabase().setSetting('theme', value as DashSettings['theme']);
        break;
      case 'homepage':
        assertString(value, 'homepage');
        getDatabase().setSetting('homepage', value);
        break;
      case 'startupBehavior':
        if (!['homepage', 'restore'].includes(value)) throw new Error(`DASH: unknown startup behavior "${value}"`);
        getDatabase().setSetting('startupBehavior', value as DashSettings['startupBehavior']);
        break;
      case 'sleepingTabsEnabled':
        if (value !== 'true' && value !== 'false') throw new Error(`DASH: invalid boolean "${value}"`);
        getDatabase().setSetting('sleepingTabsEnabled', value === 'true');
        break;
      case 'adBlockingEnabled':
        if (value !== 'true' && value !== 'false') throw new Error(`DASH: invalid boolean "${value}"`);
        getDatabase().setSetting('adBlockingEnabled', value === 'true');
        break;
      case 'trackerBlockingEnabled':
        if (value !== 'true' && value !== 'false') throw new Error(`DASH: invalid boolean "${value}"`);
        getDatabase().setSetting('trackerBlockingEnabled', value === 'true');
        break;
      case 'httpsOnlyMode':
        if (value !== 'true' && value !== 'false') throw new Error(`DASH: invalid boolean "${value}"`);
        getDatabase().setSetting('httpsOnlyMode', value === 'true');
        break;
      default:
        throw new Error(`DASH: unknown setting "${key}"`);
    }
    onSettingsChanged(getDatabase().getAllSettings());
  });

  ipcMain.handle(IPC.SETTINGS_RESET, (e) => {
    requireContext(e.sender);
    getDatabase().resetSettings();
    onSettingsChanged(getDatabase().getAllSettings());
  });

  // ---- Blocking stats ----
  ipcMain.handle(IPC.BLOCK_STATS_GET, (e) => {
    requireContext(e.sender);
    return { lifetimeTotal: tracker.getLifetimeTotal() };
  });

  // ---- Privacy: Clear browsing data ----
  ipcMain.handle(
    IPC.PRIVACY_CLEAR_BROWSING_DATA,
    async (e, options: unknown) => {
      requireContext(e.sender);
      const opts =
        options && typeof options === 'object'
          ? (options as { history?: boolean; cache?: boolean; cookies?: boolean; downloads?: boolean })
          : {};

      const targetSession = session.defaultSession;

      if (opts.cache) {
        // This is also the real fix for Chromium disk-cache corruption
        // errors ("Critical error found -8", "No file for <hash>") — those
        // happen when the cache directory gets partially written (e.g. the
        // disk ran out of space mid-write) and Chromium can't reconcile its
        // index with what's actually on disk. clearCache() wipes and
        // rebuilds it cleanly rather than trying to repair it in place.
        await targetSession.clearCache();
      }
      if (opts.cookies) {
        await targetSession.clearStorageData({
          storages: ['cookies', 'localstorage', 'indexdb', 'websql', 'serviceworkers', 'cachestorage'],
        });
      }
      if (opts.history) {
        getDatabase().clearHistory();
      }
      if (opts.downloads) {
        for (const d of getDatabase().listDownloads()) {
          getDatabase().removeDownloadRecord(d.id);
        }
      }
    }
  );

  // ---- Extensions ----
  ipcMain.handle(IPC.EXTENSIONS_LOAD, async (e) => {
    const { win } = requireContext(e.sender);
    return extensionManager.loadFromPicker(win);
  });

  ipcMain.handle(IPC.EXTENSIONS_LIST, (e) => {
    requireContext(e.sender);
    return extensionManager.list();
  });

  ipcMain.handle(IPC.EXTENSIONS_REMOVE, (e, extensionId: unknown) => {
    requireContext(e.sender);
    assertString(extensionId, 'extensionId');
    extensionManager.remove(extensionId);
  });

  // ---- Task Manager ----
  ipcMain.handle(IPC.TASK_MANAGER_SNAPSHOT, (e) => {
    requireContext(e.sender);
    const contexts = getAllWindowContexts();

    const labelForWebContentsId = (webContentsId: number): string | null => {
      for (const { tabManager } of contexts) {
        const tabId = tabManager.findTabIdByWebContentsId(webContentsId);
        if (tabId) return tabManager.getTabTitle(tabId);
      }
      return null;
    };

    // Electron's ProcessMetric doesn't carry a webContents list itself —
    // the real way to correlate a process to the tab(s) running in it is
    // webContents.getAllWebContents(), matched by OS process id.
    const allWebContents = electronWebContents.getAllWebContents();

    return app.getAppMetrics().map((metric) => {
      let label: string = metric.type;
      if (metric.type === 'Tab') {
        const owned = allWebContents.filter((wc) => {
          try {
            return wc.getOSProcessId() === metric.pid;
          } catch {
            return false;
          }
        });
        const matched = owned.map((wc) => labelForWebContentsId(wc.id)).find((l): l is string => !!l);
        if (matched) label = matched;
      }
      return {
        pid: metric.pid,
        type: metric.type,
        label,
        memoryMB: Math.round((metric.memory.workingSetSize / 1024) * 10) / 10,
        cpuPercent: Math.round(metric.cpu.percentCPUUsage * 10) / 10,
      };
    });
  });

  ipcMain.handle(IPC.TASK_MANAGER_END_PROCESS, (e, pid: unknown) => {
    requireContext(e.sender);
    if (typeof pid !== 'number') throw new Error('DASH: invalid pid');

    // Only ever end an actual TAB process, and only via our own tab
    // lifecycle (closeTab) rather than an OS-level kill — force-killing an
    // arbitrary Chromium process (GPU, network service, browser process
    // itself) is how you crash the whole app, not "end a task."
    const metric = app.getAppMetrics().find((m) => m.pid === pid);
    if (!metric || metric.type !== 'Tab') return;

    const owned = electronWebContents.getAllWebContents().filter((wc) => {
      try {
        return wc.getOSProcessId() === pid;
      } catch {
        return false;
      }
    });

    for (const wc of owned) {
      for (const { tabManager } of getAllWindowContexts()) {
        const tabId = tabManager.findTabIdByWebContentsId(wc.id);
        if (tabId) {
          tabManager.closeTab(tabId);
          return;
        }
      }
    }
  });

  // ---- Window ----
  ipcMain.handle(IPC.WINDOW_NEW, (e) => {
    requireContext(e.sender);
    createWindow();
  });

  ipcMain.handle(IPC.WINDOW_MINIMIZE, (e) => {
    const { win } = requireContext(e.sender);
    win.minimize();
  });

  ipcMain.handle(IPC.WINDOW_MAXIMIZE, (e) => {
    const { win } = requireContext(e.sender);
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  });

  ipcMain.handle(IPC.WINDOW_CLOSE, (e) => {
    const { win } = requireContext(e.sender);
    win.close();
  });
}
