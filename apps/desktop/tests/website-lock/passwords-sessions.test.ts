import { describe, expect, it } from 'vitest';
import { LockError } from '../../src/main/services/website-lock/types';
import { hostMatches, normalizeHostname } from '../../src/main/services/website-lock/hostname';
import { addSite, ready } from './helpers';

describe('hostnames', () => {
  it('normalises URLs and bare hosts, and treats www as the same site', () => {
    expect(normalizeHostname('https://WWW.Instagram.com/p/abc?x=1')).toBe('instagram.com');
    expect(normalizeHostname('instagram.com')).toBe('instagram.com');
    expect(normalizeHostname('  mail.google.com ')).toBe('mail.google.com');
  });
  it('rejects things that are not websites', () => {
    for (const bad of ['', 'javascript:alert(1)', 'file:///etc/passwd', 'nodots', 'http://', 'a b c']) expect(normalizeHostname(bad)).toBeNull();
  });
  it('matches whole labels only, never suffixes', () => {
    const rule = { hostname: 'bank.com', includeSubdomains: true };
    expect(hostMatches(rule, 'bank.com')).toBe(true);
    expect(hostMatches(rule, 'www.bank.com')).toBe(true);
    expect(hostMatches(rule, 'login.bank.com')).toBe(true);
    expect(hostMatches(rule, 'evilbank.com')).toBe(false);
    expect(hostMatches(rule, 'bank.com.evil.io')).toBe(false);
  });
  it('exact mode does not cover other subdomains', () => {
    const rule = { hostname: 'bank.com', includeSubdomains: false };
    expect(hostMatches(rule, 'bank.com')).toBe(true);
    expect(hostMatches(rule, 'login.bank.com')).toBe(false);
  });
});

describe('passwords', () => {
  it('accepts the right password and refuses a wrong one', async () => {
    const { engine } = await ready();
    const s = await addSite(engine, 'instagram.com', 'correct horse');
    await expect(engine.unlock(s.id, 'wrong password')).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    await expect(engine.unlock(s.id, 'correct horse')).resolves.toMatchObject({ unlocked: true });
  });

  it('keeps every website password independent', async () => {
    const { engine } = await ready();
    const a = await addSite(engine, 'instagram.com', 'password-A-123');
    const b = await addSite(engine, 'facebook.com', 'password-B-456');
    await expect(engine.unlock(a.id, 'password-B-456')).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    await expect(engine.unlock(b.id, 'password-A-123')).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    await engine.unlock(a.id, 'password-A-123');
    expect(engine.blockingSite('https://facebook.com/')).not.toBeNull();
    expect(engine.blockingSite('https://instagram.com/')).toBeNull();
  });

  it('uses a unique salt per website, even for the same password', async () => {
    const { engine, repo } = await ready();
    await addSite(engine, 'instagram.com', 'same-password-1');
    await addSite(engine, 'facebook.com', 'same-password-1');
    const [x, y] = [...repo.sites.values()];
    expect(x.passwordSalt).not.toBe(y.passwordSalt);
    expect(x.passwordHash).not.toBe(y.passwordHash);
  });

  it('never stores a password or recovery key in plain text', async () => {
    const { engine, repo, key } = await ready();
    await addSite(engine, 'instagram.com', 'my-secret-pass');
    const dump = JSON.stringify([...repo.sites.values()]) + JSON.stringify(repo.recovery) + JSON.stringify(repo.events);
    expect(dump).not.toContain('my-secret-pass');
    expect(dump).not.toContain(key);
    expect(dump).not.toContain(key.replace(/-/g, ''));
    expect([...repo.sites.values()][0].passwordHash.startsWith('scrypt$')).toBe(true);
  });

  it('checks length and confirmation', async () => {
    const { engine } = await ready();
    await expect(engine.addSite({ url: 'a.com', password: 'short', confirmPassword: 'short' })).rejects.toMatchObject({ code: 'INVALID_PASSWORD' });
    await expect(engine.addSite({ url: 'a.com', password: 'long-enough-1', confirmPassword: 'long-enough-2' })).rejects.toMatchObject({ code: 'PASSWORD_MISMATCH' });
    await expect(engine.addSite({ url: 'not a site', password: 'long-enough-1', confirmPassword: 'long-enough-1' })).rejects.toMatchObject({ code: 'INVALID_URL' });
  });

  it('refuses a duplicate website and requires the recovery key to exist first', async () => {
    const { engine } = await ready();
    await addSite(engine, 'instagram.com', 'password-one-1');
    await expect(addSite(engine, 'www.instagram.com', 'password-one-1')).rejects.toMatchObject({ code: 'ALREADY_PROTECTED' });
    const fresh = (await import('./helpers')).makeEngine().engine;
    await expect(addSite(fresh, 'instagram.com', 'password-one-1')).rejects.toMatchObject({ code: 'RECOVERY_NOT_SET' });
  });

  it('changing a password needs the current one and leaves other websites alone', async () => {
    const { engine } = await ready();
    const a = await addSite(engine, 'instagram.com', 'old-password-A');
    const b = await addSite(engine, 'facebook.com', 'password-B-456');
    await expect(engine.changePassword(a.id, 'nope-nope-nope', 'new-password-A', 'new-password-A')).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    await engine.changePassword(a.id, 'old-password-A', 'new-password-A', 'new-password-A');
    await expect(engine.unlock(a.id, 'old-password-A')).rejects.toBeInstanceOf(LockError);
    await expect(engine.unlock(a.id, 'new-password-A')).resolves.toBeTruthy();
    await expect(engine.unlock(b.id, 'password-B-456')).resolves.toBeTruthy();
  });

  it('removing, disabling and editing need the password', async () => {
    const { engine } = await ready();
    const a = await addSite(engine, 'instagram.com', 'password-A-123');
    await expect(engine.removeSite(a.id, 'bad-bad-bad')).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    await expect(engine.editSite(a.id, 'bad-bad-bad', { enabled: false })).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    await engine.editSite(a.id, 'password-A-123', { enabled: false });
    expect(engine.blockingSite('https://instagram.com/')).toBeNull(); // disabled
    engine.enableSite(a.id);
    expect(engine.blockingSite('https://instagram.com/')).not.toBeNull(); // enabling needs no password, and starts locked
    await engine.removeSite(a.id, 'password-A-123');
    expect(engine.listSites()).toHaveLength(0);
  });
});

