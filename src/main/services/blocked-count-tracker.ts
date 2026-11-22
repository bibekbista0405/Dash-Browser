import { getDatabase } from '../db/database';
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
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.lifetimeTotal = getDatabase().getBlockedCountLifetime();
  }

  recordBlock(webContentsId: number | undefined, _category: BlockCategory): void {
    this.lifetimeTotal += 1;
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
      getDatabase().setBlockedCountLifetime(this.lifetimeTotal);
      this.flushTimer = null;
    }, 5000);
  }

  dispose(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    getDatabase().setBlockedCountLifetime(this.lifetimeTotal);
  }
}
