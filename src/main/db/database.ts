import Database from 'better-sqlite3';
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import {
  type HistoryEntry,
  type BookmarkEntry,
  type DownloadEntry,
  type DownloadState,
  type DashSettings,
  type PasswordEntry,
  type PermissionRecord,
  type PermissionName,
  type PermissionDecision,
  DEFAULT_SETTINGS,
} from '../../shared/ipc-channels';

/**
 * DASH local-first database.
 * Everything lives on disk under the user's app-data directory.
 * Nothing here ever touches the network.
 */
class DashDatabase {
  private db: Database.Database;

  constructor() {
    const userDataPath = app.getPath('userData');
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    const dbPath = path.join(userDataPath, 'dash.sqlite');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        favicon_url TEXT,
        visited_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_history_visited_at ON history(visited_at DESC);
      CREATE INDEX IF NOT EXISTS idx_history_url ON history(url);

      CREATE TABLE IF NOT EXISTS bookmarks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        favicon_url TEXT,
        folder TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_bookmarks_url ON bookmarks(url);

      CREATE TABLE IF NOT EXISTS downloads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        url TEXT NOT NULL,
        save_path TEXT NOT NULL,
        total_bytes INTEGER NOT NULL DEFAULT 0,
        received_bytes INTEGER NOT NULL DEFAULT 0,
        state TEXT NOT NULL DEFAULT 'progressing',
        started_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS session_tabs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        window_index INTEGER NOT NULL DEFAULT 0,
        url TEXT NOT NULL,
        position INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS passwords (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        origin TEXT NOT NULL,
        username TEXT NOT NULL,
        encrypted_password BLOB NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_passwords_origin ON passwords(origin);

      CREATE TABLE IF NOT EXISTS permissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        origin TEXT NOT NULL,
        permission TEXT NOT NULL,
        decision TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(origin, permission)
      );

      CREATE TABLE IF NOT EXISTS extensions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        folder_path TEXT NOT NULL UNIQUE,
        loaded_at INTEGER NOT NULL
      );
    `);

    // Column migrations for databases created by earlier milestones —
    // `CREATE TABLE IF NOT EXISTS` never alters an existing table, so a
    // real ALTER TABLE is needed for anyone upgrading from before
    // multi-window session restore existed.
    const sessionTabsColumns = this.db.prepare(`PRAGMA table_info(session_tabs)`).all() as { name: string }[];
    if (!sessionTabsColumns.some((c) => c.name === 'window_index')) {
      this.db.exec(`ALTER TABLE session_tabs ADD COLUMN window_index INTEGER NOT NULL DEFAULT 0`);
    }

    const historyColumns = this.db.prepare(`PRAGMA table_info(history)`).all() as { name: string }[];
    if (!historyColumns.some((c) => c.name === 'favicon_url')) {
      this.db.exec(`ALTER TABLE history ADD COLUMN favicon_url TEXT`);
    }

    const bookmarkColumns = this.db.prepare(`PRAGMA table_info(bookmarks)`).all() as { name: string }[];
    if (!bookmarkColumns.some((c) => c.name === 'favicon_url')) {
      this.db.exec(`ALTER TABLE bookmarks ADD COLUMN favicon_url TEXT`);
    }
  }

  // ---- History ----
  addHistoryEntry(url: string, title: string, faviconUrl: string | null = null): void {
    // Never log internal/private pages, or the New Tab Page's own data: URL.
    if (url.startsWith('dash://') || url.startsWith('about:blank') || url.startsWith('data:')) return;
    this.db
      .prepare(`INSERT INTO history (url, title, favicon_url, visited_at) VALUES (?, ?, ?, ?)`)
      .run(url, title, faviconUrl, Date.now());
  }

  queryHistory(searchTerm: string, limit = 200): HistoryEntry[] {
    const rows = searchTerm
      ? this.db
          .prepare(
            `SELECT id, url, title, favicon_url as faviconUrl, visited_at as visitedAt FROM history
             WHERE url LIKE ? OR title LIKE ?
             ORDER BY visited_at DESC LIMIT ?`
          )
          .all(`%${searchTerm}%`, `%${searchTerm}%`, limit)
      : this.db
          .prepare(
            `SELECT id, url, title, favicon_url as faviconUrl, visited_at as visitedAt FROM history ORDER BY visited_at DESC LIMIT ?`
          )
          .all(limit);
    return rows as HistoryEntry[];
  }

  deleteHistoryEntry(id: number): void {
    this.db.prepare(`DELETE FROM history WHERE id = ?`).run(id);
  }

  clearHistory(): void {
    this.db.prepare(`DELETE FROM history`).run();
  }

  // ---- Bookmarks ----
  addBookmark(url: string, title: string, folder: string | null, faviconUrl: string | null = null): BookmarkEntry {
    const info = this.db
      .prepare(`INSERT INTO bookmarks (url, title, favicon_url, folder, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(url, title, faviconUrl, folder, Date.now());
    return {
      id: Number(info.lastInsertRowid),
      url,
      title,
      faviconUrl,
      folder,
      createdAt: Date.now(),
    };
  }

