import type Database from 'better-sqlite3';
import type { AttemptRow, LockRepository, RecoveryRow, SiteRow } from './types';

interface DbSite {
  id: string;
  hostname: string;
  display_name: string;
  password_hash: string;
  password_salt: string;
  include_subdomains: number;
  enabled: number;
  created_at: number;
  updated_at: number;
}

const toSite = (r: DbSite): SiteRow => ({
  id: r.id,
  hostname: r.hostname,
  displayName: r.display_name,
  passwordHash: r.password_hash,
  passwordSalt: r.password_salt,
  includeSubdomains: r.include_subdomains === 1,
  enabled: r.enabled === 1,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** Website Lock storage in DASH's SQLite database. Every statement is parameterised. */
export class SqliteLockRepository implements LockRepository {
  constructor(private db: Database.Database) {}

  listSites(): SiteRow[] {
    return (this.db.prepare(`SELECT * FROM locked_websites ORDER BY display_name COLLATE NOCASE`).all() as DbSite[]).map(toSite);
  }

  insertSite(r: SiteRow): void {
    this.db
      .prepare(
        `INSERT INTO locked_websites (id, hostname, display_name, password_hash, password_salt, include_subdomains, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(r.id, r.hostname, r.displayName, r.passwordHash, r.passwordSalt, r.includeSubdomains ? 1 : 0, r.enabled ? 1 : 0, r.createdAt, r.updatedAt);
  }

  updateSite(r: SiteRow): void {
    this.db
      .prepare(
        `UPDATE locked_websites SET display_name = ?, password_hash = ?, password_salt = ?, include_subdomains = ?, enabled = ?, updated_at = ? WHERE id = ?`
      )
      .run(r.displayName, r.passwordHash, r.passwordSalt, r.includeSubdomains ? 1 : 0, r.enabled ? 1 : 0, r.updatedAt, r.id);
  }

  deleteSite(id: string): void {
    this.db.prepare(`DELETE FROM locked_websites WHERE id = ?`).run(id);
  }

  getRecovery(): RecoveryRow | null {
    const r = this.db.prepare(`SELECT recovery_verifier, recovery_salt, created_at, updated_at FROM website_lock_recovery WHERE id = 1`).get() as
      | { recovery_verifier: string; recovery_salt: string; created_at: number; updated_at: number }
      | undefined;
    return r ? { verifier: r.recovery_verifier, salt: r.recovery_salt, createdAt: r.created_at, updatedAt: r.updated_at } : null;
  }

  setRecovery(r: RecoveryRow): void {
    this.db
      .prepare(
        `INSERT INTO website_lock_recovery (id, recovery_verifier, recovery_salt, created_at, updated_at) VALUES (1, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET recovery_verifier = excluded.recovery_verifier, recovery_salt = excluded.recovery_salt, updated_at = excluded.updated_at`
      )
      .run(r.verifier, r.salt, r.createdAt, r.updatedAt);
  }

  getAttempts(scope: string): AttemptRow {
    const r = this.db.prepare(`SELECT fails, locked_until FROM website_lock_attempts WHERE scope = ?`).get(scope) as { fails: number; locked_until: number } | undefined;
    return r ? { fails: r.fails, lockedUntil: r.locked_until } : { fails: 0, lockedUntil: 0 };
  }

  setAttempts(scope: string, row: AttemptRow): void {
    this.db
      .prepare(`INSERT INTO website_lock_attempts (scope, fails, locked_until) VALUES (?, ?, ?) ON CONFLICT(scope) DO UPDATE SET fails = excluded.fails, locked_until = excluded.locked_until`)
      .run(scope, row.fails, row.lockedUntil);
  }

  clearAttempts(scope: string): void {
    this.db.prepare(`DELETE FROM website_lock_attempts WHERE scope = ?`).run(scope);
  }

  addEvent(type: string, hostname: string | null, at: number): void {
    this.db.prepare(`INSERT INTO website_lock_events (event_type, hostname, created_at) VALUES (?, ?, ?)`).run(type, hostname, at);
    // Keep the log small: it is a local activity list, not an archive.
    this.db.prepare(`DELETE FROM website_lock_events WHERE id NOT IN (SELECT id FROM website_lock_events ORDER BY id DESC LIMIT 500)`).run();
  }

  listEvents(limit: number): { type: string; hostname: string | null; at: number }[] {
    return (this.db.prepare(`SELECT event_type, hostname, created_at FROM website_lock_events ORDER BY id DESC LIMIT ?`).all(limit) as {
      event_type: string;
      hostname: string | null;
      created_at: number;
    }[]).map((r) => ({ type: r.event_type, hostname: r.hostname, at: r.created_at }));
  }
}