describe('sessions', () => {
  it('starts locked, unlocks one site, relocks manually, and shares across tabs by design', async () => {
    const { engine } = await ready();
    const a = await addSite(engine, 'instagram.com', 'password-A-123');
    await addSite(engine, 'facebook.com', 'password-B-456');
    expect(engine.blockingSite('https://instagram.com/x')).not.toBeNull();
    await engine.unlock(a.id, 'password-A-123');
    // Any tab asking about the same host gets the same answer: the unlock is per website, not per tab.
    expect(engine.blockingSite('https://instagram.com/x')).toBeNull();
    expect(engine.blockingSite('https://www.instagram.com/y')).toBeNull();
    expect(engine.blockingSite('https://facebook.com/')).not.toBeNull();
    engine.lockSite(a.id);
    expect(engine.blockingSite('https://instagram.com/x')).not.toBeNull();
  });

  it('a new engine over the same data starts locked (restart or crash)', async () => {
    const { engine, repo, clock } = await ready();
    const a = await addSite(engine, 'instagram.com', 'password-A-123');
    await engine.unlock(a.id, 'password-A-123');
    expect(engine.blockingSite('https://instagram.com/')).toBeNull();
    const { WebsiteLockEngine } = await import('../../src/main/services/website-lock/engine');
    const afterRestart = new WebsiteLockEngine(repo, () => clock.t);
    expect(afterRestart.blockingSite('https://instagram.com/')).not.toBeNull();
    expect(JSON.stringify([...repo.sites.values()])).not.toMatch(/unlocked/i); // nothing about unlock state is stored
  });

  it('subdomain protection covers subdomains only when asked', async () => {
    const { engine } = await ready();
    await addSite(engine, 'bank.com', 'password-A-123', { includeSubdomains: true });
    await addSite(engine, 'news.com', 'password-B-456');
    expect(engine.blockingSite('https://login.bank.com/')).not.toBeNull();
    expect(engine.blockingSite('https://evilbank.com/')).toBeNull();
    expect(engine.blockingSite('https://login.news.com/')).toBeNull();
    expect(engine.blockingSite('https://news.com/')).not.toBeNull();
  });

  it('only web pages are ever covered', async () => {
    const { engine } = await ready();
    await addSite(engine, 'instagram.com', 'password-A-123');
    for (const u of ['dash://settings', 'about:blank', 'data:text/html,hi', 'file:///x', 'chrome-extension://abc/p.html']) expect(engine.blockingSite(u)).toBeNull();
  });

  it('never shows verifiers to callers', async () => {
    const { engine } = await ready();
    await addSite(engine, 'instagram.com', 'password-A-123');
    const text = JSON.stringify([engine.listSites(), engine.statusForUrl('https://instagram.com/'), engine.blockingSite('https://instagram.com/')]);
    expect(text).not.toMatch(/scrypt|passwordHash|passwordSalt|verifier/i);
  });
});

describe('failed-attempt protection', () => {
  it('locks out after five wrong tries, grows, and survives a new engine', async () => {
    const { engine, repo, clock } = await ready();
    const a = await addSite(engine, 'instagram.com', 'password-A-123');
    for (let i = 0; i < 4; i++) await expect(engine.unlock(a.id, `wrong-guess-${i}`)).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    await expect(engine.unlock(a.id, 'wrong-guess-5')).rejects.toMatchObject({ code: 'WRONG_PASSWORD', retryAfterMs: 30_000 });
    // Even the right password is refused while locked out.
    await expect(engine.unlock(a.id, 'password-A-123')).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    const { WebsiteLockEngine } = await import('../../src/main/services/website-lock/engine');
    const restarted = new WebsiteLockEngine(repo, () => clock.t);
    await expect(restarted.unlock(a.id, 'password-A-123')).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    clock.t += 31_000;
    await expect(engine.unlock(a.id, 'wrong-again')).rejects.toMatchObject({ code: 'WRONG_PASSWORD', retryAfterMs: 60_000 });
    clock.t += 61_000;
    await expect(engine.unlock(a.id, 'password-A-123')).resolves.toBeTruthy();
    // A success clears the counter.
    engine.lockSite(a.id);
    await expect(engine.unlock(a.id, 'wrong-x')).rejects.toMatchObject({ code: 'WRONG_PASSWORD', attemptsLeft: 4 });
  });
});