  removeBookmark(id: number): void {
    this.db.prepare(`DELETE FROM bookmarks WHERE id = ?`).run(id);
  }

  listBookmarks(): BookmarkEntry[] {
    const rows = this.db
      .prepare(
        `SELECT id, url, title, favicon_url as faviconUrl, folder, created_at as createdAt FROM bookmarks ORDER BY created_at DESC`
      )
      .all();
    return rows as BookmarkEntry[];
  }

  // ---- Downloads ----
  insertDownload(filename: string, url: string, savePath: string, totalBytes: number): number {
    const info = this.db
      .prepare(
        `INSERT INTO downloads (filename, url, save_path, total_bytes, received_bytes, state, started_at)
         VALUES (?, ?, ?, ?, 0, 'progressing', ?)`
      )
      .run(filename, url, savePath, totalBytes, Date.now());
    return Number(info.lastInsertRowid);
  }

  updateDownloadProgress(id: number, receivedBytes: number, totalBytes: number): void {
    this.db
      .prepare(`UPDATE downloads SET received_bytes = ?, total_bytes = ? WHERE id = ?`)
      .run(receivedBytes, totalBytes, id);
  }

  updateDownloadState(id: number, state: DownloadState): void {
    this.db.prepare(`UPDATE downloads SET state = ? WHERE id = ?`).run(state, id);
  }

  listDownloads(limit = 200): DownloadEntry[] {
    const rows = this.db
      .prepare(
        `SELECT id, filename, url, save_path as savePath, total_bytes as totalBytes,
                received_bytes as receivedBytes, state, started_at as startedAt
         FROM downloads ORDER BY started_at DESC LIMIT ?`
      )
      .all(limit) as Omit<DownloadEntry, 'canPause' | 'canResume'>[];
    return rows.map((r) => ({
      ...r,
      canPause: r.state === 'progressing',
      canResume: r.state === 'paused',
    }));
  }

  removeDownloadRecord(id: number): void {
    this.db.prepare(`DELETE FROM downloads WHERE id = ?`).run(id);
  }

  // ---- Settings ----
  getAllSettings(): DashSettings {
    const rows = this.db.prepare(`SELECT key, value FROM settings`).all() as { key: string; value: string }[];
    const stored: Record<string, string> = {};
    for (const row of rows) stored[row.key] = row.value;

    return {
      searchEngine: (stored.searchEngine as DashSettings['searchEngine']) ?? DEFAULT_SETTINGS.searchEngine,
      homepage: stored.homepage ?? DEFAULT_SETTINGS.homepage,
      theme: (stored.theme as DashSettings['theme']) ?? DEFAULT_SETTINGS.theme,
      startupBehavior: (stored.startupBehavior as DashSettings['startupBehavior']) ?? DEFAULT_SETTINGS.startupBehavior,
      sleepingTabsEnabled: stored.sleepingTabsEnabled ? stored.sleepingTabsEnabled === 'true' : DEFAULT_SETTINGS.sleepingTabsEnabled,
      adBlockingEnabled: stored.adBlockingEnabled ? stored.adBlockingEnabled === 'true' : DEFAULT_SETTINGS.adBlockingEnabled,
      trackerBlockingEnabled: stored.trackerBlockingEnabled
        ? stored.trackerBlockingEnabled === 'true'
        : DEFAULT_SETTINGS.trackerBlockingEnabled,
      httpsOnlyMode: stored.httpsOnlyMode ? stored.httpsOnlyMode === 'true' : DEFAULT_SETTINGS.httpsOnlyMode,
    };
  }

