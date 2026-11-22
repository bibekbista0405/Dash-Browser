import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

/**
 * Passphrase encryption for DASH backup files: scrypt (N=2^15, r=8, p=1) derives a 256-bit key, AES-256-GCM
 * encrypts and authenticates. The file is JSON with base64 fields; nothing about the contents is stored in clear.
 * A wrong passphrase and a tampered file are indistinguishable by design (GCM tag mismatch).
 */
const FORMAT = 'dash-backup';
const VERSION = 1;
const KDF = { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };

export const MIN_PASSPHRASE_LENGTH = 8;

interface Envelope {
  format: string;
  v: number;
  kdf: 'scrypt';
  N: number;
  r: number;
  p: number;
  salt: string;
  iv: string;
  tag: string;
  data: string;
}

export function encryptBackup(plain: unknown, passphrase: string): string {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) throw new Error(`Passphrase must be at least ${MIN_PASSPHRASE_LENGTH} characters`);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(passphrase.normalize('NFKC'), salt, 32, KDF);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(plain), 'utf8'), cipher.final()]);
  const env: Envelope = {
    format: FORMAT,
    v: VERSION,
    kdf: 'scrypt',
    N: KDF.N,
    r: KDF.r,
    p: KDF.p,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
  };
  return JSON.stringify(env);
}

export function decryptBackup(fileText: string, passphrase: string): unknown {
  let env: Envelope;
  try {
    env = JSON.parse(fileText) as Envelope;
  } catch {
    throw new Error('This is not a DASH backup file');
  }
  if (env.format !== FORMAT || env.v !== VERSION || env.kdf !== 'scrypt') throw new Error('This is not a DASH backup file (or it is from a newer DASH)');
  // Only accept the parameters this version writes: a crafted file must not pick a huge N and exhaust memory.
  if (env.N !== KDF.N || env.r !== KDF.r || env.p !== KDF.p) throw new Error('Unsupported backup parameters');
  try {
    const key = scryptSync(passphrase.normalize('NFKC'), Buffer.from(env.salt, 'base64'), 32, KDF);
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(env.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(env.tag, 'base64'));
    const plain = Buffer.concat([decipher.update(Buffer.from(env.data, 'base64')), decipher.final()]);
    return JSON.parse(plain.toString('utf8'));
  } catch {
    throw new Error('Wrong passphrase, or the file is damaged');
  }
}
