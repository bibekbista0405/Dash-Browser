import { checkVerifier, createVerifier, passwordProblem, STRONG_KDF, type Verifier } from '../website-lock/crypto';

/** Tiny key-value store the engine needs. SQLite in the app, a Map in tests. */
export interface KeyValueStore {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
}

export type AppLockResult<T = null> =
  | { ok: true; value: T }
  | { ok: false; code: string; message: string; retryAfterMs?: number; attemptsLeft?: number };

export const IDLE_CHOICES = [0, 1, 5, 15, 30, 60] as const;
export type IdleMinutes = (typeof IDLE_CHOICES)[number];

export interface AppLockStatus {
  enabled: boolean;
  locked: boolean;
  idleMinutes: IdleMinutes;
}

const MAX_FAILS_BEFORE_WAIT = 5;
const FIRST_WAIT_MS = 30_000;
const MAX_WAIT_MS = 15 * 60_000;

const fail = (code: string, message: string, extra: { retryAfterMs?: number; attemptsLeft?: number } = {}): AppLockResult<never> => ({ ok: false, code, message, ...extra });
const ok = <T>(value: T): AppLockResult<T> => ({ ok: true, value });

export class AppLockEngine {
  private locked = false;
  onChange: () => void = () => undefined;

  constructor(
    private kv: KeyValueStore,
    private now: () => number = Date.now
  ) {}

  private verifier(): Verifier | null {
    const raw = this.kv.get('verifier');
    if (!raw) return null;
    try {
      const v = JSON.parse(raw) as Verifier;
      return typeof v.hash === 'string' && typeof v.salt === 'string' ? v : null;
    } catch {
      return null;
    }
  }

  isEnabled(): boolean {
    return this.verifier() !== null;
  }

  isLocked(): boolean {
    return this.locked && this.isEnabled();
  }

  idleMinutes(): IdleMinutes {
    const n = Number(this.kv.get('idleMinutes'));
    return (IDLE_CHOICES as readonly number[]).includes(n) ? (n as IdleMinutes) : 0;
  }

  status(): AppLockStatus {
    return { enabled: this.isEnabled(), locked: this.isLocked(), idleMinutes: this.idleMinutes() };
  }

  /** Called once when DASH starts: a protected DASH always opens locked. */
  startup(): void {
    this.locked = this.isEnabled();
  }

  // ---- wrong-password protection (kept in the store so a restart does not reset it) ----
  private attempts(): { fails: number; until: number } {
    try {
      const a = JSON.parse(this.kv.get('attempts') ?? '') as { fails?: number; until?: number };
      return { fails: Number(a.fails) || 0, until: Number(a.until) || 0 };
    } catch {
      return { fails: 0, until: 0 };
    }
  }
  private saveAttempts(a: { fails: number; until: number }): void {
    this.kv.set('attempts', JSON.stringify(a));
  }

  /** Checks the password with rate limiting. Returns null when it is right, or the failure to hand back. */
  private async check(password: unknown): Promise<AppLockResult<never> | null> {
    const v = this.verifier();
    if (!v) return fail('NOT_ENABLED', 'App Lock is not turned on.');
    const a = this.attempts();
    if (a.until > this.now()) return fail('LOCKED_OUT', 'Too many wrong passwords.', { retryAfterMs: a.until - this.now() });
    if (typeof password !== 'string' || password.length === 0 || password.length > 1024 || !(await checkVerifier(password, v))) {
      const fails = a.fails + 1;
      if (fails >= MAX_FAILS_BEFORE_WAIT) {
        const wait = Math.min(MAX_WAIT_MS, FIRST_WAIT_MS * 2 ** (fails - MAX_FAILS_BEFORE_WAIT));
        this.saveAttempts({ fails, until: this.now() + wait });
        return fail('LOCKED_OUT', 'Too many wrong passwords.', { retryAfterMs: wait });
      }
      this.saveAttempts({ fails, until: 0 });
      return fail('WRONG_PASSWORD', 'That password is not right.', { attemptsLeft: MAX_FAILS_BEFORE_WAIT - fails });
    }
    this.kv.delete('attempts');
    return null;
  }

  async enable(password: unknown, confirm: unknown, idleMinutes: unknown = 0): Promise<AppLockResult> {
    if (this.isEnabled()) return fail('ALREADY_ENABLED', 'App Lock is already on.');
    const problem = passwordProblem(password);
    if (problem) return fail('WEAK_PASSWORD', problem);
    if (password !== confirm) return fail('MISMATCH', 'The two passwords do not match.');
    if (!(IDLE_CHOICES as readonly unknown[]).includes(idleMinutes)) return fail('INVALID', 'Choose one of the listed auto-lock times.');
    this.kv.set('verifier', JSON.stringify(await createVerifier(password as string, STRONG_KDF)));
    this.kv.set('idleMinutes', String(idleMinutes));
    this.kv.delete('attempts');
    this.locked = false; // the person just chose the password: they are in
    this.onChange();
    return ok(null);
  }

  async disable(password: unknown): Promise<AppLockResult> {
    const bad = await this.check(password);
    if (bad) return bad;
    this.kv.delete('verifier');
    this.kv.delete('idleMinutes');
    this.locked = false;
    this.onChange();
    return ok(null);
  }

  async change(current: unknown, next: unknown, confirm: unknown): Promise<AppLockResult> {
    const bad = await this.check(current);
    if (bad) return bad;
    const problem = passwordProblem(next);
    if (problem) return fail('WEAK_PASSWORD', problem);
    if (next !== confirm) return fail('MISMATCH', 'The two passwords do not match.');
    this.kv.set('verifier', JSON.stringify(await createVerifier(next as string, STRONG_KDF)));
    return ok(null);
  }

  async setIdleMinutes(password: unknown, minutes: unknown): Promise<AppLockResult> {
    if (!(IDLE_CHOICES as readonly unknown[]).includes(minutes)) return fail('INVALID', 'Choose one of the listed auto-lock times.');
    const bad = await this.check(password);
    if (bad) return bad;
    this.kv.set('idleMinutes', String(minutes));
    this.onChange();
    return ok(null);
  }

  async unlock(password: unknown): Promise<AppLockResult> {
    if (!this.isLocked()) return ok(null);
    const bad = await this.check(password);
    if (bad) return bad;
    this.locked = false;
    this.onChange();
    return ok(null);
  }

  lock(): boolean {
    if (!this.isEnabled() || this.locked) return false;
    this.locked = true;
    this.onChange();
    return true;
  }

  /**
   * "Forgot password": runs `wipe` (deletes the person's data) first, and only if that finishes removes the lock.
   * Requires the exact word ERASE so it cannot happen by accident.
   */
  async eraseAndReset(typed: unknown, wipe: () => Promise<void>): Promise<AppLockResult> {
    if (!this.isEnabled()) return fail('NOT_ENABLED', 'App Lock is not turned on.');
    if (typed !== 'ERASE') return fail('CONFIRM', 'Type ERASE to confirm.');
    await wipe();
    this.kv.delete('verifier');
    this.kv.delete('idleMinutes');
    this.kv.delete('attempts');
    this.locked = false;
    this.onChange();
    return ok(null);
  }
}
