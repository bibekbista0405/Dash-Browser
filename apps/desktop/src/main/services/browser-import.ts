import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getDatabase } from '../db/database';
import type { ImportResult, ImportSource } from '../../shared/ipc-channels';
import {
  chromeTimeToMs,
  isWebUrl,
  parseChromeBookmarks,
  parseFirefoxBookmarks,
  type FirefoxBookmarkRow,
  type ImportedBookmark,
  type ImportedHistoryItem,
} from './browser-import-parsers';

const HISTORY_LIMIT = 10_000;

interface Candidate {
  id: string;
  name: string;
  kind: 'chromium' | 'firefox';
  dir: string;
}

/**
 * Reads bookmarks and history from other browsers' profile folders on this
 * computer. Everything is read locally; nothing is sent anywhere. Databases
 * are COPIED to a temp file first because the source browser locks them
 * while running. Passwords are deliberately NOT imported: they are
 * encrypted with the other browser's own keys and decrypting them would
 * mean extracting secrets from another application's key store.
 */
export class BrowserImporter {
  /** Source ids come only from this list; the renderer can never pass a path. */
  private candidates(): Candidate[] {
    const home = os.homedir();
    const list: Candidate[] = [];
    const chromium = (id: string, name: string, base: string): void => {
      if (!fs.existsSync(base)) return;
      // Prefer "Default"; also pick up "Profile N" folders.
      for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (entry.name !== 'Default' && !/^Profile \d+$/.test(entry.name)) continue;
        const dir = path.join(base, entry.name);
        if (!fs.existsSync(path.join(dir, 'Bookmarks')) && !fs.existsSync(path.join(dir, 'History'))) continue;
        list.push({
          id: `${id}:${entry.name}`,
          name: entry.name === 'Default' ? name : `${name} (${entry.name})`,
          kind: 'chromium',
          dir,
        });
      }
    };

