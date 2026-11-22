/** What is stored. Verifiers stay inside the main process: nothing here is ever sent to a renderer. */
export interface SiteRow {
  id: string;
  hostname: string;
  displayName: string;
  passwordHash: string;
  passwordSalt: string;
  includeSubdomains: boolean;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface RecoveryRow {
  verifier: string;
  salt: string;
  createdAt: number;
  updatedAt: number;
}

export interface AttemptRow {
  fails: number;
  lockedUntil: number;
}

export interface LockRepository {
  listSites(): SiteRow[];
  insertSite(row: SiteRow): void;
  updateSite(row: SiteRow): void;
  deleteSite(id: string): void;
  getRecovery(): RecoveryRow | null;
  setRecovery(row: RecoveryRow): void;
  getAttempts(scope: string): AttemptRow;
  setAttempts(scope: string, row: AttemptRow): void;
  clearAttempts(scope: string): void;
  addEvent(type: string, hostname: string | null, at: number): void;
  listEvents(limit: number): { type: string; hostname: string | null; at: number }[];
}

/** What a renderer may see about a site. No hashes, no salts. */
export interface SiteInfo {
  id: string;
  hostname: string;
  displayName: string;
  includeSubdomains: boolean;
  enabled: boolean;
  /** Unlocked in this DASH session. */
  unlocked: boolean;
  createdAt: number;
}

export interface LockStatus {
  /** The page's host is covered by an enabled protection. */
  protected: boolean;
  unlocked: boolean;
  site: SiteInfo | null;
}

export type LockErrorCode =
  | 'INVALID_URL'
  | 'INVALID_PASSWORD'
  | 'PASSWORD_MISMATCH'
  | 'ALREADY_PROTECTED'
  | 'NOT_FOUND'
  | 'WRONG_PASSWORD'
  | 'WRONG_RECOVERY_KEY'
  | 'RECOVERY_NOT_SET'
  | 'RECOVERY_ALREADY_SET'
  | 'NO_PENDING_RECOVERY'
  | 'RATE_LIMITED'
  | 'RESET_NOT_ARMED'
  | 'RESET_CONFIRMATION'
  | 'BACKUP_INVALID'
  | 'BACKUP_PASSWORD'
  | 'BACKUP_TOKEN';

export class LockError extends Error {
  constructor(
    public code: LockErrorCode,
    message: string,
    public retryAfterMs?: number,
    public attemptsLeft?: number
  ) {
    super(message);
  }
}
