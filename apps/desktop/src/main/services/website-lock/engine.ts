import { randomUUID, randomBytes } from 'node:crypto';
import {
  BackupError,
  checkVerifier,
  createVerifier,
  decryptBackup,
  encryptBackup,
  generateRecoveryKey,
  looksLikeRecoveryKey,
  normalizeRecoveryKey,
  passwordProblem,
  STRONG_KDF,
} from './crypto';
import { hostMatches, normalizeHostname, webHostOf } from './hostname';
import { LockError, type LockRepository, type LockStatus, type RecoveryRow, type SiteInfo, type SiteRow } from './types';

/** After this many wrong tries in a row the next attempts are refused for a growing time. */
export const MAX_FREE_ATTEMPTS = 5;
export const LOCKOUT_BASE_MS = 30_000;
export const LOCKOUT_MAX_MS = 15 * 60_000;
/** The lost-key reset can only run this long after it was requested, and only for a short while. */
export const RESET_WAIT_MS = 10_000;
export const RESET_WINDOW_MS = 10 * 60_000;
const BACKUP_TOKEN_TTL_MS = 5 * 60_000;

interface PendingBackup {
  sites: Pick<SiteRow, 'hostname' | 'displayName' | 'passwordHash' | 'passwordSalt' | 'includeSubdomains' | 'enabled'>[];
  recovery: { verifier: string; salt: string } | null;
  expires: number;
}

/**
 * The Website Lock security engine. Pure logic over a repository, so it runs (and is tested) without Electron.
 *
 * Unlock state lives ONLY in `unlocked`, a Set in this process's memory: it is never written anywhere, so quitting,
 * crashing or being killed always leaves every site locked at the next start.
 */
export class WebsiteLockEngine {
  private unlocked = new Set<string>();
  private cache: SiteRow[] | null = null;
  private pendingRecoveryKey: string | null = null;
  private resetArmed = new Map<string, number>();
  private pendingBackups = new Map<string, PendingBackup>();
  /** Told whenever lock state changes so open tabs can be re-checked. */
  onChange: (() => void) | null = null;

  constructor(
    private repo: LockRepository,
    private now: () => number = Date.now
  ) {}

  // ---------- reading ----------

  private sites(): SiteRow[] {
    return (this.cache ??= this.repo.listSites());
  }

  private changed(): void {
    this.cache = null;
    this.onChange?.();
  }

  private info(s: SiteRow): SiteInfo {
    return {
      id: s.id,
      hostname: s.hostname,
      displayName: s.displayName,
      includeSubdomains: s.includeSubdomains,
      enabled: s.enabled,
      unlocked: this.unlocked.has(s.id),
      createdAt: s.createdAt,
    };
  }

  private mustGet(id: unknown): SiteRow {
    const s = typeof id === 'string' ? this.sites().find((x) => x.id === id) : undefined;
    if (!s) throw new LockError('NOT_FOUND', 'That website is not protected.');
    return s;
  }

  listSites(): SiteInfo[] {
    return this.sites().map((s) => this.info(s));
  }

  /** The enabled protection that covers `url`, if any. */
  private ruleFor(url: string): SiteRow | null {
    const host = webHostOf(url);
    if (!host) return null;
    return this.sites().find((s) => s.enabled && hostMatches(s, host)) ?? null;
  }

  statusForUrl(url: string): LockStatus {
    const s = this.ruleFor(url);
    return s ? { protected: true, unlocked: this.unlocked.has(s.id), site: this.info(s) } : { protected: false, unlocked: false, site: null };
  }

  /** The navigation policy: the protection that must stop `url` right now (covered and still locked), or null to allow. */
  blockingSite(url: string): SiteInfo | null {
    const s = this.ruleFor(url);
    return s && !this.unlocked.has(s.id) ? this.info(s) : null;
  }

  // ---------- rate limiting ----------

  private checkNotLimited(scope: string): void {
    const a = this.repo.getAttempts(scope);
    if (a.lockedUntil > this.now()) {
      throw new LockError('RATE_LIMITED', 'Too many wrong tries. Wait before trying again.', a.lockedUntil - this.now());
    }
  }