    if (process.platform === 'win32') {
      const local = process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local');
      const roaming = process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming');
      chromium('chrome', 'Google Chrome', path.join(local, 'Google', 'Chrome', 'User Data'));
      chromium('edge', 'Microsoft Edge', path.join(local, 'Microsoft', 'Edge', 'User Data'));
      chromium('brave', 'Brave', path.join(local, 'BraveSoftware', 'Brave-Browser', 'User Data'));
      chromium('chromium', 'Chromium', path.join(local, 'Chromium', 'User Data'));
      this.firefoxProfiles(path.join(roaming, 'Mozilla', 'Firefox', 'Profiles'), list);
    } else if (process.platform === 'darwin') {
      const support = path.join(home, 'Library', 'Application Support');
      chromium('chrome', 'Google Chrome', path.join(support, 'Google', 'Chrome'));
      chromium('edge', 'Microsoft Edge', path.join(support, 'Microsoft Edge'));
      chromium('brave', 'Brave', path.join(support, 'BraveSoftware', 'Brave-Browser'));
      chromium('chromium', 'Chromium', path.join(support, 'Chromium'));
      this.firefoxProfiles(path.join(support, 'Firefox', 'Profiles'), list);
    } else {
      const config = process.env.XDG_CONFIG_HOME ?? path.join(home, '.config');
      chromium('chrome', 'Google Chrome', path.join(config, 'google-chrome'));
      chromium('edge', 'Microsoft Edge', path.join(config, 'microsoft-edge'));
      chromium('brave', 'Brave', path.join(config, 'BraveSoftware', 'Brave-Browser'));
      chromium('chromium', 'Chromium', path.join(config, 'chromium'));
      this.firefoxProfiles(path.join(home, '.mozilla', 'firefox'), list);
    }
    return list;
  }

  private firefoxProfiles(base: string, list: Candidate[]): void {
    if (!fs.existsSync(base)) return;
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(base, entry.name);
      if (!fs.existsSync(path.join(dir, 'places.sqlite'))) continue;
      list.push({ id: `firefox:${entry.name}`, name: `Firefox (${entry.name.replace(/^[^.]+\./, '')})`, kind: 'firefox', dir });
    }
  }

  detect(): ImportSource[] {
    const sources: ImportSource[] = [];
    for (const c of this.candidates()) {
      try {
        const data = this.read(c);
        if (data.bookmarks.length === 0 && data.history.length === 0) continue;
        sources.push({ id: c.id, name: c.name, bookmarkCount: data.bookmarks.length, historyCount: data.history.length });
      } catch (err) {
        console.error(`[DASH] Could not read ${c.name}:`, (err as Error).message);
      }
    }
    return sources;
  }

  run(sourceId: string, options: { bookmarks: boolean; history: boolean }): ImportResult {
    const candidate = this.candidates().find((c) => c.id === sourceId);
    if (!candidate) throw new Error('DASH: unknown import source');
    const data = this.read(candidate);
    const db = getDatabase();
    return {
      bookmarks: options.bookmarks ? db.importBookmarks(data.bookmarks) : 0,
      history: options.history ? db.importHistory(data.history) : 0,
    };
  }

  private read(c: Candidate): { bookmarks: ImportedBookmark[]; history: ImportedHistoryItem[] } {
    return c.kind === 'chromium' ? this.readChromium(c.dir) : this.readFirefox(c.dir);
  }

  private readChromium(dir: string): { bookmarks: ImportedBookmark[]; history: ImportedHistoryItem[] } {
    let bookmarks: ImportedBookmark[] = [];
    const bookmarksFile = path.join(dir, 'Bookmarks');
    if (fs.existsSync(bookmarksFile)) {
      bookmarks = parseChromeBookmarks(JSON.parse(fs.readFileSync(bookmarksFile, 'utf-8')));
    }
    const history = this.withCopiedDb(path.join(dir, 'History'), (db) => {
      const rows = db
        .prepare(`SELECT url, title, last_visit_time AS t FROM urls WHERE hidden = 0 AND last_visit_time > 0 ORDER BY last_visit_time DESC LIMIT ?`)
        .all(HISTORY_LIMIT) as { url: string; title: string; t: number }[];
      return rows
        .filter((r) => isWebUrl(r.url))
        .map((r) => ({ url: r.url, title: r.title || r.url, visitedAt: chromeTimeToMs(r.t) }));
    });
    return { bookmarks, history: history ?? [] };
  }

  private readFirefox(dir: string): { bookmarks: ImportedBookmark[]; history: ImportedHistoryItem[] } {
    const file = path.join(dir, 'places.sqlite');
    const result = this.withCopiedDb(file, (db) => {
      const rows = db
        .prepare(
          `SELECT b.id, b.type, b.parent, b.title, b.guid, p.url AS url, b.dateAdded AS dateAdded
           FROM moz_bookmarks b LEFT JOIN moz_places p ON p.id = b.fk`
        )
        .all() as FirefoxBookmarkRow[];
      const hist = db
        .prepare(`SELECT url, title, last_visit_date AS t FROM moz_places WHERE last_visit_date IS NOT NULL AND hidden = 0 ORDER BY last_visit_date DESC LIMIT ?`)
        .all(HISTORY_LIMIT) as { url: string; title: string | null; t: number }[];
      return {
        bookmarks: parseFirefoxBookmarks(rows),
        history: hist
          .filter((r) => isWebUrl(r.url))
          .map((r) => ({ url: r.url, title: r.title || r.url, visitedAt: Math.floor(r.t / 1000) })),
      };
    });
    return result ?? { bookmarks: [], history: [] };
  }

  /** Copies a (possibly locked / WAL-mode) SQLite file to a temp dir and opens the copy read-only. */
  private withCopiedDb<T>(file: string, fn: (db: Database.Database) => T): T | null {
    if (!fs.existsSync(file)) return null;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-import-'));
    const copy = path.join(tmp, 'db.sqlite');
    try {
      fs.copyFileSync(file, copy);
      for (const ext of ['-wal', '-shm']) {
        if (fs.existsSync(file + ext)) fs.copyFileSync(file + ext, copy + ext);
      }
      const db = new Database(copy, { readonly: true, fileMustExist: true });
      try {
        return fn(db);
      } finally {
        db.close();
      }
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
}
