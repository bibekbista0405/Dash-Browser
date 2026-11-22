import { ipcMain, session, type IpcMainInvokeEvent, type WebContents } from 'electron';
import { IPC, type AppLockStatus } from '../../shared/ipc-channels';
import { getContextForSender } from '../window-context';
import { getAppLock } from '../services/app-lock';
import type { AppLockResult } from '../services/app-lock/engine';
import { getDatabase } from '../db/database';

/** App Lock's IPC: DASH's own windows only, every argument checked here, answers never include the verifier. */
function trusted(sender: WebContents): void {
  if (!getContextForSender(sender.id, sender)) throw new Error('DASH: rejected IPC call from an unrecognized window');
}

function handle<T>(channel: string, fn: (...args: unknown[]) => Promise<AppLockResult<T>> | AppLockResult<T>): void {
  ipcMain.handle(channel, async (e: IpcMainInvokeEvent, ...args: unknown[]): Promise<AppLockResult<T>> => {
    trusted(e.sender);
    try {
      return await fn(...args);
    } catch (err) {
      console.warn('[DASH] App Lock call failed:', (err as Error).message);
      return { ok: false, code: 'ERROR', message: 'Something went wrong. Nothing was changed.' };
    }
  });
}

const str = (v: unknown): string => (typeof v === 'string' && v.length <= 1024 ? v : '');

export function registerAppLockIpc(): void {
  const lock = getAppLock;
  ipcMain.handle(IPC.APP_LOCK_STATUS, (e): AppLockStatus => {
    trusted(e.sender);
    return lock().status();
  });
  handle(IPC.APP_LOCK_ENABLE, (pw, confirm, idle) => lock().enable(str(pw), str(confirm), idle));
  handle(IPC.APP_LOCK_DISABLE, (pw) => lock().disable(str(pw)));
  handle(IPC.APP_LOCK_CHANGE, (cur, next, confirm) => lock().change(str(cur), str(next), str(confirm)));
  handle(IPC.APP_LOCK_SET_IDLE, (pw, minutes) => lock().setIdleMinutes(str(pw), minutes));
  handle(IPC.APP_LOCK_UNLOCK, (pw) => lock().unlock(str(pw)));
  handle(IPC.APP_LOCK_LOCK, () => ({ ok: true as const, value: lock().lock() }));
  handle(IPC.APP_LOCK_ERASE, (typed) =>
    lock().eraseAndReset(typed, async () => {
      // Order matters: if any step throws, the lock stays on.
      await session.defaultSession.clearStorageData();
      await session.defaultSession.clearCache();
      getDatabase().wipeUserData();
    })
  );
}