  private recordFailure(scope: string): { attemptsLeft: number; retryAfterMs: number } {
    const a = this.repo.getAttempts(scope);
    const fails = a.fails + 1;
    let lockedUntil = 0;
    let retry = 0;
    if (fails >= MAX_FREE_ATTEMPTS) {
      retry = Math.min(LOCKOUT_BASE_MS * 2 ** (fails - MAX_FREE_ATTEMPTS), LOCKOUT_MAX_MS);
      lockedUntil = this.now() + retry;
    }
    this.repo.setAttempts(scope, { fails, lockedUntil });
    return { attemptsLeft: Math.max(0, MAX_FREE_ATTEMPTS - fails), retryAfterMs: retry };
  }

  private async checkSitePassword(site: SiteRow, password: unknown, eventHost = site.hostname): Promise<void> {
    const scope = `site:${site.id}`;
    this.checkNotLimited(scope);
    const ok = typeof password === 'string' && password.length <= 1024 && (await checkVerifier(password, { hash: site.passwordHash, salt: site.passwordSalt }));
    if (!ok) {
      const f = this.recordFailure(scope);
      this.repo.addEvent('password_failed', eventHost, this.now());
      throw new LockError('WRONG_PASSWORD', 'Wrong password.', f.retryAfterMs || undefined, f.attemptsLeft);
    }
    this.repo.clearAttempts(scope);
  }

  // ---------- websites ----------

  /** Passwords for a website are checked against the password you set for that website only. */
  async addSite(input: { url: string; displayName?: string; password: string; confirmPassword: string; includeSubdomains?: boolean }): Promise<SiteInfo> {
    if (!this.repo.getRecovery()) throw new LockError('RECOVERY_NOT_SET', 'Set up your recovery key first.');
    const hostname = normalizeHostname(input.url);
    if (!hostname) throw new LockError('INVALID_URL', 'Enter a website address like example.com.');
    const problem = passwordProblem(input.password);
    if (problem) throw new LockError('INVALID_PASSWORD', problem);
    if (input.password !== input.confirmPassword) throw new LockError('PASSWORD_MISMATCH', 'The two passwords do not match.');
    if (this.sites().some((s) => s.hostname === hostname)) throw new LockError('ALREADY_PROTECTED', `${hostname} is already protected.`);
    const v = await createVerifier(input.password);
    const t = this.now();
    const row: SiteRow = {
      id: randomUUID(),
      hostname,
      displayName: (input.displayName ?? '').trim().slice(0, 60) || hostname,
      passwordHash: v.hash,
      passwordSalt: v.salt,
      includeSubdomains: input.includeSubdomains === true,
      enabled: true,
      createdAt: t,
      updatedAt: t,
    };
    this.repo.insertSite(row);
    this.repo.addEvent('site_added', hostname, t);
    this.changed();
    return this.info(row);
  }

  async removeSite(id: string, password: string): Promise<void> {
    const s = this.mustGet(id);
    await this.checkSitePassword(s, password);
    this.repo.deleteSite(s.id);
    this.unlocked.delete(s.id);
    this.repo.clearAttempts(`site:${s.id}`);
    this.repo.addEvent('site_removed', s.hostname, this.now());
    this.changed();
  }

  /** Changing a protected website's settings needs its current password. */
  async editSite(id: string, password: string, changes: { displayName?: string; includeSubdomains?: boolean; enabled?: boolean }): Promise<SiteInfo> {
    const s = this.mustGet(id);
    await this.checkSitePassword(s, password);
    const next: SiteRow = { ...s, updatedAt: this.now() };
    if (typeof changes.displayName === 'string') next.displayName = changes.displayName.trim().slice(0, 60) || s.hostname;
    if (typeof changes.includeSubdomains === 'boolean') next.includeSubdomains = changes.includeSubdomains;
    if (typeof changes.enabled === 'boolean') next.enabled = changes.enabled;
    this.repo.updateSite(next);
    if (!next.enabled) this.unlocked.delete(s.id);
    this.repo.addEvent(next.enabled ? 'site_edited' : 'protection_disabled', s.hostname, this.now());
    this.changed();
    return this.info(next);
  }

  /** Turning protection back on never needs a password. */
  enableSite(id: string): SiteInfo {
    const s = this.mustGet(id);
    const next = { ...s, enabled: true, updatedAt: this.now() };
    this.repo.updateSite(next);
    this.unlocked.delete(s.id);
    this.repo.addEvent('protection_enabled', s.hostname, this.now());
    this.changed();
    return this.info(next);
  }

