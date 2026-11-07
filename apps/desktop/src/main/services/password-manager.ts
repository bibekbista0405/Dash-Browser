import { safeStorage } from 'electron';
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

  /**
   * Credential to autofill for EXACTLY this origin (scheme+host+port), most
   * recently saved first. Never matches sibling subdomains or other schemes.
   * Returns null if secure storage is unavailable or nothing is saved.
   */
  findForOrigin(origin: string): { username: string; password: string } | null {
    if (!this.isAvailable()) return null;
    const matches = this.list().filter((p) => p.origin === origin);
    if (matches.length === 0) return null;
    const latest = matches.reduce((a, b) => (b.id > a.id ? b : a));
    try {
      return { username: latest.username, password: this.reveal(latest.id) };
    } catch {
      return null;
    }
  }

  remove(id: number): void {
    getDatabase().removePassword(id);
  }
}
