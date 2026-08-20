import { app, BrowserWindow, session, type WebContentsView } from 'electron';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { TabManager } from './services/tab-manager';
import { createDownloadManager } from './services/download-manager';
import { RequestBlocker } from './services/request-blocker';
import { BlockedCountTracker } from './services/blocked-count-tracker';
import { PasswordManager } from './services/password-manager';
import { PermissionManager } from './services/permission-manager';
import { ExtensionManager } from './services/extension-manager';
import { LoginDetector, type DetectedLogin } from './services/login-detector';
import { registerIpcHandlers } from './ipc/register-ipc';
import { registerWindowContext, unregisterWindowContext, getAllWindowContexts } from './window-context';
import { IPC, type DashSettings } from '../shared/ipc-channels';
import { getDatabase } from './db/database';
import { checkForUpdatesInBackground } from './services/updater';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !!process.env.VITE_DEV_SERVER_URL;

/** Sends an event to every open DASH window's chrome — used for app-wide state like settings and downloads. */
function broadcast(channel: string, payload: unknown): void {
  for (const { win } of getAllWindowContexts()) {
    win.webContents.send(channel, payload);
  }
}

interface PendingLoginSave {
  origin: string;
  username: string;
  password: string;
}

app.whenReady().then(async () => {
  getDatabase(); // opens/migrates the local SQLite file eagerly

  // ---- App-level singletons ----
  // These MUST be created once for the whole app, not per-window: Electron
  // keeps only the last-registered webRequest.onBeforeRequest listener per
  // session, and session.on('will-download') would double-fire to every
  // instance if we created more than one. session.defaultSession is itself
  // an app-wide singleton, so anything hooked to it follows the same rule.
  let sharedSettings: DashSettings = getDatabase().getAllSettings();
  const tracker = new BlockedCountTracker();
  const passwordManager = new PasswordManager();
  const extensionManager = new ExtensionManager();

  // Electron doesn't remember loaded extensions across restarts on its
  // own — reload whatever was previously loaded before any window opens,
  // so extensions are active from the very first page a user sees.
  await extensionManager.restorePersisted();

  const downloadManager = createDownloadManager((entry) => {
    broadcast(IPC.DOWNLOAD_STATE_CHANGED, entry);
  });

  new RequestBlocker(session.defaultSession, () => sharedSettings, tracker);

  const permissionManager = new PermissionManager(
    session.defaultSession,
    (requestId, origin, permission) => {
      broadcast(IPC.PERMISSION_REQUEST_PROMPT, { requestId, origin, permission });
    },
    true // persisted — normal browsing
  );

  const pendingLoginSaves = new Map<string, PendingLoginSave>();

  function handleDetectedLogin(detected: DetectedLogin): void {
    if (detected.webContentsId === undefined) return;
    if (passwordManager.list().some((p) => p.origin === detected.origin && p.username === detected.username)) return;

    for (const { win, tabManager } of getAllWindowContexts()) {
      const tabId = tabManager.findTabIdByWebContentsId(detected.webContentsId);
      if (!tabId) continue;
      const promptId = randomUUID();
      pendingLoginSaves.set(promptId, {
        origin: detected.origin,
        username: detected.username,
        password: detected.password,
      });
      win.webContents.send(IPC.PASSWORD_SAVE_PROMPT, {
        promptId,
        origin: detected.origin,
        username: detected.username,
      });
      return;
    }
  }

  // Login detection is intentionally NOT attached to any private-browsing
  // session — offering to save a password is itself a record that you
  // logged into that site, which private browsing should never create.
  new LoginDetector(session.defaultSession, handleDetectedLogin);

  function respondToLoginSavePrompt(promptId: string, save: boolean): void {
    const pending = pendingLoginSaves.get(promptId);
    pendingLoginSaves.delete(promptId);
    if (!pending || !save) return;
    passwordManager.add(pending.origin, pending.username, pending.password);
  }

  // ---- App-wide session persistence ----
  // Covers EVERY open window, not just the first — each window's tab URLs
  // are saved as its own array, in window-creation order, and restored the
  // same shape on next launch (one new BrowserWindow per saved array).
  let saveSessionTimeout: ReturnType<typeof setTimeout> | null = null;
  function scheduleSessionSave(): void {
    if (saveSessionTimeout) clearTimeout(saveSessionTimeout);
    saveSessionTimeout = setTimeout(() => {
      const perWindowUrls = getAllWindowContexts().map(({ tabManager }) => tabManager.getRestorableUrls());
      getDatabase().saveSessionTabs(perWindowUrls);
    }, 800);
  }

  registerIpcHandlers({
    downloadManager,
    tracker,
    passwordManager,
    permissionManager,
    extensionManager,
    onSettingsChanged: (updated) => {
      sharedSettings = updated;
      broadcast(IPC.SETTINGS_STATE_CHANGED, updated);
    },
    createWindow: () => createWindow(),
    respondToLoginSavePrompt,
  });

  // ---- Per-window creation ----
  /** `initialUrls`, when provided, is only used for the tabs it lists — never triggers a further restore lookup. */
  function createWindow(initialUrls?: string[]): void {
    const win = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 760,
      minHeight: 480,
      frame: false, // custom chrome — drawn by the React toolbar
      backgroundColor: '#0b0d10',
      titleBarStyle: 'hidden',
      icon: path.join(__dirname, '../../resources/icon.png'),
      webPreferences: {
        preload: path.join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    if (isDev) {
      win.loadURL(process.env.VITE_DEV_SERVER_URL!);
    } else {
      win.loadFile(path.join(__dirname, '../renderer/index.html'));
    }

    const internalPagePreloadPath = path.join(__dirname, '../preload/index.js');

    /**
     * Internal pages (History/Downloads/Bookmarks/Settings) need different
     * loading in dev vs prod, same as the main window itself does above:
     * dev serves everything from Vite's dev server (no dist-electron/
     * renderer/internal.html exists yet at that point), prod loads the
     * real built file.
     */
    const loadInternalPage = async (view: WebContentsView, page: string, tabId: string): Promise<void> => {
      if (isDev) {
        const url = new URL('internal.html', process.env.VITE_DEV_SERVER_URL!);
        url.searchParams.set('page', page);
        url.searchParams.set('tabId', tabId);
        await view.webContents.loadURL(url.toString());
      } else {
        await view.webContents.loadFile(path.join(__dirname, '../renderer/internal.html'), {
          query: { page, tabId },
        });
      }
    };

    const tabManager = new TabManager(
      win,
      (state) => {
        win.webContents.send(IPC.TAB_STATE_CHANGED, state);
        scheduleSessionSave();
      },
      () => sharedSettings,
      scheduleSessionSave,
      tracker,
      internalPagePreloadPath,
      loadInternalPage
    );

    // Private tabs in THIS window get their own isolated session, so it
    // needs its own RequestBlocker (one onBeforeRequest listener per
    // session, remember) and its own non-persisted PermissionManager.
    new RequestBlocker(tabManager.getPrivateSession(), () => sharedSettings, tracker);
    new PermissionManager(
      tabManager.getPrivateSession(),
      (requestId, origin, permission) => {
        win.webContents.send(IPC.PERMISSION_REQUEST_PROMPT, { requestId, origin, permission });
      },
      false // never persisted — private browsing
    );

    registerWindowContext({ win, tabManager });

    win.webContents.once('did-finish-load', () => {
      if (initialUrls && initialUrls.length > 0) {
        for (const url of initialUrls) tabManager.createTab(url);
      } else {
        tabManager.createTab();
      }
    });

    win.on('closed', () => {
      tabManager.dispose();
      unregisterWindowContext(win.webContents.id);
      scheduleSessionSave();
    });
  }

  // ---- Startup: restore every saved window, or just one fresh New Tab Page ----
  if (sharedSettings.startupBehavior === 'restore') {
    const savedWindows = getDatabase().getSessionTabs();
    if (savedWindows.length > 0) {
      for (const urls of savedWindows) createWindow(urls);
    } else {
      createWindow();
    }
  } else {
    createWindow();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  checkForUpdatesInBackground();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