  async changePassword(id: string, currentPassword: string, newPassword: string, confirmPassword: string): Promise<void> {
    const s = this.mustGet(id);
    await this.checkSitePassword(s, currentPassword);
    const problem = passwordProblem(newPassword);
    if (problem) throw new LockError('INVALID_PASSWORD', problem);
    if (newPassword !== confirmPassword) throw new LockError('PASSWORD_MISMATCH', 'The two passwords do not match.');
    const v = await createVerifier(newPassword);
    this.repo.updateSite({ ...s, passwordHash: v.hash, passwordSalt: v.salt, updatedAt: this.now() });
    this.repo.addEvent('password_changed', s.hostname, this.now());
    this.changed();
  }

  // ---------- sessions ----------

  async unlock(id: string, password: string): Promise<SiteInfo> {
    const s = this.mustGet(id);
    await this.checkSitePassword(s, password);
    this.unlocked.add(s.id);
    this.repo.addEvent('unlocked', s.hostname, this.now());
    this.changed();
    return this.info(s);
  }

  lockSite(id: string): void {
    const s = this.mustGet(id);
    this.unlocked.delete(s.id);
    this.repo.addEvent('locked', s.hostname, this.now());
    this.changed();
  }

  lockAll(): void {
    if (this.unlocked.size === 0) return;
    this.unlocked.clear();
    this.changed();
  }

  // ---------- recovery key ----------

  isRecoverySet(): boolean {
    return this.repo.getRecovery() !== null;
  }

  /** First-time setup: makes a key and holds it in memory. Nothing is saved until the person confirms they stored it. */
  beginRecoverySetup(): string {
    if (this.repo.getRecovery()) throw new LockError('RECOVERY_ALREADY_SET', 'A recovery key already exists.');
    this.pendingRecoveryKey = generateRecoveryKey();
    return this.pendingRecoveryKey;
  }

  async confirmRecoverySetup(): Promise<void> {
    if (this.repo.getRecovery()) throw new LockError('RECOVERY_ALREADY_SET', 'A recovery key already exists.');
    if (!this.pendingRecoveryKey) throw new LockError('NO_PENDING_RECOVERY', 'Start the recovery key setup again.');
    await this.storeRecoveryKey(this.pendingRecoveryKey, 'recovery_created');
    this.pendingRecoveryKey = null;
  }

  private async storeRecoveryKey(key: string, event: string): Promise<void> {
    const v = await createVerifier(normalizeRecoveryKey(key), STRONG_KDF);
    const old = this.repo.getRecovery();
    const t = this.now();
    const row: RecoveryRow = { verifier: v.hash, salt: v.salt, createdAt: old?.createdAt ?? t, updatedAt: t };
    this.repo.setRecovery(row);
    this.repo.addEvent(event, null, t);
  }

  private async checkRecoveryKey(key: unknown): Promise<void> {
    const rec = this.repo.getRecovery();
    if (!rec) throw new LockError('RECOVERY_NOT_SET', 'No recovery key has been set up.');
    this.checkNotLimited('recovery');
    const ok = typeof key === 'string' && looksLikeRecoveryKey(key) && (await checkVerifier(normalizeRecoveryKey(key), { hash: rec.verifier, salt: rec.salt }));
    if (!ok) {
      const f = this.recordFailure('recovery');
      this.repo.addEvent('recovery_failed', null, this.now());
      throw new LockError('WRONG_RECOVERY_KEY', 'That is not the recovery key.', f.retryAfterMs || undefined, f.attemptsLeft);
    }
    this.repo.clearAttempts('recovery');
  }

  /** Forgot a website's password: the recovery key sets a new one for that website only. */
  async recoverSite(id: string, recoveryKey: string, newPassword: string, confirmPassword: string): Promise<void> {
    const s = this.mustGet(id);
    const problem = passwordProblem(newPassword);
    if (problem) throw new LockError('INVALID_PASSWORD', problem);
    if (newPassword !== confirmPassword) throw new LockError('PASSWORD_MISMATCH', 'The two passwords do not match.');
    await this.checkRecoveryKey(recoveryKey);
    const v = await createVerifier(newPassword);
    this.repo.updateSite({ ...s, passwordHash: v.hash, passwordSalt: v.salt, updatedAt: this.now() });
    this.unlocked.delete(s.id); // the old session no longer counts
    this.repo.clearAttempts(`site:${s.id}`);
    this.repo.addEvent('password_recovered', s.hostname, this.now());
    this.changed();
  }

