import { app, BrowserWindow, dialog, nativeTheme, session, type WebContentsView } from 'electron';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { TabManager } from './services/tab-manager';
import { createDownloadManager } from './services/download-manager';
import { RequestBlocker } from './services/request-blocker';
import { installYoutubeAdPreload } from './services/youtube-adblock';
import { BlockedCountTracker } from './services/blocked-count-tracker';
import { PasswordManager } from './services/password-manager';
import { PermissionManager } from './services/permission-manager';
import { ExtensionManager } from './services/extension-manager';
import { VpnManager } from './services/vpn-manager';
import { HeaderPolicy } from './services/header-policy';
import { applyDnsSettings } from './services/dns';
import { LoginDetector, type DetectedLogin } from './services/login-detector';
import { registerIpcHandlers } from './ipc/register-ipc';
import {
  registerWindowContext,
  unregisterWindowContext,
  getAllWindowContexts,
  registerInternalPage,
  unregisterInternalPage,
  getAllInternalPageWebContents,
} from './window-context';
import { IPC, type DashSettings, parseHostList } from '../shared/ipc-channels';
import { clearSiteDataExcept } from './services/exit-cleanup';
import { getDatabase } from './db/database';
import { checkForUpdatesInBackground } from './services/updater';
import { applySpellcheck } from './services/spellcheck';
import { appLog, logPath } from './services/app-log';
import { readFlags, updateFlags } from './services/app-flags';
import { setRecoverable } from './services/session-recovery';
import { installCrashHandlers } from './services/crash-handler';
import { takeDatabaseRecoveryNote, type SessionLayout } from './db/database';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !!process.env.VITE_DEV_SERVER_URL;

/** Sends an event to every open DASH window's chrome — used for app-wide state like settings and downloads. */
let vpnRef: VpnManager | null = null;
const writeStartupLog = appLog;
const startupLogPath = logPath;

function titleBarOverlayFor(isDark: boolean): { color: string; symbolColor: string; height: number } {
  return isDark
    ? { color: '#0b0d10', symbolColor: '#a7adb8', height: 40 }
    : { color: '#ffffff', symbolColor: '#5a606b', height: 40 };
}

function broadcast(channel: string, payload: unknown): void {
  for (const { win } of getAllWindowContexts()) {
    win.webContents.send(channel, payload);
  }
  // win.webContents.send() only reaches the chrome shell (the React app
  // rendering the tab strip/address bar) — it does NOT reach any tab
  // living inside that window, including our own internal pages. Without
  // this, dash://settings would never see a settings change made
  // elsewhere, and dash://downloads would never see live download
  // progress while the tab was open.
  for (const wc of getAllInternalPageWebContents()) {
    wc.send(channel, payload);
  }
}

interface PendingLoginSave {
  origin: string;
  username: string;
  password: string;
  /** Set when this is a changed password for a login that is already saved. */
  updateId?: number;
}

// ---- Before ready: one instance, safe rendering after repeated graphics crashes, unclean-exit detection ----
const gotInstanceLock = app.requestSingleInstanceLock();
if (!gotInstanceLock) {
  // Another DASH already owns this profile; it is brought to the front by its 'second-instance' handler.
  app.quit();
}
const startFlags = gotInstanceLock ? readFlags() : { running: false, gpuFallback: false };
const lastRunEndedBadly = startFlags.running;
if (startFlags.gpuFallback) {
  app.disableHardwareAcceleration();
  appLog('Starting with software rendering (graphics process crashed repeatedly last time)');
  updateFlags({ gpuFallback: false }); // one safe run, then try normal rendering again
}
if (gotInstanceLock) updateFlags({ running: true });
if (lastRunEndedBadly) appLog('Previous run did not exit cleanly');
// A normal quit clears `running` in will-quit; a kill, crash or power loss leaves it set, which is how the next start knows.

app.on('second-instance', () => {
  const wins = BrowserWindow.getAllWindows();
  const win = wins[0];
  if (win) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
});

