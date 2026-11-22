import { WebsiteLockEngine } from '../../src/main/services/website-lock/engine';
import type { AttemptRow, LockRepository, RecoveryRow, SiteRow } from '../../src/main/services/website-lock/types';

/** In-memory repository: the engine only ever sees the interface, exactly as with SQLite. */
export class MemoryRepo implements LockRepository {
  sites = new Map<string, SiteRow>();
  recovery: RecoveryRow | null = null;
  attempts = new Map<string, AttemptRow>();
  events: { type: string; hostname: string | null; at: number }[] = [];
  listSites() { return [...this.sites.values()].map((s) => ({ ...s })); }
  insertSite(r: SiteRow) { this.sites.set(r.id, { ...r }); }
  updateSite(r: SiteRow) { this.sites.set(r.id, { ...r }); }
  deleteSite(id: string) { this.sites.delete(id); }
  getRecovery() { return this.recovery ? { ...this.recovery } : null; }
  setRecovery(r: RecoveryRow) { this.recovery = { ...r }; }
  getAttempts(s: string) { return this.attempts.get(s) ?? { fails: 0, lockedUntil: 0 }; }
  setAttempts(s: string, r: AttemptRow) { this.attempts.set(s, { ...r }); }
  clearAttempts(s: string) { this.attempts.delete(s); }
  addEvent(type: string, hostname: string | null, at: number) { this.events.push({ type, hostname, at }); }
  listEvents(limit: number) { return this.events.slice(-limit); }
}

export function makeEngine() {
  const repo = new MemoryRepo();
  const clock = { t: 1_700_000_000_000 };
  const engine = new WebsiteLockEngine(repo, () => clock.t);
  return { repo, engine, clock };
}

/** Engine with the recovery key already set up. Returns the key. */
export async function ready() {
  const ctx = makeEngine();
  const key = ctx.engine.beginRecoverySetup();
  await ctx.engine.confirmRecoverySetup();
  return { ...ctx, key };
}

export async function addSite(engine: WebsiteLockEngine, url: string, password: string, extra: { includeSubdomains?: boolean } = {}) {
  return engine.addSite({ url, password, confirmPassword: password, ...extra });
}
