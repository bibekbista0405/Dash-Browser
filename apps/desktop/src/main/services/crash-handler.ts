import { app, dialog, type BrowserWindow } from 'electron';
import { appLog } from './app-log';
import { updateFlags } from './app-flags';

const UI_CRASH_WINDOW_MS = 60_000;
const UI_CRASH_LIMIT = 2;
const ERROR_WINDOW_MS = 60_000;
const ERROR_LIMIT = 5;
const GPU_CRASH_LIMIT = 3;

export interface CrashContext {
  win: BrowserWindow;
  /** Returns true when the process belonged to one of this window's tabs. */
  handleTabProcessGone: (webContentsId: number, details: { reason: string }) => boolean;
}

/**
 * Turns "something died" into something recoverable and logged:
 *  - a tab's page process dies  -> that tab shows a clear page with Try again; other tabs are untouched
 *  - the browser window's own UI dies -> reload it (state lives in the main process); if it keeps dying, say so
 *  - the graphics process keeps dying -> next start uses software rendering
 *  - unexpected errors in the main process are logged, not allowed to show a raw crash box
 */
export function installCrashHandlers(getContexts: () => CrashContext[]): void {
  const errorTimes: number[] = [];
  let errorDialogOpen = false;
  const onUnexpected = (kind: string, err: unknown): void => {
    appLog(`${kind}: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    const now = Date.now();
    errorTimes.push(now);
    while (errorTimes.length && now - errorTimes[0] > ERROR_WINDOW_MS) errorTimes.shift();
    if (errorTimes.length > ERROR_LIMIT && !errorDialogOpen && app.isReady()) {
      errorDialogOpen = true;
      void dialog
        .showMessageBox({
          type: 'error',
          message: 'DASH ran into repeated internal errors',
          detail: 'You can keep going, or restart DASH to clear the problem. Your open tabs will be offered back after a restart.',
          buttons: ['Keep going', 'Restart DASH'],
          defaultId: 1,
          cancelId: 0,
        })
        .then(({ response }) => {
          errorDialogOpen = false;
          errorTimes.length = 0;
          if (response === 1) {
            app.relaunch();
            app.exit(0);
          }
        });
    }
  };
  process.on('uncaughtException', (err) => onUnexpected('Uncaught exception', err));
  process.on('unhandledRejection', (reason) => onUnexpected('Unhandled rejection', reason));

  const uiCrashes = new Map<number, number[]>();
  app.on('render-process-gone', (_event, wc, details) => {
    if (details.reason === 'clean-exit') return;
    const contexts = getContexts();
    for (const ctx of contexts) {
      if (ctx.handleTabProcessGone(wc.id, details)) return;
    }
    const ui = contexts.find((c) => c.win.webContents.id === wc.id);
    if (!ui) {
      appLog(`Render process gone (not a tab or window UI): reason=${details.reason}`);
      return;
    }
    appLog(`Window UI process gone: reason=${details.reason} exitCode=${details.exitCode}`);
    const now = Date.now();
    const times = (uiCrashes.get(wc.id) ?? []).filter((t) => now - t < UI_CRASH_WINDOW_MS);
    times.push(now);
    uiCrashes.set(wc.id, times);
    if (times.length <= UI_CRASH_LIMIT) {
      try {
        wc.reload();
      } catch (err) {
        appLog(`Could not reload window UI: ${String(err)}`);
      }
      return;
    }
    void dialog
      .showMessageBox(ui.win, {
        type: 'error',
        message: "DASH's window stopped working repeatedly",
        detail: 'Restarting DASH usually fixes this. Your open tabs will be offered back afterwards.',
        buttons: ['Restart DASH', 'Quit'],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) app.relaunch();
        app.exit(0);
      });
  });

  let gpuCrashes = 0;
  app.on('child-process-gone', (_event, details) => {
    appLog(`Child process gone: type=${details.type} reason=${details.reason} exitCode=${details.exitCode} name=${details.name ?? ''}`);
    if (details.type !== 'GPU' || details.reason === 'clean-exit') return;
    gpuCrashes++;
    if (gpuCrashes === GPU_CRASH_LIMIT) {
      updateFlags({ gpuFallback: true });
      appLog('Graphics process crashed repeatedly: software rendering will be used from the next start');
      void dialog
        .showMessageBox({
          type: 'warning',
          message: 'DASH is having trouble with your graphics driver',
          detail: 'Restart DASH to switch to safe (software) rendering. Pages may be a little slower but should stop crashing.',
          buttons: ['Restart now', 'Later'],
          defaultId: 0,
          cancelId: 1,
        })
        .then(({ response }) => {
          if (response === 0) {
            app.relaunch();
            app.exit(0);
          }
        });
    }
  });
}