  setSetting<K extends keyof DashSettings>(key: K, value: DashSettings[K]): void {
    this.db
      .prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
      .run(key, String(value));
  }

  resetSettings(): void {
    this.db.prepare(`DELETE FROM settings`).run();
  }

  // ---- Session restore ----
  /** Replaces the entire saved session in one transaction — one array of URLs per window, in window order. */
  saveSessionTabs(windows: string[][]): void {
    const tx = this.db.transaction((data: string[][]) => {
      this.db.prepare(`DELETE FROM session_tabs`).run();
      const insert = this.db.prepare(`INSERT INTO session_tabs (window_index, url, position) VALUES (?, ?, ?)`);
      data.forEach((urls, windowIndex) => {
        urls.forEach((url, position) => insert.run(windowIndex, url, position));
      });
    });
    tx(windows);
  }

  /** Returns one array of URLs per window, ordered by window_index then position. */
  getSessionTabs(): string[][] {
    const rows = this.db
      .prepare(`SELECT window_index as windowIndex, url FROM session_tabs ORDER BY window_index ASC, position ASC`)
      .all() as { windowIndex: number; url: string }[];
    const windows: string[][] = [];
    for (const row of rows) {
      if (!windows[row.windowIndex]) windows[row.windowIndex] = [];
      windows[row.windowIndex].push(row.url);
    }
    return windows.filter((w) => w && w.length > 0);
  }

  clearSessionTabs(): void {
    this.db.prepare(`DELETE FROM session_tabs`).run();
  }

  // ---- Blocking stats ----
  getBlockedCountLifetime(): number {
    const row = this.db.prepare(`SELECT value FROM settings WHERE key = 'blockedCountLifetime'`).get() as
      | { value: string }
      | undefined;
    return row ? parseInt(row.value, 10) || 0 : 0;
  }

