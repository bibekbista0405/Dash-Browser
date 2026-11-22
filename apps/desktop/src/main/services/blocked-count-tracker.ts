import { getDatabase } from '../db/database';
import type { BlockStats } from '../../shared/ipc-channels';
import type { BlockCategory } from './blocklist-data';

/**
 * A single shared counter so both the normal-session blocker and the
 * private-session blocker record into the same place. Per-tab counts are
 * keyed by Electron's webContentsId (globally unique across all sessions),
 * so no cross-session wiring is needed beyond sharing this instance.
 */
export class BlockedCountTracker {
  private perTabCounts: Map<number, number> = new Map();
  private lifetimeTotal: number;
  private pendingHosts: Map<string, { host: string; category: 'ad' | 'tracker'; count: number }> = new Map();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.lifetimeTotal = getDatabase().getBlockedCountLifetime();
  }

  /** `host` is recorded for the privacy report only when given (never for private tabs). */
  recordBlock(webContentsId: number | undefined, category: BlockCategory, host?: string): void {
    this.lifetimeTotal += 1;
    if (host && (category === 'ad' || category === 'tracker')) {
      const key = `${category}|${host}`;
      const cur = this.pendingHosts.get(key);
      if (cur) cur.count += 1;
      else this.pendingHosts.set(key, { host, category, count: 1 });
    }
    if (webContentsId !== undefined) {
      this.perTabCounts.set(webContentsId, (this.perTabCounts.get(webContentsId) ?? 0) + 1);
    }
    this.scheduleFlush();
  }

  getTabCount(webContentsId: number): number {
    return this.perTabCounts.get(webContentsId) ?? 0;
  }

  resetTabCount(webContentsId: number): void {
    this.perTabCounts.delete(webContentsId);
  }

  getLifetimeTotal(): number {
    return this.lifetimeTotal;
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushNow();
      this.flushTimer = null;
    }, 5000);
  }

  private flushNow(): void {
    const db = getDatabase();
    db.setBlockedCountLifetime(this.lifetimeTotal);
    if (this.pendingHosts.size > 0) {
      db.addBlockedHosts([...this.pendingHosts.values()]);
      this.pendingHosts.clear();
    }
  }

  getStats(): BlockStats {
    this.flushNow();
    const db = getDatabase();
    return {
      lifetimeTotal: this.lifetimeTotal,
      byCategory: db.getBlockedByCategory(),
      topHosts: db.getTopBlockedHosts(25),
    };
  }

  reset(): void {
    this.pendingHosts.clear();
    this.lifetimeTotal = 0;
    getDatabase().clearBlockStats();
  }

  dispose(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushNow();
  }
}
