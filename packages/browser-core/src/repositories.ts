import type { HistoryEntry, BookmarkEntry, DownloadEntry, DownloadState, PasswordEntry, PermissionRecord, PermissionName, PermissionDecision } from './types';
import type { DashSettings } from './settings';

/**
 * Every platform implements these against its own storage engine — desktop
 * uses better-sqlite3 today; a mobile platform might use SQLite via a
 * different binding, or WatermelonDB, or anything else. Nothing in
 * browser-core or the UI layer should ever import a storage engine
 * directly; it should only ever depend on these shapes.
 */
export interface HistoryRepository {
  add(url: string, title: string): void;
  query(searchTerm: string, limit?: number): HistoryEntry[];
  delete(id: number): void;
  clear(): void;
}

export interface BookmarkRepository {
  add(url: string, title: string, folder: string | null): BookmarkEntry;
  remove(id: number): void;
  list(): BookmarkEntry[];
}

export interface DownloadRepository {
  insert(filename: string, url: string, savePath: string, totalBytes: number): number;
  updateProgress(id: number, receivedBytes: number, totalBytes: number): void;
  updateState(id: number, state: DownloadState): void;
  list(limit?: number): DownloadEntry[];
  remove(id: number): void;
}

export interface SettingsRepository {
  getAll(): DashSettings;
  set<K extends keyof DashSettings>(key: K, value: DashSettings[K]): void;
  reset(): void;
}

export interface SessionRepository {
  saveOpenTabs(urls: string[]): void;
  getOpenTabs(): string[];
  clearOpenTabs(): void;
}

export interface PasswordRepository {
  add(origin: string, username: string, encryptedPassword: Uint8Array): PasswordEntry;
  list(): PasswordEntry[];
  /** Returns the raw encrypted bytes for platform-specific decryption; never decrypts itself. */
  getEncrypted(id: number): Uint8Array | null;
  remove(id: number): void;
}

export interface PermissionRepository {
  getDecision(origin: string, permission: PermissionName): PermissionDecision | null;
  setDecision(origin: string, permission: PermissionName, decision: PermissionDecision): void;
  list(): PermissionRecord[];
  remove(id: number): void;
}
