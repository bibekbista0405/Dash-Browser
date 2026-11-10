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
  type BlockedHostStat,
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
/** What Chromium needs to continue a download in a later run. */
export interface DownloadResumeInfo {
  urlChain: string[];
  mimeType: string;
  eTag: string;
  lastModified: string;
  startTime: number;
}

/** Which restored tab is pinned or in which group, aligned by index with the window's saved URLs. */
export interface SessionLayout {
  tabs: { pinned: boolean; group: number | null }[];
  groups: { name: string; color: string; collapsed: boolean }[];
}

/** Set when a damaged data file was moved aside at start-up (the new path), so the UI can say so once. */
let databaseRecoveryNote: string | null = null;
export function takeDatabaseRecoveryNote(): string | null {
  const n = databaseRecoveryNote;
  databaseRecoveryNote = null;
  return n;
}

export interface BackupData {
  settings: Record<string, string>;
  bookmarks: { url: string; title: string; folder: string | null; createdAt: number }[];
  siteZoom: { host: string; factor: number }[];
  customShortcuts: { host: string; url: string; title: string }[];
  hiddenSites: string[];
  permissions: { origin: string; permission: string; decision: string }[];
}

class DashDatabase {
  private db: Database.Database;

  constructor() {
    const userDataPath = app.getPath('userData');
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    const dbPath = path.join(userDataPath, 'dash.sqlite');
    try {
      this.db = this.open(dbPath);
    } catch (err) {
      // A damaged data file must not leave DASH unable to start: keep it for inspection and start fresh.
      const message = err instanceof Error ? err.message : String(err);
      if (!/not a database|malformed|corrupt|disk image|encrypted/i.test(message)) throw err;
      const kept = `${dbPath}.damaged-${Date.now()}`;
      for (const suffix of ['', '-wal', '-shm']) {
        try {
          fs.renameSync(dbPath + suffix, kept + suffix);
        } catch {
          /* that part did not exist */
        }
      }
      databaseRecoveryNote = kept;
      this.db = this.open(dbPath);
    }
  }

  private open(dbPath: string): Database.Database {
    const db = new Database(dbPath);
    try {
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      this.db = db;
      this.migrate();
      db.prepare('SELECT count(*) FROM sqlite_master').get(); // forces a read, so a damaged file fails here
      return db;
    } catch (err) {
      db.close();
      throw err;
    }
  }

