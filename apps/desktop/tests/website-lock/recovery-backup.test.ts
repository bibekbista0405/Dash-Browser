import { describe, expect, it } from 'vitest';
import { RESET_WAIT_MS } from '../../src/main/services/website-lock/engine';
import { decryptBackup } from '../../src/main/services/website-lock/crypto';
import { addSite, makeEngine, ready } from './helpers';

describe('recovery key', () => {
  it('is only saved once the person confirms, and is not stored in plain text', async () => {
    const { engine, repo } = makeEngine();
    const key = engine.beginRecoverySetup();
    expect(key).toMatch(/^([A-Z2-9]{4}-){7}[A-Z2-9]{4}$/);
    expect(engine.isRecoverySet()).toBe(false);
    await engine.confirmRecoverySetup();
    expect(engine.isRecoverySet()).toBe(true);
    expect(JSON.stringify(repo.recovery)).not.toContain(key.replace(/-/g, ''));
    expect(() => engine.beginRecoverySetup()).toThrow();
  });

  it('resets one website password and leaves the others alone', async () => {
    const { engine, key } = await ready();
    const a = await addSite(engine, 'instagram.com', 'password-A-123');
    const b = await addSite(engine, 'facebook.com', 'password-B-456');
    await engine.unlock(a.id, 'password-A-123');
    await expect(engine.recoverSite(a.id, 'AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA', 'brand-new-pass', 'brand-new-pass')).rejects.toMatchObject({ code: 'WRONG_RECOVERY_KEY' });
    // typed in lower case without dashes still works
    await engine.recoverSite(a.id, key.toLowerCase().replace(/-/g, ' '), 'brand-new-pass', 'brand-new-pass');
    expect(engine.blockingSite('https://instagram.com/')).not.toBeNull(); // the old session no longer counts
    await expect(engine.unlock(a.id, 'password-A-123')).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    await expect(engine.unlock(a.id, 'brand-new-pass')).resolves.toBeTruthy();
    await expect(engine.unlock(b.id, 'password-B-456')).resolves.toBeTruthy();
  });

  it('regenerates the key and the old one stops working at once', async () => {
    const { engine, key } = await ready();
    const a = await addSite(engine, 'instagram.com', 'password-A-123');
    const fresh = await engine.regenerateRecoveryKey(key);
    expect(fresh).not.toBe(key);
    await expect(engine.recoverSite(a.id, key, 'brand-new-pass', 'brand-new-pass')).rejects.toMatchObject({ code: 'WRONG_RECOVERY_KEY' });
    await expect(engine.recoverSite(a.id, fresh, 'brand-new-pass', 'brand-new-pass')).resolves.toBeUndefined();
    await expect(engine.regenerateRecoveryKey('AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA')).rejects.toMatchObject({ code: 'WRONG_RECOVERY_KEY' });
  });

  it('rate-limits wrong recovery keys, even for the right one afterwards', async () => {
    const { engine, key, clock } = await ready();
    const a = await addSite(engine, 'instagram.com', 'password-A-123');
    for (let i = 0; i < 5; i++) await expect(engine.recoverSite(a.id, 'BBBB-BBBB-BBBB-BBBB-BBBB-BBBB-BBBB-BBBB', 'brand-new-pass', 'brand-new-pass')).rejects.toBeTruthy();
    await expect(engine.recoverSite(a.id, key, 'brand-new-pass', 'brand-new-pass')).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    clock.t += 31_000;
    await expect(engine.recoverSite(a.id, key, 'brand-new-pass', 'brand-new-pass')).resolves.toBeUndefined();
  });

  it('local administrative reset: needs the countdown, the typed host, and records an event', async () => {
    const { engine, repo, clock } = await ready();
    const a = await addSite(engine, 'instagram.com', 'password-A-123');
    await expect(engine.adminResetSite(a.id, 'instagram.com', 'brand-new-pass', 'brand-new-pass')).rejects.toMatchObject({ code: 'RESET_NOT_ARMED' });
    engine.requestAdminReset(a.id);
    clock.t += 2_000;
    await expect(engine.adminResetSite(a.id, 'instagram.com', 'brand-new-pass', 'brand-new-pass')).rejects.toMatchObject({ code: 'RESET_NOT_ARMED' });
    clock.t += RESET_WAIT_MS;
    await expect(engine.adminResetSite(a.id, 'wrong.com', 'brand-new-pass', 'brand-new-pass')).rejects.toMatchObject({ code: 'RESET_CONFIRMATION' });
    await engine.adminResetSite(a.id, 'instagram.com', 'brand-new-pass', 'brand-new-pass');
    await expect(engine.unlock(a.id, 'password-A-123')).rejects.toMatchObject({ code: 'WRONG_PASSWORD' });
    await expect(engine.unlock(a.id, 'brand-new-pass')).resolves.toBeTruthy();
    expect(repo.events.some((e) => e.type === 'admin_reset_site' && e.hostname === 'instagram.com')).toBe(true);
    // not reusable
    await expect(engine.adminResetSite(a.id, 'instagram.com', 'another-pass-1', 'another-pass-1')).rejects.toMatchObject({ code: 'RESET_NOT_ARMED' });
  });

  it('a lost recovery key can be replaced by the local reset; the old key is dead', async () => {
    const { engine, key, clock } = await ready();
    engine.requestAdminReset('recovery');
    clock.t += RESET_WAIT_MS + 1;
    await expect(engine.adminResetRecovery('nope')).rejects.toMatchObject({ code: 'RESET_CONFIRMATION' });
    const fresh = await engine.adminResetRecovery('reset');
    const a = await addSite(engine, 'instagram.com', 'password-A-123');
    await expect(engine.recoverSite(a.id, key, 'brand-new-pass', 'brand-new-pass')).rejects.toMatchObject({ code: 'WRONG_RECOVERY_KEY' });
    await expect(engine.recoverSite(a.id, fresh, 'brand-new-pass', 'brand-new-pass')).resolves.toBeUndefined();
  });
});

