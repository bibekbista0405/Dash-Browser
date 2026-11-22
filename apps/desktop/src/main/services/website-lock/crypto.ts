import { randomBytes, scrypt, timingSafeEqual, createCipheriv, createDecipheriv } from 'node:crypto';

/**
 * All cryptography for Website Lock, from Node's own `crypto` — no third-party code, no network.
 * Passwords and the recovery key are never stored: only salted scrypt verifiers are.
 */

export interface ScryptParams {
  N: number;
  r: number;
  p: number;
}

/** Website passwords: ~16 MB, fast enough for every unlock. */
export const PASSWORD_KDF: ScryptParams = { N: 1 << 14, r: 8, p: 1 };
/** Recovery key and backups are used rarely, so they get a stronger setting (~32 MB). */
export const STRONG_KDF: ScryptParams = { N: 1 << 15, r: 8, p: 1 };

const KEY_LEN = 32;
const SALT_LEN = 16;
const MAX_MEM = 256 * 1024 * 1024;

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

function derive(secret: string, salt: Buffer, params: ScryptParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(secret.normalize('NFKC'), salt, KEY_LEN, { N: params.N, r: params.r, p: params.p, maxmem: MAX_MEM }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

export interface Verifier {
  /** `scrypt$N$r$p$<base64 hash>` */
  hash: string;
  /** base64, unique per secret */
  salt: string;
}

export async function createVerifier(secret: string, params: ScryptParams = PASSWORD_KDF): Promise<Verifier> {
  const salt = randomBytes(SALT_LEN);
  const key = await derive(secret, salt, params);
  return { hash: `scrypt$${params.N}$${params.r}$${params.p}$${key.toString('base64')}`, salt: salt.toString('base64') };
}

function parseHash(hash: string): { params: ScryptParams; key: Buffer } | null {
  const parts = hash.split('$');
  if (parts.length !== 5 || parts[0] !== 'scrypt') return null;
  const [N, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  if (![N, r, p].every((n) => Number.isInteger(n) && n > 0) || N > 1 << 20 || r > 32 || p > 8) return null;
  const key = Buffer.from(parts[4], 'base64');
  return key.length === KEY_LEN ? { params: { N, r, p }, key } : null;
}

/** Timing-safe check of a secret against a stored verifier. */
export async function checkVerifier(secret: string, verifier: Verifier): Promise<boolean> {
  const parsed = parseHash(verifier.hash);
  if (!parsed) return false;
  const salt = Buffer.from(verifier.salt, 'base64');
  if (salt.length < 8) return false;
  const key = await derive(secret, salt, parsed.params);
  return key.length === parsed.key.length && timingSafeEqual(key, parsed.key);
}

export function passwordProblem(password: unknown): string | null {
  if (typeof password !== 'string') return 'Enter a password.';
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password.length > MAX_PASSWORD_LENGTH) return `Use at most ${MAX_PASSWORD_LENGTH} characters.`;
  return null;
}

// ---- Recovery key ----

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 symbols, no 0/O/1/I

/** 160 random bits as 8 groups of 4 symbols: XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX. */
export function generateRecoveryKey(): string {
  const bytes = randomBytes(32);
  let out = '';
  for (let i = 0; i < 32; i++) out += ALPHABET[bytes[i] & 31];
  return out.match(/.{4}/g)!.join('-');
}

/** Accepts the key with or without dashes, spaces and in any case. */
export function normalizeRecoveryKey(input: string): string {
  return (input ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function looksLikeRecoveryKey(input: string): boolean {
  const n = normalizeRecoveryKey(input);
  return n.length === 32 && [...n].every((c) => ALPHABET.includes(c));
}

// ---- Encrypted backup (AES-256-GCM, key from a backup password via scrypt) ----

export const BACKUP_FORMAT = 'dash-website-lock-backup';
export const BACKUP_VERSION = 1;
const MAX_BACKUP_BYTES = 8 * 1024 * 1024;

interface BackupEnvelope {
  format: string;
  version: number;
  kdf: { name: 'scrypt'; N: number; r: number; p: number; salt: string };
  cipher: 'aes-256-gcm';
  iv: string;
  tag: string;
  data: string;
}

/** Everything that identifies the encryption goes into the authenticated header, so changing any of it is detected. */
function aadOf(e: Pick<BackupEnvelope, 'format' | 'version' | 'kdf' | 'cipher' | 'iv'>): Buffer {
  return Buffer.from(JSON.stringify({ format: e.format, version: e.version, kdf: e.kdf, cipher: e.cipher, iv: e.iv }));
}

export async function encryptBackup(plain: Buffer, backupPassword: string): Promise<Buffer> {
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(12);
  const key = await derive(backupPassword, salt, STRONG_KDF);
  const header = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    kdf: { name: 'scrypt' as const, ...STRONG_KDF, salt: salt.toString('base64') },
    cipher: 'aes-256-gcm' as const,
    iv: iv.toString('base64'),
  };
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aadOf(header));
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  const envelope: BackupEnvelope = { ...header, tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
  return Buffer.from(JSON.stringify(envelope, null, 2), 'utf8');
}

export class BackupError extends Error {
  constructor(public code: 'INVALID' | 'UNSUPPORTED' | 'WRONG_PASSWORD_OR_TAMPERED', message: string) {
    super(message);
  }
}

export async function decryptBackup(file: Buffer, backupPassword: string): Promise<Buffer> {
  if (file.length > MAX_BACKUP_BYTES) throw new BackupError('INVALID', 'This is not a DASH Website Lock backup.');
  let env: BackupEnvelope;
  try {
    env = JSON.parse(file.toString('utf8')) as BackupEnvelope;
  } catch {
    throw new BackupError('INVALID', 'This is not a DASH Website Lock backup.');
  }
  if (!env || env.format !== BACKUP_FORMAT || typeof env.version !== 'number') throw new BackupError('INVALID', 'This is not a DASH Website Lock backup.');
  if (env.version !== BACKUP_VERSION) throw new BackupError('UNSUPPORTED', 'This backup was made by a different version of DASH.');
  const k = env.kdf;
  if (!k || k.name !== 'scrypt' || env.cipher !== 'aes-256-gcm' || ![k.N, k.r, k.p].every((n) => Number.isInteger(n) && n > 0) || k.N > 1 << 20 || k.r > 32 || k.p > 8) {
    throw new BackupError('INVALID', 'This backup file is damaged.');
  }
  let salt: Buffer, iv: Buffer, tag: Buffer, data: Buffer;
  try {
    salt = Buffer.from(k.salt, 'base64');
    iv = Buffer.from(env.iv, 'base64');
    tag = Buffer.from(env.tag, 'base64');
    data = Buffer.from(env.data, 'base64');
  } catch {
    throw new BackupError('INVALID', 'This backup file is damaged.');
  }
  if (salt.length < 8 || iv.length !== 12 || tag.length !== 16) throw new BackupError('INVALID', 'This backup file is damaged.');
  const key = await derive(backupPassword, salt, { N: k.N, r: k.r, p: k.p });
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(aadOf(env));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]);
  } catch {
    // GCM cannot tell a wrong password from changed bytes, and neither can we.
    throw new BackupError('WRONG_PASSWORD_OR_TAMPERED', 'Wrong backup password, or the file was changed.');
  }
}
