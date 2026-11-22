import { describe, expect, it } from 'vitest';
import { AppLockEngine, type KeyValueStore } from '../../src/main/services/app-lock/engine';

class MemKv implements KeyValueStore {
  m = new Map<string, string>();
  get(k: string) { return this.m.get(k); }
  set(k: string, v: string) { this.m.set(k, v); }
  delete(k: string) { this.m.delete(k); }
}
const make = () => {
  const kv = new MemKv();
  const clock = { t: 1_700_000_000_000 };
  const engine = new AppLockEngine(kv, () => clock.t);
  return { kv, clock, engine, again: () => new AppLockEngine(kv, () => clock.t) };
};
const PW = 'correct horse 1';

describe('App Lock', () => {
  it('is off by default and rejects weak or mismatched passwords', async () => {
    const { engine } = make();
    expect(engine.status()).toEqual({ enabled: false, locked: false, idleMinutes: 0 });
    expect((await engine.enable('short', 'short')).ok).toBe(false);
    expect((await engine.enable(PW, 'other password')).ok).toBe(false);
    expect((await engine.enable(PW, PW, 7)).ok).toBe(false);
    expect(engine.isEnabled()).toBe(false);
  });

  it('enables, locks, unlocks with the right password only', async () => {
    const { engine } = make();
    expect((await engine.enable(PW, PW, 15)).ok).toBe(true);
    expect(engine.status()).toEqual({ enabled: true, locked: false, idleMinutes: 15 });
    expect(engine.lock()).toBe(true);
    const bad = await engine.unlock('wrong password');
    expect(bad.ok).toBe(false);
    expect(engine.isLocked()).toBe(true);
    expect((await engine.unlock(PW)).ok).toBe(true);
    expect(engine.isLocked()).toBe(false);
  });

  it('a restart always starts locked (the unlocked state is never saved)', async () => {
    const { engine, again } = make();
    await engine.enable(PW, PW);
    const next = again();
    expect(next.isLocked()).toBe(false); // before startup() nothing is assumed
    next.startup();
    expect(next.isLocked()).toBe(true);
  });

  it('waits after five wrong tries, doubles, and survives a restart', async () => {
    const { engine, clock, again } = make();
    await engine.enable(PW, PW);
    engine.lock();
    for (let i = 0; i < 4; i++) {
      const r = await engine.unlock('nope nope nope');
      expect(r.ok === false && r.attemptsLeft).toBe(4 - i);
    }
    const fifth = await engine.unlock('nope nope nope');
    expect(fifth.ok === false && fifth.retryAfterMs).toBe(30_000);
    // The right password is refused during the wait.
    const during = await engine.unlock(PW);
    expect(during.ok === false && during.code).toBe('LOCKED_OUT');
    // A new engine on the same store still sees the wait.
    const restarted = again();
    restarted.startup();
    const after = await restarted.unlock(PW);
    expect(after.ok === false && after.code).toBe('LOCKED_OUT');
    clock.t += 31_000;
    const sixth = await restarted.unlock('nope nope nope');
    expect(sixth.ok === false && sixth.retryAfterMs).toBe(60_000);
    clock.t += 61_000;
    expect((await restarted.unlock(PW)).ok).toBe(true);
  });

  it('change, idle time and turning off all need the current password', async () => {
    const { engine } = make();
    await engine.enable(PW, PW);
    expect((await engine.change('wrong password', 'new password 2', 'new password 2')).ok).toBe(false);
    expect((await engine.setIdleMinutes('wrong password', 5)).ok).toBe(false);
    expect((await engine.disable('wrong password')).ok).toBe(false);
    expect(engine.isEnabled()).toBe(true);
    expect((await engine.change(PW, 'new password 2', 'new password 2')).ok).toBe(true);
    expect((await engine.setIdleMinutes('new password 2', 5)).ok).toBe(true);
    expect(engine.idleMinutes()).toBe(5);
    engine.lock();
    expect((await engine.unlock(PW)).ok).toBe(false); // the old password no longer works
    expect((await engine.unlock('new password 2')).ok).toBe(true);
    expect((await engine.disable('new password 2')).ok).toBe(true);
    expect(engine.isEnabled()).toBe(false);
  });

  it('erase and reset wipes first, needs the word ERASE, and removes the lock', async () => {
    const { engine } = make();
    await engine.enable(PW, PW);
    engine.lock();
    let wiped = 0;
    expect((await engine.eraseAndReset('erase', async () => { wiped++; })).ok).toBe(false);
    expect(wiped).toBe(0);
    expect(engine.isLocked()).toBe(true);
    // A failed wipe must not remove the lock.
    await expect(engine.eraseAndReset('ERASE', async () => { throw new Error('disk'); })).rejects.toThrow();
    expect(engine.isEnabled()).toBe(true);
    expect((await engine.eraseAndReset('ERASE', async () => { wiped++; })).ok).toBe(true);
    expect(wiped).toBe(1);
    expect(engine.isEnabled()).toBe(false);
  });

  it('never stores the password itself', async () => {
    const { engine, kv } = make();
    await engine.enable(PW, PW);
    expect(JSON.stringify([...kv.m.values()])).not.toContain(PW);
  });
});
