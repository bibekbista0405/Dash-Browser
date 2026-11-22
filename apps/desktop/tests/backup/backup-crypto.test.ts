import { describe, expect, it } from 'vitest';
import { decryptBackup, encryptBackup } from '../../src/main/services/backup-crypto';

describe('backup crypto', () => {
  const data = { settings: { theme: 'dark' }, bookmarks: [{ url: 'https://example.com', title: 'é ✓' }] };
  it('round-trips', () => {
    expect(decryptBackup(encryptBackup(data, 'correct horse'), 'correct horse')).toEqual(data);
  });
  it('rejects a wrong passphrase', () => {
    expect(() => decryptBackup(encryptBackup(data, 'correct horse'), 'wrong horse!')).toThrow(/Wrong passphrase/);
  });
  it('rejects a short passphrase and tampering', () => {
    expect(() => encryptBackup(data, 'short')).toThrow();
    const env = JSON.parse(encryptBackup(data, 'correct horse'));
    env.data = Buffer.from('tampered').toString('base64');
    expect(() => decryptBackup(JSON.stringify(env), 'correct horse')).toThrow();
  });
  it('refuses crafted memory-hungry parameters and non-backup files', () => {
    const env = JSON.parse(encryptBackup(data, 'correct horse'));
    env.N = 2 ** 24;
    expect(() => decryptBackup(JSON.stringify(env), 'correct horse')).toThrow(/Unsupported/);
    expect(() => decryptBackup('{"hello":1}', 'correct horse')).toThrow(/not a DASH backup/);
  });
  it('stores nothing readable', () => {
    expect(encryptBackup(data, 'correct horse')).not.toContain('example.com');
  });
});
