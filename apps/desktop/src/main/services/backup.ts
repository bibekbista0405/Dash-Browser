import { dialog, type BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import { getDatabase, type BackupData } from '../db/database';
import type { PasswordManager } from './password-manager';
import { decryptBackup, encryptBackup, MIN_PASSPHRASE_LENGTH } from './backup-crypto';

interface BackupPayload extends BackupData {
  createdAt: number;
  passwords?: { origin: string; username: string; password: string }[];
}

export interface BackupExportResult {
  items: number;
  passwords: number;
}

export interface BackupImportResult {
  counts: Record<string, number>;
  passwords: number;
  passwordsSkipped: string | null;
}

/**
 * Encrypted backup file: settings, bookmarks, per-site zoom, shortcuts, hidden sites, permissions and (optionally)
 * saved passwords, all sealed with a passphrase the user chooses. DASH never uploads it anywhere; to "sync" between
 * computers the user can keep the file in a folder they already sync themselves and import it on the other machine.
 * History and downloads are deliberately not included.
 */
export class BackupService {
  constructor(private readonly passwords: PasswordManager) {}

  async export(win: BrowserWindow, passphrase: string, includePasswords: boolean): Promise<BackupExportResult | null> {
    if (passphrase.length < MIN_PASSPHRASE_LENGTH) throw new Error(`Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters`);
    const picked = await dialog.showSaveDialog(win, {
      title: 'Save encrypted DASH backup',
      defaultPath: `dash-backup-${new Date().toISOString().slice(0, 10)}.dashbackup`,
      filters: [{ name: 'DASH backup', extensions: ['dashbackup'] }],
    });
    if (picked.canceled || !picked.filePath) return null;

    const data = getDatabase().exportBackupData();
    const payload: BackupPayload = { ...data, createdAt: Date.now() };
    let passwordCount = 0;
    if (includePasswords) {
      if (!this.passwords.isAvailable()) throw new Error('OS secure storage is unavailable, so saved passwords cannot be read for the backup.');
      payload.passwords = [];
      for (const p of this.passwords.list()) {
        try {
          payload.passwords.push({ origin: p.origin, username: p.username, password: this.passwords.reveal(p.id) });
        } catch {
          /* cannot be decrypted on this device: leave it out rather than fail the whole backup */
        }
      }
      passwordCount = payload.passwords.length;
    }
    await fs.writeFile(picked.filePath, encryptBackup(payload, passphrase), { encoding: 'utf-8', mode: 0o600 });
    return {
      items: data.bookmarks.length + data.siteZoom.length + data.customShortcuts.length + data.hiddenSites.length + data.permissions.length + Object.keys(data.settings).length,
      passwords: passwordCount,
    };
  }

  async import(win: BrowserWindow, passphrase: string): Promise<BackupImportResult | null> {
    const picked = await dialog.showOpenDialog(win, {
      title: 'Open encrypted DASH backup',
      filters: [{ name: 'DASH backup', extensions: ['dashbackup'] }],
      properties: ['openFile'],
    });
    if (picked.canceled || picked.filePaths.length === 0) return null;
    const stat = await fs.stat(picked.filePaths[0]);
    if (stat.size > 64 * 1024 * 1024) throw new Error('This file is too large to be a DASH backup');
    const payload = decryptBackup(await fs.readFile(picked.filePaths[0], 'utf-8'), passphrase) as BackupPayload;
    if (!payload || typeof payload !== 'object') throw new Error('This is not a DASH backup file');

    const counts = getDatabase().importBackupData(payload);
    let passwords = 0;
    let passwordsSkipped: string | null = null;
    if (Array.isArray(payload.passwords) && payload.passwords.length > 0) {
      if (!this.passwords.isAvailable()) {
        passwordsSkipped = 'OS secure storage is unavailable, so the saved passwords in the backup were not imported.';
      } else {
        const logins = payload.passwords.filter(
          (p) => typeof p?.origin === 'string' && typeof p.username === 'string' && typeof p.password === 'string' && p.password.length > 0
        );
        passwords = this.passwords.importLogins(logins).imported;
      }
    }
    return { counts, passwords, passwordsSkipped };
  }
}
