import { dialog, ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron';
import fs from 'node:fs';
import { IPC, type WebsiteLockResult, type WebsiteLockStatus } from '../../shared/ipc-channels';
import { getContextForSender } from '../window-context';
import { getWebsiteLock } from '../services/website-lock';
import { webHostOf } from '../services/website-lock/hostname';
import { LockError } from '../services/website-lock/types';

/**
 * Website Lock's IPC. Every call:
 *  - must come from a DASH window (the toolbar or one of DASH's own pages): remote websites have no bridge at all,
 *    and anything else is rejected before any argument is read;
 *  - has every argument checked here, in the main process;
 *  - answers with data that never includes a password hash, salt or recovery verifier;
 *  - never takes "is this site locked?" from the renderer: that is always worked out here.
 */

const str = (v: unknown, max = 512): string => {
  if (typeof v !== 'string' || v.length > max) throw new LockError('INVALID_URL', 'Invalid request.');
  return v;
};
const bool = (v: unknown): boolean => v === true;
const secret = (v: unknown): string => str(v, 1024);

function trusted(sender: WebContents) {
  const ctx = getContextForSender(sender.id, sender);
  if (!ctx) {
    let where = '?';
    try { where = sender.getURL().slice(0, 120); } catch { /* destroyed */ }
    console.warn(`[DASH] Website Lock: rejected a call from an unrecognized window (${where})`);
    throw new Error('DASH: rejected IPC call from an unrecognized window');
  }
  return ctx;
}

function handle<T>(channel: string, fn: (e: IpcMainInvokeEvent, ctx: NonNullable<ReturnType<typeof getContextForSender>>, ...args: unknown[]) => T | Promise<T>): void {
  ipcMain.handle(channel, async (e, ...args): Promise<WebsiteLockResult<T>> => {
    const ctx = trusted(e.sender); // throws for an untrusted sender, before anything else
    try {
      return { ok: true, value: await fn(e, ctx, ...args) };
    } catch (err) {
      if (err instanceof LockError) return { ok: false, code: err.code, message: err.message, retryAfterMs: err.retryAfterMs, attemptsLeft: err.attemptsLeft };
      console.error(`[DASH] Website Lock ${channel} failed:`, err instanceof Error ? err.message : 'unknown error');
      return { ok: false, code: 'FAILED', message: 'Something went wrong. Please try again.' };
    }
  });
}

export function registerWebsiteLockIpc(): void {
  const lock = () => getWebsiteLock();

  handle(IPC.WEBSITE_LOCK_LIST, () => lock().listSites());

  /** The page in front, worked out here from the real tab, not from anything the renderer says. */
  handle(IPC.WEBSITE_LOCK_CURRENT, (_e, ctx): WebsiteLockStatus => {
    const url = ctx.tabManager.getActiveUrl() ?? '';
    const s = lock().statusForUrl(url);
    return { ...s, host: webHostOf(url) };
  });

  /** What this window's lock screen is waiting to open. */
  handle(IPC.WEBSITE_LOCK_PENDING, (e, ctx) => {
    const p = ctx.tabManager.getLockPending(e.sender);
    if (!p) return null;
    const s = lock().statusForUrl(p.url);
    return s.site && !s.unlocked ? { host: webHostOf(p.url), site: s.site } : null;
  });

  /** Unlocks the website the lock screen in the calling tab is waiting for, and nothing else. */
  handle(IPC.WEBSITE_LOCK_UNLOCK_PENDING, async (e, ctx, password) => {
    const p = ctx.tabManager.getLockPending(e.sender);
    const site = p ? lock().statusForUrl(p.url).site : null;
    if (!p || !site) throw new LockError('NOT_FOUND', 'There is nothing to unlock in this tab.');
    await lock().unlock(site.id, secret(password));
    return null;
  });

  handle(IPC.WEBSITE_LOCK_ADD, (_e, _c, input) => {
    const o = (input ?? {}) as Record<string, unknown>;
    return lock().addSite({
      url: str(o.url, 300),
      displayName: typeof o.displayName === 'string' ? str(o.displayName, 60) : undefined,
      password: secret(o.password),
      confirmPassword: secret(o.confirmPassword),
      includeSubdomains: bool(o.includeSubdomains),
    });
  });
  handle(IPC.WEBSITE_LOCK_REMOVE, async (_e, _c, id, password) => {
    await lock().removeSite(str(id, 64), secret(password));
    return null;
  });
  handle(IPC.WEBSITE_LOCK_EDIT, (_e, _c, id, password, changes) => {
    const c = (changes ?? {}) as Record<string, unknown>;
    return lock().editSite(str(id, 64), secret(password), {
      displayName: typeof c.displayName === 'string' ? str(c.displayName, 60) : undefined,
      includeSubdomains: typeof c.includeSubdomains === 'boolean' ? c.includeSubdomains : undefined,
      enabled: typeof c.enabled === 'boolean' ? c.enabled : undefined,
    });
  });
  handle(IPC.WEBSITE_LOCK_ENABLE, (_e, _c, id) => lock().enableSite(str(id, 64)));
  handle(IPC.WEBSITE_LOCK_CHANGE_PASSWORD, async (_e, _c, id, current, next, confirm) => {
    await lock().changePassword(str(id, 64), secret(current), secret(next), secret(confirm));
    return null;
  });
  handle(IPC.WEBSITE_LOCK_LOCK, (_e, _c, id) => {
    lock().lockSite(str(id, 64));
    return null;
  });
  handle(IPC.WEBSITE_LOCK_LOCK_ALL, () => {
    lock().lockAll();
    return null;
  });

  // ---- recovery ----
  handle(IPC.WEBSITE_LOCK_RECOVERY_STATUS, () => ({ configured: lock().isRecoverySet() }));
  handle(IPC.WEBSITE_LOCK_RECOVERY_BEGIN, () => ({ key: lock().beginRecoverySetup() }));
  handle(IPC.WEBSITE_LOCK_RECOVERY_CONFIRM, async (_e, _c, saved) => {
    if (saved !== true) throw new LockError('NO_PENDING_RECOVERY', 'Confirm that you saved the key first.');
    await lock().confirmRecoverySetup();
    return null;
  });
  handle(IPC.WEBSITE_LOCK_RECOVER_SITE, async (_e, _c, id, key, next, confirm) => {
    await lock().recoverSite(str(id, 64), secret(key), secret(next), secret(confirm));
    return null;
  });
  handle(IPC.WEBSITE_LOCK_RECOVERY_REGENERATE, async (_e, _c, currentKey) => ({ key: await lock().regenerateRecoveryKey(secret(currentKey)) }));
  handle(IPC.WEBSITE_LOCK_RESET_REQUEST, (_e, _c, scope) => lock().requestAdminReset(str(scope, 64)));
  handle(IPC.WEBSITE_LOCK_RESET_SITE, async (_e, _c, id, typed, next, confirm) => {
    await lock().adminResetSite(str(id, 64), str(typed, 300), secret(next), secret(confirm));
    return null;
  });
  handle(IPC.WEBSITE_LOCK_RESET_RECOVERY, async (_e, _c, typed) => ({ key: await lock().adminResetRecovery(str(typed, 32)) }));

  /** Saves a recovery key as a text file. The key comes from the renderer only because it was just shown there. */
  handle(IPC.WEBSITE_LOCK_SAVE_RECOVERY_KEY, async (_e, ctx, key) => {
    const text = str(key, 100);
    const r = await dialog.showSaveDialog(ctx.win, {
      title: 'Save your DASH Website Lock recovery key',
      defaultPath: 'DASH-Website-Lock-recovery-key.txt',
      filters: [{ name: 'Text', extensions: ['txt'] }],
    });
    if (r.canceled || !r.filePath) return { saved: false };
    fs.writeFileSync(
      r.filePath,
      `DASH Website Lock recovery key\n\n${text}\n\nKeep this somewhere safe and private. Anyone with this key can reset your website passwords.\nDASH cannot recover it if it is lost.\n`,
      { encoding: 'utf8', mode: 0o600 }
    );
    return { saved: true };
  });

  // ---- encrypted backup ----
  handle(IPC.WEBSITE_LOCK_BACKUP_EXPORT, async (_e, ctx, backupPassword) => {
    const file = await lock().exportBackup(secret(backupPassword));
    const r = await dialog.showSaveDialog(ctx.win, {
      title: 'Save encrypted Website Lock backup',
      defaultPath: 'DASH-Website-Lock-backup.dashlock',
      filters: [{ name: 'DASH Website Lock backup', extensions: ['dashlock'] }],
    });
    if (r.canceled || !r.filePath) return { saved: false };
    fs.writeFileSync(r.filePath, file, { mode: 0o600 });
    return { saved: true };
  });
  handle(IPC.WEBSITE_LOCK_BACKUP_PREVIEW, async (_e, ctx, backupPassword) => {
    const r = await dialog.showOpenDialog(ctx.win, {
      title: 'Open a Website Lock backup',
      properties: ['openFile'],
      filters: [{ name: 'DASH Website Lock backup', extensions: ['dashlock'] }],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    const stat = fs.statSync(r.filePaths[0]);
    if (stat.size > 8 * 1024 * 1024) throw new LockError('BACKUP_INVALID', 'This is not a DASH Website Lock backup.');
    return lock().previewBackup(fs.readFileSync(r.filePaths[0]), secret(backupPassword));
  });
  handle(IPC.WEBSITE_LOCK_BACKUP_APPLY, (_e, _c, token, replaceExisting) => lock().applyBackup(str(token, 128), replaceExisting === true));

  handle(IPC.WEBSITE_LOCK_EVENTS, () => lock().events(50));
}
