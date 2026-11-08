const LOWER = 'abcdefghijkmnpqrstuvwxyz'; // no l, o (look like 1, 0)
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I, O
const DIGITS = '23456789'; // no 0, 1
const SYMBOLS = '!@#$%^&*-_=+?';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 64;
export const PASSWORD_DEFAULT_LENGTH = 20;

/**
 * Strong random password with at least one of each character kind.
 * `randomInt(max)` must return an unbiased integer in [0, max) from a cryptographic source
 * (the caller passes Node's crypto.randomInt); it is injected so this stays free of Node typings and testable.
 */
export function generatePassword(randomInt: (max: number) => number, length: number = PASSWORD_DEFAULT_LENGTH): string {
  const n = Math.min(PASSWORD_MAX_LENGTH, Math.max(PASSWORD_MIN_LENGTH, Math.floor(length)));
  const all = LOWER + UPPER + DIGITS + SYMBOLS;
  const pick = (set: string): string => set[randomInt(set.length)];
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < n) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