  /** Flushes the write-ahead log and closes the file. Safe to call more than once. */
  close(): void {
    try {
      this.db.pragma('wal_checkpoint(TRUNCATE)');
      this.db.close();
    } catch {
      /* already closed */
    }
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
      CREATE TABLE IF NOT EXISTS block_hosts (
        host TEXT NOT NULL,
        category TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        last_at INTEGER NOT NULL,
        PRIMARY KEY (host, category)
      );

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

      CREATE TABLE IF NOT EXISTS session_groups (
        window_index INTEGER NOT NULL,
        idx INTEGER NOT NULL,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        collapsed INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (window_index, idx)
      );

      CREATE TABLE IF NOT EXISTS passwords (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        origin TEXT NOT NULL,
        username TEXT NOT NULL,
        encrypted_password BLOB NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_passwords_origin ON passwords(origin);

      CREATE TABLE IF NOT EXISTS site_zoom (
        host TEXT PRIMARY KEY,
        factor REAL NOT NULL
      );

      CREATE TABLE IF NOT EXISTS permissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        origin TEXT NOT NULL,
        permission TEXT NOT NULL,
        decision TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE(origin, permission)
      );

      CREATE TABLE IF NOT EXISTS custom_shortcuts (
        host TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        title TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS hidden_sites (
        host TEXT PRIMARY KEY,
        hidden_at INTEGER NOT NULL
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
    // Earlier builds recorded DASH's own internal pages (settings/history/...) in history under
    // their real file/localhost URL. Remove those rows.
    this.db.exec(`DELETE FROM history WHERE url LIKE '%/internal.html?page=%'`);

    const sessionTabsColumns = this.db.prepare(`PRAGMA table_info(session_tabs)`).all() as { name: string }[];
    if (!sessionTabsColumns.some((c) => c.name === 'window_index')) {
      this.db.exec(`ALTER TABLE session_tabs ADD COLUMN window_index INTEGER NOT NULL DEFAULT 0`);
    }
    if (!sessionTabsColumns.some((c) => c.name === 'pinned')) {
      this.db.exec(`ALTER TABLE session_tabs ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0`);
      this.db.exec(`ALTER TABLE session_tabs ADD COLUMN group_idx INTEGER`);
    }

    const downloadColumns = this.db.prepare(`PRAGMA table_info(downloads)`).all() as { name: string }[];
    if (!downloadColumns.some((c) => c.name === 'resume_info')) {
      this.db.exec(`ALTER TABLE downloads ADD COLUMN resume_info TEXT`);
    }

    const historyColumns = this.db.prepare(`PRAGMA table_info(history)`).all() as { name: string }[];
    if (!historyColumns.some((c) => c.name === 'favicon_url')) {
      this.db.exec(`ALTER TABLE history ADD COLUMN favicon_url TEXT`);
    }

    const bookmarkColumns = this.db.prepare(`PRAGMA table_info(bookmarks)`).all() as { name: string }[];
    if (!bookmarkColumns.some((c) => c.name === 'favicon_url')) {
      this.db.exec(`ALTER TABLE bookmarks ADD COLUMN favicon_url TEXT`);
    }
    if (!bookmarkColumns.some((c) => c.name === 'position')) {
      // Manual order. Existing bookmarks keep their old order (oldest first), which is what the bar showed.
      this.db.exec(`ALTER TABLE bookmarks ADD COLUMN position INTEGER NOT NULL DEFAULT 0`);
      this.db.exec(`UPDATE bookmarks SET position = id`);
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

  /** Favicons usually arrive after the page finished loading; attach one to that visit's history row. */
  setLatestHistoryFavicon(url: string, faviconUrl: string): void {
    this.db
      .prepare(
        `UPDATE history SET favicon_url = ? WHERE id = (SELECT MAX(id) FROM history WHERE url = ?) AND favicon_url IS NULL`
      )
      .run(faviconUrl, url);
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
    const existing = this.db
      .prepare(
        `SELECT id, url, title, favicon_url as faviconUrl, folder, created_at as createdAt FROM bookmarks WHERE url = ? LIMIT 1`
      )
      .get(url) as BookmarkEntry | undefined;
    if (existing) return existing;
    const info = this.db
      .prepare(
        `INSERT INTO bookmarks (url, title, favicon_url, folder, created_at, position)
         VALUES (?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM bookmarks))`
      )
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

  setBookmarkFolder(id: number, folder: string | null): void {
    this.db.prepare(`UPDATE bookmarks SET folder = ? WHERE id = ?`).run(folder, id);
  }

  /** Inserts bookmarks whose URL isn't already saved. Returns how many were added. */
  importBookmarks(items: { url: string; title: string; folder: string | null; addedAt: number }[]): number {
    const exists = this.db.prepare(`SELECT 1 FROM bookmarks WHERE url = ? LIMIT 1`);
    const insert = this.db.prepare(
      `INSERT INTO bookmarks (url, title, favicon_url, folder, created_at, position)
       VALUES (?, ?, NULL, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM bookmarks))`
    );
    let added = 0;
    this.db.transaction(() => {
      for (const b of items) {
        if (exists.get(b.url)) continue;
        insert.run(b.url, b.title, b.folder, b.addedAt);
        added += 1;
      }
    })();
    return added;
  }

  /** Inserts history rows that aren't already present (same URL and timestamp). */
  importHistory(items: { url: string; title: string; visitedAt: number }[]): number {
    const exists = this.db.prepare(`SELECT 1 FROM history WHERE url = ? AND visited_at = ? LIMIT 1`);
    const insert = this.db.prepare(`INSERT INTO history (url, title, favicon_url, visited_at) VALUES (?, ?, NULL, ?)`);
    let added = 0;
    this.db.transaction(() => {
      for (const h of items) {
        if (exists.get(h.url, h.visitedAt)) continue;
        insert.run(h.url, h.title, h.visitedAt);
        added += 1;
      }
    })();
    return added;
  }

  /** Puts bookmark `id` just before `beforeId` (or last when null) and optionally changes its folder in the same step. */
  moveBookmark(id: number, beforeId: number | null, folder?: string | null): void {
    this.db.transaction(() => {
      const ids = (this.db.prepare(`SELECT id FROM bookmarks ORDER BY position ASC, id ASC`).all() as { id: number }[])
        .map((r) => r.id)
        .filter((x) => x !== id);
      if (!(this.db.prepare(`SELECT 1 FROM bookmarks WHERE id = ?`).get(id))) return;
      const at = beforeId === null ? -1 : ids.indexOf(beforeId);
      if (at < 0) ids.push(id);
      else ids.splice(at, 0, id);
      const set = this.db.prepare(`UPDATE bookmarks SET position = ? WHERE id = ?`);
      ids.forEach((bid, i) => set.run(i + 1, bid));
      if (folder !== undefined) this.db.prepare(`UPDATE bookmarks SET folder = ? WHERE id = ?`).run(folder, id);
    })();
  }

  // ---- Per-site zoom ----
  getSiteZoom(host: string): number | null {
    const row = this.db.prepare(`SELECT factor FROM site_zoom WHERE host = ?`).get(host) as { factor: number } | undefined;
    return row ? row.factor : null;
  }

  /** A factor equal to the default is stored as "no entry", so changing the default later still applies. */
  setSiteZoom(host: string, factor: number, defaultFactor = 1): void {
    if (Math.abs(factor - defaultFactor) < 0.001) {
      this.db.prepare(`DELETE FROM site_zoom WHERE host = ?`).run(host);
      return;
    }
    this.db
      .prepare(`INSERT INTO site_zoom (host, factor) VALUES (?, ?) ON CONFLICT(host) DO UPDATE SET factor = excluded.factor`)
      .run(host, factor);
  }

  removeSiteZoom(host: string): void {
    this.db.prepare(`DELETE FROM site_zoom WHERE host = ?`).run(host);
  }

  listSiteZoom(): { host: string; factor: number }[] {
    return this.db.prepare(`SELECT host, factor FROM site_zoom ORDER BY host ASC`).all() as { host: string; factor: number }[];
  }

  /** Everything a backup file carries besides passwords (those are handled by the backup service). */
  exportBackupData(): BackupData {
    const rows = <T>(sql: string) => this.db.prepare(sql).all() as T[];
    const settings: Record<string, string> = {};
    for (const r of rows<{ key: string; value: string }>(`SELECT key, value FROM settings`)) settings[r.key] = r.value;
    return {
      settings,
      bookmarks: rows<{ url: string; title: string; folder: string | null; created_at: number }>(
        `SELECT url, title, folder, created_at FROM bookmarks ORDER BY position ASC, id ASC`
      ).map((b) => ({ url: b.url, title: b.title, folder: b.folder, createdAt: b.created_at })),
      siteZoom: this.listSiteZoom(),
      customShortcuts: rows<{ host: string; url: string; title: string }>(`SELECT host, url, title FROM custom_shortcuts`),
      hiddenSites: rows<{ host: string }>(`SELECT host FROM hidden_sites`).map((r) => r.host),
      permissions: rows<{ origin: string; permission: string; decision: string }>(`SELECT origin, permission, decision FROM permissions`),
    };
  }

  /**
   * Merges a backup into this profile. Settings listed in the file replace the current values (only keys DASH knows);
   * everything else is added without removing or duplicating what is already here.
   */
  importBackupData(data: BackupData): Record<string, number> {
    const known = new Set(Object.keys(DEFAULT_SETTINGS));
    const counts = { settings: 0, bookmarks: 0, siteZoom: 0, shortcuts: 0, hiddenSites: 0, permissions: 0 };
    const str = (v: unknown, max = 2048): v is string => typeof v === 'string' && v.length <= max;
    this.db.transaction(() => {
      const setS = this.db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`);
      for (const [k, v] of Object.entries(data.settings ?? {})) {
        if (known.has(k) && str(v, 20000)) {
          setS.run(k, v);
          counts.settings++;
        }
      }
      const marks = (data.bookmarks ?? []).filter((b) => str(b?.url) && str(b?.title, 1000) && (b.folder === null || str(b.folder, 200)) && Number.isFinite(b.createdAt));
      counts.bookmarks = this.importBookmarks(marks.map((b) => ({ url: b.url, title: b.title, folder: b.folder, addedAt: b.createdAt })));
      const zoom = this.db.prepare(`INSERT OR REPLACE INTO site_zoom (host, factor) VALUES (?, ?)`);
      for (const z of data.siteZoom ?? []) if (str(z?.host, 255) && Number.isFinite(z.factor) && z.factor >= 0.25 && z.factor <= 5) { zoom.run(z.host, z.factor); counts.siteZoom++; }
      const sc = this.db.prepare(`INSERT OR REPLACE INTO custom_shortcuts (host, url, title, created_at) VALUES (?, ?, ?, ?)`);
      for (const c of data.customShortcuts ?? []) if (str(c?.host, 255) && str(c.url) && /^https?:\/\//i.test(c.url) && str(c.title, 200)) { sc.run(c.host, c.url, c.title, Date.now()); counts.shortcuts++; }
      const hs = this.db.prepare(`INSERT OR REPLACE INTO hidden_sites (host, hidden_at) VALUES (?, ?)`);
      for (const h of data.hiddenSites ?? []) if (str(h, 255)) { hs.run(h, Date.now()); counts.hiddenSites++; }
      const pm = this.db.prepare(`INSERT OR REPLACE INTO permissions (origin, permission, decision, updated_at) VALUES (?, ?, ?, ?)`);
      for (const p of data.permissions ?? []) if (str(p?.origin, 512) && str(p.permission, 64) && (p.decision === 'granted' || p.decision === 'denied')) { pm.run(p.origin, p.permission, p.decision, Date.now()); counts.permissions++; }
    })();
    return counts;
  }

  removeBookmark(id: number): void {
    this.db.prepare(`DELETE FROM bookmarks WHERE id = ?`).run(id);
  }

  listBookmarks(): BookmarkEntry[] {
    const rows = this.db
      .prepare(
        `SELECT id, url, title, favicon_url as faviconUrl, folder, created_at as createdAt FROM bookmarks ORDER BY position ASC, id ASC`
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

  setDownloadResumeInfo(id: number, info: DownloadResumeInfo): void {
    this.db.prepare(`UPDATE downloads SET resume_info = ? WHERE id = ?`).run(JSON.stringify(info), id);
  }

  /** The saved details needed to continue a download after a restart, with the row's file and size. */
  getDownloadForResume(id: number): { state: string; savePath: string; totalBytes: number; info: DownloadResumeInfo | null } | null {
    const row = this.db
      .prepare(`SELECT state, save_path as savePath, total_bytes as totalBytes, resume_info as resumeInfo FROM downloads WHERE id = ?`)
      .get(id) as { state: string; savePath: string; totalBytes: number; resumeInfo: string | null } | undefined;
    if (!row) return null;
    let info: DownloadResumeInfo | null = null;
    try {
      info = row.resumeInfo ? (JSON.parse(row.resumeInfo) as DownloadResumeInfo) : null;
    } catch {
      info = null;
    }
    return { state: row.state, savePath: row.savePath, totalBytes: row.totalBytes, info };
  }

  /** Anything still marked as running belongs to a previous run that ended: it is interrupted, not progressing. */
  markUnfinishedDownloadsInterrupted(): void {
    this.db.prepare(`UPDATE downloads SET state = 'interrupted' WHERE state IN ('progressing', 'paused')`).run();
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
                received_bytes as receivedBytes, state, started_at as startedAt,
                resume_info IS NOT NULL as resumable
         FROM downloads ORDER BY started_at DESC LIMIT ?`
      )
      .all(limit) as (Omit<DownloadEntry, 'canPause' | 'canResume'> & { resumable: number })[];
    return rows.map(({ resumable, ...r }) => ({
      ...r,
      canPause: r.state === 'progressing',
      canResume: r.state === 'paused' || (r.state === 'interrupted' && resumable === 1 && r.totalBytes > 0),
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
      sendPrivacySignals: stored.sendPrivacySignals ? stored.sendPrivacySignals === 'true' : DEFAULT_SETTINGS.sendPrivacySignals,
      blockThirdPartyCookies: stored.blockThirdPartyCookies ? stored.blockThirdPartyCookies === 'true' : DEFAULT_SETTINGS.blockThirdPartyCookies,
      stripTrackingParams: stored.stripTrackingParams ? stored.stripTrackingParams === 'true' : DEFAULT_SETTINGS.stripTrackingParams,
      clearHistoryOnExit: stored.clearHistoryOnExit ? stored.clearHistoryOnExit === 'true' : DEFAULT_SETTINGS.clearHistoryOnExit,
      clearSiteDataOnExit: stored.clearSiteDataOnExit ? stored.clearSiteDataOnExit === 'true' : DEFAULT_SETTINGS.clearSiteDataOnExit,
      fingerprintProtection: stored.fingerprintProtection ? stored.fingerprintProtection === 'true' : DEFAULT_SETTINGS.fingerprintProtection,
      neverSleepHosts: stored.neverSleepHosts ?? DEFAULT_SETTINGS.neverSleepHosts,
      blockingOffHosts: stored.blockingOffHosts ?? DEFAULT_SETTINGS.blockingOffHosts,
      highContrast: stored.highContrast ? stored.highContrast === 'true' : DEFAULT_SETTINGS.highContrast,
      reduceMotion: stored.reduceMotion ? stored.reduceMotion === 'true' : DEFAULT_SETTINGS.reduceMotion,
      alwaysShowFocus: stored.alwaysShowFocus ? stored.alwaysShowFocus === 'true' : DEFAULT_SETTINGS.alwaysShowFocus,
      defaultPageZoom: Number.isFinite(Number(stored.defaultPageZoom)) && Number(stored.defaultPageZoom) >= 100 && Number(stored.defaultPageZoom) <= 300 ? Number(stored.defaultPageZoom) : DEFAULT_SETTINGS.defaultPageZoom,
      spellCheckEnabled: stored.spellCheckEnabled ? stored.spellCheckEnabled === 'true' : DEFAULT_SETTINGS.spellCheckEnabled,
      spellCheckLanguages: stored.spellCheckLanguages ?? DEFAULT_SETTINGS.spellCheckLanguages,
      keepSiteDataHosts: stored.keepSiteDataHosts ?? DEFAULT_SETTINGS.keepSiteDataHosts,
      dohMode: (stored.dohMode as DashSettings['dohMode']) ?? DEFAULT_SETTINGS.dohMode,
      dohProvider: (stored.dohProvider as DashSettings['dohProvider']) ?? DEFAULT_SETTINGS.dohProvider,
      newTabCustomCss: stored.newTabCustomCss ?? DEFAULT_SETTINGS.newTabCustomCss,
      newTabCustomCssEnabled: stored.newTabCustomCssEnabled ? stored.newTabCustomCssEnabled === 'true' : DEFAULT_SETTINGS.newTabCustomCssEnabled,
      appCustomCss: stored.appCustomCss ?? DEFAULT_SETTINGS.appCustomCss,
      appCustomCssEnabled: stored.appCustomCssEnabled ? stored.appCustomCssEnabled === 'true' : DEFAULT_SETTINGS.appCustomCssEnabled,
      verticalTabs: stored.verticalTabs === 'true',
      verticalTabsCollapsed: stored.verticalTabsCollapsed === 'true',
      showBookmarksBar: stored.showBookmarksBar ? stored.showBookmarksBar === 'true' : DEFAULT_SETTINGS.showBookmarksBar,
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
  saveSessionTabs(windows: string[][], layouts: SessionLayout[] = []): void {
    const tx = this.db.transaction((data: string[][]) => {
      this.db.prepare(`DELETE FROM session_tabs`).run();
      this.db.prepare(`DELETE FROM session_groups`).run();
      const insert = this.db.prepare(
        `INSERT INTO session_tabs (window_index, url, position, pinned, group_idx) VALUES (?, ?, ?, ?, ?)`
      );
      const insertGroup = this.db.prepare(
        `INSERT INTO session_groups (window_index, idx, name, color, collapsed) VALUES (?, ?, ?, ?, ?)`
      );
      data.forEach((urls, windowIndex) => {
        const layout = layouts[windowIndex];
        urls.forEach((url, position) => {
          const t = layout?.tabs[position];
          insert.run(windowIndex, url, position, t?.pinned ? 1 : 0, t?.group ?? null);
        });
        layout?.groups.forEach((g, i) => insertGroup.run(windowIndex, i, g.name, g.color, g.collapsed ? 1 : 0));
      });
    });
    tx(windows);
  }

  /** Returns one array of URLs per window, ordered by window_index then position. */
  getSessionTabs(): string[][] {
    return this.getSession().map((w) => w.urls);
  }

  /** URLs plus pin and group layout for each saved window (empty windows dropped). */
  getSession(): { urls: string[]; layout: SessionLayout }[] {
    const rows = this.db
      .prepare(`SELECT window_index as windowIndex, url, pinned, group_idx as groupIdx FROM session_tabs ORDER BY window_index ASC, position ASC`)
      .all() as { windowIndex: number; url: string; pinned: number; groupIdx: number | null }[];
    const groupRows = this.db
      .prepare(`SELECT window_index as windowIndex, name, color, collapsed FROM session_groups ORDER BY window_index ASC, idx ASC`)
      .all() as { windowIndex: number; name: string; color: string; collapsed: number }[];
    const windows: { urls: string[]; layout: SessionLayout }[] = [];
    for (const row of rows) {
      const w = (windows[row.windowIndex] ??= { urls: [], layout: { tabs: [], groups: [] } });
      w.urls.push(row.url);
      w.layout.tabs.push({ pinned: row.pinned === 1, group: row.groupIdx });
    }
    for (const g of groupRows) windows[g.windowIndex]?.layout.groups.push({ name: g.name, color: g.color, collapsed: g.collapsed === 1 });
    return windows.filter((w) => w && w.urls.length > 0);
  }

  clearSessionTabs(): void {
    this.db.prepare(`DELETE FROM session_tabs`).run();
    this.db.prepare(`DELETE FROM session_groups`).run();
  }

  // ---- Blocking stats ----
  addBlockedHosts(rows: { host: string; category: 'ad' | 'tracker'; count: number }[]): void {
    const stmt = this.db.prepare(
      `INSERT INTO block_hosts (host, category, count, last_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(host, category) DO UPDATE SET count = count + excluded.count, last_at = excluded.last_at`
    );
    const now = Date.now();
    this.db.transaction(() => {
      for (const r of rows) stmt.run(r.host, r.category, r.count, now);
    })();
  }

  getTopBlockedHosts(limit: number): BlockedHostStat[] {
    return this.db
      .prepare(
        `SELECT host, category, count, last_at as lastAt FROM block_hosts ORDER BY count DESC, last_at DESC LIMIT ?`
      )
      .all(limit) as BlockedHostStat[];
  }

  getBlockedByCategory(): { ad: number; tracker: number } {
    const rows = this.db.prepare(`SELECT category, SUM(count) as total FROM block_hosts GROUP BY category`).all() as {
      category: string;
      total: number;
    }[];
    const out = { ad: 0, tracker: 0 };
    for (const r of rows) if (r.category === 'ad' || r.category === 'tracker') out[r.category] = r.total;
    return out;
  }

  clearBlockStats(): void {
    this.db.exec(`DELETE FROM block_hosts`);
    this.setBlockedCountLifetime(0);
  }

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

  updatePassword(id: number, encryptedPassword: Uint8Array): void {
    this.db.prepare(`UPDATE passwords SET encrypted_password = ?, created_at = ? WHERE id = ?`).run(Buffer.from(encryptedPassword), Date.now(), id);
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

  /** Hides a site (by hostname) from the New Tab shortcuts. Does not touch history. */
  hideSite(host: string): void {
    this.db.prepare(`INSERT OR REPLACE INTO hidden_sites (host, hidden_at) VALUES (?, ?)`).run(host, Date.now());
  }

  /** Adds a user-defined shortcut (http/https only). Returns false if the URL is invalid. */
  addCustomShortcut(rawUrl: string, title: string): boolean {
    let u: URL;
    try {
      u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
    } catch {
      return false;
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const host = u.hostname.replace(/^www\./, '');
    this.db
      .prepare(`INSERT OR REPLACE INTO custom_shortcuts (host, url, title, created_at) VALUES (?, ?, ?, ?)`)
      .run(host, u.href, title.trim().slice(0, 60) || host, Date.now());
    this.db.prepare(`DELETE FROM hidden_sites WHERE host = ?`).run(host);
    return true;
  }

  removeCustomShortcut(host: string): void {
    this.db.prepare(`DELETE FROM custom_shortcuts WHERE host = ?`).run(host);
  }

  restoreHiddenSites(): void {
    this.db.prepare(`DELETE FROM hidden_sites`).run();
  }

  countHiddenSites(): number {
    return (this.db.prepare(`SELECT COUNT(*) as n FROM hidden_sites`).get() as { n: number }).n;
  }

  /** Top sites collapsed to one tile per hostname, excluding hidden hosts and internal schemes. */
  getShortcutSites(limit = 8): { url: string; title: string; faviconUrl: string | null }[] {
    const hidden = new Set(
      (this.db.prepare(`SELECT host FROM hidden_sites`).all() as { host: string }[]).map((r) => r.host)
    );
    const seen = new Set<string>();
    const out: { url: string; title: string; faviconUrl: string | null }[] = [];
    const customs = this.db
      .prepare(`SELECT host, url, title FROM custom_shortcuts ORDER BY created_at ASC`)
      .all() as { host: string; url: string; title: string }[];
    for (const c of customs) {
      const icon = this.db
        .prepare(`SELECT favicon_url FROM history WHERE favicon_url IS NOT NULL AND url LIKE ? ORDER BY visited_at DESC LIMIT 1`)
        .get(`%://${c.host}%`) as { favicon_url: string } | undefined;
      seen.add(c.host);
      out.push({ url: c.url, title: c.title, faviconUrl: icon?.favicon_url ?? null });
    }
    const rows = this.getTopSites(300);
    for (const r of rows) {
      let u: URL;
      try { u = new URL(r.url); } catch { continue; }
      if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
      const host = u.hostname.replace(/^www\./, '');
      if (hidden.has(host) || seen.has(host)) continue;
      seen.add(host);
      out.push({ url: u.origin + '/', title: r.title, faviconUrl: r.faviconUrl });
      if (out.length >= limit) break;
    }
    return out.slice(0, limit);
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

}

let instance: DashDatabase | null = null;

export function getDatabase(): DashDatabase {
  if (!instance) instance = new DashDatabase();
  return instance;
}