  setBlockedCountLifetime(total: number): void {
    this.db
      .prepare(`INSERT INTO settings (key, value) VALUES ('blockedCountLifetime', ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
      .run(String(total));
  }

  // ---- Passwords (encrypted bytes only — never decrypts, that's the caller's job) ----
  addPassword(origin: string, username: string, encryptedPassword: Uint8Array): PasswordEntry {
    const info = this.db
      .prepare(`INSERT INTO passwords (origin, username, encrypted_password, created_at) VALUES (?, ?, ?, ?)`)
      .run(origin, username, Buffer.from(encryptedPassword), Date.now());
    return { id: Number(info.lastInsertRowid), origin, username, createdAt: Date.now() };
  }

  listPasswords(): PasswordEntry[] {
    const rows = this.db
      .prepare(`SELECT id, origin, username, created_at as createdAt FROM passwords ORDER BY origin ASC`)
      .all();
    return rows as PasswordEntry[];
  }

  passwordExists(origin: string, username: string): boolean {
    const row = this.db.prepare(`SELECT 1 FROM passwords WHERE origin = ? AND username = ?`).get(origin, username);
    return !!row;
  }

  getEncryptedPassword(id: number): Uint8Array | null {
    const row = this.db.prepare(`SELECT encrypted_password as encryptedPassword FROM passwords WHERE id = ?`).get(id) as
      | { encryptedPassword: Buffer }
      | undefined;
    return row ? new Uint8Array(row.encryptedPassword) : null;
  }

  removePassword(id: number): void {
    this.db.prepare(`DELETE FROM passwords WHERE id = ?`).run(id);
  }

  // ---- Permissions ----
  getPermissionDecision(origin: string, permission: PermissionName): PermissionDecision | null {
    const row = this.db
      .prepare(`SELECT decision FROM permissions WHERE origin = ? AND permission = ?`)
      .get(origin, permission) as { decision: PermissionDecision } | undefined;
    return row?.decision ?? null;
  }

  setPermissionDecision(origin: string, permission: PermissionName, decision: PermissionDecision): void {
    this.db
      .prepare(
        `INSERT INTO permissions (origin, permission, decision, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(origin, permission) DO UPDATE SET decision = excluded.decision, updated_at = excluded.updated_at`
      )
      .run(origin, permission, decision, Date.now());
  }

  listPermissions(): PermissionRecord[] {
    const rows = this.db
      .prepare(`SELECT id, origin, permission, decision, updated_at as updatedAt FROM permissions ORDER BY updated_at DESC`)
      .all();
    return rows as PermissionRecord[];
  }

  removePermission(id: number): void {
    this.db.prepare(`DELETE FROM permissions WHERE id = ?`).run(id);
  }

  // ---- Omnibox suggestions ----
  querySuggestions(term: string, limit = 6): { type: 'history' | 'bookmark'; url: string; title: string; faviconUrl: string | null }[] {
    if (!term.trim()) return [];
    const like = `%${term}%`;
    const bookmarkRows = this.db
      .prepare(`SELECT url, title, favicon_url as faviconUrl FROM bookmarks WHERE url LIKE ? OR title LIKE ? LIMIT ?`)
      .all(like, like, limit) as { url: string; title: string; faviconUrl: string | null }[];
    const historyRows = this.db
      .prepare(
        `SELECT url, title, favicon_url as faviconUrl FROM history WHERE url LIKE ? OR title LIKE ? ORDER BY visited_at DESC LIMIT ?`
      )
      .all(like, like, limit) as { url: string; title: string; faviconUrl: string | null }[];

    const seen = new Set<string>();
    const results: { type: 'history' | 'bookmark'; url: string; title: string; faviconUrl: string | null }[] = [];
    for (const row of bookmarkRows) {
      if (seen.has(row.url)) continue;
      seen.add(row.url);
      results.push({ type: 'bookmark', url: row.url, title: row.title, faviconUrl: row.faviconUrl });
    }
    for (const row of historyRows) {
      if (seen.has(row.url) || results.length >= limit) continue;
      seen.add(row.url);
      results.push({ type: 'history', url: row.url, title: row.title, faviconUrl: row.faviconUrl });
    }
    return results.slice(0, limit);
  }

  // ---- New Tab Page ----
  /** Real "most visited" — grouped by URL, ranked by visit count, matching Chrome's New Tab Page concept. */
  getTopSites(limit = 8): { url: string; title: string; faviconUrl: string | null; visitCount: number }[] {
    const rows = this.db
      .prepare(
        `SELECT url, MAX(title) as title,
                (SELECT favicon_url FROM history h2 WHERE h2.url = history.url AND h2.favicon_url IS NOT NULL ORDER BY h2.visited_at DESC LIMIT 1) as faviconUrl,
                COUNT(*) as visitCount
         FROM history
         GROUP BY url
         ORDER BY visitCount DESC, MAX(visited_at) DESC
         LIMIT ?`
      )
      .all(limit) as { url: string; title: string; faviconUrl: string | null; visitCount: number }[];
    return rows;
  }

  // ---- Extensions ----
  /** We only persist the folder PATH — the extension's own manifest/files stay wherever the user pointed us. */
  addExtensionPath(folderPath: string): void {
    this.db
      .prepare(`INSERT OR IGNORE INTO extensions (folder_path, loaded_at) VALUES (?, ?)`)
      .run(folderPath, Date.now());
  }

  listExtensionPaths(): string[] {
    const rows = this.db.prepare(`SELECT folder_path FROM extensions ORDER BY loaded_at ASC`).all() as {
      folder_path: string;
    }[];
    return rows.map((r) => r.folder_path);
  }

  removeExtensionPath(folderPath: string): void {
    this.db.prepare(`DELETE FROM extensions WHERE folder_path = ?`).run(folderPath);
  }

  close(): void {
    this.db.close();
  }
}

let instance: DashDatabase | null = null;

export function getDatabase(): DashDatabase {
  if (!instance) instance = new DashDatabase();
  return instance;
}