describe('encrypted backup', () => {
  it('exports without passwords, restores into a clean install, and everything starts locked', async () => {
    const src = await ready();
    const a = await addSite(src.engine, 'instagram.com', 'password-A-123', { includeSubdomains: true });
    await src.engine.unlock(a.id, 'password-A-123');
    const file = await src.engine.exportBackup('backup-password-1');
    const text = file.toString('utf8');
    for (const secret of ['password-A-123', 'instagram.com', 'scrypt$', src.key.replace(/-/g, '')]) expect(text).not.toContain(secret); // all encrypted
    expect(JSON.parse(text)).toMatchObject({ format: 'dash-website-lock-backup', version: 1, cipher: 'aes-256-gcm' });

    const dst = makeEngine();
    const preview = await dst.engine.previewBackup(file, 'backup-password-1');
    expect(preview.sites).toEqual([{ hostname: 'instagram.com', displayName: 'instagram.com', exists: false }]);
    expect(dst.engine.listSites()).toHaveLength(0); // nothing changes before the person confirms
    const r = dst.engine.applyBackup(preview.token, false);
    expect(r).toMatchObject({ added: 1, recoveryRestored: true });
    expect(dst.engine.blockingSite('https://login.instagram.com/')).not.toBeNull(); // no session restored
    const restored = dst.engine.listSites()[0];
    await expect(dst.engine.unlock(restored.id, 'password-A-123')).resolves.toBeTruthy(); // the verifier came across
    await expect(dst.engine.recoverSite(restored.id, src.key, 'brand-new-pass', 'brand-new-pass')).resolves.toBeUndefined(); // so did the recovery key
  });

  it('does not overwrite existing websites silently', async () => {
    const src = await ready();
    await addSite(src.engine, 'instagram.com', 'password-A-123');
    const file = await src.engine.exportBackup('backup-password-1');
    const dst = await ready();
    const mine = await addSite(dst.engine, 'instagram.com', 'my-own-password');
    const p1 = await dst.engine.previewBackup(file, 'backup-password-1');
    expect(p1.sites[0].exists).toBe(true);
    expect(dst.engine.applyBackup(p1.token, false)).toMatchObject({ added: 0, skipped: 1 });
    await expect(dst.engine.unlock(mine.id, 'my-own-password')).resolves.toBeTruthy();
    const p2 = await dst.engine.previewBackup(file, 'backup-password-1');
    expect(dst.engine.applyBackup(p2.token, true)).toMatchObject({ replaced: 1 });
    await expect(dst.engine.unlock(mine.id, 'password-A-123')).resolves.toBeTruthy();
  });

  it('rejects a wrong backup password, with rate limiting', async () => {
    const src = await ready();
    await addSite(src.engine, 'instagram.com', 'password-A-123');
    const file = await src.engine.exportBackup('backup-password-1');
    const dst = makeEngine();
    for (let i = 0; i < 5; i++) await expect(dst.engine.previewBackup(file, 'wrong-password-x')).rejects.toMatchObject({ code: 'BACKUP_PASSWORD' });
    await expect(dst.engine.previewBackup(file, 'backup-password-1')).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('rejects corrupted and tampered files', async () => {
    const src = await ready();
    await addSite(src.engine, 'instagram.com', 'password-A-123');
    const file = await src.engine.exportBackup('backup-password-1');
    const dst = makeEngine();
    await expect(dst.engine.previewBackup(Buffer.from('not json at all'), 'backup-password-1')).rejects.toMatchObject({ code: 'BACKUP_INVALID' });
    await expect(dst.engine.previewBackup(Buffer.from('{"format":"other"}'), 'backup-password-1')).rejects.toMatchObject({ code: 'BACKUP_INVALID' });

    const env = JSON.parse(file.toString('utf8'));
    const flip = (b64: string) => { const b = Buffer.from(b64, 'base64'); b[0] ^= 1; return b.toString('base64'); };
    for (const field of ['data', 'tag', 'iv']) {
      const t = { ...env, [field]: flip(env[field]) };
      await expect(decryptBackup(Buffer.from(JSON.stringify(t)), 'backup-password-1')).rejects.toBeTruthy();
    }
    // changing the authenticated header (here: the KDF cost) is also caught
    const t2 = { ...env, kdf: { ...env.kdf, N: 1 << 14 } };
    await expect(decryptBackup(Buffer.from(JSON.stringify(t2)), 'backup-password-1')).rejects.toBeTruthy();
    const t3 = { ...env, version: 2 };
    await expect(decryptBackup(Buffer.from(JSON.stringify(t3)), 'backup-password-1')).rejects.toMatchObject({ code: 'UNSUPPORTED' });
  });

  it('uses a fresh salt and nonce for every export, and a restore token works once', async () => {
    const src = await ready();
    await addSite(src.engine, 'instagram.com', 'password-A-123');
    const f1 = JSON.parse((await src.engine.exportBackup('backup-password-1')).toString());
    const f2 = JSON.parse((await src.engine.exportBackup('backup-password-1')).toString());
    expect(f1.kdf.salt).not.toBe(f2.kdf.salt);
    expect(f1.iv).not.toBe(f2.iv);
    const file = await src.engine.exportBackup('backup-password-1');
    const dst = makeEngine();
    const p = await dst.engine.previewBackup(file, 'backup-password-1');
    dst.engine.applyBackup(p.token, false);
    expect(() => dst.engine.applyBackup(p.token, false)).toThrow();
  });
});
