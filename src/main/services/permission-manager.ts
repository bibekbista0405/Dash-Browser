import type { Session } from 'electron';
import { randomUUID } from 'node:crypto';
import { getDatabase } from '../db/database';
import type { PermissionName, PermissionDecision } from '../../shared/ipc-channels';

const SUPPORTED_PERMISSIONS: readonly string[] = ['notifications', 'geolocation', 'camera', 'microphone', 'clipboard-read'];

interface PendingPrompt {
  resolve: (decision: PermissionDecision) => void;
}

/**
 * Replaces the old blanket "deny everything" handler with a real per-origin
 * prompt-and-remember flow, the same model every mainstream browser uses.
 * Normal-session decisions persist to SQLite so a site isn't re-prompted
 * every visit. Private-session decisions are deliberately kept in memory
 * only (`persist: false`) and vanish with the window — a private tab
 * granting camera access shouldn't leave a permanent record of that.
 */
export class PermissionManager {
  private pending: Map<string, PendingPrompt> = new Map();
  private inMemoryDecisions: Map<string, PermissionDecision> = new Map();

  constructor(
    session: Session,
    private onPromptNeeded: (requestId: string, origin: string, permission: PermissionName) => void,
    private persist: boolean = true
  ) {
    session.setPermissionRequestHandler((_webContents, permission, callback, details) => {
      if (!SUPPORTED_PERMISSIONS.includes(permission)) {
        callback(false);
        return;
      }
      const typedPermission = permission as PermissionName;

      let origin: string;
      try {
        origin = new URL(details.requestingUrl).origin;
      } catch {
        callback(false);
        return;
      }

      const existing = this.getExisting(origin, typedPermission);
      if (existing) {
        callback(existing === 'granted');
        return;
      }

      const requestId = randomUUID();
      this.pending.set(requestId, {
        resolve: (decision) => {
          this.remember(origin, typedPermission, decision);
          callback(decision === 'granted');
        },
      });
      this.onPromptNeeded(requestId, origin, typedPermission);
    });
  }

  private getExisting(origin: string, permission: PermissionName): PermissionDecision | null {
    if (!this.persist) return this.inMemoryDecisions.get(`${origin}::${permission}`) ?? null;
    return getDatabase().getPermissionDecision(origin, permission);
  }

  private remember(origin: string, permission: PermissionName, decision: PermissionDecision): void {
    if (!this.persist) {
      this.inMemoryDecisions.set(`${origin}::${permission}`, decision);
      return;
    }
    getDatabase().setPermissionDecision(origin, permission, decision);
  }

  respond(requestId: string, decision: PermissionDecision): void {
    const prompt = this.pending.get(requestId);
    if (!prompt) return;
    prompt.resolve(decision);
    this.pending.delete(requestId);
  }
}