  /** A new key replaces the old one immediately; the old key stops working at once. Show the result once. */
  async regenerateRecoveryKey(currentRecoveryKey: string): Promise<string> {
    await this.checkRecoveryKey(currentRecoveryKey);
    const key = generateRecoveryKey();
    await this.storeRecoveryKey(key, 'recovery_regenerated');
    return key;
  }

  // ---------- lost recovery key / lost password: local administrative reset ----------

  /**
   * Starts the local reset. It cannot run until RESET_WAIT_MS later, which gives the confirmation screen time to be
   * read. This is NOT authentication: whoever can run DASH on this profile can do it. It exists so a lost password
   * never destroys the profile — the old password and key are gone for good and cannot be recovered.
   */
  requestAdminReset(scope: string): { readyAt: number } {
    if (scope !== 'recovery') this.mustGet(scope);
    const readyAt = this.now() + RESET_WAIT_MS;
    this.resetArmed.set(scope, readyAt);
    return { readyAt };
  }

  private assertResetReady(scope: string): void {
    const readyAt = this.resetArmed.get(scope);
    if (!readyAt || this.now() < readyAt || this.now() > readyAt + RESET_WINDOW_MS) {
      throw new LockError('RESET_NOT_ARMED', 'Start the reset and wait for the countdown first.');
    }
  }

  /** Replaces one website's password. The person must type the website's host to confirm. */
  async adminResetSite(id: string, typedHostname: string, newPassword: string, confirmPassword: string): Promise<void> {
    const s = this.mustGet(id);
    this.assertResetReady(id);
    if ((typedHostname ?? '').trim().toLowerCase() !== s.hostname) throw new LockError('RESET_CONFIRMATION', `Type ${s.hostname} exactly to confirm.`);
    const problem = passwordProblem(newPassword);
    if (problem) throw new LockError('INVALID_PASSWORD', problem);
    if (newPassword !== confirmPassword) throw new LockError('PASSWORD_MISMATCH', 'The two passwords do not match.');
    const v = await createVerifier(newPassword);
    this.repo.updateSite({ ...s, passwordHash: v.hash, passwordSalt: v.salt, updatedAt: this.now() });
    this.unlocked.delete(s.id);
    this.repo.clearAttempts(`site:${s.id}`);
    this.resetArmed.delete(id);
    this.repo.addEvent('admin_reset_site', s.hostname, this.now());
    this.changed();
  }

  /** Replaces a lost recovery key. Returns the new key to show once. */
  async adminResetRecovery(typedPhrase: string): Promise<string> {
    this.assertResetReady('recovery');
    if ((typedPhrase ?? '').trim().toUpperCase() !== 'RESET') throw new LockError('RESET_CONFIRMATION', 'Type RESET to confirm.');
    const key = generateRecoveryKey();
    await this.storeRecoveryKey(key, 'admin_reset_recovery');
    this.resetArmed.delete('recovery');
    this.repo.clearAttempts('recovery');
    return key;
  }

  // ---------- encrypted backup ----------

  /** Hostnames, settings and password verifiers, all inside one AES-256-GCM file. Never passwords, never unlock state. */
  async exportBackup(backupPassword: string): Promise<Buffer> {
    const problem = passwordProblem(backupPassword);
    if (problem) throw new LockError('BACKUP_PASSWORD', problem);
    const rec = this.repo.getRecovery();
    const payload = {
      createdAt: this.now(),
      sites: this.sites().map((s) => ({
        hostname: s.hostname,
        displayName: s.displayName,
        passwordHash: s.passwordHash,
        passwordSalt: s.passwordSalt,
        includeSubdomains: s.includeSubdomains,
        enabled: s.enabled,
      })),
      recovery: rec ? { verifier: rec.verifier, salt: rec.salt } : null,
    };
    const file = await encryptBackup(Buffer.from(JSON.stringify(payload), 'utf8'), backupPassword);
    this.repo.addEvent('backup_exported', null, this.now());
    return file;
  }