app.whenReady().then(async () => {
  if (!gotInstanceLock) return;
  getDatabase(); // opens/migrates the local SQLite file eagerly (a damaged file is set aside and replaced)
  const dbNote = takeDatabaseRecoveryNote();
  if (dbNote) {
    appLog(`Database was damaged and has been set aside at ${dbNote}`);
    void dialog.showMessageBox({
      type: 'warning',
      message: 'DASH had to start with a fresh data file',
      detail: `Your saved history, bookmarks and settings could not be read, so the damaged file was kept at:\n${dbNote}\n\nDASH started with empty data.`,
    });
  }
  // After an abnormal exit, the last saved tabs are offered (once) on the New Tab page instead of silently reopened.
  if (lastRunEndedBadly) {
    try {
      setRecoverable(getDatabase().getSessionTabs());
    } catch {
      /* nothing to offer */
    }
  }
  installCrashHandlers(() =>
    getAllWindowContexts().map(({ win, tabManager }) => ({
      win,
      handleTabProcessGone: (id, details) => tabManager.handleRenderProcessGone(id, details),
    }))
  );
  getDatabase(); // opens/migrates the local SQLite file eagerly

  // ---- App-level singletons ----
  // These MUST be created once for the whole app, not per-window: Electron
  // keeps only the last-registered webRequest.onBeforeRequest listener per
  // session, and session.on('will-download') would double-fire to every
  // instance if we created more than one. session.defaultSession is itself
  // an app-wide singleton, so anything hooked to it follows the same rule.
  let sharedSettings: DashSettings = getDatabase().getAllSettings();
  // Make Chromium (and therefore every website's prefers-color-scheme) follow DASH's theme setting.
  nativeTheme.themeSource = sharedSettings.theme;
  applyDnsSettings(sharedSettings);
  const tracker = new BlockedCountTracker();
  const passwordManager = new PasswordManager();
  const extensionManager = new ExtensionManager();

  // Electron doesn't remember loaded extensions across restarts on its
  // own — reload whatever was previously loaded before any window opens,
  // so extensions are active from the very first page a user sees.
  await extensionManager.restorePersisted();

  // VPN (proxy tunnel). Off unless the user turned on "connect on startup"; credentials never leave this process.
  const vpn = (vpnRef = new VpnManager((state) => broadcast(IPC.VPN_STATE_CHANGED, state), writeStartupLog));
  vpn.addSession(session.defaultSession);
  applySpellcheck(session.defaultSession, sharedSettings);
  app.on('login', (event, _wc, _details, authInfo, callback) => {
    const creds = vpn.handleLogin(authInfo);
    if (creds) {
      event.preventDefault();
      callback(creds.username, creds.password);
    }
  });
  await vpn.connectOnStartupIfWanted();

  const downloadManager = createDownloadManager((entry) => {
    broadcast(IPC.DOWNLOAD_STATE_CHANGED, entry);
  });

  new RequestBlocker(session.defaultSession, () => sharedSettings, tracker);
  installYoutubeAdPreload([session.defaultSession], () => sharedSettings.adBlockingEnabled, () => sharedSettings.sendPrivacySignals, () => sharedSettings.fingerprintProtection);

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
    const saved = passwordManager.find(detected.origin, detected.username);
    // Same login, same password: nothing to ask. Same login, new password: offer to update it.
    if (saved && !passwordManager.differsFrom(saved, detected.password)) return;

    for (const { win, tabManager } of getAllWindowContexts()) {
      const tabId = tabManager.findTabIdByWebContentsId(detected.webContentsId);
      if (!tabId) continue;
      const promptId = randomUUID();
      pendingLoginSaves.set(promptId, {
        origin: detected.origin,
        username: detected.username,
        password: detected.password,
        updateId: saved?.id,
      });
      win.webContents.send(IPC.PASSWORD_SAVE_PROMPT, {
        promptId,
        origin: detected.origin,
        username: detected.username,
        isUpdate: !!saved,
      });
      return;
    }
  }

  // Login detection is intentionally NOT attached to any private-browsing
  // session — offering to save a password is itself a record that you
  // logged into that site, which private browsing should never create.
  new HeaderPolicy(session.defaultSession, () => sharedSettings, new LoginDetector(handleDetectedLogin));

  function respondToLoginSavePrompt(promptId: string, save: boolean): void {
    const pending = pendingLoginSaves.get(promptId);
    pendingLoginSaves.delete(promptId);
    if (!pending || !save) return;
    if (pending.updateId !== undefined) passwordManager.update(pending.updateId, pending.password);
    else passwordManager.add(pending.origin, pending.username, pending.password);
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
      if (exitCleanupDone) return;
      try {
        getDatabase().saveSessionTabs(perWindowUrls, getAllWindowContexts().map(({ tabManager }) => tabManager.getRestorableLayout()));
      } catch (err) {
        appLog(`Could not save session: ${String(err)}`);
      }
    }, 800);
  }

  registerIpcHandlers({
    downloadManager,
    tracker,
    passwordManager,
    permissionManager,
    extensionManager,
    vpn,
    onSettingsChanged: (updated) => {
      sharedSettings = updated;
      nativeTheme.themeSource = updated.theme;
      applyDnsSettings(updated);
      applySpellcheck(session.defaultSession, updated);
      for (const { tabManager } of getAllWindowContexts()) applySpellcheck(tabManager.getPrivateSession(), updated);
      for (const { tabManager } of getAllWindowContexts()) tabManager.applyThemeBackground();
      // Layout depends on settings (bookmarks bar, vertical tabs); re-run it now that the cached settings are current.
      for (const { tabManager } of getAllWindowContexts()) tabManager.layoutActiveView();
      if (process.platform !== 'darwin') {
        for (const { win } of getAllWindowContexts()) {
          try {
            win.setTitleBarOverlay(titleBarOverlayFor(nativeTheme.shouldUseDarkColors));
            win.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#0b0d10' : '#ffffff');
          } catch {
            /* window may be closing */
          }
        }
      }
      broadcast(IPC.SETTINGS_STATE_CHANGED, updated);
    },
    onBookmarksChanged: () => broadcast(IPC.BOOKMARKS_CHANGED, null),
    createWindow: (urls, at) => createWindow(urls, undefined, at),
    respondToLoginSavePrompt,
  });

  // ---- Per-window creation ----
  /** `initialUrls`, when provided, is only used for the tabs it lists — never triggers a further restore lookup. */
  function createWindow(initialUrls?: string[], layout?: SessionLayout, at?: { x: number; y: number }): void {
    const win = new BrowserWindow({
      ...(at ? { x: Math.round(at.x), y: Math.round(at.y) } : {}),
      width: 1280,
      height: 800,
      minWidth: 760,
      minHeight: 480,
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#0b0d10' : '#ffffff',
      // Native window buttons (minimize/maximize/close) drawn as an overlay on top of our
      // custom tab strip; macOS gets its traffic lights. Without this a frameless window
      // has no way to be minimized or closed with the mouse.
      titleBarStyle: 'hidden',
      ...(process.platform !== 'darwin' ? { titleBarOverlay: titleBarOverlayFor(nativeTheme.shouldUseDarkColors) } : {}),
      icon: path.join(__dirname, '../../resources/icon-512.png'),
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

    // Forward-declared so the trust/untrust callbacks (needed by TabManager's
    // constructor, before TabManager itself exists) can close over the
    // eventual {win, tabManager} pair without a chicken-and-egg problem —
    // they're never actually invoked until after materialize() runs, which
    // only happens once a tab is created, safely after everything below
    // is fully constructed.
    const contextRef: { current: { win: BrowserWindow; tabManager: TabManager } | null } = { current: null };

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
      loadInternalPage,
      (wc) => registerInternalPage(wc, contextRef.current!),
      (webContentsId) => unregisterInternalPage(webContentsId),
      (origin) => passwordManager.findForOrigin(origin),
      (origin) => passwordManager.findAllForOrigin(origin),
      () => passwordManager.generate()
    );
    contextRef.current = { win, tabManager };

    // Private tabs in THIS window get their own isolated session, so it
    // needs its own RequestBlocker (one onBeforeRequest listener per
    // session, remember) and its own non-persisted PermissionManager.
    new RequestBlocker(tabManager.getPrivateSession(), () => sharedSettings, tracker, false);
    installYoutubeAdPreload([tabManager.getPrivateSession()], () => sharedSettings.adBlockingEnabled, () => sharedSettings.sendPrivacySignals, () => sharedSettings.fingerprintProtection);
    new HeaderPolicy(tabManager.getPrivateSession(), () => sharedSettings);
    new PermissionManager(
      tabManager.getPrivateSession(),
      (requestId, origin, permission) => {
        win.webContents.send(IPC.PERMISSION_REQUEST_PROMPT, { requestId, origin, permission });
      },
      false // never persisted — private browsing
    );

    vpn.addSession(tabManager.getPrivateSession());
    applySpellcheck(tabManager.getPrivateSession(), sharedSettings);
    registerWindowContext({ win, tabManager });

    win.webContents.once('did-finish-load', () => {
      if (initialUrls && initialUrls.length > 0) {
        const ids = initialUrls.map((url) => tabManager.createTab(url).id);
        if (layout) tabManager.applyRestoredLayout(ids, layout);
      } else {
        tabManager.createTab();
      }
    });

    win.on('closed', () => {
      vpn.removeSession(tabManager.getPrivateSession());
      tabManager.dispose();
      unregisterWindowContext(win.webContents.id);
      scheduleSessionSave();
    });
  }

  // ---- Startup: restore every saved window, or just one fresh New Tab Page ----
  if (sharedSettings.startupBehavior === 'restore') {
    const savedWindows = getDatabase().getSession();
    if (savedWindows.length > 0) {
      for (const w of savedWindows) createWindow(w.urls, w.layout);
    } else {
      createWindow();
    }
  } else {
    createWindow();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // The update check is a direct request outside the tunnel, so skip it while the VPN is routing traffic.
  if (!vpn.isActive()) checkForUpdatesInBackground();
}).catch((err: unknown) => {
  // A startup failure used to leave a running process with no window. Say what went wrong instead.
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  writeStartupLog(`Startup failed: ${message}`);
  dialog.showErrorBox('DASH could not start', `${message}\n\nDetails were saved to ${startupLogPath()}`);
  app.quit();
});

