import { safeStorage } from 'electron';
import { randomInt } from 'node:crypto';
import { generatePassword, type ImportedLogin } from '@dash/browser-core';
import { getDatabase } from '../db/database';
import type { PasswordEntry } from '../../shared/ipc-channels';

/**
 * Encrypts with Electron's `safeStorage`, which delegates to the OS's own
 * credential store — Keychain on macOS, DPAPI on Windows, libsecret/kwallet
 * on Linux. DASH never implements its own cipher; the encrypted bytes are
 * meaningless outside the OS account that created them, same as every
 * mainstream browser's password manager.
 */
export class PasswordManager {
  isAvailable(): boolean {
    return safeStorage.isEncryptionAvailable();
  }

  add(origin: string, username: string, plainPassword: string): PasswordEntry {
    if (!this.isAvailable()) {
      throw new Error(
        'DASH: OS-level secure storage is unavailable on this machine, so DASH will not save this password unencrypted.'
      );
    }
    const encrypted = safeStorage.encryptString(plainPassword);
    return getDatabase().addPassword(origin, username, new Uint8Array(encrypted));
  }

  list(): PasswordEntry[] {
    return getDatabase().listPasswords();
  }

  /** Only ever called on an explicit, user-initiated reveal/copy — never proactively. */
  reveal(id: number): string {
    const encrypted = getDatabase().getEncryptedPassword(id);
    if (!encrypted) throw new Error('DASH: password not found');
    return safeStorage.decryptString(Buffer.from(encrypted));
  }

  /** Replaces the stored password of an existing login (a site's password changed). */
  update(id: number, plainPassword: string): void {
    if (!this.isAvailable()) throw new Error('DASH: OS-level secure storage is unavailable, so the password was not updated.');
    getDatabase().updatePassword(id, new Uint8Array(safeStorage.encryptString(plainPassword)));
  }

  /** The saved login for this exact origin and username, if any. */
  find(origin: string, username: string): PasswordEntry | null {
    return this.list().find((p) => p.origin === origin && p.username === username) ?? null;
  }

  /** True when the saved password for this login is different from `plain` (or cannot be read). */
  differsFrom(entry: PasswordEntry, plain: string): boolean {
    try {
      return this.reveal(entry.id) !== plain;
    } catch {
      return true;
    }
  }

  /** Every login saved for EXACTLY this origin (scheme+host+port), newest first, with passwords decrypted. Never matches sibling subdomains. */
  findAllForOrigin(origin: string): { username: string; password: string }[] {
    if (!this.isAvailable()) return [];
    const out: { username: string; password: string }[] = [];
    for (const p of this.list().filter((x) => x.origin === origin).sort((a, b) => b.id - a.id)) {
      try {
        out.push({ username: p.username, password: this.reveal(p.id) });
      } catch {
        /* cannot be decrypted on this device */
      }
    }
    return out;
  }

  /**
   * Credential to autofill automatically: only when EXACTLY one login is saved for this origin.
   * With several, guessing could fill the wrong account, so the person picks from the right-click menu instead.
   */
  findForOrigin(origin: string): { username: string; password: string } | null {
    const all = this.findAllForOrigin(origin);
    return all.length === 1 ? all[0] : null;
  }

  generate(length?: number): string {
    return generatePassword(randomInt, length);
  }

  /** Adds logins from an import; a login already saved for the same site and username is left as it is. */
  importLogins(logins: ImportedLogin[]): { imported: number; alreadySaved: number } {
    if (!this.isAvailable()) {
      throw new Error('DASH: OS-level secure storage is unavailable on this machine, so DASH will not import passwords unencrypted.');
    }
    const existing = new Set(this.list().map((p) => `${p.origin}\n${p.username}`));
    let imported = 0;
    let alreadySaved = 0;
    for (const l of logins) {
      const key = `${l.origin}\n${l.username}`;
      if (existing.has(key)) {
        alreadySaved++;
        continue;
      }
      existing.add(key);
      this.add(l.origin, l.username, l.password);
      imported++;
    }
    return { imported, alreadySaved };
  }

  remove(id: number): void {
    getDatabase().removePassword(id);
  }
}
