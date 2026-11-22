import { getDatabase } from '../../db/database';
import { AppLockEngine, type KeyValueStore } from './engine';

class SqliteKv implements KeyValueStore {
  constructor(private db: ReturnType<typeof getDatabase>['handle']) {
    this.db.exec('CREATE TABLE IF NOT EXISTS app_lock (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  }
  get(key: string): string | undefined {
    return (this.db.prepare('SELECT value FROM app_lock WHERE key = ?').get(key) as { value: string } | undefined)?.value;
  }
  set(key: string, value: string): void {
    this.db.prepare('INSERT INTO app_lock (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
  }
  delete(key: string): void {
    this.db.prepare('DELETE FROM app_lock WHERE key = ?').run(key);
  }
}

let engine: AppLockEngine | null = null;

/** The one App Lock engine of this DASH process. Whether DASH is locked right now lives in memory only. */
export function getAppLock(): AppLockEngine {
  return (engine ??= new AppLockEngine(new SqliteKv(getDatabase().handle)));
}