// Auto-clear on exit. Runs once: the first will-quit is held while storage is wiped, then quit resumes.
let exitCleanupDone = false;
function markCleanExit(): void {
  try {
    getDatabase().close();
  } catch {
    /* already closed */
  }
  updateFlags({ running: false });
}
app.on('will-quit', (event) => {
  if (exitCleanupDone) return;
  exitCleanupDone = true;
  try {
    vpnRef?.dispose();
  } catch {
    /* quitting anyway */
  }
  let settings: DashSettings;
  try {
    settings = getDatabase().getAllSettings();
  } catch {
    markCleanExit();
    return;
  }
  if (!settings.clearHistoryOnExit && !settings.clearSiteDataOnExit) {
    markCleanExit();
    return;
  }
  event.preventDefault();
  void (async () => {
    writeStartupLog(`Exit cleanup started (history=${settings.clearHistoryOnExit}, siteData=${settings.clearSiteDataOnExit})`);
    try {
      if (settings.clearHistoryOnExit) getDatabase().clearHistory();
      if (settings.clearSiteDataOnExit) {
        await clearSiteDataExcept(
          session.defaultSession,
          parseHostList(settings.keepSiteDataHosts),
          getDatabase().queryHistory('', 5000).map((h) => h.url),
          writeStartupLog
        );
      }
    } catch (err) {
      writeStartupLog(`Exit cleanup failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      writeStartupLog('Exit cleanup finished');
      markCleanExit();
      app.quit();
    }
  })();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