  /** Decrypts and validates a backup and tells what it holds. Nothing is changed until `applyBackup`. */
  async previewBackup(file: Buffer, backupPassword: string): Promise<{ token: string; sites: { hostname: string; displayName: string; exists: boolean }[]; hasRecoveryKey: boolean }> {
    this.checkNotLimited('backup');
    let plain: Buffer;
    try {
      plain = await decryptBackup(file, backupPassword ?? '');
    } catch (e) {
      if (e instanceof BackupError) {
        if (e.code === 'WRONG_PASSWORD_OR_TAMPERED') {
          const f = this.recordFailure('backup');
          throw new LockError('BACKUP_PASSWORD', e.message, f.retryAfterMs || undefined, f.attemptsLeft);
        }
        throw new LockError('BACKUP_INVALID', e.message);
      }
      throw e;
    }
    this.repo.clearAttempts('backup');
    const parsed = parseBackupPayload(plain);
    const token = randomBytes(24).toString('hex');
    this.pendingBackups.set(token, { ...parsed, expires: this.now() + BACKUP_TOKEN_TTL_MS });
    const existing = new Set(this.sites().map((s) => s.hostname));
    return {
      token,
      sites: parsed.sites.map((s) => ({ hostname: s.hostname, displayName: s.displayName, exists: existing.has(s.hostname) })),
      hasRecoveryKey: parsed.recovery !== null,
    };
  }

  /** Adds the backup's websites. Websites already protected here are kept unless `replaceExisting` is set. All start locked. */
  applyBackup(token: string, replaceExisting: boolean): { added: number; replaced: number; skipped: number; recoveryRestored: boolean } {
    const p = this.pendingBackups.get(token);
    this.pendingBackups.delete(token);
    if (!p || p.expires < this.now()) throw new LockError('BACKUP_TOKEN', 'Open the backup again to restore it.');
    let added = 0;
    let replaced = 0;
    let skipped = 0;
    const t = this.now();
    for (const s of p.sites) {
      const existing = this.sites().find((x) => x.hostname === s.hostname);
      if (existing && !replaceExisting) {
        skipped++;
        continue;
      }
      if (existing) {
        this.repo.updateSite({ ...existing, ...s, updatedAt: t });
        this.unlocked.delete(existing.id);
        replaced++;
      } else {
        this.repo.insertSite({ id: randomUUID(), ...s, createdAt: t, updatedAt: t });
        added++;
      }
      this.cache = null;
    }
    let recoveryRestored = false;
    if (p.recovery && !this.repo.getRecovery()) {
      this.repo.setRecovery({ verifier: p.recovery.verifier, salt: p.recovery.salt, createdAt: t, updatedAt: t });
      recoveryRestored = true;
    }
    this.repo.addEvent('backup_restored', null, t);
    this.changed();
    return { added, replaced, skipped, recoveryRestored };
  }

  events(limit = 50): { type: string; hostname: string | null; at: number }[] {
    return this.repo.listEvents(Math.min(Math.max(1, limit | 0), 200));
  }
}

function parseBackupPayload(plain: Buffer): Omit<PendingBackup, 'expires'> {
  const bad = () => new LockError('BACKUP_INVALID', 'This backup file is damaged.');
  let raw: unknown;
  try {
    raw = JSON.parse(plain.toString('utf8'));
  } catch {
    throw bad();
  }
  const o = raw as { sites?: unknown; recovery?: unknown };
  if (!o || !Array.isArray(o.sites) || o.sites.length > 2000) throw bad();
  const sites: PendingBackup['sites'] = [];
  const seen = new Set<string>();
  for (const s of o.sites as Record<string, unknown>[]) {
    const hostname = typeof s?.hostname === 'string' ? normalizeHostname(s.hostname) : null;
    if (!hostname || hostname !== s.hostname || seen.has(hostname)) throw bad();
    if (typeof s.passwordHash !== 'string' || typeof s.passwordSalt !== 'string' || !s.passwordHash.startsWith('scrypt$')) throw bad();
    if (s.passwordHash.length > 300 || s.passwordSalt.length > 100) throw bad();
    seen.add(hostname);
    sites.push({
      hostname,
      displayName: typeof s.displayName === 'string' ? s.displayName.slice(0, 60) : hostname,
      passwordHash: s.passwordHash,
      passwordSalt: s.passwordSalt,
      includeSubdomains: s.includeSubdomains === true,
      enabled: s.enabled !== false,
    });
  }
  let recovery: PendingBackup['recovery'] = null;
  if (o.recovery !== null && o.recovery !== undefined) {
    const r = o.recovery as Record<string, unknown>;
    if (typeof r.verifier !== 'string' || typeof r.salt !== 'string' || !r.verifier.startsWith('scrypt$')) throw bad();
    recovery = { verifier: r.verifier, salt: r.salt };
  }
  return { sites, recovery };
}
